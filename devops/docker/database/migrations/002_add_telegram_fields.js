exports.up = async function(knex) {
  const hasColumns = await knex.schema.hasColumn('users', 'telegram_id');
  
  if (!hasColumns) {
    return knex.schema.table('users', function(table) {
      table.string('telegram_id').unique().index();
      table.json('telegram_data');
    });
  }
  
  // Columns already exist, skip this migration
  return Promise.resolve();
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('telegram_id');
    table.dropColumn('telegram_data');
  });
};