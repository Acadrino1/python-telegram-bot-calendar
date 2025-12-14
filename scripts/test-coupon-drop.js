/**
 * Smoke test - Test coupon giveaway system
 * Manually drops a coupon to test the broadcast
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.BROADCAST_CHAT_ID || '-1002174429964';
const TOPIC_ID = parseInt(process.env.BROADCAST_TOPIC_ID || '7394');

// Simulate the coupon drop message
async function testCouponDrop() {
  console.log('🎁 Testing coupon giveaway broadcast...\n');

  const bot = new Telegraf(BOT_TOKEN);

  // Generate a test coupon code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'LODGE-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const amount = Math.random() < 0.6 ? 20 : 25;
  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + 7);
  const expiresFormatted = expiresDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

  const message =
    `🎁 *FLASH GIVEAWAY!*\n\n` +
    `🎟️ Use code: \`${code}\`\n` +
    `💰 Get *$${amount} OFF* your next booking!\n\n` +
    `⏰ Expires: ${expiresFormatted}\n` +
    `📱 First come, first served!\n\n` +
    `_To redeem: Start a booking with /start and enter the code when prompted!_\n\n` +
    `🚀 *Book now before someone else claims it!*`;

  try {
    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'Markdown',
      message_thread_id: TOPIC_ID
    });

    console.log('✅ Coupon giveaway message sent!');
    console.log(`   Code: ${code}`);
    console.log(`   Amount: $${amount} OFF`);
    console.log(`   Expires: ${expiresFormatted}`);
    console.log('\n📱 Check your Telegram channel to verify the message.');

  } catch (error) {
    console.error('❌ Failed to send coupon message:', error.message);
    if (error.description) {
      console.error('   Description:', error.description);
    }
  }

  process.exit(0);
}

testCouponDrop();
