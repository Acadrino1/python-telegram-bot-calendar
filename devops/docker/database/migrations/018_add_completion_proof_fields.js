/**
 * Add completion proof fields to appointments table
 * - user_confirmed_completion: boolean - user confirmed appointment was completed
 * - user_completion_response: 'yes' | 'no' | null - user's response
 * - completion_proof_file_id: string - Telegram file_id for photo proof
 * - completion_proof_uploaded_at: datetime - when proof was uploaded
 * - awaiting_proof: boolean - admin needs to upload proof
 */

exports.up = function(knex) {
  return knex.schema.table('appointments', (table) => {
    table.boolean('user_confirmed_completion').defaultTo(false);
    table.string('user_completion_response', 10).nullable(); // 'yes', 'no', or null
    table.string('completion_proof_file_id', 255).nullable();
    table.datetime('completion_proof_uploaded_at').nullable();
    table.boolean('awaiting_proof').defaultTo(false);
  });
};

exports.down = function(knex) {
  return knex.schema.table('appointments', (table) => {
    table.dropColumn('user_confirmed_completion');
    table.dropColumn('user_completion_response');
    table.dropColumn('completion_proof_file_id');
    table.dropColumn('completion_proof_uploaded_at');
    table.dropColumn('awaiting_proof');
  });
};
