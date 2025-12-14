const BasePlugin = require('../../core/BasePlugin');
const express = require('express');
const http = require('http');

/**
 * HealthPlugin - Provides health check endpoints and monitoring
 */
class HealthPlugin extends BasePlugin {
  constructor(bot, config = {}) {
    super(bot, config);
    
    this.name = 'health';
    this.version = '1.0.0';
    this.description = 'Health monitoring and metrics collection';
    
    this.port = config.healthPort || process.env.HEALTH_PORT || 3001;
    this.app = null;
    this.server = null;
    this.startTime = Date.now();
    
    // Metrics storage
    this.metrics = {
      requests: 0,
      messages: 0,
      commands: 0,
      errors: 0,
      latency: []
    };
  }
  
  async initialize() {
    try {
      // Create Express app for health endpoints
      this.app = express();
      this.app.use(express.json());
      
      // Setup routes
      this.setupRoutes();
      
      // Start server
      await this.startServer();
      
      // Setup metrics collection
      this.setupMetricsCollection();
      
      this.logger.info(`Health plugin initialized on port ${this.port}`);
    } catch (error) {
      this.logger.error('Health plugin initialization error:', error);
      throw error;
    }
  }
  
  setupRoutes() {
    // Basic health check
    this.app.get('/health', (req, res) => {
      const health = this.getSystemHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    });
    
    // Liveness probe (for k8s)
    this.app.get('/health/live', (req, res) => {
      res.status(200).json({ status: 'alive' });
    });
    
    // Readiness probe (for k8s)
    this.app.get('/health/ready', (req, res) => {
      const ready = this.isReady();
      const statusCode = ready ? 200 : 503;
      res.status(statusCode).json({ ready });
    });
    
    // Detailed metrics
    this.app.get('/metrics', (req, res) => {
      const metrics = this.getDetailedMetrics();
      res.json(metrics);
    });
    
    // Plugin status
    this.app.get('/health/plugins', async (req, res) => {
      const pluginStatus = await this.getPluginStatus();
      res.json(pluginStatus);
    });
    
    // Bot info
    this.app.get('/info', (req, res) => {
      res.json({
        name: this.bot.botInfo?.username || 'telegram-bot',
        version: this.bot.version || '1.0.0',
        uptime: this.getUptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    });
  }
  
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.app);
      
      this.server.listen(this.port, () => {
        this.logger.info(`Health server listening on port ${this.port}`);
        resolve();
      });
      
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.warn(`Port ${this.port} is in use, trying ${this.port + 1}`);
          this.port++;
          this.startServer().then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });
    });
  }
  
  setupMetricsCollection() {
    // Track bot messages
    this.telegram.use(async (ctx, next) => {
      const start = Date.now();
      
      try {
        this.metrics.messages++;
        
        if (ctx.message?.text?.startsWith('/')) {
          this.metrics.commands++;
        }
        
        await next();
        
        // Record latency
        const latency = Date.now() - start;
        this.metrics.latency.push(latency);
        
        // Keep only last 1000 latency measurements
        if (this.metrics.latency.length > 1000) {
          this.metrics.latency.shift();
        }
      } catch (error) {
        this.metrics.errors++;
        throw error;
      }
    });
  }
  
  getSystemHealth() {
    const plugins = this.bot.pluginManager?.plugins || new Map();
    let healthyPlugins = 0;
    let degradedPlugins = 0;
    let unhealthyPlugins = 0;
    
    plugins.forEach(plugin => {
      const health = plugin.getHealth ? plugin.getHealth() : 'unknown';
      switch (health) {
        case 'healthy':
          healthyPlugins++;
          break;
        case 'degraded':
          degradedPlugins++;
          break;
        case 'unhealthy':
          unhealthyPlugins++;
          break;
      }
    });
    
    // Determine overall health
    let status = 'healthy';
    if (unhealthyPlugins > 0) {
      status = 'unhealthy';
    } else if (degradedPlugins > 0) {
      status = 'degraded';
    }
    
    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      plugins: {
        total: plugins.size,
        healthy: healthyPlugins,
        degraded: degradedPlugins,
        unhealthy: unhealthyPlugins
      },
      memory: this.getMemoryUsage(),
      metrics: this.getBasicMetrics()
    };
  }
  
  isReady() {
    // Check if bot is ready to handle requests
    if (!this.bot.telegram) return false;
    if (!this.bot.pluginManager) return false;
    
    // Check if critical plugins are loaded
    const criticalPlugins = ['auth'];
    const plugins = this.bot.pluginManager.plugins;
    
    for (const pluginName of criticalPlugins) {
      const plugin = plugins.get(pluginName);
      if (!plugin || plugin.getHealth() === 'unhealthy') {
        return false;
      }
    }
    
    return true;
  }
  
  async getPluginStatus() {
    const plugins = this.bot.pluginManager?.plugins || new Map();
    const status = {};
    
    for (const [name, plugin] of plugins) {
      status[name] = {
        name: plugin.name,
        version: plugin.version,
        enabled: plugin.enabled,
        health: plugin.getHealth ? plugin.getHealth() : 'unknown',
        metrics: plugin.getMetrics ? await plugin.getMetrics() : {},
        circuitBreaker: plugin.circuitBreaker ? {
          state: plugin.circuitBreaker.state,
          failures: plugin.circuitBreaker.failures
        } : null
      };
    }
    
    return status;
  }
  
  getDetailedMetrics() {
    const avgLatency = this.metrics.latency.length > 0
      ? this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length
      : 0;
    
    const maxLatency = this.metrics.latency.length > 0
      ? Math.max(...this.metrics.latency)
      : 0;
    
    const minLatency = this.metrics.latency.length > 0
      ? Math.min(...this.metrics.latency)
      : 0;
    
    return {
      uptime: this.getUptime(),
      totalRequests: this.metrics.requests,
      totalMessages: this.metrics.messages,
      totalCommands: this.metrics.commands,
      totalErrors: this.metrics.errors,
      errorRate: this.metrics.messages > 0 
        ? (this.metrics.errors / this.metrics.messages * 100).toFixed(2) + '%'
        : '0%',
      latency: {
        average: Math.round(avgLatency),
        max: maxLatency,
        min: minLatency,
        samples: this.metrics.latency.length
      },
      memory: this.getMemoryUsage(),
      redis: this.getRedisMetrics(),
      rateLimit: this.getRateLimitMetrics()
    };
  }
  
  getBasicMetrics() {
    return {
      messages: this.metrics.messages,
      commands: this.metrics.commands,
      errors: this.metrics.errors,
      errorRate: this.metrics.messages > 0 
        ? (this.metrics.errors / this.metrics.messages * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  getMemoryUsage() {
    const used = process.memoryUsage();
    return {
      rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(used.external / 1024 / 1024)}MB`
    };
  }
  
  getRedisMetrics() {
    if (!this.bot.redis) {
      return { status: 'not configured' };
    }
    
    const stats = this.bot.redis.getStats();
    return {
      connected: this.bot.redis.isConnected,
      mode: this.bot.redis.isConnected ? 'redis' : 'memory',
      ...stats
    };
  }
  
  getRateLimitMetrics() {
    if (!this.bot.rateLimiter) {
      return { status: 'not configured' };
    }
    
    return this.bot.rateLimiter.getStats();
  }
  
  getUptime() {
    const uptime = Date.now() - this.startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
    
    return {
      milliseconds: uptime,
      formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
    };
  }
  
  async cleanup() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('Health server closed');
          resolve();
        });
      });
    }
  }
  
  getHealth() {
    return this.server && this.server.listening ? 'healthy' : 'unhealthy';
  }
  
  async getMetrics() {
    return {
      ...super.getMetrics(),
      ...this.getBasicMetrics(),
      port: this.port,
      endpoints: [
        '/health',
        '/health/live',
        '/health/ready',
        '/metrics',
        '/health/plugins',
        '/info'
      ]
    };
  }
}

module.exports = HealthPlugin;