exports.up = function(knex) {
  return knex.schema
    // Broadcast campaigns table
    .createTable('broadcast_campaigns', table => {
      table.increments('id').primary();
      table.string('name', 255).notNullable();
      table.text('description');
      table.enum('status', ['draft', 'scheduled', 'sending', 'completed', 'paused', 'cancelled'])
        .defaultTo('draft').notNullable();
      table.enum('type', ['broadcast', 'announcement', 'ab_test']).defaultTo('broadcast').notNullable();
      table.integer('created_by').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('scheduled_at');
      table.timestamp('sent_at');
      table.integer('total_recipients').defaultTo(0);
      table.integer('sent_count').defaultTo(0);
      table.integer('delivered_count').defaultTo(0);
      table.integer('failed_count').defaultTo(0);
      table.json('targeting_criteria');
      table.json('ab_test_config');
      table.json('delivery_settings');
      table.json('statistics');
      table.timestamps(true, true);
      
      table.index(['status', 'scheduled_at']);
      table.index(['created_by']);
      table.index(['type']);
    })

    // Broadcast messages table
    .createTable('broadcast_messages', table => {
      table.increments('id').primary();
      table.integer('campaign_id').unsigned().references('id').inTable('broadcast_campaigns').onDelete('CASCADE');
      table.string('variant', 50).defaultTo('A'); // For A/B testing
      table.text('content').notNullable();
      table.json('media_attachments');
      table.json('inline_keyboard');
      table.enum('parse_mode', ['HTML', 'Markdown', 'MarkdownV2']).defaultTo('HTML');
      table.boolean('disable_web_page_preview').defaultTo(false);
      table.boolean('disable_notification').defaultTo(false);
      table.integer('reply_to_message_id');
      table.timestamps(true, true);
      
      table.index(['campaign_id', 'variant']);
    })

    // Message templates table
    .createTable('message_templates', table => {
      table.increments('id').primary();
      table.string('name', 255).notNullable();
      table.text('description');
      table.enum('category', ['announcement', 'reminder', 'promotional', 'system', 'custom'])
        .defaultTo('custom').notNullable();
      table.text('content').notNullable();
      table.json('media_attachments');
      table.json('inline_keyboard');
      table.json('variables'); // Template variables
      table.integer('created_by').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('usage_count').defaultTo(0);
      table.timestamp('last_used_at');
      table.timestamps(true, true);
      
      table.index(['category']);
      table.index(['created_by']);
    })

    // Broadcast recipients table (for tracking individual sends)
    .createTable('broadcast_recipients', table => {
      table.increments('id').primary();
      table.integer('campaign_id').unsigned().references('id').inTable('broadcast_campaigns').onDelete('CASCADE');
      table.integer('message_id').unsigned().references('id').inTable('broadcast_messages').onDelete('CASCADE');
      table.string('recipient_type', 50).notNullable(); // 'user', 'chat', 'channel'
      table.string('recipient_id', 255).notNullable(); // Telegram user/chat/channel ID
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL'); // Our internal user ID
      table.enum('status', ['queued', 'sending', 'sent', 'delivered', 'failed', 'blocked'])
        .defaultTo('queued').notNullable();
      table.string('telegram_message_id', 255); // Telegram's message ID when sent
      table.timestamp('queued_at').defaultTo(knex.fn.now());
      table.timestamp('sent_at');
      table.timestamp('delivered_at');
      table.json('error_details');
      table.integer('retry_count').defaultTo(0);
      table.timestamp('next_retry_at');
      table.timestamps(true, true);
      
      table.index(['campaign_id', 'status']);
      table.index(['recipient_id', 'recipient_type']);
      table.index(['status', 'next_retry_at']);
      table.index(['user_id']);
    })

    // Recipient groups table
    .createTable('recipient_groups', table => {
      table.increments('id').primary();
      table.string('name', 255).notNullable();
      table.text('description');
      table.json('criteria'); // Dynamic criteria for group membership
      table.integer('member_count').defaultTo(0);
      table.integer('created_by').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('last_updated_at').defaultTo(knex.fn.now());
      table.timestamps(true, true);
      
      table.index(['created_by']);
    })

    // Broadcast analytics table
    .createTable('broadcast_analytics', table => {
      table.increments('id').primary();
      table.integer('campaign_id').unsigned().references('id').inTable('broadcast_campaigns').onDelete('CASCADE');
      table.string('metric_name', 100).notNullable();
      table.string('metric_value', 255).notNullable();
      table.json('metadata');
      table.timestamp('recorded_at').defaultTo(knex.fn.now());
      
      table.index(['campaign_id', 'metric_name']);
      table.index(['recorded_at']);
    })

    // User broadcast preferences
    .createTable('user_broadcast_preferences', table => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('telegram_user_id', 255);
      table.boolean('allow_broadcasts').defaultTo(true);
      table.boolean('allow_announcements').defaultTo(true);
      table.boolean('allow_promotional').defaultTo(true);
      table.json('preferred_times'); // When user prefers to receive messages
      table.string('timezone', 100).defaultTo('UTC');
      table.json('blocked_keywords'); // Keywords to avoid in messages to this user
      table.timestamps(true, true);
      
      table.unique(['user_id']);
      table.unique(['telegram_user_id']);
      table.index(['allow_broadcasts']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('user_broadcast_preferences')
    .dropTableIfExists('broadcast_analytics')
    .dropTableIfExists('recipient_groups')
    .dropTableIfExists('broadcast_recipients')
    .dropTableIfExists('message_templates')
    .dropTableIfExists('broadcast_messages')
    .dropTableIfExists('broadcast_campaigns');
};