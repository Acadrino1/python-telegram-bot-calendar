const EnhancedBotEngine = require('../services/enhanced/EnhancedBotEngine');
const TelegramSupportService = require('../services/TelegramSupportService');
const BookingSlotService = require('../services/BookingSlotService');
const GroupNotificationService = require('../services/GroupNotificationService');
const CalendarUIManager = require('./CalendarUIManager');
const ReferralCodeService = require('../services/ReferralCodeService');
const EnhancedCustomerFormHandler = require('./handlers/EnhancedCustomerFormHandler');
const ServiceSelectionHandler = require('./handlers/ServiceSelectionHandler');
const PaymentHandler = require('./handlers/PaymentHandler');
const CouponGiveawayService = require('../services/CouponGiveawayService');
const bookingConfig = require('../../config/booking.config');
const moment = require('moment-timezone');
const SecureConfig = require('../utils/SecureConfig'); // Security validation
const cleanupManager = require('../utils/CleanupManager'); // Centralized cleanup

// Set default timezone
moment.tz.setDefault(bookingConfig.timezone);

class SimpleTelegramBot {
  constructor() {
    // Memory leak prevention (now handled by EnhancedBotEngine)
    this.intervals = new Set();
    this.listeners = new Set();
    this.isShuttingDown = false;
    
    // Initialize services
    this.initializeServices();
    
    // Initialize the enhanced bot engine with performance optimizations
    // CRITICAL: Disabled custom session management - using Telegraf's built-in sessions instead
    // to prevent session loss during form flows
    this.botEngine = new EnhancedBotEngine(this.services, {
      enablePerformanceMonitoring: false, // Disable to reduce memory pressure
      enableRateLimiting: true,
      enableSessionManagement: false, // DISABLED - use Telegraf's built-in session instead
      enableDatabaseOptimization: true,
      enableCallbackOptimization: true,
      memory: {
        maxMemoryMB: 150, // Realistic for Node.js + Telegraf + MySQL + Redis
        warningThresholdMB: 100,
        criticalThresholdMB: 130,
        enableAutoCleanup: false // Disable aggressive cleanup
      }
    });
    
    // Get reference to the underlying Telegraf bot
    this.bot = this.botEngine.bot;

    // Initialize calendar with bot reference for inline calendar functionality
    if (this.calendarUIManager && this.calendarUIManager.setBot) {
      this.calendarUIManager.setBot(this.bot);
    }

    // Setup payment handlers
    if (this.paymentHandler) {
      this.paymentHandler.setupHandlers(this.bot, this.services);
    }

    // Setup cleanup handlers for graceful shutdown
    this.setupCleanupHandlers();

    console.log('🤖 SimpleTelegramBot initialized with Enhanced Performance Engine');
  }

  initializeServices() {
    // Admin configuration
    this.adminIds = process.env.ADMIN_USER_IDS ? 
      process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : [];
    this.ADMIN_ID = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';

    // Initialize all services
    this.supportService = new TelegramSupportService();
    this.bookingSlotService = new BookingSlotService();
    this.groupNotificationService = new GroupNotificationService();
    this.calendarUIManager = new CalendarUIManager();
    this.referralCodeService = new ReferralCodeService();
    
    // Initialize Lodge Mobile handlers - CRITICAL: These must be initialized!
    // Handlers will be created but NOT set up until bot instance exists
    this.customerFormHandler = new EnhancedCustomerFormHandler();
    this.serviceSelectionHandler = new ServiceSelectionHandler();
    this.paymentHandler = new PaymentHandler();

    // Collect all services for the bot engine
    this.services = {
      supportService: this.supportService,
      bookingSlotService: this.bookingSlotService,
      groupNotificationService: this.groupNotificationService,
      calendarUIManager: this.calendarUIManager,
      referralCodeService: this.referralCodeService,
      customerFormHandler: this.customerFormHandler,
      serviceSelectionHandler: this.serviceSelectionHandler,
      paymentHandler: this.paymentHandler,
      adminIds: this.adminIds,
      ADMIN_ID: this.ADMIN_ID
    };
  }

  // Legacy method support for existing handlers
  setupCommands() {
    // Commands are now handled by the modular BotEngine
    console.log('✅ Commands setup completed via modular architecture');
  }

  setupHandlers() {
    // CRITICAL FIX: Handlers are now managed by the consolidated FixedCallbackQueryHandler
    // This prevents callback handler conflicts that were causing button failures
    console.log('✅ Handlers setup completed via consolidated callback architecture');
    
    // DISABLED: These handlers were causing conflicts with the main callback handler
    // The FixedCallbackQueryHandler now handles all callbacks in a consolidated manner
    
    // Setup registration form handler for customer info collection during booking
    if (this.customerFormHandler && this.customerFormHandler.setupHandlers) {
      // Pass services including callbackHandler for support ticket text input handling
      this.customerFormHandler.setupHandlers(this.bot, this.services);
      console.log('✅ Registration form handler setup complete');
    }
    
    // DISABLED: Service selection conflicts with main handler
    // if (this.serviceSelectionHandler && this.serviceSelectionHandler.setupHandlers) {
    //   this.serviceSelectionHandler.setupHandlers(this.bot, this.calendarUIManager);
    // }
    
    // DISABLED: Calendar UI handler conflicts with main handler
    // if (this.calendarUIManager && this.calendarUIManager.setupHandlers) {
    //   this.calendarUIManager.setupHandlers(this.bot);
    // }
    
    console.log('🔧 Callback handler conflicts resolved - all callbacks now routed through FixedCallbackQueryHandler');
  }

  // Utility methods for backward compatibility
  isAdmin(telegramId) {
    if (!telegramId) return false;
    return this.adminIds.includes(telegramId.toString()) || telegramId.toString() === this.ADMIN_ID;
  }

