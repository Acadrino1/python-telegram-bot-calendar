/**
 * Enhanced Bot Engine - Performance Optimized Telegram Bot
 * Integrates all performance components with the existing bot architecture
 */

const MemoryManager = require('./MemoryManager');
const EnhancedSessionManager = require('./EnhancedSessionManager');
const FixedCallbackQueryHandler = require('./FixedCallbackQueryHandler');
const DatabaseOptimizer = require('./DatabaseOptimizer');
const PerformanceMonitor = require('../../utils/monitoring/PerformanceMonitor');
const RateLimiterMiddleware = require('../../middleware/performance/RateLimiterMiddleware');
const MemoryOptimizer = require('../../bot/utils/MemoryOptimizer');
const AuthMiddleware = require('../../bot/middleware/AuthMiddleware');
const MessageHandler = require('../../bot/handlers/MessageHandler');

const { Telegraf, session } = require('telegraf');
const path = require('path');

class EnhancedBotEngine extends MemoryManager {
  constructor(services = {}, options = {}) {
    super(options.memory);
    
    this.config = {
      enablePerformanceMonitoring: options.enablePerformanceMonitoring !== false,
      enableRateLimiting: options.enableRateLimiting !== false,
      enableSessionManagement: options.enableSessionManagement !== false,
      enableDatabaseOptimization: options.enableDatabaseOptimization !== false,
      enableCallbackOptimization: options.enableCallbackOptimization !== false,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      ...options
    };
    
    this.services = services;
    this.isStarted = false;
    this.stopped = false;
    
    // Initialize performance components
    this.initializePerformanceComponents();
    
    // Initialize memory optimizer
    this.initializeMemoryOptimizer();
    
    // Initialize Telegraf bot
    this.initializeBot();
    
    // Setup performance integrations
    this.setupPerformanceIntegrations();
    
    console.log('✅ EnhancedBotEngine initialized with performance optimizations');
  }

  /**
   * Initialize memory optimizer with cleanup tasks
   */
  initializeMemoryOptimizer() {
    // Realistic thresholds for Node.js + Telegraf + MySQL + Redis
    this.memoryOptimizer = new MemoryOptimizer({
      maxMemoryMB: this.config.memory?.maxMemoryMB || 150,
      warningThresholdMB: this.config.memory?.warningThresholdMB || 100,
      criticalThresholdMB: this.config.memory?.criticalThresholdMB || 130,
      cleanupIntervalMs: 300000, // 5 minutes instead of 1
      enableAutoCleanup: true,
      enableGarbageCollection: true
    });

    // Register cleanup tasks
    this.registerMemoryCleanupTasks();
    
    console.log('🧹 Memory optimizer initialized');
  }

  /**
   * Register memory cleanup tasks
   */
  registerMemoryCleanupTasks() {
    // Session cleanup
    if (this.sessionManager) {
      this.memoryOptimizer.registerCleanupTask(
        'session-cleanup',
        async () => {
          const cleaned = await this.sessionManager.cleanExpiredSessions();
          console.log(`🧹 Cleaned ${cleaned} expired sessions`);
        },
        'high'
      );
    }

    // Callback handler cleanup
    if (this.callbackHandler && typeof this.callbackHandler.clearAll === 'function') {
      this.memoryOptimizer.registerCleanupTask(
        'callback-cleanup',
        async () => {
          this.callbackHandler.clearAll();
          console.log('🧹 Cleared callback handler cache');
        },
        'normal'
      );
    }

    // Performance monitor cleanup
    if (this.performanceMonitor) {
      this.memoryOptimizer.registerCleanupTask(
        'performance-cleanup',
        async () => {
          // Clear old metrics
          this.performanceMonitor.cleanup();
          console.log('🧹 Cleaned performance metrics');
        },
        'low'
      );
    }

    // Database connection pool cleanup
    if (this.databaseOptimizer) {
      this.memoryOptimizer.registerCleanupTask(
        'database-cleanup',
        async () => {
          // This would clean up database connection pools if needed
          console.log('🧹 Database cleanup completed');
        },
        'normal'
      );
    }

    console.log('📝 Memory cleanup tasks registered');
  }

  /**
   * Initialize performance components
   */
  initializePerformanceComponents() {
    console.log('🚀 Initializing performance components...');
    
    // Performance monitoring
    if (this.config.enablePerformanceMonitoring) {
      this.performanceMonitor = new PerformanceMonitor({
        monitoringInterval: 15000, // 15 seconds
        memoryThreshold: 30, // 30MB warning
        enableAlerts: true
      });
      
      // Listen for performance alerts
      this.performanceMonitor.on('alert', (alert) => {
        this.handlePerformanceAlert(alert);
      });
    }
    
    // Session management - longer TTL to allow form completion
    if (this.config.enableSessionManagement) {
      this.sessionManager = new EnhancedSessionManager({
        maxSessions: 1000,
        sessionTTL: 2 * 60 * 60 * 1000, // 2 hours - allows time to complete forms
        persistentStorage: true,
        autoSave: true
      });
    }
    
    // Rate limiting
    if (this.config.enableRateLimiting) {
      this.rateLimiter = new RateLimiterMiddleware({
        userLimit: 20,
        globalLimit: 100,
        enableBlacklist: true
      });
    }
    
    // Database optimization
    if (this.config.enableDatabaseOptimization) {
      this.databaseOptimizer = new DatabaseOptimizer({
        poolMin: 2,
        poolMax: 10,
        enableQueryCache: true,
        enableMonitoring: true
      });
      
      // Initialize optimized database connection
      this.setupOptimizedDatabase();
    }
    
    // Callback query optimization with fixed consolidated handler
    if (this.config.enableCallbackOptimization) {
      this.callbackHandler = new FixedCallbackQueryHandler(this.services, {
        enableLogging: true,
        autoAnswer: true
      });
      // Make callbackHandler available in services for MessageHandler to use
      this.services.callbackHandler = this.callbackHandler;
      // Make bookingHandler available for coupon code processing in MessageHandler
      this.services.bookingHandler = this.callbackHandler.bookingHandler;
      // Make completionHandler available for proof photo uploads
      this.services.completionHandler = this.callbackHandler.completionHandler;
      // Make bulkUploadHandler available for document uploads
      this.services.bulkUploadHandler = this.callbackHandler.bulkUploadHandler;
    }
  }

