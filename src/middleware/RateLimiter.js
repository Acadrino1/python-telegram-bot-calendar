/**
 * RateLimiter - Advanced rate limiting middleware for Telegram bots
 */
class RateLimiter {
  constructor(redisManager, options = {}) {
    this.redis = redisManager;
    
    // Default rate limits based on Telegram's official limits
    this.limits = {
      global: {
        limit: options.globalLimit || 30,          // 30 messages per second (bulk)
        window: options.globalWindow || 1          // 1 second window
      },
      perChat: {
        limit: options.perChatLimit || 1,          // 1 message per second per chat
        window: options.perChatWindow || 1         // 1 second window
      },
      perUser: {
        limit: options.perUserLimit || 20,         // 20 messages per minute per user
        window: options.perUserWindow || 60        // 60 second window
      },
      commands: {
        limit: options.commandLimit || 5,          // 5 commands per minute
        window: options.commandWindow || 60        // 60 second window
      }
    };
    
    // Whitelist for admins or special users
    this.whitelist = new Set(options.whitelist || []);
    
    // Statistics
    this.stats = {
      blocked: 0,
      allowed: 0,
      whitelisted: 0
    };
    
    // Response messages
    this.messages = {
      rateLimited: options.rateLimitMessage || '⚠️ Too many requests. Please wait {time} seconds.',
      error: options.errorMessage || '❌ Rate limit check failed. Please try again.'
    };
  }
  
  /**
   * Create middleware for Telegraf
   */
  middleware() {
    return async (ctx, next) => {
      try {
        // Check if user is whitelisted
        if (this.isWhitelisted(ctx)) {
          this.stats.whitelisted++;
          return next();
        }
        
        // Perform rate limit checks
        const allowed = await this.checkLimits(ctx);
        
        if (!allowed.success) {
          this.stats.blocked++;
          
          // Send rate limit message
          const message = this.messages.rateLimited.replace('{time}', allowed.resetIn);
          
          if (ctx.callbackQuery) {
            await ctx.answerCbQuery(message, { show_alert: true });
          } else {
            await ctx.reply(message);
          }
          
          return; // Don't call next()
        }
        
        this.stats.allowed++;
        return next();
        
      } catch (error) {
        console.error('Rate limiter error:', error);
        
        // On error, allow the request to prevent blocking legitimate users
        return next();
      }
    };
  }
  
  /**
   * Check if user is whitelisted
   */
  isWhitelisted(ctx) {
    const userId = ctx.from?.id?.toString();
    return userId && this.whitelist.has(userId);
  }
  
  /**
   * Check all rate limits
   */
  async checkLimits(ctx) {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const isCommand = ctx.message?.text?.startsWith('/');
    
    // Check global rate limit
    const globalCheck = await this.checkLimit('global', this.limits.global);
    if (!globalCheck.allowed) {
      return { success: false, resetIn: globalCheck.resetIn, reason: 'global' };
    }
    
    // Check per-chat rate limit
    if (chatId) {
      const chatCheck = await this.checkLimit(`chat:${chatId}`, this.limits.perChat);
      if (!chatCheck.allowed) {
        return { success: false, resetIn: chatCheck.resetIn, reason: 'chat' };
      }
    }
    
    // Check per-user rate limit
    if (userId) {
      const userCheck = await this.checkLimit(`user:${userId}`, this.limits.perUser);
      if (!userCheck.allowed) {
        return { success: false, resetIn: userCheck.resetIn, reason: 'user' };
      }
      
      // Check command rate limit if applicable
      if (isCommand) {
        const commandCheck = await this.checkLimit(`cmd:${userId}`, this.limits.commands);
        if (!commandCheck.allowed) {
          return { success: false, resetIn: commandCheck.resetIn, reason: 'command' };
        }
      }
    }
    
    return { success: true };
  }
  
  /**
   * Check a specific rate limit
   */
  async checkLimit(key, { limit, window }) {
    if (!this.redis || !this.redis.isConnected) {
      // Fallback to simple in-memory rate limiting
      return this.checkMemoryLimit(key, limit, window);
    }
    
    return await this.redis.checkRateLimit(key, limit, window);
  }
  
  /**
   * Simple in-memory rate limiting fallback
   */
  checkMemoryLimit(key, limit, window) {
    if (!this.memoryLimits) {
      this.memoryLimits = new Map();
    }
    
    const now = Date.now();
    const windowMs = window * 1000;
    
    // Get or create bucket for this key
    let bucket = this.memoryLimits.get(key);
    if (!bucket) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.memoryLimits.set(key, bucket);
    }
    
    // Reset if window expired
    if (now >= bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    
    // Increment and check
    bucket.count++;
    
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetIn: Math.ceil((bucket.resetAt - now) / 1000)
    };
  }
  
  /**
   * Add user to whitelist
   */
  addToWhitelist(userId) {
    this.whitelist.add(userId.toString());
  }
  
  /**
   * Remove user from whitelist
   */
  removeFromWhitelist(userId) {
    this.whitelist.delete(userId.toString());
  }
  
  /**
   * Get rate limiter statistics
   */
  getStats() {
    const total = this.stats.allowed + this.stats.blocked + this.stats.whitelisted;
    const blockRate = total > 0 ? (this.stats.blocked / total * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      total,
      blockRate: `${blockRate}%`
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      blocked: 0,
      allowed: 0,
      whitelisted: 0
    };
  }
  
  /**
   * Update rate limits dynamically
   */
  updateLimits(newLimits) {
    this.limits = {
      ...this.limits,
      ...newLimits
    };
  }
}

module.exports = RateLimiter;