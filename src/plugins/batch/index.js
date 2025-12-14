const BasePlugin = require('../../core/BasePlugin');

/**
 * BatchPlugin - Handles batch processing for high-volume operations
 */
class BatchPlugin extends BasePlugin {
  constructor(bot, config = {}) {
    super(bot, config);
    
    this.name = 'batch';
    this.version = '1.0.0';
    this.description = 'Batch processing for high-volume operations';
    
    // Batch configuration
    this.batchConfig = {
      maxSize: config.maxBatchSize || 100,
      maxWait: config.maxWaitTime || 1000, // milliseconds
      concurrency: config.concurrency || 5,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000
    };
    
    // Batch queues
    this.queues = new Map();
    this.processors = new Map();
    this.timers = new Map();
    
    // Statistics
    this.stats = {
      processed: 0,
      failed: 0,
      retried: 0,
      queued: 0
    };
  }
  
  async initialize() {
    try {
      // Register default batch processors
      this.registerDefaultProcessors();
      
      // Make batch processing available to bot
      this.bot.batch = this;
      
      // Setup middleware for batch operations
      this.setupMiddleware();
      
      this.logger.info('Batch plugin initialized');
    } catch (error) {
      this.logger.error('Batch plugin initialization error:', error);
      throw error;
    }
  }
  
  registerDefaultProcessors() {
    // Batch message sending
    this.registerProcessor('sendMessage', async (items) => {
      const results = [];
      
      for (const item of items) {
        try {
          const result = await this.telegram.sendMessage(
            item.chatId,
            item.text,
            item.options
          );
          results.push({ success: true, data: result, item });
        } catch (error) {
          results.push({ success: false, error: error.message, item });
        }
      }
      
      return results;
    });
    
    // Batch notifications
    this.registerProcessor('notification', async (items) => {
      const results = [];
      
      // Group by notification type
      const grouped = this.groupBy(items, 'type');
      
      for (const [type, notifications] of Object.entries(grouped)) {
        try {
          // Process each group
          const processed = await this.processNotificationBatch(type, notifications);
          results.push(...processed);
        } catch (error) {
          this.logger.error(`Batch notification error for type ${type}:`, error);
          notifications.forEach(n => {
            results.push({ success: false, error: error.message, item: n });
          });
        }
      }
      
      return results;
    });
    
    // Batch database operations
    this.registerProcessor('database', async (items) => {
      const results = [];
      
      // Group by operation type
      const grouped = this.groupBy(items, 'operation');
      
      for (const [operation, ops] of Object.entries(grouped)) {
        try {
          const processed = await this.processDatabaseBatch(operation, ops);
          results.push(...processed);
        } catch (error) {
          this.logger.error(`Batch database error for ${operation}:`, error);
          ops.forEach(op => {
            results.push({ success: false, error: error.message, item: op });
          });
        }
      }
      
      return results;
    });
  }
  
  setupMiddleware() {
    // Add batch context to telegram context
    this.telegram.use((ctx, next) => {
      ctx.batch = {
        add: (type, data) => this.add(type, data),
        flush: (type) => this.flush(type),
        process: (type, items) => this.process(type, items)
      };
      
      return next();
    });
  }
  
