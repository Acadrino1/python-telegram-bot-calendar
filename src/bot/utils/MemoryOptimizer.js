/**
 * Memory Optimizer for Telegram Bot
 * Provides automatic memory management and cleanup
 */

class MemoryOptimizer {
  constructor(options = {}) {
    this.config = {
      maxMemoryMB: options.maxMemoryMB || 50,
      warningThresholdMB: options.warningThresholdMB || 35,
      criticalThresholdMB: options.criticalThresholdMB || 45,
      cleanupIntervalMs: options.cleanupIntervalMs || 60000, // 1 minute
      enableAutoCleanup: options.enableAutoCleanup !== false,
      enableGarbageCollection: options.enableGarbageCollection !== false,
      ...options
    };

    this.stats = {
      cleanupRuns: 0,
      memoryFreed: 0,
      lastCleanup: null,
      peakMemory: 0,
      averageMemory: 0
    };

    this.cleanupTasks = [];
    this.memoryHistory = [];
    
    // Start monitoring if enabled
    if (this.config.enableAutoCleanup) {
      this.startMonitoring();
    }

    console.log('🧹 MemoryOptimizer initialized');
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.cleanupIntervalMs);

    console.log('🔍 Memory monitoring started');
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('⏹️ Memory monitoring stopped');
  }

  /**
   * Check current memory usage
   */
  checkMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const rssInMB = Math.round(memoryUsage.rss / 1024 / 1024);

    // Track memory history
    this.memoryHistory.push({
      timestamp: Date.now(),
      rss: rssInMB,
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
    });

    // Keep only last 60 entries (1 hour if checking every minute)
    if (this.memoryHistory.length > 60) {
      this.memoryHistory.shift();
    }

    // Update stats
    this.stats.peakMemory = Math.max(this.stats.peakMemory, rssInMB);
    this.stats.averageMemory = this.memoryHistory.reduce((sum, entry) => sum + entry.rss, 0) / this.memoryHistory.length;

    // Check thresholds
    if (rssInMB >= this.config.criticalThresholdMB) {
      console.warn(`🚨 CRITICAL: Memory usage ${rssInMB}MB >= ${this.config.criticalThresholdMB}MB`);
      this.performEmergencyCleanup();
    } else if (rssInMB >= this.config.warningThresholdMB) {
      console.warn(`⚠️ WARNING: Memory usage ${rssInMB}MB >= ${this.config.warningThresholdMB}MB`);
      this.performStandardCleanup();
    }

    return {
      current: rssInMB,
      peak: this.stats.peakMemory,
      average: Math.round(this.stats.averageMemory),
      threshold: this.config.warningThresholdMB
    };
  }

  /**
   * Register a cleanup task
   */
  registerCleanupTask(name, cleanupFunction, priority = 'normal') {
    this.cleanupTasks.push({
      name,
      function: cleanupFunction,
      priority,
      lastRun: null,
      runCount: 0
    });

    console.log(`📝 Registered cleanup task: ${name} (${priority})`);
  }

  /**
   * Perform standard cleanup
   */
  async performStandardCleanup() {
    const startMemory = process.memoryUsage().rss;
    let tasksRun = 0;

    console.log('🧹 Starting standard memory cleanup...');

    // Run normal priority tasks
    for (const task of this.cleanupTasks) {
      if (task.priority === 'normal' || task.priority === 'low') {
        try {
          await task.function();
          task.lastRun = Date.now();
          task.runCount++;
          tasksRun++;
        } catch (error) {
          console.error(`❌ Cleanup task '${task.name}' failed:`, error);
        }
      }
    }

    // Force garbage collection if enabled
    if (this.config.enableGarbageCollection && global.gc) {
      global.gc();
      console.log('♻️ Forced garbage collection');
    }

    const endMemory = process.memoryUsage().rss;
    const freedMB = Math.round((startMemory - endMemory) / 1024 / 1024);

    this.stats.cleanupRuns++;
    this.stats.memoryFreed += Math.max(0, freedMB);
    this.stats.lastCleanup = Date.now();

    console.log(`✅ Standard cleanup complete: ${tasksRun} tasks run, ${freedMB}MB freed`);
  }

  /**
   * Perform emergency cleanup
   */
  async performEmergencyCleanup() {
    const startMemory = process.memoryUsage().rss;
    let tasksRun = 0;

    console.log('🚨 Starting emergency memory cleanup...');

    // Run all cleanup tasks, starting with high priority
    const sortedTasks = this.cleanupTasks.sort((a, b) => {
      const priorities = { 'high': 3, 'normal': 2, 'low': 1 };
      return (priorities[b.priority] || 2) - (priorities[a.priority] || 2);
    });

    for (const task of sortedTasks) {
      try {
        await task.function();
        task.lastRun = Date.now();
        task.runCount++;
        tasksRun++;
      } catch (error) {
        console.error(`❌ Emergency cleanup task '${task.name}' failed:`, error);
      }
    }

    // Multiple garbage collection cycles
    if (this.config.enableGarbageCollection && global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
        await this.sleep(100);
      }
      console.log('♻️ Multiple garbage collection cycles completed');
    }

    const endMemory = process.memoryUsage().rss;
    const freedMB = Math.round((startMemory - endMemory) / 1024 / 1024);

    this.stats.cleanupRuns++;
    this.stats.memoryFreed += Math.max(0, freedMB);
    this.stats.lastCleanup = Date.now();

    console.log(`✅ Emergency cleanup complete: ${tasksRun} tasks run, ${freedMB}MB freed`);

    // If still above critical threshold, log warning
    const currentMemory = Math.round(process.memoryUsage().rss / 1024 / 1024);
    if (currentMemory >= this.config.criticalThresholdMB) {
      console.error(`🚨 Memory still critical after cleanup: ${currentMemory}MB`);
    }
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    const memoryUsage = process.memoryUsage();
    const currentMemory = Math.round(memoryUsage.rss / 1024 / 1024);

    return {
      current: {
        rss: currentMemory,
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      limits: {
        warning: this.config.warningThresholdMB,
        critical: this.config.criticalThresholdMB,
        maximum: this.config.maxMemoryMB
      },
      stats: {
        ...this.stats,
        averageMemory: Math.round(this.stats.averageMemory)
      },
      history: this.memoryHistory.slice(-10), // Last 10 entries
      status: this.getMemoryStatus(currentMemory)
    };
  }

  /**
   * Get memory status
   */
  getMemoryStatus(currentMemory) {
    if (currentMemory >= this.config.criticalThresholdMB) {
      return 'CRITICAL';
    } else if (currentMemory >= this.config.warningThresholdMB) {
      return 'WARNING';
    } else {
      return 'OK';
    }
  }

  /**
   * Get cleanup task statistics
   */
  getCleanupStats() {
    return {
      registeredTasks: this.cleanupTasks.length,
      tasks: this.cleanupTasks.map(task => ({
        name: task.name,
        priority: task.priority,
        runCount: task.runCount,
        lastRun: task.lastRun ? new Date(task.lastRun).toISOString() : null
      })),
      totalRuns: this.stats.cleanupRuns,
      totalMemoryFreed: this.stats.memoryFreed,
      lastCleanup: this.stats.lastCleanup ? new Date(this.stats.lastCleanup).toISOString() : null
    };
  }

  /**
   * Manual cleanup trigger
   */
  async triggerCleanup(type = 'standard') {
    if (type === 'emergency') {
      await this.performEmergencyCleanup();
    } else {
      await this.performStandardCleanup();
    }
  }

  /**
   * Generate memory report
   */
  generateReport() {
    const memStats = this.getMemoryStats();
    const cleanupStats = this.getCleanupStats();

    return `
🧹 **Memory Optimizer Report**

📊 **Current Usage:**
- RSS: ${memStats.current.rss}MB
- Heap Used: ${memStats.current.heapUsed}MB
- Heap Total: ${memStats.current.heapTotal}MB
- Status: ${memStats.status}

📈 **Statistics:**
- Peak Memory: ${memStats.stats.peakMemory}MB
- Average Memory: ${memStats.stats.averageMemory}MB
- Cleanup Runs: ${memStats.stats.cleanupRuns}
- Memory Freed: ${memStats.stats.memoryFreed}MB

⚙️ **Thresholds:**
- Warning: ${memStats.limits.warning}MB
- Critical: ${memStats.limits.critical}MB
- Maximum: ${memStats.limits.maximum}MB

🧽 **Cleanup Tasks:**
- Registered: ${cleanupStats.registeredTasks}
- Total Runs: ${cleanupStats.totalRuns}
- Last Cleanup: ${cleanupStats.lastCleanup || 'Never'}
    `;
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown optimizer
   */
  shutdown() {
    this.stopMonitoring();
    this.cleanupTasks = [];
    this.memoryHistory = [];
    
    console.log('🛑 MemoryOptimizer shutdown complete');
  }
}

module.exports = MemoryOptimizer;