#!/usr/bin/env node

/**
 * Telegram Bot UI Restoration Script
 * 
 * This script restores the original appointment scheduler bot UI
 * by reverting the hijacked Lodge Mobile branding back to the
 * original multi-category appointment system.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Starting Telegram Bot UI Restoration...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const botDir = path.join(__dirname, '../src/bot');
const botFile = path.join(botDir, 'bot.js');
const hijackedBot = path.join(botDir, 'EnhancedTelegramBot.js');
const translationsFile = path.join(botDir, 'translations.js');
const cleanTranslations = path.join(botDir, 'translations_clean.js');

// Step 1: Backup hijacked files
console.log('📦 Creating backups of hijacked files...');
try {
  if (fs.existsSync(hijackedBot)) {
    fs.copyFileSync(hijackedBot, `${hijackedBot}.hijacked.backup`);
    console.log('   ✅ Backed up EnhancedTelegramBot.js');
  }
  
  if (fs.existsSync(translationsFile)) {
    fs.copyFileSync(translationsFile, `${translationsFile}.hijacked.backup`);
    console.log('   ✅ Backed up translations.js');
  }
  
  if (fs.existsSync(botFile)) {
    fs.copyFileSync(botFile, `${botFile}.hijacked.backup`);
    console.log('   ✅ Backed up bot.js');
  }
} catch (error) {
  console.error('❌ Error creating backups:', error.message);
  process.exit(1);
}

// Step 2: Restore bot.js to use original TelegramBot
console.log('\\n🔄 Restoring bot.js to use original TelegramBot...');
const botJsContent = `#!/usr/bin/env node

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
  console.log('\\nTo set up your Telegram bot:');
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
`;

try {
  fs.writeFileSync(botFile, botJsContent);
  console.log('   ✅ Restored bot.js to use original TelegramBot');
} catch (error) {
  console.error('❌ Error restoring bot.js:', error.message);
  process.exit(1);
}

// Step 3: Replace translations with clean version
console.log('\\n🧹 Replacing hijacked translations with clean version...');
if (fs.existsSync(cleanTranslations)) {
  try {
    fs.copyFileSync(cleanTranslations, translationsFile);
    console.log('   ✅ Restored clean translations.js');
  } catch (error) {
    console.error('❌ Error restoring translations:', error.message);
    process.exit(1);
  }
} else {
  console.log('   ⚠️  Clean translations file not found, keeping backup');
}

// Step 4: Disable hijacked bot file
console.log('\\n🚫 Disabling hijacked bot file...');
try {
  if (fs.existsSync(hijackedBot)) {
    fs.renameSync(hijackedBot, `${hijackedBot}.disabled`);
    console.log('   ✅ Renamed EnhancedTelegramBot.js to .disabled');
  }
} catch (error) {
  console.error('❌ Error disabling hijacked bot:', error.message);
  process.exit(1);
}

// Step 5: Verification
console.log('\\n🔍 Verifying restoration...');
const restoredBotContent = fs.readFileSync(botFile, 'utf8');
if (restoredBotContent.includes('TelegramBot') && !restoredBotContent.includes('EnhancedTelegramBot')) {
  console.log('   ✅ Bot file correctly restored');
} else {
  console.log('   ❌ Bot file restoration may have failed');
}

console.log('\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Telegram Bot UI Restoration Complete!');
console.log('\\n📋 Changes Made:');
console.log('   • Restored original multi-category menu system');
console.log('   • Removed Lodge Mobile branding');
console.log('   • Removed unauthorized access control system');
console.log('   • Restored simple booking flow');
console.log('   • Disabled hijacked bot implementation');
console.log('\\n🏥 Restored Service Categories:');
console.log('   • 🏥 Medical appointments');
console.log('   • 💅 Beauty services');
console.log('   • 🦷 Dental appointments'); 
console.log('   • 💆 Wellness treatments');
console.log('   • 🏋️ Fitness sessions');
console.log('   • 📚 Consultations');
console.log('\\n⚠️  Note: Hijacked files have been backed up with .hijacked.backup extension');
console.log('\\n🚀 Restart the bot to apply changes: npm start');
`;

try {
  fs.writeFileSync(path.join(__dirname, '../scripts/restore_bot_ui.js'), scriptContent);
  console.log('Restoration script created successfully');
} catch (error) {
  console.error('Error creating restoration script:', error.message);
}