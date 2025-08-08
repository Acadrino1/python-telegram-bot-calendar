const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const WaitlistEntry = require('../models/WaitlistEntry');
const AppointmentHistory = require('../models/AppointmentHistory');
const AvailabilityService = require('./AvailabilityService');
const NotificationService = require('./NotificationService');
const { AppointmentStatus, WaitlistStatus } = require('../types');

class BookingService {
  constructor() {
    this.defaultTimeZone = process.env.DEFAULT_TIMEZONE || 'America/New_York';
  }

  /**
   * Book a new appointment
   * @param {Object} bookingData - Appointment booking data
   * @returns {Object} Booking result
   */
  async bookAppointment(bookingData) {
    const {
      client_id,
      provider_id,
      service_id,
      appointment_datetime,
      notes,
      timezone = this.defaultTimeZone
    } = bookingData;

    try {
      // Validate required data
      if (!client_id || !provider_id || !service_id || !appointment_datetime) {
        throw new Error('Missing required booking information');
      }

      // Get client, provider, and service
      const [client, provider, service] = await Promise.all([
        User.query().findById(client_id),
        User.query().findById(provider_id),
        Service.query().findById(service_id)
      ]);

      if (!client) throw new Error('Client not found');
      if (!provider) throw new Error('Provider not found');
      if (!service) throw new Error('Service not found');
      if (!client.isClient()) throw new Error('User is not a client');
      if (!provider.isProvider()) throw new Error('User is not a provider');
      if (service.provider_id !== provider_id) throw new Error('Service does not belong to provider');

      // Validate appointment time
      const appointmentMoment = moment.tz(appointment_datetime, timezone);
      if (!appointmentMoment.isValid()) {
        throw new Error('Invalid appointment date/time');
      }

      // Check if slot is available
      const availability = await AvailabilityService.isSlotAvailable(
        provider_id,
        appointment_datetime,
        service.duration_minutes
      );

      if (!availability.available) {
        // Try to add to waitlist if service allows it
        if (service.allowsWaitlist()) {
          const waitlistEntry = await this.addToWaitlist({
            client_id,
            provider_id,
            service_id,
            preferred_date: appointmentMoment.format('YYYY-MM-DD'),
            preferred_start_time: appointmentMoment.format('HH:mm:ss'),
            preferred_end_time: appointmentMoment.clone().add(service.duration_minutes, 'minutes').format('HH:mm:ss'),
            notes
          });

          return {
            success: false,
            reason: 'slot_unavailable',
            message: availability.reason,
            waitlist_added: true,
            waitlist_entry: waitlistEntry
          };
        } else {
          return {
            success: false,
            reason: 'slot_unavailable',
            message: availability.reason,
            waitlist_added: false
          };
        }
      }

      // Create appointment
      const appointmentData = {
        uuid: uuidv4(),
        client_id,
        provider_id,
        service_id,
        appointment_datetime: appointmentMoment.format('YYYY-MM-DD HH:mm:ss'),
        duration_minutes: service.duration_minutes,
        status: service.requiresConfirmation() ? AppointmentStatus.SCHEDULED : AppointmentStatus.CONFIRMED,
        notes: notes || null,
        price: service.price
      };

      const appointment = await Appointment.query().insert(appointmentData);

      // Create appointment history entry
      await AppointmentHistory.query().insert({
        appointment_id: appointment.id,
        action: 'created',
        changes: JSON.stringify({
          status: appointment.status,
          appointment_datetime: appointment.appointment_datetime
        }),
        changed_by: client_id,
        notes: 'Appointment booked'
      });

      // Load full appointment with relations
      const fullAppointment = await Appointment.query()
        .findById(appointment.id)
        .withGraphFetched('[client, provider, service]');

      // Send confirmation notification
      try {
        await NotificationService.sendAppointmentConfirmation(fullAppointment);
      } catch (notificationError) {
        console.error('Failed to send booking confirmation:', notificationError);
        // Don't fail the booking if notification fails
      }

      // Schedule reminder notifications
      try {
        await this.scheduleReminders(fullAppointment);
      } catch (reminderError) {
        console.error('Failed to schedule reminders:', reminderError);
      }

      return {
        success: true,
        appointment: fullAppointment,
        message: 'Appointment booked successfully'
      };

    } catch (error) {
      console.error('Error booking appointment:', error);
      throw error;
    }
  }

