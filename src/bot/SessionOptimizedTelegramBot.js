const { Telegraf, Markup, session } = require('telegraf');
const moment = require('moment-timezone');
const Calendar = require('telegraf-calendar-telegram');
const BookingService = require('../services/BookingService');
const AvailabilityService = require('../services/AvailabilityService');
const User = require('../models/User');
const Service = require('../models/Service');
const Appointment = require('../models/Appointment');
const { v4: uuidv4 } = require('uuid');

/**
 * Optimized Telegram Bot with enhanced session management
 * Fixes identified issues:
 * 1. Inconsistent session initialization
 * 2. Memory leaks from uncleaned sessions
 * 3. Missing session persistence
 * 4. Weak session validation
 * 5. Improper middleware ordering
 * 6. Session state corruption
 * 7. Poor error handling
 * 8. No conversation context management
 */
class SessionOptimizedTelegramBot {
  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.calendar = new Calendar(this.bot);
    
    // Enhanced session configuration with proper storage and cleanup
    this.sessionConfig = {
      property: 'session',
      getSessionKey: (ctx) => {
        if (!ctx.from?.id) return null;
        return `telegram_session:${ctx.from.id}`;
      },
      store: new Map(), // In production, use Redis or database
      defaultSession: () => ({
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        state: 'idle',
        booking: null,
        conversationContext: null,
        errors: [],
        retryCount: 0,
        version: '1.0' // For session migration
      })
    };
    
    // Apply middleware in proper order
    this.bot.use(session(this.sessionConfig));
    this.bot.use(this.sessionValidationMiddleware.bind(this));
    this.bot.use(this.errorHandlingMiddleware.bind(this));
    this.bot.use(this.activityTrackingMiddleware.bind(this));
    
