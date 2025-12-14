#!/bin/bash

# Test script for restored bot
echo "🧪 Testing Restored Bot..."
echo "=========================="

# Check if dependencies are installed
echo "📦 Checking dependencies..."
npm list telegraf sqlite3 moment uuid dotenv 2>/dev/null || {
    echo "⚠️  Installing required dependencies..."
    npm install telegraf sqlite3 moment uuid dotenv
}

# Check environment
if [ ! -f .env ]; then
    echo "❌ Missing .env file!"
    echo "Creating template .env file..."
    cat > .env << EOF
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_FROM_BOTFATHER
ADMIN_TELEGRAM_ID=7930798268
DB_PATH=./lodge-scheduler.db
EOF
    echo "⚠️  Please edit .env file with your bot token"
    exit 1
fi

# Run the restored bot
echo ""
echo "🚀 Starting restored bot..."
echo "Memory before: $(ps aux | grep node | awk '{print $6}' | head -1) KB"
echo ""

node src/bot/restored-simple-bot.js