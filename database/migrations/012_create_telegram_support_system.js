/**
 * Telegram Support System Migration
 * 
 * Creates optimized support system for Telegram-based workflows:
 * - Live chat session management
 * - Enhanced Telegram-specific features
 * - Real-time session tracking
 * - Telegram group coordination
 * 
 * Architecture Decision:
 * - Focus on real-time session management
 * - Optimize for Telegram message threading
 * - Support agent coordination via Telegram groups
 * - Track conversation contexts and handoffs
 */

exports.up = function(knex) {
  return knex.schema
    
    // Live chat session management for real-time support
    .createTable('support_sessions', function(table) {
      table.increments('id').primary();
      table.string('session_id', 64).unique().notNullable();           // Unique session identifier
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('ticket_id', 32).nullable().references('ticket_id').inTable('support_tickets').onDelete('SET NULL');
      
      // Session state management
      table.enum('status', ['active', 'waiting', 'assigned', 'paused', 'ended']).defaultTo('active');
      table.integer('agent_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('agent_joined_at').nullable();
      table.timestamp('last_activity_at').defaultTo(knex.fn.now());
      table.timestamp('ended_at').nullable();
      
      // Telegram-specific fields
      table.bigInteger('telegram_chat_id').notNullable();              // User's private chat with bot
      table.bigInteger('agent_chat_id').nullable();                    // Agent's private chat (if different)
      table.string('telegram_thread_id', 32).nullable();               // Group message thread ID for coordination
      table.json('session_context').nullable();                       // Current conversation context
      
      // Queue management
      table.integer('queue_position').nullable();                      // Position in support queue
      table.enum('priority', ['low', 'normal', 'high', 'urgent']).defaultTo('normal');
      table.string('department', 50).defaultTo('general');             // Support department routing
      
      // Session metrics
      table.integer('wait_time_seconds').nullable();                   // Time waiting for agent
      table.integer('session_duration_seconds').nullable();            // Total session duration
      table.integer('message_count').defaultTo(0);                     // Total messages in session
      table.integer('agent_response_count').defaultTo(0);              // Agent responses in session
      
      // Handoff and escalation
      table.integer('previous_agent_id').unsigned().nullable().references('id').inTable('users');
      table.timestamp('last_handoff_at').nullable();
      table.text('handoff_notes').nullable();                          // Notes for agent handoff
      table.integer('escalation_count').defaultTo(0);
      
      // Quality and feedback
      table.integer('satisfaction_rating').nullable();                 // 1-5 user rating
      table.text('feedback_text').nullable();                          // User feedback
      table.boolean('resolved').defaultTo(false);                      // User marked as resolved
      
      // Automation flags
      table.boolean('auto_assigned').defaultTo(false);                 // Automatically assigned to agent
      table.boolean('requires_human').defaultTo(false);                // Requires human agent (not bot)
      table.json('automation_flags').nullable();                       // Bot automation state
      
      // Timestamps
      table.timestamps(true, true);
      
      // Indexes for performance
      table.index(['status', 'queue_position'], 'idx_session_queue');
      table.index(['agent_id', 'status'], 'idx_agent_sessions');
      table.index(['user_id', 'status'], 'idx_user_sessions');
      table.index('telegram_chat_id', 'idx_telegram_chat');
      table.index(['department', 'priority', 'started_at'], 'idx_routing');
      table.index('last_activity_at', 'idx_activity');
      table.index(['created_at', 'ended_at'], 'idx_session_timespan');
    })
    
    // Enhanced Telegram-specific message metadata
    .createTable('telegram_message_metadata', function(table) {
      table.increments('id').primary();
      table.integer('support_message_id').unsigned().notNullable().references('id').inTable('support_messages').onDelete('CASCADE');
      
      // Telegram message details
      table.bigInteger('telegram_message_id').notNullable();
      table.bigInteger('telegram_chat_id').notNullable();
      table.string('message_thread_id', 32).nullable();                // For threaded conversations
      table.integer('reply_to_message_id').nullable();                 // Reply threading
      
      // Message format and content
      table.enum('content_type', ['text', 'photo', 'document', 'voice', 'video', 'sticker', 'location']).defaultTo('text');
      table.json('telegram_entities').nullable();                      // Message entities (mentions, links, etc.)
      table.string('file_id').nullable();                              // Telegram file ID for media
      table.integer('file_size').nullable();                           // File size in bytes
      table.string('mime_type').nullable();                            // MIME type for files
      
      // Message status in Telegram
      table.boolean('is_edited').defaultTo(false);
      table.boolean('is_forwarded').defaultTo(false);
      table.boolean('is_deleted').defaultTo(false);
      table.timestamp('telegram_date').notNullable();                  // Original Telegram timestamp
      table.timestamp('edit_date').nullable();                         // Last edit timestamp
      
      // Agent coordination
      table.boolean('sent_to_group').defaultTo(false);                 // Shared with agent group
      table.bigInteger('group_message_id').nullable();                 // Message ID in agent group
      table.json('agent_reactions').nullable();                        // Agent emoji reactions
      
      // Indexes
      table.index(['telegram_chat_id', 'telegram_message_id'], 'idx_telegram_msg_unique');
      table.index(['message_thread_id', 'telegram_date'], 'idx_thread_chronology');
      table.index('support_message_id', 'idx_support_message');
      table.index(['sent_to_group', 'group_message_id'], 'idx_group_coordination');
    })
    
    // Agent group coordination for Telegram
    .createTable('agent_group_coordination', function(table) {
      table.increments('id').primary();
      table.bigInteger('group_chat_id').notNullable();                 // Telegram group chat ID
      table.string('group_title').notNullable();                       // Group name
      table.string('group_type', 20).defaultTo('support');             // Group purpose
      
      // Group configuration
      table.boolean('is_active').defaultTo(true);
      table.json('allowed_departments').nullable();                    // Departments this group handles
      table.json('group_settings').nullable();                         // Group-specific settings
      
      // Coordination features
      table.boolean('auto_forward_tickets').defaultTo(true);           // Auto-forward new tickets
      table.boolean('enable_agent_assignment').defaultTo(true);        // Allow agents to claim tickets
      table.string('assignment_mode', 20).defaultTo('manual');         // 'manual', 'auto', 'round_robin'
      
      // Performance tracking
      table.integer('total_tickets_handled').defaultTo(0);
      table.decimal('avg_response_time', 8, 2).nullable();
      table.timestamp('last_activity_at').nullable();
      
      table.timestamps(true, true);
      
      // Indexes
      table.index('group_chat_id', 'idx_group_chat_id');
      table.index(['is_active', 'group_type'], 'idx_active_groups');
      table.index('last_activity_at', 'idx_group_activity');
    })
    
    // Quick reply templates for faster agent responses
    .createTable('telegram_quick_replies', function(table) {
      table.increments('id').primary();
      table.string('template_key', 50).notNullable();                  // Unique template identifier
      table.text('template_text').notNullable();                       // Response template
      table.string('category', 30).notNullable();                      // Template category
      table.string('department', 50).defaultTo('general');             // Department-specific templates
      
      // Template metadata
      table.string('language_code', 10).defaultTo('en');               // Language for i18n
      table.boolean('is_active').defaultTo(true);
      table.json('placeholders').nullable();                           // Available placeholders
      table.text('description').nullable();                            // Template description
      
      // Usage tracking
      table.integer('usage_count').defaultTo(0);
      table.timestamp('last_used_at').nullable();
      table.integer('created_by').unsigned().nullable().references('id').inTable('users');
      
      table.timestamps(true, true);
      
      // Indexes
      table.index(['category', 'department', 'is_active'], 'idx_template_lookup');
      table.index('template_key', 'idx_template_key');
      table.index('usage_count', 'idx_usage_popularity');
      table.unique(['template_key', 'language_code'], 'unique_template_lang');
    })
    
    // Agent performance metrics optimized for Telegram workflows
    .createTable('agent_performance_metrics', function(table) {
      table.increments('id').primary();
      table.integer('agent_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('metric_date').notNullable();                         // Daily metrics
      
      // Response time metrics
      table.decimal('avg_first_response_time', 8, 2).nullable();       // Seconds to first response
      table.decimal('avg_response_time', 8, 2).nullable();             // Average response time
      table.integer('median_response_time').nullable();                // Median response time
      table.integer('max_response_time').nullable();                   // Slowest response
      
      // Volume metrics
      table.integer('sessions_handled').defaultTo(0);                  // Total sessions
      table.integer('messages_sent').defaultTo(0);                     // Messages sent by agent
      table.integer('tickets_resolved').defaultTo(0);                  // Tickets marked resolved
      table.integer('handoffs_given').defaultTo(0);                    // Sessions handed off
      table.integer('handoffs_received').defaultTo(0);                 // Sessions received
      
      // Quality metrics
      table.decimal('avg_satisfaction_rating', 3, 2).nullable();       // Average user rating
      table.integer('satisfaction_responses').defaultTo(0);            // Number of ratings received
      table.decimal('resolution_rate', 5, 2).nullable();               // Percentage resolved
      
      // Availability metrics
      table.integer('online_minutes').defaultTo(0);                    // Minutes marked available
      table.integer('active_chat_minutes').defaultTo(0);               // Minutes in active chats
      table.decimal('utilization_rate', 5, 2).nullable();              // Active/Online ratio
      
      // Telegram-specific metrics
      table.integer('quick_replies_used').defaultTo(0);                // Quick reply usage
      table.integer('media_messages_sent').defaultTo(0);               // Photos/docs sent
      table.integer('group_interactions').defaultTo(0);                // Interactions in agent groups
      
      table.timestamps(true, true);
      
      // Indexes
      table.index(['agent_id', 'metric_date'], 'idx_agent_daily_metrics');
      table.index('metric_date', 'idx_metric_date');
      table.index(['avg_satisfaction_rating', 'sessions_handled'], 'idx_quality_volume');
      table.unique(['agent_id', 'metric_date'], 'unique_agent_date');
    })
    
    // Session event log for detailed tracking
    .createTable('support_session_events', function(table) {
      table.increments('id').primary();
      table.string('session_id', 64).notNullable().references('session_id').inTable('support_sessions').onDelete('CASCADE');
      
      // Event details
      table.enum('event_type', [
        'session_started', 'agent_joined', 'agent_left', 'user_left',
        'message_sent', 'file_uploaded', 'status_changed', 'escalated',
        'handoff_requested', 'handoff_completed', 'session_paused',
        'session_resumed', 'session_ended', 'feedback_submitted'
      ]).notNullable();
      
      table.integer('actor_id').unsigned().nullable().references('id').inTable('users');
      table.enum('actor_type', ['user', 'agent', 'system']).notNullable();
      
      // Event data
      table.json('event_data').nullable();                             // Event-specific data
      table.text('event_description').nullable();                      // Human-readable description
      table.bigInteger('telegram_message_id').nullable();              // Related Telegram message
      
      // Metadata
      table.timestamp('event_timestamp').defaultTo(knex.fn.now());
      table.string('ip_address', 45).nullable();                       // For security tracking
      
      // Indexes
      table.index(['session_id', 'event_timestamp'], 'idx_session_chronology');
      table.index(['event_type', 'event_timestamp'], 'idx_event_type_time');
      table.index('actor_id', 'idx_event_actor');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('support_session_events')
    .dropTableIfExists('agent_performance_metrics')
    .dropTableIfExists('telegram_quick_replies')
    .dropTableIfExists('agent_group_coordination')
    .dropTableIfExists('telegram_message_metadata')
    .dropTableIfExists('support_sessions');
};