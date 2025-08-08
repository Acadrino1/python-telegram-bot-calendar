exports.up = function(knex) {
  return knex.schema.table('appointments', (table) => {
    // Customer personal information
    table.string('customer_first_name', 100);
    table.string('customer_middle_name', 100).nullable();
    table.string('customer_last_name', 100);
    table.date('customer_dob');
    table.string('billing_address', 500);
    table.string('customer_email', 255);
    
    // Driver's license information (optional)
    table.string('drivers_license_number', 100).nullable();
    table.date('dl_issued_date').nullable();
    table.date('dl_expiry_date').nullable();
    
    // Add index for faster lookups
    table.index('customer_email');
    table.index('customer_last_name');
  });
};

exports.down = function(knex) {
  return knex.schema.table('appointments', (table) => {
    // Remove indexes
    table.dropIndex('customer_email');
    table.dropIndex('customer_last_name');
    
    // Remove columns
    table.dropColumn('customer_first_name');
    table.dropColumn('customer_middle_name');
    table.dropColumn('customer_last_name');
    table.dropColumn('customer_dob');
    table.dropColumn('billing_address');
    table.dropColumn('customer_email');
    table.dropColumn('drivers_license_number');
    table.dropColumn('dl_issued_date');
    table.dropColumn('dl_expiry_date');
  });
};