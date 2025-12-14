const logger = require('./logger');

class CentralErrorHandler {
  constructor() {
    this.cleanupHandlers = new Set();
    this.intervals = new Set();
    this.timeouts = new Set();
    this.cronJobs = new Set();
    this.isShuttingDown = false;
    
    this.setupGlobalErrorHandlers();
    this.setupGracefulShutdown();
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandlers() {
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit immediately, log and continue
      this.handleUnhandledRejection(reason, promise);
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  /**
   * Handle unhandled promise rejections gracefully
   */
  handleUnhandledRejection(reason, promise) {
    try {
      // Try to extract meaningful error information
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      const errorStack = reason instanceof Error ? reason.stack : null;
      
      logger.error('Unhandled Promise Rejection:', {
        message: errorMessage,
        stack: errorStack,
        promise: promise.toString()
      });

      // Don't crash the process unless it's a critical error
      if (this.isCriticalError(reason)) {
        logger.error('Critical error detected, initiating graceful shutdown');
        this.gracefulShutdown('criticalError');
      }
    } catch (handlerError) {
      console.error('Error in unhandled rejection handler:', handlerError);
    }
  }

  /**
   * Determine if an error is critical enough to warrant shutdown
   */
  isCriticalError(error) {
    if (error instanceof Error) {
      const criticalPatterns = [
        'ENOSPC', // No space left on device
        'EMFILE', // Too many open files
        'Database connection failed',
        'FATAL',
        'Out of memory'
      ];
      
      return criticalPatterns.some(pattern => 
        error.message.includes(pattern) || 
        (error.code && error.code.includes(pattern))
      );
    }
    return false;
  }

  /**
   * Register a cleanup handler
   */
  registerCleanup(handler) {
    if (typeof handler === 'function') {
      this.cleanupHandlers.add(handler);
    }
  }

  /**
   * Register an interval for cleanup
   */
  registerInterval(intervalId) {
    this.intervals.add(intervalId);
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeoutId) {
    this.timeouts.add(timeoutId);
  }

  /**
   * Register a cron job for cleanup
   */
  registerCronJob(cronJob) {
    this.cronJobs.add(cronJob);
  }

  /**
   * Graceful shutdown with proper cleanup
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, forcing exit');
      process.exit(1);
    }

    this.isShuttingDown = true;
    logger.info(`Graceful shutdown initiated by ${signal}`);

    try {
      // Clear all intervals
      for (const intervalId of this.intervals) {
        try {
          clearInterval(intervalId);
          logger.debug('Cleared interval:', intervalId);
        } catch (error) {
          logger.error('Error clearing interval:', error);
        }
      }

      // Clear all timeouts
      for (const timeoutId of this.timeouts) {
        try {
          clearTimeout(timeoutId);
          logger.debug('Cleared timeout:', timeoutId);
        } catch (error) {
          logger.error('Error clearing timeout:', error);
        }
      }

      // Stop all cron jobs
      for (const cronJob of this.cronJobs) {
        try {
          if (cronJob && typeof cronJob.stop === 'function') {
            cronJob.stop();
            logger.debug('Stopped cron job');
          }
        } catch (error) {
          logger.error('Error stopping cron job:', error);
        }
      }

      // Execute cleanup handlers
      for (const handler of this.cleanupHandlers) {
        try {
          await handler();
          logger.debug('Cleanup handler executed');
        } catch (error) {
          logger.error('Error in cleanup handler:', error);
        }
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (shutdownError) {
      logger.error('Error during graceful shutdown:', shutdownError);
      process.exit(1);
    }
  }

  /**
   * Wrap async functions with proper error handling
   */
  wrapAsync(fn, context = 'unknown') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        logger.error(`Error in ${context}:`, error);
        throw error;
      }
    };
  }

  /**
   * Wrap callback functions with error handling
   */
  wrapCallback(fn, context = 'unknown') {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        logger.error(`Error in callback ${context}:`, error);
        throw error;
      }
    };
  }

  /**
   * Safe promise wrapper that logs but doesn't throw
   */
  safePromise(promise, context = 'unknown') {
    return promise.catch(error => {
      logger.error(`Safe promise error in ${context}:`, error);
      return null; // Return null instead of throwing
    });
  }

  /**
   * Replace dangerous .catch(() => {}) patterns
   */
  safeCatch(promise, context = 'unknown', defaultValue = null) {
    return promise.catch(error => {
      logger.error(`Caught error in ${context}:`, error);
      return defaultValue;
    });
  }

  /**
   * Retry mechanism for critical operations
   */
  async retry(fn, maxRetries = 3, delay = 1000, context = 'unknown') {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt}/${maxRetries} failed in ${context}:`, error.message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    logger.error(`All ${maxRetries} attempts failed in ${context}:`, lastError);
    throw lastError;
  }
}

// Singleton instance
const centralErrorHandler = new CentralErrorHandler();

module.exports = centralErrorHandler;