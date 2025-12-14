/**
 * Default database seeder for Lodge Scheduler
 * Creates essential records needed for the bot to function
 */

exports.seed = async function(knex) {
  // Check if provider exists
  const existingProvider = await knex('users')
    .where('role', 'provider')
    .first();

  if (!existingProvider) {
    console.log('Creating default provider...');
    await knex('users').insert({
      telegram_id: process.env.ADMIN_TELEGRAM_ID || '0',
      first_name: 'Lodge',
      last_name: 'Provider',
      email: 'provider@lodge.local',
      password_hash: 'no_password',
      role: 'provider',
      is_active: true,
      timezone: 'America/New_York',
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log('✅ Default provider created');
  } else {
    console.log('Provider already exists, skipping...');
  }

  // Get provider ID for service
  const provider = await knex('users')
    .where('role', 'provider')
    .first();

  // Check if service exists
  const existingService = await knex('services').first();

  if (!existingService) {
    console.log('Creating default service...');
    await knex('services').insert({
      provider_id: provider.id,
      name: 'Lodge Scheduler Service',
      description: 'Standard appointment booking service',
      duration_minutes: 90,
      price: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log('✅ Default service created');
  } else {
    console.log('Service already exists, skipping...');
  }
};
