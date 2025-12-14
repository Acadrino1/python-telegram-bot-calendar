const EventEmitter = require('events');
const path = require('path');

/**
 * Metrics Dashboard Service for Lodge Scheduler
 * Provides real-time metrics visualization and KPI tracking
 */
class MetricsDashboardService extends EventEmitter {
  constructor(monitoringService, alertingService, options = {}) {
    super();
    this.monitoringService = monitoringService;
    this.alertingService = alertingService;
    
    this.config = {
      // Dashboard settings
      updateInterval: options.updateInterval || 5000, // 5 seconds
      historyRetention: options.historyRetention || 24 * 60 * 60 * 1000, // 24 hours
      maxDataPoints: options.maxDataPoints || 1000,
      
      // KPI thresholds
      kpiThresholds: {
        responseTime: options.responseTimeThreshold || 2000, // 2 seconds
        errorRate: options.errorRateThreshold || 0.02, // 2%
        availabilityTarget: options.availabilityTarget || 0.999, // 99.9%
        botResponseTime: options.botResponseTimeThreshold || 1000, // 1 second
        ...options.kpiThresholds
      }
    };

    // Dashboard data storage
    this.dashboardData = {
      overview: {},
      realtime: {},
      historical: {},
      kpis: {},
      alerts: {}
    };

    // Time-series data
    this.timeSeries = new Map();
    
    // KPI calculations
    this.kpiCalculations = new Map();

    this.isInitialized = false;
  }

  /**
   * Initialize the dashboard service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('📊 Initializing Metrics Dashboard Service...');

    // Start real-time data collection
    this.startRealTimeUpdates();

    // Initialize KPI tracking
    this.initializeKPITracking();

    // Listen to monitoring events
    this.setupEventListeners();

    this.isInitialized = true;
    console.log('✅ Metrics Dashboard Service initialized');
  }

  /**
   * Get dashboard data
   */
  getDashboardData() {
    return {
      timestamp: Date.now(),
      overview: this.generateOverview(),
      realtime: this.generateRealtimeMetrics(),
      historical: this.generateHistoricalData(),
      kpis: this.calculateKPIs(),
      alerts: this.getAlertSummary(),
      system: this.getSystemStatus()
    };
  }

  /**
   * Get specific widget data
   */
  getWidgetData(widgetType, options = {}) {
    const timeRange = options.timeRange || 3600000; // 1 hour default
    
    switch (widgetType) {
      case 'response_times':
        return this.getResponseTimeWidget(timeRange);
      case 'error_rates':
        return this.getErrorRateWidget(timeRange);
      case 'bot_metrics':
        return this.getBotMetricsWidget(timeRange);
      case 'system_resources':
        return this.getSystemResourcesWidget(timeRange);
      case 'database_performance':
        return this.getDatabasePerformanceWidget(timeRange);
      case 'alert_timeline':
        return this.getAlertTimelineWidget(timeRange);
      default:
        throw new Error(`Unknown widget type: ${widgetType}`);
    }
  }

  /**
   * Get real-time metrics stream
   */
  getRealtimeStream() {
    const stream = new EventEmitter();
    
    // Send initial data
    stream.emit('data', this.generateRealtimeMetrics());
    
    // Setup periodic updates
    const interval = setInterval(() => {
      stream.emit('data', this.generateRealtimeMetrics());
    }, this.config.updateInterval);
    
    // Cleanup on stream end
    stream.on('end', () => {
      clearInterval(interval);
    });
    
    return stream;
  }

  // Private methods for data generation

  generateOverview() {
    const metrics = this.monitoringService.getMetricsSummary();
    const alerts = this.alertingService.getStatistics();
    
    return {
      uptime: process.uptime(),
      totalRequests: this.getTotalRequests(),
      averageResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
      activeUsers: this.getActiveUsers(),
      systemHealth: this.getSystemHealthScore(),
      activeAlerts: alerts.activeAlerts,
      lastUpdate: Date.now()
    };
  }