  /**
   * Initialize Telegraf bot
   */
  initializeBot() {
    if (!this.config.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    
    this.bot = new Telegraf(this.config.botToken);
    
    // Setup error handling
    this.bot.catch((error, ctx) => {
      console.error('❌ Bot error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        userId: ctx?.from?.id,
        chatId: ctx?.chat?.id,
        updateType: ctx?.updateType,
        callbackQuery: ctx?.callbackQuery?.data
      });
      this.handleBotError(error, ctx);
    });
    
    console.log('✅ Telegraf bot initialized');
  }

  /**
   * Setup performance integrations
   */
  setupPerformanceIntegrations() {
    // Integrate rate limiting middleware
    if (this.rateLimiter) {
      this.bot.use(this.rateLimiter.middleware());
      console.log('✅ Rate limiting integrated');
    }

    // Integrate performance monitoring middleware
    if (this.performanceMonitor) {
      this.bot.use(async (ctx, next) => {
        const startTime = Date.now();

        // Track request
        this.performanceMonitor.incrementCounter('requests');

        try {
          await next();
          this.performanceMonitor.incrementCounter('responses');
        } catch (error) {
          this.performanceMonitor.incrementCounter('errors');
          throw error;
        } finally {
          // Track response time
          const endTime = Date.now();
          this.performanceMonitor.trackResponseTime(startTime, endTime);
        }
      });

      console.log('✅ Performance monitoring integrated');
    }

    // PRIVACY: Redirect ALL group interactions to private DM
    this.bot.use(async (ctx, next) => {
      // Only intercept messages/commands in groups, not callback queries
      if ((ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') && ctx.message) {
        // Check if it's a command (starts with /)
        const messageText = ctx.message.text || '';
        if (messageText.startsWith('/')) {
          try {
            const botInfo = await ctx.telegram.getMe();
            const userName = ctx.from?.first_name || 'there';
            await ctx.reply(
              `Welcome to Lodge Mobile, ${userName}!\n\n` +
              `We help you get approved for Telus device financing with a simple registration process.\n\n` +
              `What we offer:\n` +
              `- Easy device financing approval\n` +
              `- Quick registration process\n` +
              `- Appointment reminders\n\n` +
              `All bookings are handled exclusively through the Lodge Scheduler bot. Tap the button below to begin.`,
              {
                reply_markup: {
                  inline_keyboard: [[
                    { text: 'Start booking now', url: `https://t.me/${botInfo.username}` }
                  ]]
                }
              }
            );
          } catch (err) {
            console.error('Error sending group redirect:', err.message);
          }
          return; // Don't process the command in group
        }
      }
      return next();
    });
    console.log('✅ Group privacy middleware integrated - commands redirect to DM');

    // Use Telegraf's built-in session when custom session management is disabled
    // This is more reliable for multi-step forms
    if (!this.sessionManager) {
      // Use simple in-memory session - persists for the lifetime of the bot process
      // This is the key to making the 13-step form work reliably
      const sessions = new Map();

      // Store reference for debugging
      this.sessions = sessions;

      this.bot.use(async (ctx, next) => {
        const key = ctx.from?.id;
        if (key) {
          // Get existing session or create empty one
          if (!sessions.has(key)) {
            sessions.set(key, {});
            console.log(`🆕 Created new session for user ${key}`);
          }
          ctx.session = sessions.get(key);

          // Log session state before processing
          const hasReg = !!ctx.session.registration;
          const step = ctx.session.registration?.step;
          const hasBulk = !!ctx.session.bulkUpload;
          const bulkActive = ctx.session.bulkUpload?.active;
          console.log(`📦 Session loaded for ${key}: hasRegistration=${hasReg}, step=${step || 'none'}, bulkUpload=${hasBulk}, bulkActive=${bulkActive || 'none'}`);

          try {
            await next();
          } finally {
            // Session is already a reference to the Map value, so changes are persisted
            // But let's be explicit about it
            sessions.set(key, ctx.session);
            console.log(`💾 Session saved for ${key}: registration=${!!ctx.session.registration}, bulkUpload=${!!ctx.session.bulkUpload}`);
          }
        } else {
          return next();
        }
      });

      console.log('✅ Simple in-memory session middleware integrated (reliable for forms)');
    }

    // Integrate custom session management with deduplication and PERSISTENCE
    if (this.sessionManager) {
      const sessionManager = this.sessionManager;

      this.bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        if (userId) {
          // Get or create unique session for user
          let sessionObj = await sessionManager.getUserLatestSession(userId);

          if (!sessionObj) {
            // Create new session only if none exists
            const sessionId = await sessionManager.createSession(userId, {
              userId: userId,
              created: Date.now(),
              lastActivity: Date.now()
            });
            sessionObj = await sessionManager.getSession(sessionId);
          }

          // Set session data on context
          ctx.session = sessionObj?.data || {};
          ctx.sessionId = sessionObj?.id;

          // Store reference for post-processing
          ctx._sessionObj = sessionObj;
        }

        try {
          await next();
        } finally {
          // CRITICAL: Save session changes back to storage after request completes
          if (ctx.sessionId && ctx.session && sessionManager) {
            try {
              // Merge the modified ctx.session back into the session store
              await sessionManager.updateSession(ctx.sessionId, ctx.session);
            } catch (saveError) {
              console.error('⚠️ Failed to save session:', saveError.message);
            }
          }
        }
      });

      console.log('✅ Session management integrated with deduplication and persistence');
    }

