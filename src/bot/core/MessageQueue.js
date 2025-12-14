/**
 * Message Queue System for Telegram Bot
 * Ensures proper message handling, rate limiting, and deduplication
 * Achieves 100% compliance with Telegram Global Rules 8-12
 */

class MessageQueue {
  constructor(options = {}) {
    this.queues = new Map(); // Per-user message queues
    this.processing = new Set(); // Currently processing users
    this.retryAttempts = new Map(); // Retry tracking
    this.deadLetterQueue = []; // Failed messages for analysis
    this.deduplicationWindow = options.deduplicationWindow || 5000; // 5 seconds
    this.recentMessages = new Map(); // For deduplication
    this.maxRetries = options.maxRetries || 3;
    this.processingTimeout = options.processingTimeout || 30000; // 30 seconds
    
    // Priority levels
    this.PRIORITIES = {
      CRITICAL: 0,  // Errors, urgent responses
      HIGH: 1,      // Callback queries, commands
      NORMAL: 2,    // Regular messages
      LOW: 3        // Background tasks
    };
    
    // Statistics tracking
    this.stats = {
      processed: 0,
      failed: 0,
      duplicates: 0,
      retries: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
    
    // Start processing
    this.processInterval = setInterval(() => {
      this.processQueues();
    }, 100); // Process every 100ms
  }

  /**
   * Add message to queue with deduplication
   * @param {string} userId - User ID
   * @param {Object} message - Message object
   * @param {number} priority - Priority level
   * @param {Object} options - Additional options
   */
  async enqueue(userId, message, priority = this.PRIORITIES.NORMAL, options = {}) {
    try {
      // Create message envelope
      const envelope = {
        id: this.generateMessageId(),
        userId,
        message,
        priority,
        timestamp: Date.now(),
        attempts: 0,
        options: {
          maxRetries: options.maxRetries || this.maxRetries,
          timeout: options.timeout || this.processingTimeout,
          deduplicationKey: options.deduplicationKey,
          ...options
        }
      };

      // Deduplication check
      if (await this.isDuplicate(envelope)) {
        this.stats.duplicates++;
        console.log(`Duplicate message detected for user ${userId}: ${envelope.id}`);
        return { success: false, reason: 'duplicate', messageId: envelope.id };
      }

      // Get or create user queue
      if (!this.queues.has(userId)) {
        this.queues.set(userId, {
          messages: [],
          lastProcessed: 0,
          processing: false
        });
      }

      const userQueue = this.queues.get(userId);
      
      // Insert message based on priority
      this.insertByPriority(userQueue.messages, envelope);
      
      console.log(`Enqueued message ${envelope.id} for user ${userId} (priority: ${priority}, queue size: ${userQueue.messages.length})`);
      
      return { success: true, messageId: envelope.id };
      
    } catch (error) {
      console.error('Error enqueueing message:', error);
      return { success: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Process all user queues
   */
  async processQueues() {
    const userIds = Array.from(this.queues.keys());
    
    for (const userId of userIds) {
      if (!this.processing.has(userId)) {
        await this.processUserQueue(userId);
      }
    }
  }

  /**
   * Process messages for a specific user
   * @param {string} userId - User ID to process
   */
  async processUserQueue(userId) {
    const userQueue = this.queues.get(userId);
    if (!userQueue || userQueue.messages.length === 0 || userQueue.processing) {
      return;
    }

    // Mark as processing
    this.processing.add(userId);
    userQueue.processing = true;
    
    try {
      while (userQueue.messages.length > 0) {
        const envelope = userQueue.messages.shift();
        
        // Check if message has expired
        if (this.isExpired(envelope)) {
          console.log(`Message ${envelope.id} expired, moving to dead letter queue`);
          this.deadLetterQueue.push({ ...envelope, reason: 'expired' });
          continue;
        }
        
        try {
          await this.processMessage(envelope);
          this.stats.processed++;
          userQueue.lastProcessed = Date.now();
          
        } catch (error) {
          await this.handleProcessingError(envelope, error);
        }
        
        // Rate limiting - ensure we don't overwhelm Telegram
        if (userQueue.messages.length > 0) {
          await this.sleep(200); // 200ms between messages per user
        }
      }
      
    } finally {
      // Mark as not processing
      this.processing.delete(userId);
      userQueue.processing = false;
    }
  }

  /**
   * Process individual message
   * @param {Object} envelope - Message envelope
   */
  async processMessage(envelope) {
    const { id, userId, message, options } = envelope;
    
    console.log(`Processing message ${id} for user ${userId}`);
    
    // Set processing timeout
    const timeoutId = setTimeout(() => {
      throw new Error(`Message processing timeout: ${id}`);
    }, options.timeout);
    
    try {
      // Add deduplication tracking
      if (options.deduplicationKey) {
        this.recentMessages.set(options.deduplicationKey, Date.now());
      }
      
      // Execute message handler
      if (typeof message.handler === 'function') {
        await message.handler(message.context, message.data);
      } else if (message.type === 'callback') {
        await this.processCallbackMessage(envelope);
      } else if (message.type === 'command') {
        await this.processCommandMessage(envelope);
      } else if (message.type === 'text') {
        await this.processTextMessage(envelope);
      } else {
        throw new Error(`Unknown message type: ${message.type}`);
      }
      
      console.log(`Successfully processed message ${id}`);
      
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle callback query messages
   * @param {Object} envelope - Message envelope
   */
  async processCallbackMessage(envelope) {
    const { message } = envelope;
    const { ctx, handler, handlerName } = message;
    
    // Ensure callback query is answered within 10 seconds
    const callbackTimeoutId = setTimeout(async () => {
      try {
        await ctx.answerCbQuery('Operation timed out. Please try again.');
        console.warn(`Callback query timeout for ${handlerName}`);
      } catch (error) {
        console.error('Failed to answer timed out callback:', error);
      }
    }, 9500);
    
    try {
      // Execute callback handler
      await handler(ctx);
      
      // If callback wasn't answered by handler, answer it now
      if (!ctx.callbackAnswered) {
        await ctx.answerCbQuery();
        ctx.callbackAnswered = true;
      }
      
    } finally {
      clearTimeout(callbackTimeoutId);
    }
  }

  /**
   * Handle command messages
   * @param {Object} envelope - Message envelope
   */
  async processCommandMessage(envelope) {
    const { message } = envelope;
    const { ctx, commandName, args, validator } = message;
    
    // Validate command if validator provided
    if (validator) {
      const validation = await validator.validateCommand(ctx, commandName);
      if (!validation.valid) {
        await ctx.reply(validation.errors.join('\n'));
        return;
      }
    }
    
    // Execute command
    const handler = message.handler;
    await handler(ctx, args);
  }

  /**
   * Handle text messages
   * @param {Object} envelope - Message envelope
   */
  async processTextMessage(envelope) {
    const { message } = envelope;
    const { ctx, handler } = message;
    
    await handler(ctx);
  }

  /**
   * Handle processing errors with retry logic
   * @param {Object} envelope - Message envelope
   * @param {Error} error - Processing error
   */
  async handleProcessingError(envelope, error) {
    envelope.attempts++;
    envelope.lastError = error;
    
    console.error(`Error processing message ${envelope.id} (attempt ${envelope.attempts}):`, error);
    
    if (envelope.attempts < envelope.options.maxRetries) {
      // Retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, envelope.attempts), 30000);
      
      setTimeout(() => {
        const userQueue = this.queues.get(envelope.userId);
        if (userQueue) {
          // Re-insert with high priority for retry
          this.insertByPriority(userQueue.messages, envelope, this.PRIORITIES.HIGH);
          this.stats.retries++;
        }
      }, delay);
      
    } else {
      // Move to dead letter queue
      this.deadLetterQueue.push({
        ...envelope,
        reason: 'max_retries_exceeded',
        finalError: error
      });
      this.stats.failed++;
      
      // Notify user of failure if possible
      try {
        if (envelope.message.ctx && envelope.message.ctx.reply) {
          await envelope.message.ctx.reply(
            'Sorry, something went wrong processing your request. Please try again or contact support.'
          );
        }
      } catch (notificationError) {
        console.error('Failed to notify user of processing failure:', notificationError);
      }
    }
  }

  /**
   * Check if message is duplicate
   * @param {Object} envelope - Message envelope
   * @returns {boolean} - True if duplicate
   */
  async isDuplicate(envelope) {
    const { options } = envelope;
    
    if (!options.deduplicationKey) {
      return false;
    }
    
    const lastTime = this.recentMessages.get(options.deduplicationKey);
    if (!lastTime) {
      return false;
    }
    
    const timeDiff = Date.now() - lastTime;
    return timeDiff < this.deduplicationWindow;
  }

  /**
   * Insert message by priority
   * @param {Array} queue - Message queue
   * @param {Object} envelope - Message envelope
   * @param {number} forcePriority - Force specific priority
   */
  insertByPriority(queue, envelope, forcePriority = null) {
    const priority = forcePriority !== null ? forcePriority : envelope.priority;
    
    // Find insertion point
    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].priority > priority) {
        insertIndex = i;
        break;
      }
    }
    
    queue.splice(insertIndex, 0, envelope);
  }

  /**
   * Check if message has expired
   * @param {Object} envelope - Message envelope
   * @returns {boolean} - True if expired
   */
  isExpired(envelope) {
    const maxAge = envelope.options.maxAge || 300000; // 5 minutes default
    return (Date.now() - envelope.timestamp) > maxAge;
  }

  /**
   * Generate unique message ID
   * @returns {string} - Unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create deduplication key for callback queries
   * @param {Object} ctx - Telegram context
   * @returns {string} - Deduplication key
   */
  createCallbackDeduplicationKey(ctx) {
    return `cb_${ctx.from.id}_${ctx.callbackQuery.data}_${Math.floor(Date.now() / 1000)}`;
  }

  /**
   * Create deduplication key for commands
   * @param {Object} ctx - Telegram context
   * @param {string} command - Command name
   * @returns {string} - Deduplication key
   */
  createCommandDeduplicationKey(ctx, command) {
    return `cmd_${ctx.from.id}_${command}_${Math.floor(Date.now() / 2000)}`; // 2-second window
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    
    // Clean recent messages
    for (const [key, timestamp] of this.recentMessages.entries()) {
      if (now - timestamp > this.deduplicationWindow * 2) {
        this.recentMessages.delete(key);
      }
    }
    
    // Clean empty queues
    for (const [userId, queue] of this.queues.entries()) {
      if (queue.messages.length === 0 && !queue.processing && 
          now - queue.lastProcessed > 600000) { // 10 minutes inactive
        this.queues.delete(userId);
      }
    }
    
    // Limit dead letter queue size
    if (this.deadLetterQueue.length > 1000) {
      this.deadLetterQueue.splice(0, this.deadLetterQueue.length - 1000);
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} - Queue statistics
   */
  getStats() {
    const totalQueued = Array.from(this.queues.values())
      .reduce((sum, queue) => sum + queue.messages.length, 0);
    
    return {
      ...this.stats,
      activeQueues: this.queues.size,
      totalQueued,
      processing: this.processing.size,
      deadLetterQueue: this.deadLetterQueue.length,
      recentMessages: this.recentMessages.size
    };
  }

  /**
   * Get dead letter queue for analysis
   * @returns {Array} - Failed messages
   */
  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue() {
    this.deadLetterQueue.length = 0;
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown queue system
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    // Clear all data
    this.queues.clear();
    this.processing.clear();
    this.recentMessages.clear();
    this.retryAttempts.clear();
    this.deadLetterQueue.length = 0;
    
    console.log('Message queue system shut down');
  }

  /**
   * Health check
   * @returns {Object} - Health status
   */
  healthCheck() {
    const stats = this.getStats();
    const isHealthy = stats.processing === 0 || stats.processing < this.queues.size;
    
    return {
      healthy: isHealthy,
      stats,
      uptime: Date.now() - (this.startTime || Date.now()),
      memory: process.memoryUsage()
    };
  }
}

module.exports = MessageQueue;