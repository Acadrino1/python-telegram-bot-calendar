exports.up = function(knex) {
  return knex.schema
    // Users table (clients and providers)
    .createTable('users', function(table) {
      table.increments('id').primary();
      table.string('email').unique().notNullable();
      table.string('password_hash').notNullable();
      table.string('first_name').notNullable();
      table.string('last_name').notNullable();
      table.string('phone').nullable();
      table.enum('role', ['client', 'provider', 'admin']).defaultTo('client');
      table.string('timezone').defaultTo('America/New_York');
      table.boolean('email_notifications').defaultTo(true);
      table.boolean('sms_notifications').defaultTo(false);
      table.boolean('is_active').defaultTo(true);
      table.json('preferences').nullable(); // Store user preferences as JSON
      table.timestamps(true, true);
      table.index(['email', 'role']);
    })
    
    // Services offered by providers
    .createTable('services', function(table) {
      table.increments('id').primary();
      table.integer('provider_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('description').nullable();
      table.integer('duration_minutes').notNullable(); // Duration in minutes
      table.decimal('price', 10, 2).nullable();
      table.string('color_code').nullable(); // For calendar display
      table.boolean('is_active').defaultTo(true);
      table.json('booking_rules').nullable(); // Advance booking, cancellation rules etc.
      table.timestamps(true, true);
      table.index(['provider_id', 'is_active']);
    })
    
    // Provider availability schedules
    .createTable('availability_schedules', function(table) {
      table.increments('id').primary();
      table.integer('provider_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.enum('day_of_week', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
      table.time('start_time').notNullable();
      table.time('end_time').notNullable();
      table.boolean('is_active').defaultTo(true);
      table.date('effective_from').nullable();
      table.date('effective_until').nullable();
      table.timestamps(true, true);
      table.index(['provider_id', 'day_of_week', 'is_active']);
    })
    
    // Special availability (overrides, holidays, etc.)
    .createTable('availability_exceptions', function(table) {
      table.increments('id').primary();
      table.integer('provider_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.date('date').notNullable();
      table.time('start_time').nullable(); // null means unavailable all day
      table.time('end_time').nullable();
      table.enum('type', ['unavailable', 'special_hours', 'holiday']).notNullable();
      table.text('reason').nullable();
      table.timestamps(true, true);
      table.index(['provider_id', 'date', 'type']);
    })
    
    // Main appointments table
    .createTable('appointments', function(table) {
      table.increments('id').primary();
      table.string('uuid').unique().notNullable(); // Public facing ID
      table.integer('client_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('provider_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('service_id').unsigned().references('id').inTable('services').onDelete('RESTRICT');
      table.datetime('appointment_datetime').notNullable();
      table.integer('duration_minutes').notNullable();
      table.enum('status', ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).defaultTo('scheduled');
      table.text('notes').nullable(); // Client notes
      table.text('provider_notes').nullable(); // Internal notes
      table.decimal('price', 10, 2).nullable();
      table.string('cancellation_reason').nullable();
      table.datetime('cancelled_at').nullable();
      table.integer('cancelled_by').unsigned().nullable().references('id').inTable('users');
      table.json('reminder_sent').nullable(); // Track which reminders were sent
      table.timestamps(true, true);
      table.index(['client_id', 'status']);
      table.index(['provider_id', 'appointment_datetime', 'status']);
      table.index(['appointment_datetime', 'status']);
      table.index(['uuid']);
    })
    
    // Waitlist for fully booked slots
    .createTable('waitlist', function(table) {
      table.increments('id').primary();
      table.integer('client_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('provider_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('service_id').unsigned().references('id').inTable('services').onDelete('CASCADE');
      table.date('preferred_date').notNullable();
      table.time('preferred_start_time').nullable();
      table.time('preferred_end_time').nullable();
      table.enum('status', ['active', 'notified', 'expired', 'fulfilled']).defaultTo('active');
      table.text('notes').nullable();
      table.datetime('expires_at').notNullable(); // When this waitlist entry expires
      table.datetime('notified_at').nullable(); // When client was notified of availability
      table.timestamps(true, true);
      table.index(['provider_id', 'preferred_date', 'status']);
      table.index(['client_id', 'status']);
    })
    
    // Appointment history for tracking changes
    .createTable('appointment_history', function(table) {
      table.increments('id').primary();
      table.integer('appointment_id').unsigned().references('id').inTable('appointments').onDelete('CASCADE');
      table.string('action').notNullable(); // created, updated, cancelled, completed, etc.
      table.json('changes').nullable(); // JSON of what changed
      table.integer('changed_by').unsigned().nullable().references('id').inTable('users');
      table.text('notes').nullable();
      table.timestamps(true, true);
      table.index(['appointment_id', 'created_at']);
    })
    
    // Notification templates
    .createTable('notification_templates', function(table) {
      table.increments('id').primary();
      table.string('name').unique().notNullable(); // e.g., 'appointment_confirmation', 'reminder_24h'
      table.enum('type', ['email', 'sms']).notNullable();
      table.string('subject').nullable(); // For emails
      table.text('content').notNullable(); // Template with placeholders
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      table.index(['name', 'type', 'is_active']);
    })
    
    // Notification queue/log
    .createTable('notifications', function(table) {
      table.increments('id').primary();
      table.integer('appointment_id').unsigned().nullable().references('id').inTable('appointments').onDelete('CASCADE');
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.enum('type', ['email', 'sms']).notNullable();
      table.string('template_name').notNullable();
      table.string('recipient').notNullable(); // Email or phone number
      table.string('subject').nullable();
      table.text('content').notNullable();
      table.enum('status', ['pending', 'sent', 'failed', 'cancelled']).defaultTo('pending');
      table.datetime('scheduled_for').notNullable();
      table.datetime('sent_at').nullable();
      table.text('error_message').nullable();
      table.integer('retry_count').defaultTo(0);
      table.timestamps(true, true);
      table.index(['status', 'scheduled_for']);
      table.index(['appointment_id', 'type']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('notifications')
    .dropTableIfExists('notification_templates')
    .dropTableIfExists('appointment_history')
    .dropTableIfExists('waitlist')
    .dropTableIfExists('appointments')
    .dropTableIfExists('availability_exceptions')
    .dropTableIfExists('availability_schedules')
    .dropTableIfExists('services')
    .dropTableIfExists('users');
};