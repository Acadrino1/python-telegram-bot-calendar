#!/usr/bin/env node

/**
 * Clean Bot Restart Script
 * Restarts the bot with memory cleanup and error fixes
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 Restarting Lodge Scheduler Bot with fixes...\n');

// Kill existing bot process if running
const pidFile = path.join(__dirname, '..', 'bot.pid');
if (fs.existsSync(pidFile)) {
  const pid = fs.readFileSync(pidFile, 'utf8').trim();
  try {
    process.kill(parseInt(pid), 'SIGTERM');
    console.log('✅ Stopped existing bot process');
  } catch (error) {
    console.log('ℹ️ No existing bot process found');
  }
  fs.unlinkSync(pidFile);
}

// Clear node cache
console.log('🧹 Clearing node cache...');
delete require.cache[require.resolve('../start-lodge-bot.js')];

// Set memory optimization environment variables
process.env.NODE_OPTIONS = '--max-old-space-size=512';
process.env.UV_THREADPOOL_SIZE = '4';

console.log('🚀 Starting bot with optimizations...\n');

// Start the bot
const bot = spawn('node', ['start-lodge-bot.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    MEMORY_OPTIMIZED: 'true'
  },
  stdio: 'inherit',
  detached: false
});

// Save PID
fs.writeFileSync(pidFile, bot.pid.toString());

bot.on('error', (error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});

bot.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Bot exited with code ${code}`);
  }
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
});

console.log(`✅ Bot started with PID: ${bot.pid}`);
console.log('📱 Send /start to @Lodge_Scheduler_bot on Telegram\n');

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping bot...');
  bot.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  bot.kill('SIGTERM');
  process.exit(0);
});