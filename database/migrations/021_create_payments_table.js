/**
 * Create payments table for MoneroPay integration
 * Tracks XMR payments for appointment bookings
 */

exports.up = function(knex) {
  return knex.schema.createTable('payments', table => {
    table.increments('id').primary();

    // Link to appointment
    table.integer('appointment_id').unsigned().references('id').inTable('appointments').onDelete('SET NULL');
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');

    // MoneroPay fields
    table.string('moneropay_address', 106).unique(); // Monero address (95 chars + integrated address)
    table.string('payment_id', 64); // Optional payment ID

    // Amount info
    table.decimal('amount_cad', 10, 2).notNullable(); // Original CAD amount
    table.string('amount_xmr', 24); // XMR amount in atomic units (piconero)
    table.decimal('exchange_rate', 18, 8); // XMR/CAD rate at time of request

    // Payment status
    table.enum('status', ['pending', 'partial', 'confirmed', 'expired', 'refunded']).defaultTo('pending');
    table.string('amount_received', 24); // Amount received in atomic units
    table.integer('confirmations').defaultTo(0);

    // Timestamps
    table.timestamp('expires_at').notNullable(); // 30 min expiry
    table.timestamp('confirmed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Metadata
    table.json('metadata'); // Store additional MoneroPay response data

    // Indexes
    table.index('appointment_id');
    table.index('user_id');
    table.index('status');
    table.index('expires_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payments');
};
