const { Model, transaction } = require('objection');
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Service = require('../models/Service');
const WaitlistEntry = require('../models/WaitlistEntry');
const NotificationService = require('./NotificationService');
const AppointmentHistory = require('../models/AppointmentHistory');

class BookingService {
  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Book a new appointment with proper transaction handling
   * SECURITY: Supports idempotency keys to prevent duplicate bookings
   */
  async bookAppointment(bookingData, idempotencyKey = null) {
    const knex = Model.knex();

    // SECURITY: Check idempotency key for duplicate request prevention
    if (idempotencyKey) {
      const existing = await knex('booking_idempotency')
        .where('idempotency_key', idempotencyKey)
        .where('expires_at', '>', knex.fn.now())
        .first();

      if (existing) {
        // Return cached response
        return {
          cached: true,
          appointment: existing.appointment_id ? await Appointment.query().findById(existing.appointment_id) : null,
          statusCode: existing.status_code
        };
      }
    }

    const trx = await transaction.start(knex);

    try {
      const {
        client_id,
        provider_id,
        service_id,
        appointment_datetime,
        notes,
        timezone = 'America/New_York'
      } = bookingData;

      // Validate required fields
      if (!client_id || !provider_id || !service_id || !appointment_datetime) {
        throw new Error('Missing required booking fields');
      }

      // Validate business hours
      const BookingSlotService = require('./BookingSlotService');
      const slotService = new BookingSlotService();
      const appointmentMoment = moment.tz(appointment_datetime, timezone);
      const date = appointmentMoment.format('YYYY-MM-DD');
      const time = appointmentMoment.format('HH:mm');

      const validation = slotService.isValidBusinessHourSlot(date, time);
      if (!validation.valid) {
        logger.warn('Booking rejected - outside business hours', { date, time, reason: validation.reason });
        throw new Error(`Booking rejected: ${validation.reason}`);
      }

      // Check if slot is available with pessimistic lock to prevent race condition
      const existingAppointment = await Appointment.query(trx)
        .where('appointment_datetime', appointment_datetime)
        .where('provider_id', provider_id)
        .whereIn('status', ['scheduled', 'confirmed', 'in_progress'])
        .forUpdate() // SECURITY: Lock row to prevent double-booking
        .first();

      if (existingAppointment) {
        await trx.rollback();
        
        // Try to add to waitlist
        const waitlistResult = await this.addToWaitlist({
          client_id,
          service_id,
          preferred_datetime: appointment_datetime,
          notes
        });

        return {
          success: false,
          reason: 'slot_unavailable',
          message: 'The selected time slot is no longer available',
          waitlist_added: waitlistResult.success,
          waitlist_entry: waitlistResult.entry
        };
      }

      // Get service details for duration
      const service = await Service.query(trx).findById(service_id);
      if (!service) {
        await trx.rollback();
        throw new Error('Service not found');
      }

      // Create appointment
      const appointmentData = {
        uuid: uuidv4(),
        client_id,
        provider_id,
        service_id,
        appointment_datetime: moment.tz(appointment_datetime, timezone).utc().format(),
        duration_minutes: service.duration_minutes || 60,
        status: 'scheduled',
        notes: notes || null,
        price: service.price || 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      const appointment = await Appointment.query(trx).insert(appointmentData);

      // Create appointment history
      await AppointmentHistory.query(trx).insert({
        appointment_id: appointment.id,
        action: 'created',
        changes: {
          datetime: appointment_datetime,
          service: service.name,
          status: 'scheduled'
        },
        changed_by: client_id,
        notes: `Appointment created via booking service`
      });

      await trx.commit();

      // Load full appointment with relations
      const fullAppointment = await Appointment.query()
        .findById(appointment.id)
        .withGraphFetched('[client, provider, service]');

      // Send notifications (async, don't block response)
      this.sendBookingNotifications(fullAppointment).catch(error => {
        logger.error('Failed to send booking notifications:', error);
      });

      logger.info('Appointment booked successfully', {
        appointmentId: appointment.id,
        clientId: client_id,
        providerId: provider_id,
        datetime: appointment_datetime
      });

      const result = {
        success: true,
        message: 'Appointment booked successfully',
        appointment: fullAppointment
      };

      // SECURITY: Store idempotency result (prevent duplicate bookings on retry)
      if (idempotencyKey) {
        const expiresAt = moment().add(24, 'hours').toDate();
        await knex('booking_idempotency').insert({
          idempotency_key: idempotencyKey,
          appointment_id: appointment.id,
          response_body: JSON.stringify(result),
          status_code: 200,
          expires_at: expiresAt
        }).onConflict('idempotency_key').ignore();
      }

      return result;

    } catch (error) {
      await trx.rollback();

      // SECURITY: Store failed idempotency result
      if (idempotencyKey) {
        const expiresAt = moment().add(24, 'hours').toDate();
        await knex('booking_idempotency').insert({
          idempotency_key: idempotencyKey,
          appointment_id: null,
          response_body: JSON.stringify({ error: error.message }),
          status_code: 400,
          expires_at: expiresAt
        }).onConflict('idempotency_key').ignore();
      }

      logger.error('Error booking appointment:', error);
      throw error;
    }
  }

  /**
   * Cancel an appointment with proper transaction handling
   */
  async cancelAppointment(appointmentUuid, cancelledBy, reason) {
    const trx = await transaction.start(Model.knex());

    try {
      const appointment = await Appointment.query(trx)
        .findOne('uuid', appointmentUuid)
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        await trx.rollback();
        throw new Error('Appointment not found');
      }

      if (appointment.status === 'cancelled') {
        await trx.rollback();
        return {
          success: false,
          message: 'Appointment is already cancelled'
        };
      }

      // Update appointment status
      const updatedAppointment = await appointment
        .$query(trx)
        .patchAndFetch({
          status: 'cancelled',
          cancelled_at: new Date(),
          cancelled_by: cancelledBy,
          cancellation_reason: reason || 'No reason provided',
          updated_at: new Date()
        });

      // Create history record
      await AppointmentHistory.query(trx).insert({
        appointment_id: appointment.id,
        action: 'cancelled',
        changes: {
          previous_status: appointment.status,
          new_status: 'cancelled',
          reason: reason || 'No reason provided'
        },
        changed_by: cancelledBy,
        notes: `Appointment cancelled: ${reason || 'No reason provided'}`
      });

      await trx.commit();

      // Process waitlist (async)
      this.processWaitlistForSlot(appointment.appointment_datetime, appointment.service_id)
        .catch(error => logger.error('Error processing waitlist:', error));

      // Send notifications (async)
      this.sendCancellationNotifications(updatedAppointment, reason)
        .catch(error => logger.error('Failed to send cancellation notifications:', error));

      logger.info('Appointment cancelled successfully', {
        appointmentId: appointment.id,
        cancelledBy,
        reason
      });

      return {
        success: true,
        message: 'Appointment cancelled successfully',
        appointment: updatedAppointment
      };

    } catch (error) {
      await trx.rollback();
      logger.error('Error cancelling appointment:', error);
      throw error;
    }
  }

