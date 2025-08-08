const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const SecurityPatches = require('../../security/security-patches');

/**
 * Security Middleware Configuration
 * Implements comprehensive security measures for the appointment scheduler
 */

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// API Key validation middleware
const validateApiKey = async (req, res, next) => {
  // Skip API key validation for certain endpoints
  const skipPaths = ['/health', '/webhook/telegram'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey && process.env.API_KEY_REQUIRED === 'true') {
    return res.status(401).json({
      error: 'API key required',
      message: 'This endpoint requires a valid API key'
    });
  }

  if (apiKey) {
    // In production, verify against stored hash
    const validApiKey = process.env.API_KEY;
    if (apiKey !== validApiKey) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }
  }

  next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  next();
};

const sanitizeObject = (obj) => {
  const sanitized = {};
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      sanitized[key] = SecurityPatches.sanitizeInput(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
};

// Admin authorization middleware
const requireAdmin = async (req, res, next) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  
  if (!userId) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'This endpoint requires authentication'
    });
  }

  const authorizedAdmins = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim())
    : [];

  if (!SecurityPatches.isAuthorizedAdmin(userId, authorizedAdmins)) {
    console.warn(`Unauthorized admin access attempt by user ID: ${userId}`);
    return res.status(403).json({
      error: 'Access denied',
      message: 'Insufficient privileges for this operation'
    });
  }

  next();
};

// Bot token validation middleware
const validateBotToken = (req, res, next) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!SecurityPatches.validateBotToken(botToken)) {
    console.error('CRITICAL: Invalid or compromised bot token detected!');
    return res.status(500).json({
      error: 'Configuration error',
      message: 'Invalid bot configuration detected'
    });
  }
  
  next();
};

// CSRF protection middleware
const csrfProtection = (req, res, next) => {
  if (process.env.CSRF_PROTECTION_ENABLED !== 'true') {
    return next();
  }

  // Skip CSRF for GET requests and webhook endpoints
  if (req.method === 'GET' || req.path.startsWith('/webhook/')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || token !== sessionToken) {
    return res.status(403).json({
      error: 'CSRF token mismatch',
      message: 'Invalid or missing CSRF token'
    });
  }

  next();
};

// Security audit logging
const auditLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = SecurityPatches.createSecurityAuditLog('api_request', {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      user_id: req.user?.id
    });
    
    // Log suspicious activities
    if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
      console.warn('Security event:', log);
    }
  });
  
  next();
};

module.exports = {
  securityHeaders,
  validateApiKey,
  sanitizeInput,
  requireAdmin,
  validateBotToken,
  csrfProtection,
  auditLogger,
  SecurityPatches
};