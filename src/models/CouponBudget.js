const { Model } = require('objection');
const moment = require('moment-timezone');

class CouponBudget extends Model {
  static get tableName() {
    return 'coupon_budget';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['year', 'week'],
      properties: {
        id: { type: 'integer' },
        year: { type: 'integer' },
        week: { type: 'integer' },
        budget_limit: { type: 'number', default: 100.00 },
        amount_used: { type: 'number', default: 0.00 },
        coupons_issued: { type: 'integer', default: 0 },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
      }
    };
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get or create budget record for current week
   */
  static async getCurrentWeekBudget() {
    const now = moment().tz('America/New_York');
    const year = now.isoWeekYear();
    const week = now.isoWeek();

    let budget = await this.query()
      .where('year', year)
      .where('week', week)
      .first();

    if (!budget) {
      budget = await this.query().insert({
        year,
        week,
        budget_limit: 100.00,
        amount_used: 0.00,
        coupons_issued: 0
      });
    }

    return budget;
  }

  /**
   * Check if we have budget remaining this week
   */
  static async hasRemainingBudget(amount = 20) {
    const budget = await this.getCurrentWeekBudget();
    return (budget.amount_used + amount) <= budget.budget_limit;
  }

  /**
   * Get remaining budget for this week
   */
  static async getRemainingBudget() {
    const budget = await this.getCurrentWeekBudget();
    return Math.max(0, budget.budget_limit - budget.amount_used);
  }

  /**
   * Deduct amount from weekly budget
   */
  static async deductBudget(amount) {
    const budget = await this.getCurrentWeekBudget();

    if ((budget.amount_used + amount) > budget.budget_limit) {
      return { success: false, error: 'Weekly budget exceeded' };
    }

    await this.query().where('id', budget.id).patch({
      amount_used: budget.amount_used + amount,
      coupons_issued: budget.coupons_issued + 1
    });

    return {
      success: true,
      remaining: budget.budget_limit - budget.amount_used - amount
    };
  }

  /**
   * Decide coupon amount based on remaining budget
   * Prefers $25 when possible, falls back to $20
   */
  static async decideCouponAmount() {
    const remaining = await this.getRemainingBudget();

    if (remaining >= 25) {
      // Randomly pick $20 or $25 (weighted towards $20 for budget efficiency)
      return Math.random() < 0.6 ? 20 : 25;
    } else if (remaining >= 20) {
      return 20;
    }

    return 0; // No budget left
  }

  /**
   * Get weekly stats
   */
  static async getWeeklyStats() {
    const budget = await this.getCurrentWeekBudget();
    const now = moment().tz('America/New_York');

    return {
      year: budget.year,
      week: budget.week,
      weekStart: now.startOf('isoWeek').format('MMM DD'),
      weekEnd: now.endOf('isoWeek').format('MMM DD'),
      budgetLimit: budget.budget_limit,
      amountUsed: budget.amount_used,
      remaining: budget.budget_limit - budget.amount_used,
      couponsIssued: budget.coupons_issued
    };
  }
}

module.exports = CouponBudget;
