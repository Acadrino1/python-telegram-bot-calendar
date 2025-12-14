#!/usr/bin/env node

/**
 * Apply Critical Database Schema Fixes
 * 
 * This script applies the most critical fixes needed to make bookings work
 */

const knex = require('knex');
const config = require('../knexfile');

const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

async function applyCriticalFixes() {
  console.log('🔧 Applying critical database schema fixes...');
  
  try {
    // Start transaction
    await db.transaction(async (trx) => {
      console.log('1. Recreating appointments table with proper structure...');
      
      // First, backup existing data
      const existingAppointments = await trx('appointments').select('*');
      console.log(`   Found ${existingAppointments.length} existing appointments to preserve`);
      
      // Drop old appointments table
      await trx.schema.dropTableIfExists('appointments_old');
      await trx.schema.renameTable('appointments', 'appointments_old');
      
      // Create new appointments table with proper structure
      await trx.schema.createTable('appointments', function(table) {
        table.increments('id').primary(); // Auto-increment primary key
        table.string('uuid').unique().notNullable();
        table.integer('client_id').notNullable().references('id').inTable('users');
        table.integer('provider_id').notNullable().references('id').inTable('users');
        table.integer('service_id').notNullable().references('id').inTable('services');
        table.datetime('appointment_datetime').notNullable();
        table.integer('duration_minutes').notNullable().defaultTo(60);
        table.string('status').defaultTo('scheduled');
        table.text('notes');
        table.text('provider_notes'); // Added missing field
        table.decimal('price', 10, 2);
        table.text('cancellation_reason');
        table.datetime('cancelled_at');
        table.integer('cancelled_by').references('id').inTable('users');
        table.text('reminder_sent').defaultTo('{}'); // JSON as TEXT for SQLite
        table.boolean('deposit_paid').defaultTo(false);
        table.timestamps(true, true);
        
        // Indexes
        table.index(['client_id', 'status']);
        table.index(['provider_id', 'appointment_datetime', 'status']);
        table.index(['appointment_datetime', 'status']);
        table.index('uuid');
      });
      
      // Migrate existing data
      if (existingAppointments.length > 0) {
        console.log('   Migrating existing appointment data...');
        
        for (const appt of existingAppointments) {
          await trx('appointments').insert({
            uuid: appt.uuid,
            client_id: appt.client_id,
            provider_id: appt.provider_id,
            service_id: appt.service_id,
            appointment_datetime: appt.appointment_datetime,
            duration_minutes: appt.duration_minutes || 60,
            status: appt.status || 'scheduled',
            notes: appt.notes,
            price: appt.price,
            cancellation_reason: appt.cancellation_reason,
            cancelled_at: appt.cancelled_at,
            cancelled_by: appt.cancelled_by,
            reminder_sent: appt.reminder_sent || '{}',
            deposit_paid: appt.deposit_paid || false,
            created_at: appt.created_at || new Date(),
            updated_at: appt.updated_at || new Date()
          });
        }
        
        console.log(`   ✓ Migrated ${existingAppointments.length} appointments`);
      }
      
      console.log('2. Fixing services table...');
      
      // Add missing columns to services table
      const servicesColumns = await trx.raw("PRAGMA table_info(services)");
      const servicesColumnMap = {};
      servicesColumns.forEach(col => {
        servicesColumnMap[col.name] = col;
      });
      
      // Add provider_id if missing
      if (!servicesColumnMap['provider_id']) {
        await trx.schema.table('services', (table) => {
          table.integer('provider_id').references('id').inTable('users');
        });
        console.log('   ✓ Added provider_id column to services');
      }
      
      // Add duration_minutes if missing
      if (!servicesColumnMap['duration_minutes']) {
        await trx.schema.table('services', (table) => {
          table.integer('duration_minutes');
        });
        // Copy from duration column if it exists
        if (servicesColumnMap['duration']) {
          await trx('services').update({
            duration_minutes: trx.ref('duration')
          });
        } else {
          await trx('services').update({ duration_minutes: 60 });
        }
        console.log('   ✓ Added duration_minutes column to services');
      }
      
      // Add is_active if missing
      if (!servicesColumnMap['is_active']) {
        await trx.schema.table('services', (table) => {
          table.boolean('is_active').defaultTo(true);
        });
        // Copy from active column if it exists
        if (servicesColumnMap['active']) {
          await trx('services').update({
            is_active: trx.ref('active')
          });
        } else {
          await trx('services').update({ is_active: true });
        }
        console.log('   ✓ Added is_active column to services');
      }
      
      // Add color_code if missing
      if (!servicesColumnMap['color_code']) {
        await trx.schema.table('services', (table) => {
          table.string('color_code');
        });
        await trx('services').update({ color_code: '#2196F3' });
        console.log('   ✓ Added color_code column to services');
      }
      
      // Add booking_rules if missing
      if (!servicesColumnMap['booking_rules']) {
        await trx.schema.table('services', (table) => {
          table.text('booking_rules');
        });
        await trx('services').update({
          booking_rules: JSON.stringify({
            advance_booking_days: 30,
            cancellation_hours: 24,
            same_day_booking: false,
            max_advance_days: 90,
            require_confirmation: false,
            allow_waitlist: true
          })
        });
        console.log('   ✓ Added booking_rules column to services');
      }
      
      console.log('3. Fixing users table role values...');
      
      // Fix role values from 'customer' to 'client'
      const updatedRoles = await trx('users')
        .where('role', 'customer')
        .update({ role: 'client' });
      
      if (updatedRoles > 0) {
        console.log(`   ✓ Updated ${updatedRoles} user roles from 'customer' to 'client'`);
      }
      
      // Add missing user columns if needed
      const usersColumns = await trx.raw("PRAGMA table_info(users)");
      const usersColumnMap = {};
      usersColumns.forEach(col => {
        usersColumnMap[col.name] = col;
      });
      
      if (!usersColumnMap['preferences']) {
        await trx.schema.table('users', (table) => {
          table.text('preferences');
        });
        console.log('   ✓ Added preferences column to users');
      }
      
      console.log('4. Creating default service if none exist...');
      
      const serviceCount = await trx('services').count('* as count').first();
      if (serviceCount.count === 0) {
        await trx('services').insert({
          name: 'General Consultation',
          duration_minutes: 60,
          duration: 60, // Keep both for compatibility
          price: 100.00,
          description: 'Standard consultation service',
          is_active: true,
          active: true, // Keep both for compatibility
          color_code: '#2196F3',
          booking_rules: JSON.stringify({
            advance_booking_days: 30,
            cancellation_hours: 24,
            same_day_booking: false,
            max_advance_days: 90,
            require_confirmation: false,
            allow_waitlist: true
          }),
          created_at: new Date(),
          updated_at: new Date()
        });
        console.log('   ✓ Created default service');
      }
      
      console.log('5. Ensuring UUIDs for all appointments...');
      
      // Generate UUIDs for appointments without them
      const appointmentsWithoutUUID = await trx('appointments')
        .whereNull('uuid')
        .orWhere('uuid', '');
        
      for (const appt of appointmentsWithoutUUID) {
        const uuid = require('crypto').randomUUID();
        await trx('appointments').where('id', appt.id).update({ uuid });
      }
      
      if (appointmentsWithoutUUID.length > 0) {
        console.log(`   ✓ Generated UUIDs for ${appointmentsWithoutUUID.length} appointments`);
      }
      
      console.log('✅ All critical fixes applied successfully!');
    });
    
  } catch (error) {
    console.error('❌ Error applying fixes:', error.message);
    throw error;
  }
}

