/**
 * Enhanced Callback Query Handler with Global Rule Compliance
 * Fixes critical violations in the original CallbackQueryHandler
 */

const { Markup } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../../models/User');
const Service = require('../../models/Service');
const Appointment = require('../../models/Appointment');
const bookingConfig = require('../../../config/booking.config');
const CallbackQueryManager = require('../utils/CallbackQueryManager');

class EnhancedCallbackQueryHandler {
  constructor(bot, services) {
    this.bot = bot;
    this.bookingSlotService = services.bookingSlotService;
    this.groupNotificationService = services.groupNotificationService;
    this.calendarUIManager = services.calendarUIManager;
    this.supportService = services.supportService;
    this.referralCodeService = services.referralCodeService;
    this.ADMIN_ID = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
    
    // Initialize callback query manager for compliance
    this.callbackManager = new CallbackQueryManager(bot);
    
    // Start periodic cleanup
    setInterval(() => {
      this.callbackManager.cleanupExpiredCallbacks();
    }, 60000); // Every minute
  }

  setupHandlers() {
    // Service selection handlers
    this.bot.action(/service_(\d+)/, (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleServiceSelection(ctx), 
        'service_selection'
      )
    );
    
    // Date selection handlers
    this.bot.action('select_date', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleDateSelectionTrigger(ctx), 
        'date_selection_trigger'
      )
    );
    
    this.bot.action(/date_(.+)/, (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleDateSelection(ctx), 
        'date_selection'
      )
    );
    
