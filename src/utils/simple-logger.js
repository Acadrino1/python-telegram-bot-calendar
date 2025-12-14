
const fs = require('fs');
const path = require('path');

class SimpleLogger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logFile = process.env.LOG_FILE || null;
    
    // Create logs directory if logging to file
    if (this.logFile) {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        try {
          fs.mkdirSync(logDir, { recursive: true });
        } catch (error) {
          console.warn('Could not create log directory, using console only');
          this.logFile = null;
        }
      }
    }
  }

  log(level, message, meta = {}) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = levels[this.logLevel] || 2;
    
    if (levels[level] > currentLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;

    // Console output
    switch (level) {
      case 'error':
        console.error(logEntry);
        break;
      case 'warn':
        console.warn(logEntry);
        break;
      case 'debug':
        console.debug(logEntry);
        break;
      default:
        console.log(logEntry);
    }

    // File output
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logEntry + '\n');
      } catch (error) {
        console.warn('Failed to write to log file:', error.message);
      }
    }
  }

  info(message, meta) {
    this.log('info', message, meta);
  }

  error(message, meta) {
    this.log('error', message, meta);
  }

  warn(message, meta) {
    this.log('warn', message, meta);
  }

  debug(message, meta) {
    this.log('debug', message, meta);
  }
}

// Create and export logger instance
const logger = new SimpleLogger();

module.exports = logger;