exports.up = function(knex) {
  return knex.schema
    // Support tickets tracking table
    .createTable('support_tickets', function(table) {
      table.increments('id').primary();
      table.string('ticket_id', 32).unique().notNullable();          // SUPP-timestamp-random
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('agent_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      table.enum('status', ['open', 'assigned', 'closed', 'escalated']).defaultTo('open');
      table.enum('priority', ['low', 'medium', 'high', 'critical']).defaultTo('medium');
      table.string('category', 50).nullable();                       // 'booking', 'technical', 'billing', etc.
      
      // Metadata
      table.timestamps(true, true);
      table.timestamp('assigned_at').nullable();
      table.timestamp('closed_at').nullable();
      table.timestamp('last_message_at').nullable();
      
      // Configuration
      table.timestamp('auto_close_at').nullable();                   // Auto-close inactive tickets
      table.integer('escalation_level').defaultTo(0);               // 0=L1, 1=L2, 2=L3 support
      
      // Indexes
      table.index('ticket_id', 'idx_ticket_id');
      table.index(['user_id', 'status'], 'idx_user_status');
      table.index(['agent_id', 'status'], 'idx_agent_status');
      table.index(['status', 'priority'], 'idx_status_priority');
      table.index('created_at', 'idx_created_at');
    })
    
    // Message history for support conversations
    .createTable('support_messages', function(table) {
      table.increments('id').primary();
      table.string('ticket_id', 32).notNullable();
      
      // Message content
      table.text('message_text').notNullable();
      table.enum('message_type', ['user', 'agent', 'system']).notNullable();
      table.bigInteger('telegram_message_id').nullable();            // Original Telegram message ID
      
      // Sender info (anonymized for agents)
      table.integer('sender_id').unsigned().notNullable();
      table.enum('sender_type', ['user', 'agent', 'system']).notNullable();
      
      // Metadata
      table.timestamps(true, true);
      table.timestamp('edited_at').nullable();
      table.boolean('is_internal').defaultTo(false);                // Internal agent notes
      
      // Indexes
      table.index(['ticket_id', 'created_at'], 'idx_ticket_time');
      table.index(['sender_id', 'sender_type'], 'idx_sender');
      
      // Foreign key
      table.foreign('ticket_id').references('ticket_id').inTable('support_tickets').onDelete('CASCADE');
    })
    
    // Agent assignments and load balancing
    .createTable('support_agent_assignments', function(table) {
      table.increments('id').primary();
      table.integer('agent_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('ticket_id', 32).notNullable();
      
      // Assignment details
      table.timestamp('assigned_at').defaultTo(knex.fn.now());
      table.timestamp('unassigned_at').nullable();
      table.enum('assignment_type', ['auto', 'manual', 'escalated']).defaultTo('auto');
      
      // Performance tracking
      table.integer('first_response_time').nullable();               // Seconds to first response
      table.decimal('avg_response_time', 8, 2).nullable();           // Average response time
      table.integer('satisfaction_rating').nullable();               // 1-5 rating
      
      // Indexes
      table.index(['agent_id', 'unassigned_at'], 'idx_agent_active');
      table.index(['ticket_id', 'assigned_at'], 'idx_ticket_assignment');
      
      // Foreign key
      table.foreign('ticket_id').references('ticket_id').inTable('support_tickets').onDelete('CASCADE');
    })
    
    // Rate limiting and abuse prevention
    .createTable('support_rate_limits', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().unique().references('id').inTable('users').onDelete('CASCADE');
      
      // Rate limiting windows
      table.integer('daily_tickets').defaultTo(0);
      table.integer('hourly_messages').defaultTo(0);
      
      // Tracking
      table.timestamp('last_ticket_at').nullable();
      table.timestamp('last_message_at').nullable();
      table.timestamp('reset_daily_at').notNullable();
      table.timestamp('reset_hourly_at').notNullable();
      
      // Flags
      table.boolean('is_blocked').defaultTo(false);
      table.string('block_reason').nullable();
      table.timestamp('blocked_until').nullable();
      
      // Indexes
      table.index(['reset_daily_at', 'reset_hourly_at'], 'idx_reset_times');
      table.index('is_blocked', 'idx_blocked');
    })
    
    // Support agent status and availability
    .createTable('support_agent_status', function(table) {
      table.increments('id').primary();
      table.integer('agent_id').unsigned().unique().references('id').inTable('users').onDelete('CASCADE');
      
      // Status
      table.enum('status', ['available', 'busy', 'away', 'offline']).defaultTo('offline');
      table.integer('max_concurrent_tickets').defaultTo(5);
      table.integer('current_ticket_count').defaultTo(0);
      
      // Shift information
      table.time('shift_start').nullable();
      table.time('shift_end').nullable();
      table.string('timezone', 50).defaultTo('UTC');
      
      // Performance metrics
      table.decimal('avg_response_time', 8, 2).nullable();
      table.integer('total_tickets_handled').defaultTo(0);
      table.decimal('satisfaction_score', 3, 2).nullable();
      
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index(['status', 'current_ticket_count', 'max_concurrent_tickets'], 'idx_status_availability');
      table.index('updated_at', 'idx_updated_at');
    })
    
    // Support group members (Telegram group verification)
    .createTable('support_group_members', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.bigInteger('telegram_chat_id').notNullable();
      table.timestamp('added_at').defaultTo(knex.fn.now());
      table.boolean('is_active').defaultTo(true);
      
      // Indexes
      table.index(['user_id', 'is_active'], 'idx_user_active');
      table.index('telegram_chat_id', 'idx_chat_id');
      table.unique(['user_id', 'telegram_chat_id'], 'unique_user_chat');
    })
    
    // Support audit log for security and compliance
    .createTable('support_audit_log', function(table) {
      table.increments('id').primary();
      table.string('action', 50).notNullable();                     // 'ticket_created', 'message_sent', etc.
      table.string('ticket_id', 32).nullable();
      table.integer('user_id').unsigned().nullable().references('id').inTable('users');
      table.integer('agent_id').unsigned().nullable().references('id').inTable('users');
      table.json('details').nullable();                             // Additional action details
      table.string('ip_address', 45).nullable();                    // IPv4 or IPv6
      table.string('user_agent').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index(['ticket_id', 'created_at'], 'idx_ticket_audit');
      table.index(['action', 'created_at'], 'idx_action_time');
      table.index('created_at', 'idx_audit_time');
      
      // Foreign key (optional reference)
      table.foreign('ticket_id').references('ticket_id').inTable('support_tickets').onDelete('SET NULL');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('support_audit_log')
    .dropTableIfExists('support_group_members')  
    .dropTableIfExists('support_agent_status')
    .dropTableIfExists('support_rate_limits')
    .dropTableIfExists('support_agent_assignments')
    .dropTableIfExists('support_messages')
    .dropTableIfExists('support_tickets');
};