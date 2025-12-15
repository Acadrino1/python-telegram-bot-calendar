/**
 * Migration: Create bot_settings table for dynamic configuration
 */

exports.up = function(knex) {
  return knex.schema.createTable('bot_settings', (table) => {
    table.increments('id').primary();
    table.string('setting_key', 100).notNullable().unique();
    table.text('setting_value').notNullable();
    table.string('setting_type', 20).notNullable().defaultTo('string'); // string, number, boolean, json
    table.string('category', 50).notNullable().defaultTo('general'); // notifications, coupons, booking, general
    table.string('description', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['category']);
    table.index(['setting_key']);
  }).then(() => {
    // Insert default settings
    return knex('bot_settings').insert([
      // Notification Settings
      {
        setting_key: 'notifications_enabled',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'notifications',
        description: 'Enable/disable all push notifications'
      },
      {
        setting_key: 'new_booking_notification',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'notifications',
        description: 'Notify group on new bookings'
      },
      {
        setting_key: 'cancellation_notification',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'notifications',
        description: 'Notify group on cancellations'
      },
      {
        setting_key: 'slot_warning_threshold',
        setting_value: '2',
        setting_type: 'number',
        category: 'notifications',
        description: 'Warn when slots remaining <= this number'
      },
      {
        setting_key: 'daily_summary_enabled',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'notifications',
        description: 'Send daily booking summary'
      },
      {
        setting_key: 'daily_summary_time',
        setting_value: '09:00',
        setting_type: 'string',
        category: 'notifications',
        description: 'Time to send daily summary (HH:MM)'
      },

      // Coupon Settings
      {
        setting_key: 'coupon_drops_enabled',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'coupons',
        description: 'Enable/disable coupon giveaways'
      },
      {
        setting_key: 'coupon_drop_frequency',
        setting_value: '1',
        setting_type: 'number',
        category: 'coupons',
        description: 'Number of coupon drops per day'
      },
      {
        setting_key: 'coupon_weekly_budget',
        setting_value: '100',
        setting_type: 'number',
        category: 'coupons',
        description: 'Weekly coupon budget in dollars'
      },
      {
        setting_key: 'coupon_min_amount',
        setting_value: '20',
        setting_type: 'number',
        category: 'coupons',
        description: 'Minimum coupon amount'
      },
      {
        setting_key: 'coupon_max_amount',
        setting_value: '25',
        setting_type: 'number',
        category: 'coupons',
        description: 'Maximum coupon amount'
      },
      {
        setting_key: 'coupon_expiry_days',
        setting_value: '7',
        setting_type: 'number',
        category: 'coupons',
        description: 'Days until coupon expires'
      },
      {
        setting_key: 'coupon_drop_start_hour',
        setting_value: '11',
        setting_type: 'number',
        category: 'coupons',
        description: 'Earliest hour for coupon drops (0-23)'
      },
      {
        setting_key: 'coupon_drop_end_hour',
        setting_value: '20',
        setting_type: 'number',
        category: 'coupons',
        description: 'Latest hour for coupon drops (0-23)'
      },

      // Booking Settings
      {
        setting_key: 'max_slots_per_day',
        setting_value: '6',
        setting_type: 'number',
        category: 'booking',
        description: 'Maximum booking slots per day'
      },
      {
        setting_key: 'slot_duration_minutes',
        setting_value: '90',
        setting_type: 'number',
        category: 'booking',
        description: 'Duration of each slot in minutes'
      },
      {
        setting_key: 'advance_booking_days',
        setting_value: '7',
        setting_type: 'number',
        category: 'booking',
        description: 'How many days in advance users can book'
      },
      {
        setting_key: 'min_advance_hours',
        setting_value: '2',
        setting_type: 'number',
        category: 'booking',
        description: 'Minimum hours before appointment to book'
      },

      // User Approval Settings
      {
        setting_key: 'require_user_approval',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'general',
        description: 'Require admin approval for new users'
      },
      {
        setting_key: 'new_user_notification',
        setting_value: 'true',
        setting_type: 'boolean',
        category: 'notifications',
        description: 'Notify admins of new user registrations'
      }
    ]);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('bot_settings');
};
