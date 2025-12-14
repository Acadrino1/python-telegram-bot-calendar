
const moment = require('moment-timezone');
const bookingConfig = require('../../config/booking.config');
const Appointment = require('../models/Appointment');

class BookingSlotService {
  constructor() {
    this.config = bookingConfig;
    // Set default timezone for all moment operations
    moment.tz.setDefault(this.config.timezone);
  }

  getAvailableDates(daysAhead = 7) {
    const dates = [];
    const today = moment().tz(this.config.timezone);
    
    for (let i = 1; i <= daysAhead; i++) {
      const date = today.clone().add(i, 'days');
      const dayName = date.format('dddd');
      
      // Skip if it's Sunday or not in business days
      if (!this.config.businessHours.days.includes(dayName)) {
        continue;
      }
      
      dates.push({
        date: date.format('YYYY-MM-DD'),
        display: date.format('MMM DD (ddd)'),
        dayName: dayName
      });
    }
    
    return dates;
  }

  async getAvailableTimeSlots(date, serviceDurationMinutes = null) {
    // Use configured slot duration (90 minutes)
    const slotDuration = serviceDurationMinutes || this.config.bookingLimits.slotDurationMinutes;
    const slots = [];
    const selectedDate = moment.tz(date, 'YYYY-MM-DD', this.config.timezone);
    const now = moment().tz(this.config.timezone);
    
    // Get existing bookings for this date
    const existingBookings = await this.getBookingsForDate(date);
    const bookedSlots = existingBookings.map(booking => 
      moment(booking.appointment_datetime).format('h:mm A')
    );
    
    // Check if daily limit is reached
    if (existingBookings.length >= this.config.bookingLimits.maxSlotsPerDay) {
      return {
        slots: [],
        message: `All ${this.config.bookingLimits.maxSlotsPerDay} slots are booked for this day`,
        slotsRemaining: 0
      };
    }
    
    // Generate slots based on 90-minute intervals
    // Business hours: 11am-8pm (9 hours = 6 x 90-minute slots)
    const slotTimes = [
      { hour: 11, minute: 0 },   // 11:00 AM - 12:30 PM
      { hour: 12, minute: 30 },  // 12:30 PM - 2:00 PM
      { hour: 14, minute: 0 },   // 2:00 PM - 3:30 PM
      { hour: 15, minute: 30 },  // 3:30 PM - 5:00 PM
      { hour: 17, minute: 0 },   // 5:00 PM - 6:30 PM
      { hour: 18, minute: 30 }   // 6:30 PM - 8:00 PM
    ];
    
    // If today, filter out past slots
    let availableSlotTimes = slotTimes;
    if (selectedDate.isSame(now, 'day')) {
      const minBookingTime = now.clone().add(this.config.bookingLimits.minAdvanceHours, 'hours');
      availableSlotTimes = slotTimes.filter(slot => {
        const slotTime = selectedDate.clone().hour(slot.hour).minute(slot.minute);
        return slotTime.isAfter(minBookingTime);
      });
    }
    
    // Generate available slots
    for (const slot of availableSlotTimes) {
      const slotTime = selectedDate.clone().hour(slot.hour).minute(slot.minute);
      const display12Hour = slotTime.format('h:mm A');
      
      // Check if slot is already booked
      if (!bookedSlots.includes(display12Hour)) {
        slots.push({
          time24: slotTime.format('HH:mm'),
          time12: display12Hour,
          available: true,
          datetime: slotTime.format('YYYY-MM-DD HH:mm:ss'),
          endTime: slotTime.clone().add(slotDuration, 'minutes').format('h:mm A')
        });
      }
      
      // Stop if we've reached the remaining available slots
      if (slots.length >= (this.config.bookingLimits.maxSlotsPerDay - existingBookings.length)) {
        break;
      }
    }
    
    return {
      slots: slots,
      slotsRemaining: this.config.bookingLimits.maxSlotsPerDay - existingBookings.length,
      totalBooked: existingBookings.length,
      maxSlots: this.config.bookingLimits.maxSlotsPerDay
    };
  }

