const Bottleneck = require('bottleneck');
const { LRUCache: LRU } = require('lru-cache');
// Removed p-limit due to ES module incompatibility - using Bottleneck instead
// const pLimit = require('p-limit');

class ScalabilityManager {
  constructor() {
    // User-specific rate limiting (30 requests per minute per user)
    this.userLimiters = new LRU({
      max: 200, // Support up to 200 concurrent users
      ttl: 1000 * 60 * 10, // 10 minute TTL
      dispose: (key, limiter) => {
        console.log(`Rate limiter for user ${key} expired`);
      }
    });

    // Global rate limiter for Telegram API (30 req/sec max)
    this.globalLimiter = new Bottleneck({
      maxConcurrent: 10,
      minTime: 33, // ~30 requests per second
      reservoir: 30,
      reservoirRefreshAmount: 30,
      reservoirRefreshInterval: 1000
    });

    // Database connection pool limiter
    this.dbLimiter = new Bottleneck({
      maxConcurrent: 50, // 50 concurrent database operations
      minTime: 10 // Min 10ms between operations
    });

    // Heavy operation queue (like booking confirmations)
    // Use Bottleneck instead of pLimit for heavy operations
    this.heavyOpsLimiter = new Bottleneck({
      maxConcurrent: 5, // Max 5 concurrent heavy operations
      minTime: 100 // Min 100ms between operations
    });

    // Session cache for faster responses
    this.sessionCache = new LRU({
      max: 500, // Cache 500 sessions
      ttl: 1000 * 60 * 5 // 5 minute TTL
    });

    // Booking cache to reduce database hits
    this.bookingCache = new LRU({
      max: 1000,
      ttl: 1000 * 60 * 2 // 2 minute TTL for booking data
    });

    // Track active users
    this.activeUsers = new Set();
    this.userActivity = new Map();

    // Queue for handling burst traffic
    this.requestQueue = [];
    this.processing = false;

    // Metrics
    this.metrics = {
      totalRequests: 0,
      activeUsers: 0,
      queueLength: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimitHits: 0,
      dbOperations: 0,
      avgResponseTime: 0
    };

    this.startMetricsCollection();
  }

  // Get or create rate limiter for specific user
  getUserLimiter(userId) {
    if (!this.userLimiters.has(userId)) {
      const limiter = new Bottleneck({
        maxConcurrent: 3, // 3 concurrent requests per user
        minTime: 2000, // Min 2 seconds between requests
        reservoir: 10, // 10 requests
        reservoirRefreshAmount: 10,
        reservoirRefreshInterval: 60000 // Refresh every minute
      });

      this.userLimiters.set(userId, limiter);
    }

    return this.userLimiters.get(userId);
  }

  // Process user request with rate limiting
  async processUserRequest(userId, operation) {
    this.metrics.totalRequests++;
    this.activeUsers.add(userId);
    this.userActivity.set(userId, Date.now());

    const userLimiter = this.getUserLimiter(userId);
    
    try {
      // Check if user is rate limited
      const userLimited = await userLimiter.schedule(async () => {
        // Then check global rate limit
        return await this.globalLimiter.schedule(async () => {
          return await operation();
        });
      });

      return userLimited;
    } catch (error) {
      if (error.message.includes('rate limit')) {
        this.metrics.rateLimitHits++;
        throw new Error('Too many requests. Please wait a moment and try again.');
      }
      throw error;
    }
  }

  // Process database operation with connection pooling
  async processDatabaseOperation(operation) {
    this.metrics.dbOperations++;
    
    return await this.dbLimiter.schedule(async () => {
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;
      
      // Update average response time
      this.metrics.avgResponseTime = 
        (this.metrics.avgResponseTime * 0.9) + (duration * 0.1);
      
      return result;
    });
  }

  // Handle heavy operations with queue
  async processHeavyOperation(operation) {
    return await this.heavyOpsLimiter.schedule(() => operation());
  }

  // Cache management
  getCachedSession(userId) {
    const cached = this.sessionCache.get(userId);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }
    this.metrics.cacheMisses++;
    return null;
  }

  setCachedSession(userId, session) {
    this.sessionCache.set(userId, session);
  }

  getCachedBookings(date) {
    const key = `bookings_${date}`;
    return this.bookingCache.get(key);
  }

  setCachedBookings(date, bookings) {
    const key = `bookings_${date}`;
    this.bookingCache.set(key, bookings);
  }

  // Clean up inactive users
  cleanupInactiveUsers() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [userId, lastActivity] of this.userActivity.entries()) {
      if (now - lastActivity > timeout) {
        this.activeUsers.delete(userId);
        this.userActivity.delete(userId);
        this.userLimiters.delete(userId);
        this.sessionCache.delete(userId);
      }
    }

    this.metrics.activeUsers = this.activeUsers.size;
  }

  // Queue management for burst traffic
  async addToQueue(userId, operation) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ userId, operation, resolve, reject });
      this.metrics.queueLength = this.requestQueue.length;
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const batch = this.requestQueue.splice(0, 10); // Process 10 at a time
    
    const promises = batch.map(async ({ userId, operation, resolve, reject }) => {
      try {
        const result = await this.processUserRequest(userId, operation);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    await Promise.allSettled(promises);
    
    // Continue processing queue
    setTimeout(() => this.processQueue(), 100);
  }

  // Metrics collection
  startMetricsCollection() {
    // Clean up inactive users every minute
    setInterval(() => {
      this.cleanupInactiveUsers();
    }, 60000);

    // Log metrics every 5 minutes
    setInterval(() => {
      console.log('📊 Scalability Metrics:', {
        activeUsers: this.metrics.activeUsers,
        totalRequests: this.metrics.totalRequests,
        queueLength: this.metrics.queueLength,
        cacheHitRate: this.metrics.cacheHits / 
          (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
        avgResponseTime: Math.round(this.metrics.avgResponseTime) + 'ms',
        rateLimitHits: this.metrics.rateLimitHits,
        dbOperations: this.metrics.dbOperations
      });
    }, 300000);
  }

  // Get current system capacity
  getCapacityStatus() {
    const maxUsers = 200;
    const currentUsers = this.activeUsers.size;
    const utilizationPercent = (currentUsers / maxUsers) * 100;

    return {
      maxCapacity: maxUsers,
      currentUsers,
      utilizationPercent: Math.round(utilizationPercent),
      queueLength: this.requestQueue.length,
      canAcceptMore: currentUsers < maxUsers * 0.9, // 90% threshold
      status: utilizationPercent < 70 ? 'healthy' : 
              utilizationPercent < 90 ? 'busy' : 'at-capacity'
    };
  }

  // Burst protection
  async handleBurst(requests) {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(req => this.addToQueue(req.userId, req.operation))
      );
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
}

module.exports = ScalabilityManager;