  /**
   * Cancel an appointment
   * @param {string} appointmentUuid - Appointment UUID
   * @param {number} cancelledBy - User ID who cancelled
   * @param {string} reason - Cancellation reason
   * @returns {Object} Cancellation result
   */
  async cancelAppointment(appointmentUuid, cancelledBy, reason = null) {
    try {
      const appointment = await Appointment.query()
        .findOne({ uuid: appointmentUuid })
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      if (!appointment.isActive()) {
        throw new Error('Cannot cancel this appointment');
      }

      // Check cancellation policy
      const service = appointment.service;
      const cancellationHours = service.getCancellationHours();
      
      if (!appointment.canBeCancelled(cancellationHours)) {
        throw new Error(`Cannot cancel appointment less than ${cancellationHours} hours in advance`);
      }

      // Cancel the appointment
      await appointment.cancel(cancelledBy, reason);

      // Create history entry
      await AppointmentHistory.query().insert({
        appointment_id: appointment.id,
        action: 'cancelled',
        changes: JSON.stringify({
          old_status: AppointmentStatus.SCHEDULED,
          new_status: AppointmentStatus.CANCELLED,
          cancelled_by: cancelledBy,
          cancellation_reason: reason
        }),
        changed_by: cancelledBy,
        notes: `Appointment cancelled: ${reason || 'No reason provided'}`
      });

      // Send cancellation notification
      try {
        await NotificationService.sendAppointmentCancellation(appointment, reason);
      } catch (notificationError) {
        console.error('Failed to send cancellation notification:', notificationError);
      }

      // Process waitlist
      try {
        await this.processWaitlistForCancellation(appointment);
      } catch (waitlistError) {
        console.error('Failed to process waitlist:', waitlistError);
      }

      // Cancel any pending reminders
      try {
        await NotificationService.cancelAppointmentNotifications(appointment.id);
      } catch (reminderError) {
        console.error('Failed to cancel reminder notifications:', reminderError);
      }

      return {
        success: true,
        appointment,
        message: 'Appointment cancelled successfully'
      };

    } catch (error) {
      console.error('Error cancelling appointment:', error);
      throw error;
    }
  }

  /**
   * Reschedule an appointment
   * @param {string} appointmentUuid - Appointment UUID
   * @param {string} newDateTime - New appointment date/time
   * @param {number} rescheduledBy - User ID who rescheduled
   * @param {string} timezone - Timezone
   * @returns {Object} Reschedule result
   */
  async rescheduleAppointment(appointmentUuid, newDateTime, rescheduledBy, timezone = this.defaultTimeZone) {
    try {
      const appointment = await Appointment.query()
        .findOne({ uuid: appointmentUuid })
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      if (!appointment.isActive()) {
        throw new Error('Cannot reschedule this appointment');
      }

      // Check rescheduling policy
      const service = appointment.service;
      const rescheduleHours = service.getCancellationHours(); // Use same policy as cancellation
      
      if (!appointment.canBeRescheduled(rescheduleHours)) {
        throw new Error(`Cannot reschedule appointment less than ${rescheduleHours} hours in advance`);
      }

      // Validate new appointment time
      const newAppointmentMoment = moment.tz(newDateTime, timezone);
      if (!newAppointmentMoment.isValid()) {
        throw new Error('Invalid new appointment date/time');
      }

      // Check if new slot is available
      const availability = await AvailabilityService.isSlotAvailable(
        appointment.provider_id,
        newDateTime,
        service.duration_minutes,
        appointment.id // Exclude current appointment
      );

      if (!availability.available) {
        return {
          success: false,
          reason: 'new_slot_unavailable',
          message: availability.reason
        };
      }

      // Store old values for history
      const oldDateTime = appointment.appointment_datetime;

      // Update appointment
      await appointment.$query().patch({
        appointment_datetime: newAppointmentMoment.format('YYYY-MM-DD HH:mm:ss'),
        status: service.requiresConfirmation() ? AppointmentStatus.SCHEDULED : AppointmentStatus.CONFIRMED
      });

      // Update the appointment object
      appointment.appointment_datetime = newAppointmentMoment.format('YYYY-MM-DD HH:mm:ss');

      // Create history entry
      await AppointmentHistory.query().insert({
        appointment_id: appointment.id,
        action: 'rescheduled',
        changes: JSON.stringify({
          old_appointment_datetime: oldDateTime,
          new_appointment_datetime: appointment.appointment_datetime,
          rescheduled_by: rescheduledBy
        }),
        changed_by: rescheduledBy,
        notes: 'Appointment rescheduled'
      });

      // Send reschedule notification
      try {
        await NotificationService.sendAppointmentReschedule(appointment, oldDateTime);
      } catch (notificationError) {
        console.error('Failed to send reschedule notification:', notificationError);
      }

      // Cancel old reminders and schedule new ones
      try {
        await NotificationService.cancelAppointmentNotifications(appointment.id);
        await this.scheduleReminders(appointment);
      } catch (reminderError) {
        console.error('Failed to update reminder notifications:', reminderError);
      }

      return {
        success: true,
        appointment,
        old_datetime: oldDateTime,
        message: 'Appointment rescheduled successfully'
      };

    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      throw error;
    }
  }

