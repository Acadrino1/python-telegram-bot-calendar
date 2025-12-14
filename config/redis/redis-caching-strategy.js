const Redis = require('ioredis');
const logger = require('../../src/utils/logger');

class RedisCachingStrategy {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 0,
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectionName: 'lodge-scheduler-cache'
    });

    // Caching strategies configuration
    this.strategies = {
      // High-frequency data with short TTL
      sessions: { ttl: 3600, prefix: 'session:' }, // 1 hour
      callbacks: { ttl: 300, prefix: 'callback:' }, // 5 minutes
      userState: { ttl: 1800, prefix: 'user:state:' }, // 30 minutes

      // Medium-frequency data with moderate TTL
      availability: { ttl: 7200, prefix: 'availability:' }, // 2 hours
      services: { ttl: 14400, prefix: 'services:' }, // 4 hours
      userProfiles: { ttl: 7200, prefix: 'user:profile:' }, // 2 hours

      // Low-frequency data with long TTL
      settings: { ttl: 86400, prefix: 'settings:' }, // 24 hours
      templates: { ttl: 43200, prefix: 'template:' }, // 12 hours
      configurations: { ttl: 86400, prefix: 'config:' }, // 24 hours

      // Performance optimization caches
      queryResults: { ttl: 600, prefix: 'query:' }, // 10 minutes
      apiResponses: { ttl: 300, prefix: 'api:' }, // 5 minutes
      computedValues: { ttl: 1800, prefix: 'computed:' } // 30 minutes
    };

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.redis.on('connect', () => {
      logger.info('Redis cache connected successfully');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis cache error:', error);
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis cache reconnecting...');
    });
  }

  // Generic cache operations
  async set(key, value, strategy = 'sessions') {
    try {
      const config = this.strategies[strategy];
      if (!config) {
        throw new Error(`Unknown caching strategy: ${strategy}`);
      }

      const fullKey = config.prefix + key;
      const serializedValue = JSON.stringify(value);

      await this.redis.setex(fullKey, config.ttl, serializedValue);
      logger.debug(`Cached data: ${fullKey}`);

      return true;
    } catch (error) {
      logger.error(`Error setting cache for ${key}:`, error);
      return false;
    }
  }

  async get(key, strategy = 'sessions') {
    try {
      const config = this.strategies[strategy];
      if (!config) {
        throw new Error(`Unknown caching strategy: ${strategy}`);
      }

      const fullKey = config.prefix + key;
      const cachedValue = await this.redis.get(fullKey);

      if (cachedValue) {
        logger.debug(`Cache hit: ${fullKey}`);
        return JSON.parse(cachedValue);
      }

      logger.debug(`Cache miss: ${fullKey}`);
      return null;
    } catch (error) {
      logger.error(`Error getting cache for ${key}:`, error);
      return null;
    }
  }

  async del(key, strategy = 'sessions') {
    try {
      const config = this.strategies[strategy];
      const fullKey = config.prefix + key;
      const result = await this.redis.del(fullKey);
      logger.debug(`Deleted cache: ${fullKey}`);
      return result > 0;
    } catch (error) {
      logger.error(`Error deleting cache for ${key}:`, error);
      return false;
    }
  }

  // Session-specific operations
  async setUserSession(userId, sessionData) {
    return this.set(userId, sessionData, 'sessions');
  }

  async getUserSession(userId) {
    return this.get(userId, 'sessions');
  }

  async deleteUserSession(userId) {
    return this.del(userId, 'sessions');
  }

  async extendUserSession(userId, additionalSeconds = 3600) {
    try {
      const config = this.strategies.sessions;
      const fullKey = config.prefix + userId;
      const result = await this.redis.expire(fullKey, config.ttl + additionalSeconds);
      return result === 1;
    } catch (error) {
      logger.error(`Error extending session for ${userId}:`, error);
      return false;
    }
  }

  // Callback query operations
  async setCallbackData(callbackId, data) {
    return this.set(callbackId, data, 'callbacks');
  }

  async getCallbackData(callbackId) {
    return this.get(callbackId, 'callbacks');
  }

  async deleteCallbackData(callbackId) {
    return this.del(callbackId, 'callbacks');
  }

  // User state management
  async setUserState(userId, state) {
    return this.set(userId, state, 'userState');
  }

  async getUserState(userId) {
    return this.get(userId, 'userState');
  }

  async updateUserState(userId, partialState) {
    try {
      const currentState = await this.getUserState(userId) || {};
      const updatedState = { ...currentState, ...partialState };
      return this.setUserState(userId, updatedState);
    } catch (error) {
      logger.error(`Error updating user state for ${userId}:`, error);
      return false;
    }
  }

  // Availability caching
  async cacheAvailability(serviceId, date, availability) {
    const key = `${serviceId}:${date}`;
    return this.set(key, availability, 'availability');
  }

  async getAvailability(serviceId, date) {
    const key = `${serviceId}:${date}`;
    return this.get(key, 'availability');
  }

  async invalidateAvailability(serviceId, date) {
    const key = `${serviceId}:${date}`;
    return this.del(key, 'availability');
  }

  // Service data caching
  async cacheServices(services) {
    return this.set('all', services, 'services');
  }

  async getServices() {
    return this.get('all', 'services');
  }

  async cacheService(serviceId, serviceData) {
    return this.set(serviceId, serviceData, 'services');
  }

  async getService(serviceId) {
    return this.get(serviceId, 'services');
  }

  // User profile caching
  async cacheUserProfile(userId, profile) {
    return this.set(userId, profile, 'userProfiles');
  }

  async getUserProfile(userId) {
    return this.get(userId, 'userProfiles');
  }

  async invalidateUserProfile(userId) {
    return this.del(userId, 'userProfiles');
  }

  // Query result caching with custom key generation
  async cacheQuery(queryType, params, result) {
    const key = `${queryType}:${this.generateQueryKey(params)}`;
    return this.set(key, result, 'queryResults');
  }

  async getCachedQuery(queryType, params) {
    const key = `${queryType}:${this.generateQueryKey(params)}`;
    return this.get(key, 'queryResults');
  }

  generateQueryKey(params) {
    return Buffer.from(JSON.stringify(params)).toString('base64');
  }

  // Batch operations for performance
  async setMultiple(items, strategy = 'sessions') {
    try {
      const config = this.strategies[strategy];
      const pipeline = this.redis.pipeline();

      items.forEach(({ key, value }) => {
        const fullKey = config.prefix + key;
        const serializedValue = JSON.stringify(value);
        pipeline.setex(fullKey, config.ttl, serializedValue);
      });

      await pipeline.exec();
      logger.debug(`Batch cached ${items.length} items with strategy: ${strategy}`);
      return true;
    } catch (error) {
      logger.error('Error in batch cache operation:', error);
      return false;
    }
  }

  async getMultiple(keys, strategy = 'sessions') {
    try {
      const config = this.strategies[strategy];
      const fullKeys = keys.map(key => config.prefix + key);
      const pipeline = this.redis.pipeline();

      fullKeys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      return keys.map((key, index) => {
        const [error, value] = results[index];
        if (error || !value) return { key, value: null };
        
        try {
          return { key, value: JSON.parse(value) };
        } catch (parseError) {
          logger.error(`Error parsing cached value for ${key}:`, parseError);
          return { key, value: null };
        }
      });
    } catch (error) {
      logger.error('Error in batch get operation:', error);
      return keys.map(key => ({ key, value: null }));
    }
  }

  // Cache statistics and monitoring
  async getStats() {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
        connected: this.redis.status === 'ready'
      };
    } catch (error) {
      logger.error('Error getting Redis stats:', error);
      return { connected: false };
    }
  }

  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};

    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(value) ? value : parseFloat(value);
      }
    });

    return result;
  }

  // Cache warming strategies
  async warmCache() {
    logger.info('Starting cache warming process...');
    
    try {
      // Warm up services cache
      // This would typically load from database
      logger.info('Warming services cache...');
      
      // Warm up common availability queries
      logger.info('Warming availability cache...');
      
      // Warm up templates and configurations
      logger.info('Warming configuration cache...');
      
      logger.info('Cache warming completed successfully');
    } catch (error) {
      logger.error('Error during cache warming:', error);
    }
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern, strategy = 'sessions') {
    try {
      const config = this.strategies[strategy];
      const fullPattern = config.prefix + pattern;
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`Invalidated ${keys.length} keys matching pattern: ${fullPattern}`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error(`Error invalidating pattern ${pattern}:`, error);
      return 0;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
        connected: this.redis.status === 'ready'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  // Cleanup and shutdown
  async cleanup() {
    try {
      await this.redis.quit();
      logger.info('Redis cache connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
}

module.exports = RedisCachingStrategy;