const { Markup } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../../models/User');
const Service = require('../../models/Service');
const Appointment = require('../../models/Appointment');
const bookingConfig = require('../../../config/booking.config');
const CallbackDataValidator = require('../utils/CallbackDataValidator');

class CallbackQueryHandler {
  constructor(bot, services) {
    this.bot = bot;
    this.bookingSlotService = services.bookingSlotService;
    this.groupNotificationService = services.groupNotificationService;
    this.calendarUIManager = services.calendarUIManager;
    this.supportService = services.supportService;
    this.referralCodeService = services.referralCodeService;
    this.ADMIN_ID = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
    
    // Initialize callback data validator
    this.validator = new CallbackDataValidator();
    
    console.log('✅ CallbackQueryHandler initialized with validation');
  }

  setupHandlers() {
    // Add global callback query validation middleware
    this.bot.on('callback_query', async (ctx, next) => {
      const validation = this.validator.validateCallbackQuery(ctx.callbackQuery);
      
      if (!validation.isValid) {
        this.validator.logValidation(validation, 'Global validation');
        
        const errorMessage = this.validator.getErrorMessage(validation);
        await ctx.answerCbQuery(errorMessage, { show_alert: true });
        return;
      }
      
      // Mark callback as validated
      ctx.callbackValidated = true;
      await next();
    });
    
    // Service selection handlers
    this.bot.action(/service_(\d+)/, (ctx) => this.handleServiceSelection(ctx));
    
    // Date selection handlers
    this.bot.action('select_date', (ctx) => this.handleDateSelectionTrigger(ctx));
    this.bot.action(/date_(.+)/, (ctx) => this.handleDateSelection(ctx));
    this.bot.action('show_calendar', (ctx) => this.handleShowCalendar(ctx));
    
    // Time selection handlers
    this.bot.action(/time_(.+)/, (ctx) => this.handleTimeSelection(ctx));
    
    // Booking handlers
    this.bot.action('confirm_booking', (ctx) => this.handleBookingConfirmation(ctx));
    this.bot.action('cancel_booking', (ctx) => this.handleBookingCancellation(ctx));
    
    // Support handlers
    this.bot.action('support_create_ticket', (ctx) => this.handleSupportCreateTicket(ctx));
    this.bot.action('support_my_tickets', (ctx) => this.handleSupportMyTickets(ctx));
    this.bot.action('support_faq', (ctx) => this.handleSupportFAQ(ctx));
    
    // Admin support handlers
    this.bot.action('admin_all_tickets', (ctx) => this.handleAdminAllTickets(ctx));
    this.bot.action('admin_open_tickets', (ctx) => this.handleAdminOpenTickets(ctx));
    this.bot.action('admin_support_stats', (ctx) => this.handleAdminSupportStats(ctx));
    this.bot.action('admin_urgent_tickets', (ctx) => this.handleAdminUrgentTickets(ctx));
    
    // User approval handlers
    this.bot.action(/approve_(.+)/, (ctx) => this.handleQuickApprove(ctx));
    this.bot.action(/deny_(.+)/, (ctx) => this.handleQuickDeny(ctx));
  }

