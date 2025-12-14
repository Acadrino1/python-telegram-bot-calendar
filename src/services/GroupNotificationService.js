
const bookingConfig = require('../../config/booking.config');
const moment = require('moment-timezone');

class GroupNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.config = bookingConfig.notifications;
    this.groupChatId = this.config.groupChatId;
  }

  async notifyNewBooking(booking, customer, service) {
    if (!this.groupChatId) {
      console.log('Group chat ID not configured, skipping notification');
      return;
    }

    try {
      const dateTime = moment(booking.appointment_datetime).tz(bookingConfig.timezone);
      
      // Get current booking count for the day
      const BookingSlotService = require('./BookingSlotService');
      const slotService = new BookingSlotService();
      const dayBookings = await slotService.getBookingsForDate(dateTime.format('YYYY-MM-DD'));
      
      const message = this.config.templates.newBooking
        .replace('{customerName}', `${customer.first_name} ${customer.last_name}`)
        .replace('{serviceName}', service.name)
        .replace('{date}', dateTime.format('MMM DD, YYYY'))
        .replace('{time}', dateTime.format('h:mm A z'))
        .replace('{slotNumber}', dayBookings.length)
        .replace('{maxSlots}', bookingConfig.bookingLimits.maxSlotsPerDay);

      await this.bot.telegram.sendMessage(this.groupChatId, message, {
        parse_mode: 'Markdown'
      });

      // If daily limit reached, send additional alert
      if (dayBookings.length >= bookingConfig.bookingLimits.maxSlotsPerDay) {
        await this.notifyDailyLimitReached(dateTime.format('YYYY-MM-DD'));
      }
    } catch (error) {
      console.error('Failed to send group notification:', error);
    }
  }

  async notifyCancellation(booking, customer, service) {
    if (!this.groupChatId) {
      console.log('Group chat ID not configured, skipping notification');
      return;
    }

    try {
      const dateTime = moment(booking.appointment_datetime).tz(bookingConfig.timezone);
      
      const message = this.config.templates.cancellation
        .replace('{customerName}', `${customer.first_name} ${customer.last_name}`)
        .replace('{serviceName}', service.name)
        .replace('{date}', dateTime.format('MMM DD, YYYY'))
        .replace('{time}', dateTime.format('h:mm A z'));

      await this.bot.telegram.sendMessage(this.groupChatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Failed to send cancellation notification:', error);
    }
  }

  async notifyDailyLimitReached(date) {
    if (!this.groupChatId) {
      return;
    }

    try {
      const formattedDate = moment(date).tz(bookingConfig.timezone).format('MMM DD, YYYY');
      
      const message = this.config.templates.dailyLimit
        .replace('{date}', formattedDate);

      await this.bot.telegram.sendMessage(this.groupChatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Failed to send daily limit notification:', error);
    }
  }

  async sendDailySummary() {
    if (!this.groupChatId) {
      return;
    }

    try {
      const BookingSlotService = require('./BookingSlotService');
      const slotService = new BookingSlotService();
      
      const today = moment().tz(bookingConfig.timezone).format('YYYY-MM-DD');
      const tomorrow = moment().tz(bookingConfig.timezone).add(1, 'day').format('YYYY-MM-DD');
      
      const todayBookings = await slotService.getBookingsForDate(today);
      const tomorrowBookings = await slotService.getBookingsForDate(tomorrow);
      
      let message = `📊 *Daily Booking Summary*\n\n`;
      message += `*Today (${moment(today).format('MMM DD')}):*\n`;
      message += `• Bookings: ${todayBookings.length}/${bookingConfig.bookingLimits.maxSlotsPerDay}\n`;
      message += `• Available: ${bookingConfig.bookingLimits.maxSlotsPerDay - todayBookings.length} slots\n\n`;
      
      message += `*Tomorrow (${moment(tomorrow).format('MMM DD')}):*\n`;
      message += `• Bookings: ${tomorrowBookings.length}/${bookingConfig.bookingLimits.maxSlotsPerDay}\n`;
      message += `• Available: ${bookingConfig.bookingLimits.maxSlotsPerDay - tomorrowBookings.length} slots\n\n`;
      
      message += `⏰ Business Hours: ${slotService.getBusinessHoursDisplay().full}`;

      await this.bot.telegram.sendMessage(this.groupChatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  setGroupChatId(chatId) {
    this.groupChatId = chatId;
    console.log(`Group chat ID updated to: ${chatId}`);
  }
}

module.exports = GroupNotificationService;