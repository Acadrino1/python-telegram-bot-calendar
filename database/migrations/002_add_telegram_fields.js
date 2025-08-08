exports.up = function(knex) {
  return knex.schema.table('users', function(table) {
    table.string('telegram_id').unique().index();
    table.json('telegram_data');
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('telegram_id');
    table.dropColumn('telegram_data');
  });
};