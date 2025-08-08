#!/usr/bin/env node

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

const Service = require('../src/models/Service');
const User = require('../src/models/User');

async function addServices() {
  try {
    console.log('🔍 Checking for existing services...');
    
    // Check if services exist
    const existingServices = await Service.query();
    if (existingServices.length > 0) {
      console.log(`✅ Found ${existingServices.length} existing services`);
      existingServices.forEach(s => {
        console.log(`   - ${s.id}: ${s.name} (${s.category})`);
      });
      await knex.destroy();
      return;
    }
    
    console.log('📝 Adding default services...');
    
    // Insert services
    const services = await Service.query().insertAndFetch([
      {
        name: 'General Consultation',
        description: 'Standard medical consultation with a healthcare provider',
        duration_minutes: 30,
        price: 50.00,
        category: 'medical',
        is_active: true,
        booking_notice_hours: 24,
        cancellation_notice_hours: 12
      },
      {
        name: 'Specialist Visit',
        description: 'Consultation with a medical specialist',
        duration_minutes: 45,
        price: 100.00,
        category: 'medical',
        is_active: true,
        booking_notice_hours: 48,
        cancellation_notice_hours: 24
      },
      {
        name: 'Quick Checkup',
        description: 'Brief medical checkup and assessment',
        duration_minutes: 15,
        price: 30.00,
        category: 'medical',
        is_active: true,
        booking_notice_hours: 12,
        cancellation_notice_hours: 6
      },
      {
        name: 'Dental Cleaning',
        description: 'Professional teeth cleaning and oral health check',
        duration_minutes: 60,
        price: 80.00,
        category: 'dental',
        is_active: true,
        booking_notice_hours: 24,
        cancellation_notice_hours: 12
      },
      {
        name: 'Hair Styling',
        description: 'Professional haircut and styling service',
        duration_minutes: 45,
        price: 45.00,
        category: 'beauty',
        is_active: true,
        booking_notice_hours: 12,
        cancellation_notice_hours: 6
      },
      {
        name: 'Massage Therapy',
        description: 'Relaxing full-body massage therapy session',
        duration_minutes: 60,
        price: 90.00,
        category: 'wellness',
        is_active: true,
        booking_notice_hours: 24,
        cancellation_notice_hours: 12
      }
    ]);
    
    console.log('✅ Services added successfully:');
    services.forEach(service => {
      console.log(`   - ${service.id}: ${service.name} (${service.category}) - $${service.price}`);
    });
    
    // Check for providers
    const providers = await User.query().where('role', 'provider');
    if (providers.length === 0) {
      console.log('\n📝 Adding default provider...');
      
      const provider = await User.query().insertAndFetch({
        email: 'provider1@example.com',
        password_hash: '$2b$10$YourHashedPasswordHere',  // This is just a placeholder
        first_name: 'Dr. John',
        last_name: 'Smith',
        phone: '555-0101',
        role: 'provider',
        timezone: 'America/New_York',
        is_active: true,
        preferences: {
          notificationEmail: true,
          notificationSMS: false,
          notificationTelegram: false
        }
      });
      
      console.log(`✅ Provider added: ${provider.first_name} ${provider.last_name} (ID: ${provider.id})`);
      
      // Link provider to services
      console.log('\n🔗 Linking provider to services...');
      
      // Use raw query since we don't have a ProviderService model
      for (const service of services) {
        await knex('provider_services').insert({
          provider_id: provider.id,
          service_id: service.id,
          is_available: true,
          custom_price: null,
          custom_duration: null
        });
      }
      
      console.log('✅ Provider linked to all services');
    } else {
      console.log(`\n✅ Found ${providers.length} existing provider(s)`);
      
      // Link existing providers to new services
      for (const provider of providers) {
        console.log(`\n🔗 Linking provider ${provider.id} to services...`);
        
        for (const service of services) {
          // Check if link already exists
          const existing = await knex('provider_services')
            .where('provider_id', provider.id)
            .where('service_id', service.id)
            .first();
          
          if (!existing) {
            await knex('provider_services').insert({
              provider_id: provider.id,
              service_id: service.id,
              is_available: true,
              custom_price: null,
              custom_duration: null
            });
          }
        }
        
        console.log(`✅ Provider ${provider.id} linked to services`);
      }
    }
    
    console.log('\n✅ Database setup complete!');
    console.log('🤖 The bot can now use these services for bookings.');
    
  } catch (error) {
    console.error('❌ Error adding services:', error.message);
    console.error(error);
  } finally {
    await knex.destroy();
  }
}

addServices();