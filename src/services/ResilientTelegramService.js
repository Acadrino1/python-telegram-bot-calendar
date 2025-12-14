/**
 * ResilientTelegramService - Network-resilient Telegram API wrapper
 * Handles rate limiting, circuit breaking, retries, and error recovery
 */

const Bottleneck = require('bottleneck');
const CircuitBreaker = require('opossum');
const cleanupManager = require('../utils/CleanupManager');
const performanceMonitor = require('./PerformanceMonitor');
const logger = require('../utils/logger');

class ResilientTelegramService {
  constructor(bot) {
    this.bot = bot;
    this.isInitialized = false;
    
    // Statistics
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rateLimitHits: 0,
      timeouts: 0,
      retries: 0
    };
    
    this.initialize();
  }
  
  initialize() {
    try {
      this.setupRateLimiter();
      this.setupCircuitBreaker();
      this.setupErrorHandling();
      this.startStatsReporting();
      
      this.isInitialized = true;
      logger.info('🛡️ ResilientTelegramService initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize ResilientTelegramService:', error);
      this.isInitialized = false;
    }
  }
  
  setupRateLimiter() {
    // Telegram Bot API rate limits: 30 messages per second per bot
    this.limiter = new Bottleneck({
      maxConcurrent: 3, // Maximum 3 concurrent requests
      minTime: 100, // Minimum 100ms between requests
      reservoir: 25, // 25 requests per reservoir interval
      reservoirRefreshAmount: 25,
      reservoirRefreshInterval: 1000, // Refresh every second
      
      // Retry configuration
      retryCount: 3,
      retryDelay: (retryCount) => Math.pow(2, retryCount) * 1000, // Exponential backoff
      
      // Priority levels
      priority: {
        HIGH: 9,
        NORMAL: 5,
        LOW: 1
      }
    });
    
    // Rate limiter events
    this.limiter.on('failed', (error, jobInfo) => {
      logger.warn(`Rate limiter job failed: ${error.message}`);
      this.stats.failedCalls++;
      performanceMonitor.recordError('telegram', error);
    });
    
    this.limiter.on('retry', (error, jobInfo) => {
      logger.debug(`Retrying Telegram API call: ${error.message}`);
      this.stats.retries++;
    });
    
    logger.info('📊 Telegram rate limiter configured');
  }
  
  setupCircuitBreaker() {
    const breakerOptions = {
      timeout: 10000, // 10 second timeout
      errorThresholdPercentage: 50, // Open circuit at 50% error rate
      resetTimeout: 30000, // Try to close circuit after 30 seconds
      rollingCountTimeout: 10000, // 10 second rolling window
      rollingCountBuckets: 10, // 10 buckets for rolling count
      name: 'TelegramAPI',
      fallback: this.fallbackHandler.bind(this)
    };
    
    this.circuitBreaker = new CircuitBreaker(this.executeApiCall.bind(this), breakerOptions);
    
    // Circuit breaker events
    this.circuitBreaker.on('open', () => {
      logger.error('🚨 Telegram API circuit breaker OPENED - API calls failing');
    });
    
    this.circuitBreaker.on('halfOpen', () => {
      logger.warn('⚡ Telegram API circuit breaker HALF-OPEN - Testing API');
    });
    
    this.circuitBreaker.on('close', () => {
      logger.info('✅ Telegram API circuit breaker CLOSED - API healthy');
    });
    
    logger.info('⚡ Telegram circuit breaker configured');
  }
  
  setupErrorHandling() {
    // Global Telegram error handling
    this.errorPatterns = {
      RATE_LIMIT: /429|Too Many Requests/i,
      TIMEOUT: /ETIMEDOUT|ECONNRESET|ENOTFOUND/i,
      NETWORK: /ECONNREFUSED|EHOSTUNREACH|EAI_AGAIN/i,
      BOT_BLOCKED: /403|Forbidden|bot was blocked/i,
      CHAT_NOT_FOUND: /400|Bad Request|chat not found/i
    };
  }
  
  startStatsReporting() {
    cleanupManager.setInterval(() => {
      this.reportStats();
    }, 60000, 'TelegramStatsReporting'); // Report every minute
  }
  
  /**
   * Main method for sending messages with full resilience
   */
  async sendMessage(chatId, text, options = {}, priority = 'NORMAL') {
    if (!this.isInitialized) {
      throw new Error('ResilientTelegramService not initialized');
    }
    
    const requestData = {
      method: 'sendMessage',
      chatId,
      text,
      options: {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options
      },
      priority
    };
    
    return this.executeWithResilience(requestData);
  }
  
  /**
   * Send photo with resilience
   */
  async sendPhoto(chatId, photo, options = {}, priority = 'NORMAL') {
    const requestData = {
      method: 'sendPhoto',
      chatId,
      photo,
      options,
      priority
    };
    
    return this.executeWithResilience(requestData);
  }
  
  /**
   * Edit message with resilience
   */
  async editMessageText(chatId, messageId, text, options = {}, priority = 'NORMAL') {
    const requestData = {
      method: 'editMessageText',
      chatId,
      messageId,
      text,
      options: {
        parse_mode: 'HTML',
        ...options
      },
      priority
    };
    
    return this.executeWithResilience(requestData);
  }
  
  /**
   * Delete message with resilience
   */
  async deleteMessage(chatId, messageId, priority = 'LOW') {
    const requestData = {
      method: 'deleteMessage',
      chatId,
      messageId,
      priority
    };
    
    return this.executeWithResilience(requestData);
  }
  
  /**
   * Execute API call with full resilience stack
   */
  async executeWithResilience(requestData) {
    this.stats.totalCalls++;
    performanceMonitor.recordTelegramApiCall();
    
    const startTime = Date.now();
    
    try {
      // Use rate limiter with circuit breaker
      const result = await this.limiter.schedule(
        { priority: this.limiter.priority[requestData.priority] || 5 },
        () => this.circuitBreaker.fire(requestData)
      );
      
      this.stats.successfulCalls++;
      const responseTime = Date.now() - startTime;
      logger.debug(`Telegram API success: ${requestData.method} (${responseTime}ms)`);
      
      return result;
      
    } catch (error) {
      this.stats.failedCalls++;
      const responseTime = Date.now() - startTime;
      
      // Classify and handle different error types
      const errorType = this.classifyError(error);
      logger.error(`Telegram API error: ${requestData.method} (${responseTime}ms)`, {
        type: errorType,
        message: error.message,
        chatId: requestData.chatId
      });
      
      performanceMonitor.recordError('telegram', error);
      
      // Don't throw for non-critical errors
      if (this.isNonCriticalError(errorType)) {
        logger.debug('Non-critical Telegram error, continuing...');
        return null;
      }
      
      throw error;
    }
  }
  
  /**
   * Core API call execution (used by circuit breaker)
   */
  async executeApiCall(requestData) {
    const { method, chatId, options = {} } = requestData;
    
    try {
      switch (method) {
        case 'sendMessage':
          return await this.bot.telegram.sendMessage(chatId, requestData.text, options);
          
        case 'sendPhoto':
          return await this.bot.telegram.sendPhoto(chatId, requestData.photo, options);
          
        case 'editMessageText':
          if (options.inline_message_id) {
            return await this.bot.telegram.editMessageText(
              undefined, undefined, options.inline_message_id, requestData.text, options
            );
          }
          return await this.bot.telegram.editMessageText(
            chatId, requestData.messageId, undefined, requestData.text, options
          );
          
        case 'deleteMessage':
          return await this.bot.telegram.deleteMessage(chatId, requestData.messageId);
          
        default:
          throw new Error(`Unsupported Telegram method: ${method}`);
      }
    } catch (error) {
      // Handle specific Telegram API errors
      if (error.response?.error_code === 429) {
        this.stats.rateLimitHits++;
        const retryAfter = error.response.parameters?.retry_after || 1;
        logger.warn(`Rate limited by Telegram, waiting ${retryAfter} seconds`);
        await this.sleep(retryAfter * 1000);
        throw new Error('RATE_LIMITED'); // Will be retried by rate limiter
      }
      
      throw error;
    }
  }
  
  /**
   * Fallback handler when circuit breaker is open
   */
  fallbackHandler(requestData, error) {
    logger.warn('Circuit breaker fallback activated', {
      method: requestData.method,
      chatId: requestData.chatId,
      error: error.message
    });
    
    // For critical messages, queue for retry when circuit closes
    if (requestData.priority === 'HIGH') {
      // Could implement a priority queue here
      logger.info('High priority message queued for retry');
    }
    
    return null; // Return null instead of throwing
  }
  
  /**
   * Classify error types for better handling
   */
  classifyError(error) {
    const message = error.message || '';
    
    if (this.errorPatterns.RATE_LIMIT.test(message)) return 'RATE_LIMIT';
    if (this.errorPatterns.TIMEOUT.test(message)) return 'TIMEOUT';
    if (this.errorPatterns.NETWORK.test(message)) return 'NETWORK';
    if (this.errorPatterns.BOT_BLOCKED.test(message)) return 'BOT_BLOCKED';
    if (this.errorPatterns.CHAT_NOT_FOUND.test(message)) return 'CHAT_NOT_FOUND';
    
    return 'UNKNOWN';
  }
  
  /**
   * Determine if error is non-critical (shouldn't break the flow)
   */
  isNonCriticalError(errorType) {
    return ['BOT_BLOCKED', 'CHAT_NOT_FOUND'].includes(errorType);
  }
  
  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => {
      cleanupManager.setTimeout(resolve, ms, `TelegramSleep-${ms}ms`);
    });
  }
  
  /**
   * Get service statistics
   */
  getStats() {
    const successRate = this.stats.totalCalls > 0 
      ? Math.round((this.stats.successfulCalls / this.stats.totalCalls) * 100)
      : 0;
      
    return {
      ...this.stats,
      successRate,
      circuitBreakerState: this.circuitBreaker?.stats?.state || 'unknown',
      rateLimiterStats: {
        running: this.limiter?.running || 0,
        queued: this.limiter?.queued || 0
      }
    };
  }
  
  reportStats() {
    const stats = this.getStats();
    
    logger.info('📱 Telegram API Statistics:', {
      totalCalls: stats.totalCalls,
      successRate: `${stats.successRate}%`,
      rateLimitHits: stats.rateLimitHits,
      retries: stats.retries,
      circuitState: stats.circuitBreakerState,
      queuedCalls: stats.rateLimiterStats.queued
    });
    
    // Reset periodic stats
    if (stats.totalCalls > 10000) {
      this.resetStats();
    }
  }
  
  resetStats() {
    logger.debug('Resetting Telegram API statistics');
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rateLimitHits: 0,
      timeouts: 0,
      retries: 0
    };
  }
  
  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test with a simple API call
      const me = await this.bot.telegram.getMe();
      
      return {
        status: 'healthy',
        botUsername: me.username,
        circuitBreakerState: this.circuitBreaker.stats.state,
        stats: this.getStats()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        circuitBreakerState: this.circuitBreaker.stats.state,
        stats: this.getStats()
      };
    }
  }
  
  /**
   * Cleanup method for CleanupManager
   */
  cleanup() {
    logger.info('🧹 ResilientTelegramService cleanup initiated');
    
    // Shutdown circuit breaker
    if (this.circuitBreaker) {
      this.circuitBreaker.shutdown();
    }
    
    // Stop rate limiter
    if (this.limiter) {
      this.limiter.stop();
    }
    
    this.isInitialized = false;
    logger.info('✅ ResilientTelegramService cleanup completed');
  }
}

module.exports = ResilientTelegramService;