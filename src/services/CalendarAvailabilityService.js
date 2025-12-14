
const moment = require('moment-timezone');
const bookingConfig = require('../../config/booking.config');
const Appointment = require('../models/Appointment');

class CalendarAvailabilityService {
  constructor() {
    this.timezone = bookingConfig.timezone;
    this.cache = new Map(); // Cache availability data
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getMonthAvailability(date) {
    const monthKey = moment(date).format('YYYY-MM');
    
    // Check cache
    const cached = this.cache.get(monthKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const startOfMonth = moment(date).tz(this.timezone).startOf('month');
    const endOfMonth = moment(date).tz(this.timezone).endOf('month');
    const today = moment().tz(this.timezone).startOf('day');
    
    // Get all bookings for the month
    const bookings = await Appointment.query()
      .where('appointment_datetime', '>=', startOfMonth.format('YYYY-MM-DD'))
      .where('appointment_datetime', '<=', endOfMonth.format('YYYY-MM-DD 23:59:59'))
      .whereIn('status', ['scheduled', 'confirmed']);

    // Group bookings by date
    const bookingsByDate = {};
    bookings.forEach(booking => {
      const dateKey = moment(booking.appointment_datetime).format('YYYY-MM-DD');
      bookingsByDate[dateKey] = (bookingsByDate[dateKey] || 0) + 1;
    });

    // Build calendar data
    const calendarData = {
      month: monthKey,
      days: []
    };

    for (let day = startOfMonth.clone(); day.isSameOrBefore(endOfMonth); day.add(1, 'day')) {
      const dateStr = day.format('YYYY-MM-DD');
      const dayOfWeek = day.format('dddd');
      const isBusinessDay = bookingConfig.businessHours.days.includes(dayOfWeek);
      const isPast = day.isBefore(today);
      const bookedCount = bookingsByDate[dateStr] || 0;
      
      let status = 'unavailable';
      let indicator = '🚫'; // Closed
      
      if (!isPast && isBusinessDay) {
        if (bookedCount >= bookingConfig.bookingLimits.maxSlotsPerDay) {
          status = 'full';
          indicator = '❌'; // Fully booked
        } else if (bookedCount >= bookingConfig.bookingLimits.maxSlotsPerDay - 1) {
          status = 'limited';
          indicator = '🟡'; // Almost full (1 slot left)
        } else {
          status = 'available';
          indicator = '✅'; // Available
        }
      } else if (isPast) {
        indicator = '⬜'; // Past date
      }

      calendarData.days.push({
        date: dateStr,
        day: day.date(),
        dayOfWeek: dayOfWeek,
        status: status,
        indicator: indicator,
        bookedSlots: bookedCount,
        availableSlots: Math.max(0, bookingConfig.bookingLimits.maxSlotsPerDay - bookedCount),
        isBusinessDay: isBusinessDay,
        isPast: isPast
      });
    }

    // Cache the result
    this.cache.set(monthKey, {
      data: calendarData,
      timestamp: Date.now()
    });

    return calendarData;
  }

  async getAvailabilitySummary(startDate = new Date(), daysAhead = 7) {
    const start = moment(startDate).tz(this.timezone);
    const availableDates = [];
    const fullyBookedDates = [];
    
    for (let i = 0; i < daysAhead; i++) {
      const checkDate = start.clone().add(i, 'days');
      const dateStr = checkDate.format('YYYY-MM-DD');
      const dayOfWeek = checkDate.format('dddd');
      
      if (!bookingConfig.businessHours.days.includes(dayOfWeek)) {
        continue;
      }

      const bookings = await Appointment.query()
        .where('appointment_datetime', '>=', `${dateStr} 00:00:00`)
        .where('appointment_datetime', '<=', `${dateStr} 23:59:59`)
        .whereIn('status', ['scheduled', 'confirmed']);

      const availableSlots = bookingConfig.bookingLimits.maxSlotsPerDay - bookings.length;
      
      if (availableSlots > 0) {
        availableDates.push({
          date: dateStr,
          display: checkDate.format('MMM DD'),
          slotsAvailable: availableSlots
        });
      } else {
        fullyBookedDates.push(dateStr);
      }
    }

    return {
      availableDates,
      fullyBookedDates,
      nextAvailable: availableDates[0] || null
    };
  }

  clearCache() {
    this.cache.clear();
  }

  formatCalendarDisplay(calendarData) {
    const month = moment(calendarData.month, 'YYYY-MM');
    let display = `📅 *${month.format('MMMM YYYY')}*\n\n`;
    
    // Create calendar grid header
    display += '```\nMon  Tue  Wed  Thu  Fri  Sat  Sun\n';
    
    // Get first day of month and its day of week
    const firstDay = moment(calendarData.month + '-01', 'YYYY-MM-DD');
    const startDayOfWeek = firstDay.day(); // 0 = Sunday, 1 = Monday, etc.
    
    // Convert to Monday-first format (0 = Monday, 6 = Sunday)
    const mondayFirstStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    let currentWeek = '';
    let dayPosition = 0;
    
    // Add leading spaces for days before month starts
    for (let i = 0; i < mondayFirstStart; i++) {
      currentWeek += '     '; // 5 spaces for empty day
      dayPosition++;
    }
    
    // Add all days of the month
    calendarData.days.forEach(dayData => {
      const dayNum = dayData.day;
      const dayStr = dayNum.toString().padStart(2, ' '); // Right-align with spaces
      
      currentWeek += dayStr + '   '; // Day number + 3 spaces
      dayPosition++;
      
      // Start new week after Sunday (position 7)
      if (dayPosition === 7) {
        display += currentWeek.trimEnd() + '\n';
        currentWeek = '';
        dayPosition = 0;
      }
    });
    
    // Add final week if not complete
    if (currentWeek.trim()) {
      display += currentWeek.trimEnd() + '\n';
    }
    
    display += '```\n\n';
    
    // Show availability legend and summary
    display += `📊 *Legend:*\n`;
    display += `✅ Available  🟡 Limited  ❌ Full  🚫 Closed\n\n`;
    
    // Calculate total booked slots for the month
    let totalBookedSlots = 0;
    calendarData.days.forEach(day => {
      totalBookedSlots += day.bookedSlots;
    });
    
    display += `📊 *This Month's Bookings:*\n`;
    display += `📅 ${totalBookedSlots} slots booked this month\n`;
    
    display += `\n⏰ *Business Hours:*\n`;
    display += `Mon-Sat: 11:00 AM - 8:00 PM EST\n`;
    display += `Sunday: Closed`;
    
    return display;
  }
}

module.exports = CalendarAvailabilityService;