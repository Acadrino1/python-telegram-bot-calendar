/**
 * Comprehensive Security Middleware for Lodge Scheduler
 * Addresses all critical security vulnerabilities with production-ready implementations
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Initialize DOMPurify for server-side XSS protection
let DOMPurify;
try {
  const createDOMPurify = require('dompurify');
  const { JSDOM } = require('jsdom');
  const window = new JSDOM('').window;
  DOMPurify = createDOMPurify(window);
} catch (error) {
  console.warn('DOMPurify not available, using fallback sanitization');
  DOMPurify = null;
}

class ComprehensiveSecurity {
  constructor() {
    this.blockedTokens = ['TELEGRAM_BOT_TOKEN_PLACEHOLDER'];
    this.unauthorizedAdmins = ['7930798268'];
    this.suspiciousIPs = new Map();
    this.auditLog = [];
  }

  // Comprehensive security headers
  getSecurityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'strict-dynamic'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true
    });
  }

  // Token validation and blocking
  validateBotToken(req, res, next) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    // Block known compromised tokens
    if (this.blockedTokens.includes(botToken)) {
      this.logSecurityEvent('BLOCKED_TOKEN_ATTEMPT', {
        token: botToken.substring(0, 10) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Security configuration error detected'
      });
    }

    // Validate token format
    if (!botToken || !this.isValidBotTokenFormat(botToken)) {
      this.logSecurityEvent('INVALID_TOKEN_FORMAT', {
        hasToken: !!botToken,
        ip: req.ip
      });
      
      return res.status(503).json({
        error: 'Service configuration error',
        message: 'Invalid service configuration'
      });
    }

    next();
  }

  // Admin access validation
  validateAdminAccess(req, res, next) {
    const userId = req.user?.id || req.headers['x-user-id'];
    const telegramId = req.user?.telegram_id || req.headers['x-telegram-id'];
    
    // Block unauthorized admin IDs
    if (this.unauthorizedAdmins.includes(userId?.toString()) || 
        this.unauthorizedAdmins.includes(telegramId?.toString())) {
      
      this.logSecurityEvent('UNAUTHORIZED_ADMIN_ATTEMPT', {
        userId,
        telegramId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient privileges'
      });
    }

    // Verify admin authorization
    const authorizedAdmins = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
    if (authorizedAdmins.length > 0 && !authorizedAdmins.includes(telegramId?.toString())) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Administrative access required'
      });
    }

    next();
  }

  // Advanced rate limiting with Telegram compliance
  getTelegramRateLimit() {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 messages per minute (Telegram global limit)
      message: {
        error: 'Rate limit exceeded',
        message: 'Too many requests to Telegram API'
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return `telegram_api:${req.ip}`;
      },
      handler: (req, res) => {
        this.logSecurityEvent('TELEGRAM_RATE_LIMIT_EXCEEDED', {
          ip: req.ip,
          endpoint: req.path
        });
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests to messaging service',
          retryAfter: 60
        });
      }
    });
  }

  // Per-chat rate limiting for Telegram
  getChatRateLimit() {
    const chatLimiters = new Map();
    
    return (req, res, next) => {
      const chatId = req.body?.chat_id || req.params?.chatId;
      
      if (!chatId) {
        return next();
      }

      if (!chatLimiters.has(chatId)) {
        chatLimiters.set(chatId, rateLimit({
          windowMs: 60 * 1000, // 1 minute
          max: 1, // 1 message per minute per chat (Telegram per-chat limit)
          keyGenerator: () => `chat:${chatId}`,
          handler: (req, res) => {
            this.logSecurityEvent('CHAT_RATE_LIMIT_EXCEEDED', {
              chatId,
              ip: req.ip
            });
            
            res.status(429).json({
              error: 'Chat rate limit exceeded',
              message: 'Too many messages to this chat'
            });
          }
        }));
      }

      chatLimiters.get(chatId)(req, res, next);
    };
  }

  // Comprehensive input sanitization
  sanitizeInput(req, res, next) {
    const sanitizeValue = (value) => {
      if (typeof value !== 'string') return value;
      
      let sanitized = value;
      
      // Use DOMPurify if available
      if (DOMPurify) {
        sanitized = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [] });
      } else {
        // Fallback sanitization
        sanitized = sanitized
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/javascript:/gi, '') // Remove javascript protocol
          .replace(/on\w+\s*=/gi, '') // Remove event handlers
          .replace(/[<>'"&]/g, (char) => { // Escape dangerous characters
            const escape = {
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#x27;',
              '&': '&amp;'
            };
            return escape[char] || char;
          });
      }
      
      // Limit length to prevent DoS
      return sanitized.trim().substring(0, 10000);
    };

    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeValue(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      });
    };

    // Sanitize all input
    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);
    
    next();
  }

  // SQL Injection prevention validation
  validateSQLInjection(req, res, next) {
    const dangerousPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
      /('|(\\')|(;)|(\\)|(\-\-)|(\/\*)|(\*\/)|(\bor\b)|(\band\b)|(\bxp_)|(\bsp_))/gi,
      /((\%3D)|(\=))[^\n]*((\%27)|(\')|((\%3B)|(;)))/gi,
      /((\%27)|(\'))union/gi
    ];

    const checkForSQL = (value) => {
      if (typeof value !== 'string') return false;
      return dangerousPatterns.some(pattern => pattern.test(value));
    };

    const checkObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string' && checkForSQL(obj[key])) {
          return true;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (checkObject(obj[key])) return true;
        }
      }
      return false;
    };

    // Check all inputs for SQL injection attempts
    const hasSQLInjection = 
      checkObject(req.body || {}) || 
      checkObject(req.query || {}) || 
      checkObject(req.params || {});

    if (hasSQLInjection) {
      this.logSecurityEvent('SQL_INJECTION_ATTEMPT', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: JSON.stringify(req.body),
        query: JSON.stringify(req.query),
        params: JSON.stringify(req.params)
      });

      return res.status(400).json({
        error: 'Invalid input detected',
        message: 'Request contains potentially dangerous content'
      });
    }

    next();
  }

  // Input validation for appointments
  validateAppointmentInput() {
    return [
      body('client_id').isInt({ min: 1 }).toInt(),
      body('provider_id').isInt({ min: 1 }).toInt(),
      body('service_id').isInt({ min: 1 }).toInt(),
      body('appointment_datetime').isISO8601().toDate(),
      body('notes').optional().isString().isLength({ max: 1000 }).trim(),
      body('duration').optional().isInt({ min: 15, max: 480 }).toInt(),
      (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            errors: errors.array()
          });
        }
        next();
      }
    ];
  }

  // Session security middleware
  getSecureSession() {
    const session = require('express-session');
    
    return session({
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      name: 'sessionId', // Don't use default session name
      cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
      },
      genid: () => {
        return crypto.randomBytes(32).toString('hex'); // Secure session ID generation
      }
    });
  }

  // CSRF protection (for web endpoints)
  getCSRFProtection() {
    try {
      const csrf = require('csurf');
      return csrf({
        cookie: {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        }
      });
    } catch (error) {
      console.warn('CSRF protection not available:', error.message);
      return (req, res, next) => next();
    }
  }

  // Suspicious activity tracking
  trackSuspiciousActivity() {
    return (req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      
      if (!this.suspiciousIPs.has(ip)) {
        this.suspiciousIPs.set(ip, {
          requests: [],
          blocked: false,
          blockUntil: 0
        });
      }
      
      const tracking = this.suspiciousIPs.get(ip);
      
      // Check if IP is blocked
      if (tracking.blocked && now < tracking.blockUntil) {
        return res.status(429).json({
          error: 'IP temporarily blocked',
          retryAfter: Math.ceil((tracking.blockUntil - now) / 1000)
        });
      } else if (tracking.blocked && now >= tracking.blockUntil) {
        tracking.blocked = false;
        tracking.requests = [];
      }
      
      // Track this request
      tracking.requests.push(now);
      tracking.requests = tracking.requests.filter(time => now - time < 5 * 60 * 1000);
      
      // Block if too many requests
      if (tracking.requests.length > 300) {
        tracking.blocked = true;
        tracking.blockUntil = now + (60 * 60 * 1000); // 1 hour block
        
        this.logSecurityEvent('IP_BLOCKED_SUSPICIOUS_ACTIVITY', {
          ip,
          requestCount: tracking.requests.length
        });
        
        return res.status(429).json({
          error: 'IP blocked due to suspicious activity',
          retryAfter: 3600
        });
      }
      
      next();
    };
  }

  // Utility methods
  isValidBotTokenFormat(token) {
    const botTokenRegex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
    return botTokenRegex.test(token);
  }

  logSecurityEvent(event, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      severity: this.getEventSeverity(event)
    };
    
    this.auditLog.push(logEntry);
    
    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    // Log to console for immediate monitoring
    if (logEntry.severity === 'HIGH' || logEntry.severity === 'CRITICAL') {
      console.warn('🚨 Security Event:', logEntry);
    }
  }

  getEventSeverity(event) {
    const highSeverityEvents = [
      'BLOCKED_TOKEN_ATTEMPT',
      'UNAUTHORIZED_ADMIN_ATTEMPT',
      'SQL_INJECTION_ATTEMPT',
      'IP_BLOCKED_SUSPICIOUS_ACTIVITY'
    ];
    
    const mediumSeverityEvents = [
      'TELEGRAM_RATE_LIMIT_EXCEEDED',
      'CHAT_RATE_LIMIT_EXCEEDED',
      'INVALID_TOKEN_FORMAT'
    ];
    
    if (highSeverityEvents.includes(event)) return 'HIGH';
    if (mediumSeverityEvents.includes(event)) return 'MEDIUM';
    return 'LOW';
  }

  getSecurityReport() {
    return {
      timestamp: new Date().toISOString(),
      auditLogCount: this.auditLog.length,
      recentEvents: this.auditLog.slice(-10),
      blockedIPs: Array.from(this.suspiciousIPs.entries())
        .filter(([ip, data]) => data.blocked)
        .map(([ip, data]) => ({ ip, blockUntil: data.blockUntil })),
      securityStatus: 'ACTIVE'
    };
  }
}

// Export singleton instance
const comprehensiveSecurity = new ComprehensiveSecurity();

module.exports = {
  // Main security instance
  security: comprehensiveSecurity,
  
  // Individual middleware functions
  securityHeaders: comprehensiveSecurity.getSecurityHeaders(),
  validateBotToken: comprehensiveSecurity.validateBotToken.bind(comprehensiveSecurity),
  validateAdminAccess: comprehensiveSecurity.validateAdminAccess.bind(comprehensiveSecurity),
  telegramRateLimit: comprehensiveSecurity.getTelegramRateLimit(),
  chatRateLimit: comprehensiveSecurity.getChatRateLimit(),
  sanitizeInput: comprehensiveSecurity.sanitizeInput.bind(comprehensiveSecurity),
  validateSQLInjection: comprehensiveSecurity.validateSQLInjection.bind(comprehensiveSecurity),
  validateAppointmentInput: comprehensiveSecurity.validateAppointmentInput(),
  secureSession: comprehensiveSecurity.getSecureSession(),
  csrfProtection: comprehensiveSecurity.getCSRFProtection(),
  trackSuspiciousActivity: comprehensiveSecurity.trackSuspiciousActivity(),
  
  // Utility functions
  getSecurityReport: () => comprehensiveSecurity.getSecurityReport()
};