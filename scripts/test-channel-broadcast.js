/**
 * Test script to verify channel broadcast functionality
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.BROADCAST_CHAT_ID || '-1002174429964';
const TOPIC_ID = parseInt(process.env.BROADCAST_TOPIC_ID || '7394');

async function testBroadcast() {
  console.log('Testing channel broadcast...');

  const bot = new Telegraf(BOT_TOKEN);

  try {
    // Send a test text message first
    await bot.telegram.sendMessage(CHAT_ID,
      '✅ *Test Broadcast*\n\n' +
      'This is a test message from Lodge Scheduler Bot.\n\n' +
      '_If you see this, channel broadcasting is working!_',
      {
        parse_mode: 'Markdown',
        message_thread_id: TOPIC_ID
      }
    );

    console.log('✅ Test message sent successfully to topic ' + TOPIC_ID);

  } catch (error) {
    console.error('❌ Failed to send test message:', error.message);
    if (error.description) {
      console.error('   Description:', error.description);
    }
  }

  process.exit(0);
}

testBroadcast();
