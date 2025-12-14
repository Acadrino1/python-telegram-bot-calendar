const MonitoringService = require('../services/MonitoringService');
const AlertingService = require('../services/AlertingService');

/**
 * Express middleware for comprehensive monitoring
 */
class MonitoringMiddleware {
  constructor(options = {}) {
    this.monitoringService = new MonitoringService(options.monitoring);
    this.alertingService = new AlertingService(options.alerting);
    
    // Middleware options
    this.options = {
      trackRequests: options.trackRequests !== false,
      trackResponses: options.trackResponses !== false,
      trackErrors: options.trackErrors !== false,
      trackDatabaseQueries: options.trackDatabaseQueries !== false,
      enableHealthEndpoint: options.enableHealthEndpoint !== false,
      enableMetricsEndpoint: options.enableMetricsEndpoint !== false,
      enableAlertsEndpoint: options.enableAlertsEndpoint !== false,
      healthEndpointPath: options.healthEndpointPath || '/health',
      metricsEndpointPath: options.metricsEndpointPath || '/metrics',
      alertsEndpointPath: options.alertsEndpointPath || '/alerts'
    };

    this.isInitialized = false;
  }

  /**
   * Initialize monitoring middleware
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('📊 Initializing Monitoring Middleware...');

    // Initialize services
    await this.monitoringService.initialize();
    await this.alertingService.initialize();

    // Connect monitoring service alerts to alerting service
    this.monitoringService.on('alert', (alert) => {
      this.alertingService.processAlert(alert);
    });

    // Connect monitoring service to database query tracking
    this.setupDatabaseMonitoring();

    this.isInitialized = true;
    console.log('✅ Monitoring Middleware initialized');
  }

  /**
   * Get request tracking middleware
   */
  getRequestTrackingMiddleware() {
    return (req, res, next) => {
      if (!this.options.trackRequests) return next();

      // Track request start
      const requestId = this.monitoringService.trackRequest(req);
      
      // Store original end function
      const originalEnd = res.end;
      
      // Override res.end to track response
      res.end = (...args) => {
        if (this.options.trackResponses) {
          this.monitoringService.trackResponse(req, res);
        }
        
        // Call original end function
        originalEnd.apply(res, args);
      };

      next();
    };
  }

  /**
   * Get error tracking middleware
   */
  getErrorTrackingMiddleware() {
    return (err, req, res, next) => {
      if (this.options.trackErrors) {
        // Track error
        this.monitoringService.recordMetric('errors', 'unhandled_error', {
          message: err.message,
          stack: err.stack,
          endpoint: `${req.method} ${req.path}`,
          timestamp: Date.now()
        });

        // Send alert for 5xx errors
        if (!res.statusCode || res.statusCode >= 500) {
          this.alertingService.processAlert({
            type: 'server_error',
            severity: 'critical',
            message: `Server error: ${err.message}`,
            timestamp: Date.now(),
            details: {
              endpoint: `${req.method} ${req.path}`,
              error: err.message,
              stack: err.stack,
              userAgent: req.get('User-Agent'),
              ip: req.ip
            }
          });
        }
      }

      next(err);
    };
  }

