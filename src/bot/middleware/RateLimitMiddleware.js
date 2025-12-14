class RateLimitMiddleware {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 10; // 10 requests per window
    this.storage = new Map(); // In-memory storage
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;
    this.exemptUsers = options.exemptUsers || []; // Admin users exempt from rate limiting
    this.exemptCommands = options.exemptCommands || ['start', 'help']; // Commands exempt from rate limiting
    this.messageTemplate = options.messageTemplate || this.defaultMessageTemplate();
    
    // Cleanup interval to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.windowMs);
  }

  // Main middleware function
  middleware() {
    return async (ctx, next) => {
      try {
        const userId = ctx.from?.id;
        
        // Skip rate limiting if no user ID
        if (!userId) {
          return next();
        }

        // Skip rate limiting for exempt users
        if (this.isExemptUser(userId)) {
          return next();
        }

        // Skip rate limiting for exempt commands
        if (this.isExemptCommand(ctx)) {
          return next();
        }

        const key = this.generateKey(ctx);
        const now = Date.now();

        // Get user's request history
        let userRequests = this.storage.get(key) || {
          count: 0,
          resetTime: now + this.windowMs,
          requests: []
        };

        // Reset counter if window has expired
        if (now >= userRequests.resetTime) {
          userRequests = {
            count: 0,
            resetTime: now + this.windowMs,
            requests: []
          };
        }

        // Check if user has exceeded rate limit
        if (userRequests.count >= this.maxRequests) {
          const timeRemaining = Math.ceil((userRequests.resetTime - now) / 1000);
          
          console.log(`Rate limit exceeded for user ${userId}. Time remaining: ${timeRemaining}s`);
          
          await ctx.reply(
            this.messageTemplate
              .replace('{timeRemaining}', timeRemaining)
              .replace('{maxRequests}', this.maxRequests)
              .replace('{windowMs}', Math.ceil(this.windowMs / 1000))
          );
          
          return; // Don't proceed to next handler
        }

        // Increment request count
        userRequests.count++;
        userRequests.requests.push({
          timestamp: now,
          command: this.extractCommand(ctx),
          updateType: ctx.updateType
        });

        // Store updated request data
        this.storage.set(key, userRequests);

        // Attach rate limit info to context
        ctx.rateLimit = {
          remaining: this.maxRequests - userRequests.count,
          resetTime: userRequests.resetTime,
          total: this.maxRequests
        };

        // Proceed to next handler
        await next();

        // Handle successful requests
        if (!this.skipSuccessfulRequests) {
          // Request was successful, keep the count
        }

      } catch (error) {
        console.error('Rate limit middleware error:', error);
        
        // Handle failed requests
        if (this.skipFailedRequests) {
          // Decrement count for failed requests
          const key = this.generateKey(ctx);
          const userRequests = this.storage.get(key);
          if (userRequests && userRequests.count > 0) {
            userRequests.count--;
            this.storage.set(key, userRequests);
          }
        }

        // Continue with error handling
        throw error;
      }
    };
  }

  generateKey(ctx) {
    // Use user ID as the key for rate limiting
    return `rate_limit_${ctx.from.id}`;
  }

  extractCommand(ctx) {
    if (ctx.updateType === 'message' && ctx.message?.text?.startsWith('/')) {
      return ctx.message.text.split(' ')[0].substring(1).toLowerCase();
    }
    if (ctx.updateType === 'callback_query' && ctx.callbackQuery?.data) {
      return ctx.callbackQuery.data.split('_')[0];
    }
    return ctx.updateType || 'unknown';
  }

  isExemptUser(userId) {
    return this.exemptUsers.includes(userId.toString());
  }

  isExemptCommand(ctx) {
    const command = this.extractCommand(ctx);
    return this.exemptCommands.includes(command);
  }

  defaultMessageTemplate() {
    return `
🚫 *Rate Limit Exceeded*

You've made too many requests recently. Please slow down.

• Maximum: {maxRequests} requests per {windowMs} seconds
• Try again in: {timeRemaining} seconds

This helps keep the bot running smoothly for everyone!
    `.trim();
  }

  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, data] of this.storage.entries()) {
      if (now >= data.resetTime) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.storage.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired rate limit entries`);
    }
  }

  // Get current rate limit status for a user
  getStatus(userId) {
    const key = `rate_limit_${userId}`;
    const userRequests = this.storage.get(key);
    
    if (!userRequests) {
      return {
        count: 0,
        remaining: this.maxRequests,
        resetTime: null,
        isLimited: false
      };
    }

    const now = Date.now();
    const isLimited = userRequests.count >= this.maxRequests && now < userRequests.resetTime;

    return {
      count: userRequests.count,
      remaining: Math.max(0, this.maxRequests - userRequests.count),
      resetTime: userRequests.resetTime,
      isLimited,
      timeRemaining: isLimited ? Math.ceil((userRequests.resetTime - now) / 1000) : 0
    };
  }

  // Reset rate limit for a specific user (admin function)
  resetUser(userId) {
    const key = `rate_limit_${userId}`;
    this.storage.delete(key);
    console.log(`Reset rate limit for user ${userId}`);
  }

  // Get statistics
  getStats() {
    const now = Date.now();
    let activeUsers = 0;
    let totalRequests = 0;
    let limitedUsers = 0;

    for (const [key, data] of this.storage.entries()) {
      if (now < data.resetTime) {
        activeUsers++;
        totalRequests += data.count;
        
        if (data.count >= this.maxRequests) {
          limitedUsers++;
        }
      }
    }

    return {
      activeUsers,
      totalRequests,
      limitedUsers,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    };
  }

  // Shutdown cleanup
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.storage.clear();
  }

  // Static method to create middleware instance
  static create(options = {}) {
    return new RateLimitMiddleware(options).middleware();
  }

  // Preset configurations
  static presets = {
    // Conservative rate limiting
    conservative: {
      windowMs: 60000, // 1 minute
      maxRequests: 5,
      messageTemplate: '🐌 Please slow down! You can make {maxRequests} requests per minute. Try again in {timeRemaining} seconds.'
    },
    
    // Standard rate limiting
    standard: {
      windowMs: 60000, // 1 minute
      maxRequests: 10,
      messageTemplate: '⏰ Rate limit exceeded. You can make {maxRequests} requests per minute. Please wait {timeRemaining} seconds.'
    },
    
    // Generous rate limiting
    generous: {
      windowMs: 60000, // 1 minute
      maxRequests: 20,
      messageTemplate: 'Please wait {timeRemaining} seconds before making more requests.'
    },
    
    // Command-specific rate limiting
    commands: {
      windowMs: 30000, // 30 seconds
      maxRequests: 3,
      exemptCommands: ['start', 'help', 'support'],
      messageTemplate: '⚡ Too many commands! Please wait {timeRemaining} seconds.'
    }
  };
}

module.exports = RateLimitMiddleware;