/**
 * Enhanced Rate Limiter Middleware for Telegram Bot Security
 * Implements multiple rate limiting strategies with user tracking
 */

// Try to import LRU cache with fallback
let LRU;
try {
  LRU = require('lru-cache');
} catch (error) {
  console.warn('⚠️ LRU-cache not available, will use Map fallback');
  LRU = null;
}

class RateLimiterMiddleware {
  constructor(options = {}) {
    this.config = {
      // Global rate limits
      globalLimit: options.globalLimit || 100, // requests per window
      globalWindow: options.globalWindow || 60000, // 1 minute
      
      // Per-user rate limits
      userLimit: options.userLimit || 20, // requests per user per window
      userWindow: options.userWindow || 60000, // 1 minute
      
      // Command-specific limits
      commandLimits: {
        start: { limit: 5, window: 300000 }, // 5 starts per 5 minutes
        book: { limit: 10, window: 300000 }, // 10 bookings per 5 minutes
        cancel: { limit: 15, window: 300000 }, // 15 cancellations per 5 minutes
        support: { limit: 3, window: 600000 }, // 3 support tickets per 10 minutes
        ...options.commandLimits
      },
      
      // Callback query limits
      callbackLimit: options.callbackLimit || 30,
      callbackWindow: options.callbackWindow || 60000,
      
      // Burst protection
      burstLimit: options.burstLimit || 5, // max consecutive requests
      burstWindow: options.burstWindow || 5000, // 5 seconds
      
      // Security settings
      enableBlacklist: options.enableBlacklist !== false,
      autoBlacklistThreshold: options.autoBlacklistThreshold || 200,
      blacklistDuration: options.blacklistDuration || 24 * 60 * 60 * 1000, // 24 hours
      
      // Cache settings
      maxUsers: options.maxUsers || 10000,
      cleanupInterval: options.cleanupInterval || 5 * 60 * 1000, // 5 minutes
      
      ...options
    };
    
    // Initialize tracking with LRU or Map fallback
    if (LRU && typeof LRU === 'function') {
      try {
        // User request tracking
        this.userRequests = new LRU({
          max: this.config.maxUsers,
          ttl: this.config.userWindow
        });
        
        // Command tracking
        this.commandRequests = new LRU({
          max: this.config.maxUsers * 10,
          ttl: 300000 // 5 minutes max
        });
        
        // Callback query tracking
        this.callbackRequests = new LRU({
          max: this.config.maxUsers * 5,
          ttl: this.config.callbackWindow
        });
        
        // Burst tracking
        this.burstTracking = new LRU({
          max: this.config.maxUsers,
          ttl: this.config.burstWindow
        });
        
        // Blacklist
        this.blacklist = new LRU({
          max: 1000,
          ttl: this.config.blacklistDuration
        });
      } catch (error) {
        console.warn('⚠️ LRU cache initialization failed, using Map fallback');
        this.initializeMapFallback();
      }
    } else {
      console.warn('⚠️ LRU cache not available, using Map fallback');
      this.initializeMapFallback();
    }
    
    // Global request tracking
    this.globalRequests = [];
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      blacklistedUsers: 0,
      rateLimitViolations: 0
    };
    
    // Start cleanup
    this.startCleanup();
    
