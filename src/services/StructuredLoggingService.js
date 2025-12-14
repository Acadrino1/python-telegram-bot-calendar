const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

/**
 * Structured logging service with correlation IDs and audit trails
 */
class StructuredLoggingService {
  constructor(options = {}) {
    this.config = {
      // Log levels
      level: options.level || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      
      // File settings
      logDir: options.logDir || path.join(process.cwd(), 'logs'),
      maxFileSize: options.maxFileSize || 20 * 1024 * 1024, // 20MB
      maxFiles: options.maxFiles || 14, // 14 days
      
      // Format settings
      enableCorrelationIds: options.enableCorrelationIds !== false,
      enableStackTrace: options.enableStackTrace !== false,
      enableMetadata: options.enableMetadata !== false,
      
      // Service info
      serviceName: options.serviceName || 'lodge-scheduler',
      version: options.version || '1.0.0',
      
      // Audit logging
      enableAuditLog: options.enableAuditLog || false,
      auditEvents: options.auditEvents || [
        'user_login', 'user_logout', 'appointment_create', 'appointment_update',
        'appointment_delete', 'admin_action', 'security_event'
      ],
      
      // Performance logging
      enablePerformanceLog: options.enablePerformanceLog || false,
      slowOperationThreshold: options.slowOperationThreshold || 1000, // 1 second
      
      // Security logging
      enableSecurityLog: options.enableSecurityLog || false,
      securityEvents: options.securityEvents || [
        'login_failure', 'unauthorized_access', 'rate_limit_exceeded',
        'invalid_token', 'suspicious_activity'
      ]
    };

    // Correlation ID context (AsyncLocalStorage would be better in production)
    this.correlationContext = new Map();
    
    // Logger instances
    this.logger = null;
    this.auditLogger = null;
    this.performanceLogger = null;
    this.securityLogger = null;
    
    // Log formatters
    this.formatters = this.createFormatters();
    
    this.isInitialized = false;
  }

  /**
   * Initialize the logging service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('📝 Initializing Structured Logging Service...');

    // Ensure log directory exists
    await this.ensureLogDirectory();

    // Create logger instances
    this.createLoggers();

    // Setup process handlers
    this.setupProcessHandlers();

    this.isInitialized = true;
    
    this.info('Structured Logging Service initialized', {
      service: this.config.serviceName,
      version: this.config.version,
      logLevel: this.config.level,
      features: {
        correlationIds: this.config.enableCorrelationIds,
        auditLog: this.config.enableAuditLog,
        performanceLog: this.config.enablePerformanceLog,
        securityLog: this.config.enableSecurityLog
      }
    });
  }

  /**
   * Generate correlation ID for request tracking
   */
  generateCorrelationId() {
    return uuidv4();
  }

  /**
   * Set correlation ID for current operation
   */
  setCorrelationId(id, metadata = {}) {
    if (this.config.enableCorrelationIds) {
      this.correlationContext.set('current', {
        id,
        metadata,
        timestamp: Date.now()
      });
    }
    return id;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId() {
    const context = this.correlationContext.get('current');
    return context ? context.id : null;
  }

  /**
   * Create child logger with correlation ID
   */
  child(metadata = {}) {
    const correlationId = this.generateCorrelationId();
    this.setCorrelationId(correlationId, metadata);
    
    return {
      correlationId,
      debug: (message, meta) => this.debug(message, meta),
      info: (message, meta) => this.info(message, meta),
      warn: (message, meta) => this.warn(message, meta),
      error: (message, meta) => this.error(message, meta)
    };
  }

  // Standard logging methods

  debug(message, metadata = {}) {
    this.log('debug', message, metadata);
  }

  info(message, metadata = {}) {
    this.log('info', message, metadata);
  }

  warn(message, metadata = {}) {
    this.log('warn', message, metadata);
  }

  error(message, metadata = {}, error = null) {
    const logData = { ...metadata };
    
    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: this.config.enableStackTrace ? error.stack : undefined
      };
    }
    
