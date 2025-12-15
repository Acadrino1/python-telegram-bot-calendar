/**
 * Migration: Create coupon giveaway system
 * - Daily random coupon drops during business hours
 * - $100 weekly budget limit
 * - $20 or $25 off coupons
 */

exports.up = function(knex) {
  return knex.schema
    // Coupons table
    .createTable('coupons', function(table) {
      table.increments('id').primary();
      table.string('code', 20).notNullable().unique();
      table.decimal('amount', 10, 2).notNullable(); // 20.00 or 25.00
      table.enum('status', ['active', 'redeemed', 'expired']).defaultTo('active');

      // Tracking
      table.string('redeemed_by_telegram_id', 64).nullable();
      table.integer('redeemed_for_appointment_id').unsigned().nullable();
      table.datetime('redeemed_at').nullable();
      table.datetime('expires_at').notNullable();

      // Broadcast tracking
      table.datetime('broadcast_at').nullable();
      table.string('broadcast_channel_id', 64).nullable();

      // Timestamps
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());

      // Indexes
      table.index('code');
      table.index('status');
      table.index('expires_at');
    })

    // Weekly budget tracking
    .createTable('coupon_budget', function(table) {
      table.increments('id').primary();
      table.integer('year').notNullable();
      table.integer('week').notNullable(); // ISO week number
      table.decimal('budget_limit', 10, 2).defaultTo(100.00);
      table.decimal('amount_used', 10, 2).defaultTo(0.00);
      table.integer('coupons_issued').defaultTo(0);
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());

      // Unique constraint for year+week
      table.unique(['year', 'week']);
    })

    // Giveaway schedule (tracks when coupons should drop)
    .createTable('coupon_schedule', function(table) {
      table.increments('id').primary();
      table.date('scheduled_date').notNullable();
      table.time('scheduled_time').notNullable();
      table.decimal('coupon_amount', 10, 2).notNullable();
      table.enum('status', ['pending', 'sent', 'skipped']).defaultTo('pending');
      table.integer('coupon_id').unsigned().nullable().references('id').inTable('coupons');
      table.datetime('executed_at').nullable();
      table.datetime('created_at').defaultTo(knex.fn.now());

      // Index for finding pending broadcasts
      table.index(['scheduled_date', 'scheduled_time', 'status']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('coupon_schedule')
    .dropTableIfExists('coupon_budget')
    .dropTableIfExists('coupons');
};
