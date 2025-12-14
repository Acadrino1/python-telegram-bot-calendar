/**
 * PerformanceMonitor - Real-time performance tracking and optimization
 * Monitors memory, response times, database queries, cache performance, and active users
 */

const cleanupManager = require('../utils/CleanupManager');
const logger = require('../utils/logger');

class PerformanceMonitor {
  constructor() {
    this.isInitialized = false;
    this.startTime = Date.now();
    
    // Performance metrics
    this.metrics = {
      requests: 0,
      responseTime: [],
      dbQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: [],
      activeUsers: new Set(),
      errors: 0,
      networkErrors: 0,
      telegramApiCalls: 0,
      telegramApiErrors: 0
    };
    
    // Performance thresholds - realistic for Node.js apps
    this.thresholds = {
      memoryWarning: 100 * 1024 * 1024, // 100MB
      memoryCritical: 130 * 1024 * 1024, // 130MB
      responseTimeWarning: 1000, // 1 second
      responseTimeCritical: 3000, // 3 seconds
      errorRateWarning: 5, // 5%
      errorRateCritical: 10 // 10%
    };
    
    // Historical data for trending
    this.history = {
      hourly: [],
      daily: []
    };
    
    this.initialize();
  }
  
  initialize() {
    try {
      this.startMonitoring();
      this.isInitialized = true;
      logger.info('📊 PerformanceMonitor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PerformanceMonitor:', error);
      this.isInitialized = false;
    }
  }
  
  startMonitoring() {
    // Collect metrics every 5 seconds
    cleanupManager.setInterval(() => {
      this.collectMetrics();
    }, 5000, 'MetricsCollection');
    
    // Report metrics every 30 seconds
    cleanupManager.setInterval(() => {
      this.reportMetrics();
    }, 30000, 'MetricsReporting');
    
    // Clean up old data every 5 minutes
    cleanupManager.setInterval(() => {
      this.cleanupOldData();
    }, 300000, 'MetricsCleanup');
    
    // Generate hourly reports
    cleanupManager.setInterval(() => {
      this.generateHourlyReport();
    }, 3600000, 'HourlyReporting');
    
    logger.info('⏰ Performance monitoring timers started');
  }
  
