#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
// const TelegramBot = require('./SimpleTelegramBot');
const TelegramBot = require('./EnhancedTelegramBot'); // Using enhanced version with conflict detection

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

// Validate support system configuration
function validateSupportConfig() {
  const supportEnabled = process.env.SUPPORT_SYSTEM_ENABLED === 'true';
  
  if (supportEnabled) {
    if (!process.env.SUPPORT_GROUP_ID) {
      console.warn('⚠️  Warning: SUPPORT_SYSTEM_ENABLED is true but SUPPORT_GROUP_ID is not set');
      console.log('Live support features will be disabled until configured properly.');
      return false;
    }
    
    console.log('✅ Support system configuration validated');
    console.log(`   Support Group ID: ${process.env.SUPPORT_GROUP_ID}`);
    console.log(`   Anonymize Data: ${process.env.SUPPORT_ANONYMIZE_DATA || 'true'}`);
    console.log(`   Max Tickets: ${process.env.SUPPORT_MAX_TICKETS || '50'}`);
    return true;
  }
  
  console.log('ℹ️  Support system is disabled');
  return false;
}

const supportConfigValid = validateSupportConfig();

console.log('🚀 Starting Appointment Scheduler Telegram Bot...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Initialize database
const { Model } = require('objection');
const Knex = require('knex');
const knexConfig = require('../../database/knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

// Prepare bot configuration with support system settings
const botConfig = {
  supportGroupId: process.env.SUPPORT_GROUP_ID,
  supportEnabled: supportConfigValid,
  anonymizeUserData: process.env.SUPPORT_ANONYMIZE_DATA === 'true',
  maxSupportTickets: parseInt(process.env.SUPPORT_MAX_TICKETS) || 50,
  ticketTimeoutMinutes: parseInt(process.env.SUPPORT_TICKET_TIMEOUT) || 30,
  autoEscalateMinutes: parseInt(process.env.SUPPORT_AUTO_ESCALATE) || 60,
  adminUserIds: process.env.ADMIN_USER_IDS ? 
    process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : []
};

console.log('🔧 Bot Configuration:');
console.log(`   Support Enabled: ${botConfig.supportEnabled}`);
if (botConfig.supportEnabled) {
  console.log(`   Support Group: ${botConfig.supportGroupId}`);
  console.log(`   Max Tickets: ${botConfig.maxSupportTickets}`);
  console.log(`   Admin Users: ${botConfig.adminUserIds.length} configured`);
}

// Start the bot
const bot = new TelegramBot(botConfig);
bot.start();

console.log('✅ Bot is running!');
console.log('Open Telegram and search for your bot to start using it.');
console.log('Press Ctrl+C to stop the bot.');