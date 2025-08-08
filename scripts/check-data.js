#!/usr/bin/env node

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

const Service = require('../src/models/Service');
const User = require('../src/models/User');

async function checkData() {
  try {
    console.log('📊 Database Status Check\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check services
    console.log('\n📦 SERVICES:');
    const services = await Service.query();
    if (services.length > 0) {
      services.forEach(s => {
        console.log(`   ID ${s.id}: ${s.name} - $${s.price || 'N/A'} (${s.duration_minutes || 30} min)`);
      });
    } else {
      console.log('   ❌ No services found');
    }
    
    // Check providers
    console.log('\n👨‍⚕️ PROVIDERS:');
    const providers = await User.query().where('role', 'provider');
    if (providers.length > 0) {
      providers.forEach(p => {
        console.log(`   ID ${p.id}: ${p.first_name} ${p.last_name} (${p.email})`);
      });
    } else {
      console.log('   ❌ No providers found - NEED TO ADD ONE!');
    }
    
    // Check clients
    console.log('\n👥 CLIENTS:');
    const clients = await User.query().where('role', 'client');
    console.log(`   Found ${clients.length} client(s)`);
    if (clients.length > 0 && clients.length <= 5) {
      clients.forEach(c => {
        console.log(`   ID ${c.id}: ${c.first_name} ${c.last_name || ''} (Telegram: ${c.telegram_id || 'N/A'})`);
      });
    }
    
    // Check provider-service links
    console.log('\n🔗 PROVIDER-SERVICE LINKS:');
    const links = await knex('provider_services').select('*');
    if (links.length > 0) {
      console.log(`   Found ${links.length} provider-service link(s)`);
      const providerIds = [...new Set(links.map(l => l.provider_id))];
      const serviceIds = [...new Set(links.map(l => l.service_id))];
      console.log(`   Providers linked: ${providerIds.join(', ')}`);
      console.log(`   Services linked: ${serviceIds.join(', ')}`);
    } else {
      console.log('   ❌ No provider-service links found');
    }
    
    // Check appointments
    console.log('\n📅 APPOINTMENTS:');
    const appointments = await knex('appointments').count('* as count');
    console.log(`   Total appointments: ${appointments[0].count}`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Analysis
    console.log('\n🔍 ANALYSIS:');
    if (providers.length === 0) {
      console.log('   ⚠️ ISSUE: No providers found! Bot needs provider_id=1');
      console.log('   💡 FIX: Need to add a default provider');
    } else if (!providers.find(p => p.id === 1)) {
      console.log('   ⚠️ ISSUE: No provider with ID=1 found!');
      console.log(`   💡 FIX: Bot is hardcoded to use provider_id=1, but found: ${providers.map(p => p.id).join(', ')}`);
    } else {
      console.log('   ✅ Provider with ID=1 exists');
    }
    
    if (services.length === 0) {
      console.log('   ⚠️ ISSUE: No services found!');
      console.log('   💡 FIX: Need to add services');
    } else {
      console.log('   ✅ Services exist');
    }
    
    if (links.length === 0 && providers.length > 0 && services.length > 0) {
      console.log('   ⚠️ ISSUE: Providers not linked to services!');
      console.log('   💡 FIX: Need to create provider-service links');
    } else if (links.length > 0) {
      console.log('   ✅ Provider-service links exist');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await knex.destroy();
  }
}

checkData();