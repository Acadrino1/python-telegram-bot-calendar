/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('booking_idempotency', (table) => {
    table.increments('id').primary();
    table.string('idempotency_key').notNullable().unique();
    table.integer('appointment_id').unsigned();
    table.text('response_body'); // Cached response
    table.integer('status_code'); // HTTP status code
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable(); // Auto-expire after 24h

    table.index('idempotency_key');
    table.index('expires_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('booking_idempotency');
};
