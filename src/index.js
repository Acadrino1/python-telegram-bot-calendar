const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Model } = require('objection');
const Knex = require('knex');
require('dotenv').config();

// Initialize feature toggle system (graceful fallback)
let features, featureManager, validator;
try {
  const configModule = require('../config/features');
  features = configModule.features;
  featureManager = configModule.manager;
} catch (error) {
  console.warn('⚠️  Feature toggle system not available, using defaults');
  // Fallback feature system
  features = {
    isApiServerEnabled: () => true,
    isDatabaseEnabled: () => true,
    isAuthEnabled: () => true,
    areAppointmentsEnabled: () => true,
    isAvailabilityEnabled: () => true,
    isWaitlistEnabled: () => true,
    isDataRetentionEnabled: () => false,
    isBroadcastSystemEnabled: () => false,
    isRateLimitingEnabled: () => true,
    isInputValidationEnabled: () => true,
    isAuditLoggingEnabled: () => false
  };
  featureManager = {
    getEnabledFeatures: () => ['core.api_server', 'core.database', 'core.authentication']
  };
}

try {
  const validatorModule = require('../config/startup-validator');
  validator = validatorModule.validator;
} catch (error) {
  console.warn('⚠️  Startup validator not available, skipping validation');
  validator = {
    validate: () => Promise.resolve({ valid: true, validation: { errors: [] } })
  };
}

// Import security middleware
const { 
  securityHeaders, 
  validateApiKey, 
  sanitizeInput, 
  requireAdmin, 
  validateBotToken, 
  auditLogger 
} = require('./middleware/security');
const { applyRateLimit } = require('../security/rate-limiting-middleware');

// Import routes
const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const availabilityRoutes = require('./routes/availability');
const serviceRoutes = require('./routes/services');
const userRoutes = require('./routes/users');
const waitlistRoutes = require('./routes/waitlist');
const notificationRoutes = require('./routes/notifications');
// Import data retention routes if available
let dataRetentionRoutes;
try {
  dataRetentionRoutes = require('./routes/dataRetention');
} catch (error) {
  console.warn('⚠️  Data retention routes not available');
}

// Import payments routes
const paymentRoutes = require('./routes/payments');

// Import middleware
// Import middleware with graceful fallback
let authMiddleware, errorHandler, logger;
try {
  authMiddleware = require('./middleware/auth');
} catch (error) {
  console.warn('⚠️  Auth middleware not available');
  authMiddleware = (req, res, next) => next();
}

try {
  errorHandler = require('./middleware/errorHandler');
} catch (error) {
  console.warn('⚠️  Error handler not available');
  errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  };
}

try {
  logger = require('./utils/logger');
} catch (error) {
  console.warn('⚠️  Logger not available, using console');
  logger = {
    info: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console)
  };
}

// Import services with graceful fallback
let NotificationService, DataRetentionService;
try {
  NotificationService = require('./services/NotificationService');
} catch (error) {
  console.warn('⚠️  Notification service not available');
}

try {
  DataRetentionService = require('./services/DataRetentionService');
} catch (error) {
  console.warn('⚠️  Data retention service not available');
}

class AppointmentSchedulerApp {
  constructor() {
    this.app = null;
    this.port = process.env.PORT || 3000;
    this.broadcastService = null;
    this.validationResult = null;
    this.initialized = false;
    this.initPromise = this.initializeAsync();
  }

  async initializeAsync() {
    // Validate feature configuration first
    console.log('🔍 Validating feature configuration...');
    // Set bypass flag if we're starting admin panel only
    if (!process.env.TELEGRAM_BOT_TOKEN && features.isAdminPanelEnabled()) {
      process.env.BYPASS_TELEGRAM_CHECK = 'true';
      console.log('ℹ️  Running in admin-only mode - bypassing Telegram validation');
    }
    
    this.validationResult = await validator.validate();
    
    if (!this.validationResult.valid) {
      // Check if we only have telegram-related errors and can bypass them
      const nonTelegramErrors = this.validationResult.validation.errors.filter(
        error => !error.includes('TELEGRAM_BOT_TOKEN')
      );
      
      if (nonTelegramErrors.length > 0) {
        console.error('❌ Critical validation errors. Server will not start.');
        console.error('Errors:', nonTelegramErrors);
        throw new Error('Critical feature configuration validation failed');
      } else {
        console.warn('⚠️  Non-critical validation warnings (telegram-related)');
        console.warn('Warnings:', this.validationResult.validation.errors);
      }
    }

    // Only initialize Express app if API server is enabled
    if (features.isApiServerEnabled()) {
      this.app = express();
      this.initializeDatabase();
      await this.initializeServices();
      this.initializeMiddleware();
      await this.initializeRoutes();
      this.initializeErrorHandling();
    } else {
      console.log('ℹ️  API server disabled - running in minimal mode');
    }
    
    this.initialized = true;
  }

  initializeDatabase() {
    if (!features.isDatabaseEnabled()) {
      console.log('ℹ️  Database disabled by feature toggle');
      return;
    }

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/index.js:179',message:'Attempting to require knexfile',data:{nodeEnv:process.env.NODE_ENV||'development',path:'../knexfile'},timestamp:Date.now(),sessionId:'debug-session',runId:'startup',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const knexConfig = require('../knexfile')[process.env.NODE_ENV || 'development'];
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/index.js:180',message:'Knexfile loaded successfully',data:{hasConfig:!!knexConfig,client:knexConfig?.client},timestamp:Date.now(),sessionId:'debug-session',runId:'startup',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const knex = Knex(knexConfig);
    
    // Give Objection.js the knex instance
    Model.knex(knex);
    
    console.log('✅ Database initialized');
  }

  async initializeServices() {
    // Initialize broadcast service if enabled
    if (features.isBroadcastSystemEnabled()) {
      // this.broadcastService = new BroadcastService();
      // await this.broadcastService.initialize();
      console.log('ℹ️  Broadcast service enabled but not implemented yet');
    }
  }

  initializeMiddleware() {
    if (!this.app) return;

    // Enhanced security headers
    if (features.isInputValidationEnabled()) {
      this.app.use(securityHeaders);
      this.app.use(sanitizeInput);
    }

    // Security audit logging
    if (features.isAuditLoggingEnabled()) {
      this.app.use(auditLogger);
    }

    // CORS with stricter origin control
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS?.split(',') || false,
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // API Key validation (skip for webhooks, health checks, and admin panel)
    this.app.use((req, res, next) => {
      const skipPaths = ['/health', '/api/webhooks', '/admin'];
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }
      validateApiKey(req, res, next);
    });

    // Enhanced rate limiting based on endpoint type
    if (features.isRateLimitingEnabled()) {
      this.app.use('/api/auth', ...applyRateLimit('auth'));
      this.app.use('/api/appointments', ...applyRateLimit('booking'));
      this.app.use('/api/', ...applyRateLimit('api'));
    }

    // Body parsing with size limits
    this.app.use(express.json({ 
      limit: process.env.API_REQUEST_SIZE_LIMIT || '1mb',
      verify: (req, res, buf, encoding) => {
        // Store raw body for webhook validation if needed
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: process.env.API_REQUEST_SIZE_LIMIT || '1mb' 
    }));

    // Enhanced request logging with security context
    this.app.use((req, res, next) => {
      const logData = {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        hasApiKey: !!req.headers['x-api-key'],
        contentType: req.get('Content-Type')
      };

      logger.info(`${req.method} ${req.path}`, logData);
      next();
    });

    console.log('✅ Middleware initialized with feature toggles');
  }

