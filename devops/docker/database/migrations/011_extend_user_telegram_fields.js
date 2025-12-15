exports.up = function(knex) {
  return knex.schema.table('users', function(table) {
    // Enhanced Telegram fields
    table.string('telegram_username').nullable();
    table.string('telegram_first_name').nullable();
    table.string('telegram_last_name').nullable();
    table.string('telegram_language_code').nullable();
    
    // User approval system
    table.enum('approval_status', ['pending', 'approved', 'denied']).defaultTo('pending');
    table.integer('approved_by').unsigned().nullable().references('id').inTable('users');
    table.datetime('approved_at').nullable();
    
    // Referral system
    table.string('referral_code').unique().nullable();
    table.integer('referred_by').unsigned().nullable().references('id').inTable('users');
    table.integer('referral_count').defaultTo(0);
    
    // Activity tracking
    table.datetime('last_login_at').nullable();
    table.datetime('last_activity_at').nullable();
    table.integer('bot_interaction_count').defaultTo(0);
    
    // User verification
    table.boolean('is_verified').defaultTo(false);
    table.string('verification_token').nullable();
    
    // Registration source
    table.enum('registration_source', ['web', 'telegram', 'referral']).defaultTo('web');
    
    // Indexes for performance
    table.index(['approval_status', 'created_at']);
    table.index(['referral_code']);
    table.index(['telegram_username']);
    table.index(['last_activity_at']);
    table.index(['registration_source', 'created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('telegram_username');
    table.dropColumn('telegram_first_name');
    table.dropColumn('telegram_last_name');
    table.dropColumn('telegram_language_code');
    table.dropColumn('approval_status');
    table.dropColumn('approved_by');
    table.dropColumn('approved_at');
    table.dropColumn('referral_code');
    table.dropColumn('referred_by');
    table.dropColumn('referral_count');
    table.dropColumn('last_login_at');
    table.dropColumn('last_activity_at');
    table.dropColumn('bot_interaction_count');
    table.dropColumn('is_verified');
    table.dropColumn('verification_token');
    table.dropColumn('registration_source');
  });
};