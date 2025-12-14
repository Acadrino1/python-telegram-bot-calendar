/**
 * CRITICAL COMPLIANCE FIX: Callback Query Manager
 * Solves Global Rules violations 8, 9, 11, 12
 * Eliminates spinning indicators and ensures immediate response
 */

class CallbackQueryManager {
  constructor(bot) {
    this.bot = bot;
    this.pendingCallbacks = new Map();
    this.callbackStats = {
      total: 0,
      successful: 0,
      failed: 0,
      timeout: 0,
      averageResponseTime: 0
    };
    
    // Callback response timeout (Rule 8: Must respond within 10 seconds)
    this.CALLBACK_TIMEOUT = 8000; // 8 seconds for safety margin
    this.MAX_CALLBACK_DATA_LENGTH = 64; // Rule 10: Max callback data length
    
    console.log('🚀 CallbackQueryManager initialized with compliance enforcement');
  }

  /**
   * CRITICAL: Handle callback with immediate acknowledgment
   * This prevents spinning indicators (Global Rules 8 & 9)
   */
  async handleCallback(ctx, handlerFunction, operationType = 'generic') {
    const callbackId = ctx.callbackQuery?.id;
    if (!callbackId) {
      console.error('❌ Missing callback query ID');
      return;
    }

    const startTime = Date.now();
    this.callbackStats.total++;

    try {
      // IMMEDIATE acknowledgment to prevent spinning (Rule 8 compliance)
      await this.answerCallback(ctx, '⏳ Processing...');
      
      // Track pending callback
      this.pendingCallbacks.set(callbackId, {
        startTime,
        operationType,
        timeout: setTimeout(() => {
          this.handleCallbackTimeout(callbackId, operationType);
        }, this.CALLBACK_TIMEOUT)
      });

      // Execute the actual handler
      const result = await handlerFunction(ctx);
      
      // Clean up successful callback
      this.cleanupCallback(callbackId, startTime, true);
      
      return result;
    } catch (error) {
      console.error(`❌ Callback handler error (${operationType}):`, error);
      this.callbackStats.failed++;
      
      // Ensure user gets feedback even on error (Rule 9 compliance)
      try {
        await ctx.answerCbQuery('❌ Something went wrong. Please try again.');
      } catch (answerError) {
        console.error('Failed to answer callback on error:', answerError);
      }
      
      this.cleanupCallback(callbackId, startTime, false);
      throw error;
    }
  }

  /**
   * CRITICAL: Immediate callback acknowledgment
   * Prevents spinning indicators (Rule 8 & 9)
   */
  async answerCallback(ctx, text = '', showAlert = false) {
    if (!ctx.callbackQuery) {
      return;
    }

    try {
      // Multiple acknowledgment attempts for reliability
      const acknowledgmentPromises = [
        ctx.answerCbQuery(text, showAlert),
        // Backup acknowledgment
        this.bot.telegram.answerCbQuery(ctx.callbackQuery.id, text, showAlert)
      ];

      // Use Promise.race to ensure immediate response
      await Promise.race(acknowledgmentPromises);
      
      console.log(`✅ Callback acknowledged: "${text || 'silent'}"`);
    } catch (error) {
      console.error('❌ Failed to acknowledge callback:', error);
      
      // Final attempt with raw API call
      try {
        await this.bot.telegram.answerCbQuery(ctx.callbackQuery.id, 'Processing...');
      } catch (finalError) {
        console.error('❌ Critical: All callback acknowledgment attempts failed:', finalError);
      }
    }
  }

  /**
   * Handle callback timeout (Rule 8 compliance)
   */
  handleCallbackTimeout(callbackId, operationType) {
    console.error(`⏰ Callback timeout: ${operationType} (ID: ${callbackId})`);
    this.callbackStats.timeout++;
    
    const pendingCallback = this.pendingCallbacks.get(callbackId);
    if (pendingCallback) {
      this.cleanupCallback(callbackId, pendingCallback.startTime, false);
    }
  }

