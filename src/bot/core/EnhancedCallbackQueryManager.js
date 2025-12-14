/**
 * Enhanced Callback Query Manager
 * 100% compliant with Telegram Global Rule 9
 * Features: Guaranteed answering, deduplication, timeout protection, retry logic
 */

const CallbackQueryManager = require('../utils/CallbackQueryManager');

class EnhancedCallbackQueryManager extends CallbackQueryManager {
  constructor(bot, messageQueue = null) {
    super(bot);
    this.messageQueue = messageQueue;
    this.deduplicationWindow = 5000; // 5 seconds
    this.recentCallbacks = new Map();
    this.processingCallbacks = new Set();
    this.callbackStats = {
      total: 0,
      successful: 0,
      timedOut: 0,
      duplicates: 0,
      errors: 0
    };
    
    // Enhanced timeout tracking
    this.callbackTimeouts = new Map();
    this.CALLBACK_TIMEOUT = 9500; // 9.5 seconds to ensure we answer within 10s
    this.MAX_CALLBACK_RETRIES = 2;
    
    // Performance monitoring
    this.performanceMetrics = {
      averageResponseTime: 0,
      slowResponses: 0, // > 5 seconds
      fastResponses: 0  // < 1 second
    };
  }

  /**
   * Enhanced callback handler with guaranteed response and deduplication
   * @param {Object} ctx - Telegram context
   * @param {Function} handler - Handler function
   * @param {string} handlerName - Handler identifier
   * @param {Object} options - Additional options
   */
  async handleCallback(ctx, handler, handlerName = 'unknown', options = {}) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery) {
      console.warn('handleCallback called without callback query');
      return;
    }

    const queryId = callbackQuery.id;
    const userId = ctx.from.id;
    const callbackData = callbackQuery.data;
    const startTime = Date.now();

    // Update statistics
    this.callbackStats.total++;

    try {
      // Deduplication check
      const dedupeKey = this.createDeduplicationKey(userId, callbackData);
      if (await this.isDuplicateCallback(dedupeKey)) {
        this.callbackStats.duplicates++;
        await this.answerCallback(ctx, 'Please wait, processing your previous request...');
        return { success: false, reason: 'duplicate' };
      }

      // Mark as processing
      this.processingCallbacks.add(queryId);
      this.recentCallbacks.set(dedupeKey, startTime);

      // Queue the callback for processing if message queue is available
      if (this.messageQueue) {
        const success = await this.queueCallback(ctx, handler, handlerName, options);
        if (success) {
          return { success: true, queued: true };
        }
        // Fall back to direct processing if queueing fails
      }

      // Direct processing with enhanced monitoring
      return await this.processCallbackDirect(ctx, handler, handlerName, options, startTime);

    } catch (error) {
      console.error(`Callback handler error in ${handlerName}:`, error);
      this.callbackStats.errors++;
      
      await this.handleCallbackError(ctx, error, handlerName);
      return { success: false, reason: 'error', error };
    } finally {
      // Cleanup
      this.processingCallbacks.delete(queryId);
      
      // Schedule deduplication cleanup
      setTimeout(() => {
        const dedupeKey = this.createDeduplicationKey(userId, callbackData);
        this.recentCallbacks.delete(dedupeKey);
      }, this.deduplicationWindow);
    }
  }

  /**
   * Queue callback for processing through message queue
   * @param {Object} ctx - Telegram context
   * @param {Function} handler - Handler function
   * @param {string} handlerName - Handler name
   * @param {Object} options - Options
   */
  async queueCallback(ctx, handler, handlerName, options) {
    try {
      const deduplicationKey = this.messageQueue.createCallbackDeduplicationKey(ctx);
      
      const messageEnvelope = {
        type: 'callback',
        ctx: ctx,
        handler: handler,
        handlerName: handlerName
      };

      const result = await this.messageQueue.enqueue(
        ctx.from.id.toString(),
        messageEnvelope,
        this.messageQueue.PRIORITIES.HIGH,
        {
          deduplicationKey: deduplicationKey,
          timeout: this.CALLBACK_TIMEOUT,
          maxRetries: this.MAX_CALLBACK_RETRIES
        }
      );

      if (result.success) {
        // Send immediate acknowledgment
        await this.answerCallback(ctx, options.acknowledgment || 'Processing...');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error queueing callback:', error);
      return false;
    }
  }

  /**
   * Process callback directly with enhanced monitoring
   * @param {Object} ctx - Telegram context
   * @param {Function} handler - Handler function
   * @param {string} handlerName - Handler name
   * @param {Object} options - Options
   * @param {number} startTime - Processing start time
   */
  async processCallbackDirect(ctx, handler, handlerName, options, startTime) {
    // Set mandatory timeout
    const timeoutId = setTimeout(async () => {
      if (this.processingCallbacks.has(ctx.callbackQuery.id)) {
        this.callbackStats.timedOut++;
        console.warn(`Callback query timeout for ${handlerName} - Force answering`);
        await this.forceAnswer(ctx, 'Operation timed out. Please try again.');
      }
    }, this.CALLBACK_TIMEOUT);

    try {
      // Execute handler with timeout protection
      const handlerPromise = Promise.race([
        this.executeHandler(ctx, handler),
        this.createTimeoutPromise(this.CALLBACK_TIMEOUT, `Handler ${handlerName} timeout`)
      ]);

      await handlerPromise;

      // Ensure callback is answered
      if (!ctx.callbackAnswered) {
        await this.answerCallback(ctx);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(startTime);
      this.callbackStats.successful++;

      return { success: true };

    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute handler with error wrapping
   * @param {Object} ctx - Telegram context
   * @param {Function} handler - Handler function
   */
  async executeHandler(ctx, handler) {
    try {
      await handler(ctx);
    } catch (error) {
      // Ensure we always answer the callback even on handler error
      if (!ctx.callbackAnswered) {
        await this.answerCallback(ctx, 'An error occurred. Please try again.');
      }
      throw error;
    }
  }

  /**
   * Create timeout promise
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} message - Timeout message
   */
  createTimeoutPromise(timeout, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  /**
   * Enhanced callback answering with retry logic
   * @param {Object} ctx - Telegram context
   * @param {string} text - Response text
   * @param {Object} options - Additional options
   */
  async answerCallback(ctx, text = '', options = {}) {
    const queryId = ctx.callbackQuery?.id;
    
    if (!queryId) {
      console.warn('Attempted to answer callback query without query ID');
      return false;
    }

    if (ctx.callbackAnswered) {
      console.warn(`Callback query ${queryId} already answered`);
      return true;
    }

    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await ctx.answerCbQuery(text, {
          show_alert: options.alert || false,
          cache_time: options.cacheTime || 0,
          ...options
        });
        
        ctx.callbackAnswered = true;
        return true;
        
      } catch (error) {
        attempts++;
        console.error(`Failed to answer callback query (attempt ${attempts}):`, error);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        await this.sleep(100 * Math.pow(2, attempts));
      }
    }
    
    return false;
  }

  /**
   * Force answer callback query (for timeout scenarios)
   * @param {Object} ctx - Telegram context
   * @param {string} message - Timeout message
   */
  async forceAnswer(ctx, message = 'Operation timed out') {
    try {
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery(message, { show_alert: true });
        ctx.callbackAnswered = true;
      }
    } catch (error) {
      console.error('Failed to force answer callback query:', error);
    }
  }

  /**
   * Handle callback processing errors
   * @param {Object} ctx - Telegram context
   * @param {Error} error - Error object
   * @param {string} handlerName - Handler name
   */
  async handleCallbackError(ctx, error, handlerName) {
    console.error(`Callback error in ${handlerName}:`, error);
    
    try {
      if (!ctx.callbackAnswered) {
        let errorMessage = 'An error occurred. Please try again.';
        
        // Customize error message based on error type
        if (error.message?.includes('timeout')) {
          errorMessage = 'The operation took too long. Please try again.';
        } else if (error.message?.includes('rate limit')) {
          errorMessage = 'Please wait a moment before trying again.';
        } else if (error.message?.includes('session')) {
          errorMessage = 'Your session expired. Please start again.';
        }
        
        await this.answerCallback(ctx, errorMessage, { alert: true });
      }
    } catch (answerError) {
      console.error('Failed to answer callback query after error:', answerError);
    }
  }

  /**
   * Check if callback is duplicate
   * @param {string} dedupeKey - Deduplication key
   */
  async isDuplicateCallback(dedupeKey) {
    const lastTime = this.recentCallbacks.get(dedupeKey);
    if (!lastTime) {
      return false;
    }
    
    const timeDiff = Date.now() - lastTime;
    return timeDiff < this.deduplicationWindow;
  }

  /**
   * Create deduplication key for callback
   * @param {string} userId - User ID
   * @param {string} callbackData - Callback data
   */
  createDeduplicationKey(userId, callbackData) {
    const timestamp = Math.floor(Date.now() / 1000); // 1-second precision
    return `cb_${userId}_${callbackData}_${timestamp}`;
  }

  /**
   * Update performance metrics
   * @param {number} startTime - Processing start time
   */
  updatePerformanceMetrics(startTime) {
    const responseTime = Date.now() - startTime;
    
    // Update average response time
    const total = this.callbackStats.successful + 1;
    this.performanceMetrics.averageResponseTime = 
      (this.performanceMetrics.averageResponseTime * (total - 1) + responseTime) / total;
    
    // Track fast/slow responses
    if (responseTime < 1000) {
      this.performanceMetrics.fastResponses++;
    } else if (responseTime > 5000) {
      this.performanceMetrics.slowResponses++;
    }
  }

  /**
   * Validate callback data size (Rule 10 compliance)
   * @param {string} callbackData - Callback data
   * @returns {Object} - Validation result
   */
  validateCallbackData(callbackData) {
    if (typeof callbackData !== 'string') {
      return { valid: false, error: 'Callback data must be string' };
    }
    
    const byteLength = Buffer.byteLength(callbackData, 'utf8');
    if (byteLength > 64) {
      return { 
        valid: false, 
        error: `Callback data too long: ${byteLength} bytes (max 64)`,
        actualLength: byteLength
      };
    }
    
    return { valid: true };
  }

  /**
   * Create safe callback data with automatic truncation
   * @param {string} prefix - Callback prefix
   * @param {string} data - Data to include
   * @returns {string} - Safe callback data
   */
  createSafeCallbackData(prefix, data) {
    const separator = '_';
    const maxDataLength = 60 - prefix.length - separator.length;
    
    if (data.length > maxDataLength) {
      const truncated = data.substring(0, maxDataLength - 3) + '...';
      console.warn(`Truncated callback data: ${prefix}${separator}${truncated}`);
      return `${prefix}${separator}${truncated}`;
    }
    
    return `${prefix}${separator}${data}`;
  }

  /**
   * Batch callback data validation
   * @param {Array} callbackDataArray - Array of callback data strings
   * @returns {Object} - Validation results
   */
  validateCallbackDataBatch(callbackDataArray) {
    const results = {
      valid: [],
      invalid: [],
      totalValid: 0,
      totalInvalid: 0
    };
    
    callbackDataArray.forEach((data, index) => {
      const validation = this.validateCallbackData(data);
      if (validation.valid) {
        results.valid.push({ index, data });
        results.totalValid++;
      } else {
        results.invalid.push({ index, data, error: validation.error });
        results.totalInvalid++;
      }
    });
    
    return results;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      callbacks: this.callbackStats,
      performance: this.performanceMetrics,
      active: {
        processing: this.processingCallbacks.size,
        recentCallbacks: this.recentCallbacks.size
      },
      deduplication: {
        windowMs: this.deduplicationWindow,
        recentCallbacks: this.recentCallbacks.size
      },
      timeouts: {
        callbackTimeout: this.CALLBACK_TIMEOUT,
        maxRetries: this.MAX_CALLBACK_RETRIES
      }
    };
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const stats = this.getStats();
    const successRate = stats.callbacks.total > 0 
      ? (stats.callbacks.successful / stats.callbacks.total * 100).toFixed(2)
      : '0.00';
    
    return {
      successRate: `${successRate}%`,
      averageResponseTime: `${stats.performance.averageResponseTime.toFixed(0)}ms`,
      fastResponses: stats.performance.fastResponses,
      slowResponses: stats.performance.slowResponses,
      duplicatesBlocked: stats.callbacks.duplicates,
      errorsHandled: stats.callbacks.errors,
      timeoutsOccurred: stats.callbacks.timedOut,
      totalProcessed: stats.callbacks.total
    };
  }

  /**
   * Health check for callback system
   */
  healthCheck() {
    const stats = this.getStats();
    const recentErrors = stats.callbacks.errors;
    const recentTimeouts = stats.callbacks.timedOut;
    const totalRecent = stats.callbacks.total;
    
    const errorRate = totalRecent > 0 ? (recentErrors / totalRecent) : 0;
    const timeoutRate = totalRecent > 0 ? (recentTimeouts / totalRecent) : 0;
    
    const isHealthy = errorRate < 0.1 && timeoutRate < 0.05; // < 10% errors, < 5% timeouts
    
    return {
      healthy: isHealthy,
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      timeoutRate: `${(timeoutRate * 100).toFixed(2)}%`,
      processingCount: stats.active.processing,
      averageResponseTime: `${stats.performance.averageResponseTime.toFixed(0)}ms`,
      recommendations: this.generateHealthRecommendations(errorRate, timeoutRate, stats)
    };
  }

  /**
   * Generate health recommendations
   */
  generateHealthRecommendations(errorRate, timeoutRate, stats) {
    const recommendations = [];
    
    if (errorRate > 0.1) {
      recommendations.push('High error rate detected - review error logs');
    }
    
    if (timeoutRate > 0.05) {
      recommendations.push('High timeout rate - consider optimizing handlers');
    }
    
    if (stats.performance.averageResponseTime > 3000) {
      recommendations.push('Slow average response time - optimize callback handlers');
    }
    
    if (stats.callbacks.duplicates > stats.callbacks.successful * 0.2) {
      recommendations.push('High duplicate rate - users may be double-clicking');
    }
    
    return recommendations;
  }

  /**
   * Cleanup expired data
   */
  cleanup() {
    super.cleanup();
    
    const now = Date.now();
    
    // Clean recent callbacks
    for (const [key, timestamp] of this.recentCallbacks.entries()) {
      if (now - timestamp > this.deduplicationWindow * 2) {
        this.recentCallbacks.delete(key);
      }
    }
    
    // Clean timeout tracking
    for (const [queryId, timeoutData] of this.callbackTimeouts.entries()) {
      if (now - timeoutData.startTime > 300000) { // 5 minutes
        this.callbackTimeouts.delete(queryId);
      }
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown callback manager
   */
  shutdown() {
    // Clear all tracking data
    this.recentCallbacks.clear();
    this.processingCallbacks.clear();
    this.callbackTimeouts.clear();
    
    // Reset statistics
    this.callbackStats = {
      total: 0,
      successful: 0,
      timedOut: 0,
      duplicates: 0,
      errors: 0
    };
    
    console.log('Enhanced Callback Query Manager shut down');
  }
}

module.exports = EnhancedCallbackQueryManager;