const { Model } = require('objection');
const moment = require('moment-timezone');

// SECURITY: In-memory rate limiter for coupon validation (brute force protection)
const couponAttempts = new Map();

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
    this.updated_at = moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');
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
    // Generate unique code with collision check
    let code;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      code = this.generateCode();
      const existing = await this.query().where('code', code).first();
      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique coupon code after ' + maxAttempts + ' attempts');
    }

    const expiresAt = moment().tz('America/New_York').add(expiresInDays, 'days').endOf('day').format('YYYY-MM-DD HH:mm:ss');

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
   * SECURITY: Rate limited to prevent brute force attacks
   */
  static async validateCoupon(code, userId = null) {
    // SECURITY: Rate limit coupon validation attempts
    const key = userId || 'global';
    const now = Date.now();
    const windowMs = 5 * 60 * 1000; // 5 minutes
    const maxAttempts = 5;

    if (!couponAttempts.has(key)) {
      couponAttempts.set(key, []);
    }

    const attempts = couponAttempts.get(key);
    // Remove old attempts outside window
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    couponAttempts.set(key, recentAttempts);

    if (recentAttempts.length >= maxAttempts) {
      console.warn(`Coupon validation rate limit exceeded for ${key}`);
      return {
        valid: false,
        error: 'Too many attempts. Please wait 5 minutes before trying again.',
        rateLimited: true
      };
    }

    // Track this attempt
    recentAttempts.push(now);
    couponAttempts.set(key, recentAttempts);

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

    const currentTime = moment().tz('America/New_York');
    const expiresAt = moment(coupon.expires_at).tz('America/New_York');

    if (currentTime.isAfter(expiresAt)) {
      // Mark as expired
      await this.query().where('id', coupon.id).patch({ status: 'expired' });
      return { valid: false, error: 'This coupon has expired' };
    }

    return { valid: true, coupon };
  }

  /**
   * Redeem a coupon for a booking
   * Uses transaction with pessimistic locking to prevent double-spend
   */
  static async redeemCoupon(code, telegramId, appointmentId = null) {
    const { transaction } = require('objection');

    return await transaction(Coupon.knex(), async (trx) => {
      // Lock row for update to prevent race condition
      const coupon = await this.query(trx)
        .where('code', code.toUpperCase().trim())
        .where('status', 'active')
        .forUpdate()
        .first();

      if (!coupon) {
        return { valid: false, error: 'Coupon code not found or already redeemed' };
      }

      // Validate expiry within transaction
      const now = moment().tz('America/New_York');
      const expiresAt = moment(coupon.expires_at).tz('America/New_York');

      if (now.isAfter(expiresAt)) {
        // Mark as expired atomically
        await this.query(trx).where('id', coupon.id).patch({ status: 'expired' });
        return { valid: false, error: 'This coupon has expired' };
      }

      // Atomic redemption
      await this.query(trx).where('id', coupon.id).patch({
        status: 'redeemed',
        redeemed_by_telegram_id: telegramId.toString(),
        redeemed_for_appointment_id: appointmentId,
        redeemed_at: moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss')
      });

      return {
        valid: true,
        redeemed: true,
        amount: coupon.amount,
        code: coupon.code
      };
    });
  }

  /**
   * Mark coupon as broadcast
   */
  static async markBroadcast(couponId, channelId) {
    const now = moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');
    return this.query().where('id', couponId).patch({
      broadcast_at: now,
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
