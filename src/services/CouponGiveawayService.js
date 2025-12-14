/**
 * Coupon Giveaway Service
 *
 * Manages daily coupon drops to channels during business hours:
 * - Once per day, at a random time during business hours
 * - $20 or $25 coupons
 * - $100 weekly budget limit
 * - Only during operational hours (11:00 AM - 8:00 PM, Mon-Sat)
 */

const moment = require('moment-timezone');
const Coupon = require('../models/Coupon');
const CouponBudget = require('../models/CouponBudget');
const BotChannel = require('../models/BotChannel');

class CouponGiveawayService {
  constructor(bot) {
    this.bot = bot;
    this.timezone = 'America/New_York';
    this.businessHours = {
      start: 11, // 11:00 AM
      end: 20,   // 8:00 PM
      days: [1, 2, 3, 4, 5, 6] // Monday - Saturday (moment.js: 1=Mon, 7=Sun)
    };
    this.checkInterval = null;
    this.scheduledDrop = null;
    this.todayDropped = false;
  }

  /**
   * Start the giveaway scheduler
   */
  start() {
    console.log('🎁 Starting Coupon Giveaway Service...');

    // Schedule today's drop if within business hours
    this.scheduleNextDrop();

    // Check every 5 minutes if we need to drop a coupon
    this.checkInterval = setInterval(() => {
      this.checkAndExecuteDrop();
    }, 5 * 60 * 1000);

    // Also check immediately on start
    this.checkAndExecuteDrop();

    console.log('🎁 Coupon Giveaway Service started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('🎁 Coupon Giveaway Service stopped');
  }

  /**
   * Check if current time is within business hours
   */
  isBusinessHours() {
    const now = moment().tz(this.timezone);
    const dayOfWeek = now.isoWeekday(); // 1=Mon, 7=Sun
    const hour = now.hour();

    const isBusinessDay = this.businessHours.days.includes(dayOfWeek);
    const isBusinessTime = hour >= this.businessHours.start && hour < this.businessHours.end;

    return isBusinessDay && isBusinessTime;
  }

  /**
   * Generate a random time within today's remaining business hours
   */
  getRandomDropTime() {
    const now = moment().tz(this.timezone);
    const currentHour = now.hour();
    const currentMinute = now.minute();

    // If we're before business hours, pick random time in full range
    let startHour = this.businessHours.start;
    let startMinute = 0;

    // If we're already in business hours, start from now
    if (currentHour >= this.businessHours.start && currentHour < this.businessHours.end) {
      startHour = currentHour;
      startMinute = currentMinute + 5; // At least 5 minutes from now
    }

    // Calculate available minutes until end of business
    const endMinutes = this.businessHours.end * 60;
    const startMinutes = startHour * 60 + startMinute;

    if (startMinutes >= endMinutes - 10) {
      return null; // Not enough time left today
    }

    // Pick random minute within range
    const randomMinute = startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes - 5));
    const dropHour = Math.floor(randomMinute / 60);
    const dropMin = randomMinute % 60;

