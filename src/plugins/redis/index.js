const BasePlugin = require('../../core/BasePlugin');
const RedisManager = require('../../core/RedisManager');

/**
 * RedisPlugin - Provides Redis session storage and caching for the bot
 */
class RedisPlugin extends BasePlugin {
  constructor(bot, config = {}) {
    super(bot, config);
    
    this.name = 'redis';
    this.version = '1.0.0';
    this.description = 'Redis session storage and caching';
    
    this.redisManager = null;
    this.sessionStore = new Map(); // Fallback memory store
  }
  
  async initialize() {
    try {
      // Initialize Redis manager
      this.redisManager = new RedisManager(this.config.redis);
      await this.redisManager.connect();
      
      // Make Redis available to other plugins
      this.bot.redis = this.redisManager;
      
      // Setup session middleware
      this.setupSessionMiddleware();
      
      // Setup caching helpers
      this.setupCachingHelpers();
      
      this.logger.info('Redis plugin initialized');
    } catch (error) {
      this.logger.error('Redis plugin initialization error:', error);
      throw error;
    }
  }
  
  setupSessionMiddleware() {
    // Add session middleware to bot
    this.telegram.use(async (ctx, next) => {
      const sessionKey = this.getSessionKey(ctx);
      
      if (!sessionKey) {
        return next();
      }
      
      // Load session
      ctx.session = await this.loadSession(sessionKey);
      
      // Continue processing
      await next();
      
      // Save session after processing
      await this.saveSession(sessionKey, ctx.session);
    });
  }
  
  setupCachingHelpers() {
    // Add caching methods to context
    this.telegram.use((ctx, next) => {
      ctx.cache = {
        get: (key) => this.getCached(key),
        set: (key, value, ttl) => this.setCached(key, value, ttl),
        wrap: (key, fn, ttl) => this.cacheWrap(key, fn, ttl),
        invalidate: (pattern) => this.invalidateCache(pattern)
      };
      
      return next();
    });
  }
  
  getSessionKey(ctx) {
    if (!ctx.from) return null;
    
    // Create session key based on chat type
    if (ctx.chat?.type === 'private') {
      return `${ctx.from.id}`;
    } else if (ctx.chat) {
      return `${ctx.chat.id}:${ctx.from.id}`;
    }
    
    return `${ctx.from.id}`;
  }
  
  async loadSession(key) {
    try {
      if (this.redisManager && this.redisManager.isConnected) {
        const session = await this.redisManager.getSession(key);
        return session || {};
      }
      
      // Fallback to memory store
      return this.sessionStore.get(key) || {};
    } catch (error) {
      this.logger.error('Session load error:', error);
      return {};
    }
  }
  
  async saveSession(key, session) {
    try {
      if (!session || Object.keys(session).length === 0) {
        return;
      }
      
      if (this.redisManager && this.redisManager.isConnected) {
        await this.redisManager.setSession(key, session, this.config.sessionTTL || 3600);
      } else {
        // Fallback to memory store
        this.sessionStore.set(key, session);
      }
    } catch (error) {
      this.logger.error('Session save error:', error);
    }
  }
  
  async getCached(key) {
    try {
      if (this.redisManager && this.redisManager.isConnected) {
        return await this.redisManager.getCached(key);
      }
      return null;
    } catch (error) {
      this.logger.error('Cache get error:', error);
      return null;
    }
  }
  
  async setCached(key, value, ttl = 600) {
    try {
      if (this.redisManager && this.redisManager.isConnected) {
        return await this.redisManager.setCached(key, value, ttl);
      }
      return false;
    } catch (error) {
      this.logger.error('Cache set error:', error);
      return false;
    }
  }
  
  async cacheWrap(key, fn, ttl = 600) {
    // Try to get from cache
    const cached = await this.getCached(key);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function and cache result
    const result = await fn();
    await this.setCached(key, result, ttl);
    
    return result;
  }
  
  async invalidateCache(pattern) {
    try {
      if (this.redisManager && this.redisManager.isConnected) {
        return await this.redisManager.invalidateCache(pattern);
      }
      return 0;
    } catch (error) {
      this.logger.error('Cache invalidation error:', error);
      return 0;
    }
  }
  
  async cleanup() {
    if (this.redisManager) {
      await this.redisManager.disconnect();
    }
  }
  
  getHealth() {
    if (!this.redisManager) {
      return 'unavailable';
    }
    
    return this.redisManager.isConnected ? 'healthy' : 'degraded';
  }
  
  async getMetrics() {
    const baseMetrics = super.getMetrics();
    
    if (this.redisManager) {
      const redisHealth = await this.redisManager.healthCheck();
      return {
        ...baseMetrics,
        redis: redisHealth
      };
    }
    
    return baseMetrics;
  }
}

module.exports = RedisPlugin;