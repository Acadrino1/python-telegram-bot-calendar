const moment = require('moment-timezone');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const { AppointmentStatus, DayOfWeek } = require('../types');

class AvailabilityService {
  constructor() {
    this.defaultTimeZone = process.env.DEFAULT_TIMEZONE || 'America/New_York';
  }

  /**
   * Get available time slots for a provider on a specific date
   * @param {number} providerId - Provider ID
   * @param {string} serviceId - Service ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} timezone - Timezone to use
   * @returns {Array} Array of available time slots
   */
  async getAvailableSlots(providerId, serviceId, date, timezone = this.defaultTimeZone) {
    try {
      // Get provider and service
      const provider = await User.query().findById(providerId);
      const service = await Service.query().findById(serviceId);
      
      if (!provider || !service) {
        throw new Error('Provider or service not found');
      }

      if (service.provider_id !== providerId) {
        throw new Error('Service does not belong to this provider');
      }

      // Check if the requested date is valid for booking
      const bookingValidation = this.validateBookingDate(date, service, timezone);
      if (!bookingValidation.valid) {
        return { available: false, reason: bookingValidation.reason, slots: [] };
      }

      // Get provider's regular schedule for the day
      const dayOfWeek = moment.tz(date, timezone).format('dddd').toLowerCase();
      const regularSchedule = await this.getRegularSchedule(providerId, dayOfWeek);
      
      if (!regularSchedule.length) {
        return { available: false, reason: 'Provider not available on this day', slots: [] };
      }

      // Get any availability exceptions for this date
      const exceptions = await this.getAvailabilityExceptions(providerId, date);
      
      // Check if provider is unavailable all day
      const unavailableAllDay = exceptions.find(ex => 
        ex.type === 'unavailable' && !ex.start_time && !ex.end_time
      );
      
      if (unavailableAllDay) {
        return { 
          available: false, 
          reason: unavailableAllDay.reason || 'Provider unavailable', 
          slots: [] 
        };
      }

      // Get existing appointments for the date
      const startOfDay = moment.tz(date, timezone).startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const endOfDay = moment.tz(date, timezone).endOf('day').format('YYYY-MM-DD HH:mm:ss');
      
      const existingAppointments = await Appointment.findInDateRange(
        providerId, 
        startOfDay, 
        endOfDay,
        [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS]
      );

      // Calculate available slots
      const availableSlots = this.calculateAvailableSlots(
        regularSchedule,
        exceptions,
        existingAppointments,
        service.duration_minutes,
        date,
        timezone
      );

      return {
        available: availableSlots.length > 0,
        reason: availableSlots.length === 0 ? 'No available slots' : null,
        slots: availableSlots,
        date,
        provider_id: providerId,
        service_id: serviceId
      };

    } catch (error) {
      console.error('Error getting available slots:', error);
      throw error;
    }
  }

  /**
   * Check if a specific time slot is available
   * @param {number} providerId - Provider ID
   * @param {string} appointmentDateTime - Appointment date and time
   * @param {number} durationMinutes - Duration in minutes
   * @param {number} excludeAppointmentId - Appointment ID to exclude (for rescheduling)
   * @returns {Object} Availability result
   */
  async isSlotAvailable(providerId, appointmentDateTime, durationMinutes, excludeAppointmentId = null) {
    try {
      const startTime = moment.tz(appointmentDateTime, this.defaultTimeZone);
      const endTime = startTime.clone().add(durationMinutes, 'minutes');

      // Check for conflicting appointments
      const conflicts = await Appointment.findConflictingAppointments(
        providerId,
        startTime.format('YYYY-MM-DD HH:mm:ss'),
        endTime.format('YYYY-MM-DD HH:mm:ss'),
        excludeAppointmentId
      );

      if (conflicts.length > 0) {
        return {
          available: false,
          reason: 'Time slot conflicts with existing appointment',
          conflicting_appointments: conflicts.map(apt => ({
            id: apt.id,
            start: apt.appointment_datetime,
            end: moment(apt.appointment_datetime).add(apt.duration_minutes, 'minutes').format('YYYY-MM-DD HH:mm:ss')
          }))
        };
      }

      // Check provider schedule
      const date = startTime.format('YYYY-MM-DD');
      const dayOfWeek = startTime.format('dddd').toLowerCase();
      
      const regularSchedule = await this.getRegularSchedule(providerId, dayOfWeek);
      const exceptions = await this.getAvailabilityExceptions(providerId, date);

      // Check if time falls within available hours
      const isWithinSchedule = this.isTimeWithinSchedule(
        startTime.format('HH:mm:ss'),
        endTime.format('HH:mm:ss'),
        regularSchedule,
        exceptions
      );

      if (!isWithinSchedule.valid) {
        return {
          available: false,
          reason: isWithinSchedule.reason
        };
      }

      return {
        available: true,
        reason: null
      };

    } catch (error) {
      console.error('Error checking slot availability:', error);
      throw error;
    }
  }

