/**
 * Circuit Breaker implementation for plugin fault tolerance
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'CircuitBreaker';
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000; // 30 seconds
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    
    // States: CLOSED, OPEN, HALF_OPEN
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Statistics
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      timeouts: 0,
      circuitBreakerTrips: 0,
      lastTrip: null,
      lastSuccess: null,
      lastFailure: null
    };
    
    // Failure tracking window
    this.failures = [];
    
    this.setupPeriodicCleanup();
  }

  async execute(operation) {
    this.stats.totalCalls++;
    
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker ${this.name} is OPEN. Next retry at ${new Date(this.nextAttemptTime)}`);
      } else {
        this.state = 'HALF_OPEN';
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.stats.successfulCalls++;
    this.stats.lastSuccess = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.reset();
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  onFailure() {
    this.stats.failedCalls++;
    this.stats.lastFailure = Date.now();
    this.lastFailureTime = Date.now();
    
    // Add failure to tracking window
    this.failures.push(Date.now());
    this.cleanupOldFailures();
    
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  trip() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    this.stats.circuitBreakerTrips++;
    this.stats.lastTrip = Date.now();
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.nextAttemptTime = null;
    this.failures = [];
  }

  cleanupOldFailures() {
    const cutoff = Date.now() - this.monitoringPeriod;
    this.failures = this.failures.filter(timestamp => timestamp > cutoff);
  }

  setupPeriodicCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldFailures();
      
      // Auto-reset if no recent failures
      if (this.state === 'CLOSED' && this.failures.length === 0) {
        this.failureCount = 0;
      }
    }, this.monitoringPeriod / 2);
  }

  // Public interface methods
  isOpen() {
    return this.state === 'OPEN';
  }

  isClosed() {
    return this.state === 'CLOSED';
  }

  isHalfOpen() {
    return this.state === 'HALF_OPEN';
  }

  getState() {
    return this.state;
  }

  getFailureCount() {
    return this.failureCount;
  }

  getStats() {
    const now = Date.now();
    return {
      ...this.stats,
      state: this.state,
      failureCount: this.failureCount,
      recentFailures: this.failures.length,
      uptime: this.stats.lastTrip ? now - this.stats.lastTrip : null,
      nextRetryIn: this.nextAttemptTime ? Math.max(0, this.nextAttemptTime - now) : null,
      successRate: this.stats.totalCalls > 0 ? 
        (this.stats.successfulCalls / this.stats.totalCalls * 100).toFixed(2) + '%' : 
        'N/A',
      failureRate: this.stats.totalCalls > 0 ? 
        (this.stats.failedCalls / this.stats.totalCalls * 100).toFixed(2) + '%' : 
        'N/A'
    };
  }

  getHealth() {
    const recentFailures = this.failures.length;
    const successRate = this.stats.totalCalls > 0 ? 
      this.stats.successfulCalls / this.stats.totalCalls : 1;
    
    if (this.state === 'OPEN') {
      return {
        status: 'unhealthy',
        reason: 'Circuit breaker is open',
        nextRetry: new Date(this.nextAttemptTime)
      };
    }
    
    if (recentFailures >= this.failureThreshold * 0.8) {
      return {
        status: 'warning',
        reason: `High failure rate: ${recentFailures} failures in monitoring period`,
        successRate: `${(successRate * 100).toFixed(2)}%`
      };
    }
    
    return {
      status: 'healthy',
      successRate: `${(successRate * 100).toFixed(2)}%`,
      recentFailures: recentFailures
    };
  }

  // Manual control methods
  forceOpen() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.recoveryTimeout;
  }

  forceClose() {
    this.reset();
  }

  forceHalfOpen() {
    this.state = 'HALF_OPEN';
    this.nextAttemptTime = null;
  }

  // Configuration methods
  setFailureThreshold(threshold) {
    this.failureThreshold = Math.max(1, threshold);
  }

  setRecoveryTimeout(timeout) {
    this.recoveryTimeout = Math.max(1000, timeout);
  }

  setMonitoringPeriod(period) {
    this.monitoringPeriod = Math.max(10000, period);
    
    // Restart cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.setupPeriodicCleanup();
    }
  }

  // Cleanup
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = CircuitBreaker;