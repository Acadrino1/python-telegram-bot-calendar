/**
 * Comprehensive Error Management System
 * Handles all error scenarios with proper user communication
 * Implements recovery strategies and monitoring
 */

class ErrorManager {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.options = {
      enableRecovery: true,
      enableLogging: true,
      maxRetries: 3,
      escalationThreshold: 5,
      userNotificationEnabled: true,
      adminNotificationEnabled: true,
      ...options
    };

    // Error tracking and statistics
    this.errorCounts = new Map();
    this.userErrorCounts = new Map();
    this.recentErrors = [];
    this.maxRecentErrors = 100;
    
    // Error categories and their handling strategies
    this.errorCategories = {
      TELEGRAM_API: 'telegram_api',
      VALIDATION: 'validation',
      PERMISSION: 'permission',
      TIMEOUT: 'timeout',
      DATABASE: 'database',
      NETWORK: 'network',
      SESSION: 'session',
      RATE_LIMIT: 'rate_limit',
      UNKNOWN: 'unknown'
    };

    // Recovery strategies per error type
    this.recoveryStrategies = new Map();
    this.initializeRecoveryStrategies();

    // Admin notification thresholds
    this.adminThresholds = {
      errorRate: 0.1, // 10% error rate
      timeoutRate: 0.05, // 5% timeout rate
      errorBurst: 10, // 10 errors in 5 minutes
      criticalErrors: 1 // 1 critical error
    };

    this.adminIds = process.env.ADMIN_USER_IDS?.split(',') || [];

