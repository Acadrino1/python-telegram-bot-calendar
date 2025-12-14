#!/usr/bin/env node

/**
 * Bot Service Manager with Health Checks and Auto-Recovery
 * Provides robust monitoring and automatic recovery for the Telegram bot
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class BotServiceManager extends EventEmitter {
  constructor() {
    super();
    this.botProcess = null;
    this.restartCount = 0;
    this.maxRestarts = 10;
    this.restartDelay = 5000; // 5 seconds
    this.healthCheckInterval = 30000; // 30 seconds
    this.healthCheckTimer = null;
    this.isShuttingDown = false;
    this.lastHealthCheck = Date.now();
    
    // Paths
    this.botDir = path.join(__dirname, '..');
    this.botScript = path.join(this.botDir, 'src/bot/bot.js');
    this.logFile = path.join(this.botDir, 'bot.log');
    this.errorLogFile = path.join(this.botDir, 'bot-error.log');
    this.pidFile = path.join(this.botDir, 'bot.pid');
    
    // Memory monitoring
    this.memoryThreshold = 500 * 1024 * 1024; // 500MB
    this.memoryCheckInterval = 60000; // 1 minute
    
    this.setupSignalHandlers();
  }
  
  setupSignalHandlers() {
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      this.logError('Uncaught Exception:', error);
      this.shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      this.logError('Unhandled Rejection:', reason);
    });
  }
  
  log(message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, ...args);
    
    // Also write to log file
    const logMessage = `[${timestamp}] ${message} ${args.join(' ')}\n`;
    fs.appendFileSync(this.logFile, logMessage);
  }
  
  logError(message, error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`, error);
    
    // Write to error log file
    const errorMessage = `[${timestamp}] ERROR: ${message}\n${error.stack || error}\n`;
    fs.appendFileSync(this.errorLogFile, errorMessage);
  }
  
  async start() {
    if (this.botProcess) {
      this.log('Bot is already running');
      return;
    }
    
    this.log('Starting Telegram bot...');
    
    try {
      // Clear old logs if they're too large
      this.rotateLogs();
      
      // Spawn the bot process
      this.botProcess = spawn('node', [this.botScript], {
        cwd: this.botDir,
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Save PID
      fs.writeFileSync(this.pidFile, this.botProcess.pid.toString());
      
      this.log(`Bot started with PID: ${this.botProcess.pid}`);
      
      // Handle stdout
      this.botProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[BOT] ${output}`);
          fs.appendFileSync(this.logFile, `[BOT] ${output}\n`);
        }
      });
      
      // Handle stderr
      this.botProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          console.error(`[BOT ERROR] ${error}`);
          fs.appendFileSync(this.errorLogFile, `[BOT ERROR] ${error}\n`);
        }
      });
      
      // Handle process exit
      this.botProcess.on('exit', (code, signal) => {
        this.log(`Bot process exited with code ${code} and signal ${signal}`);
        this.botProcess = null;
        
        // Clean up PID file
        if (fs.existsSync(this.pidFile)) {
          fs.unlinkSync(this.pidFile);
        }
        
        // Auto-restart if not shutting down
        if (!this.isShuttingDown) {
          this.handleBotExit(code, signal);
        }
      });
      
      this.botProcess.on('error', (error) => {
        this.logError('Failed to start bot process:', error);
        this.botProcess = null;
      });
      
      // Start health checks
      this.startHealthChecks();
      
      // Start memory monitoring
      this.startMemoryMonitoring();
      
      // Reset restart count on successful start
      setTimeout(() => {
        if (this.botProcess) {
          this.restartCount = 0;
          this.log('Bot started successfully');
        }
      }, 10000);
      
    } catch (error) {
      this.logError('Failed to start bot:', error);
      throw error;
    }
  }
  
  async stop() {
    if (!this.botProcess) {
      this.log('Bot is not running');
      return;
    }
    
    this.log('Stopping bot...');
    this.isShuttingDown = true;
    
    // Stop health checks
    this.stopHealthChecks();
    this.stopMemoryMonitoring();
    
    // Send SIGTERM to bot process
    this.botProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      let timeout = setTimeout(() => {
        if (this.botProcess) {
          this.log('Force killing bot process...');
          this.botProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);
      
      if (!this.botProcess) {
        clearTimeout(timeout);
        resolve();
      } else {
        this.botProcess.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      }
    });
    
    this.log('Bot stopped');
    this.isShuttingDown = false;
  }
  
  async restart() {
    this.log('Restarting bot...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.start();
  }
  
  handleBotExit(code, signal) {
    if (this.restartCount >= this.maxRestarts) {
      this.logError(`Bot crashed ${this.maxRestarts} times. Giving up.`, new Error('Max restarts reached'));
      process.exit(1);
    }
    
    this.restartCount++;
    const delay = Math.min(this.restartDelay * this.restartCount, 30000); // Max 30 seconds
    
    this.log(`Bot crashed. Restarting in ${delay}ms... (Attempt ${this.restartCount}/${this.maxRestarts})`);
    
    setTimeout(() => {
      this.start().catch((error) => {
        this.logError('Failed to restart bot:', error);
      });
    }, delay);
  }
  
  startHealthChecks() {
    this.stopHealthChecks();
    
    this.healthCheckTimer = setInterval(() => {
      if (this.botProcess) {
        try {
          // Check if process is still running
          process.kill(this.botProcess.pid, 0);
          this.lastHealthCheck = Date.now();
        } catch (error) {
          this.logError('Health check failed:', error);
          this.restart().catch(err => this.logError('Failed to restart after health check:', err));
        }
      }
    }, this.healthCheckInterval);
  }
  
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  
  startMemoryMonitoring() {
    this.stopMemoryMonitoring();
    
    this.memoryCheckTimer = setInterval(() => {
      if (this.botProcess) {
        try {
          const usage = process.memoryUsage();
          const heapUsed = usage.heapUsed;
          
          this.log(`Memory usage: ${Math.round(heapUsed / 1024 / 1024)}MB`);
          
          if (heapUsed > this.memoryThreshold) {
            this.log(`Memory threshold exceeded (${Math.round(heapUsed / 1024 / 1024)}MB > ${Math.round(this.memoryThreshold / 1024 / 1024)}MB). Restarting...`);
            this.restart().catch(err => this.logError('Failed to restart after memory threshold:', err));
          }
        } catch (error) {
          this.logError('Memory check failed:', error);
        }
      }
    }, this.memoryCheckInterval);
  }
  
  stopMemoryMonitoring() {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
  }
  
  rotateLogs() {
    const maxLogSize = 10 * 1024 * 1024; // 10MB
    
    [this.logFile, this.errorLogFile].forEach(file => {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (stats.size > maxLogSize) {
          const backupFile = `${file}.${Date.now()}.bak`;
          fs.renameSync(file, backupFile);
          this.log(`Rotated log file: ${path.basename(file)} -> ${path.basename(backupFile)}`);
        }
      }
    });
  }
  
  async shutdown(signal) {
    this.log(`Received ${signal}. Shutting down...`);
    this.isShuttingDown = true;
    
    await this.stop();
    
    this.log('Service manager stopped');
    process.exit(0);
  }
  
  getStatus() {
    if (!this.botProcess) {
      return {
        running: false,
        pid: null,
        uptime: 0,
        restartCount: this.restartCount,
        lastHealthCheck: this.lastHealthCheck
      };
    }
    
    return {
      running: true,
      pid: this.botProcess.pid,
      uptime: Date.now() - this.lastHealthCheck,
      restartCount: this.restartCount,
      lastHealthCheck: this.lastHealthCheck,
      memory: process.memoryUsage()
    };
  }
}

// CLI Interface
if (require.main === module) {
  const manager = new BotServiceManager();
  const command = process.argv[2] || 'start';
  
  switch (command) {
    case 'start':
      manager.start().catch(console.error);
      break;
      
    case 'stop':
      manager.stop().then(() => process.exit(0)).catch(console.error);
      break;
      
    case 'restart':
      manager.restart().catch(console.error);
      break;
      
    case 'status':
      const status = manager.getStatus();
      console.log('Bot Status:', status);
      process.exit(0);
      break;
      
    case 'monitor':
      console.log('Starting bot service in monitor mode...');
      console.log('Press Ctrl+C to stop');
      manager.start().catch(console.error);
      break;
      
    default:
      console.log('Usage: node bot-service.js [command]');
      console.log('Commands:');
      console.log('  start   - Start the bot');
      console.log('  stop    - Stop the bot');
      console.log('  restart - Restart the bot');
      console.log('  status  - Check bot status');
      console.log('  monitor - Start with monitoring (default)');
      process.exit(1);
  }
}

module.exports = BotServiceManager;