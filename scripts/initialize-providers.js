#!/usr/bin/env node

/**
 * Provider Initialization Script for Lodge Scheduler
 * 
 * This script solves the "provider availability issue" by:
 * 1. Creates a default Lodge Mobile provider if none exist (or uses existing admin)
 * 2. Ensures the 4 Lodge Mobile services exist and are active
 * 3. Creates availability schedule table if needed (11 AM - 6 PM weekdays as per bot config)
 * 4. Handles the current database schema properly
 * 5. Makes the script idempotent (safe to run multiple times)
 * 
 * PROBLEM SOLVED:
 * - Bot was showing "No providers available" error
 * - Services were present but no provider was linked
 * - Availability schedule was missing
 * - Admin user now has provider capabilities
 * 
 * SERVICES CREATED:
 * - Lodge Mobile: New Registration (45 min, Free)
 * - Lodge Mobile: SIM Card Activation (30 min, $25.00)
 * - Lodge Mobile: Technical Support (30 min, Free)
 * - Lodge Mobile: Upgrade Device (45 min, Free)
 * 
 * BUSINESS HOURS:
 * - Monday-Friday: 11:00 AM - 6:00 PM
 * - Saturday: 11:00 AM - 4:00 PM
 * - Sunday: Closed
 * 
 * Usage: node scripts/initialize-providers.js
 * Test:  node scripts/test-provider-setup.js
 */

require('dotenv').config();
const path = require('path');
const { Model } = require('objection');
const Knex = require('knex');

// Import models (with fallback for missing models)
let User, Service, AvailabilitySchedule;
try {
  User = require('../src/models/User');
  Service = require('../src/models/Service');
  AvailabilitySchedule = require('../src/models/AvailabilitySchedule');
} catch (error) {
  console.log('⚠️  Some models not available, using direct database queries');
}

const { UserRole, DayOfWeek } = require('../src/types');

// Configuration - Updated to match existing database schema
const LODGE_MOBILE_SERVICES = [
  {
    name: 'Lodge Mobile: New Registration',
    category: 'Lodge Mobile Activations',
    description: 'Complete new customer registration with Lodge Mobile',
    duration: 45, // Using 'duration' field instead of 'duration_minutes'
    price: 0.0,
    active: true
  },
  {
    name: 'Lodge Mobile: SIM Card Activation',
    category: 'Lodge Mobile Activations',
    description: 'Activate your Lodge Mobile SIM card',
    duration: 30,
    price: 25.0,
    active: true
  },
  {
    name: 'Lodge Mobile: Technical Support',
    category: 'Lodge Mobile Activations',
    description: 'Get help with Lodge Mobile technical issues',
    duration: 30,
    price: 0.0,
    active: true
  },
  {
    name: 'Lodge Mobile: Upgrade Device',
    category: 'Lodge Mobile Activations',
    description: 'Upgrade to a new device with Lodge Mobile',
    duration: 45,
    price: 0.0,
    active: true
  }
];

const DEFAULT_AVAILABILITY = {
  monday: { start_time: '11:00', end_time: '18:00', is_active: true },
  tuesday: { start_time: '11:00', end_time: '18:00', is_active: true },
  wednesday: { start_time: '11:00', end_time: '18:00', is_active: true },
  thursday: { start_time: '11:00', end_time: '18:00', is_active: true },
  friday: { start_time: '11:00', end_time: '18:00', is_active: true },
  saturday: { start_time: '11:00', end_time: '16:00', is_active: true },
  sunday: { start_time: '12:00', end_time: '16:00', is_active: false } // Closed on Sundays
};

class ProviderInitializer {
  constructor() {
    this.knex = null;
    this.provider = null;
    this.services = [];
  }

