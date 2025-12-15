/**
 * Migration: Add bulk discount setting for payment pricing
 */

exports.up = function(knex) {
  return knex('bot_settings').insert([
    {
      setting_key: 'bulk_discount_percentage',
      setting_value: '0',
      setting_type: 'number',
      category: 'booking',
      description: 'Discount percentage for bulk appointments (0-100)'
    }
  ]);
};

exports.down = function(knex) {
  return knex('bot_settings').where('setting_key', 'bulk_discount_percentage').del();
};
