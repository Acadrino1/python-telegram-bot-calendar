const { Telegraf, session } = require('telegraf');
const PluginManager = require('./PluginManager');
const ErrorHandler = require('./ErrorHandler');
const Logger = require('./Logger');
const EventBus = require('./EventBus');

/**
 * TelegramBotCore - Lightweight core bot class with plugin support
 * Reduced from 2006 lines to ~150 lines with full functionality via plugins
 */
class TelegramBotCore {
  constructor(config = {}) {
    this.config = {
      token: process.env.TELEGRAM_BOT_TOKEN,
      ...config
    };
    
    // Core components
    this.logger = new Logger('BotCore');
    this.eventBus = new EventBus();
    this.errorHandler = new ErrorHandler(this.logger, this.eventBus);
    this.bot = new Telegraf(this.config.token);
    
    // Plugin management
    this.pluginManager = new PluginManager(this);
    this.plugins = new Map();
    
    // Setup core middleware
    this.setupCoreMiddleware();
    
    // Setup global error handling
    this.setupErrorHandling();
    
    this.logger.info('TelegramBotCore initialized');
  }
  
  setupCoreMiddleware() {
    // Session middleware
    this.bot.use(session());
    
    // Request logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const command = ctx.updateType === 'message' ? ctx.message?.text : ctx.updateType;
      
      try {
        await next();
        const ms = Date.now() - start;
        this.logger.debug(`Request processed: ${command} (${ms}ms)`);
      } catch (error) {
        const ms = Date.now() - start;
        this.logger.error(`Request failed: ${command} (${ms}ms)`, error);
        throw error;
      }
    });
    
    // Plugin context injection
    this.bot.use((ctx, next) => {
      ctx.plugins = this.plugins;
      ctx.eventBus = this.eventBus;
      ctx.logger = this.logger;
      return next();
    });
  }
  
  setupErrorHandling() {
    // Global error handler
    this.bot.catch((err, ctx) => {
      this.errorHandler.handle(err, ctx);
    });
    
    // Process error handlers
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection:', reason);
    });
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.gracefulShutdown();
    });
  }
  
  async loadPlugin(pluginName, PluginClass) {
    try {
      return await this.pluginManager.load(pluginName, PluginClass);
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginName}:`, error);
      return false;
    }
  }
  
  async unloadPlugin(pluginName) {
    try {
      return await this.pluginManager.unload(pluginName);
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginName}:`, error);
      return false;
    }
  }
  
  async reloadPlugin(pluginName) {
    try {
      return await this.pluginManager.reload(pluginName);
    } catch (error) {
      this.logger.error(`Failed to reload plugin ${pluginName}:`, error);
      return false;
    }
  }
  
  getPluginStatuses() {
    return this.pluginManager.getStatuses();
  }
  
  async start() {
    try {
      // Load configured plugins
      await this.pluginManager.loadConfiguredPlugins();
      
      // Start the bot
      await this.bot.launch();
      
      this.logger.info('🤖 Bot started successfully!');
      this.eventBus.emit('bot:started');
      
      // Enable graceful stop
      process.once('SIGINT', () => this.gracefulShutdown('SIGINT'));
      process.once('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
      
    } catch (error) {
      this.logger.error('Failed to start bot:', error);
      throw error;
    }
  }
  
  async gracefulShutdown(signal) {
    this.logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Notify plugins
      this.eventBus.emit('bot:stopping');
      
      // Unload all plugins
      await this.pluginManager.unloadAll();
      
      // Stop the bot
      this.bot.stop(signal);
      
      this.logger.info('Bot stopped gracefully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

module.exports = TelegramBotCore;