#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// RESTORED: Use original clean TelegramBot implementation
const TelegramBot = require('./TelegramBot');

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

console.log('🚀 Starting Appointment Scheduler Telegram Bot...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Initialize database
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../../database/knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

console.log('🔧 Bot Configuration:');
console.log('   Mode: Multi-category appointment booking');
console.log('   Categories: Medical, Beauty, Dental, Wellness, Fitness, Consultation');
console.log('   Access: Open (no referral codes required)');
console.log('   Branding: Generic appointment scheduler');

// Start the bot with original implementation
const bot = new TelegramBot();
bot.start();

console.log('✅ Appointment Scheduler Bot is running!');
console.log('🏥 Available service categories:');
console.log('   🏥 Medical appointments');
console.log('   💅 Beauty services');  
console.log('   🦷 Dental appointments');
console.log('   💆 Wellness treatments');
console.log('   🏋️ Fitness sessions');
console.log('   📚 Consultations');
console.log('');
console.log('Open Telegram and search for your bot to start booking appointments.');
console.log('Press Ctrl+C to stop the bot.');