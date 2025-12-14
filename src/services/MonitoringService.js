const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Comprehensive monitoring service for Lodge Scheduler
 * Tracks application metrics, performance, and health status
 */
class MonitoringService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      metricsRetention: options.metricsRetention || 24 * 60 * 60 * 1000, // 24 hours
      alertThresholds: {
        responseTime: options.responseTimeThreshold || 5000, // 5 seconds
        errorRate: options.errorRateThreshold || 0.05, // 5%
        memoryUsage: options.memoryThreshold || 0.85, // 85%
        cpuUsage: options.cpuThreshold || 0.80, // 80%
        diskUsage: options.diskThreshold || 0.90, // 90%
        activeConnections: options.connectionThreshold || 1000
      },
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      metricsCollectionInterval: options.metricsInterval || 60000, // 1 minute
      enableDetailedMetrics: options.enableDetailedMetrics || false
    };

    // Metrics storage
    this.metrics = {
      requests: new Map(),
      responses: new Map(),
      errors: new Map(),
      database: new Map(),
      bot: new Map(),
      system: new Map()
    };

    // Request tracking
    this.requestTracking = new Map();
    
    // Alert state
    this.alerts = new Map();
    this.alertCooldowns = new Map();

    // Health status
    this.healthStatus = {
      overall: 'healthy',
      components: new Map(),
      lastCheck: null,
      uptime: process.uptime()
    };

    this.startTime = Date.now();
    this.isInitialized = false;
  }

  /**
   * Initialize the monitoring service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('🔍 Initializing Monitoring Service...');

    // Start periodic health checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Start metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsCollectionInterval);

    // Start metrics cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 60 * 60 * 1000); // Every hour

    this.isInitialized = true;
    console.log('✅ Monitoring Service initialized');
  }

  /**
   * Track incoming request
   */
  trackRequest(req) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    req.monitoringId = requestId;
    req.startTime = startTime;

    this.requestTracking.set(requestId, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      startTime,
      endpoint: `${req.method} ${req.path}`
    });

    // Track request count
    const endpoint = `${req.method} ${req.path}`;
    this.incrementMetric('requests', endpoint);
    
    return requestId;
  }

  /**
   * Track response completion
   */
  trackResponse(req, res) {
    const requestId = req.monitoringId;
    if (!requestId || !this.requestTracking.has(requestId)) return;

    const request = this.requestTracking.get(requestId);
    const responseTime = Date.now() - request.startTime;
    const statusCode = res.statusCode;

    // Track response metrics
    const endpoint = request.endpoint;
    this.recordResponseTime(endpoint, responseTime);
    this.incrementMetric('responses', `${endpoint}:${statusCode}`);

    // Track errors
    if (statusCode >= 400) {
      this.incrementMetric('errors', endpoint);
      this.recordError(endpoint, statusCode, responseTime);
    }

    // Check for slow responses
    if (responseTime > this.config.alertThresholds.responseTime) {
      this.triggerAlert('slow_response', {
        endpoint,
        responseTime,
        threshold: this.config.alertThresholds.responseTime
      });
    }

    // Cleanup tracking
    this.requestTracking.delete(requestId);

    // Emit metrics event
    this.emit('request_completed', {
      endpoint,
      responseTime,
      statusCode,
      timestamp: Date.now()
    });
  }

  /**
   * Track database query performance
   */
  trackDatabaseQuery(query, duration, success = true) {
    const queryType = this.extractQueryType(query);
    
    this.incrementMetric('database', `queries:${queryType}`);
    this.recordResponseTime(`db:${queryType}`, duration);

    if (!success) {
      this.incrementMetric('database', `errors:${queryType}`);
    }

    // Check for slow queries
    const slowQueryThreshold = 1000; // 1 second
    if (duration > slowQueryThreshold) {
      this.triggerAlert('slow_query', {
        query: query.substring(0, 100),
        duration,
        threshold: slowQueryThreshold
      });
    }
  }

  /**
   * Track bot command usage
   */
  trackBotCommand(command, userId, success = true, responseTime = 0) {
    this.incrementMetric('bot', `commands:${command}`);
    this.incrementMetric('bot', 'total_commands');
    
    if (success) {
      this.incrementMetric('bot', `commands:${command}:success`);
      this.recordResponseTime(`bot:${command}`, responseTime);
    } else {
      this.incrementMetric('bot', `commands:${command}:error`);
    }

    // Track unique users
    const today = new Date().toISOString().split('T')[0];
    const userKey = `bot:active_users:${today}`;
    if (!this.metrics.bot.has(userKey)) {
      this.metrics.bot.set(userKey, new Set());
    }
    this.metrics.bot.get(userKey).add(userId);
  }

  /**
   * Track bot session metrics
   */
  trackBotSession(userId, action, metadata = {}) {
    const sessionKey = `bot:sessions:${action}`;
    this.incrementMetric('bot', sessionKey);

    if (action === 'start') {
      this.incrementMetric('bot', 'total_sessions');
    }

    // Track session duration for end events
    if (action === 'end' && metadata.duration) {
      this.recordResponseTime('bot:session_duration', metadata.duration);
    }
  }

  /**
   * Record custom metric
   */
  recordMetric(category, key, value, timestamp = Date.now()) {
    if (!this.metrics[category]) {
      this.metrics[category] = new Map();
    }

    const metricKey = `${key}:${timestamp}`;
    this.metrics[category].set(metricKey, value);
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary() {
    const summary = {
      timestamp: Date.now(),
      uptime: process.uptime(),
      requests: this.getRequestMetrics(),
      database: this.getDatabaseMetrics(),
      bot: this.getBotMetrics(),
      system: this.getSystemMetrics(),
      health: this.healthStatus
    };

    return summary;
  }

  /**
   * Get detailed metrics for specific category
   */
  getDetailedMetrics(category, timeRange = 3600000) { // 1 hour default
    const now = Date.now();
    const cutoff = now - timeRange;
    
    if (!this.metrics[category]) return {};

    const result = {};
    for (const [key, value] of this.metrics[category].entries()) {
      const [metricKey, timestamp] = key.split(':');
      if (parseInt(timestamp) >= cutoff) {
        if (!result[metricKey]) result[metricKey] = [];
        result[metricKey].push({ value, timestamp: parseInt(timestamp) });
      }
    }

    return result;
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const checks = {
      memory: this.checkMemoryUsage(),
      database: await this.checkDatabaseHealth(),
      bot: this.checkBotHealth(),
      disk: await this.checkDiskUsage(),
      network: this.checkNetworkHealth()
    };

    let overallHealthy = true;
    const components = new Map();

    for (const [component, result] of Object.entries(checks)) {
      components.set(component, result);
      if (!result.healthy) {
        overallHealthy = false;
      }
    }

    this.healthStatus = {
      overall: overallHealthy ? 'healthy' : 'unhealthy',
      components,
      lastCheck: Date.now(),
      uptime: process.uptime()
    };

    // Emit health check event
    this.emit('health_check', this.healthStatus);

    return this.healthStatus;
  }

  /**
   * Collect system performance metrics
   */
  collectSystemMetrics() {
    const metrics = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      activeHandles: process._getActiveHandles?.()?.length || 0,
      activeRequests: process._getActiveRequests?.()?.length || 0,
      eventLoopDelay: this.measureEventLoopDelay()
    };

    // Store metrics
    for (const [key, value] of Object.entries(metrics)) {
      this.recordMetric('system', key, value);
    }

    // Check thresholds
    const memoryUsage = metrics.memory.rss / metrics.memory.external;
    if (memoryUsage > this.config.alertThresholds.memoryUsage) {
      this.triggerAlert('high_memory', {
        usage: memoryUsage,
        threshold: this.config.alertThresholds.memoryUsage
      });
    }
  }

  /**
   * Trigger alert
   */
  triggerAlert(type, details) {
    const alertKey = `${type}:${JSON.stringify(details)}`;
    
    // Check cooldown
    if (this.alertCooldowns.has(alertKey)) {
      const cooldownEnd = this.alertCooldowns.get(alertKey);
      if (Date.now() < cooldownEnd) return;
    }

    const alert = {
      type,
      details,
      timestamp: Date.now(),
      severity: this.getAlertSeverity(type),
      id: this.generateAlertId()
    };

    this.alerts.set(alert.id, alert);
    
    // Set cooldown (5 minutes)
    this.alertCooldowns.set(alertKey, Date.now() + 5 * 60 * 1000);

    // Emit alert
    this.emit('alert', alert);

    console.warn(`🚨 Alert [${type}]:`, details);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    const now = Date.now();
    const activeAlerts = [];
    
    for (const [id, alert] of this.alerts.entries()) {
      // Keep alerts for 1 hour
      if (now - alert.timestamp < 60 * 60 * 1000) {
        activeAlerts.push(alert);
      } else {
        this.alerts.delete(id);
      }
    }

    return activeAlerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate monitoring report
   */
  generateReport(timeRange = 3600000) {
    const summary = this.getMetricsSummary();
    const alerts = this.getActiveAlerts();
    
    return {
      timestamp: Date.now(),
      timeRange,
      summary,
      alerts,
      recommendations: this.generateRecommendations(summary, alerts)
    };
  }

  // Helper methods
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  incrementMetric(category, key) {
    if (!this.metrics[category]) {
      this.metrics[category] = new Map();
    }
    
    const current = this.metrics[category].get(key) || 0;
    this.metrics[category].set(key, current + 1);
  }

  recordResponseTime(endpoint, time) {
    const key = `response_times:${endpoint}`;
    if (!this.metrics.responses.has(key)) {
      this.metrics.responses.set(key, []);
    }
    
    const times = this.metrics.responses.get(key);
    times.push({ time, timestamp: Date.now() });
    
    // Keep only last 100 entries
    if (times.length > 100) {
      times.splice(0, times.length - 100);
    }
  }

  recordError(endpoint, statusCode, responseTime) {
    const errorKey = `${endpoint}:${statusCode}`;
    this.incrementMetric('errors', errorKey);
    
    const errorDetails = {
      endpoint,
      statusCode,
      responseTime,
      timestamp: Date.now()
    };
    
    const errorLog = this.metrics.errors.get('error_log') || [];
    errorLog.push(errorDetails);
    
    // Keep only last 1000 errors
    if (errorLog.length > 1000) {
      errorLog.splice(0, errorLog.length - 1000);
    }
    
    this.metrics.errors.set('error_log', errorLog);
  }

  extractQueryType(query) {
    if (typeof query === 'string') {
      const match = query.trim().toLowerCase().match(/^(\w+)/);
      return match ? match[1] : 'unknown';
    }
    return 'unknown';
  }

  getRequestMetrics() {
    const requests = {};
    for (const [key, value] of this.metrics.requests.entries()) {
      requests[key] = value;
    }
    return requests;
  }

  getDatabaseMetrics() {
    const database = {};
    for (const [key, value] of this.metrics.database.entries()) {
      database[key] = value;
    }
    return database;
  }

  getBotMetrics() {
    const bot = {};
    for (const [key, value] of this.metrics.bot.entries()) {
      if (value instanceof Set) {
        bot[key] = value.size;
      } else {
        bot[key] = value;
      }
    }
    return bot;
  }

  getSystemMetrics() {
    const system = {};
    for (const [key, value] of this.metrics.system.entries()) {
      if (key.includes(':')) {
        const [metricKey] = key.split(':');
        if (!system[metricKey]) system[metricKey] = [];
        system[metricKey].push(value);
      } else {
        system[key] = value;
      }
    }
    return system;
  }

  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = usedMem / totalMem;

    return {
      healthy: memoryUsage < this.config.alertThresholds.memoryUsage,
      usage: memoryUsage,
      details: {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        systemTotal: totalMem,
        systemFree: freeMem
      }
    };
  }

  async checkDatabaseHealth() {
    try {
      const { Model } = require('objection');
      if (Model.knex()) {
        await Model.knex().raw('SELECT 1');
        return { healthy: true, message: 'Database connection active' };
      }
      return { healthy: false, message: 'Database not initialized' };
    } catch (error) {
      return { healthy: false, message: `Database error: ${error.message}` };
    }
  }

  checkBotHealth() {
    // Check if bot metrics are being updated (recent activity)
    const recentActivity = Date.now() - 5 * 60 * 1000; // 5 minutes
    let hasRecentActivity = false;

    for (const [key] of this.metrics.bot.entries()) {
      if (key.includes(':')) {
        const [, timestamp] = key.split(':');
        if (parseInt(timestamp) > recentActivity) {
          hasRecentActivity = true;
          break;
        }
      }
    }

    return {
      healthy: hasRecentActivity,
      message: hasRecentActivity ? 'Bot active' : 'No recent bot activity'
    };
  }

  async checkDiskUsage() {
    try {
      const stats = await fs.statSync(process.cwd());
      // This is a simplified check - in production, you'd use a proper disk usage library
      return {
        healthy: true,
        message: 'Disk check not implemented - assuming healthy'
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Disk check failed: ${error.message}`
      };
    }
  }

  checkNetworkHealth() {
    const activeRequests = this.requestTracking.size;
    return {
      healthy: activeRequests < this.config.alertThresholds.activeConnections,
      activeRequests,
      message: `${activeRequests} active requests`
    };
  }

  measureEventLoopDelay() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
      this.recordMetric('system', 'eventLoopDelay', delay);
    });
    return 0; // Return 0 as measurement is async
  }

  getAlertSeverity(type) {
    const severityMap = {
      slow_response: 'warning',
      slow_query: 'warning',
      high_memory: 'critical',
      high_cpu: 'critical',
      database_error: 'critical',
      bot_error: 'warning'
    };
    return severityMap[type] || 'info';
  }

  generateRecommendations(summary, alerts) {
    const recommendations = [];

    // Memory recommendations
    if (summary.system.memory && summary.system.memory.heapUsed / summary.system.memory.heapTotal > 0.8) {
      recommendations.push({
        type: 'performance',
        message: 'High memory usage detected. Consider implementing memory optimization.',
        priority: 'high'
      });
    }

    // Error rate recommendations
    const errorAlerts = alerts.filter(a => a.type.includes('error'));
    if (errorAlerts.length > 5) {
      recommendations.push({
        type: 'reliability',
        message: 'High error rate detected. Review recent changes and error logs.',
        priority: 'critical'
      });
    }

    // Bot recommendations
    if (summary.bot.total_commands > 1000 && !summary.bot.commands) {
      recommendations.push({
        type: 'scaling',
        message: 'High bot usage detected. Consider implementing command rate limiting.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  cleanupOldMetrics() {
    const cutoff = Date.now() - this.config.metricsRetention;
    
    for (const [category, metrics] of Object.entries(this.metrics)) {
      for (const [key] of metrics.entries()) {
        if (key.includes(':')) {
          const [, timestamp] = key.split(':');
          if (parseInt(timestamp) < cutoff) {
            metrics.delete(key);
          }
        }
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔍 Shutting down Monitoring Service...');
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.removeAllListeners();
    console.log('✅ Monitoring Service shut down');
  }
}

module.exports = MonitoringService;