const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Model } = require('objection');
const Knex = require('knex');
require('dotenv').config();

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

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Import services
const NotificationService = require('./services/NotificationService');

class AppointmentSchedulerApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.initializeDatabase();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize database connection
   */
  initializeDatabase() {
    const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
    const knex = Knex(knexConfig);
    
    // Give Objection.js the knex instance
    Model.knex(knex);
    
    console.log('Database initialized');
  }

  /**
   * Initialize middleware
   */
  initializeMiddleware() {
    // Enhanced security headers
    this.app.use(securityHeaders);

    // Security audit logging
    this.app.use(auditLogger);

    // Input sanitization
    this.app.use(sanitizeInput);

    // CORS with stricter origin control
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS?.split(',') || false,
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // API Key validation (skip for webhooks and health checks)
    this.app.use((req, res, next) => {
      const skipPaths = ['/health', '/api/webhooks'];
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }
      validateApiKey(req, res, next);
    });

    // Enhanced rate limiting based on endpoint type
    this.app.use('/api/auth', ...applyRateLimit('auth'));
    this.app.use('/api/appointments', ...applyRateLimit('booking'));
    this.app.use('/api/', ...applyRateLimit('api'));

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

    console.log('Enhanced security middleware initialized');
  }

  /**
   * Initialize API routes
   */
  initializeRoutes() {
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
        endpoints: {
          auth: '/api/auth',
          appointments: '/api/appointments',
          availability: '/api/availability',
          services: '/api/services',
          users: '/api/users',
          waitlist: '/api/waitlist',
          notifications: '/api/notifications'
        },
        documentation: 'See README.md for detailed API documentation'
      });
    });

    // API routes - auth middleware is applied in individual route files
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/appointments', appointmentRoutes);
    this.app.use('/api/availability', availabilityRoutes);
    this.app.use('/api/services', serviceRoutes);
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/waitlist', waitlistRoutes);
    this.app.use('/api/notifications', notificationRoutes);

    console.log('Routes initialized');
  }

  /**
   * Initialize error handling
   */
  initializeErrorHandling() {
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

    console.log('Error handling initialized');
  }

  /**
   * Start the server
   */
  start() {
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
  
🎯 Features Enabled:
  ✅ Availability checking & conflict resolution
  ✅ Booking confirmation & cancellation logic
  ✅ Client notifications (Email & SMS)
  ✅ Appointment modification & rescheduling
  ✅ Waitlist & overbooking management
  ✅ Timezone handling & date validation
  ✅ Comprehensive logging & monitoring

Ready to handle appointments! 🗓️
      `);
      
      logger.info('Appointment Scheduler API started', {
        port: this.port,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Graceful shutdown
   */
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

// Handle graceful shutdown
process.on('SIGTERM', () => app.gracefulShutdown());
process.on('SIGINT', () => app.gracefulShutdown());

// Create and start the application
const app = new AppointmentSchedulerApp();

// Only start the server if this file is run directly
if (require.main === module) {
  app.start();
}

module.exports = app;