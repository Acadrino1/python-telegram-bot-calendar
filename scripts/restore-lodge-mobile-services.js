#!/usr/bin/env node
/**
 * Lodge Mobile Services Restoration Script
 * Restores the 4 core Lodge Mobile services to the database
 */

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../database/knexfile');
const config = knexConfig[process.env.NODE_ENV || 'development'];
const knex = Knex(config);
Model.knex(knex);

const Service = require('../src/models/Service');

async function restoreLodgeMobileServices() {
  console.log('🚀 Starting Lodge Mobile Services Restoration...');
  
  const lodgeMobileServices = [
    {
      name: 'Lodge Mobile: New Registration',
      category: 'Lodge Mobile Activations',
      duration: 45,
      price: 0,
      description: 'Complete new customer registration with Lodge Mobile including account setup and initial activation',
      active: true,
      requires_deposit: false,
      deposit_amount: 0
    },
    {
      name: 'Lodge Mobile: Simcard Activation',
      category: 'Lodge Mobile Activations',
      duration: 30,
      price: 25,
      description: 'Activate your Lodge Mobile SIM card and get connected to our network',
      active: true,
      requires_deposit: false,
      deposit_amount: 0
    },
    {
      name: 'Lodge Mobile: Technical Support',
      category: 'Lodge Mobile Activations',
      duration: 30,
      price: 0,
      description: 'Get help with any technical issues or questions about your Lodge Mobile service',
      active: true,
      requires_deposit: false,
      deposit_amount: 0
    },
    {
      name: 'Lodge Mobile: Upgrade Device',
      category: 'Lodge Mobile Activations',
      duration: 45,
      price: 0,
      description: 'Upgrade to a new device and transfer your Lodge Mobile service',
      active: true,
      requires_deposit: false,
      deposit_amount: 0
    }
  ];

  try {
    // First, deactivate any existing services in other categories
    await Service.query()
      .patch({ active: false })
      .whereNot('category', 'Lodge Mobile Activations');
    
    console.log('✅ Deactivated non-Lodge Mobile services');

    // Check and insert/update Lodge Mobile services
    for (const service of lodgeMobileServices) {
      const existing = await Service.query()
        .where('name', service.name)
        .first();
      
      if (existing) {
        await Service.query()
          .findById(existing.id)
          .patch(service);
        console.log(`✅ Updated: ${service.name}`);
      } else {
        await Service.query().insert(service);
        console.log(`✅ Created: ${service.name}`);
      }
    }

    console.log('\n🎉 Lodge Mobile Services Restoration Complete!');
    console.log('Services available:');
    console.log('1. Lodge Mobile: New Registration (45 min)');
    console.log('2. Lodge Mobile: Simcard Activation (30 min - $25)');
    console.log('3. Lodge Mobile: Technical Support (30 min)');
    console.log('4. Lodge Mobile: Upgrade Device (45 min)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error restoring services:', error);
    process.exit(1);
  }
}

restoreLodgeMobileServices();