  generateRealtimeMetrics() {
    const now = Date.now();
    const last5Minutes = now - 5 * 60 * 1000;
    
    return {
      timestamp: now,
      requests: {
        current: this.getRecentMetric('requests', 60000), // Last minute
        trend: this.getMetricTrend('requests', 5 * 60000) // Last 5 minutes
      },
      responseTime: {
        current: this.getRecentResponseTime(),
        p95: this.getResponseTimePercentile(95),
        trend: this.getMetricTrend('response_time', 5 * 60000)
      },
      errors: {
        current: this.getRecentMetric('errors', 60000),
        rate: this.getRecentErrorRate(),
        trend: this.getMetricTrend('errors', 5 * 60000)
      },
      bot: {
        commands: this.getRecentMetric('bot_commands', 60000),
        sessions: this.getRecentMetric('bot_sessions', 60000),
        responseTime: this.getRecentBotResponseTime()
      },
      system: {
        memory: this.getCurrentMemoryUsage(),
        cpu: this.getCurrentCPUUsage(),
        connections: this.getCurrentConnections()
      }
    };
  }

  generateHistoricalData() {
    const timeRanges = [
      { label: '1h', duration: 60 * 60 * 1000 },
      { label: '6h', duration: 6 * 60 * 60 * 1000 },
      { label: '24h', duration: 24 * 60 * 60 * 1000 }
    ];

    const historical = {};
    
    timeRanges.forEach(range => {
      historical[range.label] = {
        requests: this.getHistoricalSeries('requests', range.duration),
        responseTime: this.getHistoricalSeries('response_time', range.duration),
        errors: this.getHistoricalSeries('errors', range.duration),
        botCommands: this.getHistoricalSeries('bot_commands', range.duration)
      };
    });

    return historical;
  }

  calculateKPIs() {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    
    return {
      availability: {
        value: this.calculateAvailability(last24h),
        target: this.config.kpiThresholds.availabilityTarget,
        status: this.getKPIStatus('availability')
      },
      averageResponseTime: {
        value: this.getAverageResponseTime(last24h),
        target: this.config.kpiThresholds.responseTime,
        status: this.getKPIStatus('responseTime')
      },
      errorRate: {
        value: this.getErrorRate(last24h),
        target: this.config.kpiThresholds.errorRate,
        status: this.getKPIStatus('errorRate')
      },
      botPerformance: {
        value: this.getBotPerformanceScore(),
        target: 0.95, // 95%
        status: this.getKPIStatus('botPerformance')
      },
      userSatisfaction: {
        value: this.calculateUserSatisfaction(),
        target: 0.90, // 90%
        status: this.getKPIStatus('userSatisfaction')
      }
    };
  }

  getAlertSummary() {
    const activeAlerts = this.alertingService.getActiveAlerts();
    const stats = this.alertingService.getStatistics();
    
    return {
      active: activeAlerts.length,
      critical: activeAlerts.filter(a => a.severity === 'critical').length,
      warning: activeAlerts.filter(a => a.severity === 'warning').length,
      recentAlerts: activeAlerts.slice(0, 10),
      alertRate: this.getAlertRate(),
      mttr: this.calculateMTTR(), // Mean Time To Resolution
      statistics: stats
    };
  }

