/**
 * PHASE 1 CRITICAL: Redis Configuration for Session Persistence
 * Solves memory accumulation and session loss issues
 * Implements Global Rules 12, 43 compliance
 */

const redis = require('redis');

class RedisConfig {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    // Redis configuration
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || null,
      db: process.env.REDIS_DB || 0,
      
      // Connection options
      connectTimeout: 10000,
      lazyConnect: true,
      
      // Memory optimization
      maxMemoryPolicy: 'allkeys-lru',
      
      // Session-specific settings
      sessionPrefix: process.env.REDIS_SESSION_PREFIX || 'lodge:session:',
      callbackPrefix: process.env.REDIS_CALLBACK_PREFIX || 'lodge:callback:',
      
      // TTL settings (in seconds)
      sessionTTL: parseInt(process.env.REDIS_SESSION_TTL) || 7200, // 2 hours
      callbackTTL: parseInt(process.env.REDIS_CALLBACK_TTL) || 300,  // 5 minutes
      
      // Memory limits
      maxMemoryMB: parseInt(process.env.REDIS_MAX_MEMORY_MB) || 256,
      warningThresholdMB: parseInt(process.env.REDIS_WARNING_THRESHOLD_MB) || 200
    };
  }

  /**
   * Initialize Redis connection with error handling
   */
  async connect() {
    try {
      console.log('🔗 Connecting to Redis...', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db
      });

      this.client = redis.createClient({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        connectTimeout: this.config.connectTimeout,
        lazyConnect: this.config.lazyConnect,
        retry_strategy: (options) => this.retryStrategy(options)
      });

      // Event listeners
      this.client.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('🔌 Redis connection ended');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
        this.reconnectAttempts++;
      });

      // Connect to Redis
      await this.client.connect();
      
      // Set memory policy if supported
      try {
        await this.client.configSet('maxmemory-policy', this.config.maxMemoryPolicy);
      } catch (configError) {
        console.warn('⚠️ Could not set Redis memory policy:', configError.message);
      }

      return this.client;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Retry strategy for Redis connection
   */
  retryStrategy(options) {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.error('❌ Redis server connection refused');
      return new Error('Redis server connection refused');
    }
    
    if (options.total_retry_time > 1000 * 60 * 10) { // 10 minutes
      console.error('❌ Redis retry time exhausted');
      return new Error('Redis retry time exhausted');
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max Redis reconnection attempts reached');
      return new Error('Max reconnection attempts reached');
    }
    
    // Exponential backoff
    return Math.min(options.attempt * 100, 3000);
  }

  /**
   * Store session data with TTL
   */
  async storeSession(sessionId, data, ttl = null) {
    if (!this.isConnected) {
      console.warn('⚠️ Redis not connected, skipping session store');
      return false;
    }

    try {
      const key = `${this.config.sessionPrefix}${sessionId}`;
      const serializedData = JSON.stringify(data);
      const sessionTTL = ttl || this.config.sessionTTL;
      
      await this.client.setEx(key, sessionTTL, serializedData);
      
      console.log(`✅ Session stored: ${sessionId} (TTL: ${sessionTTL}s)`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store session:', error);
      return false;
    }
  }

  /**
   * Retrieve session data
   */
  async getSession(sessionId) {
    if (!this.isConnected) {
      console.warn('⚠️ Redis not connected, returning null session');
      return null;
    }

    try {
      const key = `${this.config.sessionPrefix}${sessionId}`;
      const data = await this.client.get(key);
      
      if (data) {
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get session:', error);
      return null;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const key = `${this.config.sessionPrefix}${sessionId}`;
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete session:', error);
      return false;
    }
  }

  /**
   * Store callback query data with short TTL
   */
  async storeCallback(callbackId, data) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const key = `${this.config.callbackPrefix}${callbackId}`;
      const serializedData = JSON.stringify(data);
      
      await this.client.setEx(key, this.config.callbackTTL, serializedData);
      return true;
    } catch (error) {
      console.error('❌ Failed to store callback:', error);
      return false;
    }
  }

  /**
   * Get memory usage statistics
   */
  async getMemoryStats() {
    if (!this.isConnected) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const lines = info.split('\r\n');
      const memoryStats = {};
      
      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          memoryStats[key] = value;
        }
      });
      
      const usedMemoryMB = parseInt(memoryStats.used_memory) / (1024 * 1024);
      
      return {
        usedMemoryMB: usedMemoryMB.toFixed(2),
        maxMemoryMB: this.config.maxMemoryMB,
        warningThresholdMB: this.config.warningThresholdMB,
        isNearLimit: usedMemoryMB > this.config.warningThresholdMB,
        ...memoryStats
      };
    } catch (error) {
      console.error('❌ Failed to get Redis memory stats:', error);
      return null;
    }
  }

  /**
   * Clean up expired keys
   */
  async cleanup() {
    if (!this.isConnected) {
      return;
    }

    try {
      // Get all session keys
      const sessionKeys = await this.client.keys(`${this.config.sessionPrefix}*`);
      const callbackKeys = await this.client.keys(`${this.config.callbackPrefix}*`);
      
      console.log(`🧹 Found ${sessionKeys.length} session keys, ${callbackKeys.length} callback keys`);
      
      // Redis handles TTL automatically, but we can force cleanup if needed
      if (sessionKeys.length > 1000) { // If too many keys, force cleanup
        const expiredSessions = [];
        for (const key of sessionKeys) {
          const ttl = await this.client.ttl(key);
          if (ttl === -2) { // Key doesn't exist
            expiredSessions.push(key);
          }
        }
        
        if (expiredSessions.length > 0) {
          await this.client.del(expiredSessions);
          console.log(`🧹 Cleaned up ${expiredSessions.length} expired session keys`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup Redis keys:', error);
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        console.log('✅ Redis disconnected successfully');
      } catch (error) {
        console.error('❌ Error disconnecting from Redis:', error);
      }
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable() {
    return this.isConnected && this.client;
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

// Singleton instance
const redisConfig = new RedisConfig();

module.exports = redisConfig;