  async getBookingsForDate(date) {
    const startOfDay = moment.tz(date, 'YYYY-MM-DD', this.config.timezone).startOf('day');
    const endOfDay = startOfDay.clone().endOf('day');
    
    return await Appointment.query()
      .where('appointment_datetime', '>=', startOfDay.format('YYYY-MM-DD HH:mm:ss'))
      .where('appointment_datetime', '<=', endOfDay.format('YYYY-MM-DD HH:mm:ss'))
      .whereIn('status', ['scheduled', 'confirmed'])
      .orderBy('appointment_datetime');
  }

  async isSlotAvailable(date, time) {
    const bookings = await this.getBookingsForDate(date);

    // Check daily limit
    if (bookings.length >= this.config.bookingLimits.maxSlotsPerDay) {
      return false;
    }

    // Check if specific time is taken
    const requestedDateTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', this.config.timezone);

    for (const booking of bookings) {
      const bookingTime = moment(booking.appointment_datetime);
      if (bookingTime.isSame(requestedDateTime)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate that a specific date/time is within business hours
   * @param {string} date - YYYY-MM-DD format
   * @param {string} time - HH:mm format (24-hour)
   * @returns {Object} - { valid: boolean, reason: string }
   */
  isValidBusinessHourSlot(date, time) {
    const dateTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', this.config.timezone);
    const dayName = dateTime.format('dddd');
    const hour = dateTime.hour();
    const minute = dateTime.minute();

    // Check if it's a business day
    if (!this.config.businessHours.days.includes(dayName)) {
      return {
        valid: false,
        reason: `We are closed on ${dayName}. Business days are ${this.config.businessHours.days.join(', ')}.`
      };
    }

    // Check if time is within business hours
    const timeInMinutes = hour * 60 + minute;
    const startMinutes = this.config.businessHours.start * 60;
    const endMinutes = this.config.businessHours.end * 60;

    if (timeInMinutes < startMinutes || timeInMinutes >= endMinutes) {
      const startTime = moment().hour(this.config.businessHours.start).minute(0).format('h:mm A');
      const endTime = moment().hour(this.config.businessHours.end).minute(0).format('h:mm A');
      return {
        valid: false,
        reason: `Selected time is outside business hours. We are open ${startTime} - ${endTime} EST.`
      };
    }

    // Check if it's one of our valid slot times
    const validSlotTimes = [
      { hour: 11, minute: 0 },
      { hour: 12, minute: 30 },
      { hour: 14, minute: 0 },
      { hour: 15, minute: 30 },
      { hour: 17, minute: 0 },
      { hour: 18, minute: 30 }
    ];

    const isValidSlot = validSlotTimes.some(slot => slot.hour === hour && slot.minute === minute);
    if (!isValidSlot) {
      return {
        valid: false,
        reason: 'Invalid time slot. Please select from available slots.'
      };
    }

    return { valid: true };
  }

  formatDateTime(datetime) {
    const m = moment(datetime).tz(this.config.timezone);
    return {
      date: m.format('MMM DD, YYYY'),
      time: m.format('h:mm A'),
      timezone: m.format('z'), // EST or EDT
      full: m.format('MMM DD, YYYY [at] h:mm A z')
    };
  }

  getBusinessHoursDisplay() {
    const startTime = moment().hour(this.config.businessHours.start).minute(0).format('h:mm A');
    const endTime = moment().hour(this.config.businessHours.end).minute(0).format('h:mm A');
    const days = this.config.businessHours.days.join(', ');
    
    return {
      hours: `${startTime} - ${endTime} EST`,
      days: days,
      full: `${startTime} - ${endTime} EST, ${days}`
    };
  }

  isWithinBusinessHours() {
    const now = moment().tz(this.config.timezone);
    const currentHour = now.hour();
    const currentDay = now.format('dddd');
    
    return this.config.businessHours.days.includes(currentDay) &&
           currentHour >= this.config.businessHours.start &&
           currentHour < this.config.businessHours.end;
  }

  getNextBusinessDay() {
    let nextDay = moment().tz(this.config.timezone).add(1, 'day');
    
    while (!this.config.businessHours.days.includes(nextDay.format('dddd'))) {
      nextDay.add(1, 'day');
    }
    
    return {
      date: nextDay.format('YYYY-MM-DD'),
      display: nextDay.format('MMM DD, YYYY (dddd)'),
      openingTime: `${moment().hour(this.config.businessHours.start).minute(0).format('h:mm A')} EST`
    };
  }
}

module.exports = BookingSlotService;