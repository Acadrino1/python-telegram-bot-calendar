#!/usr/bin/env node
/**
 * Initialize database with tables for Lodge Mobile
 */

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');

async function initDatabase() {
  console.log('🚀 Initializing Lodge Mobile database...');
  
  const knex = Knex({
    client: 'sqlite3',
    connection: {
      filename: './database/test_lodge_scheduler.sqlite3'
    },
    useNullAsDefault: true
  });

  Model.knex(knex);

  try {
    // Create users table
    await knex.schema.createTableIfNotExists('users', table => {
      table.increments('id').primary();
      table.string('telegram_id').unique();
      table.string('first_name');
      table.string('last_name');
      table.string('username');
      table.string('phone');
      table.string('email');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });
    console.log('✅ Created users table');

    // Create services table
    await knex.schema.createTableIfNotExists('services', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('category');
      table.integer('duration').defaultTo(30);
      table.decimal('price', 10, 2).defaultTo(0);
      table.text('description');
      table.boolean('active').defaultTo(true);
      table.boolean('requires_deposit').defaultTo(false);
      table.decimal('deposit_amount', 10, 2).defaultTo(0);
      table.timestamps(true, true);
    });
    console.log('✅ Created services table');

    // Create appointments table
    await knex.schema.createTableIfNotExists('appointments', table => {
      table.string('uuid').primary();
      table.integer('client_id').references('id').inTable('users');
      table.integer('service_id').references('id').inTable('services');
      table.integer('provider_id');
      table.datetime('appointment_datetime');
      table.string('status').defaultTo('scheduled');
      table.text('notes');
      table.decimal('price', 10, 2);
      table.boolean('deposit_paid').defaultTo(false);
      table.datetime('cancelled_at');
      table.integer('cancelled_by');
      table.text('cancellation_reason');
      table.timestamps(true, true);
    });
    console.log('✅ Created appointments table');

    // Create support_tickets table
    await knex.schema.createTableIfNotExists('support_tickets', table => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users');
      table.string('ticket_id').unique();
      table.string('status').defaultTo('open');
      table.string('priority').defaultTo('medium');
      table.text('subject');
      table.text('description');
      table.integer('assigned_to');
      table.timestamps(true, true);
    });
    console.log('✅ Created support_tickets table');

    // Add Lodge Mobile services
    const lodgeMobileServices = [
      {
        name: 'Lodge Mobile: New Registration',
        category: 'Lodge Mobile Activations',
        duration: 45,
        price: 0,
        description: 'Complete new customer registration with Lodge Mobile',
        active: true
      },
      {
        name: 'Lodge Mobile: SIM Card Activation',
        category: 'Lodge Mobile Activations',
        duration: 30,
        price: 25,
        description: 'Activate your Lodge Mobile SIM card',
        active: true
      },
      {
        name: 'Lodge Mobile: Technical Support',
        category: 'Lodge Mobile Activations',
        duration: 30,
        price: 0,
        description: 'Get help with Lodge Mobile technical issues',
        active: true
      },
      {
        name: 'Lodge Mobile: Upgrade Device',
        category: 'Lodge Mobile Activations',
        duration: 45,
        price: 0,
        description: 'Upgrade to a new device with Lodge Mobile',
        active: true
      }
    ];

    for (const service of lodgeMobileServices) {
      const existing = await knex('services').where('name', service.name).first();
      if (!existing) {
        await knex('services').insert(service);
      }
    }
    console.log('✅ Added Lodge Mobile services');

    console.log('\n🎉 Database initialization complete!');
    console.log('Lodge Mobile bot is ready to use.');
    
    await knex.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await knex.destroy();
    process.exit(1);
  }
}

initDatabase();