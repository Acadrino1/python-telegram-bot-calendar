const Redis = require('ioredis');
const { EventEmitter } = require('events');

/**
 * RedisManager - Handles Redis connections with failover and clustering support
 */
class RedisManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      ...config
    };
    
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      operations: 0
    };
  }
  
  async connect() {
    try {
      // Main client for general operations
      this.client = new Redis({
        ...this.config,
        lazyConnect: true,
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true; // Reconnect on READONLY error
          }
          return false;
        }
      });
      
      // Subscriber client for pub/sub
      this.subscriber = this.client.duplicate();
      
      // Publisher client for pub/sub
      this.publisher = this.client.duplicate();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);
      
      this.isConnected = true;
      this.emit('connected');
      
      console.log('✅ Redis connected successfully');
      
      // Test connection
      await this.client.ping();
      
      return true;
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      this.emit('error', error);
      
      // Fallback to memory mode
      this.setupMemoryFallback();
      return false;
    }
  }
  
  setupEventHandlers() {
    // Main client events
    this.client.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Redis client connected');
    });
    
    this.client.on('ready', () => {
      console.log('Redis client ready');
    });
    
    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
      this.stats.errors++;
      this.emit('error', err);
    });
    
    this.client.on('close', () => {
      this.isConnected = false;
      console.log('Redis connection closed');
    });
    
    this.client.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`Redis reconnecting... (attempt ${this.reconnectAttempts})`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached, switching to memory mode');
        this.setupMemoryFallback();
      }
    });
  }
  
  setupMemoryFallback() {
    console.warn('⚠️ Redis unavailable, using memory fallback');
    
    // Create simple memory store
    this.memoryStore = new Map();
    this.client = {
      get: async (key) => this.memoryStore.get(key),
      set: async (key, value, ...args) => {
        this.memoryStore.set(key, value);
        // Handle TTL if provided
        if (args[0] === 'EX' && args[1]) {
          setTimeout(() => this.memoryStore.delete(key), args[1] * 1000);
        }
        return 'OK';
      },
      del: async (...keys) => {
        let deleted = 0;
        keys.forEach(key => {
          if (this.memoryStore.delete(key)) deleted++;
        });
        return deleted;
      },
      exists: async (key) => this.memoryStore.has(key) ? 1 : 0,
      ttl: async (key) => -1, // No TTL tracking in memory mode
      ping: async () => 'PONG',
      flushdb: async () => {
        this.memoryStore.clear();
        return 'OK';
      }
    };
    
    this.isConnected = false;
    this.emit('fallback');
  }
  
  // Session management
  async getSession(key) {
    try {
      this.stats.operations++;
      const data = await this.client.get(`session:${key}`);
      
      if (data) {
        this.stats.hits++;
        return JSON.parse(data);
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.errors++;
      console.error('Session get error:', error);
      return null;
    }
  }
  
  async setSession(key, value, ttl = 3600) {
    try {
      this.stats.operations++;
      const data = JSON.stringify(value);
      await this.client.set(`session:${key}`, data, 'EX', ttl);
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error('Session set error:', error);
      return false;
    }
  }
  
  async deleteSession(key) {
    try {
      this.stats.operations++;
      await this.client.del(`session:${key}`);
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error('Session delete error:', error);
      return false;
    }
  }
  
  // Cache management
  async getCached(key) {
    try {
      this.stats.operations++;
      const data = await this.client.get(`cache:${key}`);
      
      if (data) {
        this.stats.hits++;
        return JSON.parse(data);
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache get error:', error);
      return null;
    }
  }
  
  async setCached(key, value, ttl = 600) {
    try {
      this.stats.operations++;
      const data = JSON.stringify(value);
      await this.client.set(`cache:${key}`, data, 'EX', ttl);
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache set error:', error);
      return false;
    }
  }
  
  async invalidateCache(pattern) {
    try {
      const keys = await this.client.keys(`cache:${pattern}`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return 0;
    }
  }
  
  // Rate limiting
  async checkRateLimit(key, limit = 30, window = 60) {
    try {
      const current = await this.client.incr(`rate:${key}`);
      
      if (current === 1) {
        await this.client.expire(`rate:${key}`, window);
      }
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetIn: await this.client.ttl(`rate:${key}`)
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Allow on error to prevent blocking users
      return { allowed: true, remaining: limit, resetIn: window };
    }
  }
  
  // Pub/Sub
  async publish(channel, message) {
    try {
      const data = JSON.stringify(message);
      await this.publisher.publish(channel, data);
      return true;
    } catch (error) {
      console.error('Publish error:', error);
      return false;
    }
  }
  
  async subscribe(channel, callback) {
    try {
      await this.subscriber.subscribe(channel);
      
      this.subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          try {
            const data = JSON.parse(message);
            callback(data);
          } catch (error) {
            console.error('Message parse error:', error);
          }
        }
      });
      
      return true;
    } catch (error) {
      console.error('Subscribe error:', error);
      return false;
    }
  }
  
  // Health check
  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        connected: this.isConnected,
        latency,
        stats: this.getStats(),
        mode: this.isConnected ? 'redis' : 'memory'
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        mode: 'memory'
      };
    }
  }
  
  // Get statistics
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      total
    };
  }
  
  // Cleanup
  async disconnect() {
    try {
      if (this.client && this.client.disconnect) {
        await this.client.disconnect();
      }
      if (this.subscriber && this.subscriber.disconnect) {
        await this.subscriber.disconnect();
      }
      if (this.publisher && this.publisher.disconnect) {
        await this.publisher.disconnect();
      }
      
      this.isConnected = false;
      console.log('Redis disconnected');
    } catch (error) {
      console.error('Redis disconnect error:', error);
    }
  }
}

module.exports = RedisManager;