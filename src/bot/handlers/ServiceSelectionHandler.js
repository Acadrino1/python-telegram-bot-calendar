
const { Markup } = require('telegraf');

class ServiceSelectionHandler {
  constructor(bot, calendarUIManager = null) {
    this.bot = bot;
    this.calendarUIManager = calendarUIManager;
    this.cache = new Map(); // Simple in-memory cache for service selections
    // Don't setup handlers in constructor - wait for bot instance
    if (this.bot) {
      this.setupHandlers();
    }
  }

  setupHandlers(bot, calendarUIManager) {
    // Allow setting bot and calendar manager if not already set
    if (bot) this.bot = bot;
    if (calendarUIManager) this.calendarUIManager = calendarUIManager;
    
    if (!this.bot) return; // Exit if no bot instance
    // Handle Lodge Mobile service selections
    
    // New Registration - show choice between single and bulk upload
    this.bot.action('service_lodge_mobile_new_registration', async (ctx) => {
      await ctx.answerCbQuery();

      ctx.session = ctx.session || {};

      // Store calendar manager reference in session for later use
      ctx.session.calendarUIManager = this.calendarUIManager;

      await ctx.editMessageText(
        `*Lodge Mobile: New Registration*\n\n` +
        `How many customers are you registering?\n\n` +
        `*Single Registration:*\n` +
        `Register one customer step-by-step (13 fields)\n\n` +
        `*Bulk Upload:*\n` +
        `Register multiple customers via Excel file (max 20)`,
        {
          parse_mode: 'Markdown',
          reply_markup: require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.callback('Single Registration', 'reg_mode_single')],
            [require('telegraf').Markup.button.callback('Bulk Upload (Multiple)', 'reg_mode_bulk')],
            [require('telegraf').Markup.button.callback('Download Template', 'bulk_download_template')],
            [require('telegraf').Markup.button.callback('Back to Services', 'book')]
          ]).reply_markup
        }
      );
    });
    
    // SIM Card Activation - straight to booking
    this.bot.action('service_lodge_mobile_simcard_activation', async (ctx) => {
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.booking = {
        service: 'Lodge Mobile: Simcard Activation',
        requiresForm: false
      };
      
      // Show calendar directly
      if (this.calendarUIManager) {
        await this.calendarUIManager.showCalendar(ctx);
      } else {
        // Fallback to basic date selection with back button
        await ctx.editMessageText(
          `✅ *SIM Card Activation Selected*\n\nLet's schedule your SIM card activation appointment.\n\nPlease select a date:`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 Select Date', 'select_date')],
              [Markup.button.callback('← Back to Services', 'book')]
            ]).reply_markup
          }
        );
      }
    });
    
    // Technical Support - straight to booking
    this.bot.action('service_lodge_mobile_technical_support', async (ctx) => {
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.booking = {
        service: 'Lodge Mobile: Technical Support',
        requiresForm: false
      };
      
      // Show calendar directly
      if (this.calendarUIManager) {
        await this.calendarUIManager.showCalendar(ctx);
      } else {
        // Fallback to basic date selection with back button
        await ctx.editMessageText(
          `✅ *Technical Support Selected*\n\nLet's schedule your technical support appointment.\n\nPlease select a date:`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 Select Date', 'select_date')],
              [Markup.button.callback('← Back to Services', 'book')]
            ]).reply_markup
          }
        );
      }
    });
    
    // Upgrade Device - straight to booking
    this.bot.action('service_lodge_mobile_upgrade_device', async (ctx) => {
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.booking = {
        service: 'Lodge Mobile: Upgrade Device',
        requiresForm: false
      };
      
      // Show calendar directly
      if (this.calendarUIManager) {
        await this.calendarUIManager.showCalendar(ctx);
      } else {
        // Fallback to basic date selection with back button
        await ctx.editMessageText(
          `✅ *Device Upgrade Selected*\n\nLet's schedule your device upgrade appointment.\n\nPlease select a date:`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📅 Select Date', 'select_date')],
              [Markup.button.callback('← Back to Services', 'book')]
            ]).reply_markup
          }
        );
      }
    });
  }
}

module.exports = ServiceSelectionHandler;