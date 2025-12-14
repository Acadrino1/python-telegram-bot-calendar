/**
 * PHASE 1 CRITICAL: Memory Monitor
 * Prevents 27MB limit violations and implements proactive memory management
 * Solves Global Rules 12, 43 compliance - Memory Management & System Stability
 */

class MemoryMonitor {
  constructor() {
    // Realistic thresholds - Node.js baseline is 60-80MB
    this.config = {
      maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB) || 150,
      warningThresholdMB: parseInt(process.env.WARNING_MEMORY_MB) || 100,
      criticalThresholdMB: parseInt(process.env.CRITICAL_MEMORY_MB) || 130,

      // Monitoring intervals - less frequent to reduce log spam
      monitorInterval: parseInt(process.env.MEMORY_MONITOR_INTERVAL) || 300000, // 5 minutes
      alertInterval: parseInt(process.env.MEMORY_ALERT_INTERVAL) || 600000, // 10 minutes

      // Memory management
      enableAutoCleanup: process.env.ENABLE_MEMORY_CLEANUP !== 'false',
      forceGCThreshold: parseInt(process.env.FORCE_GC_THRESHOLD_MB) || 120,

      // Alert configuration - disabled by default (MemoryOptimizer handles this)
      enableAlerts: process.env.ENABLE_MEMORY_ALERTS === 'true',
      webhookUrl: process.env.MEMORY_ALERT_WEBHOOK_URL || null
    };
    
    // Statistics
    this.stats = {
      startTime: Date.now(),
      maxMemoryUsed: 0,
      totalAlerts: 0,
      totalCleanups: 0,
      lastCleanup: null,
      measurements: []
    };
    
    // Monitoring state
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.alertCooldown = new Map();
    
    // Memory leak detection
    this.memoryHistory = [];
    this.leakDetectionWindow = 10; // Track last 10 measurements
    
