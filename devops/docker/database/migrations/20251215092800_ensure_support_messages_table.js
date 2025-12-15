/**
 * Ensure support_messages table exists
 * Migration to fix missing support_messages table
 */

exports.up = function(knex) {
  return knex.schema.hasTable('support_messages').then(function(exists) {
    if (!exists) {
      return knex.schema.createTable('support_messages', function(table) {
        table.increments('id').primary();
        table.string('ticket_id', 32).notNullable();
        table.foreign('ticket_id').references('ticket_id').inTable('support_tickets').onDelete('CASCADE');
        table.enum('sender_type', ['user', 'agent', 'system']).notNullable();
        table.integer('sender_id').unsigned().nullable();
        table.foreign('sender_id').references('id').inTable('users').onDelete('SET NULL');
        table.text('message').notNullable();
        table.json('metadata').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index('ticket_id');
        table.index(['ticket_id', 'created_at']);
      });
    }
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('support_messages');
};
