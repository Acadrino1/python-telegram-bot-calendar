exports.up = function(knex) {
  return knex.schema.table('appointments', (table) => {
    // Add confirmation tracking fields
    table.boolean('confirmation_required').defaultTo(false);
    table.boolean('confirmed').defaultTo(false);
    table.datetime('confirmation_sent_at').nullable();
    table.datetime('confirmed_at').nullable();
    table.string('confirmation_token', 100).nullable();
    
    // Add index for confirmation queries
    table.index(['confirmation_required', 'confirmed']);
    table.index('confirmation_token');
  });
};

exports.down = function(knex) {
  return knex.schema.table('appointments', (table) => {
    // Remove indexes
    table.dropIndex(['confirmation_required', 'confirmed']);
    table.dropIndex('confirmation_token');
    
    // Remove columns
    table.dropColumn('confirmation_required');
    table.dropColumn('confirmed');
    table.dropColumn('confirmation_sent_at');
    table.dropColumn('confirmed_at');
    table.dropColumn('confirmation_token');
  });
};