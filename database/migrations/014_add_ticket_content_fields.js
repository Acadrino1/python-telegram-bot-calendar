/**
 * Add missing subject and message fields to support_tickets table
 * 
 * These fields are required for the /ticket command to work properly
 */

exports.up = function(knex) {
  return knex.schema.alterTable('support_tickets', function(table) {
    // Add subject and message columns if they don't exist
    table.string('subject', 255).nullable();
    table.text('message').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('support_tickets', function(table) {
    table.dropColumn('subject');
    table.dropColumn('message');
  });
};