const SimpleTelegramBot = require('./SimpleTelegramBot');
const ScalabilityManager = require('./ScalabilityManager');
const BotStabilityFix = require('./BotStabilityFix');

class EnhancedBotForScale extends SimpleTelegramBot {
  constructor() {
    super();
    
    // Initialize scalability features
    this.scalabilityManager = new ScalabilityManager();
    this.stabilityFix = new BotStabilityFix(this.bot);
    
    // Override command handlers with scalability wrapper
    this.wrapCommandsForScale();
    
    // Add capacity monitoring
    this.monitorCapacity();
    
    console.log('🚀 Enhanced bot initialized with scalability features for 100+ users');
  }

  wrapCommandsForScale() {
    const originalCommand = this.bot.command.bind(this.bot);
    
    this.bot.command = (command, handler) => {
      originalCommand(command, async (ctx) => {
        const userId = ctx.from?.id;
        
        if (!userId) {
          return handler(ctx);
        }

        // Check capacity
        const capacity = this.scalabilityManager.getCapacityStatus();
        
        if (!capacity.canAcceptMore && !this.scalabilityManager.activeUsers.has(userId)) {
          return ctx.reply(
            '⚠️ The bot is currently at maximum capacity. Please try again in a few minutes.'
          );
        }

        // Process with rate limiting and queue management
        try {
          await this.scalabilityManager.processUserRequest(userId, async () => {
            return await handler(ctx);
          });
        } catch (error) {
          if (error.message.includes('Too many requests')) {
            return ctx.reply(
              '⏳ You\'re sending requests too quickly. Please wait a moment and try again.'
            );
          }
          throw error;
        }
      });
    };
  }

  // Override database operations with caching
  async getBookingsForDate(date) {
    // Check cache first
    const cached = this.scalabilityManager.getCachedBookings(date);
    if (cached) {
      return cached;
    }

    // If not cached, get from database with connection pooling
    const bookings = await this.scalabilityManager.processDatabaseOperation(async () => {
      return await super.getBookingsForDate(date);
    });

    // Cache the result
    this.scalabilityManager.setCachedBookings(date, bookings);
    
    return bookings;
  }

  // Override session management with caching
  async getSession(userId) {
    // Check cache first
    const cached = this.scalabilityManager.getCachedSession(userId);
    if (cached) {
      return cached;
    }

    // Get from store
    const session = await super.getSession?.(userId) || {};
    
    // Cache it
    this.scalabilityManager.setCachedSession(userId, session);
    
    return session;
  }

  // Override heavy operations like booking confirmation
  async confirmBooking(ctx, bookingData) {
    return await this.scalabilityManager.processHeavyOperation(async () => {
      return await super.confirmBooking?.(ctx, bookingData) || 
             await this.createAppointment(bookingData);
    });
  }

  // Monitor capacity and alert admins
  monitorCapacity() {
    setInterval(() => {
      const capacity = this.scalabilityManager.getCapacityStatus();
      
      if (capacity.utilizationPercent > 80) {
        console.warn(`⚠️ High load: ${capacity.currentUsers}/${capacity.maxCapacity} users active`);
        
        // Alert admins if configured
        if (this.adminIds?.length > 0 && capacity.utilizationPercent > 90) {
          this.adminIds.forEach(adminId => {
            this.bot.telegram.sendMessage(adminId, 
              `⚠️ Bot capacity alert:\n` +
              `Active users: ${capacity.currentUsers}/${capacity.maxCapacity}\n` +
              `Queue length: ${capacity.queueLength}\n` +
              `Status: ${capacity.status}`
            ).catch(() => {});
          });
        }
      }
    }, 60000); // Check every minute
  }

  // Handle burst traffic from group announcements
  async handleGroupBroadcast(message, userIds) {
    console.log(`📢 Handling broadcast to ${userIds.length} users`);
    
    const requests = userIds.map(userId => ({
      userId,
      operation: async () => {
        await this.bot.telegram.sendMessage(userId, message);
      }
    }));

    const results = await this.scalabilityManager.handleBurst(requests);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Broadcast complete: ${successful} sent, ${failed} failed`);
    
    return { successful, failed };
  }

  // Get system metrics
  getMetrics() {
    return {
      ...this.scalabilityManager.metrics,
      capacity: this.scalabilityManager.getCapacityStatus(),
      health: this.stabilityFix.getHealthStatus()
    };
  }
}

module.exports = EnhancedBotForScale;