  // Start method - delegates to BotEngine
  async start() {
    try {
      // Ensure database has required records for booking to work
      await this.ensureDatabaseDefaults();

      // Setup any remaining handlers
      this.setupHandlers();

      // Start the bot engine
      await this.botEngine.start();

      // Start the coupon giveaway service
      this.couponGiveawayService = new CouponGiveawayService(this.bot);
      this.couponGiveawayService.start();
      this.services.couponGiveawayService = this.couponGiveawayService;

      console.log('🤖 SimpleTelegramBot started successfully with modular architecture!');
    } catch (error) {
      console.error('Failed to start SimpleTelegramBot:', error);
      console.error('Stack:', error.stack);
      console.error('Full error details:', {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack
      });
      throw error;
    }
  }

  // Ensure required database records exist for booking flow
  async ensureDatabaseDefaults() {
    try {
      const User = require('../models/User');
      const Service = require('../models/Service');

      // Check for provider (also accept admin as fallback for service creation)
      let provider = await User.query()
        .where('role', 'provider')
        .where('is_active', true)
        .first();

      if (!provider) {
        // Check if admin exists - can be used as provider fallback
        const admin = await User.query()
          .where('role', 'admin')
          .where('is_active', true)
          .first();

        if (admin) {
          console.log('✅ Admin user found - can be used as provider fallback');
          provider = admin;
        } else {
          // No provider or admin - create default provider
          console.log('⚠️ No active provider or admin found - creating default provider...');
          const uniqueEmail = `provider_${Date.now()}@lodge.local`;
          provider = await User.query().insert({
            telegram_id: '0',
            first_name: 'Lodge',
            last_name: 'Provider',
            email: uniqueEmail,
            password_hash: 'no_password',
            role: 'provider',
            is_active: true,
            timezone: 'America/New_York'
          });
          console.log('✅ Default provider created');
        }
      }

      // Check for service
      const service = await Service.query()
        .where('is_active', true)
        .first();

      if (!service && provider) {
        console.log('⚠️ No active service found - creating default service...');
        await Service.query().insert({
          provider_id: provider.id,
          name: 'Lodge Scheduler Service',
          description: 'Standard appointment booking service',
          duration_minutes: 90,
          price: 0,
          is_active: true
        });
        console.log('✅ Default service created');
      }

      console.log('✅ Database defaults verified');
    } catch (error) {
      console.error('⚠️ Error checking database defaults:', error.message);
      console.error('Stack:', error.stack);
      console.error('Full error details:', {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack
      });
      // Don't throw - bot can still run, just booking might fail
    }
  }

  // Setup cleanup handlers for memory leak prevention
  setupCleanupHandlers() {
    // Register this bot with the centralized CleanupManager
    // This prevents duplicate process handlers and race conditions
    cleanupManager.registerResource({
      cleanup: () => this.gracefulShutdown()
    }, 'SimpleTelegramBot');
    console.log('✅ Bot registered with CleanupManager for graceful shutdown');
  }

  // Graceful shutdown to prevent memory leaks
  gracefulShutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('🔄 Starting graceful shutdown...');

    // Clear all intervals
    this.intervals.forEach(interval => {
      clearInterval(interval);
      console.log('✅ Cleared interval');
    });
    this.intervals.clear();

    // Remove all listeners
    this.listeners.forEach(listener => {
      if (listener.remove) listener.remove();
      console.log('✅ Removed listener');
    });
    this.listeners.clear();

    // Stop coupon giveaway service
    if (this.couponGiveawayService) {
      this.couponGiveawayService.stop();
      console.log('✅ Coupon giveaway service stopped');
    }

    // Stop bot engine
    if (this.botEngine && !this.botEngine.stopped) {
      this.botEngine.stop('SIGINT').then(() => {
        console.log('✅ Bot engine stopped');
        process.exit(0);
      }).catch((error) => {
        console.error('Error stopping bot engine:', error);
        process.exit(1);
      });
    } else {
      process.exit(0);
    }
  }

  // Enhanced stop method with memory cleanup
  async stop(reason = 'SIGTERM') {
    console.log(`Stopping SimpleTelegramBot with reason: ${reason}`);
    this.gracefulShutdown();
  }

  // Get bot statistics
  getStats() {
    const engineStats = this.botEngine.getStats();
    return {
      ...engineStats,
      architecture: 'modular',
      services: Object.keys(this.services),
      botEngine: 'active'
    };
  }

  // Feature management methods
  enableCommand(commandName) {
    this.botEngine.enableCommand(commandName);
  }

  disableCommand(commandName) {
    this.botEngine.disableCommand(commandName);
  }

  // Access to underlying components for backward compatibility
  get commandRegistry() {
    return this.services.commandRegistry;
  }

  get callbackHandler() {
    return this.botEngine.callbackHandler;
  }

  get messageHandler() {
    return this.botEngine.messageHandler;
  }

  // Legacy compatibility methods - these now delegate to modular components
  async getUser(telegramId) {
    try {
      const User = require('../models/User');
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
      const registrationCommand = this.services.commandRegistry?.getCommand('start');
      if (registrationCommand && registrationCommand.registerUser) {
        return await registrationCommand.registerUser(ctx);
      }
      
      // Fallback registration logic
      const User = require('../models/User');
      const telegramUser = ctx.from;
      
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first()
        .catch(() => null);

      if (!user) {
        let status = 'pending';
        if (telegramUser.id.toString() === this.ADMIN_ID) {
          status = 'approved';
        }
        user = await User.createTelegramUser(telegramUser, status);
      }

      return user;
    } catch (error) {
      console.error('Error registering user:', error);
      return null;
    }
  }
}

module.exports = SimpleTelegramBot;