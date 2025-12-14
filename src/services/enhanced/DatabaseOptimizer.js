/**
 * Database Optimizer for Telegram Bot
 * Optimizes database connections, queries, and performance
 */

const EventEmitter = require('events');
const Knex = require('knex');

class DatabaseOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      // Connection pool settings
      poolMin: options.poolMin || 2,
      poolMax: options.poolMax || 10,
      acquireTimeoutMillis: options.acquireTimeoutMillis || 30000,
      createTimeoutMillis: options.createTimeoutMillis || 30000,
      destroyTimeoutMillis: options.destroyTimeoutMillis || 5000,
      idleTimeoutMillis: options.idleTimeoutMillis || 30000,
      reapIntervalMillis: options.reapIntervalMillis || 1000,
      createRetryIntervalMillis: options.createRetryIntervalMillis || 200,
      
      // Query optimization
      enableQueryCache: options.enableQueryCache !== false,
      cacheSize: options.cacheSize || 100,
      cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
      enableQueryLogging: options.enableQueryLogging || false,
      slowQueryThreshold: options.slowQueryThreshold || 1000, // 1 second
      
      // Performance monitoring
      enableMonitoring: options.enableMonitoring !== false,
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      
      ...options
    };
    
    // Query cache
    this.queryCache = new Map();
    
    // Performance stats
    this.stats = {
      queries: { total: 0, cached: 0, slow: 0 },
      connections: { active: 0, idle: 0, pending: 0 },
      performance: { averageQueryTime: 0, totalQueryTime: 0 }
    };
    
    // Query history for analysis
    this.queryHistory = [];
    this.maxHistorySize = 1000;
    
    console.log('✅ DatabaseOptimizer initialized');
  }

  /**
   * Initialize optimized database connection
   */
  initializeConnection(databaseConfig) {
    const optimizedConfig = {
      ...databaseConfig,
      pool: {
        min: this.config.poolMin,
        max: this.config.poolMax,
        acquireTimeoutMillis: this.config.acquireTimeoutMillis,
        createTimeoutMillis: this.config.createTimeoutMillis,
        destroyTimeoutMillis: this.config.destroyTimeoutMillis,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        reapIntervalMillis: this.config.reapIntervalMillis,
        createRetryIntervalMillis: this.config.createRetryIntervalMillis
      },
      useNullAsDefault: true,
      debug: this.config.enableQueryLogging
    };
    
    // Add query logging and performance monitoring
    if (this.config.enableMonitoring || this.config.enableQueryLogging) {
      optimizedConfig.log = {
        warn: (message) => console.warn('🟡 DB Warning:', message),
        error: (message) => console.error('❌ DB Error:', message),
        debug: (message) => {
          if (this.config.enableQueryLogging) {
            console.log('🔍 DB Debug:', message);
          }
        },
        deprecate: (message) => console.warn('⚠️ DB Deprecation:', message)
      };
    }
    
    this.knex = Knex(optimizedConfig);
    
    // Add query performance monitoring
    this.setupQueryMonitoring();
    
    // Start connection monitoring
    if (this.config.enableMonitoring) {
      this.startConnectionMonitoring();
    }
    
    console.log('✅ Optimized database connection established');
    return this.knex;
  }

  /**
   * Setup query performance monitoring
   */
  setupQueryMonitoring() {
    this.knex.on('query', (queryData) => {
      const startTime = Date.now();
      queryData.startTime = startTime;
      
      this.emit('query-start', queryData);
    });
    
    this.knex.on('query-response', (response, queryData, builder) => {
      const endTime = Date.now();
      const queryTime = endTime - queryData.startTime;
      
      // Update statistics
      this.stats.queries.total++;
      this.stats.performance.totalQueryTime += queryTime;
      this.stats.performance.averageQueryTime = 
        this.stats.performance.totalQueryTime / this.stats.queries.total;
      
      // Track slow queries
      if (queryTime > this.config.slowQueryThreshold) {
        this.stats.queries.slow++;
        console.warn(`🐌 Slow query (${queryTime}ms):`, queryData.sql?.substring(0, 100));
        this.emit('slow-query', { queryData, queryTime });
      }
      
      // Add to query history
      this.addToQueryHistory(queryData, queryTime);
      
      this.emit('query-complete', { queryData, queryTime, response });
    });
    
    this.knex.on('query-error', (error, queryData) => {
      console.error('❌ Query error:', error.message);
      this.emit('query-error', { error, queryData });
    });
  }

  /**
   * Start connection monitoring
   */
  startConnectionMonitoring() {
    const monitoringInterval = setInterval(() => {
      this.updateConnectionStats();
    }, this.config.monitoringInterval);
    
    // Store interval for cleanup
    this.monitoringInterval = monitoringInterval;
  }

  /**
   * Update connection statistics
   */
  async updateConnectionStats() {
    try {
      if (this.knex && this.knex.client && this.knex.client.pool) {
        const pool = this.knex.client.pool;
        
        this.stats.connections = {
          active: pool.numUsed() || 0,
          idle: pool.numFree() || 0,
          pending: pool.numPendingAcquires() || 0,
          total: (pool.numUsed() || 0) + (pool.numFree() || 0)
        };
        
        this.emit('connection-stats', this.stats.connections);
      }
    } catch (error) {
      console.error('Error updating connection stats:', error);
    }
  }

  /**
   * Execute optimized query with caching
   */
  async executeQuery(query, bindings = [], options = {}) {
    const {
      cacheable = true,
      cacheKey = null,
      timeout = 30000
    } = options;
    
    const startTime = Date.now();
    
    // Generate cache key
    const finalCacheKey = cacheKey || this.generateCacheKey(query, bindings);
    
    // Check cache first
    if (cacheable && this.config.enableQueryCache) {
      const cached = this.getFromCache(finalCacheKey);
      if (cached) {
        this.stats.queries.cached++;
        this.emit('cache-hit', { cacheKey: finalCacheKey, query });
        return cached;
      }
    }
    
    try {
      // Execute query with timeout
      const result = await Promise.race([
        this.knex.raw(query, bindings),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), timeout)
        )
      ]);
      
      const queryTime = Date.now() - startTime;
      
      // Cache result if cacheable
      if (cacheable && this.config.enableQueryCache) {
        this.addToCache(finalCacheKey, result);
      }
      
      return result;
      
    } catch (error) {
      const queryTime = Date.now() - startTime;
      console.error(`❌ Query failed (${queryTime}ms):`, error.message);
      throw error;
    }
  }

  /**
   * Optimized user lookup
   */
  async findUserByTelegramId(telegramId) {
    const query = `
      SELECT * FROM users 
      WHERE telegram_id = ? 
      LIMIT 1
    `;
    
    return await this.executeQuery(query, [telegramId.toString()], {
      cacheable: true,
      cacheKey: `user_telegram_${telegramId}`
    });
  }

  /**
   * Optimized appointment queries
   */
  async findAvailableSlots(serviceId, date) {
    const query = `
      SELECT * FROM appointments 
      WHERE service_id = ? 
      AND DATE(appointment_time) = DATE(?)
      AND status IN ('available', 'pending')
      ORDER BY appointment_time ASC
    `;
    
    return await this.executeQuery(query, [serviceId, date], {
      cacheable: true,
      cacheKey: `slots_${serviceId}_${date}`
    });
  }

  /**
   * Batch insert optimization
   */
  async batchInsert(table, records, options = {}) {
    const {
      batchSize = 100,
      ignoreDuplicates = false
    } = options;
    
    if (!records || records.length === 0) {
      return [];
    }
    
    const results = [];
    
    // Process in batches
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        let query = this.knex(table);
        
        if (ignoreDuplicates) {
          query = query.insert(batch).onConflict().ignore();
        } else {
          query = query.insert(batch);
        }
        
        const result = await query;
        results.push(result);
        
      } catch (error) {
        console.error(`❌ Batch insert failed for batch ${i / batchSize + 1}:`, error);
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Generate cache key for query
   */
  generateCacheKey(query, bindings) {
    const queryHash = Buffer.from(query + JSON.stringify(bindings))
      .toString('base64')
      .substring(0, 32);
    return `query_${queryHash}`;
  }

  /**
   * Add result to cache
   */
  addToCache(key, result) {
    const expiry = Date.now() + this.config.cacheTTL;
    
    this.queryCache.set(key, {
      result,
      expiry,
      created: Date.now()
    });
    
    // Clean cache if it gets too large
    if (this.queryCache.size > this.config.cacheSize) {
      this.cleanCache();
    }
  }

  /**
   * Get result from cache
   */
  getFromCache(key) {
    const cached = this.queryCache.get(key);
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() > cached.expiry) {
      this.queryCache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  /**
   * Clean expired cache entries
   */
  cleanCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, cached] of this.queryCache.entries()) {
      if (now > cached.expiry) {
        this.queryCache.delete(key);
        cleaned++;
      }
    }
    
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }

  /**
   * Add query to history for analysis
   */
  addToQueryHistory(queryData, queryTime) {
    this.queryHistory.push({
      sql: queryData.sql,
      bindings: queryData.bindings,
      queryTime,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory = this.queryHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Analyze query performance
   */
  analyzePerformance() {
    const analysis = {
      totalQueries: this.stats.queries.total,
      cachedQueries: this.stats.queries.cached,
      slowQueries: this.stats.queries.slow,
      cacheHitRate: this.stats.queries.total > 0 ? 
        ((this.stats.queries.cached / this.stats.queries.total) * 100).toFixed(2) + '%' : '0%',
      averageQueryTime: this.stats.performance.averageQueryTime.toFixed(2) + 'ms',
      connections: this.stats.connections,
      cacheSize: this.queryCache.size
    };
    
    // Find most common slow queries
    const slowQueries = this.queryHistory
      .filter(q => q.queryTime > this.config.slowQueryThreshold)
      .reduce((acc, q) => {
        const sql = q.sql.substring(0, 100);
        acc[sql] = (acc[sql] || 0) + 1;
        return acc;
      }, {});
    
    analysis.commonSlowQueries = Object.entries(slowQueries)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    return analysis;
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      ...this.stats,
      cache: {
        size: this.queryCache.size,
        maxSize: this.config.cacheSize,
        hitRate: this.stats.queries.total > 0 ? 
          ((this.stats.queries.cached / this.stats.queries.total) * 100).toFixed(2) + '%' : '0%'
      },
      queryHistory: {
        size: this.queryHistory.length,
        maxSize: this.maxHistorySize
      }
    };
  }

  /**
   * Optimize database tables
   */
  async optimizeTables() {
    try {
      // SQLite optimization
      if (this.knex.client.config.client === 'sqlite3') {
        await this.knex.raw('PRAGMA optimize');
        await this.knex.raw('VACUUM');
        console.log('✅ SQLite database optimized');
      }
      
      // MySQL optimization
      if (this.knex.client.config.client === 'mysql2') {
        const tables = await this.knex.raw('SHOW TABLES');
        for (const table of tables[0]) {
          const tableName = Object.values(table)[0];
          await this.knex.raw(`OPTIMIZE TABLE ??`, [tableName]);
        }
        console.log('✅ MySQL tables optimized');
      }
      
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
    }
  }

  /**
   * Clear query cache
   */
  clearCache() {
    const size = this.queryCache.size;
    this.queryCache.clear();
    console.log(`🧹 Cleared ${size} cached queries`);
  }

  /**
   * Shutdown with cleanup
   */
  async shutdown() {
    console.log('🔄 DatabaseOptimizer shutting down...');
    
    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Clear cache
    this.clearCache();
    
    // Close database connection
    if (this.knex) {
      await this.knex.destroy();
      console.log('✅ Database connection closed');
    }
    
    console.log('✅ DatabaseOptimizer shutdown complete');
  }
}

module.exports = DatabaseOptimizer;