  async handleServiceSelection(ctx) {
    try {
      // CRITICAL: Always answer callback query first
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Loading calendar...').catch(err => {
          console.warn('Failed to answer callback:', err);
        });
        ctx.callbackAnswered = true;
      }
      
      const serviceId = ctx.match[1];
      if (!serviceId) {
        console.error('Missing service ID in callback data');
        return await ctx.editMessageText('Invalid service selection. Please try /book again.');
      }
      
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.serviceId = serviceId;
      
      await this.calendarUIManager.showCalendar(ctx);
    } catch (error) {
      console.error('Service handler error:', error);
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Error occurred').catch(e => console.warn('Callback ack failed:', e.message));
        ctx.callbackAnswered = true;
      }
      await this.fallbackToBasicDateSelection(ctx);
    }
  }

  async handleDateSelectionTrigger(ctx) {
    try {
      await ctx.answerCbQuery();
      await this.calendarUIManager.showCalendar(ctx);
    } catch (error) {
      console.error('Date selection trigger error:', error);
      await this.fallbackToBasicDateSelection(ctx);
    }
  }

  async handleDateSelection(ctx) {
    try {
      // CRITICAL: Always answer callback query first
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Loading time slots...').catch(err => {
          console.warn('Failed to answer callback:', err);
        });
        ctx.callbackAnswered = true;
      }
      
      const date = ctx.match[1];
      if (!date) {
        console.error('Missing date in callback data');
        return await ctx.editMessageText('Invalid date selection. Please try again.');
      }
      
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.date = date;
      
      let serviceDuration = 60;
      if (ctx.session.booking.serviceId) {
        const service = await Service.query().findById(ctx.session.booking.serviceId);
        if (service) {
          serviceDuration = service.duration_minutes || 60;
          ctx.session.booking.service = service.name;
        }
      }
      
      const slotInfo = await this.bookingSlotService.getAvailableTimeSlots(date);
      
      if (slotInfo.slots.length === 0) {
        await ctx.editMessageText(
          `❌ No available slots for ${moment(date).format('MMM DD, YYYY')}\n\n` +
          slotInfo.message || 'All slots are booked for this day.\n\n' +
          'Please select another date with /book'
        );
        return;
      }
      
      const timeButtons = [];
      for (let i = 0; i < slotInfo.slots.length; i += 2) {
        const row = [];
        const slot1 = slotInfo.slots[i];
        const callbackData1 = this.validator.createSafeCallbackData('time', [slot1.time24]);
        row.push(Markup.button.callback(
          `${slot1.time12} - ${slot1.endTime}`,
          callbackData1
        ));
        if (slotInfo.slots[i + 1]) {
          const slot2 = slotInfo.slots[i + 1];
          const callbackData2 = this.validator.createSafeCallbackData('time', [slot2.time24]);
          row.push(Markup.button.callback(
            `${slot2.time12} - ${slot2.endTime}`,
            callbackData2
          ));
        }
        timeButtons.push(row);
      }
      
      timeButtons.push([
        Markup.button.callback('← Back to dates', 'show_calendar'),
        Markup.button.callback('❌ Cancel', 'cancel_booking')
      ]);

      await ctx.editMessageText(
        `⏰ Available time slots for ${moment(date).format('MMM DD, YYYY')}:\n\n` +
        `📊 ${slotInfo.totalBooked}/${slotInfo.maxSlots} slots booked\n` +
        `✅ ${slotInfo.slotsRemaining} slots available\n\n` +
        'Select a time:',
        Markup.inlineKeyboard(timeButtons)
      );
    } catch (error) {
      console.error('Date handler error:', error);
      ctx.reply('Sorry, something went wrong. Please try /book again.');
    }
  }

  async handleTimeSelection(ctx) {
    try {
      // CRITICAL: Always answer callback query first
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Preparing booking summary...').catch(err => {
          console.warn('Failed to answer callback:', err);
        });
        ctx.callbackAnswered = true;
      }
      
      const time = ctx.match[1];
      if (!time) {
        console.error('Missing time in callback data');
        return await ctx.editMessageText('Invalid time selection. Please try again.');
      }
      
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.time = time;
      
      if (!ctx.session.booking.service && ctx.session.registration?.service) {
        ctx.session.booking.service = ctx.session.registration.service;
      }
      
      const booking = ctx.session.booking;
      const serviceName = booking.service || 'Lodge Mobile Service';
      
      const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm').tz(bookingConfig.timezone);
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');
      
      const summary = `
*📋 Booking Summary:*

📅 Date: ${formattedDate}
⏰ Time: ${formattedTime} EST
📱 Service: ${serviceName}
⏱️ Duration: ${bookingConfig.serviceDurations[serviceName] || 60} minutes

Confirm your booking?
      `;

      await ctx.editMessageText(summary, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirm', 'confirm_booking'),
            Markup.button.callback('❌ Cancel', 'cancel_booking')
          ]
        ]).reply_markup
      });
    } catch (error) {
      console.error('Time handler error:', error);
      ctx.reply('Sorry, something went wrong. Please try /book again.');
    }
  }

  async handleShowCalendar(ctx) {
    try {
      await ctx.answerCbQuery().catch(() => {});
      if (this.calendarUIManager) {
        await this.calendarUIManager.showCalendar(ctx);
      } else {
        await this.fallbackToBasicDateSelection(ctx);
      }
    } catch (error) {
      console.error('Show calendar error:', error);
      ctx.reply('Error showing calendar. Please try /book again.');
    }
  }

  async handleBookingConfirmation(ctx) {
    try {
      // CRITICAL: Always answer callback query first
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Processing booking...').catch(err => {
          console.warn('Failed to answer callback:', err);
        });
        ctx.callbackAnswered = true;
      }
      
      console.log('Starting booking confirmation...');
      
      const user = await this.getUser(ctx.from.id);
      if (!user) {
        console.error('User not found for Telegram ID:', ctx.from.id);
        return ctx.reply('Please use /start first to register.');
      }
      
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking || {};
      
      const customerInfo = ctx.session.customerInfo || null;
      
      if (!booking.date || !booking.time) {
        console.error('Missing booking data:', { date: booking.date, time: booking.time });
        return ctx.reply('Session expired. Please start booking again with /book');
      }
      
      if (!booking.service && customerInfo) {
        booking.service = 'Lodge Mobile: New Registration';
      }
      
      const isAvailable = await this.bookingSlotService.isSlotAvailable(booking.date, booking.time);
      if (!isAvailable) {
        return ctx.editMessageText(
          '❌ Sorry, this slot was just booked by someone else.\n\n' +
          'Please use /book to select another time.'
        );
      }
      
      const dateTime = moment.tz(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm', bookingConfig.timezone);
      
      let service = null;
      let serviceDuration = 60;
      if (booking.serviceId) {
        service = await Service.query().findById(booking.serviceId);
        if (service) {
          serviceDuration = service.duration_minutes || 60;
        }
      }
      
      const provider = await User.query()
        .where('role', 'provider')
        .where('is_active', true)
        .first();
      
      if (!provider) {
        console.error('No active provider found');
        return ctx.reply('Sorry, no providers are available. Please try again later.');
      }
      
      const appointmentData = {
        uuid: require('uuid').v4(),
        client_id: user.id,
        provider_id: provider.id,
        service_id: booking.serviceId || 1,
        appointment_datetime: dateTime.format('YYYY-MM-DD HH:mm:ss'),
        duration_minutes: serviceDuration,
        status: 'scheduled',
        notes: `${booking.service || 'Lodge Mobile Service'} - Booked via Telegram${ctx.session.customerInfo ? '\\nCustomer Registration: Yes' : ''}`,
        price: service?.price || 0
      };
      
      const appointment = await Appointment.query().insert(appointmentData);
      
      await this.groupNotificationService.notifyNewBooking(
        appointment,
        user,
        service || { name: booking.service || 'Lodge Mobile Service' }
      );
      
      const displayDateTime = this.bookingSlotService.formatDateTime(appointment.appointment_datetime);

      await ctx.editMessageText(
        `✅ *Appointment Booked Successfully!*\n\n` +
        `📱 Service: ${booking.service || "Lodge Mobile Service"}\n` +
        `📅 Date: ${displayDateTime.date}\n` +
        `⏰ Time: ${displayDateTime.time}\n` +
        `🌎 Timezone: ${displayDateTime.timezone}\n\n` +
        `Use /myappointments to view your bookings.`,
        { parse_mode: 'Markdown' }
      );

      ctx.session.booking = {};
      ctx.session.customerInfo = {};
      ctx.session.registration = {};
    } catch (error) {
      console.error('Booking confirmation error:', error);
      await ctx.reply('Sorry, booking failed. Please try again.\n\nError: ' + error.message);
    }
  }

  async handleBookingCancellation(ctx) {
    try {
      // CRITICAL: Always answer callback query first
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Booking cancelled').catch(err => {
          console.warn('Failed to answer callback:', err);
        });
        ctx.callbackAnswered = true;
      }
      
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      
      await ctx.editMessageText(
        '❌ Booking cancelled.\n\nWhat would you like to do next?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Start New Booking', callback_data: 'start_booking' }],
              [{ text: '📋 My Appointments', callback_data: 'my_appointments' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Cancel booking error:', error);
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery('Cancelled').catch(() => {});
        ctx.callbackAnswered = true;
      }
      try {
        await ctx.reply('Booking cancelled.');
      } catch (replyError) {
        console.error('Failed to send cancellation reply:', replyError);
      }
    }
  }

  // Support handlers
  async handleSupportCreateTicket(ctx) {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'To create a support ticket, use the command:\n\n' +
        '/ticket "Your Subject" Your detailed message here\n\n' +
        'Example:\n/ticket "Booking Problem" "I cannot see my appointment for tomorrow"'
      );
    } catch (error) {
      console.error('Support create ticket action error:', error);
    }
  }

  async handleSupportMyTickets(ctx) {
    try {
      await ctx.answerCbQuery();
      const user = await this.getUser(ctx.from.id);
      const tickets = await this.supportService.getUserTickets(user.id, null, 3);

      if (tickets.length === 0) {
        await ctx.editMessageText('You have no support tickets. Use /ticket to create one.');
        return;
      }

      let message = `📊 *Your Recent Tickets:*\n\n`;
      tickets.forEach(ticket => {
        message += this.supportService.formatTicketForDisplay(ticket) + '\n';
      });

      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Support my tickets action error:', error);
    }
  }

  async handleSupportFAQ(ctx) {
    try {
      await ctx.answerCbQuery();
      const faqMessage = `
❓ *Frequently Asked Questions*

*Q: How do I book an appointment?*
A: Use the /book command and follow the steps.

*Q: How do I cancel my appointment?*
A: Use /cancel followed by your appointment ID.

*Q: How do I view my appointments?*
A: Use the /myappointments command.

*Q: How do I get support?*
A: Use /ticket to create a support ticket or /support for help.

*Q: How long does support take?*
A: We typically respond within 24 hours during business hours.

Need more help? Use /ticket to create a support ticket.
      `;

      await ctx.editMessageText(faqMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Support FAQ action error:', error);
    }
  }

  // Admin handlers
  async handleQuickApprove(ctx) {
    try {
      await ctx.answerCbQuery();
      
      if (ctx.from.id.toString() !== this.ADMIN_ID) {
        return;
      }
      
      const telegramId = ctx.match[1];
      const user = await User.findByTelegramId(telegramId);
      
      if (!user) {
        return ctx.reply(`❌ User ${telegramId} not found.`);
      }
      
      if (user.isApproved()) {
        return ctx.reply(`✅ User ${telegramId} is already approved.`);
      }
      
      await user.approve(this.ADMIN_ID);
      await this.referralCodeService.approveUser(telegramId);
      
      await ctx.reply(
        `✅ *Quick Approval Successful!*\n\n` +
        `User: ${user.first_name} ${user.last_name} (@${user.telegram_username || 'N/A'})\n` +
        `ID: \`${telegramId}\`\n\n` +
        `User has been notified and can now use the bot.`,
        { parse_mode: 'Markdown' }
      );
      
      await this.notifyUserApproval(user);
      
    } catch (error) {
      console.error('Quick approve error:', error);
      await ctx.reply('❌ Error approving user.');
    }
  }

  async handleQuickDeny(ctx) {
    try {
      await ctx.answerCbQuery();
      
      if (ctx.from.id.toString() !== this.ADMIN_ID) {
        return;
      }
      
      const telegramId = ctx.match[1];
      const user = await User.findByTelegramId(telegramId);
      
      if (!user) {
        return ctx.reply(`❌ User ${telegramId} not found.`);
      }
      
      if (user.isDenied()) {
        return ctx.reply(`❌ User ${telegramId} is already denied.`);
      }
      
      await user.deny(this.ADMIN_ID);
      await this.referralCodeService.denyUser(telegramId);
      
      await ctx.reply(
        `❌ *User Denied*\n\n` +
        `User: ${user.first_name} ${user.last_name} (@${user.telegram_username || 'N/A'})\n` +
        `ID: \`${telegramId}\`\n\n` +
        `User has been denied access.`,
        { parse_mode: 'Markdown' }
      );
      
      await this.notifyUserDenial(user);
      
    } catch (error) {
      console.error('Quick deny error:', error);
      await ctx.reply('❌ Error denying user.');
    }
  }

  // Helper methods
  async fallbackToBasicDateSelection(ctx) {
    const availableDates = this.bookingSlotService.getAvailableDates();
    
    if (availableDates.length === 0) {
      await ctx.editMessageText(
        '❌ No available dates for booking.\n\n' +
        `Business Hours: ${this.bookingSlotService.getBusinessHoursDisplay().full}`
      );
      return;
    }
    
    const dateButtons = availableDates.map(dateInfo => [
      Markup.button.callback(
        dateInfo.display,
        this.validator.createSafeCallbackData('date', [dateInfo.date])
      )
    ]);

    await ctx.editMessageText(
      `📅 Select a date for your appointment:\n\n` +
      `⏰ Business Hours: ${this.bookingSlotService.getBusinessHoursDisplay().hours}`,
      Markup.inlineKeyboard(dateButtons)
    );
  }

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

  async notifyUserApproval(user) {
    try {
      if (!user.telegram_id) return;
      
      const message = `
🎉 *Access Approved!*

Great news! Your access to Lodge Mobile Activations Bot has been approved.

*You can now:*
📅 /book - Book new appointments
📋 /myappointments - View your appointments
❌ /cancel - Cancel appointments
🎧 /support - Get support help
ℹ️ /help - Show all commands

Welcome to Lodge Mobile! Use /book to get started.
      `;
      
      await this.bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user about approval:', error);
    }
  }

  async notifyUserDenial(user) {
    try {
      if (!user.telegram_id) return;
      
      const message = `
❌ *Access Request Denied*

We're sorry, but your access request to Lodge Mobile Activations Bot has been denied.

If you believe this is an error or have questions, please contact support.
      `;
      
      await this.bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user about denial:', error);
    }
  }
}

module.exports = CallbackQueryHandler;