#!/usr/bin/env node

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

const Service = require('../src/models/Service');
const User = require('../src/models/User');

async function updateLodgeServices() {
  try {
    console.log('🔄 Updating services for Lodge Mobile Activations...');
    
    // Get existing services
    const existingServices = await Service.query();
    
    // Update existing services or create new ones
    const lodgeServices = [
      {
        name: 'Lodge Mobile: New Registration',
        description: 'New customer registration and account creation for Lodge Mobile services',
        duration_minutes: 90,
        price: 0,
        is_active: true
      },
      {
        name: 'Lodge Mobile: Simcard Activation',
        description: 'SIM card activation and network configuration for Lodge Mobile customers',
        duration_minutes: 90,
        price: 0,
        is_active: true
      },
      {
        name: 'Lodge Mobile: Upgrade Device',
        description: 'Device upgrade consultation and data migration services',
        duration_minutes: 90,
        price: 0,
        is_active: true
      },
      {
        name: 'Lodge Mobile: Technical Support',
        description: 'Technical assistance and troubleshooting for Lodge Mobile services',
        duration_minutes: 90,
        price: 0,
        is_active: true
      }
    ];
    
    // Update existing services with Lodge Mobile data
    const services = [];
    for (let i = 0; i < lodgeServices.length; i++) {
      if (existingServices[i]) {
        // Update existing service
        const updated = await Service.query()
          .patchAndFetchById(existingServices[i].id, lodgeServices[i]);
        services.push(updated);
        console.log(`✅ Updated service ${updated.id}: ${updated.name}`);
      } else {
        // Create new service
        const created = await Service.query().insertAndFetch(lodgeServices[i]);
        services.push(created);
        console.log(`✅ Created service ${created.id}: ${created.name}`);
      }
    }
    
    // Deactivate any extra services
    for (let i = lodgeServices.length; i < existingServices.length; i++) {
      await Service.query()
        .patchAndFetchById(existingServices[i].id, { is_active: false });
      console.log(`⚠️  Deactivated extra service ${existingServices[i].id}`);
    }
    
    console.log('\n✅ Lodge Mobile services updated:');
    services.forEach(service => {
      console.log(`   - ${service.id}: ${service.name}`);
    });
    
    // Link existing providers to services
    const providers = await User.query().where('role', 'provider');
    
    if (providers.length > 0) {
      for (const provider of providers) {
        console.log(`\n🔗 Linking provider ${provider.id} to Lodge Mobile services...`);
        
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
        
        console.log(`✅ Provider ${provider.id} linked to all Lodge Mobile services`);
      }
    } else {
      console.log('\n⚠️  No providers found. Run add-services.js first to create a provider.');
    }
    
    console.log('\n✅ Lodge Mobile services update complete!');
    console.log('🤖 The bot now shows professional Lodge Mobile activation services.');
    
  } catch (error) {
    console.error('❌ Error updating services:', error.message);
    console.error(error);
  } finally {
    await knex.destroy();
  }
}

updateLodgeServices();