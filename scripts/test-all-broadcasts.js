/**
 * Smoke test - Send all broadcast message types to the channel
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.BROADCAST_CHAT_ID || '-1002174429964';
const TOPIC_ID = parseInt(process.env.BROADCAST_TOPIC_ID || '7394');

async function testAllBroadcasts() {
  console.log('🧪 Running broadcast smoke tests...\n');

  const bot = new Telegraf(BOT_TOKEN);

  const options = {
    parse_mode: 'Markdown',
    message_thread_id: TOPIC_ID
  };

  try {
    // Test 1: Remaining slots - LAST SLOT
    console.log('1️⃣ Testing: Last slot available message...');
    await bot.telegram.sendMessage(CHAT_ID,
      `⚡ *Booking Update*\n\n` +
      `*LAST SLOT AVAILABLE* for Dec 10, 2024!\n\n` +
      `📱 Service: Lodge Service\n` +
      `📅 Date: Dec 10, 2024\n\n` +
      `_Don't miss out! Book your slot now:_\n` +
      `Use /start to get started 🚀`,
      options
    );
    console.log('   ✅ Sent!\n');
    await sleep(1000);

    // Test 2: Remaining slots - 2 slots left
    console.log('2️⃣ Testing: 2 slots left message...');
    await bot.telegram.sendMessage(CHAT_ID,
      `🔥 *Booking Update*\n\n` +
      `Only *2 slots left* for Dec 11, 2024!\n\n` +
      `📱 Service: Lodge Service\n` +
      `📅 Date: Dec 11, 2024\n\n` +
      `_Don't miss out! Book your slot now:_\n` +
      `Use /start to get started 🚀`,
      options
    );
    console.log('   ✅ Sent!\n');
    await sleep(1000);

    // Test 3: Remaining slots - 3 slots left
    console.log('3️⃣ Testing: 3 slots remaining message...');
    await bot.telegram.sendMessage(CHAT_ID,
      `📢 *Booking Update*\n\n` +
      `Only *3 slots remaining* for Dec 12, 2024!\n\n` +
      `📱 Service: Lodge Service\n` +
      `📅 Date: Dec 12, 2024\n\n` +
      `_Don't miss out! Book your slot now:_\n` +
      `Use /start to get started 🚀`,
      options
    );
    console.log('   ✅ Sent!\n');
    await sleep(1000);

    // Test 4: Fully booked
    console.log('4️⃣ Testing: Fully booked message...');
    await bot.telegram.sendMessage(CHAT_ID,
      `🚫 *Booking Update*\n\n` +
      `*FULLY BOOKED* for Dec 13, 2024!\n\n` +
      `📱 Service: Lodge Service\n` +
      `📅 Date: Dec 13, 2024\n\n` +
      `_Don't miss out! Book your slot now:_\n` +
      `Use /start to get started 🚀`,
      options
    );
    console.log('   ✅ Sent!\n');
    await sleep(1000);

    // Test 5: Proof photo broadcast (using a placeholder - text only for test)
    console.log('5️⃣ Testing: Successful appointment message (text version)...');
    await bot.telegram.sendMessage(CHAT_ID,
      `✅ *Another Successful Appointment!*\n\n` +
      `📱 Service: Lodge Service\n` +
      `📅 Date: Dec 06, 2024\n\n` +
      `_Book your appointment today!_\n` +
      `Use /start to get started 🚀\n\n` +
      `_(Note: In production, this includes the proof photo)_`,
      options
    );
    console.log('   ✅ Sent!\n');

    console.log('=' .repeat(50));
    console.log('🎉 All broadcast smoke tests completed!');
    console.log('📱 Check your Telegram channel to verify messages.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.description) {
      console.error('   Description:', error.description);
    }
  }

  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testAllBroadcasts();
