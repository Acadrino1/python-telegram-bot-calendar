
const moment = require('moment-timezone');

class DateTimeUtils {

  static formatDate(date, format = 'MMM DD, YYYY') {
    return moment(date).format(format);
  }

  static formatTime(time, format = 'h:mm A') {
    return moment(time, 'HH:mm').format(format);
  }

  static formatDateTime(datetime, timezone = 'America/New_York', format = 'MMM DD, YYYY h:mm A z') {
    return moment.tz(datetime, timezone).format(format);
  }

  static getStartOfDay(date, timezone = 'America/New_York') {
    return moment.tz(date, timezone).startOf('day').toDate();
  }

  static getEndOfDay(date, timezone = 'America/New_York') {
    return moment.tz(date, timezone).endOf('day').toDate();
  }

  static isBusinessDay(date, businessDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
    const dayName = moment(date).format('dddd');
    return businessDays.includes(dayName);
  }

  static isWithinBusinessHours(datetime, startHour = 11, endHour = 20, timezone = 'America/New_York') {
    const timeMoment = moment.tz(datetime, timezone);
    const hour = timeMoment.hour();
    return hour >= startHour && hour < endHour;
  }

  static addMinutes(date, minutes) {
    return moment(date).add(minutes, 'minutes').toDate();
  }

  static getDuration(start, end, unit = 'minutes') {
    return moment(end).diff(moment(start), unit);
  }

  static parseTime(timeStr, format = 'HH:mm') {
    return moment(timeStr, format);
  }

  static getBookingDates(startDate = new Date(), days = 7, businessDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
    const dates = [];
    const current = moment(startDate);
    
    for (let i = 0; i < days; i++) {
      if (this.isBusinessDay(current, businessDays)) {
        dates.push({
          date: current.format('YYYY-MM-DD'),
          display: current.format('MMM DD, YYYY'),
          dayOfWeek: current.format('dddd')
        });
      }
      current.add(1, 'day');
    }
    
    return dates;
  }

  static isValidDate(dateStr, format = 'YYYY-MM-DD') {
    return moment(dateStr, format, true).isValid();
  }

  static now(timezone = 'America/New_York') {
    return moment.tz(timezone).toDate();
  }
}

module.exports = DateTimeUtils;