  /**
   * Reschedule an appointment with proper transaction handling
   */
  async rescheduleAppointment(appointmentUuid, newDateTime, rescheduledBy, timezone = 'America/New_York') {
    const trx = await transaction.start(Model.knex());

    try {
      const appointment = await Appointment.query(trx)
        .findOne('uuid', appointmentUuid)
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        await trx.rollback();
        throw new Error('Appointment not found');
      }

      const oldDateTime = appointment.appointment_datetime;
      const newDateTimeUTC = moment.tz(newDateTime, timezone).utc().format();

      // Check if new slot is available
      const conflictingAppointment = await Appointment.query(trx)
        .where('appointment_datetime', newDateTimeUTC)
        .where('provider_id', appointment.provider_id)
        .whereIn('status', ['scheduled', 'confirmed', 'in_progress'])
        .whereNot('id', appointment.id)
        .first();

      if (conflictingAppointment) {
        await trx.rollback();
        return {
          success: false,
          reason: 'slot_unavailable',
          message: 'The new time slot is not available'
        };
      }

      // Update appointment
      const updatedAppointment = await appointment
        .$query(trx)
        .patchAndFetch({
          appointment_datetime: newDateTimeUTC,
          updated_at: new Date()
        });

      // Create history record
      await AppointmentHistory.query(trx).insert({
        appointment_id: appointment.id,
        action: 'rescheduled',
        changes: {
          old_datetime: oldDateTime,
          new_datetime: newDateTimeUTC,
          status: appointment.status
        },
        changed_by: rescheduledBy,
        notes: `Appointment rescheduled from ${oldDateTime} to ${newDateTimeUTC}`
      });

      await trx.commit();

      // Process waitlist for old slot (async)
      this.processWaitlistForSlot(oldDateTime, appointment.service_id)
        .catch(error => logger.error('Error processing waitlist:', error));

      // Send notifications (async)
      this.sendRescheduleNotifications(updatedAppointment, oldDateTime)
        .catch(error => logger.error('Failed to send reschedule notifications:', error));

      logger.info('Appointment rescheduled successfully', {
        appointmentId: appointment.id,
        oldDateTime,
        newDateTime: newDateTimeUTC,
        rescheduledBy
      });

      return {
        success: true,
        message: 'Appointment rescheduled successfully',
        appointment: updatedAppointment,
        old_datetime: oldDateTime
      };

    } catch (error) {
      await trx.rollback();
      logger.error('Error rescheduling appointment:', error);
      throw error;
    }
  }

  /**
   * Confirm an appointment
   */
  async confirmAppointment(appointmentUuid, confirmedBy) {
    const trx = await transaction.start(Model.knex());

    try {
      const appointment = await Appointment.query(trx)
        .findOne('uuid', appointmentUuid)
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        await trx.rollback();
        throw new Error('Appointment not found');
      }

      if (appointment.status !== 'scheduled') {
        await trx.rollback();
        return {
          success: false,
          message: `Cannot confirm appointment with status: ${appointment.status}`
        };
      }

      const updatedAppointment = await appointment
        .$query(trx)
        .patchAndFetch({
          status: 'confirmed',
          confirmed_at: new Date(),
          updated_at: new Date()
        });

      // Create history record
      await AppointmentHistory.query(trx).insert({
        appointment_id: appointment.id,
        action: 'confirmed',
        changes: {
          previous_status: 'scheduled',
          new_status: 'confirmed'
        },
        changed_by: confirmedBy,
        notes: `Appointment confirmed`
      });

      await trx.commit();

      logger.info('Appointment confirmed successfully', {
        appointmentId: appointment.id,
        confirmedBy
      });

      return {
        success: true,
        message: 'Appointment confirmed successfully',
        appointment: updatedAppointment
      };

    } catch (error) {
      await trx.rollback();
      logger.error('Error confirming appointment:', error);
      throw error;
    }
  }

  /**
   * Complete an appointment
   */
  async completeAppointment(appointmentUuid, completedBy, providerNotes) {
    const trx = await transaction.start(Model.knex());

    try {
      const appointment = await Appointment.query(trx)
        .findOne('uuid', appointmentUuid)
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        await trx.rollback();
        throw new Error('Appointment not found');
      }

      if (!['confirmed', 'in_progress'].includes(appointment.status)) {
        await trx.rollback();
        return {
          success: false,
          message: `Cannot complete appointment with status: ${appointment.status}`
        };
      }

      const updatedAppointment = await appointment
        .$query(trx)
        .patchAndFetch({
          status: 'completed',
          completed_at: new Date(),
          provider_notes: providerNotes || appointment.provider_notes,
          updated_at: new Date()
        });

      // Create history record
      await AppointmentHistory.query(trx).insert({
        appointment_id: appointment.id,
        action: 'completed',
        changes: {
          previous_status: appointment.status,
          new_status: 'completed',
          provider_notes: providerNotes ? 'added' : 'none'
        },
        changed_by: completedBy,
        notes: `Appointment completed${providerNotes ? ' with notes' : ''}`
      });

      await trx.commit();

      logger.info('Appointment completed successfully', {
        appointmentId: appointment.id,
        completedBy
      });

      return {
        success: true,
        message: 'Appointment completed successfully',
        appointment: updatedAppointment
      };

    } catch (error) {
      await trx.rollback();
      logger.error('Error completing appointment:', error);
      throw error;
    }
  }

  /**
   * Add client to waitlist with transaction handling
   */
  async addToWaitlist(waitlistData) {
    const trx = await transaction.start(Model.knex());

    try {
      const {
        client_id,
        service_id,
        preferred_datetime,
        notes
      } = waitlistData;

      // Check if already on waitlist for this slot
      const existing = await WaitlistEntry.query(trx)
        .where('client_id', client_id)
        .where('service_id', service_id)
        .where('preferred_datetime', preferred_datetime)
        .where('status', 'waiting')
        .first();

      if (existing) {
        await trx.rollback();
        return {
          success: false,
          message: 'Already on waitlist for this time slot'
        };
      }

      const entry = await WaitlistEntry.query(trx).insert({
        client_id,
        service_id,
        preferred_datetime,
        notes,
        status: 'waiting',
        created_at: new Date(),
        updated_at: new Date()
      });

      await trx.commit();

      logger.info('Client added to waitlist', {
        entryId: entry.id,
        clientId: client_id,
        serviceId: service_id,
        datetime: preferred_datetime
      });

      return {
        success: true,
        message: 'Added to waitlist successfully',
        entry
      };

    } catch (error) {
      await trx.rollback();
      logger.error('Error adding to waitlist:', error);
      throw error;
    }
  }

  /**
   * Process waitlist for a newly available slot
   */
  async processWaitlistForSlot(dateTime, serviceId) {
    try {
      const waitlistEntries = await WaitlistEntry.query()
        .where('service_id', serviceId)
        .where('preferred_datetime', dateTime)
        .where('status', 'waiting')
        .withGraphFetched('[client, service]')
        .orderBy('created_at', 'asc');

      for (const entry of waitlistEntries) {
        try {
          // Send notification about available slot
          await this.notificationService.sendWaitlistNotification(entry, {
            available_datetime: dateTime,
            duration_minutes: entry.service?.duration_minutes || 60
          });

          logger.info('Waitlist notification sent', {
            entryId: entry.id,
            clientId: entry.client_id,
            datetime: dateTime
          });
        } catch (notificationError) {
          logger.error('Failed to send waitlist notification:', notificationError);
        }
      }
    } catch (error) {
      logger.error('Error processing waitlist:', error);
    }
  }

  /**
   * Send booking notifications
   */
  async sendBookingNotifications(appointment) {
    try {
      await this.notificationService.sendAppointmentConfirmation(appointment);
      logger.info('Booking notifications sent', { appointmentId: appointment.id });
    } catch (error) {
      logger.error('Failed to send booking notifications:', error);
      // Don't throw - notifications are non-critical
    }
  }

  /**
   * Send cancellation notifications
   */
  async sendCancellationNotifications(appointment, reason) {
    try {
      await this.notificationService.sendAppointmentCancellation(appointment, reason);
      logger.info('Cancellation notifications sent', { appointmentId: appointment.id });
    } catch (error) {
      logger.error('Failed to send cancellation notifications:', error);
      // Don't throw - notifications are non-critical
    }
  }

  /**
   * Send reschedule notifications
   */
  async sendRescheduleNotifications(appointment, oldDateTime) {
    try {
      await this.notificationService.sendAppointmentReschedule(appointment, oldDateTime);
      logger.info('Reschedule notifications sent', { appointmentId: appointment.id });
    } catch (error) {
      logger.error('Failed to send reschedule notifications:', error);
      // Don't throw - notifications are non-critical
    }
  }
}

module.exports = BookingService;