    console.log('✅ RateLimiterMiddleware initialized');
  }

  /**
   * Initialize Map-based fallback for rate limiting
   */
  initializeMapFallback() {
    this.userRequests = new Map();
    this.commandRequests = new Map();
    this.callbackRequests = new Map();
    this.burstTracking = new Map();
    this.blacklist = new Map();
  }

  /**
   * Main middleware function for Telegraf
   */
  middleware() {
    return async (ctx, next) => {
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      const requestType = this.getRequestType(ctx);
      
      this.stats.totalRequests++;
      
      try {
        // Check blacklist first
        if (this.isBlacklisted(userId)) {
          console.warn(`🚫 Blacklisted user ${userId} blocked`);
          return this.sendRateLimitResponse(ctx, 'You have been temporarily blocked due to excessive requests.');
        }
        
        // Check various rate limits
        const limitCheck = await this.checkAllLimits(ctx, userId, requestType);
        
        if (!limitCheck.allowed) {
          console.warn(`⚠️ Rate limit exceeded: ${limitCheck.reason} for user ${userId}`);
          this.stats.blockedRequests++;
          this.stats.rateLimitViolations++;
          
          // Auto-blacklist for excessive violations
          if (this.shouldAutoBlacklist(userId)) {
            this.addToBlacklist(userId, 'Excessive rate limit violations');
          }
          
          return this.sendRateLimitResponse(ctx, limitCheck.message);
        }
        
        // Track the request
        this.trackRequest(ctx, userId, requestType);
        
        // Continue to next middleware
        await next();
        
      } catch (error) {
        console.error('❌ Rate limiter error:', error);
        // Continue on rate limiter errors to prevent blocking legitimate requests
        await next();
      }
    };
  }

  /**
   * Check all applicable rate limits
   */
  async checkAllLimits(ctx, userId, requestType) {
    // Check global rate limit
    const globalCheck = this.checkGlobalLimit();
    if (!globalCheck.allowed) {
      return globalCheck;
    }
    
    // Check user rate limit
    const userCheck = this.checkUserLimit(userId);
    if (!userCheck.allowed) {
      return userCheck;
    }
    
    // Check burst limit
    const burstCheck = this.checkBurstLimit(userId);
    if (!burstCheck.allowed) {
      return burstCheck;
    }
    
    // Check command-specific limits
    if (requestType.type === 'command') {
      const commandCheck = this.checkCommandLimit(userId, requestType.command);
      if (!commandCheck.allowed) {
        return commandCheck;
      }
    }
    
    // Check callback query limits
    if (requestType.type === 'callback') {
      const callbackCheck = this.checkCallbackLimit(userId);
      if (!callbackCheck.allowed) {
        return callbackCheck;
      }
    }
    
    return { allowed: true };
  }

  /**
   * Check global rate limit
   */
  checkGlobalLimit() {
    const now = Date.now();
    const windowStart = now - this.config.globalWindow;
    
    // Clean old requests
    this.globalRequests = this.globalRequests.filter(time => time > windowStart);
    
    if (this.globalRequests.length >= this.config.globalLimit) {
      return {
        allowed: false,
        reason: 'global_limit',
        message: 'System is currently experiencing high load. Please try again in a few minutes.'
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check per-user rate limit
   */
  checkUserLimit(userId) {
    const userKey = `user_${userId}`;
    const requests = this.userRequests.get(userKey) || [];
    const now = Date.now();
    const windowStart = now - this.config.userWindow;
    
    // Filter requests within window
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= this.config.userLimit) {
      return {
        allowed: false,
        reason: 'user_limit',
        message: `You're sending too many requests. Please wait ${Math.ceil(this.config.userWindow / 60000)} minutes before trying again.`
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check burst limit (rapid consecutive requests)
   */
  checkBurstLimit(userId) {
    const burstKey = `burst_${userId}`;
    const burstRequests = this.burstTracking.get(burstKey) || [];
    const now = Date.now();
    const windowStart = now - this.config.burstWindow;
    
    // Filter requests within burst window
    const validRequests = burstRequests.filter(time => time > windowStart);
    
    if (validRequests.length >= this.config.burstLimit) {
      return {
        allowed: false,
        reason: 'burst_limit',
        message: 'Please slow down. You\'re sending requests too quickly.'
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check command-specific rate limit
   */
  checkCommandLimit(userId, command) {
    const limits = this.config.commandLimits[command];
    if (!limits) return { allowed: true };
    
    const commandKey = `cmd_${userId}_${command}`;
    const requests = this.commandRequests.get(commandKey) || [];
    const now = Date.now();
    const windowStart = now - limits.window;
    
    // Filter requests within window
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= limits.limit) {
      return {
        allowed: false,
        reason: 'command_limit',
        message: `You've used the /${command} command too many times. Please wait ${Math.ceil(limits.window / 60000)} minutes.`
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check callback query rate limit
   */
  checkCallbackLimit(userId) {
    const callbackKey = `callback_${userId}`;
    const requests = this.callbackRequests.get(callbackKey) || [];
    const now = Date.now();
    const windowStart = now - this.config.callbackWindow;
    
    // Filter requests within window
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= this.config.callbackLimit) {
      return {
        allowed: false,
        reason: 'callback_limit',
        message: 'You\'re clicking buttons too quickly. Please slow down.'
      };
    }
    
    return { allowed: true };
  }

  /**
   * Track a request
   */
  trackRequest(ctx, userId, requestType) {
    const now = Date.now();
    
    // Track global request
    this.globalRequests.push(now);
    
    // Track user request
    const userKey = `user_${userId}`;
    const userRequests = this.userRequests.get(userKey) || [];
    userRequests.push(now);
    this.userRequests.set(userKey, userRequests);
    
    // Track burst
    const burstKey = `burst_${userId}`;
    const burstRequests = this.burstTracking.get(burstKey) || [];
    burstRequests.push(now);
    this.burstTracking.set(burstKey, burstRequests);
    
    // Track command requests
    if (requestType.type === 'command') {
      const commandKey = `cmd_${userId}_${requestType.command}`;
      const commandRequests = this.commandRequests.get(commandKey) || [];
      commandRequests.push(now);
      this.commandRequests.set(commandKey, commandRequests);
    }
    
    // Track callback requests
    if (requestType.type === 'callback') {
      const callbackKey = `callback_${userId}`;
      const callbackRequests = this.callbackRequests.get(callbackKey) || [];
      callbackRequests.push(now);
      this.callbackRequests.set(callbackKey, callbackRequests);
    }
  }

  /**
   * Get request type from context
   */
  getRequestType(ctx) {
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
      const command = ctx.message.text.split(' ')[0].substring(1).toLowerCase();
      return { type: 'command', command };
    }
    
    if (ctx.callbackQuery) {
      return { type: 'callback', data: ctx.callbackQuery.data };
    }
    
    if (ctx.message) {
      return { type: 'message' };
    }
    
    return { type: 'unknown' };
  }

  /**
   * Check if user should be auto-blacklisted
   */
  shouldAutoBlacklist(userId) {
    if (!this.config.enableBlacklist) return false;
    
    const userKey = `user_${userId}`;
    const requests = this.userRequests.get(userKey) || [];
    
    // Check if user has exceeded auto-blacklist threshold
    return requests.length >= this.config.autoBlacklistThreshold;
  }

  /**
   * Add user to blacklist
   */
  addToBlacklist(userId, reason = 'Rate limit violations') {
    const blacklistKey = `bl_${userId}`;
    this.blacklist.set(blacklistKey, {
      userId,
      reason,
      timestamp: Date.now()
    });
    
    this.stats.blacklistedUsers++;
    console.warn(`🚫 User ${userId} blacklisted: ${reason}`);
  }

  /**
   * Check if user is blacklisted
   */
  isBlacklisted(userId) {
    const blacklistKey = `bl_${userId}`;
    return this.blacklist.has(blacklistKey);
  }

  /**
   * Remove user from blacklist
   */
  removeFromBlacklist(userId) {
    const blacklistKey = `bl_${userId}`;
    const wasBlacklisted = this.blacklist.has(blacklistKey);
    this.blacklist.delete(blacklistKey);
    
    if (wasBlacklisted) {
      console.log(`✅ User ${userId} removed from blacklist`);
    }
    
    return wasBlacklisted;
  }

  /**
   * Send rate limit response to user
   */
  async sendRateLimitResponse(ctx, message) {
    try {
      await ctx.reply(`⚠️ ${message}`, {
        reply_to_message_id: ctx.message?.message_id
      });
    } catch (error) {
      console.error('Error sending rate limit response:', error);
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    
    // Clean global requests
    const globalCutoff = now - this.config.globalWindow;
    this.globalRequests = this.globalRequests.filter(time => time > globalCutoff);
    
    console.log('🧹 Rate limiter cleanup completed');
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeUsers: this.userRequests.size,
      blacklistedUsers: this.blacklist.size,
      globalRequests: this.globalRequests.length,
      cacheStats: {
        users: this.userRequests.size,
        commands: this.commandRequests.size,
        callbacks: this.callbackRequests.size,
        burst: this.burstTracking.size
      }
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      blacklistedUsers: 0,
      rateLimitViolations: 0
    };
  }

  /**
   * Shutdown cleanup
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    console.log('✅ RateLimiterMiddleware shutdown complete');
  }
}

module.exports = RateLimiterMiddleware;