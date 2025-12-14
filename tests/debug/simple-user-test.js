#!/usr/bin/env node

/**
 * Simple User Registration and Lookup Test
 * Focuses specifically on the telegram user flow
 */

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const User = require('../../src/models/User');
const path = require('path');

async function initDb() {
  console.log('🔌 Connecting to database...');
  
  try {
    const knexConfig = require('../../database/knexfile');
    const knex = Knex(knexConfig.development);
    Model.knex(knex);
    
    // Test connection
    await knex.raw('select 1+1 as result');
    console.log('✅ Database connected successfully');
    return knex;
  } catch (error) {
    console.warn('⚠️  Using SQLite fallback');
    const dbPath = path.join(__dirname, '../../database/lodge_scheduler.sqlite3');
    const knex = Knex({
      client: 'sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true
    });
    Model.knex(knex);
    console.log('✅ SQLite connected');
    return knex;
  }
}

async function testSimpleFlow() {
  console.log('\n🧪 Testing Simple User Flow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const testTelegramId = 999888777; // Like real Telegram ID
  console.log('🆔 Test Telegram ID:', testTelegramId, '(type:', typeof testTelegramId, ')');
  
  // Clean up first
  try {
    await User.query().where('telegram_id', testTelegramId.toString()).delete();
    console.log('🧹 Cleaned up existing test data');
  } catch (e) {
    console.log('⚠️  Cleanup warning:', e.message);
  }
  
  // Test 1: Create user with minimal data (like bot does)
  console.log('\n📝 Step 1: Creating user...');
  let newUser;
  try {
    newUser = await User.query().insert({
      telegram_id: testTelegramId.toString(), // Convert to string
      email: `telegram_${testTelegramId}@telegram.local`,
      first_name: 'Test',
      last_name: 'User',
      // Don't include fields that might not exist
    });
    
    console.log('✅ User created successfully!');
    console.log('   User ID:', newUser.id);
    console.log('   Telegram ID stored as:', newUser.telegram_id, '(type:', typeof newUser.telegram_id, ')');
    
  } catch (error) {
    console.error('❌ User creation failed:', error.message);
    
    // Try to identify which field is causing issues
    if (error.message.includes('no column')) {
      const missingColumn = error.message.match(/no column named (\w+)/);
      if (missingColumn) {
        console.log(`💡 Missing column: ${missingColumn[1]}`);
      }
    }
    return;
  }
  
  // Test 2: Lookup with same format as bot uses
  console.log('\n🔍 Step 2: Testing lookup (like getUser method)...');
  
  try {
    // This is exactly what getUser does:
    const foundUser = await User.query()
      .where('telegram_id', testTelegramId.toString())
      .first();
    
    if (foundUser) {
      console.log('✅ User lookup successful!');
      console.log('   Found user ID:', foundUser.id);
      console.log('   Found telegram_id:', foundUser.telegram_id);
      console.log('   Match confirmed:', foundUser.telegram_id === testTelegramId.toString());
    } else {
      console.log('❌ User lookup FAILED!');
      console.log('   This is the problem - user exists but lookup fails');
    }
    
  } catch (error) {
    console.error('❌ Lookup error:', error.message);
  }
  
  // Test 3: Debug - check what's actually in the database
  console.log('\n🔬 Step 3: Database verification...');
  
  try {
    const allUsers = await User.query().limit(5);
    console.log(`📊 Total users in DB: ${allUsers.length}`);
    
    allUsers.forEach((user, i) => {
      console.log(`   ${i+1}. ID=${user.id}, telegram_id="${user.telegram_id}" (type: ${typeof user.telegram_id})`);
    });
    
  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
  }
  
  // Test 4: Try different query approaches
  console.log('\n🔄 Step 4: Alternative query methods...');
  
  try {
    // Method 1: Using User.findByTelegramId (from User model)
    const method1 = await User.findByTelegramId(testTelegramId);
    console.log('   Method 1 (findByTelegramId):', !!method1);
    
    // Method 2: Raw string query
    const method2 = await User.query().where('telegram_id', '999888777').first();
    console.log('   Method 2 (hardcoded string):', !!method2);
    
    // Method 3: Number query (should fail)
    const method3 = await User.query().where('telegram_id', 999888777).first();
    console.log('   Method 3 (raw number):', !!method3);
    
  } catch (error) {
    console.error('❌ Alternative query test failed:', error.message);
  }
  
  // Clean up
  try {
    await User.query().where('telegram_id', testTelegramId.toString()).delete();
    console.log('\n🧹 Test cleanup completed');
  } catch (e) {
    console.log('\n⚠️  Cleanup failed:', e.message);
  }
}

async function simulateStartCommand() {
  console.log('\n🤖 Simulating /start Command Flow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Simulate exactly what happens when user types /start
  const mockTelegramUser = {
    id: 111222333, // Number like real Telegram
    first_name: 'John',
    last_name: 'Doe',
    username: 'johndoe'
  };
  
  console.log('👤 Simulating user:', mockTelegramUser);
  
  // Step 1: Check if user exists (like registerUser method does)
  console.log('\n1️⃣  Checking if user exists...');
  
  let existingUser;
  try {
    existingUser = await User.query()
      .where('telegram_id', mockTelegramUser.id.toString())
      .first();
    
    console.log('   Search query: telegram_id =', mockTelegramUser.id.toString());
    console.log('   Existing user found:', !!existingUser);
    
    if (existingUser) {
      console.log('   ✅ User already registered, would skip registration');
      return existingUser;
    }
    
  } catch (error) {
    console.error('   ❌ Error checking existing user:', error.message);
    return;
  }
  
  // Step 2: Register new user (like registerUser method does)
  console.log('\n2️⃣  Registering new user...');
  
  let newUser;
  try {
    const userData = {
      telegram_id: mockTelegramUser.id.toString(),
      email: `telegram_${mockTelegramUser.id}@telegram.local`,
      first_name: mockTelegramUser.first_name || 'User',
      last_name: mockTelegramUser.last_name || '',
      phone: '',
      // Only include fields that we know exist
    };
    
    // Check what fields are safe to include
    const safeUserData = {};
    for (const [key, value] of Object.entries(userData)) {
      try {
        // Test if this field exists by doing a dummy query
        await User.query().select(key).limit(0);
        safeUserData[key] = value;
      } catch (e) {
        console.log(`   ⚠️  Skipping field '${key}' (column doesn't exist)`);
      }
    }
    
    console.log('   Safe user data:', safeUserData);
    
    newUser = await User.query().insert(safeUserData);
    
    console.log('   ✅ User registered successfully!');
    console.log('   New user ID:', newUser.id);
    console.log('   Stored telegram_id:', newUser.telegram_id);
    
  } catch (error) {
    console.error('   ❌ Registration failed:', error.message);
    return;
  }
  
  // Step 3: Test immediate lookup (like getUser does in subsequent calls)
  console.log('\n3️⃣  Testing immediate lookup...');
  
  try {
    const foundUser = await User.query()
      .where('telegram_id', mockTelegramUser.id.toString())
      .first();
    
    if (foundUser) {
      console.log('   ✅ Lookup successful after registration!');
      console.log('   Found user matches:', foundUser.id === newUser.id);
    } else {
      console.log('   ❌ Lookup FAILED after registration!');
      console.log('   This indicates the core issue');
    }
    
  } catch (error) {
    console.error('   ❌ Lookup error:', error.message);
  }
  
  // Clean up
  try {
    if (newUser) {
      await User.query().deleteById(newUser.id);
      console.log('\n🧹 Simulation cleanup completed');
    }
  } catch (e) {
    console.log('\n⚠️  Cleanup failed:', e.message);
  }
}

async function main() {
  console.log('🔬 Simple User Registration & Lookup Test');
  console.log('═══════════════════════════════════════════════════════════');
  
  const knex = await initDb();
  
  try {
    await testSimpleFlow();
    await simulateStartCommand();
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await knex.destroy();
    console.log('\n🏁 Test completed');
  }
}

if (require.main === module) {
  main().catch(console.error);
}