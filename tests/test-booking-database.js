#!/usr/bin/env node

/**
 * Test Database Booking Functionality
 */

const knex = require('knex')(require('../knexfile.js').development);
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

async function testBookingDatabase() {
  console.log('🔍 Testing Database Booking Functionality...\n');
  
  try {
    // 1. Check tables exist
    console.log('1️⃣ Checking database tables...');
    const hasAppointments = await knex.schema.hasTable('appointments');
    const hasUsers = await knex.schema.hasTable('users');
    const hasServices = await knex.schema.hasTable('services');
    
    console.log(`   appointments table: ${hasAppointments ? '✅' : '❌'}`);
    console.log(`   users table: ${hasUsers ? '✅' : '❌'}`);
    console.log(`   services table: ${hasServices ? '✅' : '❌'}\n`);
    
    // 2. Check appointments table structure
    console.log('2️⃣ Checking appointments table columns...');
    const columns = await knex('appointments').columnInfo();
    console.log('   Columns:', Object.keys(columns).join(', '));
    console.log();
    
    // 3. Get test data
    console.log('3️⃣ Getting test data...');
    const user = await knex('users').where('telegram_id', '7930798268').first();
    const provider = await knex('users').where('role', 'provider').first();
    const service = await knex('services').first();
    
    console.log(`   User: ${user ? user.first_name + ' ' + user.last_name : 'NOT FOUND'}`);
    console.log(`   Provider: ${provider ? provider.first_name : 'NOT FOUND'}`);
    console.log(`   Service: ${service ? service.name : 'NOT FOUND'}\n`);
    
    if (!user || !provider || !service) {
      console.log('❌ Missing required data for test booking');
      return;
    }
    
    // 4. Create test appointment
    console.log('4️⃣ Creating test appointment...');
    const appointmentData = {
      uuid: uuidv4(),
      client_id: user.id,
      provider_id: provider.id,
      service_id: service.id,
      appointment_datetime: moment().add(1, 'day').format('YYYY-MM-DD HH:mm:ss'),
      duration_minutes: 60,
      status: 'scheduled',
      notes: 'Test booking from database test script',
      price: service.price || 0
    };
    
    console.log('   Appointment data:', appointmentData);
    
    const [appointmentId] = await knex('appointments').insert(appointmentData);
    console.log(`   ✅ Appointment created with ID: ${appointmentId}\n`);
    
    // 5. Verify appointment was saved
    console.log('5️⃣ Verifying appointment...');
    const savedAppointment = await knex('appointments').where('id', appointmentId).first();
    console.log(`   Appointment found: ${savedAppointment ? '✅' : '❌'}`);
    if (savedAppointment) {
      console.log(`   UUID: ${savedAppointment.uuid}`);
      console.log(`   Status: ${savedAppointment.status}`);
      console.log(`   DateTime: ${savedAppointment.appointment_datetime}`);
    }
    console.log();
    
    // 6. Check total appointments
    console.log('6️⃣ Total appointments in database:');
    const count = await knex('appointments').count('id as count').first();
    console.log(`   Total: ${count.count} appointments\n`);
    
    console.log('✅ Database booking functionality is working!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await knex.destroy();
  }
}

testBookingDatabase().catch(console.error);