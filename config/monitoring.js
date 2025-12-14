const path = require('path');

/**
 * Comprehensive monitoring configuration for Lodge Scheduler
 */
const monitoringConfig = {
  // Environment-based settings
  environment: process.env.NODE_ENV || 'development',
  serviceName: process.env.SERVICE_NAME || 'lodge-scheduler',
  version: process.env.SERVICE_VERSION || '1.0.0',

  // Monitoring Service Configuration
  monitoring: {
    // Data retention
    metricsRetention: parseInt(process.env.METRICS_RETENTION) || 24 * 60 * 60 * 1000, // 24 hours
    maxDataPoints: parseInt(process.env.MAX_DATA_POINTS) || 1000,
    
    // Collection intervals
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    metricsCollectionInterval: parseInt(process.env.METRICS_INTERVAL) || 60000, // 1 minute
    
    // Alert thresholds
    alertThresholds: {
      responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD) || 5000, // 5 seconds
      errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05, // 5%
      memoryUsage: parseFloat(process.env.MEMORY_THRESHOLD) || 0.85, // 85%
      cpuUsage: parseFloat(process.env.CPU_THRESHOLD) || 0.80, // 80%
      diskUsage: parseFloat(process.env.DISK_THRESHOLD) || 0.90, // 90%
      activeConnections: parseInt(process.env.CONNECTION_THRESHOLD) || 1000
    },
    
    // Feature flags
    enableDetailedMetrics: process.env.ENABLE_DETAILED_METRICS === 'true',
    trackDatabaseQueries: process.env.TRACK_DB_QUERIES !== 'false',
    trackRequestHeaders: process.env.TRACK_REQUEST_HEADERS === 'true'
  },

  // Alerting Service Configuration
  alerting: {
    // Channels
    enableConsole: process.env.ENABLE_CONSOLE_ALERTS !== 'false',
    enableFile: process.env.ENABLE_FILE_ALERTS !== 'false',
    enableWebhook: process.env.ENABLE_WEBHOOK_ALERTS === 'true',
    enableEmail: process.env.ENABLE_EMAIL_ALERTS === 'true',
    enableSlack: process.env.ENABLE_SLACK_ALERTS === 'true',
    
    // Escalation
    escalationTimeout: parseInt(process.env.ESCALATION_TIMEOUT) || 15 * 60 * 1000, // 15 minutes
    maxRetries: parseInt(process.env.ALERT_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.ALERT_RETRY_DELAY) || 5000, // 5 seconds
    
    // File logging
    alertLogPath: process.env.ALERT_LOG_PATH || path.join(process.cwd(), 'logs', 'alerts.log'),
    maxLogSize: parseInt(process.env.ALERT_LOG_SIZE) || 10 * 1024 * 1024, // 10MB
    maxLogFiles: parseInt(process.env.ALERT_LOG_FILES) || 5,
    
    // External integrations
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    
    // Email settings
    emailSettings: {
      enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      from: process.env.ALERT_FROM_EMAIL || 'alerts@lodge-scheduler.com',
      to: process.env.ALERT_TO_EMAIL || 'admin@lodge-scheduler.com'
    }
  },

  // Bot Monitoring Configuration
  botMonitoring: {
    // Performance thresholds
    slowCommandThreshold: parseInt(process.env.BOT_SLOW_COMMAND_THRESHOLD) || 3000, // 3 seconds
    highErrorRateThreshold: parseFloat(process.env.BOT_ERROR_RATE_THRESHOLD) || 0.1, // 10%
    maxConcurrentSessions: parseInt(process.env.BOT_MAX_SESSIONS) || 500,
    
    // Session management
    sessionTimeout: parseInt(process.env.BOT_SESSION_TIMEOUT) || 30 * 60 * 1000, // 30 minutes
    metricsInterval: parseInt(process.env.BOT_METRICS_INTERVAL) || 60000, // 1 minute
    
    // Feature flags
    trackUserSessions: process.env.TRACK_USER_SESSIONS !== 'false',
    trackCommandPerformance: process.env.TRACK_COMMAND_PERFORMANCE !== 'false',
    trackUserEngagement: process.env.TRACK_USER_ENGAGEMENT !== 'false',
    trackConversationFlow: process.env.TRACK_CONVERSATION_FLOW === 'true'
  },

  // Dashboard Configuration
  dashboard: {
    // Update intervals
    updateInterval: parseInt(process.env.DASHBOARD_UPDATE_INTERVAL) || 5000, // 5 seconds
    historyRetention: parseInt(process.env.DASHBOARD_HISTORY_RETENTION) || 24 * 60 * 60 * 1000, // 24 hours
    maxDataPoints: parseInt(process.env.DASHBOARD_MAX_DATA_POINTS) || 1000,
    
    // KPI thresholds
    kpiThresholds: {
      responseTime: parseInt(process.env.KPI_RESPONSE_TIME) || 2000, // 2 seconds
      errorRate: parseFloat(process.env.KPI_ERROR_RATE) || 0.02, // 2%
      availabilityTarget: parseFloat(process.env.KPI_AVAILABILITY) || 0.999, // 99.9%
      botResponseTime: parseInt(process.env.KPI_BOT_RESPONSE_TIME) || 1000 // 1 second
    },
    
    // Features
    enableRealTimeStream: process.env.ENABLE_REALTIME_STREAM !== 'false',
    enableHistoricalData: process.env.ENABLE_HISTORICAL_DATA !== 'false',
    enableUserAnalytics: process.env.ENABLE_USER_ANALYTICS !== 'false'
  },

  // Structured Logging Configuration
  logging: {
    // Log levels
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    
    // File settings
    logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
    maxFileSize: parseInt(process.env.LOG_FILE_SIZE) || 20 * 1024 * 1024, // 20MB
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 14, // 14 days
    
    // Features
    enableCorrelationIds: process.env.ENABLE_CORRELATION_IDS !== 'false',
    enableStackTrace: process.env.ENABLE_STACK_TRACE !== 'false',
    enableMetadata: process.env.ENABLE_LOG_METADATA !== 'false',
    
    // Specialized logging
    enableAuditLog: process.env.ENABLE_AUDIT_LOG === 'true',
    enablePerformanceLog: process.env.ENABLE_PERFORMANCE_LOG === 'true',
    enableSecurityLog: process.env.ENABLE_SECURITY_LOG === 'true',
    
    // Performance settings
    slowOperationThreshold: parseInt(process.env.SLOW_OPERATION_THRESHOLD) || 1000, // 1 second
    
    // Audit events
    auditEvents: [
      'user_login', 'user_logout', 'user_register',
      'appointment_create', 'appointment_update', 'appointment_delete', 'appointment_cancel',
      'admin_login', 'admin_action', 'admin_user_create', 'admin_user_delete',
      'service_create', 'service_update', 'service_delete',
      'availability_update', 'waitlist_join', 'waitlist_leave',
      'notification_sent', 'reminder_sent',
      'bot_command', 'bot_session_start', 'bot_session_end'
    ],
    
    // Security events
    securityEvents: [
      'login_failure', 'unauthorized_access', 'rate_limit_exceeded',
      'invalid_token', 'suspicious_activity', 'brute_force_attempt',
      'api_key_invalid', 'cors_violation', 'csrf_attempt',
      'sql_injection_attempt', 'xss_attempt', 'path_traversal_attempt'
    ]
  },

  // Middleware Configuration
  middleware: {
    // Tracking features
    trackRequests: process.env.TRACK_REQUESTS !== 'false',
    trackResponses: process.env.TRACK_RESPONSES !== 'false',
    trackErrors: process.env.TRACK_ERRORS !== 'false',
    trackDatabaseQueries: process.env.TRACK_DATABASE_QUERIES !== 'false',
    
    // Endpoints
    enableHealthEndpoint: process.env.ENABLE_HEALTH_ENDPOINT !== 'false',
    enableMetricsEndpoint: process.env.ENABLE_METRICS_ENDPOINT !== 'false',
    enableAlertsEndpoint: process.env.ENABLE_ALERTS_ENDPOINT !== 'false',
    
    // Endpoint paths
    healthEndpointPath: process.env.HEALTH_ENDPOINT_PATH || '/health',
    metricsEndpointPath: process.env.METRICS_ENDPOINT_PATH || '/metrics',
    alertsEndpointPath: process.env.ALERTS_ENDPOINT_PATH || '/alerts',
    
    // Security
    requireAuthForMetrics: process.env.REQUIRE_AUTH_FOR_METRICS === 'true',
    allowedIPs: process.env.MONITORING_ALLOWED_IPS ? process.env.MONITORING_ALLOWED_IPS.split(',') : [],
    rateLimitMetrics: process.env.RATE_LIMIT_METRICS !== 'false'
  },

  // Database Monitoring
  database: {
    // Query performance
    slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000, // 1 second
    trackConnectionPool: process.env.TRACK_CONNECTION_POOL !== 'false',
    trackQueryTypes: process.env.TRACK_QUERY_TYPES !== 'false',
    
    // Health checks
    enableHealthCheck: process.env.ENABLE_DB_HEALTH_CHECK !== 'false',
    healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    healthCheckTimeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
    
    // Connection monitoring
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 50,
    connectionWarningThreshold: parseFloat(process.env.DB_CONNECTION_WARNING) || 0.8, // 80%
    connectionCriticalThreshold: parseFloat(process.env.DB_CONNECTION_CRITICAL) || 0.95 // 95%
  },

  // External Service Monitoring
  externalServices: {
    // Telegram Bot API
    telegramApi: {
      enabled: process.env.MONITOR_TELEGRAM_API !== 'false',
      timeout: parseInt(process.env.TELEGRAM_API_TIMEOUT) || 10000, // 10 seconds
      retryAttempts: parseInt(process.env.TELEGRAM_API_RETRIES) || 3,
      healthCheckInterval: parseInt(process.env.TELEGRAM_HEALTH_CHECK_INTERVAL) || 60000 // 1 minute
    },
    
    // Email service
    email: {
      enabled: process.env.MONITOR_EMAIL_SERVICE === 'true',
      timeout: parseInt(process.env.EMAIL_SERVICE_TIMEOUT) || 15000, // 15 seconds
      healthCheckInterval: parseInt(process.env.EMAIL_HEALTH_CHECK_INTERVAL) || 300000 // 5 minutes
    },
    
    // SMS service
    sms: {
      enabled: process.env.MONITOR_SMS_SERVICE === 'true',
      timeout: parseInt(process.env.SMS_SERVICE_TIMEOUT) || 10000, // 10 seconds
      healthCheckInterval: parseInt(process.env.SMS_HEALTH_CHECK_INTERVAL) || 300000 // 5 minutes
    }
  }
};

