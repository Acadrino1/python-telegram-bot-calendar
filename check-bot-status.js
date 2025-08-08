#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

async function checkBotStatus() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
    return;
  }
  
  try {
    // Get bot info
    const meResponse = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    const botInfo = meResponse.data.result;
    
    console.log('✅ Bot Status: ACTIVE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🤖 Bot Name: ${botInfo.first_name}`);
    console.log(`📛 Username: @${botInfo.username}`);
    console.log(`🆔 Bot ID: ${botInfo.id}`);
    console.log(`💬 Can Join Groups: ${botInfo.can_join_groups ? 'Yes' : 'No'}`);
    console.log(`📖 Can Read All Messages: ${botInfo.can_read_all_group_messages ? 'Yes' : 'No'}`);
    console.log(`🔗 Bot URL: https://t.me/${botInfo.username}`);
    
    // Get webhook info
    const webhookResponse = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const webhookInfo = webhookResponse.data.result;
    
    console.log('\n📡 Connection Info:');
    console.log(`   Mode: ${webhookInfo.url ? 'Webhook' : 'Long Polling'}`);
    if (webhookInfo.pending_update_count > 0) {
      console.log(`   ⚠️ Pending Updates: ${webhookInfo.pending_update_count}`);
    }
    
    // Get recent updates to check activity
    const updatesResponse = await axios.get(`https://api.telegram.org/bot${token}/getUpdates?limit=5`);
    const updates = updatesResponse.data.result;
    
    if (updates.length > 0) {
      console.log(`\n📊 Recent Activity: ${updates.length} recent updates`);
      
      // Count message types
      let messages = 0, callbacks = 0, others = 0;
      updates.forEach(update => {
        if (update.message) messages++;
        else if (update.callback_query) callbacks++;
        else others++;
      });
      
      if (messages > 0) console.log(`   💬 Messages: ${messages}`);
      if (callbacks > 0) console.log(`   🔘 Callbacks: ${callbacks}`);
      if (others > 0) console.log(`   📦 Other: ${others}`);
    }
    
    console.log('\n✅ Bot is operational and ready to receive messages!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📱 Test the bot:');
    console.log(`   1. Open Telegram`);
    console.log(`   2. Go to: https://t.me/${botInfo.username}`);
    console.log(`   3. Send /start to begin`);
    console.log(`   4. Try /book to make an appointment`);
    console.log(`   5. Use /help for all commands`);
    
  } catch (error) {
    console.error('❌ Error checking bot status:', error.message);
    if (error.response && error.response.data) {
      console.error('Details:', error.response.data);
    }
  }
}

checkBotStatus();