  /**
   * Get health check endpoint handler
   */
  getHealthEndpointHandler() {
    return async (req, res) => {
      try {
        const healthStatus = await this.monitoringService.performHealthCheck();
        const alertStats = this.alertingService.getStatistics();
        
        const response = {
          status: healthStatus.overall,
          timestamp: healthStatus.lastCheck,
          uptime: healthStatus.uptime,
          components: Object.fromEntries(healthStatus.components),
          alerts: {
            active: alertStats.activeAlerts,
            total: alertStats.totalAlerts,
            resolved: alertStats.resolvedAlerts
          }
        };

        const statusCode = healthStatus.overall === 'healthy' ? 200 : 503;
        res.status(statusCode).json(response);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: error.message,
          timestamp: Date.now()
        });
      }
    };
  }

  /**
   * Get metrics endpoint handler
   */
  getMetricsEndpointHandler() {
    return (req, res) => {
      try {
        const timeRange = parseInt(req.query.timeRange) || 3600000; // 1 hour default
        const category = req.query.category;
        const format = req.query.format || 'json';

        let metrics;
        if (category) {
          metrics = this.monitoringService.getDetailedMetrics(category, timeRange);
        } else {
          metrics = this.monitoringService.getMetricsSummary();
        }

        if (format === 'prometheus') {
          res.set('Content-Type', 'text/plain');
          res.send(this.convertToPrometheusFormat(metrics));
        } else {
          res.json({
            metrics,
            timeRange,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        res.status(500).json({
          error: error.message,
          timestamp: Date.now()
        });
      }
    };
  }

  /**
   * Get alerts endpoint handler
   */
  getAlertsEndpointHandler() {
    return (req, res) => {
      try {
        const includeHistory = req.query.history === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        const response = {
          active: this.alertingService.getActiveAlerts(),
          statistics: this.alertingService.getStatistics(),
          timestamp: Date.now()
        };

        if (includeHistory) {
          response.history = this.alertingService.getAlertHistory(limit);
        }

        res.json(response);
      } catch (error) {
        res.status(500).json({
          error: error.message,
          timestamp: Date.now()
        });
      }
    };
  }

  /**
   * Get alert management endpoint handler (POST/DELETE)
   */
  getAlertManagementHandler() {
    return async (req, res) => {
      try {
        const { method } = req;
        const { alertId } = req.params;

        if (method === 'POST') {
          // Create manual alert
          const alertData = req.body;
          const id = await this.alertingService.processAlert({
            ...alertData,
            timestamp: Date.now(),
            source: 'manual'
          });
          
          res.json({ success: true, alertId: id });
        } else if (method === 'DELETE' || (method === 'POST' && req.body.action === 'resolve')) {
          // Resolve alert
          const success = await this.alertingService.resolveAlert(alertId, req.body.resolution);
          res.json({ success });
        } else {
          res.status(405).json({ error: 'Method not allowed' });
        }
      } catch (error) {
        res.status(500).json({
          error: error.message,
          timestamp: Date.now()
        });
      }
    };
  }

  /**
   * Setup middleware for Express app
   */
  setupMiddleware(app) {
    if (!this.isInitialized) {
      throw new Error('MonitoringMiddleware must be initialized before setup');
    }

    // Request tracking middleware
    app.use(this.getRequestTrackingMiddleware());

    // Health check endpoint
    if (this.options.enableHealthEndpoint) {
      app.get(this.options.healthEndpointPath, this.getHealthEndpointHandler());
      app.get(`${this.options.healthEndpointPath}/detailed`, async (req, res) => {
        const health = await this.monitoringService.performHealthCheck();
        const report = this.monitoringService.generateReport();
        res.json({ health, report });
      });
    }

    // Metrics endpoint
    if (this.options.enableMetricsEndpoint) {
      app.get(this.options.metricsEndpointPath, this.getMetricsEndpointHandler());
    }

    // Alerts endpoints
    if (this.options.enableAlertsEndpoint) {
      app.get(this.options.alertsEndpointPath, this.getAlertsEndpointHandler());
      app.post(this.options.alertsEndpointPath, this.getAlertManagementHandler());
      app.post(`${this.options.alertsEndpointPath}/:alertId/resolve`, this.getAlertManagementHandler());
      app.delete(`${this.options.alertsEndpointPath}/:alertId`, this.getAlertManagementHandler());
    }

    // Error tracking middleware (should be last)
    app.use(this.getErrorTrackingMiddleware());

    console.log('📊 Monitoring endpoints configured:');
    if (this.options.enableHealthEndpoint) {
      console.log(`   Health: ${this.options.healthEndpointPath}`);
    }
    if (this.options.enableMetricsEndpoint) {
      console.log(`   Metrics: ${this.options.metricsEndpointPath}`);
    }
    if (this.options.enableAlertsEndpoint) {
      console.log(`   Alerts: ${this.options.alertsEndpointPath}`);
    }
  }

  /**
   * Setup database monitoring
   */
  setupDatabaseMonitoring() {
    try {
      const { Model } = require('objection');
      
      if (Model.knex && this.options.trackDatabaseQueries) {
        const knex = Model.knex();
        
        // Check if knex instance has event methods
        if (knex && typeof knex.on === 'function') {
          // Monitor queries
          knex.on('query', (query) => {
            const startTime = Date.now();
            query.startTime = startTime;
          });

          knex.on('query-response', (response, query) => {
            if (query && query.startTime) {
              const duration = Date.now() - query.startTime;
              this.monitoringService.trackDatabaseQuery(query.sql, duration, true);
            }
          });

          knex.on('query-error', (error, query) => {
            if (query && query.startTime) {
              const duration = Date.now() - query.startTime;
              this.monitoringService.trackDatabaseQuery(query.sql, duration, false);
              
              // Send database error alert
              this.alertingService.processAlert({
                type: 'database_error',
                severity: 'critical',
                message: `Database query failed: ${error.message}`,
                timestamp: Date.now(),
                details: {
                  sql: query.sql ? query.sql.substring(0, 200) : 'Unknown query',
                  error: error.message,
                  duration
                }
              });
            }
          });
        } else {
          console.warn('⚠️ Database instance does not support event monitoring');
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to setup database monitoring:', error.message);
    }
  }

  /**
   * Convert metrics to Prometheus format
   */
  convertToPrometheusFormat(metrics) {
    let prometheus = '';
    
    const addMetric = (name, value, labels = {}) => {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      
      prometheus += `${name}${labelStr ? `{${labelStr}}` : ''} ${value}\n`;
    };

    // System metrics
    if (metrics.system) {
      if (metrics.system.memory) {
        addMetric('system_memory_rss', metrics.system.memory.rss);
        addMetric('system_memory_heap_used', metrics.system.memory.heapUsed);
        addMetric('system_memory_heap_total', metrics.system.memory.heapTotal);
      }
      addMetric('system_uptime_seconds', metrics.uptime);
    }

    // Request metrics
    if (metrics.requests) {
      Object.entries(metrics.requests).forEach(([endpoint, count]) => {
        const [method, path] = endpoint.split(' ');
        addMetric('http_requests_total', count, { method, path });
      });
    }

    // Database metrics
    if (metrics.database) {
      Object.entries(metrics.database).forEach(([key, value]) => {
        if (key.startsWith('queries:')) {
          const queryType = key.split(':')[1];
          addMetric('database_queries_total', value, { type: queryType });
        }
      });
    }

    // Bot metrics
    if (metrics.bot) {
      Object.entries(metrics.bot).forEach(([key, value]) => {
        if (key.startsWith('commands:')) {
          const command = key.split(':')[1];
          addMetric('bot_commands_total', value, { command });
        }
      });
    }

    return prometheus;
  }

  /**
   * Get monitoring services (for external access)
   */
  getServices() {
    return {
      monitoring: this.monitoringService,
      alerting: this.alertingService
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('📊 Shutting down Monitoring Middleware...');
    
    await Promise.all([
      this.monitoringService.shutdown(),
      this.alertingService.shutdown()
    ]);

    console.log('✅ Monitoring Middleware shut down');
  }
}

module.exports = MonitoringMiddleware;