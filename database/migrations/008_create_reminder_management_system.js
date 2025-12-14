/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Recurring Patterns Table - MUST be created first (referenced by custom_reminders)
    .createTable('recurring_patterns', (table) => {
      table.increments('id').primary();
      table.uuid('uuid').defaultTo(knex.raw('(UUID())')).unique().index();
      
      // Pattern Definition
      table.string('name', 100).notNullable();
      table.text('description').nullable();
      table.string('pattern_type', 20).notNullable(); // 'daily', 'weekly', 'monthly', 'yearly', 'custom'
      table.integer('interval_value').defaultTo(1); // Every X days/weeks/months
      table.json('pattern_config').nullable(); // Detailed pattern configuration
      
      // Weekly patterns
      table.json('days_of_week').nullable(); // [0,1,2,3,4,5,6] for Sun-Sat
      table.json('weeks_of_month').nullable(); // [1,2,3,4,5] for week numbers
      
      // Monthly patterns
      table.json('days_of_month').nullable(); // [1,2,3...31] for specific days
      table.json('months_of_year').nullable(); // [1,2,3...12] for specific months
      
      // Advanced patterns
      table.string('timezone', 50).defaultTo('America/New_York');
      table.time('preferred_time').nullable();
      table.json('exclusion_dates').nullable(); // Dates to skip
      table.json('inclusion_dates').nullable(); // Additional specific dates
      
      // Status
      table.boolean('is_active').defaultTo(true);
      table.boolean('is_template').defaultTo(false); // Can be used as template
      
      // Timestamps
      table.timestamps(true, true);
      
      // Indexes
      table.index(['pattern_type', 'is_active']);
      table.index('is_template');
    })

    // Reminder Templates Table - MUST be created before custom_reminders (referenced by it)
    .createTable('reminder_templates', (table) => {
      table.increments('id').primary();
      table.uuid('uuid').defaultTo(knex.raw('(UUID())')).unique().index();
      
      // Template Info
      table.string('name', 100).notNullable();
      table.text('description').nullable();
      table.string('category', 50).defaultTo('general'); // 'appointment', 'medical', 'business', 'personal'
      
      // Template Content
      table.string('title_template', 255).notNullable();
      table.text('content_template').notNullable();
      table.json('required_variables').nullable(); // List of required template variables
      table.json('optional_variables').nullable(); // List of optional template variables
      
      // Default Settings
      table.integer('default_advance_minutes').defaultTo(60);
      table.string('default_priority', 20).defaultTo('medium');
      table.boolean('default_telegram').defaultTo(true);
      table.boolean('default_email').defaultTo(false);
      table.boolean('default_sms').defaultTo(false);
      
      // Usage & Status
      table.integer('usage_count').defaultTo(0);
      table.boolean('is_active').defaultTo(true);
      table.boolean('is_system_template').defaultTo(false);
      table.string('created_by', 100).nullable();
      
      // Timestamps
      table.timestamps(true, true);
      
      // Indexes
      table.index(['category', 'is_active']);
      table.index('is_system_template');
      table.unique(['name', 'category']);
    })

    // Custom Reminders Table - created after recurring_patterns and reminder_templates
    .createTable('custom_reminders', (table) => {
      table.increments('id').primary();
      table.uuid('uuid').defaultTo(knex.raw('(UUID())')).unique().index();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('appointment_id').unsigned().nullable().references('id').inTable('appointments').onDelete('CASCADE');
      table.integer('template_id').unsigned().nullable().references('id').inTable('reminder_templates').onDelete('SET NULL');

      // Reminder Content
      table.string('title', 255).notNullable();
      table.text('content').notNullable();
      table.string('reminder_type', 50).notNullable(); // 'appointment', 'custom', 'recurring'
      table.string('priority', 20).defaultTo('medium'); // 'low', 'medium', 'high', 'urgent'

      // Scheduling
      table.datetime('scheduled_for').notNullable().index();
      table.datetime('original_scheduled_for').nullable(); // For tracking changes
      table.integer('advance_minutes').defaultTo(60); // Minutes before the event

      // Delivery Channels
      table.boolean('send_telegram').defaultTo(true);
      table.boolean('send_email').defaultTo(false);
      table.boolean('send_sms').defaultTo(false);
      table.json('delivery_preferences').nullable(); // Channel-specific preferences

      // Recurrence
      table.integer('recurring_pattern_id').unsigned().nullable().references('id').inTable('recurring_patterns').onDelete('SET NULL');
      table.datetime('recurrence_end_date').nullable();
      table.integer('max_occurrences').nullable();
      table.integer('occurrence_count').defaultTo(0);

      // Status & Tracking
      table.string('status', 20).defaultTo('scheduled'); // 'scheduled', 'sent', 'failed', 'cancelled', 'expired'
      table.datetime('sent_at').nullable();
      table.json('delivery_results').nullable(); // Results per channel
      table.text('failure_reason').nullable();
      table.integer('retry_count').defaultTo(0);
      table.datetime('next_retry_at').nullable();

      // Metadata
      table.json('metadata').nullable(); // Additional reminder data
      table.boolean('is_system_generated').defaultTo(false);
      table.string('created_by_role', 50).nullable(); // 'admin', 'user', 'system'

      // Timestamps
      table.timestamps(true, true);
      table.datetime('deleted_at').nullable();

      // Indexes
      table.index(['user_id', 'status']);
      table.index(['scheduled_for', 'status']);
      table.index(['reminder_type', 'status']);
      table.index(['appointment_id']);
      table.index(['recurring_pattern_id']);
    })

    // User Reminder Preferences Table
    .createTable('user_reminder_preferences', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      
      // Default Delivery Preferences
      table.boolean('default_telegram_enabled').defaultTo(true);
      table.boolean('default_email_enabled').defaultTo(false);
      table.boolean('default_sms_enabled').defaultTo(false);
      
      // Timing Preferences
      table.json('preferred_reminder_times').nullable(); // Default reminder advance times
      table.string('timezone', 50).defaultTo('America/New_York');
      table.json('quiet_hours').nullable(); // Hours when reminders should not be sent
      table.json('preferred_days').nullable(); // Preferred days for recurring reminders
      
      // Content Preferences
      table.string('preferred_language', 10).defaultTo('en');
      table.boolean('include_appointment_details').defaultTo(true);
      table.boolean('include_cancellation_info').defaultTo(true);
      table.boolean('include_location_info').defaultTo(true);
      
      // Notification Frequency
      table.string('max_daily_reminders', 20).defaultTo('unlimited'); // 'unlimited', 'limited'
      table.integer('max_daily_count').nullable();
      table.boolean('group_similar_reminders').defaultTo(false);
      
      // Advanced Settings
      table.json('custom_templates').nullable(); // User's custom template preferences
      table.json('channel_settings').nullable(); // Per-channel specific settings
      
      // Timestamps
      table.timestamps(true, true);
      
      // Unique constraint
      table.unique('user_id');
    })
    
    // Reminder Delivery Logs Table
    .createTable('reminder_delivery_logs', (table) => {
      table.increments('id').primary();
      table.integer('custom_reminder_id').unsigned().references('id').inTable('custom_reminders').onDelete('CASCADE');
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      
      // Delivery Details
      table.string('delivery_channel', 20).notNullable(); // 'telegram', 'email', 'sms'
      table.string('recipient', 255).notNullable(); // Email, phone, telegram_id
      table.text('message_content').nullable();
      table.string('subject', 255).nullable(); // For email
      
      // Status & Results
      table.string('status', 20).notNullable(); // 'sent', 'failed', 'pending', 'retrying'
      table.text('response_data').nullable(); // API response from delivery service
      table.text('error_message').nullable();
      table.datetime('sent_at').nullable();
      table.datetime('delivered_at').nullable();
      table.datetime('read_at').nullable(); // If available from service
      
      // Retry Logic
      table.integer('attempt_number').defaultTo(1);
      table.datetime('next_retry_at').nullable();
      
      // Metadata
      table.json('metadata').nullable(); // Additional delivery data
      table.decimal('cost', 10, 4).nullable(); // Cost of delivery (for SMS/email services)
      
      // Timestamps
      table.timestamps(true, true);
      
      // Indexes
      table.index(['custom_reminder_id', 'delivery_channel']);
      table.index(['user_id', 'status']);
      table.index(['sent_at']);
      table.index(['status', 'next_retry_at']);
    })
    
    // Reminder Analytics Table
    .createTable('reminder_analytics', (table) => {
      table.increments('id').primary();
      table.date('analytics_date').notNullable();
      table.string('analytics_type', 50).notNullable(); // 'daily', 'weekly', 'monthly'
      
      // Reminder Statistics
      table.integer('total_reminders_created').defaultTo(0);
      table.integer('total_reminders_sent').defaultTo(0);
      table.integer('total_reminders_failed').defaultTo(0);
      table.integer('total_reminders_cancelled').defaultTo(0);
      
      // Channel Statistics
      table.integer('telegram_sent').defaultTo(0);
      table.integer('email_sent').defaultTo(0);
      table.integer('sms_sent').defaultTo(0);
      table.integer('telegram_failed').defaultTo(0);
      table.integer('email_failed').defaultTo(0);
      table.integer('sms_failed').defaultTo(0);
      
      // Type Statistics
      table.integer('appointment_reminders').defaultTo(0);
      table.integer('custom_reminders').defaultTo(0);
      table.integer('recurring_reminders').defaultTo(0);
      table.integer('system_reminders').defaultTo(0);
      
      // Performance Metrics
      table.decimal('success_rate', 5, 2).defaultTo(0); // Percentage
      table.decimal('average_delivery_time', 10, 3).nullable(); // In minutes
      table.decimal('total_delivery_cost', 10, 4).defaultTo(0);
      
      // User Engagement
      table.integer('active_users').defaultTo(0);
      table.integer('users_with_preferences').defaultTo(0);
      table.integer('templates_used').defaultTo(0);
      
      // Timestamps
      table.timestamps(true, true);
      
      // Unique constraint and indexes
      table.unique(['analytics_date', 'analytics_type']);
      table.index('analytics_date');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('reminder_analytics')
    .dropTableIfExists('reminder_delivery_logs')
    .dropTableIfExists('user_reminder_preferences')
    .dropTableIfExists('reminder_templates')
    .dropTableIfExists('custom_reminders')
    .dropTableIfExists('recurring_patterns');
};