const logger = require('../utils/logger');

/**
 * Global error handler middleware
 * Handles all unhandled errors and sends appropriate responses
 */
const errorHandler = (error, req, res, next) => {
  // Log the error
  logger.logError(error, {
    method: req.method,
    path: req.path,
    params: req.params,
    query: req.query,
    body: req.body,
    userId: req.userId,
    userRole: req.user?.role,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Default error response
  let statusCode = 500;
  let errorResponse = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  };

  // Handle specific error types
  if (error.name === 'ValidationError') {
    // Objection.js validation errors
    statusCode = 400;
    errorResponse = {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: error.data || error.message,
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'NotFoundError') {
    // Objection.js not found errors
    statusCode = 404;
    errorResponse = {
      error: 'Resource not found',
      code: 'NOT_FOUND',
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'UniqueViolationError') {
    // Database unique constraint violations
    statusCode = 409;
    errorResponse = {
      error: 'Resource already exists',
      code: 'DUPLICATE_RESOURCE',
      details: error.constraint || 'Unique constraint violation',
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'ForeignKeyViolationError') {
    // Database foreign key constraint violations
    statusCode = 400;
    errorResponse = {
      error: 'Invalid reference',
      code: 'INVALID_REFERENCE',
      details: error.constraint || 'Foreign key constraint violation',
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'NotNullViolationError') {
    // Database not null constraint violations
    statusCode = 400;
    errorResponse = {
      error: 'Missing required field',
      code: 'MISSING_REQUIRED_FIELD',
      details: error.column || 'Required field is missing',
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'DataError') {
    // Database data type errors
    statusCode = 400;
    errorResponse = {
      error: 'Invalid data format',
      code: 'INVALID_DATA_FORMAT',
      details: error.message,
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'JsonWebTokenError') {
    // JWT errors
    statusCode = 401;
    errorResponse = {
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
      timestamp: new Date().toISOString()
    };
  } else if (error.name === 'TokenExpiredError') {
    // JWT expiration errors
    statusCode = 401;
    errorResponse = {
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
      timestamp: new Date().toISOString()
    };
  } else if (error.message && error.message.includes('ECONNREFUSED')) {
    // Database connection errors
    statusCode = 503;
    errorResponse = {
      error: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database connection failed',
      timestamp: new Date().toISOString()
    };
  } else if (error.status || error.statusCode) {
    // Errors with explicit status codes
    statusCode = error.status || error.statusCode;
    errorResponse = {
      error: error.message || 'Request failed',
      code: error.code || 'REQUEST_FAILED',
      details: error.details,
      timestamp: new Date().toISOString()
    };
  }

  // Add request ID if available
  if (req.id) {
    errorResponse.request_id = req.id;
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass them to error handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not found middleware
 * Handles requests to non-existent endpoints
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.method} ${req.originalUrl} not found`);
  error.status = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
};

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error types
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ServiceUnavailableError
};