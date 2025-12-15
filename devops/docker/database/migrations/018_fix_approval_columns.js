/**
 * Migration: Fix approval columns for Telegram ID storage
 * - Change approved_by from INT to VARCHAR(64) for Telegram IDs
 * - Add rejected_by and rejected_at columns
 */

exports.up = function(knex) {
  return knex.schema.table('users', function(table) {
    // Drop the foreign key constraint and column first
    table.dropForeign('approved_by');
    table.dropColumn('approved_by');
  }).then(() => {
    return knex.schema.table('users', function(table) {
      // Re-add approved_by as VARCHAR for Telegram IDs
      table.string('approved_by', 64).nullable();

      // Add rejected_by and rejected_at columns
      table.string('rejected_by', 64).nullable();
      table.datetime('rejected_at').nullable();
    });
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('approved_by');
    table.dropColumn('rejected_by');
    table.dropColumn('rejected_at');
  }).then(() => {
    return knex.schema.table('users', function(table) {
      // Restore original column (will lose data)
      table.integer('approved_by').unsigned().nullable().references('id').inTable('users');
    });
  });
};
