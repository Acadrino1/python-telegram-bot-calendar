/**
 * Migration: Add pending_approval and rejected status to appointments
 *
 * This migration adds two new appointment statuses:
 * - pending_approval: Appointment awaiting admin approval
 * - rejected: Appointment rejected by admin
 *
 * Full list of valid statuses after this migration:
 * - pending_approval (new - default)
 * - scheduled
 * - confirmed
 * - in_progress
 * - completed
 * - cancelled
 * - rejected (new)
 * - no_show
 */

exports.up = async function(knex) {
  const client = knex.client.config.client;

  if (client === 'mysql2' || client === 'mysql') {
    // MySQL requires ALTER TABLE to modify ENUM
    await knex.raw(`
      ALTER TABLE appointments
      MODIFY COLUMN status ENUM('pending_approval', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected') DEFAULT 'pending_approval'
    `);
    console.log('✅ Migration 016: MySQL ENUM updated with pending_approval and rejected');
  } else {
    // SQLite doesn't enforce enum constraints - values are stored as TEXT
    console.log('✅ Migration 016: SQLite - no ENUM modification needed');
  }

  // Update any NULL status values to 'pending_approval'
  await knex.raw(`
    UPDATE appointments
    SET status = 'pending_approval'
    WHERE status IS NULL
  `);

  console.log('✅ Migration 016: Added pending_approval and rejected status support');
};

exports.down = function(knex) {
  // Convert any pending_approval or rejected back to cancelled
  return knex.raw(`
    UPDATE appointments
    SET status = 'cancelled'
    WHERE status IN ('pending_approval', 'rejected');
  `).then(() => {
    console.log('⬇️ Migration 016: Reverted pending_approval and rejected statuses');
    return Promise.resolve();
  });
};