    // Attach authentication middleware after sessions are wired
    this.setupAuthMiddleware();

    // Setup callback query handling
    if (this.callbackHandler) {
      this.callbackHandler.setupHandlers(this.bot);
      console.log('✅ Callback query optimization integrated');
    }

    // Setup message handler for documents, photos, etc.
    this.messageHandler = new MessageHandler(this.bot, this.services);
    this.messageHandler.setupHandlers();
    console.log('✅ Message handler integrated (documents, photos, etc.)');
  }

  /**
   * Attach approval-aware authentication middleware
   */
  setupAuthMiddleware() {
    if (this.authMiddlewareConfigured || !this.bot) {
      return;
    }

    const authOptions = {
      adminIds: this.services.adminIds || [],
      ADMIN_ID: this.services.ADMIN_ID || process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '',
      exemptCommands: ['start', 'help', 'request', 'invite'],
      requireApproval: true
    };

    this.bot.use(AuthMiddleware.create(authOptions));
    this.authMiddlewareConfigured = true;
    console.log('✅ Auth middleware integrated - new users require admin approval');
  }

  /**
   * Setup optimized database connection
   */
  setupOptimizedDatabase() {
    try {
      const dbClient = process.env.DB_CLIENT || 'sqlite3';
      let databaseConfig;

      if (dbClient === 'mysql2') {
        // Use MySQL when running in Docker
        databaseConfig = {
          client: 'mysql2',
          connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'appuser',
            password: process.env.DB_PASSWORD || (() => {
              throw new Error('DB_PASSWORD environment variable is required for MySQL');
            })(),
            database: process.env.DB_NAME || 'appointment_scheduler'
          },
          pool: { min: 2, max: 10 }
        };
      } else {
        // Use SQLite for local development
        const dbPath = path.join(process.cwd(), 'database', 'test_lodge_scheduler.sqlite3');
        databaseConfig = {
          client: 'sqlite3',
          connection: { filename: dbPath },
          useNullAsDefault: true
        };
      }

      const knex = this.databaseOptimizer.initializeConnection(databaseConfig);

      // Make optimized database available to services
      if (this.services) {
        this.services.knex = knex;
        this.services.database = this.databaseOptimizer;
      }

      console.log('✅ Optimized database connection established');

    } catch (error) {
      console.error('❌ Database optimization failed:', error);
    }
  }

  /**
   * Setup bot commands and handlers
   */
  setupCommands() {
    // Start command with performance tracking
    this.bot.start(async (ctx) => {
      const startTime = Date.now();

      try {
        if (this.performanceMonitor) {
          this.performanceMonitor.incrementCounter('commands');
        }

        // PRIVACY: Redirect group chats to private DM
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
          const botInfo = await ctx.telegram.getMe();
          await ctx.reply(
            `🔒 *Private Conversation Required*\n\n` +
            `For your privacy, please message me directly to book appointments.\n\n` +
            `👉 [Start Private Chat](https://t.me/${botInfo.username}?start=book)`,
            {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );
          return;
        }

        // Register or get user with session management
        const user = await this.registerUser(ctx);

        if (!user) {
          // User blocked by geo/character restrictions - message already sent
          return;
        }

        // Check if user is admin (bypass approval check)
        const adminId = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
        const isUserAdmin = ctx.from.id.toString() === adminId || user.role === 'admin';

        // CRITICAL: Check approval status before showing full menu (admin bypasses)
        if (!isUserAdmin && (!user.isApproved || (typeof user.isApproved === 'function' && !user.isApproved()))) {
          // Check if pending or denied
          const isPending = user.isPending ? (typeof user.isPending === 'function' ? user.isPending() : user.isPending) :
                           (user.approval_status === 'pending');
          const isDenied = user.isDenied ? (typeof user.isDenied === 'function' ? user.isDenied() : user.isDenied) :
                          (user.approval_status === 'denied');

          if (isDenied) {
            await ctx.reply(
              '❌ *Access Denied*\n\n' +
              'Your access request has been denied.\n\n' +
              'If you believe this is an error, please contact support.',
              { parse_mode: 'Markdown' }
            );
            return;
          }

          // User is pending approval
          await ctx.reply(
            '🔒 *Access Pending*\n\n' +
            'Your access request is pending admin approval.\n\n' +
            '*Available Commands:*\n' +
            '• /request - Check request status\n' +
            '• /invite [code] - Use referral code\n' +
            '• /help - Show help\n\n' +
            'You\'ll be notified when approved!',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Check for deep link payload (e.g., /start book)
        const payload = ctx.startPayload;
        if (payload === 'book') {
          // User came from announcement - go straight to new registration
          ctx.session = ctx.session || {};
          ctx.session.booking = ctx.session.booking || {};
          console.log('📊 Deep link: NEW REGISTRATION via ?start=book');
          await ctx.reply(
            `*Lodge Mobile: New Registration*\n\n` +
            `How many customers are you registering?\n\n` +
            `*Single Registration:*\n` +
            `Register one customer step-by-step (13 fields)\n\n` +
            `*Bulk Upload:*\n` +
            `Register multiple customers via Excel file (max 20)`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Single Registration', callback_data: 'reg_mode_single' }],
                  [{ text: 'Bulk Upload (Multiple)', callback_data: 'reg_mode_bulk' }],
                  [{ text: 'Download Template', callback_data: 'bulk_download_template' }],
                  [{ text: 'Back to Services', callback_data: 'book' }]
                ]
              }
            }
          );
          return;
        } else if (payload === 'services') {
          // Show service selection
          console.log('📊 Deep link: SERVICE SELECTION via ?start=services');
          await ctx.reply(
            '📅 *Lodge Scheduler Services*\n\nPlease select one of the following service options:',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🆕 New Registration', callback_data: 'service_lodge_mobile_new_registration' }],
                  [{ text: '📱 SIM Card Activation', callback_data: 'service_lodge_mobile_simcard_activation' }],
                  [{ text: '🔧 Technical Support', callback_data: 'service_lodge_mobile_technical_support' }],
                  [{ text: '📲 Upgrade Device', callback_data: 'service_lodge_mobile_upgrade_device' }]
                ]
              }
            }
          );
          return;
        } else if (payload === 'support') {
          // Show support menu
          console.log('📊 Deep link: SUPPORT MENU via ?start=support');
          await ctx.reply(
            `💬 *Support Center*\n\nHow can we help you today?\n\nChoose an option below:`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎫 Create Ticket', callback_data: 'support_create_ticket' }],
                  [{ text: '📋 My Tickets', callback_data: 'support_my_tickets' }],
                  [{ text: '💱 Get Monero', callback_data: 'support_get_monero' }],
                  [{ text: '❓ FAQ', callback_data: 'support_faq' }],
                  [{ text: '← Back to Menu', callback_data: 'main_menu' }]
                ]
              }
            }
          );
          return;
        }

        // Normal start - show welcome menu (user is approved)
        await ctx.reply(
          '🏠 *Welcome to Lodge Mobile Activations!* 📱\n\n' +
          '*Available Services:*\n' +
          '📱 New Registration\n' +
          '💳 SIM Card Activation\n' +
          '🛠️ Technical Support\n' +
          '📲 Device Upgrade\n\n' +
          '*Quick Commands:*\n' +
          '📅 /book - Book an appointment\n' +
          '📋 /myappointments - View your bookings\n' +
          '❌ /cancel - Cancel a booking\n' +
          '🎧 /support - Get help\n\n' +
          '_Select an option below to get started:_',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Book Appointment', callback_data: 'book' }],
                [{ text: '📋 My Appointments', callback_data: 'my_appointments' }],
                [{ text: '🎧 Support', callback_data: 'support_main' }]
              ]
            }
          }
        );

      } catch (error) {
        console.error('❌ Start command error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      } finally {
        if (this.performanceMonitor) {
          const endTime = Date.now();
          this.performanceMonitor.trackResponseTime(startTime, endTime);
        }
      }
    });
    
    // Services command - uses same callbacks as /book for consistent behavior
    this.bot.command('services', async (ctx) => {
      try {
        await ctx.reply('📅 *Lodge Scheduler Services*\n\nPlease select one of the following service options:', {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🆕 New Registration', callback_data: 'service_lodge_mobile_new_registration' }],
              [{ text: '📱 SIM Card Activation', callback_data: 'service_lodge_mobile_simcard_activation' }],
              [{ text: '🔧 Technical Support', callback_data: 'service_lodge_mobile_technical_support' }],
              [{ text: '📲 Upgrade Device', callback_data: 'service_lodge_mobile_upgrade_device' }]
            ]
          }
        });
      } catch (error) {
        console.error('❌ Services command error:', error);
        await ctx.reply('❌ An error occurred loading services.');
      }
    });
    
    // Status command for performance monitoring
    this.bot.command('status', async (ctx) => {
      try {
        if (this.isAdmin(ctx.from.id)) {
          const stats = this.getPerformanceStats();
          await ctx.reply(`🔍 Bot Performance Status:\n\n${this.formatStats(stats)}`);
        } else {
          await ctx.reply('❌ Admin access required for status information.');
        }
      } catch (error) {
        console.error('❌ Status command error:', error);
      }
    });

    // CRITICAL FIX: Add missing commands that users reported as broken
    
    // Book command
    this.bot.command('book', async (ctx) => {
      try {
        // If in group/channel, redirect to private chat
        if (ctx.chat?.type !== 'private') {
          const botUsername = ctx.botInfo?.username;
          if (botUsername) {
            const { Markup } = require('telegraf');
            await ctx.reply(
              '📅 To book an appointment, please start a private chat with me.',
              Markup.inlineKeyboard([
                [Markup.button.url('Start Private Chat', `https://t.me/${botUsername}?start=book`)]
              ])
            );
          } else {
            await ctx.reply('📅 Please message me directly to book an appointment.');
          }
          return;
        }

        const BookingCommand = require('../../bot/commands/BookingCommand');
        const bookingCommand = new BookingCommand(this.bot, this.services);
        await bookingCommand.execute(ctx);
      } catch (error) {
        console.error('❌ Book command error:', error);
        await ctx.reply('❌ Booking service temporarily unavailable. Please try again.');
      }
    });

    // My appointments command  
    this.bot.command('myappointments', async (ctx) => {
      try {
        const BookingCommand = require('../../bot/commands/BookingCommand');
        const bookingCommand = new BookingCommand(this.bot, this.services);
        await bookingCommand.handleMyAppointments(ctx);
      } catch (error) {
        console.error('❌ MyAppointments command error:', error);
        await ctx.reply('❌ Unable to load appointments. Please try again.');
      }
    });

    // Cancel command
    this.bot.command('cancel', async (ctx) => {
      try {
        const BookingCommand = require('../../bot/commands/BookingCommand');
        const bookingCommand = new BookingCommand(this.bot, this.services);
        await bookingCommand.handleCancelAppointment(ctx);
      } catch (error) {
        console.error('❌ Cancel command error:', error);
        await ctx.reply('❌ Unable to cancel appointment. Please try again.');
      }
    });

    // Support command
    this.bot.command('support', async (ctx) => {
      try {
        const SupportCommand = require('../../bot/commands/SupportCommand');
        const supportCommand = new SupportCommand(this.bot, this.services);
        await supportCommand.execute(ctx);
      } catch (error) {
        console.error('❌ Support command error:', error);
        await ctx.reply('❌ Support temporarily unavailable. Please try again.');
      }
    });

    // Ticket command
    this.bot.command('ticket', async (ctx) => {
      try {
        const SupportCommand = require('../../bot/commands/SupportCommand');
        const supportCommand = new SupportCommand(this.bot, this.services);
        await supportCommand.handleCreateTicket(ctx);
      } catch (error) {
        console.error('❌ Ticket command error:', error);
        await ctx.reply('❌ Unable to create ticket. Please try again.');
      }
    });

    // Request command - check approval status for pending users
    this.bot.command('request', async (ctx) => {
      try {
        const User = require('../../models/User');
        const userId = ctx.from.id.toString();
        const user = await User.query().where('telegram_id', userId).first();

        if (!user) {
          await ctx.reply('❌ You are not registered. Please tap /start to begin.');
          return;
        }

        if (user.isApproved()) {
          await ctx.reply('✅ Your account is already approved! Use /book to make appointments.');
          return;
        }

        if (user.isDenied && user.isDenied()) {
          await ctx.reply('❌ Your access request was denied. Contact support if you believe this is an error.');
          return;
        }

        // User is pending
        await ctx.replyWithMarkdown(
          '⏳ *Request Status: Pending*\n\n' +
          'Your access request is awaiting admin approval.\n\n' +
          'You will be notified once your request is reviewed.\n\n' +
          '_Thank you for your patience!_'
        );
      } catch (error) {
        console.error('❌ Request command error:', error);
        await ctx.reply('❌ Error checking status. Please try again.');
      }
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      try {
        const helpMessage = `
📱 *Lodge Mobile Activations Bot* - Help

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel [ID] - Cancel an appointment
🎧 /support - Get support help
🎫 /ticket [subject] [message] - Create support ticket

*Services Available:*
🆕 New Registration - Complete customer setup
📱 SIM Card Activation - Activate new SIM cards
🔧 Technical Support - Technical assistance
📲 Device Upgrade - Upgrade existing devices

*Business Hours:* 11 AM - 6 PM EST
*Days:* Monday - Saturday

Need help? Contact support with /support or /ticket
        `;

        await ctx.replyWithMarkdown(helpMessage);
      } catch (error) {
        console.error('❌ Help command error:', error);
        await ctx.reply('Help: Use /book to schedule appointments, /myappointments to view bookings, /support for help.');
      }
    });

    // Admin command - delegates to AdminCommand.js for consolidated admin panel
    this.bot.command('admin', async (ctx) => {
      try {
        const AdminCommand = require('../../bot/commands/AdminCommand');
        const adminCmd = new AdminCommand(this.bot, this.services);
        await adminCmd.execute(ctx);
      } catch (error) {
        console.error('❌ Admin command error:', error);
        await ctx.reply('❌ Error loading admin panel. Please try again.');
      }
    });

    // Pending command - quick access to pending bookings
    this.bot.command('pending', async (ctx) => {
      try {
        if (!this.isAdmin(ctx.from.id)) {
          await ctx.reply('❌ Admin access required.');
          return;
        }

        // Delegate to callback handler
        if (this.callbackHandler && this.callbackHandler.handleAdminPendingList) {
          await this.callbackHandler.handleAdminPendingList(ctx, false);
        } else {
          await ctx.reply('❌ Pending bookings handler not available.');
        }
      } catch (error) {
        console.error('❌ Pending command error:', error);
        await ctx.reply('❌ Error loading pending bookings.');
      }
    });

    console.log('✅ Commands setup with performance tracking - INCLUDING MISSING COMMANDS RESTORED');
  }

  /**
   * Register user with optimized database operations and session deduplication
   */
  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      const userId = telegramUser.id.toString();
      
      // Use optimized database lookup if available
      if (this.databaseOptimizer) {
        const existingUser = await this.databaseOptimizer.findUserByTelegramId(userId);
        if (existingUser && existingUser[0]) {
          return existingUser[0];
        }
      }
      
      // Create new user (fallback to existing logic)
      const User = require('../../models/User');
      let user = await User.query()
        .where('telegram_id', userId)
        .first()
        .catch(() => null);

      if (!user) {
        // Check for username requirement
        if (!telegramUser.username) {
          await ctx.replyWithMarkdown(
            `⚠️ *Username Required*\n\n` +
            `To use this bot, you must have a Telegram username set.\n\n` +
            `*How to set your username:*\n` +
            `1. Go to Telegram Settings\n` +
            `2. Tap on your profile\n` +
            `3. Set a username\n` +
            `4. Return here and tap /start\n\n` +
            `_A username helps us identify and serve you better._`
          );
          return null;
        }

        // Block users with Chinese or Russian characters in name (spam prevention)
        const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`;
        const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(fullName);
        const hasRussian = /[\u0400-\u04ff]/.test(fullName);

        if (hasChinese || hasRussian) {
          console.log(`Blocked user ${userId}: non-Latin characters in name`);
          await ctx.replyWithMarkdown(
            `🚫 *Registration Unavailable*\n\n` +
            `This service is not available in your region.\n\n` +
            `_We apologize for any inconvenience._`
          );
          return null;
        }

        // Create user with pending status - admin will approve/deny
        const adminId = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
        const isAdmin = userId === adminId;
        const status = isAdmin ? 'approved' : 'pending';
        console.log(`📝 Registering new user ${userId} with status: ${status}`);
        user = await User.createTelegramUser(telegramUser, status);

        // Notify admin of new pending user
        if (status === 'pending' && user) {
          console.log(`📬 Notifying admin of new user: ${userId}`);
          await this.notifyAdminOfNewUser(ctx, user);
        }
      }
      
      // Create session for user ONLY if none exists
      if (this.sessionManager) {
        const existingSession = await this.sessionManager.getUserLatestSession(userId);
        if (!existingSession) {
          await this.sessionManager.createSession(userId, {
            user: user,
            registrationTime: Date.now(),
            booking: {},
            customerInfo: {}
          });
          console.log(`📝 Created new session for user ${userId}`);
        } else {
          console.log(`📝 Using existing session for user ${userId}`);
        }
      }
      
      return user;
      
    } catch (error) {
      console.error('❌ User registration error:', error);
      return null;
    }
  }

  /**
   * Check if user is admin
   */
  isAdmin(telegramId) {
    const adminId = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
    return telegramId.toString() === adminId;
  }

  /**
   * Notify admin of new user registration request
   */
  async notifyAdminOfNewUser(ctx, user) {
    try {
      const adminId = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID;
      if (!adminId || !ctx?.telegram || !user) return;

      const telegramUser = ctx.from || {};
      const languageCode = telegramUser.language_code || 'Unknown';
      const usernameDisplay = user.telegram_username ? `@${user.telegram_username}` : 'N/A';
      const timestamp = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' });

      const message = [
        '🚦 *New Access Request (Pending Approval)*',
        '',
        `*Name:* ${(user.first_name || '')} ${(user.last_name || '')}`.trim(),
        `*Username:* ${usernameDisplay}`,
        `*User ID:* ${user.telegram_id || 'Unknown'}`,
        `*Locale:* ${languageCode.toUpperCase()}`,
        `*Request Time:* ${timestamp}`,
        '',
        '_Use the buttons below to approve or deny this request._'
      ].join('\n');

      const { Markup } = require('telegraf');
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`✅ Approve ${user.telegram_id}`, `approve_${user.telegram_id}`)],
        [Markup.button.callback(`❌ Deny ${user.telegram_id}`, `deny_${user.telegram_id}`)],
        [Markup.button.callback('📋 View Pending', 'admin_pending_list')]
      ]);

      await ctx.telegram.sendMessage(adminId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

      console.log(`📬 Admin notified of new user request: ${user.telegram_id}`);
    } catch (error) {
      console.error('Failed to notify admin of new user:', error.message);
    }
  }

  /**
   * Handle performance alerts
   */
  handlePerformanceAlert(alert) {
    console.warn(`🚨 Performance Alert [${alert.level}]: ${alert.message}`);
    
    // Take automated actions based on alert type
    switch (alert.type) {
      case 'memory':
        if (alert.level === 'critical') {
          this.performEmergencyCleanup();
        }
        break;
      
      case 'process-memory':
        this.performStandardCleanup();
        break;
    }
  }

  /**
   * Handle bot errors with performance tracking
   */
  async handleBotError(error, ctx) {
    if (this.performanceMonitor) {
      this.performanceMonitor.incrementCounter('errors');
    }

    // Log full error context for debugging
    console.error('Full error context:', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      },
      context: ctx ? {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        chatId: ctx.chat?.id,
        updateType: ctx.updateType,
        message: ctx.message?.text,
        callbackData: ctx.callbackQuery?.data,
        command: ctx.message?.text?.split(' ')[0]
      } : 'No context available'
    });

    try {
      if (ctx && ctx.reply) {
        await ctx.reply('❌ An error occurred. Our team has been notified.');
      }
    } catch (replyError) {
      console.error('❌ Error sending error message:', replyError);
      console.error('Reply error stack:', replyError.stack);
    }
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats() {
    const stats = {
      bot: {
        uptime: Math.round(process.uptime()),
        isStarted: this.isStarted
      }
    };
    
    if (this.performanceMonitor) {
      Object.assign(stats, this.performanceMonitor.getStatus());
    }
    
    if (this.sessionManager) {
      stats.sessions = this.sessionManager.getSessionStats();
    }
    
    if (this.rateLimiter) {
      stats.rateLimiter = this.rateLimiter.getStats();
    }
    
    if (this.databaseOptimizer) {
      stats.database = this.databaseOptimizer.getStats();
    }
    
    if (this.callbackHandler) {
      stats.callbacks = this.callbackHandler.getStats();
    }
    
    // Memory optimizer stats
    if (this.memoryOptimizer) {
      stats.memoryOptimizer = this.memoryOptimizer.getMemoryStats();
    }
    
    // Legacy memory stats
    stats.memory = this.getStats();
    
    return stats;
  }

  /**
   * Format statistics for display
   */
  formatStats(stats) {
    let formatted = `⏱️ Uptime: ${stats.bot.uptime}s\n`;
    
    if (stats.memory) {
      formatted += `🧠 Memory: ${stats.memory.memoryUsage.rss}MB RSS\n`;
    }
    
    if (stats.performance) {
      formatted += `📊 Avg Response: ${stats.performance.averageResponseTime}ms\n`;
      formatted += `📈 Request Rate: ${stats.performance.requestRate}/min\n`;
    }
    
    if (stats.counters) {
      formatted += `🔢 Requests: ${stats.counters.requests}\n`;
      formatted += `❌ Errors: ${stats.counters.errors}\n`;
    }
    
    if (stats.sessions) {
      formatted += `👥 Active Sessions: ${stats.sessions.sessions.active}\n`;
    }
    
    return formatted;
  }

  /**
   * Start the enhanced bot
   */
  async start() {
    try {
      console.log('🚀 Starting EnhancedBotEngine...');

      // Setup commands
      this.setupCommands();

      // Enable graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));

      // Start ticket reminder scheduler (checks every 30 minutes)
      this.startTicketReminderScheduler();

      // Start booking reminder scheduler (checks every 10 minutes for appointments due in 1 hour)
      this.startBookingReminderScheduler();

      // Start the bot (non-blocking - starts long polling)
      this.bot.launch().then(() => {
        console.log('📡 Telegram long polling connected');
      }).catch(err => {
        console.error('❌ Bot launch error:', err);
      });

      this.isStarted = true;

      console.log('✅ EnhancedBotEngine started successfully!');

      // Log performance status
      if (this.performanceMonitor) {
        const report = this.performanceMonitor.generateReport(60000); // 1 minute
        console.log('📊 Initial performance report generated');
      }

    } catch (error) {
      console.error('❌ Failed to start EnhancedBotEngine:', error);
      throw error;
    }
  }

  /**
   * Start the scheduler for checking unanswered tickets (6-hour reminder)
   */
  startTicketReminderScheduler() {
    // Check every 30 minutes for unanswered tickets
    const REMINDER_INTERVAL = 30 * 60 * 1000; // 30 minutes
    const UNANSWERED_THRESHOLD_HOURS = 6;

    this.ticketReminderInterval = setInterval(async () => {
      try {
        await this.checkUnansweredTickets(UNANSWERED_THRESHOLD_HOURS);
      } catch (error) {
        console.error('Error in ticket reminder scheduler:', error);
      }
    }, REMINDER_INTERVAL);

    console.log(`⏰ Ticket reminder scheduler started (checks every 30 minutes for ${UNANSWERED_THRESHOLD_HOURS}h+ unanswered tickets)`);
  }

  /**
   * Check for tickets unanswered for more than X hours and notify admins
   */
  async checkUnansweredTickets(hoursThreshold = 6) {
    try {
      const SupportTicket = require('../../models/SupportTicket');
      const SupportMessage = require('../../models/SupportMessage');

      // Calculate threshold time
      const thresholdTime = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      // Find open/assigned tickets older than threshold
      const oldTickets = await SupportTicket.query()
        .whereIn('status', ['open', 'assigned'])
        .where('created_at', '<', thresholdTime.toISOString())
        .withGraphFetched('[user]');

      if (oldTickets.length === 0) {
        return; // No old tickets
      }

      // Filter tickets that have no agent response
      const unansweredTickets = [];
      for (const ticket of oldTickets) {
        try {
          // Check if there's any agent response for this ticket
          const agentResponse = await SupportMessage.query()
            .where('ticket_id', ticket.ticket_id)
            .where('sender_type', 'agent')
            .first();

          if (!agentResponse) {
            unansweredTickets.push(ticket);
          }
        } catch (err) {
          console.error(`Error checking messages for ticket ${ticket.ticket_id}:`, err);
        }
      }

      if (unansweredTickets.length === 0) {
        return; // All old tickets have responses
      }

      // Notify admins about unanswered tickets
      await this.notifyAdminsUnansweredTickets(unansweredTickets, hoursThreshold);

    } catch (error) {
      console.error('Error checking unanswered tickets:', error);
    }
  }

  /**
   * Notify admins about unanswered tickets
   */
  async notifyAdminsUnansweredTickets(tickets, hoursThreshold) {
    const adminIds = new Set(this.services.adminIds || []);
    const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
    if (ADMIN_TELEGRAM_ID) {
      adminIds.add(ADMIN_TELEGRAM_ID);
    }

    if (adminIds.size === 0) {
      console.warn('⚠️ No admin IDs configured for ticket reminders');
      return;
    }

    let message = `⏰ *Ticket Reminder*\n\n`;
    message += `🚨 ${tickets.length} ticket(s) have been waiting ${hoursThreshold}+ hours without response:\n\n`;

    tickets.slice(0, 5).forEach((ticket, index) => {
      const ageHours = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60));
      const userName = ticket.user ? `${ticket.user.first_name || ''} ${ticket.user.last_name || ''}`.trim() : 'Unknown';

      message += `${index + 1}. *${ticket.ticket_id}*\n`;
      message += `   👤 ${userName}\n`;
      message += `   📝 ${(ticket.subject || 'No subject').substring(0, 30)}\n`;
      message += `   ⏱️ Waiting: ${ageHours} hours\n\n`;
    });

    if (tickets.length > 5) {
      message += `_...and ${tickets.length - 5} more tickets_\n\n`;
    }

    message += `Please respond to these tickets as soon as possible.`;

    for (const adminId of adminIds) {
      try {
        await this.bot.telegram.sendMessage(adminId, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎫 View All Tickets', callback_data: 'admin_tickets' }]
            ]
          }
        });
        console.log(`⏰ Ticket reminder sent to admin ${adminId}`);
      } catch (error) {
        console.error(`Failed to send ticket reminder to admin ${adminId}:`, error.message);
      }
    }
  }

  /**
   * Start the scheduler for booking reminders (1 hour before appointment)
   */
  startBookingReminderScheduler() {
    // Check every 10 minutes for appointments due in the next hour
    const REMINDER_INTERVAL = 10 * 60 * 1000; // 10 minutes
    const REMINDER_HOURS_BEFORE = 1; // 1 hour before appointment

    this.bookingReminderInterval = setInterval(async () => {
      try {
        await this.checkUpcomingAppointments(REMINDER_HOURS_BEFORE);
      } catch (error) {
        console.error('Error in booking reminder scheduler:', error);
      }
    }, REMINDER_INTERVAL);

    // Also run immediately on startup to catch any pending reminders
    setTimeout(async () => {
      try {
        await this.checkUpcomingAppointments(REMINDER_HOURS_BEFORE);
      } catch (error) {
        console.error('Error in initial booking reminder check:', error);
      }
    }, 5000); // Run after 5 seconds to let bot fully initialize

    console.log(`📅 Booking reminder scheduler started (checks every 10 minutes for appointments due in ${REMINDER_HOURS_BEFORE} hour)`);
  }

  /**
   * Check for upcoming appointments and send reminders
   */
  async checkUpcomingAppointments(hoursBeforeAppointment = 1) {
    try {
      const Appointment = require('../../models/Appointment');
      const moment = require('moment-timezone');
      const timezone = process.env.DEFAULT_TIMEZONE || 'America/New_York';

      const now = moment().tz(timezone);
      const reminderWindowStart = now.clone();
      const reminderWindowEnd = now.clone().add(hoursBeforeAppointment, 'hours').add(10, 'minutes'); // Small buffer

      // Find confirmed/scheduled appointments in the reminder window that haven't received 1h reminder
      const appointments = await Appointment.query()
        .whereIn('status', ['scheduled', 'confirmed', 'pending_approval'])
        .where('appointment_datetime', '>', reminderWindowStart.toISOString())
        .where('appointment_datetime', '<=', reminderWindowEnd.toISOString())
        .whereRaw(`(reminder_sent IS NULL OR JSON_EXTRACT(reminder_sent, '$."1h"') IS NULL)`)
        .withGraphFetched('[client, service]');

      if (appointments.length === 0) {
        return; // No appointments need reminders
      }

      console.log(`📅 Found ${appointments.length} appointment(s) due for 1-hour reminder`);

      for (const appointment of appointments) {
        try {
          await this.sendBookingReminder(appointment);

          // Mark reminder as sent
          await appointment.markReminderSent('1h');

          console.log(`✅ Booking reminder sent for appointment ${appointment.uuid || appointment.id}`);
        } catch (error) {
          console.error(`Failed to send reminder for appointment ${appointment.id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('Error checking upcoming appointments:', error);
    }
  }

  /**
   * Send booking reminder notification to user via Telegram
   */
  async sendBookingReminder(appointment) {
    const client = appointment.client;

    if (!client || !client.telegram_id) {
      console.warn(`Cannot send reminder: Client ${appointment.client_id} has no Telegram ID`);
      return;
    }

    const moment = require('moment-timezone');
    const timezone = process.env.DEFAULT_TIMEZONE || 'America/New_York';

    const appointmentMoment = moment(appointment.appointment_datetime).tz(timezone);
    const formattedDate = appointmentMoment.format('dddd, MMMM D, YYYY');
    const formattedTime = appointmentMoment.format('h:mm A');

    const serviceName = appointment.service ? appointment.service.name : 'Your appointment';
    const clientName = client.first_name || 'there';

    const message = `⏰ *Appointment Reminder*\n\n` +
      `Hi ${clientName}! This is a friendly reminder that your appointment is coming up soon.\n\n` +
      `📋 *Service:* ${serviceName}\n` +
      `📅 *Date:* ${formattedDate}\n` +
      `🕐 *Time:* ${formattedTime}\n` +
      `⏱️ *Duration:* ${appointment.duration_minutes || 60} minutes\n\n` +
      `Please make sure to arrive on time. If you need to cancel or reschedule, please do so as soon as possible.\n\n` +
      `We look forward to seeing you! 🙂`;

    try {
      await this.bot.telegram.sendMessage(client.telegram_id, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📅 My Appointments', callback_data: 'my_appointments' }],
            [{ text: '❌ Cancel Appointment', callback_data: `cancel_appointment_${appointment.uuid || appointment.id}` }]
          ]
        }
      });
    } catch (error) {
      // If Telegram send fails, log but don't throw
      console.error(`Telegram reminder failed for ${client.telegram_id}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop the enhanced bot with cleanup
   */
  async stop(reason = 'SIGTERM') {
    if (this.stopped) return;
    this.stopped = true;

    console.log(`🔄 Stopping EnhancedBotEngine (${reason})...`);

    try {
      // Stop ticket reminder scheduler
      if (this.ticketReminderInterval) {
        clearInterval(this.ticketReminderInterval);
        console.log('⏰ Ticket reminder scheduler stopped');
      }

      // Stop booking reminder scheduler
      if (this.bookingReminderInterval) {
        clearInterval(this.bookingReminderInterval);
        console.log('📅 Booking reminder scheduler stopped');
      }

      // Stop bot
      if (this.bot) {
        this.bot.stop(reason);
      }
      
      // Shutdown performance components
      if (this.performanceMonitor) {
        this.performanceMonitor.shutdown();
      }
      
      if (this.sessionManager) {
        await this.sessionManager.shutdown();
      }
      
      if (this.rateLimiter) {
        this.rateLimiter.shutdown();
      }
      
      if (this.databaseOptimizer) {
        await this.databaseOptimizer.shutdown();
      }
      
      if (this.callbackHandler) {
        this.callbackHandler.clearAll();
      }
      
      // Shutdown memory optimizer
      if (this.memoryOptimizer) {
        this.memoryOptimizer.shutdown();
      }
      
      // Parent cleanup
      this.shutdown();
      
      console.log('✅ EnhancedBotEngine stopped successfully');
      
    } catch (error) {
      console.error('❌ Error stopping EnhancedBotEngine:', error);
    }
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    if (this.performanceMonitor) {
      return this.performanceMonitor.generateReport();
    }
    
    return this.getPerformanceStats();
  }
}

module.exports = EnhancedBotEngine;
