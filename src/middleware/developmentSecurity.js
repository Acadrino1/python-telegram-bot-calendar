
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { UserRole } = require('../types');
const logger = require('../utils/logger');

class DevelopmentAdminSecurity {
  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // Prune expired entries every 24h
      max: 100, // Reduced memory usage
      ttl: 7200000 // 2 hours TTL for development
    });
    
    this.initializeMiddleware();
  }

  initializeMiddleware() {
    // Lenient rate limiting for development
    this.adminLoginRateLimit = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 20, // More attempts for development
      message: {
        error: 'Too many login attempts. Please try again in 15 minutes.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too many login attempts. Please try again in 15 minutes.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
    });

    this.adminPanelRateLimit = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      limit: 500, // Very generous for development
      message: {
        error: 'Too many requests. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    // Session configuration optimized for development
    this.sessionMiddleware = session({
      name: 'dev.admin.sid',
      secret: process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET,
      store: this.sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: false, // Allow HTTP in development
        httpOnly: true,
        maxAge: 7200000, // 2 hours for development
        sameSite: 'lax' // More permissive for development
      },
      genid: () => {
        return require('crypto').randomBytes(32).toString('hex');
      }
    });
  }

  localhostOnly = (req, res, next) => {
    const allowedIPs = ['127.0.0.1', '::1', 'localhost'];
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
    
    // Normalize IPv6 localhost representation
    const normalizedIP = clientIP.replace('::ffff:', '');
    
    // Very permissive localhost checking for development
    const isLocalhost = allowedIPs.includes(normalizedIP) || 
                       normalizedIP.startsWith('127.') ||
                       normalizedIP === '::1' ||
                       normalizedIP === 'localhost' ||
                       normalizedIP === '0.0.0.0' || // Docker/container scenarios
                       !clientIP || // Missing IP defaults to allowed
                       clientIP === '127.0.0.1';
    
    if (!isLocalhost && process.env.STRICT_LOCALHOST === 'true') {
      logger.warn(`Blocked admin access attempt from IP: ${clientIP} (normalized: ${normalizedIP})`);
      return res.status(403).json({
        error: 'Admin panel access restricted to localhost only',
        code: 'ADMIN_ACCESS_DENIED',
        debug: {
          clientIP,
          normalizedIP,
          allowedIPs
        }
      });
    }
    
    next();
  };

  adminSecurityHeaders = (req, res, next) => {
    // Very permissive CSP for development
    const cspDirectives = {
      defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'", "blob:", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      fontSrc: ["'self'", "data:", "https:", "http:"],
      objectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:", "data:"],
      frameSrc: ["'self'"]
    };

    helmet({
      contentSecurityPolicy: {
        directives: cspDirectives,
        reportOnly: true // Only report, don't enforce in development
      },
      hsts: false, // No HTTPS enforcement in development
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'no-referrer-when-downgrade' }
    })(req, res, next);
  };

  adminAuthenticate = async (req, res, next) => {
    try {
      // Skip authentication for health checks and public endpoints
      const publicPaths = ['/admin/health', '/admin/csp-violations'];
      if (publicPaths.some(path => req.path.includes(path))) {
        return next();
      }

      // Check for admin session first
      if (req.session && req.session.adminUser) {
        req.adminUser = req.session.adminUser;
        return next();
      }

      // Check for JWT token
      const authHeader = req.header('Authorization') || req.headers.authorization;
      if (authHeader) {
        const token = authHeader.startsWith('Bearer ') 
          ? authHeader.slice(7)
          : authHeader;

        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.query().findById(decoded.userId);
            
            if (user && user.is_active && user.role === UserRole.ADMIN) {
              req.adminUser = user;
              return next();
            }
          } catch (tokenError) {
            logger.warn('Token verification failed:', tokenError.message);
          }
        }
      }

      // In development, provide more detailed error information
      return res.status(401).json({
        error: 'Admin authentication required',
        code: 'ADMIN_AUTH_REQUIRED',
        debug: {
          hasSession: !!req.session,
          hasAdminUser: !!(req.session && req.session.adminUser),
          hasAuthHeader: !!authHeader,
          path: req.path
        }
      });

    } catch (error) {
      logger.logError(error, { middleware: 'adminAuthenticate' });
      return res.status(401).json({
        error: 'Invalid admin authentication',
        code: 'ADMIN_AUTH_INVALID',
        debug: error.message
      });
    }
  };

  auditAdminAction = (action) => {
    return async (req, res, next) => {
      try {
        // Simple console logging for development
        res.on('finish', () => {
          if (res.statusCode >= 400) {
            logger.warn('Admin Action Error:', {
              action: action || `${req.method} ${req.path}`,
              adminId: req.adminUser?.id || 'unknown',
              statusCode: res.statusCode,
              path: req.path,
              ip: req.ip
            });
          }
        });

        next();
      } catch (error) {
        logger.logError(error, { middleware: 'auditAdminAction' });
        next();
      }
    };
  };

  getAdminJSAuthenticate() {
    return async (email, password, context) => {
      try {
        // Find admin user by email
        const user = await User.query()
          .where('email', email.toLowerCase())
          .where('role', UserRole.ADMIN)
          .where('is_active', true)
          .first();

        if (!user) {
          logger.warn('Admin login failed - user not found:', email);
          return false;
        }

        // Verify password
        const isValidPassword = await user.verifyPassword(password);
        if (!isValidPassword) {
          logger.warn('Admin login failed - invalid password:', email);
          return false;
        }

        // Create admin session
        if (context?.req?.session) {
          context.req.session.adminUser = {
            id: user.id,
            email: user.email,
            role: user.role,
            permissions: ['admin:all'] // Simplified permissions for development
          };
        }

        logger.info('Admin login successful:', { userId: user.id, email });

        return {
          id: user.id,
          email: user.email,
          role: user.role
        };

      } catch (error) {
        logger.logError(error, { context: 'adminjs_authenticate' });
        return false;
      }
    };
  }

  getAdminMiddleware() {
    return [
      this.localhostOnly,
      this.adminSecurityHeaders,
      this.sessionMiddleware,
      this.adminPanelRateLimit,
      this.adminAuthenticate,
      this.auditAdminAction()
    ];
  }

  getAdminLoginMiddleware() {
    return [
      this.localhostOnly,
      this.adminSecurityHeaders,
      this.adminLoginRateLimit,
      this.sessionMiddleware
    ];
  }
}

module.exports = new DevelopmentAdminSecurity();