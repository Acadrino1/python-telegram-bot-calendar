#!/usr/bin/env node

/**
 * Quick database setup for Lodge Mobile bot
 * Creates essential tables in SQLite
 */

const path = require('path');
const Knex = require('knex');

const dbPath = path.join(__dirname, '../database/lodge_scheduler.sqlite3');
const knex = Knex({
  client: 'sqlite3',
  connection: { filename: dbPath },
  useNullAsDefault: true
});

async function setupDatabase() {
  console.log('🔧 Setting up Lodge Mobile database...');
  
  try {
    // Create users table if it doesn't exist
    const hasUsers = await knex.schema.hasTable('users');
    if (!hasUsers) {
      await knex.schema.createTable('users', function(table) {
        table.increments('id').primary();
        table.string('email').unique().notNullable();
        table.string('password_hash');
        table.string('first_name').notNullable();
        table.string('last_name').notNullable();
        table.string('phone').nullable();
        table.string('role').defaultTo('client');
        table.string('timezone').defaultTo('America/New_York');
        table.boolean('email_notifications').defaultTo(true);
        table.boolean('sms_notifications').defaultTo(false);
        table.boolean('is_active').defaultTo(true);
        table.text('preferences').nullable();
        table.string('telegram_id').nullable();
        table.text('telegram_data').nullable();
        table.timestamps(true, true);
      });
      console.log('✅ Users table created');
    } else {
      console.log('✅ Users table already exists');
    }
    
    // Create services table
    const hasServices = await knex.schema.hasTable('services');
    if (!hasServices) {
      await knex.schema.createTable('services', function(table) {
        table.increments('id').primary();
        table.integer('provider_id').unsigned().nullable();
        table.string('name').notNullable();
        table.text('description').nullable();
        table.integer('duration_minutes').notNullable();
        table.decimal('price', 10, 2).nullable();
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
      });
      
      // Insert Lodge Mobile services
      await knex('services').insert([
        { name: 'New Customer Registration', description: 'Complete setup for new Lodge Mobile customers', duration_minutes: 30, price: 0, is_active: true },
        { name: 'SIM Card Activation', description: 'Activate your new Lodge Mobile SIM card', duration_minutes: 15, price: 0, is_active: true },
        { name: 'Technical Support', description: 'Get help with your Lodge Mobile service', duration_minutes: 20, price: 0, is_active: true },
        { name: 'Device Upgrade Consultation', description: 'Explore new device options and upgrade plans', duration_minutes: 45, price: 0, is_active: true }
      ]);
      console.log('✅ Services table created with Lodge Mobile services');
    } else {
      console.log('✅ Services table already exists');
    }
    
    // Create appointments table
    const hasAppointments = await knex.schema.hasTable('appointments');
    if (!hasAppointments) {
      await knex.schema.createTable('appointments', function(table) {
        table.increments('id').primary();
        table.string('uuid').unique().notNullable();
        table.integer('client_id').unsigned();
        table.integer('provider_id').unsigned().nullable();
        table.integer('service_id').unsigned();
        table.datetime('appointment_datetime').notNullable();
        table.integer('duration_minutes').notNullable();
        table.string('status').defaultTo('scheduled');
        table.text('notes').nullable();
        table.timestamps(true, true);
      });
      console.log('✅ Appointments table created');
    } else {
      console.log('✅ Appointments table already exists');
    }
    
    console.log('🎉 Database setup complete!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  } finally {
    await knex.destroy();
  }
}

if (require.main === module) {
  setupDatabase().catch(console.error);
}

module.exports = setupDatabase;