#!/usr/bin/env node

const axios = require('axios');

async function checkBotHealth() {
  try {
    // Check if bot process is running
    const { execSync } = require('child_process');
    const processes = execSync('ps aux | grep node | grep bot').toString();
    
    if (processes.includes('bot.js') || processes.includes('start-bot-only.js')) {
      console.log('✅ Bot process is running');
      
      // Check memory usage
      const pidMatch = processes.match(/\d+/);
      if (pidMatch) {
        const pid = pidMatch[0];
        const memInfo = execSync(`ps -o pid,vsz,rss,comm -p ${pid}`).toString();
        console.log('Memory usage:', memInfo);
      }
    } else {
      console.log('❌ Bot process is not running');
      console.log('Starting bot...');
      execSync('npm run bot:start', { stdio: 'inherit' });
    }
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

checkBotHealth();
