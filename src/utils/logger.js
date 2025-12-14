// Graceful fallback for winston dependency
let winston;
try {
  winston = require('winston');
} catch (error) {
  console.warn('⚠️  Winston not available, using simple logger fallback');
  // Use simple logger fallback
  const simpleLogger = require('./simple-logger');
  module.exports = simpleLogger;
  // Early return after setting module.exports
}
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'appointment-scheduler' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Write all logs with level `info` and below to `combined.log`
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
  ],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
      })
    )
  }));
}

// Create a stream object for morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Additional logging methods for specific use cases
logger.logAppointmentAction = (action, appointmentId, userId, details = {}) => {
  logger.info('Appointment action', {
    action,
    appointmentId,
    userId,
    details,
    timestamp: new Date().toISOString()
  });
};

logger.logNotificationSent = (notificationId, type, recipient, status) => {
  logger.info('Notification sent', {
    notificationId,
    type,
    recipient: recipient.substring(0, 3) + '***', // Mask recipient for privacy
    status,
    timestamp: new Date().toISOString()
  });
};

logger.logError = (error, context = {}) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

logger.logBookingAttempt = (clientId, providerId, serviceId, requestedTime, success, reason = null) => {
  logger.info('Booking attempt', {
    clientId,
    providerId,
    serviceId,
    requestedTime,
    success,
    reason,
    timestamp: new Date().toISOString()
  });
};

logger.logAvailabilityCheck = (providerId, date, slotsFound) => {
  logger.info('Availability check', {
    providerId,
    date,
    slotsFound,
    timestamp: new Date().toISOString()
  });
};

logger.logWaitlistAction = (action, waitlistId, clientId, details = {}) => {
  logger.info('Waitlist action', {
    action,
    waitlistId,
    clientId,
    details,
    timestamp: new Date().toISOString()
  });
};

// Admin audit logging method
logger.auditLog = (action, details = {}) => {
  logger.info('Admin audit log', {
    action,
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;