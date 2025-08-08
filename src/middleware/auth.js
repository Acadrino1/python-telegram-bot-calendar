const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7, authHeader.length).trimLeft()
      : authHeader;

    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.query().findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Access denied. User not found.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Access denied. Account is inactive.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;
    
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Access denied. Invalid token.',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Access denied. Token expired.',
        code: 'TOKEN_EXPIRED'
      });
    }

    logger.logError(error, { middleware: 'auth', userId: req.userId });
    
    res.status(500).json({ 
      error: 'Internal server error during authentication.',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {string|array} roles - Required role(s)
 */
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
        required_roles: requiredRoles,
        user_role: req.user.role
      });
    }

    next();
  };
};

/**
 * Provider-only middleware
 */
const providerOnly = authorize('provider');

/**
 * Client-only middleware
 */
const clientOnly = authorize('client');

/**
 * Admin-only middleware
 */
const adminOnly = authorize('admin');

/**
 * Provider or admin middleware
 */
const providerOrAdmin = authorize(['provider', 'admin']);

/**
 * Optional auth middleware - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (authHeader) {
      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7, authHeader.length).trimLeft()
        : authHeader;

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.query().findById(decoded.userId);
        
        if (user && user.is_active) {
          req.user = user;
          req.userId = user.id;
        }
      }
    }

    next();

  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

/**
 * Resource ownership middleware
 * Checks if user owns the resource or is admin
 */
const checkResourceOwnership = (getUserIdFromResource) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required.',
          code: 'AUTH_REQUIRED'
        });
      }

      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }

      // Get user ID from the resource
      const resourceUserId = await getUserIdFromResource(req);
      
      if (!resourceUserId) {
        return res.status(404).json({ 
          error: 'Resource not found.',
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // Check if user owns the resource
      if (req.user.id !== resourceUserId) {
        return res.status(403).json({ 
          error: 'Access denied. You can only access your own resources.',
          code: 'RESOURCE_ACCESS_DENIED'
        });
      }

      next();

    } catch (error) {
      logger.logError(error, { middleware: 'checkResourceOwnership', userId: req.userId });
      
      res.status(500).json({ 
        error: 'Internal server error during authorization.',
        code: 'AUTH_ERROR'
      });
    }
  };
};

/**
 * Appointment access middleware
 * Checks if user can access the appointment (client, provider, or admin)
 */
const checkAppointmentAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    const Appointment = require('../models/Appointment');
    const appointmentId = req.params.id || req.params.uuid;
    
    const appointment = await Appointment.query()
      .where('id', appointmentId)
      .orWhere('uuid', appointmentId)
      .first();

    if (!appointment) {
      return res.status(404).json({ 
        error: 'Appointment not found.',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    // Check if user is the client or provider
    if (req.user.id !== appointment.client_id && req.user.id !== appointment.provider_id) {
      return res.status(403).json({ 
        error: 'Access denied. You can only access your own appointments.',
        code: 'APPOINTMENT_ACCESS_DENIED'
      });
    }

    // Attach appointment to request for use in controller
    req.appointment = appointment;
    next();

  } catch (error) {
    logger.logError(error, { middleware: 'checkAppointmentAccess', userId: req.userId });
    
    res.status(500).json({ 
      error: 'Internal server error during authorization.',
      code: 'AUTH_ERROR'
    });
  }
};

module.exports = {
  authMiddleware,
  authorize,
  providerOnly,
  clientOnly,
  adminOnly,
  providerOrAdmin,
  optionalAuth,
  checkResourceOwnership,
  checkAppointmentAccess
};