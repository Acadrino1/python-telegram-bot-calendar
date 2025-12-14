/**
 * Lodge Scheduler Monitoring System
 * Central initialization and configuration for all monitoring services
 */

const MonitoringService = require('../services/MonitoringService');
const AlertingService = require('../services/AlertingService');
const BotMonitoringService = require('../services/BotMonitoringService');
const MetricsDashboardService = require('../services/MetricsDashboardService');
const StructuredLoggingService = require('../services/StructuredLoggingService');
const MonitoringMiddleware = require('../middleware/MonitoringMiddleware');
const { getMonitoringConfig } = require('../../config/monitoring');

/**
 * Complete monitoring system setup and initialization
 */
class LodgeSchedulerMonitoring {
  constructor(options = {}) {
    // Get configuration
    this.config = options.config || getMonitoringConfig();
    
    // Initialize services
    this.services = {};
    this.middleware = null;
    
    // Status tracking
    this.isInitialized = false;
    this.startTime = Date.now();
  }

  /**
   * Initialize all monitoring services
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Monitoring system already initialized');
      return this;
    }

    console.log('🚀 Initializing Lodge Scheduler Monitoring System...');
    console.log('━'.repeat(60));

    try {
      // Initialize core services
      await this.initializeServices();

      // Setup service connections
      this.connectServices();

      // Initialize middleware
      await this.initializeMiddleware();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      this.isInitialized = true;
      const initTime = Date.now() - this.startTime;

      console.log('━'.repeat(60));
      console.log('✅ Lodge Scheduler Monitoring System Initialized');
      console.log(`🕒 Initialization time: ${initTime}ms`);
      console.log(`🎯 Environment: ${this.config.environment}`);
      console.log(`📊 Services: ${Object.keys(this.services).length} active`);
      console.log('━'.repeat(60));

      return this;
    } catch (error) {
      console.error('❌ Failed to initialize monitoring system:', error);
      throw error;
    }
  }

  /**
   * Initialize individual services
   */
  async initializeServices() {
    console.log('📋 Initializing monitoring services...');

    // 1. Structured Logging (initialize first for error logging)
    this.services.logging = new StructuredLoggingService({
      ...this.config.logging,
      serviceName: this.config.serviceName,
      version: this.config.version
    });
    await this.services.logging.initialize();

    // 2. Monitoring Service (core metrics)
    this.services.monitoring = new MonitoringService({
      ...this.config.monitoring,
      enableDetailedMetrics: this.config.monitoring.enableDetailedMetrics
    });
    await this.services.monitoring.initialize();

    // 3. Alerting Service (depends on logging)
    this.services.alerting = new AlertingService({
      ...this.config.alerting,
      serviceName: this.config.serviceName
    });
    await this.services.alerting.initialize();

    // 4. Bot Monitoring Service
    this.services.botMonitoring = new BotMonitoringService({
      ...this.config.botMonitoring
    });
    await this.services.botMonitoring.initialize();

    // 5. Dashboard Service (depends on monitoring and alerting)
    this.services.dashboard = new MetricsDashboardService(
      this.services.monitoring,
      this.services.alerting,
      this.config.dashboard
    );
    await this.services.dashboard.initialize();

    console.log('✅ All monitoring services initialized');
  }

  /**
   * Connect services for event flow
   */
  connectServices() {
    console.log('🔗 Connecting monitoring services...');

    // Connect monitoring alerts to alerting service
    this.services.monitoring.on('alert', (alert) => {
      this.services.alerting.processAlert(alert);
    });

    // Connect bot monitoring events to alerting
    this.services.botMonitoring.on('slow_command', (data) => {
      this.services.alerting.processAlert({
        type: 'bot_slow_command',
        severity: 'warning',
        message: `Bot command '${data.command}' is slow`,
        timestamp: Date.now(),
        details: data
      });
    });

    this.services.botMonitoring.on('high_error_rate', (data) => {
      this.services.alerting.processAlert({
        type: 'bot_high_error_rate',
        severity: 'critical',
        message: `High error rate for bot command '${data.command}'`,
        timestamp: Date.now(),
        details: data
      });
    });

    // Connect alerting events to logging
    this.services.alerting.on('alert_processed', (alert) => {
      this.services.logging.security('alert_generated', alert.severity, {
        alertType: alert.type,
        alertId: alert.id,
        details: alert.details
      });
    });

    // Connect dashboard events
    this.services.dashboard.on('kpi_update', (kpis) => {
      // Log KPI violations
      Object.entries(kpis).forEach(([kpi, data]) => {
        if (data.status === 'critical') {
          this.services.alerting.processAlert({
            type: `kpi_violation_${kpi}`,
            severity: 'warning',
            message: `KPI '${kpi}' below target`,
            timestamp: Date.now(),
            details: {
              current: data.value,
              target: data.target,
              status: data.status
            }
          });
        }
      });
    });

    console.log('✅ Service connections established');
  }