    this.bot.action('show_calendar', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleShowCalendar(ctx), 
        'show_calendar'
      )
    );
    
    // Time selection handlers
    this.bot.action(/time_(.+)/, (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleTimeSelection(ctx), 
        'time_selection'
      )
    );
    
    // Booking handlers
    this.bot.action('confirm_booking', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleBookingConfirmation(ctx), 
        'booking_confirmation'
      )
    );
    
    this.bot.action('cancel_booking', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleBookingCancellation(ctx), 
        'booking_cancellation'
      )
    );
    
    // Support handlers
    this.bot.action('support_create_ticket', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleSupportCreateTicket(ctx), 
        'support_create_ticket'
      )
    );
    
    this.bot.action('support_my_tickets', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleSupportMyTickets(ctx), 
        'support_my_tickets'
      )
    );
    
    this.bot.action('support_faq', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleSupportFAQ(ctx), 
        'support_faq'
      )
    );
    
    // Admin support handlers
    this.bot.action('admin_all_tickets', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleAdminAllTickets(ctx), 
        'admin_all_tickets'
      )
    );
    
    this.bot.action('admin_open_tickets', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleAdminOpenTickets(ctx), 
        'admin_open_tickets'
      )
    );
    
    this.bot.action('admin_support_stats', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleAdminSupportStats(ctx), 
        'admin_support_stats'
      )
    );
    
    this.bot.action('admin_urgent_tickets', (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleAdminUrgentTickets(ctx), 
        'admin_urgent_tickets'
      )
    );
    
    // User approval handlers
    this.bot.action(/approve_(.+)/, (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleQuickApprove(ctx), 
        'quick_approve'
      )
    );
    
    this.bot.action(/deny_(.+)/, (ctx) => 
      this.callbackManager.handleCallback(ctx, 
        (ctx) => this.handleQuickDeny(ctx), 
        'quick_deny'
      )
    );
  }

  async handleServiceSelection(ctx) {
    // Answer callback query first
    await this.callbackManager.answerCallback(ctx);
    
    const serviceId = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.booking = ctx.session.booking || {};
    ctx.session.booking.serviceId = serviceId;
    
    try {
      await this.calendarUIManager.showCalendar(ctx);
    } catch (error) {
      console.error('Service handler error:', error);
      await this.fallbackToBasicDateSelection(ctx);
    }
  }

  async handleDateSelectionTrigger(ctx) {
    await this.callbackManager.answerCallback(ctx);
    
    try {
      await this.calendarUIManager.showCalendar(ctx);
    } catch (error) {
      console.error('Date selection trigger error:', error);
      await this.fallbackToBasicDateSelection(ctx);
    }
  }

  async handleDateSelection(ctx) {
    await this.callbackManager.answerCallback(ctx, 'Loading available times...');
    
    const date = ctx.match[1];
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
    
    const timeButtons = this.createTimeButtons(slotInfo.slots);
    
    // Add navigation buttons with exit options (Rule 11 compliance)
    timeButtons.push([
      Markup.button.callback('← Back to dates', 'show_calendar'),
      Markup.button.callback('🏠 Main Menu', 'main_menu')
    ]);
    timeButtons.push([
      Markup.button.callback('❌ Cancel Booking', 'cancel_booking')
    ]);

    await ctx.editMessageText(
      `⏰ Available time slots for ${moment(date).format('MMM DD, YYYY')}:\n\n` +
      `📊 ${slotInfo.totalBooked}/${slotInfo.maxSlots} slots booked\n` +
      `✅ ${slotInfo.slotsRemaining} slots available\n\n` +
      'Select a time:',
      Markup.inlineKeyboard(timeButtons)
    );
  }

  createTimeButtons(slots) {
    const buttons = [];
    for (let i = 0; i < slots.length; i += 2) {
      const row = [];
      const slot1 = slots[i];
      
      // Validate callback data size (Rule 10 compliance)
      const callbackData1 = this.callbackManager.createSafeCallbackData('time', slot1.time24);
      row.push(Markup.button.callback(
        `${slot1.time12} - ${slot1.endTime}`,
        callbackData1
      ));
      
      if (slots[i + 1]) {
        const slot2 = slots[i + 1];
        const callbackData2 = this.callbackManager.createSafeCallbackData('time', slot2.time24);
        row.push(Markup.button.callback(
          `${slot2.time12} - ${slot2.endTime}`,
          callbackData2
        ));
      }
      buttons.push(row);
    }
    return buttons;
  }

  async handleTimeSelection(ctx) {
    await this.callbackManager.answerCallback(ctx, 'Preparing booking summary...');
    
    const time = ctx.match[1];
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

    // Create keyboard with clear navigation options (Rule 11 compliance)
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Confirm Booking', 'confirm_booking'),
        Markup.button.callback('📝 Edit Details', 'edit_booking')
      ],
      [
        Markup.button.callback('⏰ Change Time', 'show_calendar'),
        Markup.button.callback('🏠 Main Menu', 'main_menu')
      ],
      [
        Markup.button.callback('❌ Cancel Booking', 'cancel_booking')
      ]
    ]);

    await ctx.editMessageText(summary, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  }

  async handleShowCalendar(ctx) {
    await this.callbackManager.answerCallback(ctx);
    
    if (this.calendarUIManager) {
      await this.calendarUIManager.showCalendar(ctx);
    } else {
      await this.fallbackToBasicDateSelection(ctx);
    }
  }

  async handleBookingConfirmation(ctx) {
    await this.callbackManager.answerCallback(ctx, 'Processing your booking...');
    
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

    // Check if payment is required and not yet confirmed
    if (this.services?.paymentHandler?.moneroPayService?.isEnabled()) {
      if (!ctx.session?.paymentConfirmed) {
        // Create payment request
        const MoneroPayService = require('../../services/MoneroPayService');
        const moneroPayService = new MoneroPayService();

        try {
          const paymentData = await moneroPayService.createPaymentRequest(
            null, // appointmentId - will be set after payment
            user.id,
            `Lodge Mobile Appointment - ${booking.service || 'Service'}`
          );

          // Store payment info in session
          ctx.session.paymentId = paymentData.id;
          ctx.session.paymentAddress = paymentData.address;
          ctx.session.paymentConfirmed = false;

          // Generate payment message
          const paymentMessage = moneroPayService.generatePaymentMessage(paymentData);
          const qrUrl = moneroPayService.generateQrCodeUrl(
            paymentData.address,
            paymentData.amountXmr.replace('.', '')
          );

          await ctx.editMessageText(
            `💰 *Payment Required*\n\n` +
            `${paymentMessage}\n\n` +
            `_Once payment is confirmed, your appointment will be finalized._`,
            {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔍 Check Payment Status', `check_payment_${paymentData.id}`)],
                [Markup.button.callback('← Back', 'show_calendar')],
                [Markup.button.callback('🏠 Main Menu', 'start')]
              ]).reply_markup
            }
          );

          // Send QR code
          try {
            await ctx.replyWithPhoto(qrUrl, {
              caption: '📱 Scan this QR code with your Monero wallet to pay',
              parse_mode: 'Markdown'
            });
          } catch (photoError) {
            console.warn('Could not send QR code photo:', photoError);
          }

          return; // Don't create appointment yet
        } catch (paymentError) {
          console.error('Error creating payment:', paymentError);
          await ctx.reply(
            `❌ Error creating payment request: ${paymentError.message}\n\n` +
            `Please try again or contact support.`
          );
          return;
        }
      }
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

    // Create post-booking options keyboard (Rule 11 compliance)
    const postBookingKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📋 My Appointments', 'my_appointments'),
        Markup.button.callback('📞 Contact Support', 'support_main')
      ],
      [
        Markup.button.callback('🏠 Main Menu', 'main_menu')
      ]
    ]);

    await ctx.editMessageText(
      `✅ *Appointment Booked Successfully!*\n\n` +
      `📱 Service: ${booking.service || "Lodge Mobile Service"}\n` +
      `📅 Date: ${displayDateTime.date}\n` +
      `⏰ Time: ${displayDateTime.time}\n` +
      `🌎 Timezone: ${displayDateTime.timezone}\n\n` +
      `Appointment ID: \`${appointment.uuid}\`\n\n` +
      `Use /myappointments to view all your bookings.`,
      { 
        parse_mode: 'Markdown',
        reply_markup: postBookingKeyboard.reply_markup
      }
    );

    // Clear session state (Rule 11 compliance)
    ctx.session.booking = {};
    ctx.session.customerInfo = {};
    ctx.session.registration = {};
  }

  async handleBookingCancellation(ctx) {
    await this.callbackManager.answerCallback(ctx);
    
    ctx.session = ctx.session || {};
    ctx.session.booking = {};
    
    // Create options after cancellation (Rule 11 compliance)
    const cancelKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📅 Start New Booking', 'new_booking'),
        Markup.button.callback('📋 My Appointments', 'my_appointments')
      ],
      [
        Markup.button.callback('🏠 Main Menu', 'main_menu')
      ]
    ]);
    
    await ctx.editMessageText(
      'Booking cancelled. What would you like to do next?',
      cancelKeyboard
    );
  }

  // Support handlers with proper callback answering
  async handleSupportCreateTicket(ctx) {
    await this.callbackManager.answerCallback(ctx);
    await ctx.editMessageText(
      'To create a support ticket, use the command:\n\n' +
      '/ticket "Your Subject" Your detailed message here\n\n' +
      'Example:\n/ticket "Booking Problem" "I cannot see my appointment for tomorrow"'
    );
  }

  async handleSupportMyTickets(ctx) {
    await this.callbackManager.answerCallback(ctx, 'Loading your tickets...');
    
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
  }

  async handleSupportFAQ(ctx) {
    await this.callbackManager.answerCallback(ctx);
    
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
  }

  // Admin handlers with proper callback management
  async handleQuickApprove(ctx) {
    await this.callbackManager.answerCallback(ctx, 'Processing approval...');
    
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
  }

  async handleQuickDeny(ctx) {
    await this.callbackManager.answerCallback(ctx, 'Processing denial...');
    
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
        `date_${dateInfo.date}`
      )
    ]);

    // Add exit options (Rule 11 compliance)
    dateButtons.push([
      Markup.button.callback('🏠 Main Menu', 'main_menu'),
      Markup.button.callback('❌ Cancel', 'cancel_booking')
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

  /**
   * Get callback query statistics for monitoring
   */
  getStats() {
    return this.callbackManager.getStats();
  }
}

module.exports = EnhancedCallbackQueryHandler;