  /**
   * Register a batch processor
   */
  registerProcessor(type, processor) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }
    
    this.processors.set(type, processor);
    this.logger.info(`Registered batch processor: ${type}`);
  }
  
  /**
   * Add item to batch queue
   */
  add(type, item) {
    if (!this.processors.has(type)) {
      throw new Error(`No processor registered for type: ${type}`);
    }
    
    // Get or create queue
    if (!this.queues.has(type)) {
      this.queues.set(type, []);
    }
    
    const queue = this.queues.get(type);
    queue.push({
      ...item,
      timestamp: Date.now(),
      id: this.generateId()
    });
    
    this.stats.queued++;
    
    // Check if batch should be processed
    if (queue.length >= this.batchConfig.maxSize) {
      this.flush(type);
    } else {
      // Set timer for auto-flush
      this.setFlushTimer(type);
    }
    
    return item;
  }
  
  /**
   * Set flush timer for a batch type
   */
  setFlushTimer(type) {
    // Clear existing timer
    if (this.timers.has(type)) {
      clearTimeout(this.timers.get(type));
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.flush(type);
    }, this.batchConfig.maxWait);
    
    this.timers.set(type, timer);
  }
  
  /**
   * Flush and process a batch
   */
  async flush(type) {
    // Clear timer
    if (this.timers.has(type)) {
      clearTimeout(this.timers.get(type));
      this.timers.delete(type);
    }
    
    // Get queue
    const queue = this.queues.get(type);
    if (!queue || queue.length === 0) {
      return [];
    }
    
    // Extract items
    const items = queue.splice(0, this.batchConfig.maxSize);
    
    // Process batch
    return await this.process(type, items);
  }
  
  /**
   * Process a batch of items
   */
  async process(type, items) {
    const processor = this.processors.get(type);
    if (!processor) {
      throw new Error(`No processor registered for type: ${type}`);
    }
    
    try {
      // Split into chunks for concurrency control
      const chunks = this.chunk(items, Math.ceil(items.length / this.batchConfig.concurrency));
      const results = [];
      
      // Process chunks in parallel
      const chunkPromises = chunks.map(chunk => 
        this.processWithRetry(processor, chunk)
      );
      
      const chunkResults = await Promise.all(chunkPromises);
      chunkResults.forEach(r => results.push(...r));
      
      // Update statistics
      results.forEach(result => {
        if (result.success) {
          this.stats.processed++;
        } else {
          this.stats.failed++;
        }
      });
      
      return results;
      
    } catch (error) {
      this.logger.error(`Batch processing error for type ${type}:`, error);
      this.stats.failed += items.length;
      
      return items.map(item => ({
        success: false,
        error: error.message,
        item
      }));
    }
  }
  
  /**
   * Process with retry logic
   */
  async processWithRetry(processor, items, attempt = 1) {
    try {
      return await processor(items);
    } catch (error) {
      if (attempt < this.batchConfig.retryAttempts) {
        this.stats.retried += items.length;
        
        // Wait before retry
        await this.delay(this.batchConfig.retryDelay * attempt);
        
        // Retry
        return await this.processWithRetry(processor, items, attempt + 1);
      }
      
      // Max retries reached
      throw error;
    }
  }
  
  /**
   * Process notification batch
   */
  async processNotificationBatch(type, notifications) {
    const results = [];
    
    // Optimize by grouping recipients
    const byRecipient = this.groupBy(notifications, 'recipientId');
    
    for (const [recipientId, items] of Object.entries(byRecipient)) {
      try {
        // Combine messages for same recipient
        const combined = this.combineNotifications(items);
        
        // Send combined notification
        await this.telegram.sendMessage(recipientId, combined.text, combined.options);
        
        items.forEach(item => {
          results.push({ success: true, item });
        });
      } catch (error) {
        items.forEach(item => {
          results.push({ success: false, error: error.message, item });
        });
      }
    }
    
    return results;
  }
  
  /**
   * Process database batch
   */
  async processDatabaseBatch(operation, items) {
    const results = [];
    
    switch (operation) {
      case 'insert':
        // Bulk insert
        try {
          const inserted = await this.bulkInsert(items);
          inserted.forEach((success, index) => {
            results.push({
              success,
              item: items[index]
            });
          });
        } catch (error) {
          items.forEach(item => {
            results.push({ success: false, error: error.message, item });
          });
        }
        break;
        
      case 'update':
        // Bulk update
        try {
          const updated = await this.bulkUpdate(items);
          updated.forEach((success, index) => {
            results.push({
              success,
              item: items[index]
            });
          });
        } catch (error) {
          items.forEach(item => {
            results.push({ success: false, error: error.message, item });
          });
        }
        break;
        
      default:
        // Process individually
        for (const item of items) {
          try {
            await this.processIndividual(operation, item);
            results.push({ success: true, item });
          } catch (error) {
            results.push({ success: false, error: error.message, item });
          }
        }
    }
    
    return results;
  }
  
  /**
   * Combine notifications for same recipient
   */
  combineNotifications(items) {
    if (items.length === 1) {
      return items[0];
    }
    
    // Combine text
    const texts = items.map(i => i.text);
    const combined = texts.join('\n\n---\n\n');
    
    return {
      text: `📬 You have ${items.length} notifications:\n\n${combined}`,
      options: items[0].options
    };
  }
  
  /**
   * Bulk insert helper
   */
  async bulkInsert(items) {
    // Implementation depends on database
    // This is a placeholder
    return items.map(() => true);
  }
  
  /**
   * Bulk update helper
   */
  async bulkUpdate(items) {
    // Implementation depends on database
    // This is a placeholder
    return items.map(() => true);
  }
  
  /**
   * Process individual operation
   */
  async processIndividual(operation, item) {
    // Implementation depends on operation
    // This is a placeholder
    return true;
  }
  
  /**
   * Helper: Group array by key
   */
  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key];
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    }, {});
  }
  
  /**
   * Helper: Chunk array
   */
  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  /**
   * Helper: Delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get batch statistics
   */
  getStats() {
    const queued = Array.from(this.queues.values())
      .reduce((sum, queue) => sum + queue.length, 0);
    
    return {
      ...this.stats,
      queued,
      queues: this.queues.size,
      processors: this.processors.size
    };
  }
  
  /**
   * Flush all queues
   */
  async flushAll() {
    const types = Array.from(this.queues.keys());
    const results = [];
    
    for (const type of types) {
      const typeResults = await this.flush(type);
      results.push(...typeResults);
    }
    
    return results;
  }
  
  async cleanup() {
    // Flush all remaining batches
    await this.flushAll();
    
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
  
  getHealth() {
    const queued = Array.from(this.queues.values())
      .reduce((sum, queue) => sum + queue.length, 0);
    
    if (queued > this.batchConfig.maxSize * 10) {
      return 'unhealthy'; // Too many queued items
    }
    
    if (queued > this.batchConfig.maxSize * 5) {
      return 'degraded';
    }
    
    return 'healthy';
  }
  
  async getMetrics() {
    const baseMetrics = super.getMetrics();
    
    return {
      ...baseMetrics,
      ...this.getStats(),
      config: this.batchConfig
    };
  }
}

module.exports = BatchPlugin;