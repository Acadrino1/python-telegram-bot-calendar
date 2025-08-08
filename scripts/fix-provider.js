#!/usr/bin/env node

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

const User = require('../src/models/User');

async function fixProvider() {
  try {
    console.log('🔧 Fixing provider issue...\n');
    
    // Check if provider with ID=1 exists
    const provider1 = await User.query().where('id', 1).first();
    
    if (provider1) {
      if (provider1.role !== 'provider') {
        console.log(`⚠️ User with ID=1 exists but is a ${provider1.role}, not a provider`);
        console.log('Creating new provider with next available ID...');
      } else {
        console.log('✅ Provider with ID=1 already exists');
        await knex.destroy();
        return;
      }
    }
    
    // Get the first available provider
    const existingProvider = await User.query().where('role', 'provider').first();
    
    if (existingProvider) {
      console.log(`Found existing provider with ID=${existingProvider.id}`);
      console.log(`Provider: ${existingProvider.first_name} ${existingProvider.last_name}`);
      
      // Update the provider to have ID=1 if possible
      // This is tricky with foreign keys, so let's just note the actual ID
      console.log(`\n📝 Note: The bot needs to be updated to use provider_id=${existingProvider.id}`);
      console.log('Or we can add a new provider with ID=1...');
    }
    
    // Try to insert a provider with ID=1
    console.log('\n📝 Adding provider with ID=1...');
    
    try {
      const newProvider = await knex('users').insert({
        id: 1,
        email: 'default.provider@clinic.com',
        password_hash: '$2b$10$YourHashedPasswordHere',
        first_name: 'Default',
        last_name: 'Provider',
        phone: '555-0100',
        role: 'provider',
        timezone: 'America/New_York',
        is_active: true,
        preferences: JSON.stringify({
          notificationEmail: true,
          notificationSMS: false,
          notificationTelegram: false
        })
      });
      
      console.log('✅ Successfully added provider with ID=1');
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log('❌ Cannot add provider with ID=1 - ID already in use');
        console.log('Will update bot to use existing provider ID');
      } else {
        throw error;
      }
    }
    
    // Create provider_services table if it doesn't exist
    console.log('\n📝 Creating provider_services table if missing...');
    
    const tableExists = await knex.schema.hasTable('provider_services');
    if (!tableExists) {
      await knex.schema.createTable('provider_services', table => {
        table.increments('id').primary();
        table.integer('provider_id').unsigned().notNullable();
        table.integer('service_id').unsigned().notNullable();
        table.boolean('is_available').defaultTo(true);
        table.decimal('custom_price', 10, 2).nullable();
        table.integer('custom_duration').nullable();
        table.timestamps(true, true);
        
        table.foreign('provider_id').references('users.id').onDelete('CASCADE');
        table.foreign('service_id').references('services.id').onDelete('CASCADE');
        table.unique(['provider_id', 'service_id']);
      });
      
      console.log('✅ Created provider_services table');
    } else {
      console.log('✅ provider_services table already exists');
    }
    
    // Link providers to services
    console.log('\n🔗 Linking providers to services...');
    
    const providers = await User.query().where('role', 'provider');
    const services = await knex('services').select('id');
    
    for (const provider of providers) {
      for (const service of services) {
        const existing = await knex('provider_services')
          .where('provider_id', provider.id)
          .where('service_id', service.id)
          .first();
        
        if (!existing) {
          await knex('provider_services').insert({
            provider_id: provider.id,
            service_id: service.id,
            is_available: true
          });
          console.log(`   Linked provider ${provider.id} to service ${service.id}`);
        }
      }
    }
    
    console.log('\n✅ Setup complete!');
    
    // Final check
    const finalProviders = await User.query().where('role', 'provider');
    console.log('\nCurrent providers:');
    finalProviders.forEach(p => {
      console.log(`   ID ${p.id}: ${p.first_name} ${p.last_name}`);
    });
    
    // Recommend bot update if needed
    const provider1Final = finalProviders.find(p => p.id === 1);
    if (!provider1Final && finalProviders.length > 0) {
      console.log(`\n⚠️ IMPORTANT: Update bot to use provider_id=${finalProviders[0].id} instead of 1`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await knex.destroy();
  }
}

fixProvider();