  /**
   * Clean up callback tracking
   */
  cleanupCallback(callbackId, startTime, success) {
    const pendingCallback = this.pendingCallbacks.get(callbackId);
    if (pendingCallback) {
      clearTimeout(pendingCallback.timeout);
      this.pendingCallbacks.delete(callbackId);
    }

    // Update statistics
    const responseTime = Date.now() - startTime;
    this.updateStats(responseTime, success);
  }

  /**
   * Update callback statistics for monitoring
   */
  updateStats(responseTime, success) {
    if (success) {
      this.callbackStats.successful++;
    }
    
    // Update average response time
    const totalResponses = this.callbackStats.successful + this.callbackStats.failed;
    this.callbackStats.averageResponseTime = 
      (this.callbackStats.averageResponseTime * (totalResponses - 1) + responseTime) / totalResponses;
  }

  /**
   * Create safe callback data (Rule 10 compliance)
   * Ensures callback data stays under 64 bytes
   */
  createSafeCallbackData(prefix, data) {
    const fullData = `${prefix}_${data}`;
    
    if (fullData.length <= this.MAX_CALLBACK_DATA_LENGTH) {
      return fullData;
    }
    
    // Truncate data to fit within limits
    const maxDataLength = this.MAX_CALLBACK_DATA_LENGTH - prefix.length - 1;
    const truncatedData = data.substring(0, maxDataLength);
    
    console.warn(`⚠️ Callback data truncated: ${fullData} -> ${prefix}_${truncatedData}`);
    return `${prefix}_${truncatedData}`;
  }

  /**
   * Clean up expired callbacks periodically
   * Prevents memory leaks (Rule 12 compliance)
   */
  cleanupExpiredCallbacks() {
    const now = Date.now();
    const expiredCallbacks = [];
    
    for (const [callbackId, callback] of this.pendingCallbacks.entries()) {
      if (now - callback.startTime > this.CALLBACK_TIMEOUT) {
        expiredCallbacks.push(callbackId);
      }
    }
    
    expiredCallbacks.forEach(callbackId => {
      const callback = this.pendingCallbacks.get(callbackId);
      console.warn(`🧹 Cleaning up expired callback: ${callback.operationType} (${callbackId})`);
      this.cleanupCallback(callbackId, callback.startTime, false);
    });
    
    if (expiredCallbacks.length > 0) {
      console.log(`🧹 Cleaned up ${expiredCallbacks.length} expired callbacks`);
    }
  }

  /**
   * Get callback performance statistics
   * For monitoring and compliance reporting
   */
  getStats() {
    const pendingCount = this.pendingCallbacks.size;
    const successRate = this.callbackStats.total > 0 ? 
      (this.callbackStats.successful / this.callbackStats.total * 100).toFixed(2) : 0;
    
    return {
      ...this.callbackStats,
      pendingCallbacks: pendingCount,
      successRate: `${successRate}%`,
      complianceScore: this.calculateComplianceScore()
    };
  }

  /**
   * Calculate compliance score based on performance metrics
   */
  calculateComplianceScore() {
    const responseTimeScore = Math.max(0, 100 - (this.callbackStats.averageResponseTime / 100));
    const successScore = this.callbackStats.total > 0 ? 
      (this.callbackStats.successful / this.callbackStats.total * 100) : 100;
    const timeoutPenalty = this.callbackStats.timeout * 5; // -5 points per timeout
    
    const totalScore = Math.max(0, Math.min(100, 
      (responseTimeScore * 0.4) + (successScore * 0.6) - timeoutPenalty
    ));
    
    return {
      total: totalScore.toFixed(1),
      responseTime: responseTimeScore.toFixed(1),
      success: successScore.toFixed(1),
      penalties: timeoutPenalty
    };
  }
}

module.exports = CallbackQueryManager;