  /**
   * Initialize monitoring middleware
   */
  async initializeMiddleware() {
    console.log('📊 Initializing monitoring middleware...');

    this.middleware = new MonitoringMiddleware({
      monitoring: this.config.monitoring,
      alerting: this.config.alerting,
      middleware: this.config.middleware
    });

    // Inject services into middleware
    this.middleware.monitoringService = this.services.monitoring;
    this.middleware.alertingService = this.services.alerting;

    await this.middleware.initialize();

    console.log('✅ Monitoring middleware initialized');
  }

  /**
   * Setup Express application with monitoring
   */
  setupExpress(app) {
    if (!this.middleware) {
      throw new Error('Monitoring system must be initialized before Express setup');
    }

    console.log('📡 Setting up Express monitoring...');

    // Store services in app for route access
    app.set('monitoringService', this.services.monitoring);
    app.set('alertingService', this.services.alerting);
    app.set('botMonitoringService', this.services.botMonitoring);
    app.set('dashboardService', this.services.dashboard);
    app.set('loggingService', this.services.logging);

    // Setup monitoring middleware
    this.middleware.setupMiddleware(app);

    // Add monitoring routes
    const monitoringRoutes = require('../routes/monitoring');
    app.use('/monitoring', monitoringRoutes);

    console.log('✅ Express monitoring configured');
    
    return app;
  }