  /**
   * Get provider's regular schedule for a specific day
   */
  async getRegularSchedule(providerId, dayOfWeek) {
    const knex = User.knex();
    return knex('availability_schedules')
      .where('provider_id', providerId)
      .where('day_of_week', dayOfWeek)
      .where('is_active', true)
      .where(function() {
        this.whereNull('effective_from')
            .orWhere('effective_from', '<=', knex.raw('CURDATE()'));
      })
      .where(function() {
        this.whereNull('effective_until')
            .orWhere('effective_until', '>=', knex.raw('CURDATE()'));
      })
      .orderBy('start_time');
  }

  /**
   * Get availability exceptions for a specific date
   */
  async getAvailabilityExceptions(providerId, date) {
    const knex = User.knex();
    return knex('availability_exceptions')
      .where('provider_id', providerId)
      .where('date', date);
  }

  /**
   * Validate if a date is valid for booking
   */
  validateBookingDate(date, service, timezone) {
    const requestedDate = moment.tz(date, timezone);
    const now = moment.tz(timezone);

    // Check if date is in the past
    if (requestedDate.isBefore(now, 'day')) {
      return { valid: false, reason: 'Cannot book appointments in the past' };
    }

    // Check same-day booking rules
    if (requestedDate.isSame(now, 'day') && !service.allowsSameDayBooking()) {
      return { valid: false, reason: 'Same-day booking is not allowed for this service' };
    }

    // Check advance booking limits
    const daysDifference = requestedDate.diff(now, 'days');
    const maxAdvanceDays = service.getMaxAdvanceDays();
    
    if (daysDifference > maxAdvanceDays) {
      return { 
        valid: false, 
        reason: `Cannot book more than ${maxAdvanceDays} days in advance` 
      };
    }

    return { valid: true };
  }

  /**
   * Calculate available time slots
   */
  calculateAvailableSlots(regularSchedule, exceptions, existingAppointments, durationMinutes, date, timezone) {
    const slots = [];
    const requestedDate = moment.tz(date, timezone);
    const now = moment.tz(timezone);
    
    // Process each schedule block
    for (const schedule of regularSchedule) {
      let blockStart = moment.tz(date, timezone)
        .set({
          hour: parseInt(schedule.start_time.split(':')[0]),
          minute: parseInt(schedule.start_time.split(':')[1]),
          second: 0,
          millisecond: 0
        });
      
      const blockEnd = moment.tz(date, timezone)
        .set({
          hour: parseInt(schedule.end_time.split(':')[0]),
          minute: parseInt(schedule.end_time.split(':')[1]),
          second: 0,
          millisecond: 0
        });

      // If it's today, start from current time or schedule start, whichever is later
      if (requestedDate.isSame(now, 'day') && blockStart.isBefore(now)) {
        blockStart = now.clone().add(15, 'minutes'); // 15-minute buffer
        blockStart.minute(Math.ceil(blockStart.minute() / 15) * 15); // Round to next 15-minute interval
      }

      // Generate time slots within this block
      let currentSlot = blockStart.clone();
      
      while (currentSlot.clone().add(durationMinutes, 'minutes').isSameOrBefore(blockEnd)) {
        const slotEnd = currentSlot.clone().add(durationMinutes, 'minutes');
        
        // Check if slot conflicts with existing appointments
        const hasConflict = existingAppointments.some(appointment => {
          const aptStart = moment(appointment.appointment_datetime);
          const aptEnd = aptStart.clone().add(appointment.duration_minutes, 'minutes');
          
          return (
            currentSlot.isBefore(aptEnd) && slotEnd.isAfter(aptStart)
          );
        });

        // Check if slot conflicts with availability exceptions
        const hasException = this.slotHasException(currentSlot, slotEnd, exceptions);

        if (!hasConflict && !hasException) {
          slots.push({
            start_time: currentSlot.format('HH:mm'),
            end_time: slotEnd.format('HH:mm'),
            datetime: currentSlot.format('YYYY-MM-DD HH:mm:ss'),
            available: true
          });
        }

        // Move to next slot (15-minute intervals)
        currentSlot.add(15, 'minutes');
      }
    }

    return slots;
  }

