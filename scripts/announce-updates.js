/**
 * Announcement: System Updates & New Payment Options
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = '-1002174429964';
const TOPIC_ID = 7394;

async function sendAnnouncement() {
  console.log('📢 Sending system update announcement...');

  const bot = new Telegraf(BOT_TOKEN);

  const message = `🎉 *System Update — December 2024*

We're excited to announce major improvements to Lodge Mobile's booking system!

*🔐 New Payment Options*
• Secure XMR (Monero) checkout now live
• Enhanced payment tracking & confirmation
• View your complete payment history in-app

*🎁 Automated Coupon Giveaways*
• Random discount coupons dropped throughout the week
• Exclusive savings for active community members
• Automatic notifications when you win
• Limited-time offers — first come, first served!

*📱 Enhanced Booking Experience*
• Faster appointment scheduling
• Real-time availability updates
• Improved customer support system
• Better notification management

*🆕 Ready to Get Started?*
Book your TELUS activation or mobile service appointment today!

━━━━━━━━━━━━━━━━━━━━

_Powered by Lodge Mobile • Secure • Private • Fast_`;

  try {
    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: 'Markdown',
      message_thread_id: TOPIC_ID,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Book TELUS Activation Now', url: 'https://t.me/Lodge_client_scheduler_bot?start=book' }],
          [
            { text: '📋 View Services', url: 'https://t.me/Lodge_client_scheduler_bot?start=services' },
            { text: '💬 Get Support', url: 'https://t.me/Lodge_client_scheduler_bot?start=support' }
          ]
        ]
      }
    });

    console.log('✅ Announcement sent successfully to topic ' + TOPIC_ID);

  } catch (error) {
    console.error('❌ Failed to send announcement:', error.message);
    if (error.description) {
      console.error('   Description:', error.description);
    }
  }

  process.exit(0);
}

sendAnnouncement();