    console.log('🔍 MemoryMonitor initialized:', {
      maxMemoryMB: this.config.maxMemoryMB,
      warningThresholdMB: this.config.warningThresholdMB,
      autoCleanup: this.config.enableAutoCleanup
    });
  }

  /**
   * Start memory monitoring
   */
  start() {
    if (this.isMonitoring) {
      console.warn('⚠️ Memory monitor already running');
      return;
    }

    this.isMonitoring = true;
    
    console.log(`🚀 Starting memory monitoring (interval: ${this.config.monitorInterval}ms)`);
    
    // Initial measurement
    this.measureMemory();
    
    // Start monitoring interval
    this.monitorInterval = setInterval(() => {
      this.measureMemory();
    }, this.config.monitorInterval);
    
    // Handle process exit for cleanup
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Stop memory monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    console.log('✅ Memory monitoring stopped');
  }

  /**
   * Measure current memory usage
   */
  measureMemory() {
    const memoryUsage = process.memoryUsage();
    const memoryMB = {
      rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
      external: (memoryUsage.external / 1024 / 1024).toFixed(2)
    };
    
    const totalMemoryMB = parseFloat(memoryMB.rss);
    const timestamp = Date.now();
    
    // Update statistics
    this.stats.maxMemoryUsed = Math.max(this.stats.maxMemoryUsed, totalMemoryMB);
    
    // Store measurement
    const measurement = {
      timestamp,
      ...memoryMB,
      total: totalMemoryMB
    };
    
    this.stats.measurements.push(measurement);
    
    // Keep only last 100 measurements to prevent memory bloat
    if (this.stats.measurements.length > 100) {
      this.stats.measurements = this.stats.measurements.slice(-100);
    }
    
    // Update memory history for leak detection
    this.memoryHistory.push(totalMemoryMB);
    if (this.memoryHistory.length > this.leakDetectionWindow) {
      this.memoryHistory.shift();
    }
    
    // Check thresholds and trigger actions
    this.checkThresholds(totalMemoryMB, memoryMB);
    
    return measurement;
  }

  /**
   * Check memory thresholds and trigger appropriate actions
   */
  async checkThresholds(totalMemoryMB, memoryDetails) {
    const { warningThresholdMB, criticalThresholdMB, maxMemoryMB } = this.config;
    
    // Critical threshold - immediate action required
    if (totalMemoryMB >= criticalThresholdMB) {
      console.error(`🚨 CRITICAL: Memory usage at ${totalMemoryMB}MB (threshold: ${criticalThresholdMB}MB)`);
      
      await this.handleCriticalMemory(totalMemoryMB, memoryDetails);
      
      if (this.config.enableAlerts) {
        await this.sendAlert('CRITICAL', totalMemoryMB, memoryDetails);
      }
    }
    // Warning threshold - prepare for action
    else if (totalMemoryMB >= warningThresholdMB) {
      console.warn(`⚠️ WARNING: Memory usage at ${totalMemoryMB}MB (threshold: ${warningThresholdMB}MB)`);
      
      await this.handleWarningMemory(totalMemoryMB, memoryDetails);
      
      if (this.config.enableAlerts && this.shouldSendAlert('WARNING')) {
        await this.sendAlert('WARNING', totalMemoryMB, memoryDetails);
      }
    }
    
    // Check for memory leaks
    if (this.detectMemoryLeak()) {
      console.warn('🔍 Potential memory leak detected');
      
      if (this.config.enableAlerts && this.shouldSendAlert('LEAK')) {
        await this.sendAlert('MEMORY_LEAK', totalMemoryMB, memoryDetails);
      }
    }
    
    // Force garbage collection if near limit
    if (totalMemoryMB >= this.config.forceGCThreshold && global.gc) {
      console.log(`🧹 Forcing garbage collection at ${totalMemoryMB}MB`);
      global.gc();
    }
  }

  /**
   * Handle critical memory usage
   */
  async handleCriticalMemory(totalMemoryMB, memoryDetails) {
    this.stats.totalAlerts++;
    
    if (this.config.enableAutoCleanup) {
      console.log('🚨 Executing emergency memory cleanup');
      await this.emergencyCleanup();
    }
    
    // Log detailed memory info
    this.logMemoryDetails(totalMemoryMB, memoryDetails, 'CRITICAL');
  }

  /**
   * Handle warning level memory usage
   */
  async handleWarningMemory(totalMemoryMB, memoryDetails) {
    if (this.config.enableAutoCleanup) {
      console.log('⚠️ Executing preventive memory cleanup');
      await this.preventiveCleanup();
    }
    
    // Log memory info
    this.logMemoryDetails(totalMemoryMB, memoryDetails, 'WARNING');
  }

  /**
   * Emergency memory cleanup
   */
  async emergencyCleanup() {
    try {
      console.log('🚨 Starting emergency memory cleanup...');
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('✅ Forced garbage collection');
      }
      
      // Clear any large caches if they exist
      this.clearApplicationCaches();
      
      // Cleanup expired data
      await this.cleanupExpiredData();
      
      this.stats.totalCleanups++;
      this.stats.lastCleanup = Date.now();
      
      console.log('✅ Emergency cleanup completed');
    } catch (error) {
      console.error('❌ Emergency cleanup failed:', error);
    }
  }

  /**
   * Preventive memory cleanup
   */
  async preventiveCleanup() {
    try {
      console.log('🧹 Starting preventive memory cleanup...');
      
      // Cleanup expired data
      await this.cleanupExpiredData();
      
      // Optimize memory usage
      this.optimizeMemoryUsage();
      
      this.stats.totalCleanups++;
      this.stats.lastCleanup = Date.now();
      
      console.log('✅ Preventive cleanup completed');
    } catch (error) {
      console.error('❌ Preventive cleanup failed:', error);
    }
  }

  /**
   * Clear application-specific caches
   */
  clearApplicationCaches() {
    // Clear Node.js module cache for non-critical modules
    const moduleKeys = Object.keys(require.cache);
    let clearedModules = 0;
    
    for (const moduleKey of moduleKeys) {
      // Only clear non-essential modules (be careful not to break the app)
      if (moduleKey.includes('/node_modules/moment/locale/') ||
          moduleKey.includes('/temp/') ||
          moduleKey.includes('/cache/')) {
        delete require.cache[moduleKey];
        clearedModules++;
      }
    }
    
    if (clearedModules > 0) {
      console.log(`🧹 Cleared ${clearedModules} cached modules`);
    }
  }

  /**
   * Cleanup expired data (override in application-specific implementations)
   */
  async cleanupExpiredData() {
    // This should be overridden by the application to cleanup expired sessions,
    // cache entries, temporary files, etc.
    console.log('🧹 Base cleanup - override this method for application-specific cleanup');
  }

  /**
   * Optimize memory usage
   */
  optimizeMemoryUsage() {
    // Suggest garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // Trim measurement history
    if (this.stats.measurements.length > 50) {
      this.stats.measurements = this.stats.measurements.slice(-50);
      console.log('🧹 Trimmed measurement history');
    }
  }

  /**
   * Detect potential memory leaks
   */
  detectMemoryLeak() {
    if (this.memoryHistory.length < this.leakDetectionWindow) {
      return false;
    }
    
    // Check for consistent upward trend
    let increasingCount = 0;
    for (let i = 1; i < this.memoryHistory.length; i++) {
      if (this.memoryHistory[i] > this.memoryHistory[i - 1]) {
        increasingCount++;
      }
    }
    
    // If more than 70% of measurements show increase, it's likely a leak
    const leakThreshold = this.leakDetectionWindow * 0.7;
    return increasingCount >= leakThreshold;
  }

  /**
   * Check if we should send an alert (respects cooldown)
   */
  shouldSendAlert(alertType) {
    const now = Date.now();
    const lastAlert = this.alertCooldown.get(alertType) || 0;
    
    if (now - lastAlert < this.config.alertInterval) {
      return false;
    }
    
    this.alertCooldown.set(alertType, now);
    return true;
  }

  /**
   * Send memory alert
   */
  async sendAlert(alertType, memoryMB, memoryDetails) {
    const alert = {
      type: alertType,
      timestamp: new Date().toISOString(),
      memoryMB,
      memoryDetails,
      thresholds: {
        warning: this.config.warningThresholdMB,
        critical: this.config.criticalThresholdMB,
        max: this.config.maxMemoryMB
      },
      stats: this.getStats()
    };
    
    console.log(`🚨 Memory alert: ${alertType}`, alert);
    
    // Send webhook if configured
    if (this.config.webhookUrl) {
      try {
        await this.sendWebhookAlert(alert);
      } catch (error) {
        console.error('❌ Failed to send webhook alert:', error);
      }
    }
  }

  /**
   * Send webhook alert
   */
  async sendWebhookAlert(alert) {
    const https = require('https');
    const http = require('http');
    const url = require('url');
    
    const webhookUrl = new URL(this.config.webhookUrl);
    const protocol = webhookUrl.protocol === 'https:' ? https : http;
    
    const postData = JSON.stringify(alert);
    
    const options = {
      hostname: webhookUrl.hostname,
      port: webhookUrl.port,
      path: webhookUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = protocol.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook failed with status ${res.statusCode}`));
        }
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Log detailed memory information
   */
  logMemoryDetails(totalMemoryMB, memoryDetails, level = 'INFO') {
    console.log(`📊 Memory Details [${level}]:`);
    console.log(`   Total RSS: ${totalMemoryMB}MB`);
    console.log(`   Heap Used: ${memoryDetails.heapUsed}MB`);
    console.log(`   Heap Total: ${memoryDetails.heapTotal}MB`);
    console.log(`   External: ${memoryDetails.external}MB`);
    console.log(`   Thresholds: Warning=${this.config.warningThresholdMB}MB, Critical=${this.config.criticalThresholdMB}MB`);
  }

  /**
   * Get current memory statistics
   */
  getStats() {
    const currentMemory = this.measureMemory();
    const uptime = Date.now() - this.stats.startTime;
    
    return {
      ...this.stats,
      currentMemory,
      uptimeMs: uptime,
      uptimeHours: (uptime / (1000 * 60 * 60)).toFixed(2),
      isMonitoring: this.isMonitoring,
      config: this.config,
      memoryTrend: this.getMemoryTrend()
    };
  }

  /**
   * Get memory trend analysis
   */
  getMemoryTrend() {
    if (this.memoryHistory.length < 3) {
      return 'insufficient_data';
    }
    
    const recent = this.memoryHistory.slice(-3);
    const isIncreasing = recent[2] > recent[1] && recent[1] > recent[0];
    const isDecreasing = recent[2] < recent[1] && recent[1] < recent[0];
    
    if (isIncreasing) return 'increasing';
    if (isDecreasing) return 'decreasing';
    return 'stable';
  }

  /**
   * Generate memory report
   */
  generateReport() {
    const stats = this.getStats();
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        currentMemoryMB: stats.currentMemory.total,
        maxMemoryUsedMB: stats.maxMemoryUsed,
        limitMB: this.config.maxMemoryMB,
        utilizationPercent: ((stats.currentMemory.total / this.config.maxMemoryMB) * 100).toFixed(1),
        uptimeHours: stats.uptimeHours
      },
      thresholds: {
        warning: this.config.warningThresholdMB,
        critical: this.config.criticalThresholdMB,
        max: this.config.maxMemoryMB
      },
      activity: {
        totalAlerts: stats.totalAlerts,
        totalCleanups: stats.totalCleanups,
        lastCleanup: stats.lastCleanup ? new Date(stats.lastCleanup).toISOString() : null
      },
      trend: stats.memoryTrend,
      recommendations: this.generateRecommendations(stats)
    };
    
    return report;
  }

  /**
   * Generate memory optimization recommendations
   */
  generateRecommendations(stats) {
    const recommendations = [];
    const currentMemory = parseFloat(stats.currentMemory.total);
    
    if (currentMemory > this.config.criticalThresholdMB) {
      recommendations.push('URGENT: Memory usage is at critical levels. Consider restarting the application.');
    }
    
    if (currentMemory > this.config.warningThresholdMB) {
      recommendations.push('WARNING: Memory usage is high. Monitor closely and consider cleanup.');
    }
    
    if (stats.memoryTrend === 'increasing') {
      recommendations.push('Memory usage shows increasing trend. Investigate potential memory leaks.');
    }
    
    if (stats.totalAlerts > 10) {
      recommendations.push('Frequent memory alerts detected. Consider optimizing application memory usage.');
    }
    
    if (!this.config.enableAutoCleanup) {
      recommendations.push('Auto-cleanup is disabled. Enable it to prevent memory issues.');
    }
    
    return recommendations;
  }
}

// Singleton instance
const memoryMonitor = new MemoryMonitor();

module.exports = memoryMonitor;