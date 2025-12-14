/**
 * Migration: Create bot_channels table
 * Stores groups and channels where the bot has been added
 */

exports.up = function(knex) {
  return knex.schema.createTable('bot_channels', (table) => {
    table.increments('id').primary();
    table.string('chat_id', 64).notNullable().unique();
    table.string('chat_type', 20).notNullable(); // 'group', 'supergroup', 'channel'
    table.string('title', 255);
    table.string('username', 255); // @channel_username if public
    table.boolean('is_active').defaultTo(true);
    table.boolean('can_post').defaultTo(true); // bot has permission to post
    table.boolean('broadcast_enabled').defaultTo(true); // include in broadcasts
    table.string('added_by_user_id', 64); // telegram user who added the bot
    table.timestamp('joined_at').defaultTo(knex.fn.now());
    table.timestamp('left_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('chat_id');
    table.index('is_active');
    table.index('broadcast_enabled');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('bot_channels');
};
