const Bottleneck = require('bottleneck');

class TelegramRateLimiter {
  constructor() {
    // Global rate limiter for Telegram API (30 msgs/sec)
    this.globalLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 34, // ~30 messages per second globally
      reservoir: 30,
      reservoirRefreshAmount: 30,
      reservoirRefreshInterval: 1000
    });

    // Per-chat rate limiters (1 msg/sec per chat)
    this.chatLimiters = new Map();
    
    // Cleanup old chat limiters every hour
    setInterval(() => this.cleanupChatLimiters(), 3600000);
  }

  // Get or create a chat-specific rate limiter
  getChatLimiter(chatId) {
    if (!this.chatLimiters.has(chatId)) {
      this.chatLimiters.set(chatId, {
        limiter: new Bottleneck({
          maxConcurrent: 1,
          minTime: 1000, // 1 second between messages per chat
          reservoir: 1,
          reservoirRefreshAmount: 1,
          reservoirRefreshInterval: 1000
        }),
        lastUsed: Date.now()
      });
    } else {
      // Update last used timestamp
      this.chatLimiters.get(chatId).lastUsed = Date.now();
    }
    
    return this.chatLimiters.get(chatId).limiter;
  }

  // Send message with rate limiting compliance
  async sendMessage(bot, chatId, text, options = {}) {
    const chatLimiter = this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() => 
      chatLimiter.schedule(() => 
        bot.telegram.sendMessage(chatId, text, options)
      )
    );
  }

  // Send callback query response with rate limiting
  async answerCallbackQuery(bot, callbackQueryId, text, options = {}) {
    return await this.globalLimiter.schedule(() => 
      bot.telegram.answerCbQuery(callbackQueryId, text, options)
    );
  }

  // Edit message with rate limiting
  async editMessage(bot, chatId, messageId, text, options = {}) {
    const chatLimiter = this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() => 
      chatLimiter.schedule(() => 
        bot.telegram.editMessageText(chatId, messageId, undefined, text, options)
      )
    );
  }

  // Delete message with rate limiting
  async deleteMessage(bot, chatId, messageId) {
    const chatLimiter = this.getChatLimiter(chatId);
    
    return await this.globalLimiter.schedule(() => 
      chatLimiter.schedule(() => 
        bot.telegram.deleteMessage(chatId, messageId)
      )
    );
  }

  // Cleanup inactive chat limiters (unused for 1 hour)
  cleanupChatLimiters() {
    const oneHourAgo = Date.now() - 3600000;
    
    for (const [chatId, limiterInfo] of this.chatLimiters.entries()) {
      if (limiterInfo.lastUsed < oneHourAgo) {
        this.chatLimiters.delete(chatId);
      }
    }
    
    console.log(`Cleaned up ${this.chatLimiters.size} inactive chat limiters`);
  }

  // Get rate limiter statistics
  getStats() {
    return {
      globalLimiter: {
        queued: this.globalLimiter.queued(),
        running: this.globalLimiter.running(),
        done: this.globalLimiter.done
      },
      activeChatLimiters: this.chatLimiters.size,
      chatLimiters: Array.from(this.chatLimiters.entries()).map(([chatId, info]) => ({
        chatId,
        queued: info.limiter.queued(),
        running: info.limiter.running(),
        lastUsed: new Date(info.lastUsed).toISOString()
      }))
    };
  }

  // Emergency stop all rate limiters
  async stop() {
    await this.globalLimiter.stop();
    
    for (const [chatId, limiterInfo] of this.chatLimiters.entries()) {
      await limiterInfo.limiter.stop();
    }
    
    this.chatLimiters.clear();
    console.log('All rate limiters stopped');
  }
}

module.exports = TelegramRateLimiter;