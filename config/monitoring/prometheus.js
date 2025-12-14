const prometheus = require('prom-client');
const logger = require('../../src/utils/logger');

// Create a Registry which registers the metrics
const register = new prometheus.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'lodge-scheduler',
  environment: process.env.NODE_ENV || 'development'
});

// Enable collection of default metrics
prometheus.collectDefaultMetrics({ register });

// Custom metrics for Lodge Scheduler
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const telegramBotRequests = new prometheus.Counter({
  name: 'telegram_bot_requests_total',
  help: 'Total number of Telegram bot requests',
  labelNames: ['command', 'status', 'user_type']
});

const appointmentBookings = new prometheus.Counter({
  name: 'appointment_bookings_total',
  help: 'Total number of appointment bookings',
  labelNames: ['service', 'status', 'channel']
});

const databaseQueries = new prometheus.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
});

const redisOperations = new prometheus.Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Duration of Redis operations in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5]
});

const notificationsSent = new prometheus.Counter({
  name: 'notifications_sent_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'channel', 'status']
});

const activeUsers = new prometheus.Gauge({
  name: 'active_users',
  help: 'Number of active users',
  labelNames: ['user_type', 'timeframe']
});

const systemHealth = new prometheus.Gauge({
  name: 'system_health_score',
  help: 'Overall system health score (0-1)',
  labelNames: ['component']
});

const callbackQueryLatency = new prometheus.Histogram({
  name: 'callback_query_latency_seconds',
  help: 'Latency of callback query processing',
  labelNames: ['query_type', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

const memoryUsage = new prometheus.Gauge({
  name: 'nodejs_memory_usage_bytes',
  help: 'Node.js memory usage in bytes',
  labelNames: ['type']
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(telegramBotRequests);
register.registerMetric(appointmentBookings);
register.registerMetric(databaseQueries);
register.registerMetric(redisOperations);
register.registerMetric(notificationsSent);
register.registerMetric(activeUsers);
register.registerMetric(systemHealth);
register.registerMetric(callbackQueryLatency);
register.registerMetric(memoryUsage);

// Middleware to track HTTP requests
const trackHttpRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
};

// Function to track Telegram bot requests
const trackTelegramRequest = (command, status, userType = 'unknown') => {
  telegramBotRequests.labels(command, status, userType).inc();
};

// Function to track appointment bookings
const trackAppointmentBooking = (service, status, channel = 'telegram') => {
  appointmentBookings.labels(service, status, channel).inc();
};

// Function to track database queries
const trackDatabaseQuery = (operation, table, status, duration) => {
  databaseQueries.labels(operation, table, status).observe(duration);
};

// Function to track Redis operations
const trackRedisOperation = (operation, status, duration) => {
  redisOperations.labels(operation, status).observe(duration);
};

// Function to track notifications
const trackNotification = (type, channel, status) => {
  notificationsSent.labels(type, channel, status).inc();
};

// Function to update active users
const updateActiveUsers = (count, userType, timeframe) => {
  activeUsers.labels(userType, timeframe).set(count);
};

// Function to update system health
const updateSystemHealth = (component, score) => {
  systemHealth.labels(component).set(score);
};

// Function to track callback query latency
const trackCallbackQueryLatency = (queryType, status, duration) => {
  callbackQueryLatency.labels(queryType, status).observe(duration);
};

// Function to update memory usage
const updateMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  memoryUsage.labels('rss').set(memUsage.rss);
  memoryUsage.labels('heapTotal').set(memUsage.heapTotal);
  memoryUsage.labels('heapUsed').set(memUsage.heapUsed);
  memoryUsage.labels('external').set(memUsage.external);
};

// Update memory usage every 30 seconds
setInterval(updateMemoryUsage, 30000);

// Health check for monitoring system
const healthCheck = () => {
  try {
    // Basic health checks
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Calculate health scores
    const memoryHealth = Math.max(0, 1 - (memUsage.heapUsed / memUsage.heapTotal));
    const uptimeHealth = Math.min(1, uptime / (24 * 60 * 60)); // Normalize to 24 hours
    
    updateSystemHealth('memory', memoryHealth);
    updateSystemHealth('uptime', uptimeHealth);
    updateSystemHealth('overall', (memoryHealth + uptimeHealth) / 2);
    
    return {
      status: 'healthy',
      memory: memUsage,
      uptime,
      healthScores: {
        memory: memoryHealth,
        uptime: uptimeHealth
      }
    };
  } catch (error) {
    logger.error('Health check failed:', error);
    updateSystemHealth('overall', 0);
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

// Run health check every minute
setInterval(healthCheck, 60000);

module.exports = {
  register,
  metrics: {
    httpRequestDuration,
    telegramBotRequests,
    appointmentBookings,
    databaseQueries,
    redisOperations,
    notificationsSent,
    activeUsers,
    systemHealth,
    callbackQueryLatency,
    memoryUsage
  },
  track: {
    httpRequest: trackHttpRequest,
    telegramRequest: trackTelegramRequest,
    appointmentBooking: trackAppointmentBooking,
    databaseQuery: trackDatabaseQuery,
    redisOperation: trackRedisOperation,
    notification: trackNotification,
    callbackQueryLatency: trackCallbackQueryLatency
  },
  update: {
    activeUsers: updateActiveUsers,
    systemHealth: updateSystemHealth,
    memoryUsage: updateMemoryUsage
  },
  healthCheck
};