    this.log('error', message, logData);
  }

  // Specialized logging methods

  /**
   * Log audit events
   */
  audit(event, userId, details = {}) {
    if (!this.config.enableAuditLog || !this.config.auditEvents.includes(event)) {
      return;
    }

    const auditData = {
      event,
      userId,
      timestamp: new Date().toISOString(),
      correlationId: this.getCorrelationId(),
      details,
      source: {
        service: this.config.serviceName,
        version: this.config.version,
        hostname: require('os').hostname(),
        pid: process.pid
      }
    };

    this.auditLogger.info('AUDIT', auditData);
  }

  /**
   * Log performance metrics
   */
  performance(operation, duration, metadata = {}) {
    if (!this.config.enablePerformanceLog) return;

    const perfData = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      correlationId: this.getCorrelationId(),
      slow: duration > this.config.slowOperationThreshold,
      ...metadata
    };

    this.performanceLogger.info('PERFORMANCE', perfData);

    // Also log to main logger if it's a slow operation
    if (duration > this.config.slowOperationThreshold) {
      this.warn(`Slow operation detected: ${operation}`, {
        duration,
        threshold: this.config.slowOperationThreshold
      });
    }
  }

  /**
   * Log security events
   */
  security(event, severity, details = {}) {
    if (!this.config.enableSecurityLog) return;

    const securityData = {
      event,
      severity,
      timestamp: new Date().toISOString(),
      correlationId: this.getCorrelationId(),
      details,
      source: {
        service: this.config.serviceName,
        hostname: require('os').hostname()
      }
    };

    this.securityLogger.warn('SECURITY', securityData);

    // Also log to main logger for high severity events
    if (severity === 'high' || severity === 'critical') {
      this.error(`Security event: ${event}`, securityData);
    }
  }

  /**
   * Log HTTP requests
   */
  httpRequest(req, res, duration) {
    const requestData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection?.remoteAddress,
      correlationId: req.correlationId || this.getCorrelationId(),
      requestSize: req.get('Content-Length'),
      responseSize: res.get('Content-Length'),
      userId: req.user?.id
    };

    // Determine log level based on status code
    let level = 'info';
    if (res.statusCode >= 400 && res.statusCode < 500) {
      level = 'warn';
    } else if (res.statusCode >= 500) {
      level = 'error';
    }

    this.log(level, `${req.method} ${req.originalUrl || req.url}`, requestData);
  }

  /**
   * Log database operations
   */
  database(operation, query, duration, success = true, error = null) {
    const dbData = {
      operation,
      duration,
      success,
      correlationId: this.getCorrelationId(),
      query: this.sanitizeQuery(query),
      slow: duration > 100 // 100ms threshold for slow queries
    };

    if (!success && error) {
      dbData.error = {
        message: error.message,
        code: error.code
      };
    }

    const level = success ? 'debug' : 'error';
    this.log(level, `Database ${operation}`, dbData);
  }

  /**
   * Log bot interactions
   */
  botInteraction(userId, command, success = true, duration = 0, metadata = {}) {
    const botData = {
      userId,
      command,
      success,
      duration,
      correlationId: this.getCorrelationId(),
      ...metadata
    };

    this.info(`Bot command: ${command}`, botData);

    // Track performance
    if (this.config.enablePerformanceLog) {
      this.performance(`bot_command_${command}`, duration, { userId, success });
    }
  }

  // Private methods

  log(level, message, metadata = {}) {
    if (!this.logger) return;

    const logData = {
      message,
      level,
      timestamp: new Date().toISOString(),
      service: this.config.serviceName,
      version: this.config.version,
      correlationId: this.getCorrelationId(),
      ...metadata
    };

    this.logger.log(level, logData);
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.config.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
      throw error;
    }
  }

  createLoggers() {
    // Main application logger
    this.logger = winston.createLogger({
      level: this.config.level,
      format: this.formatters.application,
      defaultMeta: {
        service: this.config.serviceName,
        version: this.config.version
      },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            this.formatters.console
          )
        }),
        
        // Application log file
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'application.log'),
          maxsize: this.config.maxFileSize,
          maxFiles: this.config.maxFiles,
          tailable: true
        }),
        
        // Error log file
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'error.log'),
          level: 'error',
          maxsize: this.config.maxFileSize,
          maxFiles: this.config.maxFiles
        })
      ]
    });

    // Audit logger
    if (this.config.enableAuditLog) {
      this.auditLogger = winston.createLogger({
        level: 'info',
        format: this.formatters.audit,
        transports: [
          new winston.transports.File({
            filename: path.join(this.config.logDir, 'audit.log'),
            maxsize: this.config.maxFileSize,
            maxFiles: this.config.maxFiles
          })
        ]
      });
    }

    // Performance logger
    if (this.config.enablePerformanceLog) {
      this.performanceLogger = winston.createLogger({
        level: 'info',
        format: this.formatters.performance,
        transports: [
          new winston.transports.File({
            filename: path.join(this.config.logDir, 'performance.log'),
            maxsize: this.config.maxFileSize,
            maxFiles: this.config.maxFiles
          })
        ]
      });
    }

    // Security logger
    if (this.config.enableSecurityLog) {
      this.securityLogger = winston.createLogger({
        level: 'warn',
        format: this.formatters.security,
        transports: [
          new winston.transports.File({
            filename: path.join(this.config.logDir, 'security.log'),
            maxsize: this.config.maxFileSize,
            maxFiles: this.config.maxFiles
          })
        ]
      });
    }
  }

  createFormatters() {
    return {
      application: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),

      console: winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
        const corrId = correlationId ? `[${correlationId.substring(0, 8)}]` : '';
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level} ${corrId} ${message} ${metaStr}`;
      }),

      audit: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),

      performance: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),

      security: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    };
  }

  setupProcessHandlers() {
    // Log uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.error('Uncaught exception', {}, error);
      process.exit(1);
    });

    // Log unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.error('Unhandled rejection', {
        reason: reason?.toString(),
        promise: promise?.toString()
      });
    });

    // Log process warnings
    process.on('warning', (warning) => {
      this.warn('Process warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      });
    });
  }

  sanitizeQuery(query) {
    if (typeof query !== 'string') return query;
    
    // Remove sensitive data from queries
    return query
      .replace(/password\s*=\s*['"][^'"]*['"]/gi, "password='***'")
      .replace(/token\s*=\s*['"][^'"]*['"]/gi, "token='***'")
      .substring(0, 200); // Limit query length
  }

  /**
   * Create Express middleware for request logging
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.get('X-Correlation-ID') || this.generateCorrelationId();
      
      // Set correlation ID
      req.correlationId = correlationId;
      res.set('X-Correlation-ID', correlationId);
      this.setCorrelationId(correlationId, {
        method: req.method,
        url: req.originalUrl || req.url
      });

      // Log request completion
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.httpRequest(req, res, duration);
      });

      next();
    };
  }

  /**
   * Create performance measurement decorator
   */
  createPerformanceDecorator(operationName) {
    return (target, propertyName, descriptor) => {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function(...args) {
        const startTime = Date.now();
        try {
          const result = await originalMethod.apply(this, args);
          const duration = Date.now() - startTime;
          this.performance?.(operationName, duration, { success: true });
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          this.performance?.(operationName, duration, { success: false, error: error.message });
          throw error;
        }
      };
      
      return descriptor;
    };
  }

  /**
   * Get log statistics
   */
  getStatistics() {
    // This would typically come from a log aggregation system
    return {
      loggers: {
        application: !!this.logger,
        audit: !!this.auditLogger,
        performance: !!this.performanceLogger,
        security: !!this.securityLogger
      },
      config: {
        level: this.config.level,
        correlationIds: this.config.enableCorrelationIds,
        auditLog: this.config.enableAuditLog,
        performanceLog: this.config.enablePerformanceLog,
        securityLog: this.config.enableSecurityLog
      },
      activeCorrelations: this.correlationContext.size
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('📝 Shutting down Structured Logging Service...');
    
    // Final log entry
    this.info('Structured Logging Service shutting down');

    // Close all transports
    if (this.logger) this.logger.close();
    if (this.auditLogger) this.auditLogger.close();
    if (this.performanceLogger) this.performanceLogger.close();
    if (this.securityLogger) this.securityLogger.close();

    // Clear correlation context
    this.correlationContext.clear();

    console.log('✅ Structured Logging Service shut down');
  }
}

module.exports = StructuredLoggingService;