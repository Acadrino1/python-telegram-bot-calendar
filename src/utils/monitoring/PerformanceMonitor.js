/**
 * Real-time Performance Monitor for Telegram Bot
 * Tracks system performance, memory usage, and bot metrics
 */

const EventEmitter = require('events');
const os = require('os');

class PerformanceMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      metricsRetention: options.metricsRetention || 24 * 60 * 60 * 1000, // 24 hours
      alertThresholds: {
        memoryUsage: options.memoryThreshold || 80, // 80%
        cpuUsage: options.cpuThreshold || 85, // 85%
        responseTime: options.responseThreshold || 5000, // 5 seconds
        errorRate: options.errorThreshold || 10, // 10%
        ...options.alertThresholds
      },
      enableAlerts: options.enableAlerts !== false,
      enableLogging: options.enableLogging !== false,
      ...options
    };
    
    // Metrics storage
    this.metrics = {
      system: [],
      bot: [],
      database: [],
      memory: []
    };
    
    // Current state
    this.currentMetrics = {
      system: {},
      bot: {},
      database: {},
      memory: {}
    };
    
    // Performance counters
    this.counters = {
      requests: 0,
      errors: 0,
      responses: 0,
      commands: 0,
      callbacks: 0,
      sessions: 0
    };
    
    // Response time tracking
    this.responseTimes = [];
    this.maxResponseTimes = 100; // Keep last 100 response times
    
    // Start monitoring
    this.startMonitoring();
    
    console.log('✅ PerformanceMonitor initialized');
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    // System metrics monitoring
    this.systemMonitorInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.monitoringInterval);
    
    // Memory monitoring (more frequent)
    this.memoryMonitorInterval = setInterval(() => {
      this.collectMemoryMetrics();
    }, this.config.monitoringInterval / 2);
    
    // Cleanup old metrics
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.config.monitoringInterval * 2);
    
    console.log('🔍 Performance monitoring started');
  }

  /**
   * Collect system performance metrics
   */
  collectSystemMetrics() {
    const systemMetrics = {
      timestamp: Date.now(),
      cpu: {
        usage: this.getCpuUsage(),
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
      },
      uptime: os.uptime(),
      platform: os.platform(),
      arch: os.arch()
    };
    
    this.currentMetrics.system = systemMetrics;
    this.metrics.system.push(systemMetrics);
    
    // Check alerts
    this.checkSystemAlerts(systemMetrics);
    
    this.emit('system-metrics', systemMetrics);
  }

  /**
   * Collect memory-specific metrics
   */
  collectMemoryMetrics() {
    const processMemory = process.memoryUsage();
    
    const memoryMetrics = {
      timestamp: Date.now(),
      process: {
        rss: processMemory.rss,
        heapTotal: processMemory.heapTotal,
        heapUsed: processMemory.heapUsed,
        external: processMemory.external,
        arrayBuffers: processMemory.arrayBuffers
      },
      system: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      formatted: {
        processRSSMB: Math.round(processMemory.rss / 1024 / 1024 * 100) / 100,
        processHeapMB: Math.round(processMemory.heapUsed / 1024 / 1024 * 100) / 100,
        systemUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
      }
    };
    
    this.currentMetrics.memory = memoryMetrics;
    this.metrics.memory.push(memoryMetrics);
    
    // Check memory alerts
    this.checkMemoryAlerts(memoryMetrics);
    
    this.emit('memory-metrics', memoryMetrics);
    
    // Log memory warnings
    if (memoryMetrics.formatted.processRSSMB > 25) {
      console.warn(`⚠️ High memory usage: ${memoryMetrics.formatted.processRSSMB}MB RSS`);
    }
  }

  /**
   * Track bot-specific metrics
   */
  trackBotMetrics(metrics) {
    const botMetrics = {
      timestamp: Date.now(),
      ...metrics,
      counters: { ...this.counters },
      performance: {
        averageResponseTime: this.getAverageResponseTime(),
        errorRate: this.getErrorRate(),
        requestRate: this.getRequestRate()
      }
    };
    
    this.currentMetrics.bot = botMetrics;
    this.metrics.bot.push(botMetrics);
    
    this.emit('bot-metrics', botMetrics);
  }

  /**
   * Track database metrics
   */
  trackDatabaseMetrics(metrics) {
    const dbMetrics = {
      timestamp: Date.now(),
      ...metrics
    };
    
    this.currentMetrics.database = dbMetrics;
    this.metrics.database.push(dbMetrics);
    
    this.emit('database-metrics', dbMetrics);
  }

  /**
   * Track response time
   */
  trackResponseTime(startTime, endTime) {
    const responseTime = endTime - startTime;
    
    this.responseTimes.push({
      time: responseTime,
      timestamp: endTime
    });
    
    // Limit array size
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes = this.responseTimes.slice(-this.maxResponseTimes);
    }
    
    // Check response time alert
    if (responseTime > this.config.alertThresholds.responseTime) {
      this.emit('slow-response', { responseTime, timestamp: endTime });
    }
    
    return responseTime;
  }

  /**
   * Increment counter
   */
  incrementCounter(counterName) {
    if (this.counters.hasOwnProperty(counterName)) {
      this.counters[counterName]++;
    }
  }

  /**
   * Get CPU usage percentage
   */
  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    return Math.round((1 - totalIdle / totalTick) * 100);
  }

  /**
   * Get average response time
   */
  getAverageResponseTime() {
    if (this.responseTimes.length === 0) return 0;
    
    const sum = this.responseTimes.reduce((sum, rt) => sum + rt.time, 0);
    return Math.round(sum / this.responseTimes.length);
  }

  /**
   * Get error rate percentage
   */
  getErrorRate() {
    const total = this.counters.requests;
    if (total === 0) return 0;
    
    return Math.round((this.counters.errors / total) * 100);
  }

  /**
   * Get request rate (requests per minute)
   */
  getRequestRate() {
    // Calculate based on recent metrics
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentBotMetrics = this.metrics.bot.filter(
      m => m.timestamp > oneMinuteAgo
    );
    
    if (recentBotMetrics.length === 0) return 0;
    
    const oldestMetric = recentBotMetrics[0];
    const newestMetric = recentBotMetrics[recentBotMetrics.length - 1];
    
    const requestDiff = newestMetric.counters?.requests - oldestMetric.counters?.requests || 0;
    const timeDiff = newestMetric.timestamp - oldestMetric.timestamp;
    
    return Math.round((requestDiff / timeDiff) * 60000); // Per minute
  }

  /**
   * Check system alerts
   */
  checkSystemAlerts(systemMetrics) {
    if (!this.config.enableAlerts) return;
    
    // Memory alert
    if (systemMetrics.memory.usagePercent > this.config.alertThresholds.memoryUsage) {
      this.emit('alert', {
        type: 'memory',
        level: 'warning',
        message: `System memory usage: ${systemMetrics.memory.usagePercent.toFixed(1)}%`,
        value: systemMetrics.memory.usagePercent,
        threshold: this.config.alertThresholds.memoryUsage
      });
    }
    
    // CPU alert
    if (systemMetrics.cpu.usage > this.config.alertThresholds.cpuUsage) {
      this.emit('alert', {
        type: 'cpu',
        level: 'warning',
        message: `CPU usage: ${systemMetrics.cpu.usage}%`,
        value: systemMetrics.cpu.usage,
        threshold: this.config.alertThresholds.cpuUsage
      });
    }
  }

  /**
   * Check memory alerts
   */
  checkMemoryAlerts(memoryMetrics) {
    if (!this.config.enableAlerts) return;
    
    const processRSSMB = memoryMetrics.formatted.processRSSMB;
    
    // Process memory alerts
    if (processRSSMB > 40) {
      this.emit('alert', {
        type: 'process-memory',
        level: 'critical',
        message: `Process memory usage: ${processRSSMB}MB`,
        value: processRSSMB,
        threshold: 40
      });
    } else if (processRSSMB > 30) {
      this.emit('alert', {
        type: 'process-memory',
        level: 'warning',
        message: `Process memory usage: ${processRSSMB}MB`,
        value: processRSSMB,
        threshold: 30
      });
    }
  }

  /**
   * Clean up old metrics to prevent memory growth
   */
  cleanupOldMetrics() {
    const cutoff = Date.now() - this.config.metricsRetention;
    
    let cleaned = 0;
    
    // Clean each metric type
    for (const metricType of Object.keys(this.metrics)) {
      const originalLength = this.metrics[metricType].length;
      this.metrics[metricType] = this.metrics[metricType].filter(
        metric => metric.timestamp > cutoff
      );
      cleaned += originalLength - this.metrics[metricType].length;
    }
    
    // Clean response times
    const originalRTLength = this.responseTimes.length;
    this.responseTimes = this.responseTimes.filter(rt => rt.timestamp > cutoff);
    cleaned += originalRTLength - this.responseTimes.length;
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} old performance metrics`);
    }
  }

  /**
   * Generate performance report
   */
  generateReport(timeRange = 3600000) { // 1 hour default
    const now = Date.now();
    const cutoff = now - timeRange;
    
    // Filter metrics for time range
    const systemMetrics = this.metrics.system.filter(m => m.timestamp > cutoff);
    const memoryMetrics = this.metrics.memory.filter(m => m.timestamp > cutoff);
    const botMetrics = this.metrics.bot.filter(m => m.timestamp > cutoff);
    
    const report = {
      timeRange: `${Math.round(timeRange / 60000)} minutes`,
      timestamp: now,
      system: this.analyzSystemMetrics(systemMetrics),
      memory: this.analyzeMemoryMetrics(memoryMetrics),
      bot: this.analyzeBotMetrics(botMetrics),
      alerts: this.getRecentAlerts(cutoff),
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }

  /**
   * Analyze system metrics
   */
  analyzSystemMetrics(metrics) {
    if (metrics.length === 0) return {};
    
    const cpuUsages = metrics.map(m => m.cpu.usage).filter(u => u !== undefined);
    const memoryUsages = metrics.map(m => m.memory.usagePercent);
    
    return {
      cpu: {
        average: cpuUsages.length > 0 ? cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length : 0,
        max: cpuUsages.length > 0 ? Math.max(...cpuUsages) : 0,
        min: cpuUsages.length > 0 ? Math.min(...cpuUsages) : 0
      },
      memory: {
        average: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        max: Math.max(...memoryUsages),
        min: Math.min(...memoryUsages)
      },
      dataPoints: metrics.length
    };
  }

  /**
   * Analyze memory metrics
   */
  analyzeMemoryMetrics(metrics) {
    if (metrics.length === 0) return {};
    
    const processRSS = metrics.map(m => m.formatted.processRSSMB);
    const processHeap = metrics.map(m => m.formatted.processHeapMB);
    
    return {
      process: {
        rss: {
          average: processRSS.reduce((a, b) => a + b, 0) / processRSS.length,
          max: Math.max(...processRSS),
          min: Math.min(...processRSS),
          current: processRSS[processRSS.length - 1]
        },
        heap: {
          average: processHeap.reduce((a, b) => a + b, 0) / processHeap.length,
          max: Math.max(...processHeap),
          min: Math.min(...processHeap),
          current: processHeap[processHeap.length - 1]
        }
      },
      dataPoints: metrics.length
    };
  }

  /**
   * Analyze bot metrics
   */
  analyzeBotMetrics(metrics) {
    if (metrics.length === 0) return {};
    
    return {
      performance: {
        averageResponseTime: this.getAverageResponseTime(),
        errorRate: this.getErrorRate(),
        requestRate: this.getRequestRate()
      },
      counters: { ...this.counters },
      dataPoints: metrics.length
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(cutoff) {
    // This would be implemented with proper alert storage
    return [];
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const currentMemory = this.currentMetrics.memory?.formatted?.processRSSMB || 0;
    
    if (currentMemory > 30) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: 'Consider implementing memory cleanup or increasing garbage collection frequency'
      });
    }
    
    if (this.getErrorRate() > 5) {
      recommendations.push({
        type: 'errors',
        priority: 'high',
        message: 'High error rate detected. Review error logs and implement better error handling'
      });
    }
    
    if (this.getAverageResponseTime() > 2000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Response times are high. Consider optimizing database queries or implementing caching'
      });
    }
    
    return recommendations;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      monitoring: true,
      metrics: this.currentMetrics,
      counters: this.counters,
      performance: {
        averageResponseTime: this.getAverageResponseTime(),
        errorRate: this.getErrorRate(),
        requestRate: this.getRequestRate()
      },
      thresholds: this.config.alertThresholds
    };
  }

  /**
   * Shutdown monitoring
   */
  shutdown() {
    console.log('🔄 PerformanceMonitor shutting down...');
    
    // Clear intervals
    if (this.systemMonitorInterval) {
      clearInterval(this.systemMonitorInterval);
    }
    
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    console.log('✅ PerformanceMonitor shutdown complete');
  }
}

module.exports = PerformanceMonitor;