// Environment-specific overrides
if (monitoringConfig.environment === 'production') {
  // Production overrides
  monitoringConfig.logging.level = 'info';
  monitoringConfig.monitoring.enableDetailedMetrics = false;
  monitoringConfig.alerting.enableConsole = false;
  monitoringConfig.botMonitoring.trackConversationFlow = false;
} else if (monitoringConfig.environment === 'development') {
  // Development overrides
  monitoringConfig.logging.level = 'debug';
  monitoringConfig.monitoring.enableDetailedMetrics = true;
  monitoringConfig.alerting.escalationTimeout = 60000; // 1 minute for faster testing
  monitoringConfig.dashboard.updateInterval = 2000; // 2 seconds for faster updates
}

// Validation function
function validateConfig() {
  const errors = [];
  
  // Check required environment variables for production
  if (monitoringConfig.environment === 'production') {
    const requiredVars = [];
    
    if (monitoringConfig.alerting.enableWebhook && !monitoringConfig.alerting.webhookUrl) {
      requiredVars.push('ALERT_WEBHOOK_URL');
    }
    
    if (monitoringConfig.alerting.enableEmail && !monitoringConfig.alerting.emailSettings.host) {
      requiredVars.push('SMTP_HOST');
    }
    
    if (requiredVars.length > 0) {
      errors.push(`Missing required environment variables: ${requiredVars.join(', ')}`);
    }
  }
  
  // Validate thresholds
  if (monitoringConfig.monitoring.alertThresholds.errorRate < 0 || 
      monitoringConfig.monitoring.alertThresholds.errorRate > 1) {
    errors.push('ERROR_RATE_THRESHOLD must be between 0 and 1');
  }
  
  if (monitoringConfig.monitoring.alertThresholds.memoryUsage < 0 || 
      monitoringConfig.monitoring.alertThresholds.memoryUsage > 1) {
    errors.push('MEMORY_THRESHOLD must be between 0 and 1');
  }
  
  return errors;
}

// Helper function to get monitoring configuration
function getMonitoringConfig() {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.warn('⚠️ Monitoring configuration warnings:', errors);
  }
  
  return monitoringConfig;
}

// Helper function to get specific service configuration
function getServiceConfig(serviceName) {
  return monitoringConfig[serviceName] || {};
}

// Helper function to check if feature is enabled
function isFeatureEnabled(feature) {
  const parts = feature.split('.');
  let config = monitoringConfig;
  
  for (const part of parts) {
    if (config[part] === undefined) {
      return false;
    }
    config = config[part];
  }
  
  return Boolean(config);
}

module.exports = {
  config: monitoringConfig,
  getMonitoringConfig,
  getServiceConfig,
  isFeatureEnabled,
  validateConfig
};