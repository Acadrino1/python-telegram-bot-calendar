#!/usr/bin/env node

/**
 * Debug Script: User Registration and Lookup Flow
 * 
 * This script tests and debugs the user registration and lookup process
 * to identify where the user lookup fails.
 */

require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const User = require('../../src/models/User');
const path = require('path');

let knex;

async function initializeDatabase() {
  console.log('🔧 Initializing database connection...');
  
  try {
    const knexConfig = require('../../database/knexfile');
    const env = process.env.NODE_ENV || 'development';
    knex = Knex(knexConfig[env]);
    Model.knex(knex);
    console.log('✅ Database connected successfully');
    
    // Test connection
    await knex.raw('select 1+1 as result');
    console.log('✅ Database connection test passed');
  } catch (error) {
    console.warn('⚠️  Database connection failed, using SQLite fallback:', error.message);
    
    // Fallback to SQLite
    const dbPath = path.join(__dirname, '../../database/lodge_scheduler.sqlite3');
    knex = Knex({
      client: 'sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true
    });
    Model.knex(knex);
    console.log('✅ SQLite fallback database connected');
  }
}

async function debugDatabaseSchema() {
  console.log('\n📋 Debugging Database Schema...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Check if users table exists
    const hasUsersTable = await knex.schema.hasTable('users');
    console.log('✅ Users table exists:', hasUsersTable);
    
    if (hasUsersTable) {
      // Get table schema
      const columns = await knex('information_schema.columns')
        .select('column_name', 'data_type', 'is_nullable', 'column_default')
        .where('table_name', 'users')
        .catch(() => {
          // SQLite fallback
          return knex.raw("PRAGMA table_info(users)").then(result => {
            return result.map(col => ({
              column_name: col.name,
              data_type: col.type,
              is_nullable: col.notnull === 0 ? 'YES' : 'NO',
              column_default: col.dflt_value
            }));
          });
        });
      
      console.log('\n📊 Users table schema:');
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`   ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });
      
      // Check specifically for telegram_id column
      const telegramIdColumn = columns.find(col => col.column_name === 'telegram_id');
      if (telegramIdColumn) {
        console.log(`\n✅ telegram_id column found: ${telegramIdColumn.data_type}`);
      } else {
        console.log('\n❌ telegram_id column NOT found');
      }
    }
    
    // Count existing users
    const userCount = await User.query().count('* as count').first();
    console.log(`\n📈 Total users in database: ${userCount.count}`);
    
    // Count users with telegram_id
    const telegramUserCount = await User.query()
      .whereNotNull('telegram_id')
      .count('* as count')
      .first();
    console.log(`📈 Users with telegram_id: ${telegramUserCount.count}`);
    
  } catch (error) {
    console.error('❌ Database schema debug failed:', error.message);
    console.error('Error details:', error);
  }
}

async function testUserRegistration() {
  console.log('\n🧪 Testing User Registration Process...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Test telegram user data
  const testTelegramUser = {
    id: 12345678, // Number type like real Telegram
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    language_code: 'en'
  };
  
  console.log('📝 Test Telegram user data:');
  console.log('   ID:', testTelegramUser.id, '(type:', typeof testTelegramUser.id, ')');
  console.log('   First Name:', testTelegramUser.first_name);
  console.log('   Last Name:', testTelegramUser.last_name);
  console.log('   Username:', testTelegramUser.username);
  
  try {
    // First check if user already exists
    console.log('\n🔍 Step 1: Check if user already exists...');
    
    let existingUser;
    try {
      existingUser = await User.query()
        .where('telegram_id', testTelegramUser.id.toString())
        .first();
      console.log('   Searching for telegram_id:', testTelegramUser.id.toString());
      console.log('   Existing user found:', !!existingUser);
      
      if (existingUser) {
        console.log('   Existing user telegram_id:', existingUser.telegram_id, '(type:', typeof existingUser.telegram_id, ')');
      }
    } catch (error) {
      console.error('   ❌ Error checking existing user:', error.message);
    }
    
    // Clean up test user if exists
    if (existingUser) {
      console.log('🧹 Cleaning up existing test user...');
      await User.query().deleteById(existingUser.id);
      console.log('   ✅ Test user removed');
    }
    
    // Test registration via registerUser method (from SimpleTelegramBot)
    console.log('\n🔄 Step 2: Testing registerUser method...');
    
    const mockCtx = {
      from: testTelegramUser
    };
    
    let newUser;
    try {
      newUser = await User.query().insert({
        telegram_id: testTelegramUser.id.toString(),
        email: `telegram_${testTelegramUser.id}@telegram.local`,
        first_name: testTelegramUser.first_name || 'User',
        last_name: testTelegramUser.last_name || '',
        phone: '',
        role: 'client',
        timezone: 'America/New_York',
        preferences: JSON.stringify({
          notificationTelegram: true
        }),
        email_notifications: true,
        sms_notifications: false,
        is_active: true
      });
      
      console.log('   ✅ User registration successful');
      console.log('   New user ID:', newUser.id);
      console.log('   New user telegram_id:', newUser.telegram_id, '(type:', typeof newUser.telegram_id, ')');
      
    } catch (error) {
      console.error('   ❌ User registration failed:', error.message);
      if (error.message.includes('no column named')) {
        console.error('   💡 Hint: Missing database columns. Run migrations.');
      }
      console.error('   Full error:', error);
    }
    
    // Test getUser method
    if (newUser) {
      console.log('\n🔍 Step 3: Testing getUser method...');
      
      // Test with number (like real Telegram ID)
      console.log('   Testing with number ID:', testTelegramUser.id);
      let foundUserNumber;
      try {
        foundUserNumber = await User.query()
          .where('telegram_id', testTelegramUser.id.toString())
          .first();
        console.log('   Found user (number search):', !!foundUserNumber);
        
        if (foundUserNumber) {
          console.log('   Found user telegram_id:', foundUserNumber.telegram_id, '(type:', typeof foundUserNumber.telegram_id, ')');
        }
      } catch (error) {
        console.error('   ❌ Number search failed:', error.message);
      }
      
      // Test with string (converted)
      console.log('   Testing with string ID:', testTelegramUser.id.toString());
      let foundUserString;
      try {
        foundUserString = await User.query()
          .where('telegram_id', testTelegramUser.id.toString())
          .first();
        console.log('   Found user (string search):', !!foundUserString);
        
        if (foundUserString) {
          console.log('   Found user telegram_id:', foundUserString.telegram_id, '(type:', typeof foundUserString.telegram_id, ')');
        }
      } catch (error) {
        console.error('   ❌ String search failed:', error.message);
      }
      
      // Test exact match
      if (foundUserString) {
        console.log('\n✅ User lookup successful!');
        console.log('   Lookup works correctly');
      } else {
        console.log('\n❌ User lookup failed!');
        console.log('   This indicates the issue');
      }
    }
    
  } catch (error) {
    console.error('❌ User registration test failed:', error.message);
    console.error('Full error:', error);
  }
}

async function testDataTypeMatching() {
  console.log('\n🔬 Testing Data Type Matching...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Get all users with telegram_id
    const telegramUsers = await User.query()
      .whereNotNull('telegram_id')
      .limit(5);
    
    if (telegramUsers.length > 0) {
      console.log(`📊 Found ${telegramUsers.length} users with telegram_id:`);
      
      telegramUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ID: ${user.id} | telegram_id: "${user.telegram_id}" (type: ${typeof user.telegram_id})`);
      });
      
      // Test different query patterns
      console.log('\n🧪 Testing query patterns:');
      
      const testId = telegramUsers[0].telegram_id;
      console.log(`   Using test ID: ${testId} (type: ${typeof testId})`);
      
      // Pattern 1: Direct string match
      const result1 = await User.query().where('telegram_id', testId).first();
      console.log(`   Direct match: ${!!result1}`);
      
      // Pattern 2: Number to string conversion
      const numericId = parseInt(testId);
      if (!isNaN(numericId)) {
        const result2 = await User.query().where('telegram_id', numericId.toString()).first();
        console.log(`   Number->String match: ${!!result2}`);
        
        // Pattern 3: Raw number (should fail if stored as string)
        const result3 = await User.query().where('telegram_id', numericId).first();
        console.log(`   Raw number match: ${!!result3}`);
      }
      
    } else {
      console.log('📭 No users with telegram_id found for testing');
    }
    
  } catch (error) {
    console.error('❌ Data type matching test failed:', error.message);
  }
}