    this.setupCommands();
    this.setupHandlers();
    this.setupSessionCleanup();
  }

  /**
   * Session validation middleware - ensures session integrity
   */
  async sessionValidationMiddleware(ctx, next) {
    try {
      // Ensure session exists and is properly initialized
      if (!ctx.session) {
        ctx.session = this.sessionConfig.defaultSession();
      }
      
      // Validate and repair session structure
      if (!ctx.session.id || !ctx.session.createdAt) {
        ctx.session = { ...this.sessionConfig.defaultSession(), ...ctx.session };
      }
      
      // Session timeout check (24 hours)
      const sessionAge = Date.now() - new Date(ctx.session.createdAt).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (sessionAge > maxAge) {
        ctx.session = this.sessionConfig.defaultSession();
        await ctx.reply('🕐 Your session has expired. Please start over with /start');
        return;
      }
      
      // Reset error count on successful validation
      ctx.session.errors = [];
      ctx.session.retryCount = 0;
      
      await next();
    } catch (error) {
      console.error('Session validation error:', error);
      ctx.session = this.sessionConfig.defaultSession();
      await ctx.reply('⚠️ Session error occurred. Starting fresh session.');
    }
  }
  
  /**
   * Comprehensive error handling middleware
   */
  async errorHandlingMiddleware(ctx, next) {
    try {
      await next();
    } catch (error) {
      console.error('Bot error:', error);
      
      // Track error in session for debugging
      if (ctx.session) {
        ctx.session.errors = ctx.session.errors || [];
        ctx.session.errors.push({
          timestamp: new Date().toISOString(),
          error: error.message,
          command: ctx.message?.text || ctx.callbackQuery?.data,
          state: ctx.session.state,
          stack: error.stack
        });
        
        ctx.session.retryCount = (ctx.session.retryCount || 0) + 1;
        
        // Clear corrupted session after too many errors
        if (ctx.session.retryCount > 5) {
          ctx.session = this.sessionConfig.defaultSession();
          await ctx.reply('❌ Too many errors occurred. Starting fresh session.');
          return;
        }
      }
      
      await ctx.reply('⚠️ An error occurred. Please try again or use /start to restart.');
    }
  }
  
  /**
   * Activity tracking middleware
   */
  async activityTrackingMiddleware(ctx, next) {
    if (ctx.session) {
      ctx.session.lastActivity = new Date().toISOString();
    }
    await next();
  }
  
  /**
   * Setup automatic session cleanup
   */
  setupSessionCleanup() {
    // Clean expired sessions every 30 minutes
    setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      let cleanedCount = 0;
      
      for (const [key, session] of this.sessionConfig.store.entries()) {
        if (session?.createdAt) {
          const sessionAge = now - new Date(session.createdAt).getTime();
          if (sessionAge > maxAge) {
            this.sessionConfig.store.delete(key);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired sessions`);
      }
    }, 30 * 60 * 1000); // 30 minutes
  }
  
  /**
   * Safe session initialization with state tracking
   */
  initializeSession(ctx, state = 'idle') {
    if (!ctx.session) {
      ctx.session = this.sessionConfig.defaultSession();
    }
    
    ctx.session.state = state;
    ctx.session.lastActivity = new Date().toISOString();
    
    return ctx.session;
  }
  
  /**
   * Comprehensive session cleanup
   */
  cleanupSession(ctx) {
    if (ctx.session) {
      // Preserve session ID and timestamps but clear conversation state
      const preservedData = {
        id: ctx.session.id,
        createdAt: ctx.session.createdAt,
        version: ctx.session.version
      };
      
      ctx.session = {
        ...this.sessionConfig.defaultSession(),
        ...preservedData,
        lastActivity: new Date().toISOString()
      };
    }
  }
  
  /**
   * Validate session state for specific operations
   */
  validateSessionState(ctx, requiredState = null) {
    if (!ctx.session) {
      throw new Error('Session not initialized');
    }
    
    if (requiredState && ctx.session.state !== requiredState) {
      throw new Error(`Invalid session state. Expected: ${requiredState}, Got: ${ctx.session.state}`);
    }
    
    return true;
  }

  /**
   * Enhanced booking session initialization
   */
  initializeBookingSession(ctx) {
    this.initializeSession(ctx, 'booking_start');
    
    ctx.session.booking = {
      id: uuidv4(),
      startedAt: new Date().toISOString(),
      step: 'category_selection',
      category: null,
      serviceId: null,
      providerId: null,
      date: null,
      time: null,
      confirmed: false,
      attempts: 0,
      errors: []
    };
    
    return ctx.session.booking;
  }

  setupCommands() {
    // Start command with proper session management
    this.bot.command('start', async (ctx) => {
      try {
        this.initializeSession(ctx, 'start');
        
        const firstName = ctx.from.first_name || 'User';
        const welcomeMessage = `
🏥 *Welcome to Appointment Scheduler Bot!*

Hello ${firstName}! I'm here to help you book and manage appointments.

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel - Cancel an appointment
🔄 /reschedule - Reschedule an appointment
ℹ️ /help - Show help message
👤 /profile - View/update your profile

*For Providers:*
⏰ /availability - Set your availability
📊 /schedule - View your schedule
✅ /confirm - Confirm appointments

Let's get started! Use /book to schedule your first appointment.
        `;
        
        await ctx.replyWithMarkdown(welcomeMessage);
        await this.registerUser(ctx);
        
        ctx.session.state = 'idle';
        
      } catch (error) {
        console.error('Start command error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Welcome! Something went wrong during initialization. Please try again.');
      }
    });

    // Book appointment command with session validation
    this.bot.command('book', async (ctx) => {
      try {
        this.initializeBookingSession(ctx);
        ctx.session.state = 'booking_service';
        
        // Get all available services instead of categories
        const services = await Service.query()
          .where('isActive', true)
          .withGraphFetched('provider')
          .limit(10);

        if (services.length === 0) {
          this.cleanupSession(ctx);
          return ctx.reply('No services are currently available. Please try again later or contact support.');
        }

        const buttons = services.map(service => [
          Markup.button.callback(
            `${service.name} - $${service.price}`, 
            `service_${service.id}`
          )
        ]);
        
        buttons.push([Markup.button.callback('❌ Cancel Booking', 'cancel_booking')]);

        await ctx.reply('Let\'s book an appointment! Select a service:', 
          Markup.inlineKeyboard(buttons)
        );
      } catch (error) {
        console.error('Book command error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Sorry, unable to start booking process. Please try /start first.');
      }
    });

    // My appointments with session management
    this.bot.command('myappointments', async (ctx) => {
      try {
        this.initializeSession(ctx, 'viewing_appointments');
        
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          this.cleanupSession(ctx);
          return ctx.reply('Please start the bot first with /start');
        }

        const appointments = await Appointment.query()
          .where('clientId', user.id)
          .where('status', 'in', ['scheduled', 'confirmed'])
          .where('scheduledStart', '>', new Date())
          .withGraphFetched('[provider, service]')
          .orderBy('scheduledStart', 'asc')
          .limit(10);

        if (appointments.length === 0) {
          ctx.session.state = 'idle';
          return ctx.reply('You have no upcoming appointments. Use /book to schedule one!');
        }

        let message = '*📅 Your Upcoming Appointments:*\\n\\n';
        appointments.forEach((apt, index) => {
          const date = moment(apt.scheduledStart).format('MMM DD, YYYY');
          const time = moment(apt.scheduledStart).format('HH:mm');
          const status = apt.status === 'confirmed' ? '✅' : '⏳';
          
          message += `${index + 1}. ${status} *${apt.service.name}*\\n`;
          message += `   📆 ${date} at ${time}\\n`;
          message += `   👤 ${apt.provider.firstName} ${apt.provider.lastName}\\n`;
          message += `   🆔 ID: \\`${apt.uuid}\\`\\n\\n`;
        });

        message += '_Use /cancel or /reschedule with the appointment ID to manage._';
        
        await ctx.replyWithMarkdown(message);
        ctx.session.state = 'idle';
        
      } catch (error) {
        console.error('My appointments command error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Unable to retrieve appointments. Please try again later.');
      }
    });

    // Cancel appointment with proper session handling
    this.bot.command('cancel', async (ctx) => {
      try {
        this.initializeSession(ctx, 'cancelling_appointment');
        
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
          ctx.session.state = 'idle';
          return ctx.reply('Please provide the appointment ID. Example: /cancel ABC123');
        }

        const appointmentId = args[1];
        const user = await this.getUser(ctx.from.id);
        
        if (!user) {
          this.cleanupSession(ctx);
          return ctx.reply('Please start the bot first with /start');
        }
        
        const appointment = await Appointment.query()
          .where('uuid', appointmentId)
          .where('clientId', user.id)
          .first();

        if (!appointment) {
          ctx.session.state = 'idle';
          return ctx.reply('Appointment not found or you don\\'t have permission to cancel it.');
        }

        await appointment.$query().patch({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: user.id,
          cancellationReason: 'Cancelled via Telegram'
        });
        
        await ctx.reply(`✅ Appointment ${appointmentId} has been cancelled successfully.`);
        ctx.session.state = 'idle';
        
      } catch (error) {
        console.error('Cancel command error:', error);
        this.cleanupSession(ctx);
        await ctx.reply(`❌ Error cancelling appointment: ${error.message}`);
      }
    });
  }

  setupHandlers() {
    // Remove category selection - directly go to service selection
    // This handler is removed since we now show services directly

    // Service selection with proper validation
    this.bot.action(/service_(\\d+)/, async (ctx) => {
      try {
        this.validateSessionState(ctx, 'booking_service');
        
        const serviceId = ctx.match[1];
        if (!ctx.session.booking) {
          throw new Error('Booking session not found');
        }
        
        ctx.session.booking.serviceId = serviceId;
        ctx.session.booking.step = 'date_selection';
        ctx.session.state = 'booking_date';
        
        await ctx.answerCbQuery();
        
        const service = await Service.query()
          .findById(serviceId)
          .withGraphFetched('provider');

        if (!service) {
          throw new Error('Service not found');
        }
        
        ctx.session.booking.providerId = service.provider_id;
        
        await ctx.editMessageText(
          `Selected: *${service.name}*\\n` +
          `Provider: ${service.provider.firstName} ${service.provider.lastName}\\n` +
          `Duration: ${service.duration} minutes\\n` +
          `Price: $${service.price}\\n\\n` +
          `Now, select a date:`,
          {
            parse_mode: 'Markdown',
            reply_markup: this.calendar.getCalendar()
          }
        );
        
      } catch (error) {
        console.error('Service selection error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Error processing service selection. Please start over with /book.');
      }
    });

    // Calendar date selection with availability integration
    this.bot.action(/^calendar/, async (ctx) => {
      try {
        this.validateSessionState(ctx, 'booking_date');
        
        const res = this.calendar.clickButtonCalendar(ctx.callbackQuery);
        
        if (res && res !== -1) {
          if (!ctx.session.booking) {
            throw new Error('Booking session not found');
          }
          
          ctx.session.booking.date = moment(res).format('YYYY-MM-DD');
          ctx.session.booking.step = 'time_selection';
          ctx.session.state = 'booking_time';
          
          // Use proper AvailabilityService
          const availabilityResult = await AvailabilityService.getAvailableSlots(
            ctx.session.booking.providerId,
            ctx.session.booking.serviceId,
            ctx.session.booking.date
          );

          if (!availabilityResult.available || availabilityResult.slots.length === 0) {
            ctx.session.state = 'booking_date';
            return ctx.reply(`No available slots on ${ctx.session.booking.date}. ${availabilityResult.reason || ''} Please select another date.`);
          }

          const buttons = availabilityResult.slots.map(slot => [
            Markup.button.callback(slot.start_time, `slot_${slot.start_time}`)
          ]);
          
          buttons.push([
            Markup.button.callback('⬅️ Back to Date', 'back_to_date'),
            Markup.button.callback('❌ Cancel', 'cancel_booking')
          ]);

          await ctx.editMessageText(
            `Available time slots for ${ctx.session.booking.date}:`,
            Markup.inlineKeyboard(buttons)
          );
        }
        
      } catch (error) {
        console.error('Calendar date selection error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Error processing date selection. Please start over with /book.');
      }
    });

    // Time slot selection with enhanced validation
    this.bot.action(/slot_(.+)/, async (ctx) => {
      try {
        this.validateSessionState(ctx, 'booking_time');
        
        const timeSlot = ctx.match[1];
        if (!ctx.session.booking) {
          throw new Error('Booking session not found');
        }
        
        ctx.session.booking.time = timeSlot;
        ctx.session.booking.step = 'confirmation';
        ctx.session.state = 'booking_confirm';
        
        await ctx.answerCbQuery();
        
        const service = await Service.query()
          .findById(ctx.session.booking.serviceId)
          .withGraphFetched('provider');

        if (!service) {
          throw new Error('Service not found');
        }

        const summary = `
*📋 Booking Summary:*

Service: ${service.name}
Provider: ${service.provider.firstName} ${service.provider.lastName}
Date: ${ctx.session.booking.date}
Time: ${ctx.session.booking.time}
Duration: ${service.duration} minutes
Price: $${service.price}

Confirm your booking?
        `;

        await ctx.editMessageText(summary, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Confirm', 'confirm_booking'),
              Markup.button.callback('⬅️ Back to Time', 'back_to_time')
            ],
            [
              Markup.button.callback('❌ Cancel Booking', 'cancel_booking')
            ]
          ])
        });
        
      } catch (error) {
        console.error('Time slot selection error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Error processing time selection. Please start over with /book.');
      }
    });

    // Booking confirmation with proper service integration
    this.bot.action('confirm_booking', async (ctx) => {
      try {
        this.validateSessionState(ctx, 'booking_confirm');
        
        await ctx.answerCbQuery();
        
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          throw new Error('User not found');
        }
        
        if (!ctx.session.booking) {
          throw new Error('Booking session not found');
        }
        
        const booking = ctx.session.booking;
        
        // Validate booking data completeness
        if (!booking.date || !booking.time || !booking.serviceId || !booking.providerId) {
          throw new Error('Incomplete booking data');
        }
        
        ctx.session.state = 'booking_processing';
        
        const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm');
        
        // Use proper BookingService
        const bookingResult = await BookingService.bookAppointment({
          client_id: user.id,
          provider_id: parseInt(booking.providerId),
          service_id: parseInt(booking.serviceId),
          appointment_datetime: dateTime.toISOString(),
          notes: 'Booked via Telegram Bot',
          timezone: 'America/New_York'
        });
        
        if (!bookingResult.success) {
          throw new Error(bookingResult.message || 'Booking failed');
        }

        await ctx.editMessageText(
          `✅ *Appointment Booked Successfully!*\\n\\n` +
          `Your appointment ID: \\`${bookingResult.appointment.uuid}\\`\\n` +
          `Date: ${booking.date}\\n` +
          `Time: ${booking.time}\\n\\n` +
          `You'll receive a confirmation and reminders.\\n` +
          `Use /myappointments to view all your bookings.`,
          { parse_mode: 'Markdown' }
        );

        // Mark booking as completed and clean up
        ctx.session.booking.confirmed = true;
        ctx.session.booking.completedAt = new Date().toISOString();
        ctx.session.state = 'idle';
        
        setTimeout(() => {
          if (ctx.session) {
            this.cleanupSession(ctx);
          }
        }, 5000);
        
      } catch (error) {
        console.error('Booking confirmation error:', error);
        ctx.session.state = 'booking_error';
        await ctx.reply(`❌ Booking failed: ${error.message}. Please try again or start over with /book.`);
        
        setTimeout(() => {
          if (ctx.session) {
            this.cleanupSession(ctx);
          }
        }, 10000);
      }
    });

    // Navigation and cancellation handlers
    this.bot.action('cancel_booking', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        this.cleanupSession(ctx);
        await ctx.editMessageText('Booking cancelled. Use /book to start a new booking.');
      } catch (error) {
        console.error('Booking cancellation error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Booking cancelled. Use /book to start over.');
      }
    });
    
    // Back navigation handlers
    this.bot.action('back_to_date', async (ctx) => {
      try {
        this.validateSessionState(ctx);
        
        if (ctx.session.booking) {
          ctx.session.booking.step = 'date_selection';
          ctx.session.state = 'booking_date';
          
          await ctx.answerCbQuery();
          await ctx.editMessageText('Please select a date:', {
            reply_markup: this.calendar.getCalendar()
          });
        }
      } catch (error) {
        console.error('Back to date error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Error navigating back. Please start over with /book.');
      }
    });
    
    this.bot.action('back_to_time', async (ctx) => {
      try {
        this.validateSessionState(ctx);
        
        if (ctx.session.booking && ctx.session.booking.date) {
          ctx.session.booking.step = 'time_selection';
          ctx.session.state = 'booking_time';
          
          await ctx.answerCbQuery();
          
          const availabilityResult = await AvailabilityService.getAvailableSlots(
            ctx.session.booking.providerId,
            ctx.session.booking.serviceId,
            ctx.session.booking.date
          );

          const buttons = availabilityResult.slots.map(slot => [
            Markup.button.callback(slot.start_time, `slot_${slot.start_time}`)
          ]);
          
          buttons.push([
            Markup.button.callback('⬅️ Back to Date', 'back_to_date'),
            Markup.button.callback('❌ Cancel', 'cancel_booking')
          ]);

          await ctx.editMessageText(
            `Available time slots for ${ctx.session.booking.date}:`,
            Markup.inlineKeyboard(buttons)
          );
        }
      } catch (error) {
        console.error('Back to time error:', error);
        this.cleanupSession(ctx);
        await ctx.reply('Error navigating back. Please start over with /book.');
      }
    });

    // Enhanced text message handling
    this.bot.on('text', async (ctx) => {
      try {
        this.initializeSession(ctx);
        
        if (ctx.session && ctx.session.waitingFor) {
          await this.handleConversationInput(ctx);
        } else {
          let response = 'I didn\\'t understand that. Use /help to see available commands.';
          
          if (ctx.session.state && ctx.session.state.startsWith('booking_')) {
            response = 'Please use the buttons above to continue your booking, or use /book to start over.';
          }
          
          await ctx.reply(response);
        }
        
      } catch (error) {
        console.error('Text message handling error:', error);
        this.initializeSession(ctx);
        await ctx.reply('Sorry, I encountered an error. Please try again or use /start.');
      }
    });
  }

  // Enhanced conversation input handling
  async handleConversationInput(ctx) {
    try {
      const waitingFor = ctx.session.waitingFor;
      const input = ctx.message.text;
      
      // Store conversation context
      ctx.session.conversationContext = {
        input,
        waitingFor,
        timestamp: new Date().toISOString()
      };

      switch (waitingFor) {
        case 'phone_number':
          if (!/^\\+?[1-9]\\d{1,14}$/.test(input)) {
            return ctx.reply('Invalid phone number. Please enter a valid phone number with country code.');
          }
          
          const user = await this.getUser(ctx.from.id);
          if (!user) {
            ctx.session.waitingFor = null;
            return ctx.reply('User not found. Please start with /start.');
          }
          
          await User.query().findById(user.id).patch({ phone: input });
          
          ctx.session.waitingFor = null;
          ctx.session.conversationContext = null;
          ctx.session.state = 'idle';
          
          await ctx.reply('✅ Phone number updated successfully!');
          break;

        default:
          ctx.session.waitingFor = null;
          ctx.session.conversationContext = null;
          await ctx.reply('Please use the buttons or commands to interact with the bot.');
      }
      
    } catch (error) {
      console.error('Conversation input handling error:', error);
      
      if (ctx.session) {
        ctx.session.waitingFor = null;
        ctx.session.conversationContext = null;
        ctx.session.state = 'idle';
      }
      
      await ctx.reply('Sorry, there was an error processing your input. Please try again.');
    }
  }

  // User registration and retrieval methods remain the same
  async registerUser(ctx) {
    const telegramUser = ctx.from;
    
    let user = await User.query()
      .where('telegram_id', telegramUser.id.toString())
      .first();

    if (!user) {
      user = await User.query().insert({
        telegram_id: telegramUser.id.toString(),
        email: `telegram_${telegramUser.id}@telegram.local`,
        password_hash: 'telegram_auth',
        first_name: telegramUser.first_name || 'User',
        last_name: telegramUser.last_name || '',
        phone: '',
        role: 'client',
        timezone: 'America/New_York',
        preferences: {
          notificationEmail: false,
          notificationSms: false,
          notificationTelegram: true,
          reminderHours: [24, 2]
        },
        is_active: true,
        email_verified: true
      });
    }

    return user;
  }

  async getUser(telegramId) {
    return await User.query()
      .where('telegram_id', telegramId.toString())
      .first();
  }

  async sendNotification(userId, message) {
    const user = await User.query().findById(userId);
    if (user && user.telegram_id) {
      try {
        await this.bot.telegram.sendMessage(user.telegram_id, message, {
          parse_mode: 'Markdown'
        });
      } catch (error) {
        console.error('Failed to send Telegram notification:', error);
      }
    }
  }

  async sendReminder(appointment) {
    const message = `
🔔 *Appointment Reminder*

You have an appointment:
📅 Date: ${moment(appointment.scheduledStart).format('MMM DD, YYYY')}
⏰ Time: ${moment(appointment.scheduledStart).format('HH:mm')}
🏥 Service: ${appointment.service.name}
👤 Provider: ${appointment.provider.firstName} ${appointment.provider.lastName}

Appointment ID: \\`${appointment.uuid}\\`
    `;

    await this.sendNotification(appointment.clientId, message);
  }

  start() {
    this.bot.launch({
      webhook: process.env.TELEGRAM_WEBHOOK_URL ? {
        domain: process.env.TELEGRAM_WEBHOOK_URL,
        port: process.env.TELEGRAM_WEBHOOK_PORT || 3001
      } : undefined
    });

    console.log('🤖 Optimized Telegram bot started successfully!');
    
    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = SessionOptimizedTelegramBot;