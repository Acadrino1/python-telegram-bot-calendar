/**
 * Coupon Giveaway Service
 *
 * Admin-triggered coupon drops to channels:
 * - $20 or $25 coupons
 * - $100 weekly budget limit
 * - Manual trigger only via admin command
 */

const moment = require('moment-timezone');
const Coupon = require('../models/Coupon');
const CouponBudget = require('../models/CouponBudget');
const BotChannel = require('../models/BotChannel');

class CouponGiveawayService {
  constructor(bot) {
    this.bot = bot;
    this.timezone = 'America/New_York';
  }

  /**
   * Drop a coupon to all broadcast channels (admin-triggered only)
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
      mode: 'admin-triggered',
      currentTime: now.format('h:mm A'),
      weeklyStats: stats
    };
  }
}

module.exports = CouponGiveawayService;
