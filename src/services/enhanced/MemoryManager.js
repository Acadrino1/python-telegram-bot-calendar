/**
 * Enhanced Memory Manager for Telegram Bot
 * Fixes memory leaks and implements proper resource cleanup
 */

const EventEmitter = require('events');

class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Realistic thresholds for Node.js + Telegraf + MySQL + Redis
    this.config = {
      maxMemoryMB: options.maxMemoryMB || 150,
      gcIntervalMs: options.gcIntervalMs || 300000, // 5 minutes
      warningThresholdMB: options.warningThresholdMB || 100,
      criticalThresholdMB: options.criticalThresholdMB || 130,
      enableAutoCleanup: options.enableAutoCleanup !== false,
      ...options
    };
    
    // Track resources
    this.activeTimers = new Set();
    this.activeListeners = new Set();
    this.activeSessions = new Map();
    this.memoryStats = {
      initialRSS: process.memoryUsage().rss,
      maxRSS: 0,
      gcCount: 0,
      lastGC: Date.now()
    };
    
    // Start monitoring if enabled
    if (this.config.enableAutoCleanup) {
      this.startMemoryMonitoring();
    }
    
    console.log('✅ MemoryManager initialized with auto-cleanup');
  }

  /**
   * Start memory monitoring and automatic cleanup
   */
  startMemoryMonitoring() {
    const monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.gcIntervalMs);
    
    this.registerTimer(monitoringInterval, 'memory-monitoring');
    
    // Set up process monitoring
    process.on('memoryUsage', (usage) => {
      this.handleMemoryUsage(usage);
    });
  }

  /**
   * Check current memory usage and trigger cleanup if needed
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const rssInMB = usage.rss / 1024 / 1024;
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    // Update stats
    this.memoryStats.maxRSS = Math.max(this.memoryStats.maxRSS, usage.rss);
    
    // Emit events based on thresholds
    if (rssInMB >= this.config.criticalThresholdMB) {
      this.emit('memory-critical', { rssInMB, heapUsedMB, usage });
      this.performEmergencyCleanup();
    } else if (rssInMB >= this.config.warningThresholdMB) {
      this.emit('memory-warning', { rssInMB, heapUsedMB, usage });
      this.performStandardCleanup();
    }
    
    // Log memory status periodically
    if (Date.now() - this.memoryStats.lastGC > 60000) { // Every minute
      console.log(`🔍 Memory Status: RSS=${rssInMB.toFixed(1)}MB, Heap=${heapUsedMB.toFixed(1)}MB`);
      this.memoryStats.lastGC = Date.now();
    }
    
    return { rssInMB, heapUsedMB, usage };
  }

  /**
   * Perform standard memory cleanup
   */
  performStandardCleanup() {
    console.log('🧹 Performing standard memory cleanup...');
    
    // Clean expired sessions
    this.cleanExpiredSessions();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      this.memoryStats.gcCount++;
    }
    
    this.emit('cleanup-completed', 'standard');
  }

  /**
   * Perform emergency memory cleanup
   */
  performEmergencyCleanup() {
    console.log('🚨 EMERGENCY: Performing aggressive memory cleanup!');
    
    // Clear all expired sessions immediately
    this.cleanExpiredSessions(true);
    
    // Clear any cached data
    this.clearCaches();
    
    // Force multiple GC cycles
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
        this.memoryStats.gcCount++;
      }
    }
    
    this.emit('cleanup-completed', 'emergency');
  }

  /**
   * Register a timer for tracking
   */
  registerTimer(timer, description = 'unknown') {
    const timerInfo = { timer, description, created: Date.now() };
    this.activeTimers.add(timerInfo);
    return timerInfo;
  }

  /**
   * Clear a specific timer
   */
  clearTimer(timerInfo) {
    if (timerInfo && timerInfo.timer) {
      clearInterval(timerInfo.timer);
      clearTimeout(timerInfo.timer);
      this.activeTimers.delete(timerInfo);
    }
  }

  /**
   * Register an event listener for tracking
   */
  registerListener(emitter, event, listener, description = 'unknown') {
    const listenerInfo = {
      emitter,
      event,
      listener,
      description,
      created: Date.now()
    };
    
    this.activeListeners.add(listenerInfo);
    emitter.on(event, listener);
    
    return listenerInfo;
  }

  /**
   * Remove a specific listener
   */
  removeListener(listenerInfo) {
    if (listenerInfo && listenerInfo.emitter) {
      listenerInfo.emitter.removeListener(listenerInfo.event, listenerInfo.listener);
      this.activeListeners.delete(listenerInfo);
    }
  }

  /**
   * Register a session for tracking
   */
  registerSession(sessionId, sessionData, ttlMs = 300000) { // 5 minutes default
    const expiresAt = Date.now() + ttlMs;
    this.activeSessions.set(sessionId, {
      data: sessionData,
      expiresAt,
      created: Date.now()
    });
  }

  /**
   * Get session data
   */
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;
    
    // Check if expired
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      return null;
    }
    
    return session.data;
  }

  /**
   * Clean expired sessions
   */
  cleanExpiredSessions(force = false) {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (force || now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired sessions`);
    }
    
    return cleanedCount;
  }

  /**
   * Clear all caches (override in subclasses)
   */
  clearCaches() {
    // Override in subclasses to clear specific caches
    console.log('🧹 Clearing caches...');
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const usage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      memoryUsage: {
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100
      },
      tracking: {
        activeTimers: this.activeTimers.size,
        activeListeners: this.activeListeners.size,
        activeSessions: this.activeSessions.size,
        gcCount: this.memoryStats.gcCount
      },
      thresholds: {
        warning: this.config.warningThresholdMB,
        critical: this.config.criticalThresholdMB,
        max: this.config.maxMemoryMB
      },
      uptime: Math.round(uptime)
    };
  }

  /**
   * Perform complete cleanup and shutdown
   */
  shutdown() {
    console.log('🔄 MemoryManager shutting down...');
    
    // Clear all timers
    for (const timerInfo of this.activeTimers) {
      this.clearTimer(timerInfo);
    }
    
    // Remove all listeners
    for (const listenerInfo of this.activeListeners) {
      this.removeListener(listenerInfo);
    }
    
    // Clear all sessions
    this.activeSessions.clear();
    
    // Final cleanup
    this.performStandardCleanup();
    
    console.log('✅ MemoryManager shutdown complete');
  }
}

module.exports = MemoryManager;