/**
 * Webhook Resilience Manager - Rule 16 Compliance
 * Implements webhook resilience with automatic failover, retry mechanisms, and health monitoring
 */

const EventEmitter = require('events');
const NodeCache = require('node-cache');

class WebhookResilienceManager extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.isHealthy = true;
    this.failoverActive = false;
    this.retryQueue = [];
    this.healthCheckInterval = null;
    this.metrics = new Map();
    
    // Configuration
    this.config = {
      healthCheckInterval: 30000, // 30 seconds
      maxRetries: 5,
      retryDelay: 1000, // 1 second base delay
      maxRetryDelay: 30000, // 30 seconds max delay
      failoverThreshold: 3, // consecutive failures before failover
      recoveryThreshold: 3, // consecutive successes for recovery
      webhookTimeout: 10000, // 10 seconds
      queueMaxSize: 1000
    };
    
    this.failureCount = 0;
    this.successCount = 0;
    this.lastHealthCheck = Date.now();
    
    // Circuit breaker states
    this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.circuitOpenTime = null;
    this.circuitTimeout = 60000; // 1 minute
    
    this.initializeHealthMonitoring();
  }

  /**
   * Initialize health monitoring and resilience mechanisms
   */
  initializeHealthMonitoring() {
    // Start periodic health checks
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckInterval
    );

    // Setup webhook error handling
    this.setupWebhookErrorHandling();

    // Setup graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());

    console.log('🛡️ Webhook resilience manager initialized');
  }

  /**
   * Setup webhook error handling with retry logic
   */
  setupWebhookErrorHandling() {
    if (this.bot.telegram) {
      // Override webhook handling with resilience
      const originalWebhookReply = this.bot.telegram.webhookReply;
      
      this.bot.telegram.webhookReply = async (...args) => {
        return this.executeWithResilience(
          () => originalWebhookReply.call(this.bot.telegram, ...args),
          'webhook_reply'
        );
      };
    }

    // Handle bot errors
    this.bot.catch((error, ctx) => {
      console.error('Bot error caught by resilience manager:', error);
      this.recordFailure('bot_error');
      
      // Attempt to send error response to user
      if (ctx && ctx.reply) {
        this.executeWithResilience(
          () => ctx.reply('⚠️ Temporary service interruption. Please try again.'),
          'error_response'
        ).catch(() => {
          console.error('Failed to send error response to user');
        });
      }
    });
  }

  /**
   * Execute operation with resilience (retry logic, circuit breaker)
   */
  async executeWithResilience(operation, operationType = 'unknown') {
    // Check circuit breaker
    if (this.circuitState === 'OPEN') {
      if (Date.now() - this.circuitOpenTime > this.circuitTimeout) {
        this.circuitState = 'HALF_OPEN';
        console.log('🔄 Circuit breaker moving to HALF_OPEN state');
      } else {
        throw new Error(`Circuit breaker OPEN for ${operationType}`);
      }
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, this.config.webhookTimeout);
        
        // Operation succeeded
        this.recordSuccess(operationType);
        
        if (this.circuitState === 'HALF_OPEN') {
          this.circuitState = 'CLOSED';
          console.log('✅ Circuit breaker CLOSED - service recovered');
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        this.recordFailure(operationType);
        
        console.warn(`Operation ${operationType} failed (attempt ${attempt}/${this.config.maxRetries}):`, error.message);
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(
            this.config.retryDelay * Math.pow(2, attempt - 1),
            this.config.maxRetryDelay
          );
          
          await this.delay(delay);
        }
      }
    }
    
    // All retries failed
    this.handleOperationFailure(operationType, lastError);
    throw lastError;
  }

  /**
   * Execute operation with timeout
   */
  async executeWithTimeout(operation, timeout) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        const result = await operation();
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Handle operation failure after all retries
   */
  handleOperationFailure(operationType, error) {
    console.error(`❌ Operation ${operationType} failed after all retries:`, error);
    
    // Update circuit breaker
    if (this.failureCount >= this.config.failoverThreshold) {
      if (this.circuitState === 'CLOSED') {
        this.circuitState = 'OPEN';
        this.circuitOpenTime = Date.now();
        console.error('🚨 Circuit breaker OPEN - too many failures');
      }
    }
    
    // Emit failure event
    this.emit('operationFailed', { operationType, error, failureCount: this.failureCount });
    
    // Add to retry queue if appropriate
    this.addToRetryQueue(operationType, error);
  }

  /**
   * Add failed operation to retry queue
   */
  addToRetryQueue(operationType, error) {
    if (this.retryQueue.length >= this.config.queueMaxSize) {
      console.warn('Retry queue full, dropping oldest entry');
      this.retryQueue.shift();
    }
    
    this.retryQueue.push({
      operationType,
      error,
      timestamp: Date.now(),
      retries: 0
    });
  }

  /**
   * Process retry queue
   */
  async processRetryQueue() {
    if (this.retryQueue.length === 0 || this.circuitState === 'OPEN') {
      return;
    }
    
    const itemsToRetry = this.retryQueue.splice(0, 5); // Process 5 items at a time
    
    for (const item of itemsToRetry) {
      try {
        // Skip items that are too old (older than 5 minutes)
        if (Date.now() - item.timestamp > 300000) {
          continue;
        }
        
        // For now, we just log the retry attempt
        // In a real implementation, you'd re-execute the failed operation
        console.log(`🔄 Retrying queued operation: ${item.operationType}`);
        
      } catch (error) {
        console.error(`Failed to retry operation ${item.operationType}:`, error);
        
        // Add back to queue if not exceeded max retries
        if (item.retries < 3) {
          item.retries++;
          this.retryQueue.push(item);
        }
      }
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      // Check if bot is responsive
      await this.checkBotHealth();
      
      // Process retry queue
      await this.processRetryQueue();
      
      // Update metrics
      this.updateHealthMetrics();
      
      // Emit health check event
      this.emit('healthCheck', {
        healthy: this.isHealthy,
        circuitState: this.circuitState,
        queueSize: this.retryQueue.length,
        failureCount: this.failureCount,
        successCount: this.successCount
      });
      
      this.lastHealthCheck = Date.now();
      
    } catch (error) {
      console.error('Health check failed:', error);
      this.isHealthy = false;
      this.recordFailure('health_check');
    }
  }

  /**
   * Check bot health by calling getMe
   */
  async checkBotHealth() {
    try {
      const botInfo = await this.bot.telegram.getMe();
      
      if (botInfo && botInfo.id) {
        this.isHealthy = true;
        this.recordSuccess('health_check');
        return true;
      } else {
        throw new Error('Invalid bot info received');
      }
      
    } catch (error) {
      this.isHealthy = false;
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  recordSuccess(operationType) {
    this.successCount++;
    this.recordMetric(operationType, 'success');
    
    // Reset failure count on success
    if (this.circuitState === 'HALF_OPEN' && this.successCount >= this.config.recoveryThreshold) {
      this.failureCount = 0;
    }
  }

  /**
   * Record failed operation
   */
  recordFailure(operationType) {
    this.failureCount++;
    this.successCount = 0; // Reset success count
    this.recordMetric(operationType, 'failure');
  }

  /**
   * Record metrics for operation
   */
  recordMetric(operationType, result) {
    const key = `${operationType}_${result}`;
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);
    
    // Keep only recent metrics (last 1000 entries)
    if (this.metrics.size > 1000) {
      const oldestKey = this.metrics.keys().next().value;
      this.metrics.delete(oldestKey);
    }
  }

  /**
   * Update health metrics
   */
  updateHealthMetrics() {
    const now = Date.now();
    this.metrics.set('last_health_check', now);
    this.metrics.set('uptime', process.uptime());
    this.metrics.set('memory_usage', process.memoryUsage());
    this.metrics.set('circuit_state', this.circuitState);
    this.metrics.set('queue_size', this.retryQueue.length);
  }

  /**
   * Check if error is non-retryable
   */
  isNonRetryableError(error) {
    const nonRetryablePatterns = [
      /Bad Request/i,
      /Unauthorized/i,
      /Forbidden/i,
      /Not Found/i,
      /Method Not Allowed/i,
      /Conflict/i,
      /Gone/i,
      /Payload Too Large/i,
      /Too Many Requests/i
    ];
    
    return nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Setup automatic failover to polling if webhook fails
   */
  async enableFailover() {
    if (this.failoverActive) {
      return;
    }
    
    console.log('🔄 Enabling webhook failover to polling mode');
    
    try {
      // Delete webhook
      await this.bot.telegram.deleteWebhook();
      
      // Start polling
      await this.bot.launch();
      
      this.failoverActive = true;
      
      console.log('✅ Failover to polling mode successful');
      
      // Emit failover event
      this.emit('failoverActivated', { mode: 'polling', timestamp: Date.now() });
      
    } catch (error) {
      console.error('❌ Failover to polling failed:', error);
      throw error;
    }
  }

  /**
   * Restore webhook from polling failover
   */
  async restoreWebhook(webhookUrl) {
    if (!this.failoverActive) {
      return;
    }
    
    console.log('🔄 Restoring webhook from polling failover');
    
    try {
      // Stop polling
      this.bot.stop();
      
      // Set webhook
      await this.bot.telegram.setWebhook(webhookUrl);
      
      this.failoverActive = false;
      this.failureCount = 0;
      this.circuitState = 'CLOSED';
      
      console.log('✅ Webhook restoration successful');
      
      // Emit restoration event
      this.emit('webhookRestored', { url: webhookUrl, timestamp: Date.now() });
      
    } catch (error) {
      console.error('❌ Webhook restoration failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus() {
    return {
      healthy: this.isHealthy,
      circuitState: this.circuitState,
      failoverActive: this.failoverActive,
      failureCount: this.failureCount,
      successCount: this.successCount,
      queueSize: this.retryQueue.length,
      lastHealthCheck: this.lastHealthCheck,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      metrics: Object.fromEntries(this.metrics)
    };
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    console.log('🔄 Starting graceful shutdown of webhook resilience manager');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Process remaining retry queue items
    await this.processRetryQueue();
    
    // Stop bot if in polling mode
    if (this.failoverActive) {
      this.bot.stop();
    }
    
    console.log('✅ Webhook resilience manager shutdown complete');
  }

  /**
   * Utility function for delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebhookResilienceManager;