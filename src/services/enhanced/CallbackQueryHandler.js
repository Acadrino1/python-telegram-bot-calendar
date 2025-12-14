/**
 * Enhanced Callback Query Handler for Telegram Bot
 * Provides compliant callback query handling to prevent spinning indicators
 */

const EventEmitter = require('events');

class CallbackQueryHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      defaultTimeoutMs: options.defaultTimeoutMs || 30000, // 30 seconds
      maxRetries: options.maxRetries || 3,
      enableLogging: options.enableLogging !== false,
      autoAnswer: options.autoAnswer !== false,
      cacheResults: options.cacheResults !== false,
      ...options
    };
    
    // Track pending callbacks
    this.pendingCallbacks = new Map();
    this.callbackCache = new Map();
    this.stats = {
      total: 0,
      answered: 0,
      timedOut: 0,
      errors: 0,
      cached: 0
    };
    
    console.log('✅ CallbackQueryHandler initialized');
  }

  /**
   * Register callback query handlers on the bot
   */
  setupHandlers(bot) {
    this.bot = bot;
    
    // Handle all callback queries with automatic answering
    bot.on('callback_query', async (callbackQuery) => {
      await this.handleCallbackQuery(callbackQuery);
    });
    
    // Handle inline callback queries
    bot.on('chosen_inline_result', async (chosenResult) => {
      await this.handleInlineCallback(chosenResult);
    });
    
    console.log('✅ Callback query handlers registered');
  }

  /**
   * Handle callback query with automatic answering
   */
  async handleCallbackQuery(callbackQuery) {
    // Add comprehensive null checks
    if (!callbackQuery) {
      console.error('❌ Received null or undefined callback query');
      return;
    }
    
    const queryId = callbackQuery.id;
    const userId = callbackQuery.from?.id;
    const data = callbackQuery.data;
    
    // Validate essential fields
    if (!queryId || !userId || !data) {
      console.error('❌ Invalid callback query structure:', {
        hasQueryId: !!queryId,
        hasUserId: !!userId,
        hasData: !!data
      });
      return;
    }
    
    this.stats.total++;
    
    try {
      console.log(`📞 Processing callback query: ${queryId} from user ${userId}`);
      
      // Track pending callback
      this.trackPendingCallback(queryId, callbackQuery);
      
      // Check cache first
      const cachedResponse = this.getCachedResponse(data, userId);
      if (cachedResponse) {
        await this.answerCallbackQuery(queryId, cachedResponse.text, cachedResponse.options);
        this.stats.cached++;
        this.emit('callback-handled', { queryId, userId, data, cached: true });
        return;
      }
      
      // Process the callback based on data
      const result = await this.processCallbackData(callbackQuery);
      
      // Answer the callback query to stop spinning indicator
      await this.answerCallbackQuery(queryId, result.text, result.options);
      
      // Cache successful results
      if (this.config.cacheResults && result.cacheable) {
        this.cacheResponse(data, userId, result);
      }
      
      this.stats.answered++;
      this.emit('callback-handled', { queryId, userId, data, result });
      
    } catch (error) {
      console.error(`❌ Error handling callback query ${queryId}:`, error);
      
      // Always answer callback query even on error
      await this.answerCallbackQuery(queryId, 'An error occurred. Please try again.', {
        show_alert: false
      });
      
      this.stats.errors++;
      this.emit('callback-error', { queryId, userId, data, error });
      
    } finally {
      // Remove from pending callbacks
      this.pendingCallbacks.delete(queryId);
    }
  }

  /**
   * Process callback data and determine response
   */
  async processCallbackData(callbackQuery) {
    // Add null check for callback query and data
    if (!callbackQuery || !callbackQuery.data) {
      console.error('Invalid callback query: missing data');
      return {
        text: 'Invalid request. Please try again.',
        showAlert: true
      };
    }
    
    const data = callbackQuery.data;
    const userId = callbackQuery.from?.id;
    
    // Ensure userId exists
    if (!userId) {
      console.error('Invalid callback query: missing user ID');
      return {
        text: 'Invalid request. Please try again.',
        showAlert: true
      };
    }
    
    // Parse callback data safely
    const parts = data.split('_');
    const action = parts[0];
    const params = parts.slice(1);
    
    switch (action) {
      case 'book':
        return await this.handleBookingCallback(callbackQuery, params);
      
      case 'calendar':
        return await this.handleCalendarCallback(callbackQuery, params);
      
      case 'service':
        return await this.handleServiceCallback(callbackQuery, params);
      
      case 'confirm':
        return await this.handleConfirmCallback(callbackQuery, params);
      
      case 'cancel':
        return await this.handleCancelCallback(callbackQuery, params);
      
      case 'back':
        return await this.handleBackCallback(callbackQuery, params);
      
      case 'refresh':
        return await this.handleRefreshCallback(callbackQuery, params);
      
      default:
        return {
          text: '✅ Action processed',
          options: { show_alert: false },
          cacheable: false
        };
    }
  }

  /**
   * Handle booking-related callbacks
   */
  async handleBookingCallback(callbackQuery, params) {
    const [serviceId, timeSlot] = params;
    
    try {
      // Simulate booking process
      console.log(`📅 Processing booking: service=${serviceId}, slot=${timeSlot}`);
      
      return {
        text: `✅ Booking request received for service ${serviceId} at ${timeSlot}`,
        options: { show_alert: false },
        cacheable: false
      };
      
    } catch (error) {
      return {
        text: '❌ Booking failed. Please try again.',
        options: { show_alert: true },
        cacheable: false
      };
    }
  }

  /**
   * Handle calendar navigation callbacks
   */
  async handleCalendarCallback(callbackQuery, params) {
    const [action, date] = params;
    
    return {
      text: `📅 Calendar ${action}: ${date}`,
      options: { show_alert: false },
      cacheable: true
    };
  }

  /**
   * Handle service selection callbacks
   */
  async handleServiceCallback(callbackQuery, params) {
    const [serviceId] = params;
    
    return {
      text: `📱 Service selected: ${serviceId}`,
      options: { show_alert: false },
      cacheable: true
    };
  }

  /**
   * Handle confirmation callbacks
   */
  async handleConfirmCallback(callbackQuery, params) {
    const [action] = params;
    
    return {
      text: `✅ Confirmed: ${action}`,
      options: { show_alert: false },
      cacheable: false
    };
  }

  /**
   * Handle cancellation callbacks
   */
  async handleCancelCallback(callbackQuery, params) {
    return {
      text: '❌ Action cancelled',
      options: { show_alert: false },
      cacheable: false
    };
  }

  /**
   * Handle back navigation callbacks
   */
  async handleBackCallback(callbackQuery, params) {
    return {
      text: '⬅️ Navigating back',
      options: { show_alert: false },
      cacheable: true
    };
  }

  /**
   * Handle refresh callbacks
   */
  async handleRefreshCallback(callbackQuery, params) {
    return {
      text: '🔄 Content refreshed',
      options: { show_alert: false },
      cacheable: false
    };
  }

  /**
   * Handle inline callback results
   */
  async handleInlineCallback(chosenResult) {
    const resultId = chosenResult.result_id;
    const userId = chosenResult.from.id;
    
    console.log(`📞 Processing inline callback: ${resultId} from user ${userId}`);
    
    this.emit('inline-callback-handled', { resultId, userId, chosenResult });
  }

  /**
   * Answer callback query to stop spinning indicator
   */
  async answerCallbackQuery(queryId, text = '', options = {}) {
    if (!this.bot) {
      console.warn('⚠️ Bot not initialized, cannot answer callback query');
      return false;
    }
    
    try {
      const defaultOptions = {
        show_alert: false,
        cache_time: 0,
        ...options
      };
      
      await this.bot.telegram.answerCbQuery(queryId, text, defaultOptions);
      
      if (this.config.enableLogging) {
        console.log(`✅ Answered callback query: ${queryId}`);
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to answer callback query ${queryId}:`, error);
      
      // Retry with basic response
      try {
        await this.bot.telegram.answerCbQuery(queryId, '', { show_alert: false });
        console.log(`✅ Answered callback query with retry: ${queryId}`);
        return true;
      } catch (retryError) {
        console.error(`❌ Retry failed for callback query ${queryId}:`, retryError);
        return false;
      }
    }
  }

  /**
   * Track pending callback for timeout handling
   */
  trackPendingCallback(queryId, callbackQuery) {
    const timeout = setTimeout(() => {
      this.handleCallbackTimeout(queryId);
    }, this.config.defaultTimeoutMs);
    
    this.pendingCallbacks.set(queryId, {
      callbackQuery,
      timeout,
      startTime: Date.now()
    });
  }

  /**
   * Handle callback timeout
   */
  async handleCallbackTimeout(queryId) {
    const pending = this.pendingCallbacks.get(queryId);
    if (!pending) return;
    
    console.warn(`⏰ Callback query timeout: ${queryId}`);
    
    // Answer with timeout message
    await this.answerCallbackQuery(queryId, 'Request timed out. Please try again.', {
      show_alert: true
    });
    
    this.stats.timedOut++;
    this.pendingCallbacks.delete(queryId);
    
    this.emit('callback-timeout', { queryId, pending });
  }

  /**
   * Cache callback response
   */
  cacheResponse(data, userId, response) {
    const cacheKey = `${data}_${userId}`;
    const expiry = Date.now() + (5 * 60 * 1000); // 5 minutes
    
    this.callbackCache.set(cacheKey, {
      ...response,
      expiry
    });
    
    // Clean expired cache entries
    this.cleanExpiredCache();
  }

  /**
   * Get cached response
   */
  getCachedResponse(data, userId) {
    const cacheKey = `${data}_${userId}`;
    const cached = this.callbackCache.get(cacheKey);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() > cached.expiry) {
      this.callbackCache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }

  /**
   * Clean expired cache entries
   */
  cleanExpiredCache() {
    const now = Date.now();
    
    for (const [key, cached] of this.callbackCache.entries()) {
      if (now > cached.expiry) {
        this.callbackCache.delete(key);
      }
    }
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      ...this.stats,
      pending: this.pendingCallbacks.size,
      cached: this.callbackCache.size,
      successRate: this.stats.total > 0 ? 
        ((this.stats.answered / this.stats.total) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Clear all pending callbacks and cache
   */
  clearAll() {
    // Clear pending callbacks
    for (const [queryId, pending] of this.pendingCallbacks) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingCallbacks.clear();
    
    // Clear cache
    this.callbackCache.clear();
    
    console.log('🧹 Cleared all callback data');
  }
}

module.exports = CallbackQueryHandler;