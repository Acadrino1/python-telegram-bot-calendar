const { Telegraf, session } = require('telegraf');
const CommandRegistry = require('./CommandRegistry');
const CallbackQueryHandler = require('./handlers/CallbackQueryHandler');
const MessageHandler = require('./handlers/MessageHandler');
const AuthMiddleware = require('./middleware/AuthMiddleware');
const RateLimitMiddleware = require('./middleware/RateLimitMiddleware');
const BotChannel = require('../models/BotChannel');

// Import Commands
const BookingCommand = require('./commands/BookingCommand');
const SupportCommand = require('./commands/SupportCommand');
const AdminCommand = require('./commands/AdminCommand');
const RegistrationCommand = require('./commands/RegistrationCommand');

class BotEngine {
  constructor(services) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.services = services;
    
    // Initialize middleware and handlers
    this.setupMiddleware();
    this.initializeComponents();
    this.setupErrorHandling();
    
    console.log('🤖 BotEngine initialized successfully');
  }

  setupMiddleware() {
    // Session middleware
    this.bot.use(session());

    // Rate limiting middleware
    const rateLimitOptions = {
      windowMs: 60000, // 1 minute
      maxRequests: 15,
      exemptUsers: this.services.adminIds || [],
      exemptCommands: ['start', 'help']
    };
    this.bot.use(RateLimitMiddleware.create(rateLimitOptions));

    // Authentication middleware
    const authOptions = {
      adminIds: this.services.adminIds || [],
      ADMIN_ID: process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '',
      exemptCommands: ['start', 'help', 'request', 'invite'],
      requireApproval: true
    };
    this.bot.use(AuthMiddleware.create(authOptions));
  }

  initializeComponents() {
    // Initialize Command Registry
    this.services.commandRegistry = new CommandRegistry(this.bot, this.services);

    // Register all commands
    this.registerCommands();

    // Initialize handlers
    this.callbackHandler = new CallbackQueryHandler(this.bot, this.services);
    this.messageHandler = new MessageHandler(this.bot, this.services);

    // Setup handlers
    this.callbackHandler.setupHandlers();
    this.messageHandler.setupHandlers();

    // Setup additional command handlers
    this.setupAdditionalCommands();

    // Setup group/channel join/leave tracking
    this.setupChannelTracking();
  }

  setupChannelTracking() {
    // Track when bot is added to or removed from groups/channels
    this.bot.on('my_chat_member', async (ctx) => {
      try {
        const update = ctx.myChatMember;
        const chat = update.chat;
        const newStatus = update.new_chat_member.status;
        const oldStatus = update.old_chat_member.status;

        // Only track groups, supergroups, and channels
        if (!['group', 'supergroup', 'channel'].includes(chat.type)) {
          return;
        }

        const addedBy = update.from?.id;

        // Bot was added or promoted to admin
        if (['member', 'administrator'].includes(newStatus) &&
            ['left', 'kicked'].includes(oldStatus)) {
          console.log(`📥 Bot added to ${chat.type}: ${chat.title} (${chat.id})`);
          await BotChannel.registerChannel(chat, addedBy);
        }
        // Bot was removed or demoted
        else if (['left', 'kicked'].includes(newStatus) &&
                 ['member', 'administrator'].includes(oldStatus)) {
          console.log(`📤 Bot removed from ${chat.type}: ${chat.title} (${chat.id})`);
          await BotChannel.markLeft(chat.id);
        }
        // Bot status changed (e.g., promoted to admin)
        else if (newStatus === 'administrator' && oldStatus === 'member') {
          console.log(`⬆️ Bot promoted to admin in: ${chat.title} (${chat.id})`);
          await BotChannel.registerChannel(chat, addedBy);
        }
      } catch (error) {
        console.error('Error tracking channel membership:', error);
      }
    });
  }

  registerCommands() {
    const commands = [
      RegistrationCommand,
      BookingCommand,
      SupportCommand,
      AdminCommand
    ];

    this.services.commandRegistry.registerCommands(commands);

    // Register help command
    this.bot.command('help', async (ctx) => {
      const isAdmin = this.isAdmin(ctx.from.id);
      const helpMessage = this.services.commandRegistry.generateHelpMessage(isAdmin);
      await ctx.replyWithMarkdown(helpMessage);
    });
  }

  setupAdditionalCommands() {
    const bookingCommand = this.services.commandRegistry.getCommand('book');
    const supportCommand = this.services.commandRegistry.getCommand('support');
    const adminCommand = this.services.commandRegistry.getCommand('admin');

    // Additional booking-related commands
    if (bookingCommand) {
      this.bot.command('myappointments', (ctx) => bookingCommand.handleMyAppointments(ctx));
      this.bot.command('cancel', (ctx) => bookingCommand.handleCancelAppointment(ctx));
    }

    // Additional support-related commands  
    if (supportCommand) {
      this.bot.command('ticket', (ctx) => supportCommand.handleCreateTicket(ctx));
      this.bot.command('mystatus', (ctx) => supportCommand.handleTicketStatus(ctx));
    }

    // Additional admin commands
    if (adminCommand) {
      this.bot.command('tickets', (ctx) => adminCommand.handleViewTickets(ctx));
      this.bot.command('closeticket', (ctx) => adminCommand.handleCloseTicket(ctx));
      this.bot.command('supportstats', (ctx) => adminCommand.handleSupportStats(ctx));
      this.bot.command('requests', (ctx) => adminCommand.handleViewRequests(ctx));
      this.bot.command('approve', (ctx) => adminCommand.handleApproveUser(ctx));
      this.bot.command('setgroup', (ctx) => adminCommand.handleSetGroup(ctx));
      this.bot.command('dailysummary', (ctx) => adminCommand.handleDailySummary(ctx));
      this.bot.command('createcode', (ctx) => adminCommand.handleCreateCode(ctx));
    }

    // Registration-related commands
    const registrationCommand = this.services.commandRegistry.getCommand('start');
    if (registrationCommand) {
      this.bot.command('request', (ctx) => registrationCommand.handleRequestAccess(ctx));
      this.bot.command('invite', (ctx) => registrationCommand.handleInviteCode(ctx));
    }
  }

  setupErrorHandling() {
    // Global error handler
    this.bot.catch((err, ctx) => {
      console.error('Bot error:', err);
      console.error('Error context:', {
        updateType: ctx.updateType,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        message: ctx.message?.text || ctx.callbackQuery?.data
      });
      
      // Try to send error message to user
      if (ctx && ctx.reply) {
        ctx.reply(
          '❌ An error occurred while processing your request. Please try again.\n\n' +
          'If the problem persists, use /support to get help.'
        ).catch(() => {
          console.error('Failed to send error message to user');
        });
      }
    });

    // Handle uncaught errors
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });
  }

  // Utility methods
  isAdmin(telegramId) {
    if (!telegramId) return false;
    const adminIds = this.services.adminIds || [];
    const ADMIN_ID = process.env.ADMIN_USER_ID || '7930798268';
    return adminIds.includes(telegramId.toString()) || telegramId.toString() === ADMIN_ID;
  }

  // Start the bot
  async start() {
    try {
      await this.bot.launch();
      console.log('🚀 Bot launched successfully!');
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  setupGracefulShutdown() {
    const gracefulStop = async (signal) => {
      console.log(`Received ${signal}. Graceful shutdown...`);
      
      try {
        // Stop the bot
        await this.bot.stop(signal);
        
        // Cleanup services
        await this.cleanup();
        
        console.log('✅ Bot stopped gracefully');
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };
    
    process.once('SIGINT', gracefulStop);
    process.once('SIGTERM', gracefulStop);
  }

  async cleanup() {
    try {
      // Cleanup support service
      if (this.services.supportService?.shutdown) {
        await this.services.supportService.shutdown();
      }
      
      // Cleanup any other services that need it
      console.log('Services cleaned up successfully');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Stop the bot
  async stop(reason = 'SIGTERM') {
    console.log(`Stopping bot with reason: ${reason}`);
    await this.bot.stop(reason);
    await this.cleanup();
  }

  // Get bot statistics
  getStats() {
    const commandStats = this.services.commandRegistry?.getStats() || {};
    
    return {
      botInfo: this.bot.botInfo,
      commands: commandStats,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  // Enable/disable features
  enableCommand(commandName) {
    if (this.services.commandRegistry) {
      this.services.commandRegistry.enableCommand(commandName);
    }
  }

  disableCommand(commandName) {
    if (this.services.commandRegistry) {
      this.services.commandRegistry.disableCommand(commandName);
    }
  }
}

module.exports = BotEngine;