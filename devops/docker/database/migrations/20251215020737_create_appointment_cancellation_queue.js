/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('appointment_cancellation_queue', (table) => {
    table.increments('id').primary();
    table.string('appointment_uuid').notNullable().unique();
    table.timestamp('cancel_at').notNullable(); // When to cancel
    table.string('status').defaultTo('pending'); // pending, cancelled, confirmed
    table.timestamps(true, true);

    table.index('cancel_at');
    table.index('status');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('appointment_cancellation_queue');
};
