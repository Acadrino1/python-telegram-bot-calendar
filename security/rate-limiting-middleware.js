const rateLimit = require('express-rate-limit');
// const { RedisStore } = require('rate-limit-redis'); // Optional Redis store disabled for core functionality
// const { createClient } = require('redis');

/**
 * Enhanced Rate Limiting Middleware
 * Provides comprehensive protection against abuse and DDoS attacks
 */

// Redis disabled for core functionality - using in-memory store only
// Initialize Redis client for distributed rate limiting (optional)
let redisClient = null;
let redisAvailable = false;

// Redis initialization disabled for core functionality
// async function initializeRedis() {
//   if (process.env.REDIS_HOST) {
//     try {
//       redisClient = createClient({
//         socket: {
//           host: process.env.REDIS_HOST,
//           port: process.env.REDIS_PORT || 6379
//         },
//         password: process.env.REDIS_PASSWORD || undefined
//       });
//       
//       redisClient.on('error', (err) => {
//         console.error('Redis rate limiting error:', err);
//         redisAvailable = false;
//       });
//       
//       redisClient.on('connect', () => {
//         console.log('Redis connected for rate limiting');
//         redisAvailable = true;
//       });
//       
//       // Connect to Redis client
//       await redisClient.connect();
//       redisAvailable = true;
//     } catch (error) {
//       console.warn('Redis not available for rate limiting, using memory store:', error.message);
//       redisClient = null;
//       redisAvailable = false;
//     }
//   }
// }

// Redis initialization disabled for core functionality
// initializeRedis();

// General API rate limiting
const generalApiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Updated from 'max' to 'limit'
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis store disabled for core functionality
  // store: (redisClient && redisAvailable) ? new RedisStore({
  //   client: redisClient,
  // }) : undefined,
  keyGenerator: (req) => {
    // Use IP + user ID if authenticated, otherwise just IP
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || 'anonymous';
    return `rate_limit:general:${ip}:${userId}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP address',
      retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000)
    });
  }
});

// Strict rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Updated from 'max' to 'limit', increased from 5 to 10 for development
  message: {
    error: 'Too many authentication attempts from this IP',
    retryAfter: 900 // 15 minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis store disabled for core functionality
  // store: (redisClient && redisAvailable) ? new RedisStore({
  //   client: redisClient,
  // }) : undefined,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    return `rate_limit:auth:${ip}`;
  },
  handler: (req, res) => {
    console.warn(`Authentication rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Authentication rate limit exceeded',
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: 900
    });
  }
});

// Booking endpoint rate limiting
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10, // Updated from 'max' to 'limit'
  message: {
    error: 'Booking rate limit exceeded',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis store disabled for core functionality
  // store: (redisClient && redisAvailable) ? new RedisStore({
  //   client: redisClient,
  // }) : undefined,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || 'anonymous';
    return `rate_limit:booking:${ip}:${userId}`;
  },
  handler: (req, res) => {
    console.warn(`Booking rate limit exceeded for IP: ${req.ip}, User: ${req.user?.id}`);
    res.status(429).json({
      error: 'Booking rate limit exceeded',
      message: 'You have exceeded the maximum number of bookings per hour. Please try again later.',
      retryAfter: 3600
    });
  }
});