  collectMetrics() {
    if (!this.isInitialized) return;
    
    try {
      // Collect memory usage
      const usage = process.memoryUsage();
      const memoryData = {
        timestamp: Date.now(),
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024)
      };
      
      this.metrics.memoryUsage.push(memoryData);
      
      // Keep only last 720 samples (1 hour at 5-second intervals)
      if (this.metrics.memoryUsage.length > 720) {
        this.metrics.memoryUsage.splice(0, 360); // Remove oldest half
      }
      
      // Check memory thresholds
      this.checkMemoryThresholds(memoryData);
      
      // Clean up active users (remove inactive after 5 minutes)
      this.cleanupActiveUsers();
      
    } catch (error) {
      logger.error('Error collecting metrics:', error);
    }
  }
  
  checkMemoryThresholds(memoryData) {
    const heapUsedBytes = memoryData.heapUsed * 1024 * 1024;
    
    if (heapUsedBytes > this.thresholds.memoryCritical) {
      logger.warn(`🚨 CRITICAL: Memory usage at ${memoryData.heapUsed}MB`);
      this.triggerMemoryCleanup();
    } else if (heapUsedBytes > this.thresholds.memoryWarning) {
      logger.warn(`⚠️ WARNING: Memory usage at ${memoryData.heapUsed}MB`);
    }
  }
  
  triggerMemoryCleanup() {
    logger.info('🧹 Triggering emergency memory cleanup');
    
    // Clear old response time data
    if (this.metrics.responseTime.length > 100) {
      this.metrics.responseTime.splice(0, this.metrics.responseTime.length - 100);
    }
    
    // Clear old memory usage data
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage.splice(0, this.metrics.memoryUsage.length - 100);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('🗑️ Forced garbage collection completed');
    }
  }
  
  cleanupActiveUsers() {
    const fiveMinutesAgo = Date.now() - 300000; // 5 minutes
    
    // Note: In a real implementation, you'd track user activity timestamps
    // For now, we'll just clear the set periodically
    if (this.metrics.activeUsers.size > 1000) {
      this.metrics.activeUsers.clear();
      logger.debug('Cleared active users set due to size limit');
    }
  }
  
  recordRequest(responseTime, userId = null) {
    this.metrics.requests++;
    this.metrics.responseTime.push({
      time: responseTime,
      timestamp: Date.now()
    });
    
    if (userId) {
      this.metrics.activeUsers.add(userId);
    }
    
    // Keep only last 1000 response times
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime.splice(0, 500); // Remove oldest half
    }
    
    // Check response time thresholds
    if (responseTime > this.thresholds.responseTimeCritical) {
      logger.warn(`🐌 CRITICAL: Slow response time: ${responseTime}ms`);
    } else if (responseTime > this.thresholds.responseTimeWarning) {
      logger.warn(`⏱️ WARNING: Slow response time: ${responseTime}ms`);
    }
  }
  
  recordDbQuery(queryTime = 0) {
    this.metrics.dbQueries++;
    
    if (queryTime > 1000) {
      logger.warn(`🐌 Slow database query: ${queryTime}ms`);
    }
  }
  
  recordCacheHit(cacheLevel = 'unknown') {
    this.metrics.cacheHits++;
    logger.debug(`Cache hit: ${cacheLevel}`);
  }
  
  recordCacheMiss(cacheLevel = 'unknown') {
    this.metrics.cacheMisses++;
    logger.debug(`Cache miss: ${cacheLevel}`);
  }
  
  recordError(errorType = 'general', error = null) {
    this.metrics.errors++;
    
    if (errorType === 'network') {
      this.metrics.networkErrors++;
    } else if (errorType === 'telegram') {
      this.metrics.telegramApiErrors++;
    }
    
    logger.error(`Error recorded: ${errorType}`, error ? error.message : '');
  }
  
  recordTelegramApiCall() {
    this.metrics.telegramApiCalls++;
  }
  
  addActiveUser(userId) {
    this.metrics.activeUsers.add(userId);
  }
  
  removeActiveUser(userId) {
    this.metrics.activeUsers.delete(userId);
  }
  
  getMetrics() {
    const now = Date.now();
    const uptime = Math.floor((now - this.startTime) / 1000);
    
    // Calculate averages
    const recentResponseTimes = this.metrics.responseTime
      .filter(rt => (now - rt.timestamp) < 300000) // Last 5 minutes
      .map(rt => rt.time);
      
    const avgResponseTime = recentResponseTimes.length > 0
      ? Math.round(recentResponseTimes.reduce((a, b) => a + b) / recentResponseTimes.length)
      : 0;
      
    const p95ResponseTime = recentResponseTimes.length > 0
      ? Math.round(recentResponseTimes.sort((a, b) => a - b)[Math.floor(recentResponseTimes.length * 0.95)])
      : 0;
    
    // Calculate cache hit rate
    const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? Math.round((this.metrics.cacheHits / totalCacheRequests) * 100)
      : 0;
      
    // Calculate error rate
    const errorRate = this.metrics.requests > 0
      ? Math.round((this.metrics.errors / this.metrics.requests) * 100)
      : 0;
    
    // Get latest memory usage
    const latestMemory = this.metrics.memoryUsage.length > 0
      ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
      : { heapUsed: 0, heapTotal: 0, rss: 0 };
    
    return {
      uptime,
      requests: this.metrics.requests,
      avgResponseTime,
      p95ResponseTime,
      dbQueries: this.metrics.dbQueries,
      cacheHitRate,
      activeUsers: this.metrics.activeUsers.size,
      errors: this.metrics.errors,
      errorRate,
      networkErrors: this.metrics.networkErrors,
      telegramApiCalls: this.metrics.telegramApiCalls,
      telegramApiErrors: this.metrics.telegramApiErrors,
      memory: latestMemory,
      memoryTrend: this.getMemoryTrend()
    };
  }
  
  getMemoryTrend() {
    if (this.metrics.memoryUsage.length < 2) {
      return 'stable';
    }
    
    const recent = this.metrics.memoryUsage.slice(-10); // Last 10 samples
    const firstUsage = recent[0].heapUsed;
    const lastUsage = recent[recent.length - 1].heapUsed;
    const diff = lastUsage - firstUsage;
    
    if (diff > 2) return 'increasing';
    if (diff < -2) return 'decreasing';
    return 'stable';
  }
  
  reportMetrics() {
    if (!this.isInitialized) return;
    
    const metrics = this.getMetrics();
    
    logger.info('📊 Performance Report:', {
      uptime: `${Math.floor(metrics.uptime / 60)}m ${metrics.uptime % 60}s`,
      requests: metrics.requests,
      avgResponseTime: `${metrics.avgResponseTime}ms`,
      p95ResponseTime: `${metrics.p95ResponseTime}ms`,
      dbQueries: metrics.dbQueries,
      cacheHitRate: `${metrics.cacheHitRate}%`,
      activeUsers: metrics.activeUsers,
      errorRate: `${metrics.errorRate}%`,
      memoryUsage: `${metrics.memory.heapUsed}MB/${metrics.memory.heapTotal}MB`,
      memoryTrend: metrics.memoryTrend
    });
    
    // Check for performance issues
    this.checkPerformanceAlerts(metrics);
  }
  
  checkPerformanceAlerts(metrics) {
    const alerts = [];
    
    if (metrics.errorRate > 10) {
      alerts.push(`High error rate: ${metrics.errorRate}%`);
    }
    
    if (metrics.avgResponseTime > 1000) {
      alerts.push(`Slow response time: ${metrics.avgResponseTime}ms`);
    }
    
    if (metrics.cacheHitRate < 50 && metrics.requests > 100) {
      alerts.push(`Low cache hit rate: ${metrics.cacheHitRate}%`);
    }
    
    if (metrics.memory.heapUsed > 100) {
      alerts.push(`High memory usage: ${metrics.memory.heapUsed}MB`);
    }
    
    if (alerts.length > 0) {
      logger.warn('🚨 Performance Alerts:', alerts);
    }
  }
  
  generateHourlyReport() {
    const metrics = this.getMetrics();
    const hourlyData = {
      timestamp: Date.now(),
      ...metrics
    };
    
    this.history.hourly.push(hourlyData);
    
    // Keep only last 24 hours
    if (this.history.hourly.length > 24) {
      this.history.hourly.splice(0, this.history.hourly.length - 24);
    }
    
    logger.info('📈 Hourly performance report generated');
  }
  
  cleanupOldData() {
    const oneHourAgo = Date.now() - 3600000;
    
    // Clean up old response times
    this.metrics.responseTime = this.metrics.responseTime.filter(
      rt => rt.timestamp > oneHourAgo
    );
    
    logger.debug('🧹 Cleaned up old performance data');
  }
  
  getHealthStatus() {
    const metrics = this.getMetrics();
    
    let status = 'healthy';
    let issues = [];
    
    if (metrics.errorRate > 5) {
      status = 'warning';
      issues.push(`Error rate: ${metrics.errorRate}%`);
    }
    
    if (metrics.avgResponseTime > 1000) {
      status = 'warning';
      issues.push(`Response time: ${metrics.avgResponseTime}ms`);
    }
    
    if (metrics.memory.heapUsed > 100) {
      status = 'critical';
      issues.push(`Memory usage: ${metrics.memory.heapUsed}MB`);
    }
    
    if (metrics.errorRate > 10 || metrics.avgResponseTime > 3000) {
      status = 'critical';
    }
    
    return {
      status,
      issues,
      metrics: {
        uptime: metrics.uptime,
        requests: metrics.requests,
        activeUsers: metrics.activeUsers,
        memoryUsage: `${metrics.memory.heapUsed}MB`,
        responseTime: `${metrics.avgResponseTime}ms`,
        errorRate: `${metrics.errorRate}%`,
        cacheHitRate: `${metrics.cacheHitRate}%`
      }
    };
  }
  
  /**
   * Get performance history for dashboards
   */
  getPerformanceHistory(period = 'hourly') {
    return this.history[period] || [];
  }
  
  /**
   * Reset all metrics (for testing or maintenance)
   */
  resetMetrics() {
    logger.warn('🔄 Resetting all performance metrics');
    
    this.metrics = {
      requests: 0,
      responseTime: [],
      dbQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: [],
      activeUsers: new Set(),
      errors: 0,
      networkErrors: 0,
      telegramApiCalls: 0,
      telegramApiErrors: 0
    };
    
    this.startTime = Date.now();
  }
  
  /**
   * Cleanup method for CleanupManager
   */
  cleanup() {
    logger.info('🧹 PerformanceMonitor cleanup initiated');
    
    // Clear all data
    this.metrics.responseTime = [];
    this.metrics.memoryUsage = [];
    this.metrics.activeUsers.clear();
    this.history.hourly = [];
    this.history.daily = [];
    
    this.isInitialized = false;
    logger.info('✅ PerformanceMonitor cleanup completed');
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;