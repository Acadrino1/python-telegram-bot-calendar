const { Markup } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../../models/User');
const Service = require('../../models/Service');
const Appointment = require('../../models/Appointment');
const BookingSlotService = require('../../services/BookingSlotService');
const bookingConfig = require('../../../config/booking.config');

class BookingCommand {
  constructor(bot, services) {
    this.bot = bot;
    this.bookingSlotService = services.bookingSlotService;
    this.groupNotificationService = services.groupNotificationService;
    this.calendarUIManager = services.calendarUIManager;
  }

  getName() {
    return 'book';
  }

  getDescription() {
    return 'Book a new appointment';
  }

  async execute(ctx) {
    try {
      // Ensure user is registered
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
      }
      
      // Check approval status
      if (!user.isApproved()) {
        const message = user.isPending() 
          ? 'Your access request is pending approval. Please wait for admin review.'
          : 'Your access has been denied. Please contact support if you believe this is an error.';
        return await ctx.reply(message);
      }
      
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      
      await ctx.reply('📅 *Lodge Scheduler Services*\n\nPlease select one of the following service options:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🆕 New Registration', 'service_lodge_mobile_new_registration')],
            [Markup.button.callback('📱 SIM Card Activation', 'service_lodge_mobile_simcard_activation')],
            [Markup.button.callback('🔧 Technical Support', 'service_lodge_mobile_technical_support')],
            [Markup.button.callback('📲 Upgrade Device', 'service_lodge_mobile_upgrade_device')]
          ]).reply_markup
        }
      );
    } catch (error) {
      console.error('Book command error:', error);
      await ctx.reply('Sorry, I couldn\'t process your booking request. Please try again.');
    }
  }

  async handleMyAppointments(ctx) {
    try {
      // Ensure user is registered
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
      }
      if (!user) {
        return ctx.reply('Please start the bot first with /start');
      }
      
      // Check approval status
      if (!user.isApproved()) {
        const message = user.isPending() 
          ? 'Your access request is pending approval. Please wait for admin review.'
          : 'Your access has been denied. Please contact support if you believe this is an error.';
        return await ctx.reply(message);
      }

      const appointments = await Appointment.query()
        .where('client_id', user.id)
        .whereIn('status', ['booked', 'scheduled', 'confirmed', 'pending_approval', 'in_progress'])
        .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
        .withGraphFetched('[provider, service]')
        .orderBy('appointment_datetime', 'asc')
        .limit(10);

      if (appointments.length === 0) {
        return ctx.reply('You have no upcoming appointments. Use /book to schedule one!');
      }

      let message = '*📅 Your Upcoming Appointments:*\n\n';
      appointments.forEach((apt, index) => {
        const dateTime = this.bookingSlotService.formatDateTime(apt.appointment_datetime);

        // Format status with icon
        let statusDisplay = apt.status;
        if (apt.status === 'pending_approval') {
          statusDisplay = '⏳ Pending Approval';
        } else if (apt.status === 'booked') {
          statusDisplay = '📋 Booked';
        } else if (apt.status === 'confirmed') {
          statusDisplay = '✅ Confirmed';
        } else if (apt.status === 'completed') {
          statusDisplay = '✔️ Completed';
        } else if (apt.status === 'scheduled') {
          statusDisplay = '📅 Scheduled';
        } else if (apt.status === 'cancelled') {
          statusDisplay = '❌ Cancelled';
        } else if (apt.status === 'rejected') {
          statusDisplay = '❌ Rejected';
        } else if (apt.status === 'in_progress') {
          statusDisplay = '🔄 In Progress';
        }

        // Get customer name from bulk upload or registration form
        const customerName = apt.customer_first_name
          ? `${apt.customer_first_name} ${apt.customer_last_name || ''}`.trim()
          : null;

        message += `${index + 1}. *${apt.service ? apt.service.name : 'Lodge Mobile Service'}*\n`;
        if (customerName) {
          message += `   👤 ${customerName}\n`;
        }
        message += `   📆 ${dateTime.date}\n`;
        message += `   ⏰ ${dateTime.time} ${dateTime.timezone}\n`;
        message += `   🔗 Status: ${statusDisplay}\n`;
        message += `   ❌ Cancel: \`/cancel ${apt.uuid}\`\n\n`;
      });

      message += '_Tap a cancel command above to copy it_';

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      ctx.reply('Sorry, I couldn\'t fetch your appointments. Please try again later.');
    }
  }

  async handleCancelAppointment(ctx) {
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      return ctx.reply('Please provide the appointment ID. Example: /cancel ABC123');
    }

    try {
      const appointmentId = args[1];
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
      }
      
      const appointment = await Appointment.query()
        .where('uuid', appointmentId)
        .where('client_id', user.id)
        .withGraphFetched('[service]')
        .first();

      if (!appointment) {
        return ctx.reply('Appointment not found or you don\'t have permission to cancel it.');
      }
      
      if (appointment.status === 'cancelled') {
        return ctx.reply('This appointment has already been cancelled.');
      }

      await appointment.$query().patch({
        status: 'cancelled',
        cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
        cancelled_by: user.id,
        cancellation_reason: 'Cancelled via Telegram bot'
      });
      
      // Send group notification about cancellation
      await this.groupNotificationService.notifyCancellation(
        appointment,
        user,
        appointment.service || { name: 'Lodge Mobile Service' }
      );
      
      const dateTime = this.bookingSlotService.formatDateTime(appointment.appointment_datetime);
      
      ctx.reply(
        `✅ *Appointment Cancelled Successfully*\n\n` +
        `🆔 ID: \`${appointmentId}\`\n` +
        `📱 Service: ${appointment.service?.name || 'Lodge Mobile Service'}\n` +
        `📅 Date: ${dateTime.date}\n` +
        `⏰ Time: ${dateTime.time} ${dateTime.timezone}\n\n` +
        `The time slot is now available for others to book.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      ctx.reply('Sorry, I couldn\'t cancel the appointment. Please try again.');
    }
  }

  // Helper methods
  async getUser(telegramId) {
    try {
      return await User.query()
        .where('telegram_id', telegramId.toString())
        .first();
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first()
        .catch(err => {
          console.error('Error querying user:', err.message);
          return null;
        });

      if (!user) {
        user = await User.createTelegramUser(telegramUser, 'pending');
      }

      return user;
    } catch (error) {
      console.error('Error in registerUser:', error);
      return null;
    }
  }
}

module.exports = BookingCommand;