// Telegram webhook rate limiting
const telegramWebhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 30, // Updated from 'max' to 'limit'
  message: {
    error: 'Webhook rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis store disabled for core functionality
  // store: (redisClient && redisAvailable) ? new RedisStore({
  //   client: redisClient,
  // }) : undefined,
  keyGenerator: (req) => {
    // Use Telegram's IP or the webhook path
    const ip = req.ip || req.connection.remoteAddress;
    return `rate_limit:telegram:${ip}`;
  },
  handler: (req, res) => {
    console.warn(`Telegram webhook rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Webhook rate limit exceeded'
    });
  }
});

// API key rate limiting (for authenticated API access)
const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Updated from 'max' to 'limit'
  message: {
    error: 'API rate limit exceeded',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis store disabled for core functionality
  // store: (redisClient && redisAvailable) ? new RedisStore({
  //   client: redisClient,
  // }) : undefined,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] || 'no-key';
    const ip = req.ip || req.connection.remoteAddress;
    return `rate_limit:api:${apiKey}:${ip}`;
  },
  handler: (req, res) => {
    console.warn(`API rate limit exceeded for API key: ${req.headers['x-api-key']}, IP: ${req.ip}`);
    res.status(429).json({
      error: 'API rate limit exceeded',
      message: 'Your API key has exceeded the rate limit',
      retryAfter: 900
    });
  }
});

// Progressive rate limiting based on request count
const createProgressiveLimiter = (baseLimit, multiplier = 0.5) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: (req) => {
      // Progressive limiting: reduce allowed requests based on recent activity
      const recentRequests = req.rateLimit?.current || 0;
      const adjustedLimit = Math.max(1, Math.floor(baseLimit * (1 - recentRequests * multiplier / baseLimit)));
      return adjustedLimit;
    },
    // Redis store disabled for core functionality
    // store: redisClient ? new RedisStore({
    //   sendCommand: (...args) => redisClient.call(...args),
    // }) : undefined,
    keyGenerator: (req) => {
      const ip = req.ip || req.connection.remoteAddress;
      const userId = req.user?.id || 'anonymous';
      return `rate_limit:progressive:${ip}:${userId}`;
    }
  });
};

// IP-based blocking for suspicious activity
const suspiciousActivityTracker = new Map();

const trackSuspiciousActivity = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // Initialize tracking for this IP if not exists
  if (!suspiciousActivityTracker.has(ip)) {
    suspiciousActivityTracker.set(ip, {
      requests: [],
      blocked: false,
      blockUntil: 0
    });
  }
  
  const tracking = suspiciousActivityTracker.get(ip);
  
  // Check if IP is currently blocked
  if (tracking.blocked && now < tracking.blockUntil) {
    return res.status(429).json({
      error: 'IP temporarily blocked due to suspicious activity',
      retryAfter: Math.ceil((tracking.blockUntil - now) / 1000)
    });
  } else if (tracking.blocked && now >= tracking.blockUntil) {
    // Reset tracking after block expires
    tracking.blocked = false;
    tracking.requests = [];
  }
  
  // Track this request
  tracking.requests.push(now);
  
  // Remove requests older than 5 minutes
  tracking.requests = tracking.requests.filter(time => now - time < 5 * 60 * 1000);
  
  // Check for suspicious patterns
  if (tracking.requests.length > 200) { // More than 200 requests in 5 minutes
    tracking.blocked = true;
    tracking.blockUntil = now + (30 * 60 * 1000); // Block for 30 minutes
    
    console.warn(`IP ${ip} blocked for suspicious activity: ${tracking.requests.length} requests in 5 minutes`);
    
    return res.status(429).json({
      error: 'IP blocked due to suspicious activity',
      retryAfter: 1800
    });
  }
  
  next();
};

// Cleanup function to remove old tracking data
setInterval(() => {
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  
  for (const [ip, tracking] of suspiciousActivityTracker.entries()) {
    // Remove old requests
    tracking.requests = tracking.requests.filter(time => time > fiveMinutesAgo);
    
    // Remove tracking for IPs with no recent activity and not blocked
    if (tracking.requests.length === 0 && (!tracking.blocked || now > tracking.blockUntil)) {
      suspiciousActivityTracker.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes

module.exports = {
  generalApiLimiter,
  authLimiter,
  bookingLimiter,
  telegramWebhookLimiter,
  apiKeyLimiter,
  createProgressiveLimiter,
  trackSuspiciousActivity,
  
  // Apply appropriate limiter based on endpoint
  applyRateLimit: (type) => {
    switch (type) {
      case 'auth':
        return [trackSuspiciousActivity, authLimiter];
      case 'booking':
        return [trackSuspiciousActivity, bookingLimiter];
      case 'telegram':
        return [telegramWebhookLimiter];
      case 'api':
        return [trackSuspiciousActivity, apiKeyLimiter];
      case 'progressive':
        return [trackSuspiciousActivity, createProgressiveLimiter(50)];
      default:
        return [trackSuspiciousActivity, generalApiLimiter];
    }
  }
};