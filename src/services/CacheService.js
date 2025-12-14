/**
 * CacheService - Multi-layer caching implementation
 * L1: In-memory LRU cache for hot data
 * L2: Redis cache for shared data
 * L3: Database with optimized queries
 */

const Redis = require('ioredis');
const { LRUCache } = require('lru-cache');
const cleanupManager = require('../utils/CleanupManager');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.isInitialized = false;
    this.l1Cache = null;
    this.redis = null;
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      totalRequests: 0,
      errors: 0
    };
    
    this.initialize();
  }
  
  async initialize() {
    try {
      // Initialize L1 Cache (In-memory LRU)
      this.l1Cache = new LRUCache({
        max: 1000,
        ttl: 5 * 60 * 1000, // 5 minutes
        allowStale: false,
        updateAgeOnGet: true,
        updateAgeOnHas: true,
        dispose: (value, key) => {
          logger.debug(`L1 cache disposed: ${key}`);
        }
      });
      
      // Initialize L2 Cache (Redis)
      await this.initializeRedis();
      
      // Start statistics collection
      this.startStatsCollection();
      
      this.isInitialized = true;
      logger.info('🚀 CacheService initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize CacheService:', error);
      this.isInitialized = false;
    }
  }
  
  async initializeRedis() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4
    };
    
    this.redis = new Redis(redisConfig);
    
    // Register Redis events
    this.redis.on('connect', () => {
      logger.info('✅ Connected to Redis');
    });
    
    this.redis.on('error', (error) => {
      logger.warn('⚠️ Redis connection error:', error.message);
      this.stats.errors++;
    });
    
    this.redis.on('close', () => {
      logger.warn('🔌 Redis connection closed');
    });
    
    // Test connection
    try {
      await this.redis.ping();
      logger.info('🏓 Redis ping successful');
    } catch (error) {
      logger.warn('⚠️ Redis ping failed, continuing without Redis:', error.message);
      this.redis = null;
    }
    
    // Register for cleanup
    cleanupManager.registerResource(this, 'CacheService');
  }
  
  startStatsCollection() {
    cleanupManager.setInterval(() => {
      this.reportStats();
    }, 60000, 'CacheStatsReporting'); // Report every minute
    
    cleanupManager.setInterval(() => {
      this.cleanup();
    }, 300000, 'CacheCleanup'); // Cleanup every 5 minutes
  }
  
  /**
   * Get value from cache with fallback
   */
  async get(key, fallbackFn, options = {}) {
    const { 
      ttl = 300, 
      useL1 = true, 
      useL2 = true,
      skipFallback = false 
    } = options;
    
    this.stats.totalRequests++;
    
    if (!this.isInitialized) {
      logger.warn('CacheService not initialized, using fallback');
      return skipFallback ? null : (fallbackFn ? await fallbackFn() : null);
    }
    
    // Try L1 cache first
    if (useL1 && this.l1Cache) {
      const l1Value = this.l1Cache.get(key);
      if (l1Value !== undefined) {
        this.stats.l1Hits++;
        logger.debug(`L1 cache hit: ${key}`);
        return l1Value;
      }
      this.stats.l1Misses++;
    }
    
    // Try L2 cache (Redis)
    if (useL2 && this.redis) {
      try {
        const l2Value = await this.redis.get(key);
        if (l2Value !== null) {
          this.stats.l2Hits++;
          const parsed = JSON.parse(l2Value);
          
          // Store in L1 cache for faster future access
          if (useL1 && this.l1Cache) {
            this.l1Cache.set(key, parsed);
          }
          
          logger.debug(`L2 cache hit: ${key}`);
          return parsed;
        }
        this.stats.l2Misses++;
      } catch (error) {
        logger.warn(`Redis get error for key ${key}:`, error);
        this.stats.errors++;
      }
    }
    
    // Cache miss - use fallback
    if (!skipFallback && fallbackFn) {
      logger.debug(`Cache miss: ${key}, using fallback`);
      const value = await fallbackFn();
      
      if (value !== null && value !== undefined) {
        await this.set(key, value, { ttl, useL1, useL2 });
      }
      
      return value;
    }
    
    return null;
  }
  
  /**
   * Set value in cache
   */
  async set(key, value, options = {}) {
    const { ttl = 300, useL1 = true, useL2 = true } = options;
    
    if (!this.isInitialized) {
      logger.warn('CacheService not initialized, cannot set cache');
      return false;
    }
    
    // Set in L1 cache
    if (useL1 && this.l1Cache) {
      this.l1Cache.set(key, value);
      logger.debug(`L1 cache set: ${key}`);
    }
    
    // Set in L2 cache (Redis)
    if (useL2 && this.redis) {
      try {
        await this.redis.setex(key, ttl, JSON.stringify(value));
        logger.debug(`L2 cache set: ${key} (TTL: ${ttl}s)`);
      } catch (error) {
        logger.warn(`Redis set error for key ${key}:`, error);
        this.stats.errors++;
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Delete specific key
   */
  async delete(key) {
    let deleted = false;
    
    // Delete from L1
    if (this.l1Cache && this.l1Cache.has(key)) {
      this.l1Cache.delete(key);
      deleted = true;
      logger.debug(`L1 cache deleted: ${key}`);
    }
    
    // Delete from L2
    if (this.redis) {
      try {
        const result = await this.redis.del(key);
        if (result > 0) {
          deleted = true;
          logger.debug(`L2 cache deleted: ${key}`);
        }
      } catch (error) {
        logger.warn(`Redis delete error for key ${key}:`, error);
        this.stats.errors++;
      }
    }
    
    return deleted;
  }
  
  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern) {
    let invalidated = 0;
    
    // Clear L1 cache completely (no pattern support in LRU)
    if (this.l1Cache) {
      const size = this.l1Cache.size;
      this.l1Cache.clear();
      invalidated += size;
      logger.debug(`L1 cache cleared: ${size} items`);
    }
    
    // Clear matching Redis keys
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          const result = await this.redis.del(...keys);
          invalidated += result;
          logger.debug(`L2 cache invalidated: ${result} keys matching ${pattern}`);
        }
      } catch (error) {
        logger.warn(`Redis invalidation error for pattern ${pattern}:`, error);
        this.stats.errors++;
      }
    }
    
    return invalidated;
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const l1Stats = this.l1Cache ? {
      size: this.l1Cache.size,
      max: this.l1Cache.max
    } : { size: 0, max: 0 };
    
    const hitRate = this.stats.totalRequests > 0 
      ? Math.round(((this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalRequests) * 100)
      : 0;
      
    return {
      isInitialized: this.isInitialized,
      l1: l1Stats,
      l2Connected: this.redis !== null,
      stats: {
        ...this.stats,
        hitRate
      }
    };
  }
  
  reportStats() {
    const stats = this.getStats();
    logger.info('📊 Cache Statistics:', {
      hitRate: `${stats.stats.hitRate}%`,
      l1Size: stats.l1.size,
      totalRequests: stats.stats.totalRequests,
      errors: stats.stats.errors
    });
  }
  
  /**
   * Cleanup old entries and reset stats
   */
  cleanup() {
    // Reset periodic stats (keep running totals)
    if (this.stats.totalRequests > 10000) {
      logger.debug('Resetting cache statistics');
      this.stats = {
        l1Hits: 0,
        l1Misses: 0,
        l2Hits: 0,
        l2Misses: 0,
        totalRequests: 0,
        errors: 0
      };
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  /**
   * Cleanup method for CleanupManager
   */
  async cleanup() {
    logger.info('🧹 CacheService cleanup initiated');
    
    // Clear L1 cache
    if (this.l1Cache) {
      this.l1Cache.clear();
      logger.debug('L1 cache cleared');
    }
    
    // Disconnect Redis
    if (this.redis) {
      try {
        await this.redis.disconnect();
        logger.debug('Redis disconnected');
      } catch (error) {
        logger.warn('Error disconnecting Redis:', error);
      }
    }
    
    this.isInitialized = false;
    logger.info('✅ CacheService cleanup completed');
  }
  
  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      l1: true,
      l2: false,
      overall: false
    };
    
    // Check L1 cache
    if (this.l1Cache) {
      try {
        this.l1Cache.set('health_check', true);
        health.l1 = this.l1Cache.get('health_check') === true;
        this.l1Cache.delete('health_check');
      } catch (error) {
        health.l1 = false;
      }
    }
    
    // Check L2 cache (Redis)
    if (this.redis) {
      try {
        const result = await this.redis.ping();
        health.l2 = result === 'PONG';
      } catch (error) {
        health.l2 = false;
      }
    }
    
    health.overall = health.l1; // L1 is required, L2 is optional
    
    return health;
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;