  async initializeRoutes() {
    if (!this.app) return;

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Appointment Scheduler API',
        version: '1.0.0',
        description: 'Complete appointment scheduling and management system',
        endpoints: this.getAvailableEndpoints(),
        features: {
          enabled: featureManager.getEnabledFeatures(),
          preset: process.env.FEATURE_PRESET || 'basic'
        },
        documentation: 'See README.md for detailed API documentation'
      });
    });

    // API routes - conditionally loaded based on features
    if (features.isAuthEnabled()) {
      this.app.use('/api/auth', authRoutes);
    }
    if (features.areAppointmentsEnabled()) {
      this.app.use('/api/appointments', appointmentRoutes);
    }
    if (features.isAvailabilityEnabled()) {
      this.app.use('/api/availability', availabilityRoutes);
    }
    this.app.use('/api/services', serviceRoutes);
    this.app.use('/api/users', userRoutes);
    if (features.isWaitlistEnabled()) {
      this.app.use('/api/waitlist', waitlistRoutes);
    }
    this.app.use('/api/notifications', notificationRoutes);
    if (features.isDataRetentionEnabled() && dataRetentionRoutes) {
      this.app.use('/api/retention', dataRetentionRoutes);
    }

    // Payment webhook (no auth required for MoneroPay callbacks)
    this.app.use('/api/payments', paymentRoutes);
    
    // Optional features
    if (features.isBroadcastSystemEnabled()) {
      // this.app.use("/api/broadcast", broadcastRoutes);
      console.log('ℹ️  Broadcast routes would be enabled here');
    }

    console.log('✅ Routes initialized with feature toggles');
  }

  getAvailableEndpoints() {
    const endpoints = {};
    
    if (features.isAuthEnabled()) endpoints.auth = '/api/auth';
    if (features.areAppointmentsEnabled()) endpoints.appointments = '/api/appointments';
    if (features.isAvailabilityEnabled()) endpoints.availability = '/api/availability';
    endpoints.services = '/api/services';
    endpoints.users = '/api/users';
    if (features.isWaitlistEnabled()) endpoints.waitlist = '/api/waitlist';
    endpoints.notifications = '/api/notifications';
    if (features.isDataRetentionEnabled()) endpoints.dataRetention = '/api/retention';
    if (features.isBroadcastSystemEnabled()) endpoints.broadcast = '/api/broadcast';
    
    return endpoints;
  }

  initializeErrorHandling() {
    if (!this.app) return;
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        method: req.method,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('Error:', err);
      
      // Set default error status and message
      const status = err.status || 500;
      const message = err.message || 'Internal Server Error';
      
      // Log error
      if (logger && logger.error) {
        logger.error(`Error ${status}: ${message}`, {
          error: err.stack,
          method: req.method,
          url: req.url,
          ip: req.ip
        });
      }
      
      // Send error response
      res.status(status).json({
        error: message,
        status: status,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });

    console.log('✅ Error handling initialized');
  }

  getFeatureStatusDisplay() {
    const enabledFeatures = featureManager.getEnabledFeatures();
    const lines = [];
    
    // Group features by category for better display
    const categories = {
      'Core': ['core.telegram_bot', 'core.api_server', 'core.database', 'core.authentication'],
      'Scheduling': ['scheduling.appointments', 'scheduling.availability', 'scheduling.waitlist'],
      'Communications': ['communications.email_notifications', 'communications.sms_notifications', 'communications.telegram_notifications'],
      'Admin': ['admin.admin_panel', 'admin.admin_security', 'admin.user_management'],
      'Support': ['support.live_chat', 'support.ticket_system'],
      'Security': ['security.rate_limiting', 'security.input_validation', 'security.audit_logging']
    };
    
    for (const [category, features] of Object.entries(categories)) {
      const categoryFeatures = features.filter(f => enabledFeatures.includes(f));
      if (categoryFeatures.length > 0) {
        lines.push(`  ✅ ${category}: ${categoryFeatures.map(f => f.split('.')[1]).join(', ')}`);
      }
    }
    
    return lines.join('\\n');
  }

  async start() {
    // Wait for initialization to complete
    if (!this.initialized) {
      console.log('⏳ Waiting for initialization to complete...');
      await this.initPromise;
    }
    
    // Don't start HTTP server if API is disabled
    if (!features.isApiServerEnabled()) {
      console.log(`
🤖 Lodge Scheduler - Bot Only Mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️  API Server: DISABLED
🎯 Mode: Telegram Bot Only
⚙️  Features: ${featureManager.getEnabledFeatures().length} enabled
📅 Started: ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use 'npm run start:bot' to start the Telegram bot separately.
      `);
      return;
    }

    // Initialize data retention service if enabled
    if (features.isDataRetentionEnabled() && DataRetentionService) {
      try {
        const dataRetentionService = new DataRetentionService();
        await dataRetentionService.initialize();
      } catch (error) {
        console.warn('⚠️  Failed to initialize data retention service:', error.message);
      }
    }
    
    this.app.listen(this.port, () => {
      console.log(`
🚀 Appointment Scheduler API Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server:        http://localhost:${this.port}
📚 API Docs:      http://localhost:${this.port}/api
🔍 Health Check:  http://localhost:${this.port}/health
🏥 Environment:   ${process.env.NODE_ENV || 'development'}
⏰ Started:       ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Available Endpoints:
  POST   /api/auth/login
  POST   /api/auth/register
  GET    /api/appointments
  POST   /api/appointments
  PUT    /api/appointments/:uuid
  DELETE /api/appointments/:uuid
  GET    /api/availability/:providerId/:date
  GET    /api/services
  GET    /api/waitlist
  POST   /api/waitlist
  
🎯 Features Enabled (${featureManager.getEnabledFeatures().length}):
${this.getFeatureStatusDisplay()}

Ready to handle appointments! 🗓️
      `);
      
      logger.info('Appointment Scheduler API started', {
        port: this.port,
        environment: process.env.NODE_ENV || 'development',
        preset: process.env.FEATURE_PRESET || 'basic',
        features_enabled: featureManager.getEnabledFeatures().length,
        timestamp: new Date().toISOString()
      });
    });
  }

  gracefulShutdown() {
    console.log('\\nShutting down gracefully...');
    
    // Close database connections
    if (Model.knex()) {
      Model.knex().destroy();
      console.log('Database connections closed');
    }
    
    process.exit(0);
  }
}

// Handle graceful shutdown and errors
process.on('SIGTERM', () => app?.gracefulShutdown());
process.on('SIGINT', () => app?.gracefulShutdown());
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack);
  console.error('Full error details:', {
    message: reason?.message,
    name: reason?.name,
    code: reason?.code,
    stack: reason?.stack
  });
});
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  console.error('Full error details:', {
    message: error.message,
    name: error.name,
    code: error.code,
    stack: error.stack
  });
  process.exit(1);
});

// Create and start the application
let app;

async function main() {
  try {
    app = new AppointmentSchedulerApp();

    // Wait for initialization before starting
    console.log('⏳ Initializing application...');
    await app.initPromise;
    console.log('✅ Initialization complete');

    // Start the server
    await app.start();
  } catch (error) {
    console.error('❌ FATAL: Application failed to start');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Only start the server if this file is run directly
if (require.main === module) {
  main();
}

module.exports = { AppointmentSchedulerApp };