  /**
   * Check if a time slot has any exceptions
   */
  slotHasException(slotStart, slotEnd, exceptions) {
    return exceptions.some(exception => {
      if (exception.type === 'unavailable') {
        if (!exception.start_time && !exception.end_time) {
          return true; // Unavailable all day
        }
        
        if (exception.start_time && exception.end_time) {
          const exceptionStart = moment.tz(
            slotStart.format('YYYY-MM-DD') + ' ' + exception.start_time,
            slotStart.tz()
          );
          const exceptionEnd = moment.tz(
            slotStart.format('YYYY-MM-DD') + ' ' + exception.end_time,
            slotStart.tz()
          );
          
          return slotStart.isBefore(exceptionEnd) && slotEnd.isAfter(exceptionStart);
        }
      }
      
      return false;
    });
  }

  /**
   * Check if time is within schedule
   */
  isTimeWithinSchedule(startTime, endTime, regularSchedule, exceptions) {
    // Check if time falls within any regular schedule block
    const withinRegularSchedule = regularSchedule.some(schedule => {
      return startTime >= schedule.start_time && endTime <= schedule.end_time;
    });

    if (!withinRegularSchedule) {
      return { valid: false, reason: 'Time is outside provider\'s regular hours' };
    }

    // Check for exceptions
    const hasException = exceptions.some(exception => {
      if (exception.type === 'unavailable') {
        if (!exception.start_time && !exception.end_time) {
          return true; // Unavailable all day
        }
        
        if (exception.start_time && exception.end_time) {
          return startTime < exception.end_time && endTime > exception.start_time;
        }
      }
      
      return false;
    });

    if (hasException) {
      return { valid: false, reason: 'Provider has an exception during this time' };
    }

    return { valid: true };
  }

  /**
   * Get provider availability for a date range
   */
  async getProviderAvailability(providerId, startDate, endDate, timezone = this.defaultTimeZone) {
    const availability = {};
    const current = moment.tz(startDate, timezone);
    const end = moment.tz(endDate, timezone);

    while (current.isSameOrBefore(end)) {
      const date = current.format('YYYY-MM-DD');
      const dayOfWeek = current.format('dddd').toLowerCase();
      
      // Get regular schedule
      const regularSchedule = await this.getRegularSchedule(providerId, dayOfWeek);
      
      // Get exceptions
      const exceptions = await this.getAvailabilityExceptions(providerId, date);
      
      // Get existing appointments
      const startOfDay = current.clone().startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const endOfDay = current.clone().endOf('day').format('YYYY-MM-DD HH:mm:ss');
      const appointments = await Appointment.findInDateRange(
        providerId, 
        startOfDay, 
        endOfDay,
        [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS]
      );

      // Determine availability status
      let status = 'unavailable';
      let reason = 'No scheduled hours';
      
      if (regularSchedule.length > 0) {
        const unavailableAllDay = exceptions.find(ex => 
          ex.type === 'unavailable' && !ex.start_time && !ex.end_time
        );
        
        if (unavailableAllDay) {
          status = 'unavailable';
          reason = unavailableAllDay.reason || 'Provider unavailable';
        } else {
          status = 'available';
          reason = null;
        }
      }

      availability[date] = {
        status,
        reason,
        regular_schedule: regularSchedule,
        exceptions,
        appointment_count: appointments.length,
        appointments: appointments.map(apt => ({
          id: apt.id,
          start: apt.appointment_datetime,
          duration: apt.duration_minutes,
          status: apt.status
        }))
      };

      current.add(1, 'day');
    }

    return availability;
  }

  /**
   * Find next available slot
   */
  async findNextAvailableSlot(providerId, serviceId, startDate = null, timezone = this.defaultTimeZone) {
    const service = await Service.query().findById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }

    const searchStart = startDate 
      ? moment.tz(startDate, timezone) 
      : moment.tz(timezone).startOf('day');
    
    const maxSearchDate = searchStart.clone().add(service.getMaxAdvanceDays(), 'days');
    
    let current = searchStart.clone();
    
    while (current.isSameOrBefore(maxSearchDate)) {
      const date = current.format('YYYY-MM-DD');
      const slots = await this.getAvailableSlots(providerId, serviceId, date, timezone);
      
      if (slots.available && slots.slots.length > 0) {
        return {
          found: true,
          date,
          slot: slots.slots[0],
          all_slots: slots.slots
        };
      }
      
      current.add(1, 'day');
    }
    
    return {
      found: false,
      reason: 'No available slots found within booking window'
    };
  }
}

module.exports = new AvailabilityService();