const { Model } = require('objection');
const moment = require('moment-timezone');

class Coupon extends Model {
  static get tableName() {
    return 'coupons';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['code', 'amount', 'expires_at'],
      properties: {
        id: { type: 'integer' },
        code: { type: 'string', minLength: 6, maxLength: 20 },
        amount: { type: 'number' },
        status: { type: 'string', enum: ['active', 'redeemed', 'expired'] },
        redeemed_by_telegram_id: { type: ['string', 'null'] },
        redeemed_for_appointment_id: { type: ['integer', 'null'] },
        redeemed_at: { type: ['string', 'null'] },
        expires_at: { type: 'string' },
        broadcast_at: { type: ['string', 'null'] },
        broadcast_channel_id: { type: ['string', 'null'] },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
      }
    };
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }

  /**
   * Generate a unique coupon code
   * Format: LODGE-XXXX-XXXX (easy to read/type)
   */
  static generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0/O, 1/I)
    let code = 'LODGE-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new coupon with specified amount
   */
  static async createCoupon(amount, expiresInDays = 7) {
    const code = this.generateCode();
    const expiresAt = moment().tz('America/New_York').add(expiresInDays, 'days').endOf('day').toISOString();

    return this.query().insert({
      code,
      amount,
      status: 'active',
      expires_at: expiresAt
    });
  }

  /**
   * Find a coupon by code
   */
  static async findByCode(code) {
    return this.query()
      .where('code', code.toUpperCase().trim())
      .first();
  }

  /**
   * Validate and get coupon if usable
   */
  static async validateCoupon(code) {
    const coupon = await this.findByCode(code);

    if (!coupon) {
      return { valid: false, error: 'Coupon code not found' };
    }

    if (coupon.status === 'redeemed') {
      return { valid: false, error: 'This coupon has already been used' };
    }

    if (coupon.status === 'expired') {
      return { valid: false, error: 'This coupon has expired' };
    }

    const now = moment().tz('America/New_York');
    const expiresAt = moment(coupon.expires_at).tz('America/New_York');

    if (now.isAfter(expiresAt)) {
      // Mark as expired
      await this.query().where('id', coupon.id).patch({ status: 'expired' });
      return { valid: false, error: 'This coupon has expired' };
    }

    return { valid: true, coupon };
  }

  /**
   * Redeem a coupon for a booking
   */
  static async redeemCoupon(code, telegramId, appointmentId = null) {
    const validation = await this.validateCoupon(code);

    if (!validation.valid) {
      return validation;
    }

    const coupon = validation.coupon;

    await this.query().where('id', coupon.id).patch({
      status: 'redeemed',
      redeemed_by_telegram_id: telegramId.toString(),
      redeemed_for_appointment_id: appointmentId,
      redeemed_at: new Date().toISOString()
    });

    return {
      valid: true,
      redeemed: true,
      amount: coupon.amount,
      code: coupon.code
    };
  }

  /**
   * Mark coupon as broadcast
   */
  static async markBroadcast(couponId, channelId) {
    return this.query().where('id', couponId).patch({
      broadcast_at: new Date().toISOString(),
      broadcast_channel_id: channelId
    });
  }

  /**
   * Get active coupons count
   */
  static async getActiveCount() {
    const result = await this.query()
      .where('status', 'active')
      .count('* as count')
      .first();
    return parseInt(result?.count) || 0;
  }

  /**
   * Expire old coupons
   */
  static async expireOldCoupons() {
    const now = new Date().toISOString();
    return this.query()
      .where('status', 'active')
      .where('expires_at', '<', now)
      .patch({ status: 'expired' });
  }
}

module.exports = Coupon;