  /**
   * Confirm an appointment
   * @param {string} appointmentUuid - Appointment UUID
   * @param {number} confirmedBy - User ID who confirmed
   * @returns {Object} Confirmation result
   */
  async confirmAppointment(appointmentUuid, confirmedBy) {
    try {
      const appointment = await Appointment.query()
        .findOne({ uuid: appointmentUuid })
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      if (!appointment.isScheduled()) {
        throw new Error('Appointment is not in scheduled status');
      }

      await appointment.confirm();

      // Create history entry
      await AppointmentHistory.query().insert({
        appointment_id: appointment.id,
        action: 'confirmed',
        changes: JSON.stringify({
          old_status: AppointmentStatus.SCHEDULED,
          new_status: AppointmentStatus.CONFIRMED,
          confirmed_by: confirmedBy
        }),
        changed_by: confirmedBy,
        notes: 'Appointment confirmed'
      });

      return {
        success: true,
        appointment,
        message: 'Appointment confirmed successfully'
      };

    } catch (error) {
      console.error('Error confirming appointment:', error);
      throw error;
    }
  }

  /**
   * Complete an appointment
   * @param {string} appointmentUuid - Appointment UUID
   * @param {number} completedBy - User ID who marked as complete
   * @param {string} providerNotes - Provider's notes
   * @returns {Object} Completion result
   */
  async completeAppointment(appointmentUuid, completedBy, providerNotes = null) {
    try {
      const appointment = await Appointment.query()
        .findOne({ uuid: appointmentUuid })
        .withGraphFetched('[client, provider, service]');

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      if (!appointment.isActive()) {
        throw new Error('Cannot complete this appointment');
      }

      const oldStatus = appointment.status;
      await appointment.complete(providerNotes);

      // Create history entry
      await AppointmentHistory.query().insert({
        appointment_id: appointment.id,
        action: 'completed',
        changes: JSON.stringify({
          old_status: oldStatus,
          new_status: AppointmentStatus.COMPLETED,
          completed_by: completedBy,
          provider_notes: providerNotes
        }),
        changed_by: completedBy,
        notes: 'Appointment completed'
      });

      return {
        success: true,
        appointment,
        message: 'Appointment completed successfully'
      };

    } catch (error) {
      console.error('Error completing appointment:', error);
      throw error;
    }
  }

  /**
   * Add client to waitlist
   * @param {Object} waitlistData - Waitlist entry data
   * @returns {Object} Waitlist entry
   */
  async addToWaitlist(waitlistData) {
    const {
      client_id,
      provider_id,
      service_id,
      preferred_date,
      preferred_start_time,
      preferred_end_time,
      notes
    } = waitlistData;

    try {
      // Check if client is already on waitlist for this date/service
      const existingEntry = await WaitlistEntry.query()
        .where('client_id', client_id)
        .where('provider_id', provider_id)
        .where('service_id', service_id)
        .where('preferred_date', preferred_date)
        .where('status', WaitlistStatus.ACTIVE)
        .first();

      if (existingEntry) {
        throw new Error('Client is already on waitlist for this service on this date');
      }

      // Create waitlist entry (expires in 7 days by default)
      const expiresAt = moment().add(7, 'days').format('YYYY-MM-DD HH:mm:ss');

      const waitlistEntry = await WaitlistEntry.query().insert({
        client_id,
        provider_id,
        service_id,
        preferred_date,
        preferred_start_time,
        preferred_end_time,
        status: WaitlistStatus.ACTIVE,
        notes,
        expires_at: expiresAt
      });

      return waitlistEntry;

    } catch (error) {
      console.error('Error adding to waitlist:', error);
      throw error;
    }
  }

  /**
   * Process waitlist when an appointment is cancelled
   * @param {Object} cancelledAppointment - Cancelled appointment
   */
  async processWaitlistForCancellation(cancelledAppointment) {
    try {
      const appointmentDate = moment(cancelledAppointment.appointment_datetime).format('YYYY-MM-DD');

      // Find active waitlist entries for this provider, service, and date
      const waitlistEntries = await WaitlistEntry.query()
        .where('provider_id', cancelledAppointment.provider_id)
        .where('service_id', cancelledAppointment.service_id)
        .where('preferred_date', appointmentDate)
        .where('status', WaitlistStatus.ACTIVE)
        .withGraphFetched('[client, service]')
        .orderBy('created_at'); // First come, first served

      if (waitlistEntries.length === 0) {
        return;
      }

      // Check if the cancelled slot matches any waitlist preferences
      const cancelledStartTime = moment(cancelledAppointment.appointment_datetime).format('HH:mm:ss');
      const cancelledEndTime = moment(cancelledAppointment.appointment_datetime)
        .add(cancelledAppointment.duration_minutes, 'minutes')
        .format('HH:mm:ss');

      for (const entry of waitlistEntries) {
        // Check if this waitlist entry matches the available time
        if (this.waitlistEntryMatches(entry, cancelledStartTime, cancelledEndTime)) {
          // Notify client about availability
          try {
            await NotificationService.sendWaitlistNotification(entry, {
              available_datetime: cancelledAppointment.appointment_datetime,
              duration_minutes: cancelledAppointment.duration_minutes
            });

            // Update waitlist entry status
            await entry.$query().patch({
              status: WaitlistStatus.NOTIFIED,
              notified_at: moment().format('YYYY-MM-DD HH:mm:ss')
            });

            // Only notify the first matching entry
            break;

          } catch (notificationError) {
            console.error('Failed to send waitlist notification:', notificationError);
          }
        }
      }

    } catch (error) {
      console.error('Error processing waitlist:', error);
    }
  }