async function testBookingCompatibility() {
  console.log('\n🧪 Testing booking compatibility...');
  
  try {
    // Test Objection.js model queries
    const Appointment = require('../src/models/Appointment');
    const Service = require('../src/models/Service');
    
    // Test basic queries
    const appointmentCount = await Appointment.query().count('* as count').first();
    console.log(`   ✓ Can query appointments: found ${appointmentCount.count} records`);
    
    const serviceCount = await Service.query().count('* as count').first();
    console.log(`   ✓ Can query services: found ${serviceCount.count} records`);
    
    // Test creating a test appointment (dry run with validation only)
    const testData = {
      client_id: 1,
      provider_id: 1,
      service_id: 1,
      appointment_datetime: new Date().toISOString(),
      duration_minutes: 60
    };
    
    const validatedAppt = Appointment.fromJson(testData);
    console.log('   ✓ Appointment model validation passes');
    
    console.log('✅ Booking system compatibility confirmed!');
    return true;
    
  } catch (error) {
    console.error('❌ Booking compatibility test failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  try {
    await applyCriticalFixes();
    const isCompatible = await testBookingCompatibility();
    
    if (isCompatible) {
      console.log('\n🎉 Database schema fixes completed successfully!');
      console.log('   The booking system should now work without schema errors.');
    } else {
      console.log('\n⚠️  Database fixes applied but compatibility issues remain.');
    }
    
  } catch (error) {
    console.error('\n💥 Failed to apply database fixes:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main();
}

module.exports = { applyCriticalFixes, testBookingCompatibility };