/**
 * Fixed Callback Query Handler - Router Only
 * Routes callbacks to specialized handlers
 *
 * Refactored from 4,129 lines to ~200 lines
 * All logic delegated to specialized handlers in ./handlers/
 */

const EventEmitter = require('events');

// Import specialized handlers
const RegistrationHandler = require('./handlers/RegistrationHandler');
const BookingHandler = require('./handlers/BookingHandler');
const SupportHandler = require('./handlers/SupportHandler');
const AdminHandler = require('./handlers/AdminHandler');
const AdminTicketsHandler = require('./handlers/AdminTicketsHandler');
const NavigationHandler = require('./handlers/NavigationHandler');
const BulkUploadHandler = require('../../bot/handlers/BulkUploadHandler');
const CompletionHandler = require('../../bot/handlers/CompletionHandler');

class FixedCallbackQueryHandler extends EventEmitter {
  constructor(services = {}, options = {}) {
    super();

    this.services = services;
    this.config = {
      enableLogging: options.enableLogging !== false,
      autoAnswer: options.autoAnswer !== false,
      ...options
    };

    // Track callback statistics
    this.stats = {
      total: 0,
      processed: 0,
      errors: 0,
      answered: 0
    };

    // Initialize specialized handlers
    this.initializeHandlers();

    console.log('✅ FixedCallbackQueryHandler initialized with specialized handlers');
  }

  /**
   * Initialize all specialized handlers
   */
  initializeHandlers() {
    this.registrationHandler = new RegistrationHandler(this.services, this.bot);
    this.bookingHandler = new BookingHandler(this.services, this.bot);
    this.supportHandler = new SupportHandler(this.services, this.bot);
    this.adminTicketsHandler = new AdminTicketsHandler(this.services, this.bot);
    this.adminHandler = new AdminHandler(this.services, this.bot);
    this.navigationHandler = new NavigationHandler(this.services, this.bot);
    this.bulkUploadHandler = new BulkUploadHandler(this.bot, this.services);
    this.completionHandler = new CompletionHandler(this.bot, this.services);

    // Wire up handler dependencies
    this.adminHandler.setAdminTicketsHandler(this.adminTicketsHandler);
    this.adminTicketsHandler.setSupportHandler(this.supportHandler);
  }

  /**
   * Setup SINGLE callback handler that routes to appropriate handlers
   */
  setupHandlers(bot) {
    this.bot = bot;

    // Update bot reference in all handlers
    this.registrationHandler.bot = bot;
    this.bookingHandler.bot = bot;
    this.supportHandler.bot = bot;
    this.adminTicketsHandler.bot = bot;
    this.adminHandler.bot = bot;
    this.navigationHandler.bot = bot;
    this.bulkUploadHandler.bot = bot;
    this.completionHandler.bot = bot;
    this.bulkUploadHandler.setupHandlers(bot, this.services);
    this.completionHandler.setupHandlers(bot, this.services);

    // Make handlers available in services for MessageHandler document routing
    this.services.bulkUploadHandler = this.bulkUploadHandler;
    this.services.completionHandler = this.completionHandler;

    // CRITICAL: Single callback handler to prevent conflicts
    bot.on('callback_query', async (ctx) => {
      await this.handleCallback(ctx);
    });

    console.log('✅ Single consolidated callback query handler registered');
  }

  /**
   * Main callback handling method that routes to appropriate handlers
   */
  async handleCallback(ctx) {
    this.stats.total++;

    try {
      // Validate callback query structure
      if (!this.isValidCallback(ctx)) {
        console.error('❌ Invalid callback query received:', {
          hasCallbackQuery: !!ctx.callbackQuery,
          hasId: !!ctx.callbackQuery?.id,
          hasData: !!ctx.callbackQuery?.data,
          hasFrom: !!ctx.callbackQuery?.from
        });

        // Try to answer with basic response
        if (ctx.answerCbQuery) {
          await ctx.answerCbQuery('Invalid request. Please try again.', { show_alert: true });
        }
        return;
      }

      const callbackData = ctx.callbackQuery.data;

      if (this.config.enableLogging) {
        console.log(`📞 Processing callback: ${callbackData} from user ${ctx.from.id}`);
      }

      // Route to appropriate handler based on callback data pattern
      const handled = await this.routeCallback(ctx, callbackData);

      if (handled) {
        this.stats.processed++;
      } else {
        // Fallback answer for unhandled callbacks
        await ctx.answerCbQuery('Action processed', { show_alert: false });
        console.warn(`⚠️ Unhandled callback: ${callbackData}`);
      }

    } catch (error) {
      this.stats.errors++;
      console.error('❌ Callback handling error:', error);

      // Always answer callback query to prevent spinning indicator
      try {
        await ctx.answerCbQuery('An error occurred. Please try again.', { show_alert: true });
      } catch (answerError) {
        console.error('❌ Failed to answer callback query:', answerError);
      }
    }
  }

  /**
   * Validate callback query has all required fields
   */
  isValidCallback(ctx) {
    if (!ctx.callbackQuery) return false;
    if (!ctx.callbackQuery.id) return false;
    if (!ctx.callbackQuery.data) return false;
    if (!ctx.callbackQuery.from) return false;
    if (!ctx.callbackQuery.from.id) return false;

    return true;
  }