async function identifyIssues() {
  console.log('\n🔍 Issue Identification Summary...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Check if required columns exist
    const hasUsersTable = await knex.schema.hasTable('users');
    let hasTelegramId = false;
    
    if (hasUsersTable) {
      hasTelegramId = await knex.schema.hasColumn('users', 'telegram_id');
    }
    
    console.log('✅ Diagnosis Results:');
    console.log(`   • Users table exists: ${hasUsersTable}`);
    console.log(`   • telegram_id column exists: ${hasTelegramId}`);
    
    if (!hasUsersTable) {
      console.log('\n❌ CRITICAL: Users table is missing');
      console.log('   🔧 Solution: Run database migrations');
      console.log('   Command: npm run migrate:latest');
    } else if (!hasTelegramId) {
      console.log('\n❌ CRITICAL: telegram_id column is missing');
      console.log('   🔧 Solution: Run telegram field migration');
      console.log('   Command: npm run migrate:latest');
    } else {
      console.log('\n✅ Database schema appears correct');
      
      // Check for data consistency
      const totalUsers = await User.query().count('* as count').first();
      const telegramUsers = await User.query().whereNotNull('telegram_id').count('* as count').first();
      
      console.log(`   • Total users: ${totalUsers.count}`);
      console.log(`   • Users with telegram_id: ${telegramUsers.count}`);
      
      if (totalUsers.count > 0 && telegramUsers.count === 0) {
        console.log('\n⚠️  WARNING: Users exist but none have telegram_id');
        console.log('   💡 This suggests registration is not working');
      }
    }
    
    // Test the User model methods
    console.log('\n🧪 Testing User model methods:');
    
    try {
      const testResult = await User.findByTelegramId('123456789');
      console.log('   • findByTelegramId method works:', testResult === null || !!testResult);
    } catch (error) {
      console.log('   • findByTelegramId method error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Issue identification failed:', error.message);
  }
}

async function generateRecommendations() {
  console.log('\n💡 Recommendations...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('Based on the analysis, here are the recommended fixes:');
  console.log('');
  console.log('1️⃣  DATABASE SETUP:');
  console.log('   • Ensure all migrations are run: npm run migrate:latest');
  console.log('   • Verify telegram_id column exists and is indexed');
  console.log('');
  console.log('2️⃣  DATA TYPE CONSISTENCY:');
  console.log('   • Store telegram_id as string (current approach is correct)');
  console.log('   • Always convert Telegram ID to string in queries: telegramId.toString()');
  console.log('');
  console.log('3️⃣  CODE FIXES:');
  console.log('   • Check registerUser() method in SimpleTelegramBot.js');
  console.log('   • Verify getUser() method converts ID to string');
  console.log('   • Add error handling for missing users');
  console.log('');
  console.log('4️⃣  TESTING:');
  console.log('   • Test /start command manually with Telegram');
  console.log('   • Verify user is created in database');
  console.log('   • Test subsequent lookups work correctly');
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  
  try {
    // Remove test user if exists
    await User.query()
      .where('telegram_id', '12345678')
      .orWhere('email', 'telegram_12345678@telegram.local')
      .delete();
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.log('⚠️  Cleanup warning:', error.message);
  }
  
  if (knex) {
    await knex.destroy();
    console.log('✅ Database connection closed');
  }
}

async function runDebugScript() {
  console.log('🚀 User Registration & Lookup Debug Script');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('This script will test and debug the user registration flow');
  console.log('to identify where the user lookup fails.\n');
  
  try {
    await initializeDatabase();
    await debugDatabaseSchema();
    await testUserRegistration();
    await testDataTypeMatching();
    await identifyIssues();
    await generateRecommendations();
  } catch (error) {
    console.error('\n💥 Debug script failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await cleanup();
  }
  
  console.log('\n🏁 Debug script completed.');
  console.log('═══════════════════════════════════════════════════════════════');
}

// Run the script
if (require.main === module) {
  runDebugScript().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runDebugScript };