  getSystemStatus() {
    const health = this.monitoringService.healthStatus;
    
    return {
      overall: health.overall,
      components: Object.fromEntries(health.components || new Map()),
      uptime: health.uptime,
      lastCheck: health.lastCheck,
      version: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // Widget-specific data generators

  getResponseTimeWidget(timeRange) {
    const data = this.getHistoricalSeries('response_time', timeRange, 50);
    const stats = this.calculateStats(data.map(d => d.value));
    
    return {
      type: 'line_chart',
      title: 'Response Times',
      data: data,
      statistics: {
        average: stats.mean,
        p50: stats.median,
        p95: stats.p95,
        p99: stats.p99
      },
      threshold: this.config.kpiThresholds.responseTime
    };
  }

  getErrorRateWidget(timeRange) {
    const errorData = this.getHistoricalSeries('errors', timeRange, 50);
    const requestData = this.getHistoricalSeries('requests', timeRange, 50);
    
    const errorRates = errorData.map((error, index) => ({
      timestamp: error.timestamp,
      value: requestData[index] ? (error.value / requestData[index].value) : 0
    }));
    
    return {
      type: 'line_chart',
      title: 'Error Rate',
      data: errorRates,
      threshold: this.config.kpiThresholds.errorRate,
      format: 'percentage'
    };
  }

  getBotMetricsWidget(timeRange) {
    return {
      type: 'multi_metric',
      title: 'Bot Performance',
      metrics: {
        commands: {
          data: this.getHistoricalSeries('bot_commands', timeRange, 20),
          label: 'Commands/min'
        },
        sessions: {
          data: this.getHistoricalSeries('bot_sessions', timeRange, 20),
          label: 'Active Sessions'
        },
        responseTime: {
          data: this.getHistoricalSeries('bot_response_time', timeRange, 20),
          label: 'Response Time (ms)',
          threshold: this.config.kpiThresholds.botResponseTime
        }
      }
    };
  }

  getSystemResourcesWidget(timeRange) {
    return {
      type: 'gauge_chart',
      title: 'System Resources',
      gauges: {
        memory: {
          value: this.getCurrentMemoryUsage(),
          max: 100,
          threshold: 85,
          unit: '%'
        },
        cpu: {
          value: this.getCurrentCPUUsage(),
          max: 100,
          threshold: 80,
          unit: '%'
        },
        connections: {
          value: this.getCurrentConnections(),
          max: this.config.kpiThresholds.maxConnections || 1000,
          threshold: 800,
          unit: 'connections'
        }
      }
    };
  }

  getDatabasePerformanceWidget(timeRange) {
    const metrics = this.monitoringService.getDetailedMetrics('database', timeRange);
    
    return {
      type: 'database_metrics',
      title: 'Database Performance',
      metrics: {
        queryTime: this.getAverageQueryTime(),
        activeQueries: this.getActiveQueryCount(),
        slowQueries: this.getSlowQueryCount(),
        connectionPool: this.getConnectionPoolStatus()
      },
      recentQueries: this.getRecentSlowQueries()
    };
  }

  getAlertTimelineWidget(timeRange) {
    const alerts = this.alertingService.getAlertHistory();
    const timelineAlerts = alerts
      .filter(a => a.timestamp >= Date.now() - timeRange)
      .map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        timestamp: a.timestamp,
        resolved: a.status === 'resolved'
      }));
    
