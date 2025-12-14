#!/usr/bin/env node

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Created data directory:', dataDir);
}

// Check for bot token
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set in .env file');
  console.log('\nTo set up your Telegram bot:');
  console.log('1. Message @BotFather on Telegram');
  console.log('2. Create a new bot with /newbot');
  console.log('3. Copy the token and add it to .env file');
  console.log('4. Run this script again');
  process.exit(1);
}

// Check for admin Telegram ID (required for booking approval workflow)
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
if (!ADMIN_TELEGRAM_ID) {
  console.warn('⚠️  WARNING: ADMIN_TELEGRAM_ID is not set in .env file');
  console.warn('   Admin approval workflow will NOT work!');
  console.warn('   Bookings will be created but no admin will be notified.');
  console.warn('   To fix: Add ADMIN_TELEGRAM_ID=your_telegram_id to .env file');
  console.warn('');
} else {
  console.log(`✅ Admin Telegram ID configured: ${ADMIN_TELEGRAM_ID}`);
}

console.log('🚀 Starting Lodge Scheduler Bot...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Initialize database with error handling
const { Model } = require('objection');
const Knex = require('knex');

let knex;
const dbClient = process.env.DB_CLIENT || 'sqlite3';

try {
  if (dbClient === 'mysql2') {
    // Use MySQL when running in Docker
    knex = Knex({
      client: 'mysql2',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'appuser',
        password: process.env.DB_PASSWORD || 'apppassword123',
        database: process.env.DB_NAME || 'appointment_scheduler'
      },
      pool: { min: 0, max: 10 }
    });
    Model.knex(knex);
    console.log(`🔗 MySQL database connected (${process.env.DB_HOST}:${process.env.DB_PORT})`);
  } else {
    // Use SQLite for local development
    const dbPath = path.join(__dirname, '../../database/test_lodge_scheduler.sqlite3');
    knex = Knex({
      client: 'sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true
    });
    Model.knex(knex);
    console.log('🔗 Database connected successfully (test_lodge_scheduler.sqlite3)');
  }
} catch (error) {
  console.warn('⚠️  Database connection failed, using fallback:', error.message);

  // Fallback to SQLite database
  const dbPath = path.join(__dirname, '../../lodge_scheduler.sqlite3');
  knex = Knex({
    client: 'sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true
  });
  Model.knex(knex);
  console.log('🔗 SQLite fallback database connected');
}

console.log('🔧 Bot Configuration:');
console.log('   Mode: Lodge Scheduler');
console.log('   Services: Appointment Booking');
console.log('   Access: Open booking system');

// Start the bot - using SimpleTelegramBot directly to avoid memory issues
// EnhancedBotForScale creates overlapping memory management systems causing OOM crashes
const SimpleTelegramBot = require('./SimpleTelegramBot');
const bot = new SimpleTelegramBot();

// Note: SimpleTelegramBot already has EnhancedBotEngine with proper memory management

// Initialize broadcast integration (disabled for now - fix import if needed)
// if (process.env.ENABLE_BROADCASTING === 'true') {
//   const BroadcastIntegration = require('./BroadcastIntegration');
//   const broadcastIntegration = new BroadcastIntegration(bot);
//   broadcastIntegration.initialize().then(() => {

//   }).catch(error => {
//     console.error('Failed to initialize broadcast integration:', error);
//   });
// }

// Start the bot
try {
  bot.start();
} catch (error) {
  console.error('Failed to start bot:', error);
  process.exit(1);
}

console.log('✅ Lodge Scheduler Bot is running!');
console.log('📅 Features:');
console.log('   ✅ Visual calendar display');
console.log('   🟡 Real-time availability');
console.log('   📱 Mobile-optimized interface');
console.log('   🔔 Appointment reminders');
console.log('');
console.log('Open Telegram and message your bot to book appointments.');
console.log('Press Ctrl+C to stop the bot.');