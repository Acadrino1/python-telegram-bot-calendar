/**
 * ErrorHandler - Comprehensive error handling with circuit breaker and logging
 */
class ErrorHandler {
  constructor(logger, eventBus) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.pluginErrors = new Map();
    this.globalErrors = [];
    this.maxGlobalErrors = 100;
    this.circuitBreakers = new Map();
  }
  
  handle(error, ctx, pluginName = null) {
    // Log the error
    this.logger.error(`Error ${pluginName ? `in plugin ${pluginName}` : 'in bot'}:`, error);
    
    // Record error
    this.recordError(error, pluginName);
    
    // Get user-friendly message
    const message = this.getUserMessage(error, pluginName);
    
    // Send response to user
    if (ctx) {
      this.sendErrorResponse(ctx, message);
    }
    
    // Emit error event
    this.eventBus.emit('error:handled', {
      error,
      pluginName,
      timestamp: Date.now()
    });
  }
  
  recordError(error, pluginName) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };
    
    if (pluginName) {
      if (!this.pluginErrors.has(pluginName)) {
        this.pluginErrors.set(pluginName, []);
      }
      const errors = this.pluginErrors.get(pluginName);
      errors.push(errorData);
      
      // Keep only last 50 errors per plugin
      if (errors.length > 50) {
        errors.shift();
      }
    } else {
      this.globalErrors.push(errorData);
      
      if (this.globalErrors.length > this.maxGlobalErrors) {
        this.globalErrors.shift();
      }
    }
  }
  
  recordPluginError(pluginName, error) {
    this.recordError(error, pluginName);
  }
  
  getPluginErrors(pluginName) {
    return this.pluginErrors.get(pluginName) || [];
  }
  
  getUserMessage(error, pluginName) {
    // Check for specific error types
    if (error.code === 'ETIMEDOUT') {
      return '⏱️ Request timed out. Please try again.';
    }
    
    if (error.code === 'ECONNREFUSED') {
      return '🔌 Connection error. Please try again later.';
    }
    
    if (error.message?.includes('rate limit')) {
      return '⚠️ Too many requests. Please wait a moment.';
    }
    
    if (error.message?.includes('permission')) {
      return '🔒 Permission denied. Please contact support.';
    }
    
    // Plugin-specific messages
    if (pluginName) {
      return `⚠️ ${pluginName} service encountered an issue. Please try again.`;
    }
    
    // Default message
    return '❌ Something went wrong. Please try again or contact support.';
  }
  
  sendErrorResponse(ctx, message) {
    if (ctx.answerCbQuery) {
      ctx.answerCbQuery(message).catch(e => console.warn('Error response callback failed:', e.message));
    } else if (ctx.reply) {
      ctx.reply(message).catch(e => console.warn('Error response reply failed:', e.message));
    }
  }
  
  getCircuitBreaker(name) {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, {
        failures: 0,
        threshold: 5,
        timeout: 60000,
        state: 'closed',
        lastFailure: null
      });
    }
    return this.circuitBreakers.get(name);
  }
  
  clearErrors(pluginName = null) {
    if (pluginName) {
      this.pluginErrors.delete(pluginName);
    } else {
      this.globalErrors = [];
    }
  }
  
  getErrorStats() {
    const stats = {
      global: this.globalErrors.length,
      plugins: {}
    };
    
    for (const [name, errors] of this.pluginErrors) {
      stats.plugins[name] = errors.length;
    }
    
    return stats;
  }
}

module.exports = ErrorHandler;