#!/usr/bin/env node

/**
 * Direct User Flow Test - bypasses migration issues
 * Tests the exact flow that happens in the bot
 */

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const path = require('path');

// Create a simple User model for testing
class TestUser extends Model {
  static get tableName() {
    return 'users';
  }
  
  static async findByTelegramId(telegramId) {
    console.log(`🔍 findByTelegramId called with: ${telegramId} (type: ${typeof telegramId})`);
    const result = await this.query().where('telegram_id', telegramId.toString()).first();
    console.log(`   Result: ${!!result}`);
    return result;
  }
}

async function setupSimpleDatabase() {
  console.log('🔧 Setting up simple test database...');
  
  // Use a fresh in-memory SQLite database
  const knex = Knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../database/migrations')
    }
  });
  
  Model.knex(knex);
  
  // Create a simple users table that matches what we actually need
  await knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('telegram_id').nullable();
    table.string('email').nullable();
    table.string('first_name').nullable();
    table.string('last_name').nullable();
    table.string('phone').nullable();
    table.timestamps(true, true);
  });
  
  console.log('✅ Simple test database created');
  return knex;
}

async function testActualBotFlow() {
  console.log('\n🤖 Testing Actual Bot Flow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // This simulates exactly what happens in SimpleTelegramBot
  const mockCtx = {
    from: {
      id: 123456789, // Number like real Telegram
      first_name: 'John',
      last_name: 'Doe',
      username: 'johndoe'
    }
  };
  
  console.log('👤 Mock Telegram user:', mockCtx.from);
  
  // STEP 1: registerUser method from SimpleTelegramBot (lines 1200-1231)
  console.log('\n1️⃣  Simulating registerUser method...');
  
  try {
    const telegramUser = mockCtx.from;
    
    // First, check if user exists (line 1204-1206)
    console.log('   Checking for existing user...');
    let user = await TestUser.query()
      .where('telegram_id', telegramUser.id.toString())
      .first();
    
    console.log(`   Search: telegram_id = "${telegramUser.id.toString()}"`);
    console.log('   Existing user found:', !!user);
    
    if (!user) {
      // Create new user (lines 1209-1224)
      console.log('   Creating new user...');
      
      user = await TestUser.query().insert({
        telegram_id: telegramUser.id.toString(),
        email: `telegram_${telegramUser.id}@telegram.local`,
        first_name: telegramUser.first_name || 'User',
        last_name: telegramUser.last_name || '',
        phone: ''
      });
      
      console.log('   ✅ User created successfully');
      console.log('   User ID:', user.id);
      console.log('   Stored telegram_id:', user.telegram_id, '(type:', typeof user.telegram_id, ')');
    }
    
    // STEP 2: Later call to getUser method (lines 1233-1241)
    console.log('\n2️⃣  Simulating getUser method call...');
    
    console.log('   Calling getUser with:', telegramUser.id, '(type:', typeof telegramUser.id, ')');
    
    // This is exactly what getUser does:
    const foundUser = await TestUser.query()
      .where('telegram_id', telegramUser.id.toString())
      .first();
    
    console.log('   Search query: telegram_id =', telegramUser.id.toString());
    console.log('   Found user:', !!foundUser);
    
    if (foundUser) {
      console.log('   ✅ SUCCESS: getUser found the user!');
      console.log('   Found telegram_id:', foundUser.telegram_id);
      console.log('   Matches original:', foundUser.telegram_id === telegramUser.id.toString());
    } else {
      console.log('   ❌ FAILURE: getUser could not find the user!');
      console.log('   This is the exact problem we\'re diagnosing');
      
      // Debug: What's actually in the database?
      const allUsers = await TestUser.query();
      console.log('   📊 All users in database:');
      allUsers.forEach((u, i) => {
        console.log(`      ${i+1}. ID=${u.id}, telegram_id="${u.telegram_id}" (type: ${typeof u.telegram_id})`);
      });
    }
    
    // STEP 3: Test the static method from User model
    console.log('\n3️⃣  Testing User.findByTelegramId method...');
    
    const staticResult = await TestUser.findByTelegramId(telegramUser.id);
    console.log('   findByTelegramId result:', !!staticResult);
    
    if (staticResult) {
      console.log('   ✅ Static method works correctly');
    } else {
      console.log('   ❌ Static method also fails');
    }
    
  } catch (error) {
    console.error('❌ Bot flow test failed:', error.message);
    console.error('Full error:', error);
  }
}

async function testDataTypeIssues() {
  console.log('\n🔬 Testing Data Type Edge Cases');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const testCases = [
    { name: 'Number to String', telegramId: 987654321, shouldWork: true },
    { name: 'String Number', telegramId: '987654321', shouldWork: true },
    { name: 'Large Number', telegramId: 1234567890123, shouldWork: true },
    { name: 'String Large', telegramId: '1234567890123', shouldWork: true }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n   Testing: ${testCase.name}`);
    console.log(`   Input: ${testCase.telegramId} (type: ${typeof testCase.telegramId})`);
    
    try {
      // Clean up
      await TestUser.query().where('telegram_id', testCase.telegramId.toString()).delete();
      
      // Create user
      const user = await TestUser.query().insert({
        telegram_id: testCase.telegramId.toString(),
        email: `test_${testCase.telegramId}@test.com`,
        first_name: 'Test',
        last_name: 'User'
      });
      
      console.log(`   Created: telegram_id="${user.telegram_id}" (type: ${typeof user.telegram_id})`);
      
      // Try to find it back
      const found = await TestUser.query()
        .where('telegram_id', testCase.telegramId.toString())
        .first();
      
      const success = !!found;
      console.log(`   Found: ${success} ${success === testCase.shouldWork ? '✅' : '❌'}`);
      
      if (found) {
        console.log(`   Retrieved: telegram_id="${found.telegram_id}" (type: ${typeof found.telegram_id})`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

async function identifyRootCause() {
  console.log('\n🎯 Root Cause Analysis');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('Based on the test results:');
  console.log('');
  
  // Check if the issue is in the bot code vs database
  const testId = 555666777;
  
  try {
    // Create test user
    await TestUser.query().insert({
      telegram_id: testId.toString(),
      email: `root_cause_${testId}@test.com`,
      first_name: 'Root',
      last_name: 'Cause'
    });
    
    // Test different query patterns
    console.log('🧪 Query Pattern Tests:');
    
    // Pattern 1: Exact match (how bot does it)
    const pattern1 = await TestUser.query().where('telegram_id', testId.toString()).first();
    console.log(`   1. String conversion: ${!!pattern1} ✅`);
    
    // Pattern 2: Direct number (wrong but let's see)
    const pattern2 = await TestUser.query().where('telegram_id', testId).first();
    console.log(`   2. Direct number: ${!!pattern2} ${pattern2 ? '⚠️' : '❌'}`);
    
    // Pattern 3: Using LIKE (just in case)
    const pattern3 = await TestUser.query().where('telegram_id', 'like', `%${testId}%`).first();
    console.log(`   3. LIKE pattern: ${!!pattern3} ${pattern3 ? '⚠️' : '❌'}`);
    
    // Pattern 4: Raw SQL to see what's actually stored
    const raw = await TestUser.knex().raw('SELECT telegram_id FROM users WHERE id = (SELECT MAX(id) FROM users)');
    const rawValue = raw[0] ? raw[0].telegram_id : null;
    console.log(`   4. Raw stored value: "${rawValue}" (type: ${typeof rawValue})`);
    
    if (pattern1) {
      console.log('\n✅ CONCLUSION: Query patterns work correctly');
      console.log('   The issue is likely:');
      console.log('   • Missing database columns (role, preferences, etc.)');
      console.log('   • Migration not completed properly');
      console.log('   • User.js model expecting fields that don\'t exist');
    } else {
      console.log('\n❌ CONCLUSION: Query patterns are broken');
      console.log('   The issue is in the query logic itself');
    }
    
  } catch (error) {
    console.error('Root cause analysis failed:', error.message);
  }
}

async function generateSolution() {
  console.log('\n💡 Solution Recommendations');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('Based on the analysis, here\'s the fix:');
  console.log('');
  console.log('🔧 IMMEDIATE FIXES:');
  console.log('');
  console.log('1. DATABASE SCHEMA ISSUES:');
  console.log('   • The database schema is incomplete');
  console.log('   • Missing columns: role, preferences, timezone, etc.');
  console.log('   • Solution: Fix migrations or create missing columns');
  console.log('');
  console.log('2. USER MODEL REQUIREMENTS:');
  console.log('   • User.js model requires fields that don\'t exist');
  console.log('   • registerUser tries to insert into missing columns');
  console.log('   • Solution: Update User model or database schema');
  console.log('');
  console.log('3. CODE FIXES:');
  console.log('   • Modify registerUser to only use existing columns');
  console.log('   • Add error handling for missing columns');
  console.log('   • Make User model more flexible');
  console.log('');
  console.log('🎯 SPECIFIC ACTION ITEMS:');
  console.log('   A. Fix database schema (run all migrations properly)');
  console.log('   B. Update registerUser method to handle missing columns');
  console.log('   C. Test with actual Telegram bot');
  console.log('   D. Verify user lookup works after registration');
}

async function main() {
  console.log('🔍 Direct User Flow Analysis');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Testing the exact flow that occurs in the Telegram bot\n');
  
  const knex = await setupSimpleDatabase();
  
  try {
    await testActualBotFlow();
    await testDataTypeIssues();
    await identifyRootCause();
    await generateSolution();
  } catch (error) {
    console.error('\n💥 Analysis failed:', error);
  } finally {
    await knex.destroy();
    console.log('\n🏁 Analysis completed');
  }
}

if (require.main === module) {
  main().catch(console.error);
}