const express = require('express');
const router = express.Router();

/**
 * Monitoring routes for Lodge Scheduler
 * Provides endpoints for health checks, metrics, and alerts
 */

// Middleware for monitoring routes
const monitoringAuth = (req, res, next) => {
  // Simple API key authentication for monitoring endpoints
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validKey = process.env.MONITORING_API_KEY;
  
  if (validKey && apiKey !== validKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required for monitoring endpoints'
    });
  }
  
  next();
};

// IP restriction middleware
const restrictToAllowedIPs = (req, res, next) => {
  const allowedIPs = process.env.MONITORING_ALLOWED_IPS;
  if (!allowedIPs) return next();
  
  const clientIP = req.ip || req.connection.remoteAddress;
  const allowed = allowedIPs.split(',').some(ip => {
    if (ip.includes('/')) {
      // CIDR notation support (basic)
      return clientIP.startsWith(ip.split('/')[0].slice(0, -1));
    }
    return clientIP === ip.trim();
  });
  
  if (!allowed) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied from this IP address'
    });
  }
  
  next();
};

// Apply middleware to all monitoring routes
if (process.env.REQUIRE_AUTH_FOR_MONITORING === 'true') {
  router.use(monitoringAuth);
}
router.use(restrictToAllowedIPs);

/**
 * Health Check Endpoints
 */

