const Redis = require('ioredis');
const mysql = require('mysql2/promise');
const logger = require('../../src/utils/logger');

/**
 * Comprehensive health check system for production readiness
 * Monitors all critical system components and dependencies
 */
class HealthCheckSystem {
  constructor() {
    this.checks = new Map();
    this.results = new Map();
    this.isRunning = false;
    
    // Health check configuration
    this.config = {
      interval: 30000, // 30 seconds
      timeout: 5000,   // 5 seconds per check
      retryAttempts: 2,
      alertThresholds: {
        critical: 0,     // 0% success rate
        warning: 80,     // 80% success rate
        healthy: 95      // 95% success rate
      }
    };

    // Register default health checks
    this.registerDefaultChecks();
    
    // Start periodic health checks
    this.startPeriodicChecks();
  }

  registerDefaultChecks() {
    // Database connectivity
    this.registerHealthCheck('database', async () => {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        timeout: this.config.timeout
      });

      try {
        const [rows] = await connection.execute('SELECT 1 as health_check');
        await connection.end();
        
        return {
          status: 'healthy',
          responseTime: Date.now(),
          details: { query: 'SELECT 1', result: rows[0] }
        };
      } catch (error) {
        await connection.end().catch(() => {});
        throw error;
      }
    }, { critical: true, timeout: 3000 });

    // Redis connectivity
    this.registerHealthCheck('redis', async () => {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 0,
        password: process.env.REDIS_PASSWORD,
        connectTimeout: this.config.timeout,
        lazyConnect: true
      });

      try {
        const start = Date.now();
        await redis.connect();
        const pong = await redis.ping();
        const responseTime = Date.now() - start;
        await redis.quit();

        return {
          status: 'healthy',
          responseTime,
          details: { ping: pong }
        };
      } catch (error) {
        await redis.quit().catch(() => {});
        throw error;
      }
    }, { critical: true, timeout: 2000 });

    // Memory usage check
    this.registerHealthCheck('memory', async () => {
      const usage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const systemUsedMB = Math.round((totalMemory - freeMemory) / 1024 / 1024);
      const systemTotalMB = Math.round(totalMemory / 1024 / 1024);
      
      const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;
      const systemUsagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;

      let status = 'healthy';
      if (heapUsagePercent > 90 || systemUsagePercent > 90) {
        status = 'critical';
      } else if (heapUsagePercent > 75 || systemUsagePercent > 75) {
        status = 'warning';
      }

      return {
        status,
        details: {
          heap: {
            used: `${heapUsedMB}MB`,
            total: `${heapTotalMB}MB`,
            percentage: `${heapUsagePercent.toFixed(1)}%`
          },
          system: {
            used: `${systemUsedMB}MB`,
            total: `${systemTotalMB}MB`,
            percentage: `${systemUsagePercent.toFixed(1)}%`
          }
        }
      };
    }, { critical: false, timeout: 1000 });

    // CPU usage check
    this.registerHealthCheck('cpu', async () => {
      const startUsage = process.cpuUsage();
      await new Promise(resolve => setTimeout(resolve, 100)); // Sample for 100ms
      const endUsage = process.cpuUsage(startUsage);
      
      const cpuPercent = ((endUsage.user + endUsage.system) / (100 * 1000)) * 100;
      
      let status = 'healthy';
      if (cpuPercent > 90) {
        status = 'critical';
      } else if (cpuPercent > 75) {
        status = 'warning';
      }

      return {
        status,
        details: {
          usage: `${cpuPercent.toFixed(1)}%`,
          user: endUsage.user,
          system: endUsage.system
        }
      };
    }, { critical: false, timeout: 1000 });

    // Disk space check
    this.registerHealthCheck('disk', async () => {
      const { execSync } = require('child_process');
      
      try {
        const diskUsage = execSync("df -h / | awk 'NR==2{print $5}' | sed 's/%//'").toString().trim();
        const usagePercent = parseInt(diskUsage);
        
        let status = 'healthy';
        if (usagePercent > 95) {
          status = 'critical';
        } else if (usagePercent > 85) {
          status = 'warning';
        }

        return {
          status,
          details: {
            usage: `${usagePercent}%`,
            available: execSync("df -h / | awk 'NR==2{print $4}'").toString().trim()
          }
        };
      } catch (error) {
        return {
          status: 'warning',
          details: { error: 'Unable to check disk usage on this system' }
        };
      }
    }, { critical: false, timeout: 2000 });

    // Telegram Bot API connectivity
    this.registerHealthCheck('telegram_api', async () => {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        return {
          status: 'disabled',
          details: { reason: 'No Telegram bot token configured' }
        };
      }

      const fetch = require('node-fetch');
      const start = Date.now();
      
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, {
        timeout: this.config.timeout
      });

      if (!response.ok) {
        throw new Error(`Telegram API responded with status ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - start;

      if (!data.ok) {
        throw new Error(data.description || 'Telegram API error');
      }

      return {
        status: 'healthy',
        responseTime,
        details: {
          bot: {
            id: data.result.id,
            username: data.result.username,
            name: data.result.first_name
          }
        }
      };
    }, { critical: true, timeout: 5000 });

    // Email service check (if configured)
    this.registerHealthCheck('email_service', async () => {
      if (!process.env.SMTP_HOST) {
        return {
          status: 'disabled',
          details: { reason: 'No SMTP configuration found' }
        };
      }

      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      try {
        const start = Date.now();
        await transporter.verify();
        const responseTime = Date.now() - start;

        return {
          status: 'healthy',
          responseTime,
          details: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true'
          }
        };
      } finally {
        transporter.close();
      }
    }, { critical: false, timeout: 5000 });

    // SMS service check (if configured)
    this.registerHealthCheck('sms_service', async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return {
          status: 'disabled',
          details: { reason: 'No Twilio configuration found' }
        };
      }

      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      try {
        const start = Date.now();
        const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        const responseTime = Date.now() - start;

        return {
          status: 'healthy',
          responseTime,
          details: {
            accountStatus: account.status,
            balance: account.balance
          }
        };
      } catch (error) {
        throw new Error(`Twilio API error: ${error.message}`);
      }
    }, { critical: false, timeout: 5000 });
  }

  registerHealthCheck(name, checkFunction, options = {}) {
    this.checks.set(name, {
      name,
      fn: checkFunction,
      critical: options.critical || false,
      timeout: options.timeout || this.config.timeout,
      retryAttempts: options.retryAttempts || this.config.retryAttempts,
      tags: options.tags || []
    });

    logger.debug(`Registered health check: ${name}`);
  }

  async runHealthCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const result = {
      name,
      timestamp: new Date().toISOString(),
      status: 'unknown',
      critical: check.critical,
      responseTime: null,
      error: null,
      details: {},
      attempts: 0
    };

    let attempt = 0;
    while (attempt <= check.retryAttempts) {
      attempt++;
      result.attempts = attempt;

      try {
        const start = Date.now();
        
        const checkResult = await Promise.race([
          check.fn(),
          this.timeoutPromise(check.timeout, `Health check '${name}' timed out`)
        ]);

        result.responseTime = Date.now() - start;
        result.status = checkResult.status || 'healthy';
        result.details = checkResult.details || {};
        
        if (checkResult.responseTime) {
          result.responseTime = checkResult.responseTime;
        }

        // Success - exit retry loop
        break;

      } catch (error) {
        result.error = error.message;
        
        if (attempt <= check.retryAttempts) {
          // Wait before retry
          await this.delay(1000 * attempt);
          continue;
        }

        // Final attempt failed
        result.status = check.critical ? 'critical' : 'warning';
        logger.error(`Health check '${name}' failed after ${attempt} attempts:`, error);
      }
    }

    this.results.set(name, result);
    return result;
  }

  async runAllHealthChecks() {
    if (this.isRunning) {
      logger.debug('Health checks already running, skipping');
      return this.getOverallHealth();
    }

    this.isRunning = true;

    try {
      logger.debug('Starting comprehensive health checks');
      const checkPromises = Array.from(this.checks.keys()).map(name =>
        this.runHealthCheck(name).catch(error => ({
          name,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        }))
      );

      await Promise.all(checkPromises);
      
      const overallHealth = this.getOverallHealth();
      logger.info('Health checks completed', {
        status: overallHealth.status,
        healthy: overallHealth.healthy,
        total: overallHealth.total,
        passed: overallHealth.passed,
        failed: overallHealth.failed
      });

      return overallHealth;

    } finally {
      this.isRunning = false;
    }
  }

  getOverallHealth() {
    const results = Array.from(this.results.values());
    
    if (results.length === 0) {
      return {
        status: 'unknown',
        healthy: false,
        timestamp: new Date().toISOString(),
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        checks: {}
      };
    }

    const total = results.length;
    const passed = results.filter(r => r.status === 'healthy').length;
    const failed = results.filter(r => ['critical', 'error'].includes(r.status)).length;
    const warnings = results.filter(r => r.status === 'warning').length;
    const disabled = results.filter(r => r.status === 'disabled').length;

    // Check for critical failures
    const criticalFailures = results.filter(r => r.critical && ['critical', 'error'].includes(r.status));
    
    let overallStatus;
    if (criticalFailures.length > 0) {
      overallStatus = 'critical';
    } else if (failed > 0) {
      overallStatus = 'degraded';
    } else if (warnings > 0) {
      overallStatus = 'warning';
    } else {
      overallStatus = 'healthy';
    }

    const checksObject = {};
    results.forEach(result => {
      checksObject[result.name] = {
        status: result.status,
        critical: result.critical,
        responseTime: result.responseTime,
        timestamp: result.timestamp,
        error: result.error,
        details: result.details
      };
    });

    return {
      status: overallStatus,
      healthy: overallStatus === 'healthy',
      timestamp: new Date().toISOString(),
      total,
      passed,
      failed,
      warnings,
      disabled,
      criticalFailures: criticalFailures.length,
      checks: checksObject
    };
  }

  // Readiness probe - checks if the service can handle requests
  async readinessProbe() {
    const criticalChecks = ['database', 'redis', 'telegram_api'];
    
    const results = await Promise.all(
      criticalChecks.map(async checkName => {
        try {
          const result = await this.runHealthCheck(checkName);
          return { name: checkName, ready: result.status === 'healthy' };
        } catch (error) {
          return { name: checkName, ready: false, error: error.message };
        }
      })
    );

    const allReady = results.every(r => r.ready);
    
    return {
      ready: allReady,
      timestamp: new Date().toISOString(),
      checks: results.reduce((acc, result) => {
        acc[result.name] = {
          ready: result.ready,
          error: result.error
        };
        return acc;
      }, {})
    };
  }

  // Liveness probe - checks if the service is alive
  async livenessProbe() {
    try {
      // Basic checks to ensure the process is responsive
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Check if memory usage is not critically high
      const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      const alive = heapUsagePercent < 95 && uptime > 0;
      
      return {
        alive,
        timestamp: new Date().toISOString(),
        uptime,
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          usagePercent: Math.round(heapUsagePercent)
        }
      };
    } catch (error) {
      return {
        alive: false,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  startPeriodicChecks() {
    // Run health checks periodically
    setInterval(async () => {
      try {
        await this.runAllHealthChecks();
      } catch (error) {
        logger.error('Error in periodic health check:', error);
      }
    }, this.config.interval);

    // Initial health check
    setTimeout(() => {
      this.runAllHealthChecks().catch(error => {
        logger.error('Error in initial health check:', error);
      });
    }, 5000); // Wait 5 seconds after startup
  }

  // Utility methods
  timeoutPromise(ms, message) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get specific check result
  getCheckResult(name) {
    return this.results.get(name);
  }

  // Get all results
  getAllResults() {
    return Object.fromEntries(this.results);
  }

  // Cleanup
  cleanup() {
    logger.info('Shutting down health check system');
  }
}

// Singleton instance
const healthCheckSystem = new HealthCheckSystem();

module.exports = {
  HealthCheckSystem,
  healthCheck: () => healthCheckSystem.runAllHealthChecks(),
  readinessProbe: () => healthCheckSystem.readinessProbe(),
  livenessProbe: () => healthCheckSystem.livenessProbe(),
  getOverallHealth: () => healthCheckSystem.getOverallHealth(),
  getCheckResult: (name) => healthCheckSystem.getCheckResult(name),
  registerHealthCheck: (name, fn, options) => healthCheckSystem.registerHealthCheck(name, fn, options)
};