  async initialize() {
    try {
      await this.setupDatabase();
      await this.checkExistingData();
      
      if (!this.provider) {
        await this.createDefaultProvider();
      }
      
      await this.createServices();
      await this.setupAvailability();
      
      await this.displaySummary();
      
      console.log('\n🎉 Provider initialization completed successfully!');
      console.log('✅ The Lodge Scheduler bot is now ready to accept appointments.');
      
    } catch (error) {
      console.error('\n❌ Initialization failed:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    } finally {
      if (this.knex) {
        await this.knex.destroy();
      }
    }
  }

  async setupDatabase() {
    console.log('🔗 Setting up database connection...');
    
    // Try test database first (which has all tables)
    const testDbPath = path.join(__dirname, '../database/test_lodge_scheduler.sqlite3');
    const mainDbPath = path.join(__dirname, '../lodge_scheduler.sqlite3');
    
    try {
      this.knex = Knex({
        client: 'sqlite3',
        connection: { filename: testDbPath },
        useNullAsDefault: true
      });
      
      // Test connection
      await this.knex.raw('SELECT 1');
      Model.knex(this.knex);
      
      console.log('✅ Connected to test database:', testDbPath);
    } catch (error) {
      console.log('⚠️  Test database not available, trying main database...');
      
      try {
        await this.knex?.destroy();
        this.knex = Knex({
          client: 'sqlite3',
          connection: { filename: mainDbPath },
          useNullAsDefault: true
        });
        
        await this.knex.raw('SELECT 1');
        Model.knex(this.knex);
        
        console.log('✅ Connected to main database:', mainDbPath);
      } catch (mainError) {
        throw new Error(`Cannot connect to database: ${mainError.message}`);
      }
    }
  }

  async checkExistingData() {
    console.log('\n📊 Checking existing data...');
    
    try {
      // Check for existing providers using raw queries if models fail
      let providers;
      if (User) {
        providers = await User.query().where('role', UserRole.PROVIDER);
      } else {
        providers = await this.knex('users').where('role', 'provider');
      }
      console.log(`   Found ${providers.length} existing provider(s)`);
      
      if (providers.length > 0) {
        this.provider = providers[0];
        const fullName = this.provider.getFullName ? this.provider.getFullName() : `${this.provider.first_name} ${this.provider.last_name}`;
        console.log(`   Using existing provider: ${fullName} (ID: ${this.provider.id})`);
      }
      
      // Check for existing services using raw queries
      const services = await this.knex('services').where('active', true);
      console.log(`   Found ${services.length} existing active service(s)`);
      
      if (services.length > 0) {
        console.log('   Existing services:');
        services.forEach(service => {
          const formattedDuration = service.duration >= 60 
            ? `${Math.floor(service.duration / 60)}h ${service.duration % 60}min`
            : `${service.duration} min`;
          console.log(`     - ${service.name} (${formattedDuration})`);
        });
      }
      
    } catch (error) {
      console.warn('⚠️  Warning: Could not check existing data:', error.message);
    }
  }

  async createDefaultProvider() {
    console.log('\n👨‍💼 Creating default Lodge Mobile provider...');
    
    try {
      // First check if admin user exists and promote to provider role
      const adminUser = await this.knex('users').where('role', 'admin').first();
      if (adminUser) {
        console.log('   Found admin user, updating role to provider to handle provider functions...');
        await this.knex('users')
          .where('id', adminUser.id)
          .update({ 
            role: 'provider',  // Changed from 'admin' to 'provider'
            preferences: JSON.stringify({
              approval_status: 'approved',
              approved_by: 'system',
              approved_at: new Date().toISOString(),
              provider_type: 'Lodge Mobile Support',
              business_hours: DEFAULT_AVAILABILITY,
              can_provide_services: true,
              is_admin_provider: true  // Flag to indicate this provider has admin privileges
            })
          });
        
        this.provider = await this.knex('users').where('id', adminUser.id).first();
        console.log(`✅ Updated admin user to handle provider services: ${this.provider.first_name} ${this.provider.last_name} (ID: ${this.provider.id})`);
        return;
      }

      // Create a dedicated provider if no admin exists
      const providerData = {
        email: 'provider@lodgemobile.com',
        first_name: 'Lodge',
        last_name: 'Mobile',
        phone: '+1-800-LODGE-01',
        role: 'provider',
        timezone: 'America/New_York',
        is_active: 1,
        preferences: JSON.stringify({
          approval_status: 'approved',
          approved_by: 'system',
          approved_at: new Date().toISOString(),
          provider_type: 'Lodge Mobile Support',
          business_hours: DEFAULT_AVAILABILITY
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const [providerId] = await this.knex('users').insert(providerData);
      this.provider = await this.knex('users').where('id', providerId).first();
      console.log(`✅ Created provider: ${this.provider.first_name} ${this.provider.last_name} (ID: ${this.provider.id})`);
      
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed: users.email') || error.message.includes('UNIQUE')) {
        console.log('   Provider email already exists, trying to find existing provider...');
        let existingProvider = await this.knex('users').where('email', 'provider@lodgemobile.com').first();
        if (!existingProvider) {
          existingProvider = await this.knex('users').where('role', 'provider').first();
        }
        if (existingProvider) {
          this.provider = existingProvider;
          console.log(`✅ Found existing provider: ${this.provider.first_name} ${this.provider.last_name} (ID: ${this.provider.id})`);
        } else {
          throw new Error('Could not create or find provider');
        }
      } else {
        throw error;
      }
    }
  }

  async createServices() {
    console.log('\n🛠️  Creating Lodge Mobile services...');
    
    for (const serviceData of LODGE_MOBILE_SERVICES) {
      try {
        // Check if service already exists by name
        const existingService = await this.knex('services')
          .where('name', serviceData.name)
          .first();
          
        if (existingService) {
          console.log(`   ℹ️  Service "${serviceData.name}" already exists, ensuring it's active...`);
          
          // Ensure the service is active and has correct data
          await this.knex('services')
            .where('id', existingService.id)
            .update({
              ...serviceData,
              active: true,
              updated_at: new Date().toISOString()
            });
            
          const updatedService = await this.knex('services').where('id', existingService.id).first();
          this.services.push(updatedService);
          continue;
        }
        
        // Create new service
        const serviceToInsert = {
          ...serviceData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const [serviceId] = await this.knex('services').insert(serviceToInsert);
        const service = await this.knex('services').where('id', serviceId).first();
        
        this.services.push(service);
        
        const formattedDuration = service.duration >= 60 
          ? `${Math.floor(service.duration / 60)}h ${service.duration % 60}min`
          : `${service.duration} min`;
        const formattedPrice = service.price ? `$${service.price.toFixed(2)}` : 'Free';
        
        console.log(`   ✅ Created service: ${service.name} (${formattedDuration}) - ${formattedPrice}`);
        
      } catch (error) {
        console.error(`   ❌ Failed to create service "${serviceData.name}":`, error.message);
      }
    }
    
    console.log(`✅ Successfully created/verified ${this.services.length} services`);
  }

  async setupAvailability() {
    console.log('\n📅 Setting up provider availability schedule...');
    
    try {
      // First, create the availability_schedules table if it doesn't exist
      const hasAvailabilityTable = await this.knex.schema.hasTable('availability_schedules');
      
      if (!hasAvailabilityTable) {
        console.log('   Creating availability_schedules table...');
        await this.knex.schema.createTable('availability_schedules', function(table) {
          table.increments('id').primary();
          table.integer('provider_id').unsigned().nullable(); // Nullable since current schema doesn't have foreign keys
          table.enum('day_of_week', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
          table.time('start_time').notNullable();
          table.time('end_time').notNullable();
          table.boolean('is_active').defaultTo(true);
          table.date('effective_from').nullable();
          table.date('effective_until').nullable();
          table.timestamps(true, true);
          table.index(['provider_id', 'day_of_week', 'is_active']);
        });
        console.log('   ✅ Created availability_schedules table');
      }
      
      // Check if availability already exists for this provider
      const existingSchedules = await this.knex('availability_schedules')
        .where('provider_id', this.provider.id);
      
      if (existingSchedules.length > 0) {
        console.log('   ℹ️  Availability schedule already exists, skipping creation...');
        console.log(`   Found ${existingSchedules.length} existing schedule entries`);
        return;
      }
      
      // Create availability schedule for each day
      const scheduleEntries = [];
      
      for (const [day, schedule] of Object.entries(DEFAULT_AVAILABILITY)) {
        if (schedule.is_active) {
          scheduleEntries.push({
            provider_id: this.provider.id,
            day_of_week: day,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            is_active: true,
            effective_from: null,
            effective_until: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
      
      // Insert all schedule entries
      await this.knex('availability_schedules').insert(scheduleEntries);
      
      console.log('   ✅ Availability schedule created:');
      scheduleEntries.forEach(entry => {
        console.log(`     ${entry.day_of_week}: ${entry.start_time} - ${entry.end_time}`);
      });
      
    } catch (error) {
      console.error('   ❌ Failed to setup availability:', error.message);
      console.warn('   The bot may still work without the availability table, but appointment scheduling might be limited');
      console.warn('   Business hours are stored in the provider\'s preferences as a fallback');
    }
  }

  async displaySummary() {
    console.log('\n📋 INITIALIZATION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Provider info
      const fullName = this.provider.getFullName ? this.provider.getFullName() : `${this.provider.first_name} ${this.provider.last_name}`;
      console.log(`👨‍💼 Provider: ${fullName}`);
      console.log(`   ID: ${this.provider.id}`);
      console.log(`   Email: ${this.provider.email || 'Not set'}`);
      console.log(`   Phone: ${this.provider.phone || 'Not set'}`);
      console.log(`   Role: ${this.provider.role}`);
      console.log(`   Status: ${this.provider.is_active ? 'Active' : 'Inactive'}`);
      
      // Services info
      console.log(`\n🛠️  Services (${this.services.length} total):`);
      this.services.forEach((service, index) => {
        const formattedDuration = service.duration >= 60 
          ? `${Math.floor(service.duration / 60)}h ${service.duration % 60}min`
          : `${service.duration} min`;
        const formattedPrice = service.price ? `$${service.price.toFixed(2)}` : 'Free';
        
        console.log(`   ${index + 1}. ${service.name}`);
        console.log(`      Duration: ${formattedDuration}`);
        console.log(`      Price: ${formattedPrice}`);
        console.log(`      Category: ${service.category || 'General'}`);
        console.log(`      Status: ${service.active ? 'Active' : 'Inactive'}`);
      });
      
      // Availability info
      try {
        const schedules = await this.knex('availability_schedules')
          .where('provider_id', this.provider.id)
          .where('is_active', true);
          
        console.log(`\n📅 Availability Schedule (${schedules.length} days):`);
        if (schedules.length > 0) {
          schedules.forEach(schedule => {
            console.log(`   ${schedule.day_of_week}: ${schedule.start_time} - ${schedule.end_time}`);
          });
        } else {
          console.log('   Using fallback business hours from provider preferences');
          console.log('   Monday-Friday: 11:00 - 18:00');
          console.log('   Saturday: 11:00 - 16:00');
          console.log('   Sunday: Closed');
        }
      } catch (availError) {
        console.log(`\n📅 Availability Schedule: Using fallback from preferences`);
        console.log('   Monday-Friday: 11:00 - 18:00');
        console.log('   Saturday: 11:00 - 16:00');
        console.log('   Sunday: Closed');
      }
      
      // Database stats
      const totalUsers = await this.knex('users').count('* as count').first();
      const totalAppointments = await this.knex('appointments').count('* as count').first();
      
      console.log(`\n📊 Database Statistics:`);
      console.log(`   Total users: ${totalUsers.count}`);
      console.log(`   Total appointments: ${totalAppointments.count}`);
      console.log(`   Total services: ${this.services.length}`);
      
      // Next steps
      console.log(`\n🚀 Next Steps:`);
      console.log(`   1. Start the Telegram bot: npm run bot`);
      console.log(`   2. Users can now book appointments using /book command`);
      console.log(`   3. Available services: Registration, SIM Activation, Tech Support, Device Upgrade`);
      console.log(`   4. Business hours: Monday-Saturday 11:00 AM - 6:00 PM`);
      
    } catch (error) {
      console.warn('⚠️  Could not generate complete summary:', error.message);
    }
  }
}

// Helper function to validate database tables
async function validateDatabaseTables(knex) {
  const requiredTables = ['users', 'services', 'availability_schedules', 'appointments'];
  const missingTables = [];
  
  for (const table of requiredTables) {
    try {
      await knex(table).limit(1);
    } catch (error) {
      if (error.message.includes('no such table')) {
        missingTables.push(table);
      }
    }
  }
  
  if (missingTables.length > 0) {
    throw new Error(`Missing database tables: ${missingTables.join(', ')}. Please run migrations first.`);
  }
  
  return true;
}

// Main execution
async function main() {
  console.log('🚀 Lodge Scheduler Provider Initialization');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('This script will set up Lodge Mobile as a service provider with:');
  console.log('• Default provider account');
  console.log('• 4 service types (Registration, SIM, Support, Upgrade)');
  console.log('• Business hours availability (11 AM - 6 PM weekdays)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const initializer = new ProviderInitializer();
  await initializer.initialize();
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 FATAL ERROR:', error.message);
    process.exit(1);
  });
}

module.exports = { ProviderInitializer, LODGE_MOBILE_SERVICES, DEFAULT_AVAILABILITY };