  /**
   * Setup bot monitoring integration
   */
  setupBotMonitoring(bot) {
    if (!this.services.botMonitoring) {
      throw new Error('Bot monitoring service not initialized');
    }

    console.log('🤖 Setting up bot monitoring integration...');

    const botService = this.services.botMonitoring;
    const logger = this.services.logging;

    // Create monitoring wrapper for bot commands
    const monitoringWrapper = {
      trackCommand: (userId, command, callback) => {
        const commandId = botService.trackCommand(userId, command);
        const startTime = Date.now();
        
        return new Promise((resolve, reject) => {
          callback()
            .then(result => {
              const duration = Date.now() - startTime;
              botService.completeCommand(commandId, true, null, { duration });
              logger.botInteraction(userId, command, true, duration);
              resolve(result);
            })
            .catch(error => {
              const duration = Date.now() - startTime;
              botService.completeCommand(commandId, false, error, { duration });
              logger.botInteraction(userId, command, false, duration, { error: error.message });
              reject(error);
            });
        });
      },

      trackSession: (userId, action, metadata = {}) => {
        const sessionId = botService.trackSession(userId, action, metadata);
        logger.audit('bot_session_' + action, userId, { sessionId, ...metadata });
        return sessionId;
      },

      trackMessage: (userId, messageType, content, metadata = {}) => {
        botService.trackMessage(userId, messageType, content, metadata);
        logger.info(`Bot message: ${messageType}`, { userId, messageType, ...metadata });
      }
    };

    console.log('✅ Bot monitoring integration ready');
    
    return monitoringWrapper;
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      uptime: Date.now() - this.startTime,
      services: Object.keys(this.services).reduce((status, serviceName) => {
        const service = this.services[serviceName];
        status[serviceName] = {
          available: !!service,
          initialized: service?.isInitialized || false
        };
        return status;
      }, {}),
      config: {
        environment: this.config.environment,
        serviceName: this.config.serviceName,
        version: this.config.version
      }
    };
  }

  /**
   * Get comprehensive monitoring report
   */
  async getMonitoringReport() {
    if (!this.isInitialized) {
      throw new Error('Monitoring system not initialized');
    }

    const [
      health,
      metrics,
      botMetrics,
      dashboardData,
      alerts,
      logStats
    ] = await Promise.all([
      this.services.monitoring.performHealthCheck(),
      this.services.monitoring.getMetricsSummary(),
      this.services.botMonitoring.getBotMetrics(),
      this.services.dashboard.getDashboardData(),
      this.services.alerting.getActiveAlerts(),
      this.services.logging.getStatistics()
    ]);

    return {
      timestamp: Date.now(),
      status: this.getStatus(),
      health,
      metrics,
      botMetrics,
      dashboard: dashboardData,
      alerts: {
        active: alerts.length,
        recent: alerts.slice(0, 10)
      },
      logging: logStats,
      recommendations: this.generateRecommendations(health, metrics, alerts)
    };
  }

  /**
   * Generate system recommendations
   */
  generateRecommendations(health, metrics, alerts) {
    const recommendations = [];

    // Health-based recommendations
    if (health.overall !== 'healthy') {
      const unhealthyComponents = Array.from(health.components.entries())
        .filter(([name, status]) => !status.healthy)
        .map(([name]) => name);
      
      recommendations.push({
        type: 'health',
        priority: 'high',
        message: `Unhealthy components detected: ${unhealthyComponents.join(', ')}`,
        action: 'Check component logs and fix underlying issues'
      });
    }

    // Performance recommendations
    const avgResponseTime = this.calculateAverageResponseTime(metrics);
    if (avgResponseTime > this.config.monitoring.alertThresholds.responseTime) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: `Average response time (${avgResponseTime}ms) exceeds threshold`,
        action: 'Review slow endpoints and optimize performance'
      });
    }

    // Alert-based recommendations
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    if (criticalAlerts > 5) {
      recommendations.push({
        type: 'reliability',
        priority: 'critical',
        message: `${criticalAlerts} critical alerts active`,
        action: 'Address critical issues immediately to prevent service degradation'
      });
    }

    // Resource recommendations
    if (metrics.system?.memory?.heapUsed && metrics.system?.memory?.heapTotal) {
      const memoryUsage = metrics.system.memory.heapUsed / metrics.system.memory.heapTotal;
      if (memoryUsage > 0.8) {
        recommendations.push({
          type: 'resources',
          priority: 'medium',
          message: `High memory usage detected (${Math.round(memoryUsage * 100)}%)`,
          action: 'Review memory leaks and consider scaling'
        });
      }
    }

    return recommendations;
  }

  /**
   * Calculate average response time from metrics
   */
  calculateAverageResponseTime(metrics) {
    // This would be implemented based on actual metrics structure
    return 0; // Placeholder
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down monitoring system gracefully...`);
      
      try {
        await this.shutdown();
        console.log('✅ Monitoring system shut down successfully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during monitoring shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  /**
   * Graceful shutdown of all services
   */
  async shutdown() {
    if (!this.isInitialized) return;

    console.log('🧹 Shutting down monitoring services...');

    // Shutdown in reverse order of initialization
    const shutdownOrder = [
      'dashboard',
      'botMonitoring', 
      'alerting',
      'monitoring',
      'logging'
    ];

    for (const serviceName of shutdownOrder) {
      const service = this.services[serviceName];
      if (service && typeof service.shutdown === 'function') {
        try {
          await service.shutdown();
        } catch (error) {
          console.error(`Error shutting down ${serviceName}:`, error);
        }
      }
    }

    // Shutdown middleware
    if (this.middleware && typeof this.middleware.shutdown === 'function') {
      await this.middleware.shutdown();
    }

    this.isInitialized = false;
  }

  /**
   * Create monitoring instance with default configuration
   */
  static async create(options = {}) {
    const monitoring = new LodgeSchedulerMonitoring(options);
    await monitoring.initialize();
    return monitoring;
  }

  /**
   * Create quick development setup
   */
  static async createDevelopment() {
    const devConfig = getMonitoringConfig();
    devConfig.environment = 'development';
    devConfig.logging.level = 'debug';
    devConfig.monitoring.enableDetailedMetrics = true;
    devConfig.alerting.enableConsole = true;
    devConfig.dashboard.updateInterval = 2000;

    return LodgeSchedulerMonitoring.create({ config: devConfig });
  }

  /**
   * Create production setup
   */
  static async createProduction() {
    const prodConfig = getMonitoringConfig();
    prodConfig.environment = 'production';
    prodConfig.logging.level = 'info';
    prodConfig.monitoring.enableDetailedMetrics = false;
    prodConfig.alerting.enableConsole = false;
    prodConfig.alerting.enableWebhook = true;
    prodConfig.alerting.enableEmail = true;

    return LodgeSchedulerMonitoring.create({ config: prodConfig });
  }
}

module.exports = {
  LodgeSchedulerMonitoring,
  MonitoringService,
  AlertingService,
  BotMonitoringService,
  MetricsDashboardService,
  StructuredLoggingService,
  MonitoringMiddleware
};