    return moment().tz(this.timezone).hour(dropHour).minute(dropMin).second(0);
  }

  /**
   * Schedule the next coupon drop
   */
  scheduleNextDrop() {
    const now = moment().tz(this.timezone);
    const dayOfWeek = now.isoWeekday();

    // Reset daily flag at midnight
    if (now.hour() === 0 && now.minute() < 5) {
      this.todayDropped = false;
    }

    // Check if today is a business day and we haven't dropped yet
    if (!this.businessHours.days.includes(dayOfWeek)) {
      console.log('🎁 Today is not a business day, no coupon drop scheduled');
      return;
    }

    if (this.todayDropped) {
      console.log('🎁 Already dropped coupon today');
      return;
    }

    // If we're past business hours, wait for tomorrow
    if (now.hour() >= this.businessHours.end) {
      console.log('🎁 Past business hours, will schedule tomorrow');
      return;
    }

    // Generate random drop time for today
    const dropTime = this.getRandomDropTime();
    if (!dropTime) {
      console.log('🎁 Not enough time left today for coupon drop');
      return;
    }

    this.scheduledDrop = dropTime;
    console.log(`🎁 Coupon drop scheduled for today at ${dropTime.format('h:mm A')}`);
  }

  /**
   * Check if it's time to drop a coupon and execute
   */
  async checkAndExecuteDrop() {
    if (this.todayDropped) return;
    if (!this.scheduledDrop) {
      this.scheduleNextDrop();
      return;
    }

    const now = moment().tz(this.timezone);

    // Check if it's time (within 5 minute window)
    if (now.isSameOrAfter(this.scheduledDrop)) {
      console.log('🎁 Executing scheduled coupon drop...');
      await this.dropCoupon();
      this.todayDropped = true;
      this.scheduledDrop = null;
    }
  }

  /**
   * Drop a coupon to all broadcast channels
   */
  async dropCoupon() {
    try {
      // Check budget
      const couponAmount = await CouponBudget.decideCouponAmount();
      if (couponAmount === 0) {
        console.log('🎁 Weekly budget exhausted, skipping coupon drop');
        return false;
      }

      // Check if we have budget for this amount
      const hasbudget = await CouponBudget.hasRemainingBudget(couponAmount);
      if (!hasbudget) {
        console.log('🎁 Not enough budget remaining for coupon');
        return false;
      }

      // Create the coupon
      const coupon = await Coupon.createCoupon(couponAmount, 7); // 7 day expiry
      console.log(`🎁 Created coupon: ${coupon.code} for $${couponAmount}`);

      // Deduct from budget
      await CouponBudget.deductBudget(couponAmount);

      // Broadcast to channels
      await this.broadcastCoupon(coupon);

      return true;
    } catch (error) {
      console.error('🎁 Error dropping coupon:', error);
      return false;
    }
  }

  /**
   * Broadcast coupon to all active channels
   */
  async broadcastCoupon(coupon) {
    if (!this.bot) {
      console.error('🎁 No bot instance for broadcasting');
      return;
    }

    try {
      const channels = await BotChannel.getActiveBroadcastChannels();

      if (channels.length === 0) {
        console.log('🎁 No active broadcast channels');
        return;
      }

      const expiresAt = moment(coupon.expires_at).tz(this.timezone);
      const expiresFormatted = expiresAt.format('MMM DD, YYYY');

      const message =
        `🎁 *FLASH GIVEAWAY!*\n\n` +
        `🎟️ Use code: \`${coupon.code}\`\n` +
        `💰 Get *$${coupon.amount} OFF* your next booking!\n\n` +
        `⏰ Expires: ${expiresFormatted}\n` +
        `📱 First come, first served!\n\n` +
        `_To redeem: Start a booking with /start and enter the code when prompted!_\n\n` +
        `🚀 *Book now before someone else claims it!*`;

      let sent = 0;
      let failed = 0;

      for (const channel of channels) {
        try {
          const options = {
            parse_mode: 'Markdown'
          };

          // Support forum topics
          if (channel.topic_id) {
            options.message_thread_id = channel.topic_id;
          }

          await this.bot.telegram.sendMessage(channel.chat_id, message, options);
          sent++;

          // Mark coupon broadcast
          await Coupon.markBroadcast(coupon.id, channel.chat_id);

        } catch (error) {
          failed++;
          console.warn(`🎁 Failed to broadcast to channel ${channel.chat_id}:`, error.message);

          // Mark channel as unable to post if permission error
          if (error.code === 403 || error.description?.includes('bot was kicked') ||
              error.description?.includes('not enough rights') ||
              error.description?.includes('chat not found')) {
            await BotChannel.updateCanPost(channel.chat_id, false);
          }
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 100));
      }

      console.log(`🎁 Coupon broadcast complete: ${sent} channels sent, ${failed} failed`);
      console.log(`🎁 Coupon code: ${coupon.code} ($${coupon.amount})`);

    } catch (error) {
      console.error('🎁 Error broadcasting coupon:', error);
    }
  }

  /**
   * Manually trigger a coupon drop (for admin use)
   */
  async manualDrop() {
    console.log('🎁 Manual coupon drop triggered');
    return await this.dropCoupon();
  }

  /**
   * Get service status
   */
  async getStatus() {
    const stats = await CouponBudget.getWeeklyStats();
    const now = moment().tz(this.timezone);

    return {
      running: !!this.checkInterval,
      isBusinessHours: this.isBusinessHours(),
      currentTime: now.format('h:mm A'),
      todayDropped: this.todayDropped,
      scheduledDrop: this.scheduledDrop ? this.scheduledDrop.format('h:mm A') : 'None',
      weeklyStats: stats
    };
  }
}

module.exports = CouponGiveawayService;