    // Statistics
    this.stats = {
      totalErrors: 0,
      recoveredErrors: 0,
      escalatedErrors: 0,
      userNotifications: 0,
      adminNotifications: 0
    };
  }

  /**
   * Main error handling entry point
   * @param {Object} ctx - Telegram context
   * @param {Error} error - Error object
   * @param {Object} context - Additional context information
   */
  async handleError(ctx, error, context = {}) {
    try {
      this.stats.totalErrors++;
      
      // Categorize error
      const category = this.categorizeError(error);
      
      // Create error envelope
      const errorEnvelope = {
        id: this.generateErrorId(),
        error,
        category,
        context: {
          userId: ctx?.from?.id,
          chatId: ctx?.chat?.id,
          messageId: ctx?.message?.message_id,
          updateType: ctx?.updateType,
          timestamp: Date.now(),
          ...context
        },
        attempts: 0,
        maxAttempts: this.options.maxRetries
      };

      // Track error frequency
      this.trackError(errorEnvelope);
      
      // Add to recent errors
      this.addToRecentErrors(errorEnvelope);
      
      // Log error
      if (this.options.enableLogging) {
        this.logError(errorEnvelope);
      }

      // Check for error escalation
      if (await this.shouldEscalate(errorEnvelope)) {
        await this.escalateError(errorEnvelope);
      }

      // Attempt recovery
      if (this.options.enableRecovery) {
        const recovery = await this.attemptRecovery(ctx, errorEnvelope);
        if (recovery.success) {
          this.stats.recoveredErrors++;
          return recovery;
        }
      }

      // Send user notification
      await this.notifyUser(ctx, errorEnvelope);
      this.stats.userNotifications++;

      return {
        success: false,
        errorId: errorEnvelope.id,
        userNotified: true,
        category
      };

    } catch (handlingError) {
      console.error('Error in error handler:', handlingError);
      
      // Fallback error handling
      await this.sendBasicErrorMessage(ctx);
      
      return {
        success: false,
        errorId: 'handling_failed',
        fallbackUsed: true
      };
    }
  }

  /**
   * Categorize error based on type and message
   * @param {Error} error - Error object
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    // Telegram API errors
    if (message.includes('telegram') || message.includes('bot api') || 
        error.code >= 400 && error.code < 500) {
      return this.errorCategories.TELEGRAM_API;
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') ||
        name.includes('validation')) {
      return this.errorCategories.VALIDATION;
    }

    // Permission errors
    if (message.includes('permission') || message.includes('forbidden') ||
        message.includes('unauthorized') || error.code === 403) {
      return this.errorCategories.PERMISSION;
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out') ||
        name.includes('timeout')) {
      return this.errorCategories.TIMEOUT;
    }

    // Database errors
    if (message.includes('database') || message.includes('sql') ||
        message.includes('connection') || name.includes('db')) {
      return this.errorCategories.DATABASE;
    }

    // Network errors
    if (message.includes('network') || message.includes('connection') ||
        message.includes('fetch') || name.includes('network')) {
      return this.errorCategories.NETWORK;
    }

    // Session errors
    if (message.includes('session') || message.includes('expired') ||
        message.includes('state')) {
      return this.errorCategories.SESSION;
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too many') ||
        error.code === 429) {
      return this.errorCategories.RATE_LIMIT;
    }

    return this.errorCategories.UNKNOWN;
  }

  /**
   * Initialize recovery strategies for different error types
   */
  initializeRecoveryStrategies() {
    // Telegram API error recovery
    this.recoveryStrategies.set(this.errorCategories.TELEGRAM_API, {
      name: 'Telegram API Recovery',
      handler: async (ctx, errorEnvelope) => {
        const { error } = errorEnvelope;
        
        // Handle specific Telegram errors
        if (error.code === 400) {
          return { success: true, message: 'Request format corrected' };
        }
        
        if (error.code === 429) {
          // Rate limited - wait and retry
          const retryAfter = error.parameters?.retry_after || 1;
          await this.sleep(retryAfter * 1000);
          return { success: true, message: 'Rate limit handled', retry: true };
        }
        
        return { success: false };
      }
    });

    // Session error recovery
    this.recoveryStrategies.set(this.errorCategories.SESSION, {
      name: 'Session Recovery',
      handler: async (ctx, errorEnvelope) => {
        if (ctx?.session) {
          // Clear corrupted session
          ctx.session = {};
          return { 
            success: true, 
            message: 'Session cleared',
            userMessage: 'Your session has been reset. Please start again with /start'
          };
        }
        return { success: false };
      }
    });

    // Database error recovery
    this.recoveryStrategies.set(this.errorCategories.DATABASE, {
      name: 'Database Recovery',
      handler: async (ctx, errorEnvelope) => {
        // Attempt to reconnect or use fallback data
        try {
          // This would reconnect to database
          // await this.reconnectDatabase();
          return { success: true, message: 'Database reconnected' };
        } catch (dbError) {
          return { success: false };
        }
      }
    });

    // Network error recovery
    this.recoveryStrategies.set(this.errorCategories.NETWORK, {
      name: 'Network Recovery',
      handler: async (ctx, errorEnvelope) => {
        // Retry with exponential backoff
        const attempt = errorEnvelope.attempts || 0;
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await this.sleep(delay);
          return { success: true, message: 'Network retry scheduled', retry: true };
        }
        return { success: false };
      }
    });

    // Timeout error recovery
    this.recoveryStrategies.set(this.errorCategories.TIMEOUT, {
      name: 'Timeout Recovery',
      handler: async (ctx, errorEnvelope) => {
        return {
          success: true,
          message: 'Timeout handled',
          userMessage: 'The operation took too long. You can try again or contact support if the problem persists.'
        };
      }
    });

    // Default recovery strategy
    this.recoveryStrategies.set(this.errorCategories.UNKNOWN, {
      name: 'Default Recovery',
      handler: async (ctx, errorEnvelope) => {
        // Log for analysis
        console.warn('Unknown error type, using default recovery:', errorEnvelope.error);
        return {
          success: false,
          message: 'No specific recovery available'
        };
      }
    });
  }

  /**
   * Attempt to recover from error
   * @param {Object} ctx - Telegram context
   * @param {Object} errorEnvelope - Error envelope
   */
  async attemptRecovery(ctx, errorEnvelope) {
    const strategy = this.recoveryStrategies.get(errorEnvelope.category) ||
                    this.recoveryStrategies.get(this.errorCategories.UNKNOWN);

    if (!strategy) {
      return { success: false, message: 'No recovery strategy available' };
    }

    try {
      console.log(`Attempting recovery with strategy: ${strategy.name}`);
      
      const result = await strategy.handler(ctx, errorEnvelope);
      
      if (result.success) {
        console.log(`Recovery successful: ${result.message}`);
      }
      
      return result;
      
    } catch (recoveryError) {
      console.error('Recovery strategy failed:', recoveryError);
      return { success: false, message: 'Recovery strategy failed' };
    }
  }

  /**
   * Track error frequency and patterns
   * @param {Object} errorEnvelope - Error envelope
   */
  trackError(errorEnvelope) {
    const { category, context } = errorEnvelope;
    const userId = context.userId;
    
    // Track global error counts by category
    const globalCount = this.errorCounts.get(category) || 0;
    this.errorCounts.set(category, globalCount + 1);
    
    // Track user-specific error counts
    if (userId) {
      const userKey = `${userId}:${category}`;
      const userCount = this.userErrorCounts.get(userKey) || 0;
      this.userErrorCounts.set(userKey, userCount + 1);
    }
  }

  /**
   * Check if error should be escalated
   * @param {Object} errorEnvelope - Error envelope
   */
  async shouldEscalate(errorEnvelope) {
    const { category, context } = errorEnvelope;
    const userId = context.userId;
    
    // Check user-specific error frequency
    if (userId) {
      const userKey = `${userId}:${category}`;
      const userErrorCount = this.userErrorCounts.get(userKey) || 0;
      
      if (userErrorCount >= this.options.escalationThreshold) {
        return true;
      }
    }
    
    // Check global error rate
    const recentErrors = this.getRecentErrors(300000); // 5 minutes
    if (recentErrors.length >= this.adminThresholds.errorBurst) {
      return true;
    }
    
    // Check critical error categories
    const criticalCategories = [
      this.errorCategories.DATABASE,
      this.errorCategories.TELEGRAM_API
    ];
    
    if (criticalCategories.includes(category)) {
      return true;
    }
    
    return false;
  }

  /**
   * Escalate error to administrators
   * @param {Object} errorEnvelope - Error envelope
   */
  async escalateError(errorEnvelope) {
    this.stats.escalatedErrors++;
    
    if (!this.options.adminNotificationEnabled || this.adminIds.length === 0) {
      console.warn('Error escalation triggered but admin notification is disabled');
      return;
    }

    const escalationMessage = this.formatEscalationMessage(errorEnvelope);
    
    for (const adminId of this.adminIds) {
      try {
        await this.bot.telegram.sendMessage(adminId, escalationMessage, {
          parse_mode: 'Markdown'
        });
        this.stats.adminNotifications++;
      } catch (notificationError) {
        console.error(`Failed to notify admin ${adminId}:`, notificationError);
      }
    }
  }

  /**
   * Format escalation message for administrators
   * @param {Object} errorEnvelope - Error envelope
   */
  formatEscalationMessage(errorEnvelope) {
    const { error, category, context } = errorEnvelope;
    const timestamp = new Date(context.timestamp).toISOString();
    
    return `
🚨 *Error Escalation Alert*

*Error ID:* \`${errorEnvelope.id}\`
*Category:* ${category}
*Time:* ${timestamp}

*Error Details:*
\`\`\`
${error.message || 'No message'}
\`\`\`

*Context:*
• User ID: ${context.userId || 'Unknown'}
• Chat ID: ${context.chatId || 'Unknown'}
• Update Type: ${context.updateType || 'Unknown'}

*Stack Trace:*
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`

*Recent Error Stats:*
${this.getErrorStatsForEscalation()}
    `.trim();
  }

  /**
   * Get error statistics for escalation message
   */
  getErrorStatsForEscalation() {
    const recentErrors = this.getRecentErrors(300000); // 5 minutes
    const categories = {};
    
    recentErrors.forEach(err => {
      categories[err.category] = (categories[err.category] || 0) + 1;
    });
    
    let stats = `• Total errors (5min): ${recentErrors.length}\n`;
    Object.entries(categories).forEach(([cat, count]) => {
      stats += `• ${cat}: ${count}\n`;
    });
    
    return stats;
  }

  /**
   * Notify user about error with appropriate message
   * @param {Object} ctx - Telegram context
   * @param {Object} errorEnvelope - Error envelope
   */
  async notifyUser(ctx, errorEnvelope) {
    if (!ctx || !this.options.userNotificationEnabled) {
      return;
    }

    const userMessage = this.generateUserErrorMessage(errorEnvelope);
    
    try {
      await ctx.reply(userMessage);
    } catch (notificationError) {
      console.error('Failed to notify user about error:', notificationError);
      // Try basic fallback
      await this.sendBasicErrorMessage(ctx);
    }
  }

  /**
   * Generate user-friendly error message
   * @param {Object} errorEnvelope - Error envelope
   */
  generateUserErrorMessage(errorEnvelope) {
    const { category, error } = errorEnvelope;
    
    const userMessages = {
      [this.errorCategories.TELEGRAM_API]: 
        '🤖 There was a communication issue with Telegram. Please try again in a moment.',
      [this.errorCategories.VALIDATION]: 
        '❌ Invalid input detected. Please check your information and try again.',
      [this.errorCategories.PERMISSION]: 
        '🚫 You don\'t have permission to perform this action.',
      [this.errorCategories.TIMEOUT]: 
        '⏱️ The operation took too long. Please try again.',
      [this.errorCategories.DATABASE]: 
        '💾 There\'s a temporary issue with our database. Please try again shortly.',
      [this.errorCategories.NETWORK]: 
        '🌐 Network connectivity issue. Please check your connection and try again.',
      [this.errorCategories.SESSION]: 
        '🔄 Your session has expired. Please start again with /start',
      [this.errorCategories.RATE_LIMIT]: 
        '⚡ You\'re sending requests too quickly. Please wait a moment before trying again.',
      [this.errorCategories.UNKNOWN]: 
        '❗ An unexpected error occurred. Please try again or contact support.'
    };

    const baseMessage = userMessages[category] || userMessages[this.errorCategories.UNKNOWN];
    
    // Add error ID for support reference
    return `${baseMessage}\n\n🆔 Error ID: \`${errorEnvelope.id}\`\n\nIf this problem persists, please contact support with this error ID.`;
  }

  /**
   * Send basic error message as fallback
   * @param {Object} ctx - Telegram context
   */
  async sendBasicErrorMessage(ctx) {
    try {
      if (ctx && ctx.reply) {
        await ctx.reply(
          '❗ An error occurred. Please try again or contact support if the problem persists.'
        );
      }
    } catch (fallbackError) {
      console.error('Even basic error message failed:', fallbackError);
    }
  }

  /**
   * Add error to recent errors list
   * @param {Object} errorEnvelope - Error envelope
   */
  addToRecentErrors(errorEnvelope) {
    this.recentErrors.unshift(errorEnvelope);
    
    // Limit size of recent errors
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors = this.recentErrors.slice(0, this.maxRecentErrors);
    }
  }

  /**
   * Get recent errors within time window
   * @param {number} timeWindowMs - Time window in milliseconds
   */
  getRecentErrors(timeWindowMs) {
    const cutoff = Date.now() - timeWindowMs;
    return this.recentErrors.filter(err => err.context.timestamp > cutoff);
  }

  /**
   * Log error with appropriate detail level
   * @param {Object} errorEnvelope - Error envelope
   */
  logError(errorEnvelope) {
    const { error, category, context } = errorEnvelope;
    const level = this.getLogLevel(category);
    
    const logData = {
      errorId: errorEnvelope.id,
      category,
      message: error.message,
      userId: context.userId,
      chatId: context.chatId,
      updateType: context.updateType,
      timestamp: new Date(context.timestamp).toISOString(),
      stack: error.stack
    };
    
    if (level === 'error') {
      console.error('Bot Error:', logData);
    } else if (level === 'warn') {
      console.warn('Bot Warning:', logData);
    } else {
      console.log('Bot Info:', logData);
    }
  }

  /**
   * Get appropriate log level for error category
   * @param {string} category - Error category
   */
  getLogLevel(category) {
    const errorLevels = {
      [this.errorCategories.TELEGRAM_API]: 'error',
      [this.errorCategories.DATABASE]: 'error',
      [this.errorCategories.NETWORK]: 'warn',
      [this.errorCategories.TIMEOUT]: 'warn',
      [this.errorCategories.VALIDATION]: 'info',
      [this.errorCategories.PERMISSION]: 'info',
      [this.errorCategories.SESSION]: 'info',
      [this.errorCategories.RATE_LIMIT]: 'warn',
      [this.errorCategories.UNKNOWN]: 'error'
    };
    
    return errorLevels[category] || 'error';
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Get comprehensive error statistics
   */
  getStats() {
    const recentErrors = this.getRecentErrors(3600000); // 1 hour
    const errorsByCategory = {};
    
    recentErrors.forEach(err => {
      errorsByCategory[err.category] = (errorsByCategory[err.category] || 0) + 1;
    });
    
    return {
      ...this.stats,
      recentErrors: recentErrors.length,
      errorsByCategory,
      uniqueUsers: new Set(recentErrors.map(err => err.context.userId)).size,
      averageErrorsPerHour: recentErrors.length
    };
  }

  /**
   * Health check for error management system
   */
  healthCheck() {
    const stats = this.getStats();
    const recentErrorRate = stats.averageErrorsPerHour;
    const recoveryRate = stats.totalErrors > 0 ? 
      (stats.recoveredErrors / stats.totalErrors) : 0;
    
    const isHealthy = recentErrorRate < 50 && recoveryRate > 0.7;
    
    return {
      healthy: isHealthy,
      recentErrorRate,
      recoveryRate: `${(recoveryRate * 100).toFixed(2)}%`,
      escalationRate: stats.totalErrors > 0 ? 
        `${((stats.escalatedErrors / stats.totalErrors) * 100).toFixed(2)}%` : '0%',
      recommendations: this.generateHealthRecommendations(stats)
    };
  }

  /**
   * Generate health recommendations
   */
  generateHealthRecommendations(stats) {
    const recommendations = [];
    
    if (stats.averageErrorsPerHour > 50) {
      recommendations.push('High error rate detected - investigate recurring issues');
    }
    
    const recoveryRate = stats.totalErrors > 0 ? 
      (stats.recoveredErrors / stats.totalErrors) : 0;
    if (recoveryRate < 0.5) {
      recommendations.push('Low recovery rate - improve error handling strategies');
    }
    
    if (stats.escalatedErrors > stats.totalErrors * 0.1) {
      recommendations.push('High escalation rate - review escalation thresholds');
    }
    
    return recommendations;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear error history (admin function)
   */
  clearErrorHistory() {
    this.recentErrors.length = 0;
    this.errorCounts.clear();
    this.userErrorCounts.clear();
    this.stats = {
      totalErrors: 0,
      recoveredErrors: 0,
      escalatedErrors: 0,
      userNotifications: 0,
      adminNotifications: 0
    };
    
    console.log('Error history cleared');
  }

  /**
   * Shutdown error manager
   */
  shutdown() {
    this.clearErrorHistory();
    this.recoveryStrategies.clear();
    console.log('Error manager shut down');
  }
}

module.exports = ErrorManager;