/**
 * Telegram-Compliant Rate Limiter
 * Implements proper rate limiting according to Telegram Bot API limits:
 * - 30 messages per second globally
 * - 1 message per second per chat
 * - 20 messages per minute per group
 */

const Bottleneck = require('bottleneck');

class TelegramRateLimiter {
  constructor() {
    // Global rate limiter (30 messages per second)
    this.globalLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 34, // ~30 messages per second (1000ms / 30 ≈ 33.33ms)
      reservoir: 30,
      reservoirRefreshAmount: 30,
      reservoirRefreshInterval: 1000
    });

    // Per-chat limiters (1 message per second per chat)
    this.chatLimiters = new Map();
    
    // Per-group limiters (20 messages per minute per group)
    this.groupLimiters = new Map();
    
    // Cleanup interval for unused limiters
    this.setupCleanup();
    
    console.log('🚦 Telegram Rate Limiter initialized with API-compliant limits');
  }

  // Get or create chat limiter
  getChatLimiter(chatId) {
    const chatIdStr = chatId.toString();
    
    if (!this.chatLimiters.has(chatIdStr)) {
      const limiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: 1000, // 1 second between messages per chat
        reservoir: 1,
        reservoirRefreshAmount: 1,
        reservoirRefreshInterval: 1000
      });
      
      // Track usage for cleanup
      limiter.lastUsed = Date.now();
      this.chatLimiters.set(chatIdStr, limiter);
    }
    
    const limiter = this.chatLimiters.get(chatIdStr);
    limiter.lastUsed = Date.now();
    return limiter;
  }

  // Get or create group limiter
  getGroupLimiter(chatId) {
    const chatIdStr = chatId.toString();
    
    if (!this.groupLimiters.has(chatIdStr)) {
      const limiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: 3000, // 3 seconds between messages (20 per minute)
        reservoir: 20,
        reservoirRefreshAmount: 20,
        reservoirRefreshInterval: 60000 // 1 minute
      });
      
      limiter.lastUsed = Date.now();
      this.groupLimiters.set(chatIdStr, limiter);
    }
    
    const limiter = this.groupLimiters.get(chatIdStr);
    limiter.lastUsed = Date.now();
    return limiter;
  }

  // Send message with proper rate limiting
  async sendMessage(bot, chatId, text, options = {}) {
    const isGroup = chatId < 0; // Negative IDs are groups/channels
    
    // Choose appropriate limiter
    const chatLimiter = isGroup 
      ? this.getGroupLimiter(chatId)
      : this.getChatLimiter(chatId);
    
    try {
      // Apply both global and chat-specific limiting
      return await this.globalLimiter.schedule(() =>
        chatLimiter.schedule(async () => {
          try {
            return await bot.telegram.sendMessage(chatId, text, options);
          } catch (error) {
            // Handle rate limiting errors from Telegram
            if (error.code === 429) {
              const retryAfter = error.parameters?.retry_after || 1;
              console.warn(`Rate limit hit for chat ${chatId}, retrying after ${retryAfter}s`);
              
              // Wait and retry
              await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
              return await bot.telegram.sendMessage(chatId, text, options);
            }
            throw error;
          }
        })
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  // Send photo with rate limiting
  async sendPhoto(bot, chatId, photo, options = {}) {
    const isGroup = chatId < 0;
    const chatLimiter = isGroup 
      ? this.getGroupLimiter(chatId)
      : this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() =>
      chatLimiter.schedule(async () => {
        try {
          return await bot.telegram.sendPhoto(chatId, photo, options);
        } catch (error) {
          if (error.code === 429) {
            const retryAfter = error.parameters?.retry_after || 1;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return await bot.telegram.sendPhoto(chatId, photo, options);
          }
          throw error;
        }
      })
    );
  }

  // Send document with rate limiting
  async sendDocument(bot, chatId, document, options = {}) {
    const isGroup = chatId < 0;
    const chatLimiter = isGroup 
      ? this.getGroupLimiter(chatId)
      : this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() =>
      chatLimiter.schedule(async () => {
        try {
          return await bot.telegram.sendDocument(chatId, document, options);
        } catch (error) {
          if (error.code === 429) {
            const retryAfter = error.parameters?.retry_after || 1;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return await bot.telegram.sendDocument(chatId, document, options);
          }
          throw error;
        }
      })
    );
  }

  // Answer callback query with rate limiting
  async answerCallbackQuery(bot, callbackQueryId, options = {}) {
    return await this.globalLimiter.schedule(async () => {
      try {
        return await bot.telegram.answerCbQuery(callbackQueryId, options.text, options);
      } catch (error) {
        if (error.code === 429) {
          const retryAfter = error.parameters?.retry_after || 1;
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return await bot.telegram.answerCbQuery(callbackQueryId, options.text, options);
        }
        throw error;
      }
    });
  }

  // Edit message with rate limiting
  async editMessage(bot, chatId, messageId, text, options = {}) {
    const isGroup = chatId < 0;
    const chatLimiter = isGroup 
      ? this.getGroupLimiter(chatId)
      : this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() =>
      chatLimiter.schedule(async () => {
        try {
          return await bot.telegram.editMessageText(chatId, messageId, null, text, options);
        } catch (error) {
          if (error.code === 429) {
            const retryAfter = error.parameters?.retry_after || 1;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return await bot.telegram.editMessageText(chatId, messageId, null, text, options);
          }
          throw error;
        }
      })
    );
  }

  // Delete message with rate limiting
  async deleteMessage(bot, chatId, messageId) {
    const isGroup = chatId < 0;
    const chatLimiter = isGroup 
      ? this.getGroupLimiter(chatId)
      : this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() =>
      chatLimiter.schedule(async () => {
        try {
          return await bot.telegram.deleteMessage(chatId, messageId);
        } catch (error) {
          if (error.code === 429) {
            const retryAfter = error.parameters?.retry_after || 1;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return await bot.telegram.deleteMessage(chatId, messageId);
          }
          // Ignore errors for message deletion (message might already be deleted)
          console.warn(`Failed to delete message ${messageId} in chat ${chatId}:`, error.message);
          return null;
        }
      })
    );
  }

  // Bulk send messages (for broadcasting)
  async sendBulkMessages(bot, messages) {
    const results = [];
    
    for (const message of messages) {
      try {
        const result = await this.sendMessage(bot, message.chatId, message.text, message.options);
        results.push({ success: true, chatId: message.chatId, result });
      } catch (error) {
        console.error(`Failed to send message to ${message.chatId}:`, error);
        results.push({ success: false, chatId: message.chatId, error: error.message });
      }
    }
    
    return results;
  }

  // Get current queue status
  getQueueStatus() {
    const globalStats = {
      queued: this.globalLimiter.queued(),
      running: this.globalLimiter.running(),
      reservoir: this.globalLimiter.reservoir
    };

    const chatStats = {
      totalChats: this.chatLimiters.size,
      activeChats: Array.from(this.chatLimiters.values())
        .filter(limiter => limiter.queued() > 0 || limiter.running() > 0).length
    };

    const groupStats = {
      totalGroups: this.groupLimiters.size,
      activeGroups: Array.from(this.groupLimiters.values())
        .filter(limiter => limiter.queued() > 0 || limiter.running() > 0).length
    };

    return {
      global: globalStats,
      chats: chatStats,
      groups: groupStats,
      timestamp: new Date().toISOString()
    };
  }

  // Setup cleanup for unused limiters
  setupCleanup() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour
      
      // Clean up chat limiters
      for (const [chatId, limiter] of this.chatLimiters.entries()) {
        if (now - limiter.lastUsed > maxAge && limiter.queued() === 0 && limiter.running() === 0) {
          this.chatLimiters.delete(chatId);
        }
      }
      
      // Clean up group limiters
      for (const [chatId, limiter] of this.groupLimiters.entries()) {
        if (now - limiter.lastUsed > maxAge && limiter.queued() === 0 && limiter.running() === 0) {
          this.groupLimiters.delete(chatId);
        }
      }
      
      if (this.chatLimiters.size > 100 || this.groupLimiters.size > 100) {
        console.log(`🧹 Cleaned up rate limiters. Active: ${this.chatLimiters.size} chats, ${this.groupLimiters.size} groups`);
      }
    }, 10 * 60 * 1000); // Run every 10 minutes
  }

  // Emergency stop all queues
  emergencyStop() {
    console.warn('🚨 Emergency stop: Clearing all rate limiter queues');
    
    this.globalLimiter.stop();
    
    for (const limiter of this.chatLimiters.values()) {
      limiter.stop();
    }
    
    for (const limiter of this.groupLimiters.values()) {
      limiter.stop();
    }
    
    this.chatLimiters.clear();
    this.groupLimiters.clear();
  }
}

// Export singleton instance
const telegramRateLimiter = new TelegramRateLimiter();

module.exports = telegramRateLimiter;