// Basic health check
router.get('/health', (req, res) => {
  const monitoringService = req.app.get('monitoringService');
  
  if (!monitoringService) {
    return res.status(503).json({
      status: 'unhealthy',
      message: 'Monitoring service not available',
      timestamp: new Date().toISOString()
    });
  }
  
  monitoringService.performHealthCheck()
    .then(health => {
      const statusCode = health.overall === 'healthy' ? 200 : 503;
      res.status(statusCode).json({
        status: health.overall,
        timestamp: health.lastCheck,
        uptime: health.uptime,
        components: Object.fromEntries(health.components),
        version: process.env.SERVICE_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    })
    .catch(error => {
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });
});

// Detailed health check with metrics
router.get('/health/detailed', async (req, res) => {
  try {
    const monitoringService = req.app.get('monitoringService');
    const alertingService = req.app.get('alertingService');
    
    if (!monitoringService) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    const health = await monitoringService.performHealthCheck();
    const report = monitoringService.generateReport();
    const alerts = alertingService ? alertingService.getActiveAlerts() : [];
    
    res.json({
      health,
      report,
      alerts: {
        active: alerts.length,
        recent: alerts.slice(0, 5)
      },
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Readiness probe (for Kubernetes)
router.get('/ready', (req, res) => {
  const monitoringService = req.app.get('monitoringService');
  
  if (monitoringService && monitoringService.isInitialized) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      message: 'Service is still initializing',
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Metrics Endpoints
 */

// Main metrics endpoint
router.get('/metrics', (req, res) => {
  try {
    const monitoringService = req.app.get('monitoringService');
    if (!monitoringService) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    const timeRange = parseInt(req.query.timeRange) || 3600000; // 1 hour default
    const category = req.query.category;
    const format = req.query.format || 'json';
    
    let metrics;
    if (category) {
      metrics = monitoringService.getDetailedMetrics(category, timeRange);
    } else {
      metrics = monitoringService.getMetricsSummary();
    }
    
    // Support Prometheus format
    if (format === 'prometheus') {
      const promMetrics = convertToPrometheusFormat(metrics);
      res.set('Content-Type', 'text/plain');
      return res.send(promMetrics);
    }
    
    res.json({
      metrics,
      timeRange,
      timestamp: Date.now(),
      meta: {
        category: category || 'all',
        format,
        dataPoints: Object.keys(metrics).length
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Bot-specific metrics
router.get('/metrics/bot', (req, res) => {
  try {
    const botMonitoringService = req.app.get('botMonitoringService');
    if (!botMonitoringService) {
      return res.status(503).json({
        error: 'Bot monitoring service not available'
      });
    }
    
    const metrics = botMonitoringService.getBotMetrics();
    const status = botMonitoringService.getBotStatus();
    const analytics = botMonitoringService.getUserAnalytics();
    
    res.json({
      metrics,
      status,
      analytics,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Performance metrics
router.get('/metrics/performance', (req, res) => {
  try {
    const monitoringService = req.app.get('monitoringService');
    if (!monitoringService) {
      return res.status(503).json({
        error: 'Monitoring service not available'
      });
    }
    
    const timeRange = parseInt(req.query.timeRange) || 3600000;
    const performanceMetrics = monitoringService.getDetailedMetrics('performance', timeRange);
    const responseMetrics = monitoringService.getDetailedMetrics('responses', timeRange);
    
    res.json({
      performance: performanceMetrics,
      responses: responseMetrics,
      timeRange,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

/**
 * Alert Endpoints
 */

// Get active alerts
router.get('/alerts', (req, res) => {
  try {
    const alertingService = req.app.get('alertingService');
    if (!alertingService) {
      return res.status(503).json({
        error: 'Alerting service not available'
      });
    }
    
    const includeHistory = req.query.history === 'true';
    const limit = parseInt(req.query.limit) || 100;
    const severity = req.query.severity;
    
    let activeAlerts = alertingService.getActiveAlerts();
    
    // Filter by severity if requested
    if (severity) {
      activeAlerts = activeAlerts.filter(alert => alert.severity === severity);
    }
    
    const response = {
      active: activeAlerts,
      statistics: alertingService.getStatistics(),
      timestamp: Date.now()
    };
    
    if (includeHistory) {
      let history = alertingService.getAlertHistory(limit);
      if (severity) {
        history = history.filter(alert => alert.severity === severity);
      }
      response.history = history;
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Create manual alert
router.post('/alerts', async (req, res) => {
  try {
    const alertingService = req.app.get('alertingService');
    if (!alertingService) {
      return res.status(503).json({
        error: 'Alerting service not available'
      });
    }
    
    const alertData = {
      ...req.body,
      timestamp: Date.now(),
      source: 'manual',
      createdBy: req.headers['x-user-id'] || 'api'
    };
    
    // Validate required fields
    const required = ['type', 'severity', 'message'];
    const missing = required.filter(field => !alertData[field]);
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        required,
        missing,
        timestamp: Date.now()
      });
    }
    
    const alertId = await alertingService.processAlert(alertData);
    
    res.status(201).json({
      success: true,
      alertId,
      message: 'Alert created successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Resolve alert
router.post('/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const alertingService = req.app.get('alertingService');
    
    if (!alertingService) {
      return res.status(503).json({
        error: 'Alerting service not available'
      });
    }
    
    const resolution = {
      ...req.body,
      resolvedBy: req.headers['x-user-id'] || 'api',
      resolvedAt: Date.now()
    };
    
    const success = await alertingService.resolveAlert(alertId, resolution);
    
    if (success) {
      res.json({
        success: true,
        alertId,
        message: 'Alert resolved successfully',
        timestamp: Date.now()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found or already resolved',
        alertId,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Delete alert
router.delete('/alerts/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const alertingService = req.app.get('alertingService');
    
    if (!alertingService) {
      return res.status(503).json({
        error: 'Alerting service not available'
      });
    }
    
    const success = await alertingService.resolveAlert(alertId, {
      resolvedBy: req.headers['x-user-id'] || 'api',
      resolution: 'Alert deleted via API'
    });
    
    if (success) {
      res.json({
        success: true,
        message: 'Alert deleted successfully',
        timestamp: Date.now()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
        timestamp: Date.now()
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Suppress alert type
router.post('/alerts/suppress', (req, res) => {
  try {
    const { type, duration = 3600000 } = req.body; // 1 hour default
    const alertingService = req.app.get('alertingService');
    
    if (!alertingService) {
      return res.status(503).json({
        error: 'Alerting service not available'
      });
    }
    
    if (!type) {
      return res.status(400).json({
        error: 'Alert type is required',
        timestamp: Date.now()
      });
    }
    
    alertingService.suppressAlerts(type, duration);
    
    res.json({
      success: true,
      message: `Alert type '${type}' suppressed for ${duration/1000/60} minutes`,
      type,
      duration,
      suppressedUntil: Date.now() + duration,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

/**
 * Dashboard Endpoints
 */

// Dashboard data
router.get('/dashboard', (req, res) => {
  try {
    const dashboardService = req.app.get('dashboardService');
    if (!dashboardService) {
      return res.status(503).json({
        error: 'Dashboard service not available'
      });
    }
    
    const dashboardData = dashboardService.getDashboardData();
    res.json(dashboardData);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Widget data
router.get('/dashboard/widgets/:widgetType', (req, res) => {
  try {
    const { widgetType } = req.params;
    const timeRange = parseInt(req.query.timeRange) || 3600000;
    
    const dashboardService = req.app.get('dashboardService');
    if (!dashboardService) {
      return res.status(503).json({
        error: 'Dashboard service not available'
      });
    }
    
    const widgetData = dashboardService.getWidgetData(widgetType, { timeRange });
    
    res.json({
      widget: widgetType,
      data: widgetData,
      timeRange,
      timestamp: Date.now()
    });
  } catch (error) {
    if (error.message.includes('Unknown widget type')) {
      res.status(404).json({
        error: error.message,
        availableWidgets: [
          'response_times', 'error_rates', 'bot_metrics', 
          'system_resources', 'database_performance', 'alert_timeline'
        ],
        timestamp: Date.now()
      });
    } else {
      res.status(500).json({
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
});

// Real-time dashboard stream (Server-Sent Events)
router.get('/dashboard/stream', (req, res) => {
  try {
    const dashboardService = req.app.get('dashboardService');
    if (!dashboardService) {
      return res.status(503).json({
        error: 'Dashboard service not available'
      });
    }
    
    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial data
    const initialData = dashboardService.generateRealtimeMetrics();
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);
    
    // Set up real-time updates
    const stream = dashboardService.getRealtimeStream();
    
    stream.on('data', (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
    
    // Handle client disconnect
    req.on('close', () => {
      stream.emit('end');
    });
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);
    
    req.on('close', () => {
      clearInterval(keepAlive);
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

/**
 * Utility Endpoints
 */

// Service information
router.get('/info', (req, res) => {
  const services = {};
  const serviceNames = ['monitoringService', 'alertingService', 'botMonitoringService', 'dashboardService'];
  
  serviceNames.forEach(serviceName => {
    const service = req.app.get(serviceName);
    services[serviceName] = {
      available: !!service,
      initialized: service?.isInitialized || false
    };
  });
  
  res.json({
    name: 'Lodge Scheduler Monitoring',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    services,
    endpoints: {
      health: '/monitoring/health',
      metrics: '/monitoring/metrics',
      alerts: '/monitoring/alerts',
      dashboard: '/monitoring/dashboard'
    },
    timestamp: Date.now()
  });
});

// Test endpoint for monitoring system
router.post('/test', async (req, res) => {
  try {
    const { type = 'basic' } = req.body;
    
    if (type === 'alert') {
      // Test alert system
      const alertingService = req.app.get('alertingService');
      if (alertingService) {
        await alertingService.processAlert({
          type: 'monitoring_test',
          severity: 'info',
          message: 'Test alert from monitoring API',
          timestamp: Date.now(),
          source: 'api_test'
        });
      }
    } else if (type === 'metrics') {
      // Test metrics collection
      const monitoringService = req.app.get('monitoringService');
      if (monitoringService) {
        monitoringService.recordMetric('test', 'api_test', 1);
      }
    }
    
    res.json({
      success: true,
      message: `${type} test completed successfully`,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Helper function to convert metrics to Prometheus format
function convertToPrometheusFormat(metrics) {
  let prometheus = '# Lodge Scheduler Metrics\n';
  
  const addMetric = (name, value, labels = {}, help = '') => {
    if (help) {
      prometheus += `# HELP ${name} ${help}\n`;
      prometheus += `# TYPE ${name} gauge\n`;
    }
    
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    prometheus += `${name}${labelStr ? `{${labelStr}}` : ''} ${value} ${Date.now()}\n`;
  };
  
  // System metrics
  if (metrics.system) {
    if (metrics.system.memory) {
      addMetric('lodge_memory_rss_bytes', metrics.system.memory.rss, {}, 'Resident Set Size memory usage');
      addMetric('lodge_memory_heap_used_bytes', metrics.system.memory.heapUsed, {}, 'Heap memory used');
      addMetric('lodge_memory_heap_total_bytes', metrics.system.memory.heapTotal, {}, 'Total heap memory');
    }
    addMetric('lodge_uptime_seconds', metrics.uptime, {}, 'Process uptime in seconds');
  }
  
  // Request metrics
  if (metrics.requests) {
    Object.entries(metrics.requests).forEach(([endpoint, count]) => {
      const [method, path] = endpoint.split(' ');
      addMetric('lodge_http_requests_total', count, { method, path }, 'Total HTTP requests');
    });
  }
  
  // Database metrics
  if (metrics.database) {
    Object.entries(metrics.database).forEach(([key, value]) => {
      if (key.startsWith('queries:')) {
        const queryType = key.split(':')[1];
        addMetric('lodge_database_queries_total', value, { type: queryType }, 'Total database queries');
      }
    });
  }
  
  // Bot metrics
  if (metrics.bot) {
    Object.entries(metrics.bot).forEach(([key, value]) => {
      if (key.startsWith('commands:')) {
        const command = key.split(':')[1];
        addMetric('lodge_bot_commands_total', value, { command }, 'Total bot commands');
      }
    });
  }
  
  return prometheus;
}

module.exports = router;