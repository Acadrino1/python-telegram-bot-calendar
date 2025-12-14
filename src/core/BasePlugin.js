const EventEmitter = require('events');

/**
 * BasePlugin - Abstract base class for all plugins
 * Provides lifecycle hooks, error handling, and common functionality
 */
class BasePlugin extends EventEmitter {
  constructor(bot, config = {}) {
    super();
    
    // Core references
    this.bot = bot;
    this.telegram = bot.bot;
    this.logger = bot.logger;
    this.eventBus = bot.eventBus;
    this.errorHandler = bot.errorHandler;
    
    // Plugin metadata
    this.name = this.constructor.name.replace('Plugin', '').toLowerCase();
    this.version = '1.0.0';
    this.description = 'Base plugin';
    this.author = 'System';
    
    // Plugin configuration
    this.config = {
      enabled: true,
      ...config
    };
    
    // Plugin state
    this.enabled = this.config.enabled;
    this.initialized = false;
    this.health = 'healthy';
    this.metrics = {
      commandsProcessed: 0,
      errors: 0,
      lastActivity: Date.now()
    };
    
    // Command and handler registries
    this.commands = {};
    this.handlers = {};
    this.middleware = [];
    
    // Dependencies
    this.dependencies = [];
    
    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      threshold: 5,
      timeout: 60000,
      state: 'closed',
      lastFailure: null
    };
  }
  
  /**
   * Lifecycle: Called when plugin is loaded
   */
  async onLoad() {
    try {
      this.logger.info(`Loading plugin: ${this.name}`);
      
      // Check dependencies
      await this.checkDependencies();
      
      // Initialize plugin
      await this.initialize();
      
      // Register event listeners
      this.registerEventListeners();
      
      this.initialized = true;
      this.health = 'healthy';
      
      this.logger.info(`Plugin ${this.name} loaded successfully`);
    } catch (error) {
      this.logger.error(`Failed to load plugin ${this.name}:`, error);
      this.health = 'failed';
      throw error;
    }
  }
  
  /**
   * Lifecycle: Called when plugin is unloaded
   */
  async onUnload() {
    try {
      this.logger.info(`Unloading plugin: ${this.name}`);
      
      // Cleanup plugin resources
      await this.cleanup();
      
      // Remove event listeners
      this.removeAllListeners();
      this.eventBus.removeAllListeners(`plugin:${this.name}:*`);
      
      this.initialized = false;
      this.health = 'unloaded';
      
      this.logger.info(`Plugin ${this.name} unloaded successfully`);
    } catch (error) {
      this.logger.error(`Error unloading plugin ${this.name}:`, error);
    }
  }
  
  /**
   * Lifecycle: Called when plugin is enabled
   */
  async onEnable() {
    this.enabled = true;
    this.logger.info(`Plugin ${this.name} enabled`);
  }
  
  /**
   * Lifecycle: Called when plugin is disabled
   */
  async onDisable() {
    this.enabled = false;
    this.logger.info(`Plugin ${this.name} disabled`);
  }
  
  /**
   * Initialize plugin - Override in subclasses
   */
  async initialize() {
    // Override in subclasses
  }
  
  /**
   * Cleanup plugin resources - Override in subclasses
   */
  async cleanup() {
    // Override in subclasses
  }
  
  /**
   * Check plugin dependencies
   */
  async checkDependencies() {
    for (const dep of this.dependencies) {
      if (!this.bot.plugins.has(dep)) {
        throw new Error(`Missing dependency: ${dep}`);
      }
    }
  }
  
  /**
   * Register event listeners for inter-plugin communication
   */
  registerEventListeners() {
    // Listen for plugin-specific events
    this.eventBus.on(`plugin:${this.name}:command`, (data) => {
      this.handlePluginCommand(data);
    });
  }
  
  /**
   * Handle inter-plugin commands
   */
  handlePluginCommand(data) {
    // Override in subclasses
  }
  
  /**
   * Register a command handler
   */
  registerCommand(command, handler, options = {}) {
    this.commands[command] = async (ctx) => {
      if (!this.enabled) {
        return ctx.reply(`${this.name} plugin is currently disabled.`);
      }
      
      if (this.circuitBreaker.state === 'open') {
        return this.handleCircuitBreakerOpen(ctx);
      }
      
      try {
        this.metrics.commandsProcessed++;
        this.metrics.lastActivity = Date.now();
        
        await handler.call(this, ctx);
        
        // Reset circuit breaker on success
        this.circuitBreaker.failures = 0;
        
      } catch (error) {
        this.handleError(error, ctx);
      }
    };
  }
  
  /**
   * Register an action handler
   */
  registerAction(action, handler) {
    this.handlers[`action:${action}`] = async (ctx) => {
      if (!this.enabled) {
        return ctx.answerCbQuery(`${this.name} plugin is currently disabled.`);
      }
      
      if (this.circuitBreaker.state === 'open') {
        return this.handleCircuitBreakerOpen(ctx);
      }
      
      try {
        await handler.call(this, ctx);
        this.circuitBreaker.failures = 0;
      } catch (error) {
        this.handleError(error, ctx);
      }
    };
  }
  
  /**
   * Handle errors with circuit breaker pattern
   */
  handleError(error, ctx) {
    this.metrics.errors++;
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    
    this.logger.error(`Error in plugin ${this.name}:`, error);
    
    // Check if circuit breaker should open
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.openCircuitBreaker();
    }
    
    // Graceful error response
    const errorMessage = this.getErrorMessage(error);
    if (ctx.answerCbQuery) {
      ctx.answerCbQuery(errorMessage).catch(e => console.warn('Plugin error callback failed:', e.message));
    } else {
      ctx.reply(errorMessage).catch(e => console.warn('Plugin error reply failed:', e.message));
    }
  }
  
  /**
   * Open circuit breaker
   */
  openCircuitBreaker() {
    this.circuitBreaker.state = 'open';
    this.health = 'degraded';
    
    this.logger.warn(`Circuit breaker opened for plugin ${this.name}`);
    
    // Schedule circuit breaker reset
    setTimeout(() => {
      this.circuitBreaker.state = 'half-open';
      this.circuitBreaker.failures = 0;
      this.logger.info(`Circuit breaker half-opened for plugin ${this.name}`);
    }, this.circuitBreaker.timeout);
  }
  
  /**
   * Handle circuit breaker open state
   */
  handleCircuitBreakerOpen(ctx) {
    const message = `⚠️ ${this.name} service is temporarily unavailable. Please try again later.`;
    if (ctx.answerCbQuery) {
      return ctx.answerCbQuery(message);
    }
    return ctx.reply(message);
  }
  
  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    if (process.env.NODE_ENV === 'development') {
      return `Error: ${error.message}`;
    }
    return `Sorry, something went wrong. Please try again later.`;
  }
  
  /**
   * Get plugin health status
   */
  getHealth() {
    if (this.circuitBreaker.state === 'open') {
      return 'unhealthy';
    }
    if (this.circuitBreaker.failures > 0) {
      return 'degraded';
    }
    return 'healthy';
  }
  
  /**
   * Get plugin metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      health: this.getHealth(),
      circuitBreakerState: this.circuitBreaker.state
    };
  }
}

module.exports = BasePlugin;