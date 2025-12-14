const fs = require('fs');
const path = require('path');

/**
 * Logger - Enhanced logging with file rotation and levels
 */
class Logger {
  constructor(name = 'Bot') {
    this.name = name;
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    this.level = process.env.LOG_LEVEL || 'INFO';
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    this.logDir = path.join(__dirname, '../../logs');
    
    if (this.logToFile) {
      this.ensureLogDirectory();
    }
  }
  
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }
  
  format(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.name}]`;
    return `${prefix} ${message} ${args.map(a => 
      typeof a === 'object' ? JSON.stringify(a) : a
    ).join(' ')}`;
  }
  
  writeToFile(message) {
    if (!this.logToFile) return;
    
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${date}.log`);
    
    fs.appendFileSync(logFile, message + '\n');
  }
  
  error(message, ...args) {
    if (this.shouldLog('ERROR')) {
      const formatted = this.format('ERROR', message, ...args);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }
  
  warn(message, ...args) {
    if (this.shouldLog('WARN')) {
      const formatted = this.format('WARN', message, ...args);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }
  
  info(message, ...args) {
    if (this.shouldLog('INFO')) {
      const formatted = this.format('INFO', message, ...args);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }
  
  debug(message, ...args) {
    if (this.shouldLog('DEBUG')) {
      const formatted = this.format('DEBUG', message, ...args);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }
}

module.exports = Logger;