  /**
   * Route callback to appropriate handler based on data pattern
   */
  async routeCallback(ctx, callbackData) {
    // Lodge Scheduler service selection - delegates to BookingHandler
    if (callbackData.startsWith('service_lodge_mobile_')) {
      return await this.bookingHandler.handleLodgeService(ctx);
    }

    // Bulk upload callbacks (must be checked before reg_ since reg_mode_* is a subset)
    // Route directly to BulkUploadHandler
    if (callbackData.startsWith('bulk_') || callbackData === 'reg_mode_single' || callbackData === 'reg_mode_bulk' || callbackData === 'single_upload_txt') {
      return await this.bulkUploadHandler.handleCallback(ctx, callbackData);
    }

    // Completion confirmation callbacks - handled by CompletionHandler via bot.action()
    if (callbackData.startsWith('completion_confirm_') || callbackData.startsWith('admin_proof_ack_')) {
      return true;
    }

    // Registration flow callbacks
    if (callbackData.startsWith('reg_')) {
      return await this.registrationHandler.handle(ctx, callbackData);
    }

    // Calendar widget callbacks (telegraf-calendar-telegram)
    if (callbackData.startsWith('calendar')) {
      return await this.bookingHandler.handleCalendarCallback(ctx);
    }

    // Date and time selection
    if (callbackData.startsWith('date_') || callbackData.startsWith('time_') ||
        callbackData === 'select_date' || callbackData === 'show_calendar') {
      return await this.bookingHandler.handleDateTimeSelection(ctx);
    }

    // Booking actions
    if (['confirm_booking', 'cancel_booking'].includes(callbackData)) {
      return await this.bookingHandler.handleBookingActions(ctx);
    }

    // Coupon actions
    if (callbackData === 'enter_coupon') {
      return await this.bookingHandler.handleEnterCoupon(ctx);
    }
    if (callbackData === 'remove_coupon') {
      return await this.bookingHandler.handleRemoveCoupon(ctx);
    }
    if (callbackData === 'booking_summary') {
      await ctx.answerCbQuery();
      return await this.bookingHandler.showBookingSummary(ctx);
    }

    // No-op callback (for pagination indicators, etc.)
    if (callbackData === 'noop') {
      await ctx.answerCbQuery();
      return true;
    }

    // Support actions
    if (callbackData.startsWith('support_')) {
      return await this.supportHandler.handle(ctx, callbackData);
    }

    // User ticket view (separate from admin)
    if (callbackData.startsWith('user_ticket_view_')) {
      const ticketId = callbackData.replace('user_ticket_view_', '');
      return await this.supportHandler.handleUserViewTicket(ctx, ticketId);
    }

    // User reply to ticket
    if (callbackData.startsWith('user_reply_')) {
      return await this.supportHandler.handle(ctx, callbackData);
    }

    // Admin actions (including pending list, today bookings, completion, etc.)
    if (callbackData.startsWith('approve_') || callbackData.startsWith('deny_') ||
        callbackData.startsWith('admin_') || callbackData.startsWith('adm_cxl_')) {
      return await this.adminHandler.handle(ctx, callbackData);
    }

    // User appointment management (cancel, edit)
    if (callbackData.startsWith('user_cancel_') || callbackData.startsWith('user_edit_')) {
      return await this.navigationHandler.handleUserAppointmentAction(ctx, callbackData);
    }

    // Generic service selection (fallback)
    if (callbackData.startsWith('service_')) {
      return await this.navigationHandler.handleGenericService(ctx);
    }

    // Payment actions
    if (callbackData.startsWith('check_payment_') || callbackData.startsWith('cancel_payment_') || callbackData.startsWith('redeem_coupon_')) {
      if (this.services.paymentHandler) {
        return await this.services.paymentHandler.handleCallback(ctx, callbackData);
      }
    }

    // Navigation actions (including my_appointments and start)
    if (['book', 'cancel', 'back', 'main_menu', 'my_appointments', 'start'].includes(callbackData)) {
      return await this.navigationHandler.handle(ctx, callbackData);
    }

    return false; // Not handled
  }

  /**
   * Get support handler for message handler integration
   * @returns {SupportHandler} - Support handler instance
   */
  getSupportHandler() {
    return this.supportHandler;
  }

  /**
   * Handle support input (delegated to support handler)
   * Called by MessageHandler for text input during support flows
   */
  async handleSupportInput(ctx) {
    if (this.supportHandler && typeof this.supportHandler.handleSupportInput === 'function') {
      return await this.supportHandler.handleSupportInput(ctx);
    }
    return false;
  }

  /**
   * Get registration handler for form handler integration
   * @returns {RegistrationHandler} - Registration handler instance
   */
  getRegistrationHandler() {
    return this.registrationHandler;
  }

  /**
   * Get admin tickets handler for admin integration
   * @returns {AdminTicketsHandler} - Admin tickets handler instance
   */
  getAdminTicketsHandler() {
    return this.adminTicketsHandler;
  }

  /**
   * Get handler statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return { ...this.stats };
  }
}

module.exports = FixedCallbackQueryHandler;
