const { Telegraf, Markup, session } = require('telegraf');
const moment = require('moment-timezone');
const Calendar = require('telegraf-calendar-telegram');
const BookingService = require('../services/BookingService');
const AvailabilityService = require('../services/AvailabilityService');
const User = require('../models/User');
const Service = require('../models/Service');
const Appointment = require('../models/Appointment');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { AppError, ValidationError, NotFoundError } = require('../middleware/errorHandler');

class TelegramBot {
  constructor() {
    // Validate required environment variables
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
    }
    
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.calendar = new Calendar(this.bot);
    
    // Retry configuration for failed operations
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      backoffMultiplier: 2
    };
    
    // Timeout configuration
    this.timeoutConfig = {
      userResponse: 300000, // 5 minutes
      databaseQuery: 10000, // 10 seconds
      apiRequest: 15000 // 15 seconds
    };
    
    // Rate limiting configuration
    this.rateLimitConfig = {
      windowMs: 60000, // 1 minute window
      maxRequests: 30, // Max 30 requests per minute per user
      storage: new Map() // In production, use Redis
    };
    
    // Session configuration with proper storage and cleanup
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
        retryCount: 0
      })
    };
    
    // Apply session middleware with proper configuration
    this.bot.use(session(this.sessionConfig));
    
    // Session validation and cleanup middleware
    this.bot.use(this.sessionValidationMiddleware.bind(this));
    
    // Error handling middleware
    this.bot.use(this.errorHandlingMiddleware.bind(this));
    
    // Activity tracking middleware  
    this.bot.use(this.activityTrackingMiddleware.bind(this));
    
    // Setup global error handler BEFORE other setup
    this.setupGlobalErrorHandler();
    
    this.setupCommands();
    this.setupHandlers();
    
    // Setup session cleanup interval
    this.setupSessionCleanup();
    
    // Setup rate limiting cleanup
    this.setupRateLimitCleanup();
    
    logger.info('Telegram bot initialized', {
      retryConfig: this.retryConfig,
      timeoutConfig: this.timeoutConfig,
      rateLimitConfig: { ...this.rateLimitConfig, storage: 'Map instance' }
    });
  }
  
  /**
   * Setup global error handler for the bot
   */
  setupGlobalErrorHandler() {
    this.bot.catch(async (error, ctx) => {
      const errorId = Date.now().toString();
      const userId = ctx?.from?.id;
      const userName = ctx?.from?.username || ctx?.from?.first_name || 'Unknown';
      
      // Log the error with comprehensive context
      logger.error('Telegram bot global error', {
        errorId,
        userId,
        userName,
        error: error.message,
        stack: error.stack,
        updateType: ctx?.updateType,
        chatId: ctx?.chat?.id,
        messageText: ctx?.message?.text,
        callbackData: ctx?.callbackQuery?.data,
        sessionState: ctx?.session?.state,
        timestamp: new Date().toISOString(),
        errorCode: error.code,
        statusCode: error.statusCode
      });
      
      // Update session error tracking
      if (ctx?.session) {
        ctx.session.errors = ctx.session.errors || [];
        ctx.session.errors.push({
          errorId,
          timestamp: new Date().toISOString(),
          error: error.message,
          type: error.name || 'UnknownError'
        });
        
        // Clear session if too many errors
        if (ctx.session.errors.length > 10) {
          this.cleanupSession(ctx);
        }
      }
      
      // Send user-friendly error message
      const userErrorMessage = this.getUserFriendlyErrorMessage(error, errorId);
      
      try {
        if (ctx?.reply) {
          await ctx.reply(userErrorMessage);
        } else if (ctx?.editMessageText) {
          await ctx.editMessageText(userErrorMessage);
        }
      } catch (replyError) {
        logger.error('Failed to send error message to user', {
          errorId,
          userId,
          originalError: error.message,
          replyError: replyError.message
        });
      }
    });
  }
  
  /**
   * Get user-friendly error message based on error type
   */
  getUserFriendlyErrorMessage(error, errorId) {
    // Rate limiting errors
    if (error.code === 429 || error.message?.includes('Too Many Requests')) {
      return '⏳ You\'re sending requests too quickly. Please wait a moment and try again.';
    }
    
    // Database connection errors
    if (error.message?.includes('ECONNREFUSED') || 
        error.message?.includes('database') || 
        error.message?.includes('timeout')) {
      return '🔧 Our system is temporarily unavailable. Please try again in a few minutes.';
    }
    
    // Validation errors
    if (error.name === 'ValidationError' || error.statusCode === 400) {
      return '❌ Please check your input and try again. Make sure all required information is provided.';
    }
    
    // Authorization errors
    if (error.statusCode === 401 || error.statusCode === 403) {
      return '🔒 Access denied. Please restart the bot with /start.';
    }
    
    // Network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return '🌐 Network connection issue. Please check your internet connection and try again.';
    }
    
    // Telegram API errors
    if (error.code === 400) {
      return '📱 Message format error. Please try again or use /help for guidance.';
    }
    
    // Default error message
    return `❌ Something went wrong. If this problem continues, please contact support with error ID: ${errorId}`;
  }
  
  /**
   * Wrapper for operations with error handling
   */
  async withErrorHandling(operation, ctx, operationName = 'operation') {
    try {
      return await this.withTimeout(operation(), this.timeoutConfig.databaseQuery);
    } catch (error) {
      logger.error(`Error in ${operationName}`, {
        userId: ctx?.from?.id,
        error: error.message,
        stack: error.stack,
        operationName
      });
      throw error;
    }
  }
  
  /**
   * Wrapper for operations with retry logic
   */
  async withRetry(operation, maxRetries = this.retryConfig.maxRetries) {
    let lastError;
    let delay = this.retryConfig.retryDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on validation errors or user errors
        if (error.statusCode && error.statusCode < 500) {
          throw error;
        }
        
        // Don't retry on Telegram API errors that won't succeed
        if (error.code === 400 || error.code === 403) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          logger.warn(`Operation failed, retrying (${attempt}/${maxRetries})`, {
            error: error.message,
            attempt,
            delay
          });
          
          await this.sleep(delay);
          delay *= this.retryConfig.backoffMultiplier;
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Wrapper for operations with timeout
   */
  async withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
      )
    ]);
  }
  
  /**
   * Rate limiting check
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const userKey = `rate_limit:${userId}`;
    
    if (!this.rateLimitConfig.storage.has(userKey)) {
      this.rateLimitConfig.storage.set(userKey, {
        requests: 1,
        windowStart: now
      });
      return true;
    }
    
    const userData = this.rateLimitConfig.storage.get(userKey);
    
    // Reset window if expired
    if (now - userData.windowStart > this.rateLimitConfig.windowMs) {
      userData.requests = 1;
      userData.windowStart = now;
      return true;
    }
    
    // Check if within limits
    if (userData.requests >= this.rateLimitConfig.maxRequests) {
      return false;
    }
    
    userData.requests++;
    return true;
  }
  
  /**
   * Setup rate limit cleanup
   */
  setupRateLimitCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.rateLimitConfig.storage.entries()) {
        if (now - data.windowStart > this.rateLimitConfig.windowMs) {
          this.rateLimitConfig.storage.delete(key);
        }
      }
    }, this.rateLimitConfig.windowMs);
  }
  
  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      
      // Validate session structure
      if (!ctx.session.id || !ctx.session.createdAt) {
        ctx.session = { ...this.sessionConfig.defaultSession(), ...ctx.session };
      }
      
      // Session timeout check (24 hours)
      const sessionAge = Date.now() - new Date(ctx.session.createdAt).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (sessionAge > maxAge) {
        ctx.session = this.sessionConfig.defaultSession();
        await ctx.reply('Your session has expired. Please start over.');
        return;
      }
      
      // Reset error count on successful validation
      ctx.session.errors = [];
      ctx.session.retryCount = 0;
      
      await next();
    } catch (error) {
      console.error('Session validation error:', error);
      ctx.session = this.sessionConfig.defaultSession();
      await ctx.reply('Session error occurred. Starting fresh session.');
    }
  }
  
  /**
   * Enhanced error handling middleware with comprehensive logging
   */
  async errorHandlingMiddleware(ctx, next) {
    try {
      // Rate limiting check
      if (!this.checkRateLimit(ctx.from?.id)) {
        await ctx.reply('⏳ Too many requests. Please wait a moment before trying again.');
        return;
      }
      
      await next();
    } catch (error) {
      const errorId = `${ctx.from?.id}_${Date.now()}`;
      
      // Comprehensive error logging
      logger.error('Bot middleware error', {
        errorId,
        userId: ctx.from?.id,
        userName: ctx.from?.username,
        error: error.message,
        stack: error.stack,
        command: ctx.message?.text || ctx.callbackQuery?.data,
        updateType: ctx.updateType,
        chatType: ctx.chat?.type,
        sessionState: ctx.session?.state,
        timestamp: new Date().toISOString()
      });
      
      // Track error in session with more details
      if (ctx.session) {
        ctx.session.errors = ctx.session.errors || [];
        ctx.session.errors.push({
          errorId,
          timestamp: new Date().toISOString(),
          error: error.message,
          command: ctx.message?.text || ctx.callbackQuery?.data,
          state: ctx.session.state,
          type: error.name,
          code: error.code,
          statusCode: error.statusCode
        });
        
        // Keep only last 5 errors to prevent memory bloat
        if (ctx.session.errors.length > 5) {
          ctx.session.errors = ctx.session.errors.slice(-5);
        }
        
        ctx.session.retryCount = (ctx.session.retryCount || 0) + 1;
        
        // Clear corrupted session after too many errors
        if (ctx.session.retryCount > 5) {
          logger.warn('Session cleared due to too many errors', {
            userId: ctx.from?.id,
            errorCount: ctx.session.errors.length,
            retryCount: ctx.session.retryCount
          });
          
          ctx.session = this.sessionConfig.defaultSession();
          await ctx.reply('Too many errors occurred. Starting fresh session. Use /start to begin.');
          return;
        }
      }
      
      // Send user-friendly error message based on error type
      const userMessage = this.getUserFriendlyErrorMessage(error, errorId);
      
      try {
        await ctx.reply(userMessage);
      } catch (replyError) {
        logger.error('Failed to send error message', {
          errorId,
          userId: ctx.from?.id,
          originalError: error.message,
          replyError: replyError.message
        });
      }
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
   * Setup session cleanup interval
   */
  setupSessionCleanup() {
    // Clean expired sessions every 30 minutes
    setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const [key, session] of this.sessionConfig.store.entries()) {
        if (session?.createdAt) {
          const sessionAge = now - new Date(session.createdAt).getTime();
          if (sessionAge > maxAge) {
            this.sessionConfig.store.delete(key);
            console.log(`Cleaned expired session: ${key}`);
          }
        }
      }
    }, 30 * 60 * 1000); // 30 minutes
  }
  
  /**
   * Safe session initialization
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
   * Safe session cleanup
   */
  cleanupSession(ctx) {
    if (ctx.session) {
      // Clear conversation state but preserve user data
      ctx.session.booking = null;
      ctx.session.conversationContext = null;
      ctx.session.state = 'idle';
      ctx.session.waitingFor = null;
      ctx.session.errors = [];
      ctx.session.retryCount = 0;
      ctx.session.lastActivity = new Date().toISOString();
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

  setupCommands() {
    // Start command with comprehensive error handling
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

        await this.withErrorHandling(
          () => ctx.replyWithMarkdown(welcomeMessage),
          ctx,
          'send welcome message'
        );

        // Register user if not exists
        await this.withErrorHandling(
          () => this.registerUser(ctx),
          ctx,
          'register user'
        );
        
        logger.info('User started bot', {
          userId: ctx.from.id,
          userName: ctx.from.username,
          firstName: ctx.from.first_name
        });
        
      } catch (error) {
        await this.handleCommandError(ctx, error, 'start command');
      }
    });

    // Book appointment command with error handling
    this.bot.command('book', async (ctx) => {
      try {
        this.initializeSession(ctx, 'booking');
        ctx.session.booking = {
          startedAt: new Date().toISOString(),
          step: 'category_selection'
        };

        await this.withErrorHandling(
          () => ctx.reply('Let\'s book an appointment! First, select a service category:',
            Markup.inlineKeyboard([
              [Markup.button.callback('🏥 Medical', 'category_medical')],
              [Markup.button.callback('💅 Beauty', 'category_beauty')],
              [Markup.button.callback('🦷 Dental', 'category_dental')],
              [Markup.button.callback('💆 Wellness', 'category_wellness')],
              [Markup.button.callback('🏋️ Fitness', 'category_fitness')],
              [Markup.button.callback('📚 Consultation', 'category_consultation')],
            ])
          ),
          ctx,
          'show booking categories'
        );
        
        logger.info('User started booking process', {
          userId: ctx.from.id,
          sessionId: ctx.session.id
        });
        
      } catch (error) {
        await this.handleCommandError(ctx, error, 'book command');
      }
    });

    // Help command with error handling
    this.bot.command('help', async (ctx) => {
      try {
        const helpMessage = `
*🤖 Appointment Bot Help*

*Basic Commands:*
• /start - Start the bot
• /book - Book new appointment
• /myappointments - View appointments
• /cancel [ID] - Cancel appointment
• /reschedule [ID] - Change appointment time
• /profile - View/edit profile

*Booking Process:*
1️⃣ Choose service category
2️⃣ Select specific service
3️⃣ Pick a provider
4️⃣ Choose date from calendar
5️⃣ Select available time slot
6️⃣ Confirm booking

*Tips:*
• Appointments can be cancelled up to 24 hours before
• You'll receive reminders 24h and 2h before appointment
• Keep your phone number updated for SMS reminders

*Need Support?*
Contact @support or call 1-800-APPOINTMENT
        `;
        
        await this.withErrorHandling(
          () => ctx.replyWithMarkdown(helpMessage),
          ctx,
          'send help message'
        );
        
      } catch (error) {
        await this.handleCommandError(ctx, error, 'help command');
      }
    });

    // My appointments command with comprehensive error handling
    this.bot.command('myappointments', async (ctx) => {
      const user = await this.getUser(ctx.from.id);
      if (!user) {
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
        return ctx.reply('You have no upcoming appointments. Use /book to schedule one!');
      }

      let message = '*📅 Your Upcoming Appointments:*\n\n';
      appointments.forEach((apt, index) => {
        const date = moment(apt.scheduledStart).format('MMM DD, YYYY');
        const time = moment(apt.scheduledStart).format('HH:mm');
        const status = apt.status === 'confirmed' ? '✅' : '⏳';

        message += `${index + 1}. ${status} *${apt.service.name}*\n`;
        message += `   📆 ${date} at ${time}\n`;
        message += `   👤 ${apt.provider.firstName} ${apt.provider.lastName}\n`;
        message += `   🆔 ID: \`${apt.uuid}\`\n\n`;
      });

      message += '_Use /cancel or /reschedule with the appointment ID to manage._';

      await ctx.replyWithMarkdown(message);
    });

    // Cancel appointment command
    this.bot.command('cancel', async (ctx) => {
      const args = ctx.message.text.split(' ');

      if (args.length < 2) {
        return ctx.reply('Please provide the appointment ID. Example: /cancel ABC123');
      }

      const appointmentId = args[1];
      const user = await this.getUser(ctx.from.id);

      try {
        const appointment = await Appointment.query()
          .where('uuid', appointmentId)
          .where('clientId', user.id)
          .first();

        if (!appointment) {
          return ctx.reply('Appointment not found or you don\'t have permission to cancel it.');
        }

        // Cancel the appointment
        await appointment.$query().patch({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: user.id,
          cancellationReason: 'Cancelled via Telegram'
        });
        
        logger.logAppointmentAction('cancel', appointmentId, user.id, {
          method: 'telegram',
          hoursInAdvance: hoursUntilAppointment
        });
        
        await ctx.reply(`✅ Appointment ${appointmentId} has been cancelled successfully.`);
        
      } catch (error) {
        await this.handleCommandError(ctx, error, 'cancel command');
      }
    });

    // Profile command with error handling
    this.bot.command('profile', async (ctx) => {
      try {
        const user = await this.withErrorHandling(
          () => this.getUser(ctx.from.id),
          ctx,
          'get user profile'
        );
        
        if (!user) {
          return await ctx.reply('Please start the bot first with /start');
        }
        
        const profileMessage = `
👤 *Your Profile*

Name: ${user.first_name} ${user.last_name}
Email: ${user.email}
Phone: ${user.phone || 'Not set'}
Role: ${user.role}
Timezone: ${user.timezone}
Notifications: ${user.preferences?.notificationTelegram ? '🔔 Enabled' : '🔕 Disabled'}

Use the buttons below to update your information:
        `;
        
        await this.withErrorHandling(
          () => ctx.replyWithMarkdown(profileMessage, 
            Markup.inlineKeyboard([
              [Markup.button.callback('📱 Update Phone', 'update_phone')],
              [Markup.button.callback('🔔 Toggle Notifications', 'toggle_notifications')],
              [Markup.button.callback('🌍 Change Timezone', 'change_timezone')]
            ])
          ),
          ctx,
          'send profile information'
        );
        
      } catch (error) {
        await this.handleCommandError(ctx, error, 'profile command');
      }
    });

    // Provider availability command with error handling
    this.bot.command('availability', async (ctx) => {
      try {
        const user = await this.withErrorHandling(
          () => this.getUser(ctx.from.id),
          ctx,
          'get user for availability'
        );
        
        if (!user) {
          return await ctx.reply('Please start the bot first with /start');
        }
        
        if (user.role !== 'provider') {
          return await ctx.reply('This command is only available for service providers.');
        }

        await this.withErrorHandling(
          () => ctx.reply('Set your availability schedule:', 
            Markup.inlineKeyboard([
              [Markup.button.callback('📅 Set Weekly Schedule', 'set_weekly_schedule')],
              [Markup.button.callback('🚫 Add Day Off', 'add_day_off')],
              [Markup.button.callback('⏰ Special Hours', 'set_special_hours')],
              [Markup.button.callback('📊 View Current Schedule', 'view_schedule')]
            ])
          ),
          ctx,
          'show availability options'
        );
        
      } catch (error) {
        await this.handleCommandError(ctx, error, 'availability command');
      }
    });
  }
  
  /**
   * Handle command errors with comprehensive logging
   */
  async handleCommandError(ctx, error, commandName) {
    logger.error(`Error in ${commandName}`, {
      userId: ctx?.from?.id,
      userName: ctx?.from?.username,
      error: error.message,
      stack: error.stack,
      command: commandName,
      sessionState: ctx?.session?.state
    });
    
    try {
      const errorMessage = this.getUserFriendlyErrorMessage(error, Date.now().toString());
      await ctx.reply(errorMessage);
    } catch (replyError) {
      logger.error('Failed to send command error message', {
        originalError: error.message,
        replyError: replyError.message,
        userId: ctx?.from?.id,
        commandName
      });
    }
  }

  // Provider commands
    this.bot.command('availability', async (ctx) => {
      const user = await this.getUser(ctx.from.id);

      if (!user || user.role !== 'provider') {
        return ctx.reply('This command is only available for service providers.');
      }

      ctx.reply('Set your availability schedule:',
        Markup.inlineKeyboard([
          [Markup.button.callback('📅 Set Weekly Schedule', 'set_weekly_schedule')],
          [Markup.button.callback('🚫 Add Day Off', 'add_day_off')],
          [Markup.button.callback('⏰ Special Hours', 'set_special_hours')],
          [Markup.button.callback('📊 View Current Schedule', 'view_schedule')],
        ]),
      );
    });
  }

  setupHandlers() {
    // Handle category selection
    this.bot.action(/category_(.+)/, async (ctx) => {
      const category = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.category = category;

      // Answer callback to remove loading state
      await ctx.answerCbQuery();

      // Get services for category
      const services = await Service.query()
        .where('category', category)
        .where('isActive', true)
        .limit(10);

      if (services.length === 0) {
        return ctx.reply('No services available in this category. Please try another.');
      }

      const buttons = services.map(service => [
        Markup.button.callback(
          `${service.name} - $${service.price}`,
          `service_${service.id}`,
        ),
      ]);

      await ctx.editMessageText('Select a service:',
        Markup.inlineKeyboard(buttons),
      );
    });

    // Handle service selection
    this.bot.action(/service_(\d+)/, async (ctx) => {
      const serviceId = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.serviceId = serviceId;

      await ctx.answerCbQuery();

      const service = await Service.query()
        .findById(serviceId)
        .withGraphFetched('provider');

      ctx.session.booking.providerId = service.providerId;

      await ctx.editMessageText(
        `Selected: *${service.name}*\n` +
        `Provider: ${service.provider.firstName} ${service.provider.lastName}\n` +
        `Duration: ${service.duration} minutes\n` +
        `Price: $${service.price}\n\n` +
        'Now, select a date:',
        {
          parse_mode: 'Markdown',
          reply_markup: this.calendar.getCalendar(),
        },
      );
    });

    // Handle calendar date selection specifically
    this.bot.action(/^calendar/, async (ctx) => {
      const res = this.calendar.clickButtonCalendar(ctx.callbackQuery);

      if (res && res !== -1) {
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.date = moment(res).format('YYYY-MM-DD');

        // Get available slots - simplified for now
        // In production, you'd use the AvailabilityService
        const slots = await this.getSimpleAvailableSlots(
          ctx.session.booking.providerId,
          ctx.session.booking.date,
          ctx.session.booking.serviceId,
        );

        if (slots.length === 0) {
          return ctx.reply('No available slots on this date. Please select another date.');
        }

        const buttons = slots.map(slot => [
          Markup.button.callback(slot, `slot_${slot}`),
        ]);

        await ctx.editMessageText(
          `Available time slots for ${ctx.session.booking.date}:`,
          Markup.inlineKeyboard(buttons),
        );
      }
    });

    // Handle time slot selection
    this.bot.action(/slot_(.+)/, async (ctx) => {
      const timeSlot = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.time = timeSlot;

      await ctx.answerCbQuery();

      // Show booking summary
      const service = await Service.query()
        .findById(ctx.session.booking.serviceId)
        .withGraphFetched('provider');

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
            Markup.button.callback('❌ Cancel', 'cancel_booking'),
          ],
        ]),
      });
    });

    // Handle booking confirmation
    this.bot.action('confirm_booking', async (ctx) => {
      await ctx.answerCbQuery();
      const user = await this.getUser(ctx.from.id);
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking || {};

      try {
        const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm');

        // Create appointment directly
        const appointment = await Appointment.query().insert({
          uuid: require('uuid').v4(),
          clientId: user.id,
          providerId: parseInt(booking.providerId),
          serviceId: parseInt(booking.serviceId),
          scheduledStart: dateTime.toDate(),
          scheduledEnd: moment(dateTime).add(30, 'minutes').toDate(),
          status: 'scheduled',
          notes: 'Booked via Telegram',
        });

        await ctx.editMessageText(
          '✅ *Appointment Booked Successfully!*\n\n' +
          `Your appointment ID: \`${appointment.uuid}\`\n` +
          `Date: ${booking.date}\n` +
          `Time: ${booking.time}\n\n` +
          'You\'ll receive a confirmation and reminders.\n' +
          'Use /myappointments to view all your bookings.',
          { parse_mode: 'Markdown' },
        );

        // Clear session
        ctx.session.booking = {};
      } catch (error) {
        await ctx.reply(`❌ Booking failed: ${error.message}`);
      }
    });

    // Handle booking cancellation
    this.bot.action('cancel_booking', async (ctx) => {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      await ctx.editMessageText('Booking cancelled. Use /book to start over.');
    });

    // Handle text messages
    this.bot.on('text', async (ctx) => {
      // Check if user is in a conversation flow
      if (ctx.session && ctx.session.waitingFor) {
        await this.handleConversationInput(ctx);
      } else {
        await ctx.reply('I didn\'t understand that. Use /help to see available commands.');
      }
    });
  }

  async registerUser(ctx) {
    const telegramUser = ctx.from;

    // Check if user exists
    let user = await User.query()
      .where('telegram_id', telegramUser.id.toString())
      .first();

    if (!user) {
      // Create new user
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
          reminderHours: [24, 2],
        },
        is_active: true,
        email_verified: true,
      });
      
      logger.info('New Telegram user registered', {
        userId: user.id,
        telegramId: telegramUser.id,
        firstName: user.first_name
      });
    }

    return user;
    
  } catch (error) {
    logger.error('Error registering Telegram user', {
      telegramId: ctx?.from?.id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

  /**
   * Get user with error handling and validation
   */
  async getUser(telegramId) {
    try {
      if (!telegramId) {
        throw new ValidationError('Telegram ID is required');
      }
      
      return await this.withRetry(async () => {
        return await User.query()
          .where('telegram_id', telegramId.toString())
          .first()
          .timeout(this.timeoutConfig.databaseQuery);
      });
      
    } catch (error) {
      logger.error('Error fetching user', {
        telegramId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle conversation input with comprehensive error handling
   */
  async handleConversationInput(ctx) {
    try {
      const waitingFor = ctx.session?.waitingFor;
      const input = ctx.message?.text;
      
      if (!input) {
        return await ctx.reply('Please provide text input.');
      }

      switch (waitingFor) {
        case 'phone_number': {
          // Validate phone number format
          if (!/^\+?[1-9]\d{1,14}$/.test(input.trim())) {
            return await ctx.reply('Invalid phone number. Please enter a valid phone number with country code (e.g., +1234567890).');
          }
          
          const user = await this.withErrorHandling(
            () => this.getUser(ctx.from.id),
            ctx,
            'get user for phone update'
          );
          
          if (!user) {
            return await ctx.reply('Please start the bot first with /start');
          }
          
          await this.withRetry(async () => {
            return await User.query()
              .findById(user.id)
              .patch({ phone: input.trim() })
              .timeout(this.timeoutConfig.databaseQuery);
          });
          
          ctx.session.waitingFor = null;
          
          logger.info('Phone number updated', {
            userId: user.id,
            phoneLength: input.trim().length
          });
          
          await ctx.reply('✅ Phone number updated successfully!');
          break;
        }

        default:
          await ctx.reply('Please use the buttons or commands to interact with the bot.');
      }
      
    } catch (error) {
      await this.handleCommandError(ctx, error, 'conversation input handling');
    }
  }

  /**
   * Send notification with comprehensive error handling
   */
  async sendNotification(userId, message) {
    try {
      if (!userId || !message) {
        throw new ValidationError('User ID and message are required for notifications');
      }
      
      const user = await this.withRetry(async () => {
        return await User.query()
          .findById(userId)
          .timeout(this.timeoutConfig.databaseQuery);
      });
      
      if (!user || !user.telegram_id) {
        logger.warn('Cannot send notification - user not found or no telegram ID', {
          userId,
          userFound: !!user,
          hasTelegramId: !!user?.telegram_id
        });
        return false;
      }
      
      // Check if user has telegram notifications enabled
      if (user.preferences?.notificationTelegram === false) {
        logger.info('Telegram notifications disabled for user', { userId });
        return false;
      }
      
      await this.withRetry(async () => {
        return await this.withTimeout(
          this.bot.telegram.sendMessage(user.telegram_id, message, {
            parse_mode: 'Markdown'
          }),
          this.timeoutConfig.apiRequest
        );
      });
      
      logger.logNotificationSent(
        `telegram_${Date.now()}`,
        'telegram',
        user.telegram_id,
        'sent'
      );
      
      return true;
      
    } catch (error) {
      logger.error('Failed to send Telegram notification', {
        userId,
        error: error.message,
        errorCode: error.code,
        stack: error.stack
      });
      
      // Don't throw error for notification failures as they're not critical
      return false;
    }
  }

  /**
   * Generate available time slots with comprehensive error handling and business logic
   */
  async getSimpleAvailableSlots(providerId, date, serviceId) {
    try {
      if (!providerId || !date || !serviceId) {
        throw new ValidationError('Provider ID, date, and service ID are required');
      }
      
      // Validate date format
      const dateObj = moment(date, 'YYYY-MM-DD', true);
      if (!dateObj.isValid()) {
        throw new ValidationError('Invalid date format');
      }
      
      // Check if it's a weekend (simple business hours logic)
      const dayOfWeek = dateObj.day(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Weekend - limited hours or closed
        logger.logAvailabilityCheck(providerId, date, 0);
        return [];
      }
      
      // Get existing appointments for this provider on this date
      const existingAppointments = await this.withRetry(async () => {
        const startOfDay = moment(date).startOf('day').toDate();
        const endOfDay = moment(date).endOf('day').toDate();
        
        return await Appointment.query()
          .where('providerId', providerId)
          .where('scheduledStart', '>=', startOfDay)
          .where('scheduledStart', '<=', endOfDay)
          .where('status', 'in', ['scheduled', 'confirmed'])
          .select('scheduledStart', 'scheduledEnd')
          .timeout(this.timeoutConfig.databaseQuery);
      });
      
      // Generate time slots from 9 AM to 5 PM
      const allSlots = [];
      for (let hour = 9; hour < 17; hour++) {
        allSlots.push(`${hour.toString().padStart(2, '0')}:00`);
        allSlots.push(`${hour.toString().padStart(2, '0')}:30`);
      }
      
      // Filter out occupied slots
      const availableSlots = allSlots.filter(slot => {
        const slotTime = moment(`${date} ${slot}`, 'YYYY-MM-DD HH:mm');
        
        // Check if slot conflicts with existing appointments
        return !existingAppointments.some(apt => {
          const aptStart = moment(apt.scheduledStart);
          const aptEnd = moment(apt.scheduledEnd);
          
          // Check if slot overlaps with appointment
          return slotTime.isBetween(aptStart, aptEnd, 'minute', '[)');
        });
      });
      
      logger.logAvailabilityCheck(providerId, date, availableSlots.length);
      
      return availableSlots;
      
    } catch (error) {
      logger.error('Error generating available slots', {
        providerId,
        date,
        serviceId,
        error: error.message
      });
      
      // Return empty array on error rather than throwing
      return [];
    }
  }

  /**
   * Send appointment reminder with comprehensive error handling
   */
  async sendReminder(appointment) {
    try {
      if (!appointment || !appointment.clientId || !appointment.scheduledStart) {
        throw new ValidationError('Invalid appointment data for reminder');
      }
      
      // Validate appointment time
      const appointmentTime = moment(appointment.scheduledStart);
      if (!appointmentTime.isValid()) {
        throw new ValidationError('Invalid appointment time');
      }
      
      // Check if appointment is in the future
      if (appointmentTime.isBefore(moment())) {
        logger.warn('Attempted to send reminder for past appointment', {
          appointmentId: appointment.uuid,
          scheduledTime: appointment.scheduledStart
        });
        return false;
      }
      
      const message = `
🔔 *Appointment Reminder*

You have an appointment:
📅 Date: ${appointmentTime.format('MMM DD, YYYY')}
⏰ Time: ${appointmentTime.format('HH:mm')}
🏥 Service: ${appointment.service?.name || 'Service'}
👤 Provider: ${appointment.provider?.firstName || 'Provider'} ${appointment.provider?.lastName || ''}

Appointment ID: \`${appointment.uuid}\`

_Reply CONFIRM to confirm, or use /myappointments to manage._
      `;

      const success = await this.sendNotification(appointment.clientId, message);
      
      if (success) {
        logger.info('Appointment reminder sent', {
          appointmentId: appointment.uuid,
          clientId: appointment.clientId,
          reminderTime: new Date().toISOString()
        });
      }
      
      return success;
      
    } catch (error) {
      logger.error('Error sending appointment reminder', {
        appointmentId: appointment?.uuid,
        clientId: appointment?.clientId,
        error: error.message,
        stack: error.stack
      });
      
      return false;
    }
  }

  /**
   * Start bot with comprehensive error handling
   */
  start() {
    try {
      // Configure launch options
      const launchOptions = {};
      
      // Configure webhook if URL is provided
      if (process.env.TELEGRAM_WEBHOOK_URL) {
        launchOptions.webhook = {
          domain: process.env.TELEGRAM_WEBHOOK_URL,
          port: parseInt(process.env.TELEGRAM_WEBHOOK_PORT) || 3001,
        };
        logger.info('Starting Telegram bot with webhook', {
          domain: process.env.TELEGRAM_WEBHOOK_URL,
          port: launchOptions.webhook.port
        });
      } else {
        logger.info('Starting Telegram bot with polling');
      }
      
      // Add timeout for bot operations
      if (this.timeoutConfig.apiRequest) {
        launchOptions.timeout = this.timeoutConfig.apiRequest;
      }
      
      // Start bot
      this.bot.launch(launchOptions);

      logger.info('Telegram bot started successfully', {
        mode: process.env.TELEGRAM_WEBHOOK_URL ? 'webhook' : 'polling',
        retryConfig: this.retryConfig,
        timeoutConfig: this.timeoutConfig
      });
      
      // Setup process error handlers
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection in Telegram bot', {
          reason: reason?.message || reason,
          stack: reason?.stack,
          promise: promise.toString()
        });
      });
      
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception in Telegram bot', {
          error: error.message,
          stack: error.stack
        });
        
        // Graceful shutdown on critical errors
        this.stop('CRITICAL_ERROR');
        process.exit(1);
      });
      
      // Enable graceful stop
      process.once('SIGINT', () => {
        logger.info('Received SIGINT, shutting down Telegram bot gracefully');
        this.stop('SIGINT');
      });
      
      process.once('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down Telegram bot gracefully');
        this.stop('SIGTERM');
      });
      
    } catch (error) {
      logger.error('Failed to start Telegram bot', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Stop bot gracefully with error handling
   */
  stop(reason = 'MANUAL') {
    try {
      logger.info('Stopping Telegram bot', { reason });
      this.bot.stop(reason);
    } catch (error) {
      logger.error('Error stopping Telegram bot', {
        error: error.message,
        reason
      });
    }
  }
  
  // Legacy start method for backward compatibility
  legacyStart() {
    // Start bot with polling
    this.bot.launch({
      webhook: process.env.TELEGRAM_WEBHOOK_URL ? {
        domain: process.env.TELEGRAM_WEBHOOK_URL,
        port: process.env.TELEGRAM_WEBHOOK_PORT || 3001,
      } : undefined,
    });

    // Telegram bot started successfully
    // In production, use proper logging

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = TelegramBot;