  /**
   * Check if waitlist entry matches available time slot
   */
  waitlistEntryMatches(waitlistEntry, availableStartTime, availableEndTime) {
    // If no time preference specified, any time is okay
    if (!waitlistEntry.preferred_start_time && !waitlistEntry.preferred_end_time) {
      return true;
    }

    // If only start time specified
    if (waitlistEntry.preferred_start_time && !waitlistEntry.preferred_end_time) {
      return availableStartTime >= waitlistEntry.preferred_start_time;
    }

    // If only end time specified
    if (!waitlistEntry.preferred_start_time && waitlistEntry.preferred_end_time) {
      return availableEndTime <= waitlistEntry.preferred_end_time;
    }

    // If both times specified
    return availableStartTime >= waitlistEntry.preferred_start_time && 
           availableEndTime <= waitlistEntry.preferred_end_time;
  }

  /**
   * Schedule reminder notifications for an appointment
   * @param {Object} appointment - Appointment object
   */
  async scheduleReminders(appointment) {
    const reminderHours = [24, 2]; // 24 hours and 2 hours before

    for (const hours of reminderHours) {
      const appointmentTime = moment(appointment.appointment_datetime);
      const reminderTime = appointmentTime.clone().subtract(hours, 'hours');

      // Only schedule if reminder time is in the future
      if (reminderTime.isAfter(moment())) {
        await NotificationService.scheduleReminder(appointment, hours, reminderTime.toDate());
      }
    }
  }

  /**
   * Get booking statistics for a provider
   * @param {number} providerId - Provider ID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Object} Booking statistics
   */
  async getBookingStatistics(providerId, startDate, endDate) {
    try {
      const appointments = await Appointment.query()
        .where('provider_id', providerId)
        .where('appointment_datetime', '>=', startDate)
        .where('appointment_datetime', '<=', endDate)
        .withGraphFetched('[client, service]');

      const stats = {
        total_appointments: appointments.length,
        by_status: {
          scheduled: appointments.filter(a => a.status === AppointmentStatus.SCHEDULED).length,
          confirmed: appointments.filter(a => a.status === AppointmentStatus.CONFIRMED).length,
          completed: appointments.filter(a => a.status === AppointmentStatus.COMPLETED).length,
          cancelled: appointments.filter(a => a.status === AppointmentStatus.CANCELLED).length,
          no_show: appointments.filter(a => a.status === AppointmentStatus.NO_SHOW).length
        },
        total_revenue: 0,
        by_service: {},
        cancellation_rate: 0,
        no_show_rate: 0,
        completion_rate: 0
      };

      // Calculate revenue and service breakdown
      appointments.forEach(appointment => {
        if (appointment.price) {
          stats.total_revenue += parseFloat(appointment.price);
        }

        const serviceName = appointment.service.name;
        if (!stats.by_service[serviceName]) {
          stats.by_service[serviceName] = {
            count: 0,
            revenue: 0,
            completed: 0,
            cancelled: 0
          };
        }

        stats.by_service[serviceName].count++;
        if (appointment.price) {
          stats.by_service[serviceName].revenue += parseFloat(appointment.price);
        }
        if (appointment.status === AppointmentStatus.COMPLETED) {
          stats.by_service[serviceName].completed++;
        }
        if (appointment.status === AppointmentStatus.CANCELLED) {
          stats.by_service[serviceName].cancelled++;
        }
      });

      // Calculate rates
      if (stats.total_appointments > 0) {
        stats.cancellation_rate = Math.round((stats.by_status.cancelled / stats.total_appointments) * 100);
        stats.no_show_rate = Math.round((stats.by_status.no_show / stats.total_appointments) * 100);
        stats.completion_rate = Math.round((stats.by_status.completed / stats.total_appointments) * 100);
      }

      return stats;

    } catch (error) {
      console.error('Error getting booking statistics:', error);
      throw error;
    }
  }
}

module.exports = new BookingService();