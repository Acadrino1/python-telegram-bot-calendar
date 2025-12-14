const { Telegraf, session } = require('telegraf');
const Bottleneck = require('bottleneck');
const CircuitBreaker = require('opossum');
const { LRUCache: LRU } = require('lru-cache');
const cleanupManager = require('../utils/CleanupManager');

class BotStabilityFix {
  constructor(bot) {
    this.bot = bot;
    this.monitoringInterval = null;
    this.setupStabilityFeatures();
    
    // Register for cleanup
    cleanupManager.registerResource(this, 'BotStabilityFix');
  }

  setupStabilityFeatures() {
    // 1. Rate limiter for Telegram API calls
    this.telegramLimiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 100, // 100ms between calls
      reservoir: 30, // 30 requests
      reservoirRefreshAmount: 30,
      reservoirRefreshInterval: 1000 // per second
    });

    // 2. Circuit breaker for database operations
    this.dbBreaker = new CircuitBreaker(this.databaseOperation, {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      name: 'database'
    });

    // 3. Session cleanup with LRU cache
    this.sessionStore = new LRU({
      max: 1000, // Maximum 1000 sessions
      ttl: 1000 * 60 * 60, // 1 hour TTL
      dispose: (key, value) => {
        console.log(`Session ${key} expired and cleaned up`);
      }
    });

    // 4. Memory monitoring
    this.startMemoryMonitoring();

    // 5. Error recovery handlers
    this.setupErrorRecovery();
  }

  startMemoryMonitoring() {
    this.monitoringInterval = cleanupManager.setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      
      if (heapUsedMB > heapTotalMB * 0.8) { // Reduced threshold from 0.9 to 0.8
        console.warn(`⚠️ High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
        // Trigger cleanup
        this.cleanupSessions();
        if (global.gc) {
          global.gc();
        }
      }
    }, 15000, 'BotMemoryMonitoring'); // Reduced from 30s to 15s for better monitoring
  }

  setupErrorRecovery() {
    // Global error handlers
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit, try to recover
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      // Try to gracefully recover
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        console.log('Network error detected, will retry...');
      } else if (error.message.includes('database')) {
        console.log('Database error detected, circuit breaker activated');
        this.dbBreaker.open();
      }
    });

    // Bot-specific error handling
    this.bot.catch((err, ctx) => {
      console.error('Bot error:', err);
      
      // Don't crash on Telegram API errors
      if (err.response && err.response.error_code === 429) {
        console.log('Rate limited by Telegram, backing off...');
        return;
      }
      
      // Try to respond to user
      if (ctx && ctx.reply) {
        ctx.reply('An error occurred. Please try again in a moment.')
          .catch(() => {}); // Ignore reply errors
      }
    });
  }

  cleanupSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.sessionStore.entries()) {
      if (value.lastAccess && now - value.lastAccess > 3600000) {
        this.sessionStore.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  async databaseOperation(query) {
    // Wrapper for database operations with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database operation timeout'));
      }, 5000);

      query()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  // Wrapped Telegram API call with rate limiting
  async sendMessage(chatId, text, options = {}) {
    return this.telegramLimiter.schedule(() => 
      this.bot.telegram.sendMessage(chatId, text, options)
    );
  }

  // Health check endpoint
  getHealthStatus() {
    const memory = process.memoryUsage();
    return {
      status: 'ok',
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB'
      },
      circuitBreaker: {
        database: this.dbBreaker.stats
      },
      sessions: {
        active: this.sessionStore.size,
        maxSize: this.sessionStore.max
      }
    };
  }
  
  /**
   * Cleanup method for CleanupManager
   */
  cleanup() {
    console.log('🧹 BotStabilityFix cleanup initiated');
    
    if (this.monitoringInterval) {
      cleanupManager.clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('✅ Memory monitoring interval cleared');
    }
    
    // Clean up session store
    if (this.sessionStore) {
      this.sessionStore.clear();
      console.log('✅ Session store cleared');
    }
    
    console.log('✅ BotStabilityFix cleanup completed');
  }
}

module.exports = BotStabilityFix;