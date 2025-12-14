/**
 * CleanupManager - Centralized memory leak prevention
 * Tracks and cleans up all intervals and timeouts to prevent memory leaks
 */

class CleanupManager {
  constructor() {
    this.intervals = new Set();
    this.timeouts = new Set();
    this.resources = new Set();
    this.isShuttingDown = false;
    
    // Bind cleanup method
    this.cleanup = this.cleanup.bind(this);
    
    // Register cleanup on process termination
    this.registerProcessHandlers();
    
    console.log('📋 CleanupManager initialized - Memory leak prevention active');
  }
  
  registerProcessHandlers() {
    process.on('SIGINT', this.cleanup);
    process.on('SIGTERM', this.cleanup);
    process.on('exit', this.cleanup);
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception - Cleaning up:', error);
      this.cleanup();
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection - Cleaning up:', reason);
      this.cleanup();
    });
  }
  
  /**
   * Managed setInterval that auto-cleans on process exit
   */
  setInterval(callback, delay, name = 'unnamed') {
    if (this.isShuttingDown) {
      console.warn('⚠️ CleanupManager: Attempted to create interval during shutdown');
      return null;
    }
    
    const intervalId = setInterval(callback, delay);
    this.intervals.add({
      id: intervalId,
      name,
      created: new Date().toISOString()
    });
    
    console.log(`⏱️ Created managed interval: ${name} (${delay}ms)`);
    return intervalId;
  }
  
  /**
   * Managed setTimeout that auto-cleans on process exit
   */
  setTimeout(callback, delay, name = 'unnamed') {
    if (this.isShuttingDown) {
      console.warn('⚠️ CleanupManager: Attempted to create timeout during shutdown');
      return null;
    }
    
    const timeoutId = setTimeout(() => {
      // Auto-remove from tracking when timeout completes
      this.timeouts.delete(timeoutId);
      callback();
    }, delay);
    
    this.timeouts.add({
      id: timeoutId,
      name,
      created: new Date().toISOString()
    });
    
    console.log(`⏰ Created managed timeout: ${name} (${delay}ms)`);
    return timeoutId;
  }
  
  /**
   * Clear specific interval
   */
  clearInterval(intervalId) {
    if (!intervalId) return;
    
    clearInterval(intervalId);
    
    // Find and remove from set
    for (const item of this.intervals) {
      if (item.id === intervalId) {
        this.intervals.delete(item);
        console.log(`✅ Cleared interval: ${item.name}`);
        break;
      }
    }
  }
  
  /**
   * Clear specific timeout
   */
  clearTimeout(timeoutId) {
    if (!timeoutId) return;
    
    clearTimeout(timeoutId);
    
    // Find and remove from set
    for (const item of this.timeouts) {
      if (item.id === timeoutId) {
        this.timeouts.delete(item);
        console.log(`✅ Cleared timeout: ${item.name}`);
        break;
      }
    }
  }
  
  /**
   * Register a resource for cleanup
   */
  registerResource(resource, name = 'unnamed') {
    this.resources.add({
      resource,
      name,
      cleanup: typeof resource.cleanup === 'function' ? resource.cleanup.bind(resource) : null
    });
    
    console.log(`📦 Registered resource for cleanup: ${name}`);
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      activeIntervals: this.intervals.size,
      activeTimeouts: this.timeouts.size,
      registeredResources: this.resources.size,
      isShuttingDown: this.isShuttingDown
    };
  }
  
  /**
   * Comprehensive cleanup of all managed resources
   */
  cleanup() {
    if (this.isShuttingDown) {
      return; // Already cleaning up
    }
    
    this.isShuttingDown = true;
    
    console.log('🧹 CleanupManager: Starting comprehensive cleanup...');
    
    // Clear all intervals
    let intervalCount = 0;
    this.intervals.forEach(item => {
      try {
        clearInterval(item.id);
        intervalCount++;
        console.log(`  ✅ Cleared interval: ${item.name}`);
      } catch (error) {
        console.error(`  ❌ Error clearing interval ${item.name}:`, error);
      }
    });
    
    // Clear all timeouts
    let timeoutCount = 0;
    this.timeouts.forEach(item => {
      try {
        clearTimeout(item.id);
        timeoutCount++;
        console.log(`  ✅ Cleared timeout: ${item.name}`);
      } catch (error) {
        console.error(`  ❌ Error clearing timeout ${item.name}:`, error);
      }
    });
    
    // Cleanup registered resources
    let resourceCount = 0;
    this.resources.forEach(item => {
      try {
        if (item.cleanup) {
          item.cleanup();
          resourceCount++;
          console.log(`  ✅ Cleaned up resource: ${item.name}`);
        }
      } catch (error) {
        console.error(`  ❌ Error cleaning up resource ${item.name}:`, error);
      }
    });
    
    // Clear all sets
    this.intervals.clear();
    this.timeouts.clear();
    this.resources.clear();
    
    console.log(`🧹 Cleanup completed: ${intervalCount} intervals, ${timeoutCount} timeouts, ${resourceCount} resources`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('🗑️ Forced garbage collection');
    }
  }
  
  /**
   * Get memory usage info
   */
  getMemoryInfo() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(usage.external / 1024 / 1024) + 'MB',
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
      managedResources: this.getStatus()
    };
  }
}

// Create singleton instance
const cleanupManager = new CleanupManager();

// Export singleton
module.exports = cleanupManager;