    return {
      type: 'timeline',
      title: 'Alert Timeline',
      data: timelineAlerts,
      summary: {
        total: timelineAlerts.length,
        critical: timelineAlerts.filter(a => a.severity === 'critical').length,
        resolved: timelineAlerts.filter(a => a.resolved).length
      }
    };
  }

  // Helper methods for metric calculations

  getTotalRequests() {
    const metrics = this.monitoringService.getMetricsSummary();
    return Object.values(metrics.requests || {}).reduce((sum, count) => sum + count, 0);
  }

  getAverageResponseTime(timeRange = 3600000) {
    // Implementation would calculate average response time from stored metrics
    return 250; // Placeholder
  }

  getErrorRate(timeRange = 3600000) {
    const totalRequests = this.getTotalRequests();
    const totalErrors = this.getTotalErrors();
    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }

  getTotalErrors() {
    const metrics = this.monitoringService.getMetricsSummary();
    return Object.values(metrics.errors || {}).reduce((sum, count) => sum + count, 0);
  }

  getActiveUsers() {
    const metrics = this.monitoringService.getMetricsSummary();
    const today = new Date().toISOString().split('T')[0];
    return metrics.bot?.[`active_users:${today}`]?.size || 0;
  }

  getSystemHealthScore() {
    const health = this.monitoringService.healthStatus;
    if (!health.components) return 100;
    
    const components = Array.from(health.components.values());
    const healthyComponents = components.filter(c => c.healthy).length;
    return Math.round((healthyComponents / components.length) * 100);
  }

  getRecentMetric(type, timeRange) {
    // Implementation would get recent metric values
    return Math.floor(Math.random() * 100); // Placeholder
  }

  getMetricTrend(type, timeRange) {
    // Implementation would calculate trend (positive/negative)
    return Math.random() > 0.5 ? 'up' : 'down'; // Placeholder
  }

  getHistoricalSeries(metric, timeRange, dataPoints = 100) {
    // Implementation would return time-series data
    const now = Date.now();
    const interval = timeRange / dataPoints;
    const data = [];
    
    for (let i = 0; i < dataPoints; i++) {
      data.push({
        timestamp: now - (dataPoints - i) * interval,
        value: Math.random() * 100 // Placeholder
      });
    }
    
    return data;
  }

  calculateStats(values) {
    if (values.length === 0) return {};
    
    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      mean: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }

  // Event handling and real-time updates

  startRealTimeUpdates() {
    this.updateTimer = setInterval(() => {
      this.updateRealTimeData();
    }, this.config.updateInterval);
  }

  updateRealTimeData() {
    const realtimeData = this.generateRealtimeMetrics();
    this.dashboardData.realtime = realtimeData;
    
    // Emit real-time update
    this.emit('realtime_update', realtimeData);
  }

  setupEventListeners() {
    // Listen to monitoring service events
    this.monitoringService.on('request_completed', (data) => {
      this.updateTimeSeries('requests', 1, data.timestamp);
      this.updateTimeSeries('response_time', data.responseTime, data.timestamp);
    });

    // Listen to alerting service events
    this.alertingService.on('alert_processed', (alert) => {
      this.emit('new_alert', alert);
    });

    this.alertingService.on('alert_resolved', (data) => {
      this.emit('alert_resolved', data);
    });
  }

  initializeKPITracking() {
    // Setup KPI calculation intervals
    setInterval(() => {
      this.updateKPIs();
    }, 60000); // Update KPIs every minute
  }

  updateKPIs() {
    const kpis = this.calculateKPIs();
    this.dashboardData.kpis = kpis;
    this.emit('kpi_update', kpis);
  }

  updateTimeSeries(metric, value, timestamp = Date.now()) {
    if (!this.timeSeries.has(metric)) {
      this.timeSeries.set(metric, []);
    }
    
    const series = this.timeSeries.get(metric);
    series.push({ timestamp, value });
    
    // Keep only recent data points
    const cutoff = timestamp - this.config.historyRetention;
    const filtered = series.filter(point => point.timestamp >= cutoff);
    
    // Limit data points
    if (filtered.length > this.config.maxDataPoints) {
      filtered.splice(0, filtered.length - this.config.maxDataPoints);
    }
    
    this.timeSeries.set(metric, filtered);
  }

  // Placeholder methods for complex calculations
  calculateAvailability(timeRange) { return 0.995; }
  getResponseTimePercentile(percentile) { return 450; }
  getRecentResponseTime() { return 280; }
  getRecentErrorRate() { return 0.015; }
  getRecentBotResponseTime() { return 150; }
  getCurrentMemoryUsage() { return 67; }
  getCurrentCPUUsage() { return 23; }
  getCurrentConnections() { return 145; }
  getBotPerformanceScore() { return 0.93; }
  calculateUserSatisfaction() { return 0.88; }
  getAlertRate() { return 2.3; }
  calculateMTTR() { return 8.5; }
  getKPIStatus(kpi) { return 'good'; }
  getAverageQueryTime() { return 45; }
  getActiveQueryCount() { return 12; }
  getSlowQueryCount() { return 2; }
  getConnectionPoolStatus() { return { active: 8, idle: 15, total: 23 }; }
  getRecentSlowQueries() { return []; }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('📊 Shutting down Metrics Dashboard Service...');
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.removeAllListeners();
    console.log('✅ Metrics Dashboard Service shut down');
  }
}

module.exports = MetricsDashboardService;