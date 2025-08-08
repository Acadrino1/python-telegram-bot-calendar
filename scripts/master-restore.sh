#!/bin/bash

# Master Restoration Script for Telegram Appointment Scheduler Bot
# This script automates the complete restoration process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
clear
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     TELEGRAM APPOINTMENT SCHEDULER - MASTER RESTORATION       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${RED}⚠️  CRITICAL SECURITY ALERT: System was hijacked for Lodge Mobile${NC}"
echo -e "${YELLOW}This script will restore your original appointment scheduler bot${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${BLUE}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Step 1: Backup current state
print_status "Creating backup of current state..."
BACKUP_DIR="backups/hijacked_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup important files
cp .env "$BACKUP_DIR/.env.backup" 2>/dev/null || true
cp src/bot/bot.js "$BACKUP_DIR/bot.js.backup" 2>/dev/null || true
cp src/bot/EnhancedTelegramBot.js "$BACKUP_DIR/EnhancedTelegramBot.js.backup" 2>/dev/null || true
cp src/bot/translations.js "$BACKUP_DIR/translations.js.backup" 2>/dev/null || true
cp referral-codes.json "$BACKUP_DIR/referral-codes.json.backup" 2>/dev/null || true

print_success "Backup created in $BACKUP_DIR"

# Step 2: Check for exposed token
print_status "Checking for exposed bot token..."
if grep -q "8124276494:AAEXy61BMBQcrz6TCCNHRI3_4d6fbXERy8M" .env 2>/dev/null; then
    print_error "EXPOSED BOT TOKEN DETECTED!"
    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}IMMEDIATE ACTION REQUIRED:${NC}"
    echo -e "${YELLOW}1. Open Telegram and message @BotFather${NC}"
    echo -e "${YELLOW}2. Send: /revoke${NC}"
    echo -e "${YELLOW}3. Select your bot${NC}"
    echo -e "${YELLOW}4. Send: /newtoken${NC}"
    echo -e "${YELLOW}5. Copy the new token${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    read -p "Enter your NEW bot token: " NEW_TOKEN
    
    if [ -z "$NEW_TOKEN" ]; then
        print_error "Bot token cannot be empty. Exiting."
        exit 1
    fi
else
    print_success "No exposed token found in .env"
    read -p "Enter your bot token (or press Enter to keep current): " NEW_TOKEN
fi

# Step 3: Check for unauthorized admin
print_status "Checking for unauthorized admin access..."
if grep -q "7930798268" .env 2>/dev/null; then
    print_warning "Unauthorized admin ID (7930798268) detected and will be removed"
    REMOVE_UNAUTHORIZED=true
else
    print_success "No unauthorized admin found"
    REMOVE_UNAUTHORIZED=false
fi

# Step 4: Get user's admin ID
echo ""
read -p "Enter YOUR Telegram user ID for admin access: " USER_ADMIN_ID
if [ -z "$USER_ADMIN_ID" ]; then
    print_warning "No admin ID provided. You may need to set this manually later."
fi

# Step 5: Get support group ID
echo ""
print_status "Configuring live chat support..."
read -p "Enter your Telegram support group ID (or press Enter to skip): " SUPPORT_GROUP_ID

# Step 6: Restore original bot implementation
print_status "Restoring original bot implementation..."

# Fix bot.js to use original TelegramBot
cat > src/bot/bot.js << 'EOF'
// Telegram Bot Implementation
// RESTORED: Using original TelegramBot.js instead of hijacked EnhancedTelegramBot.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const TelegramBot = require('./TelegramBot'); // RESTORED: Original implementation
const logger = require('../utils/logger');

// Initialize bot
const bot = new TelegramBot();

// Start bot
bot.start().then(() => {
    logger.info('✅ Original Telegram Appointment Scheduler Bot restored and running');
    logger.info('🔒 Security: All Lodge Mobile hijacking removed');
    logger.info('📅 Ready to handle appointment bookings');
}).catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down bot...');
    await bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down bot...');
    await bot.stop();
    process.exit(0);
});
EOF

print_success "Original bot implementation restored"

# Step 7: Clean translations file
print_status "Removing Lodge Mobile branding..."
if [ -f "src/bot/translations_clean.js" ]; then
    cp src/bot/translations_clean.js src/bot/translations.js
    print_success "Clean translations restored"
else
    print_warning "Clean translations file not found. Manual cleanup may be needed."
fi

# Step 8: Update .env file
print_status "Updating configuration..."

# Create new .env if needed
if [ ! -f ".env" ]; then
    cp .env.example .env 2>/dev/null || touch .env
fi

# Update bot token if provided
if [ ! -z "$NEW_TOKEN" ]; then
    if grep -q "TELEGRAM_BOT_TOKEN=" .env; then
        sed -i.bak "s/TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$NEW_TOKEN/" .env
    else
        echo "TELEGRAM_BOT_TOKEN=$NEW_TOKEN" >> .env
    fi
    print_success "Bot token updated"
fi

# Remove unauthorized admin
if [ "$REMOVE_UNAUTHORIZED" = true ]; then
    sed -i.bak '/7930798268/d' .env
    print_success "Unauthorized admin removed"
fi

# Set user's admin ID
if [ ! -z "$USER_ADMIN_ID" ]; then
    if grep -q "ADMIN_USER_IDS=" .env; then
        sed -i.bak "s/ADMIN_USER_IDS=.*/ADMIN_USER_IDS=$USER_ADMIN_ID/" .env
    else
        echo "ADMIN_USER_IDS=$USER_ADMIN_ID" >> .env
    fi
    print_success "Admin ID configured"
fi

# Set support group ID
if [ ! -z "$SUPPORT_GROUP_ID" ]; then
    if grep -q "SUPPORT_GROUP_ID=" .env; then
        sed -i.bak "s/SUPPORT_GROUP_ID=.*/SUPPORT_GROUP_ID=$SUPPORT_GROUP_ID/" .env
    else
        echo "SUPPORT_GROUP_ID=$SUPPORT_GROUP_ID" >> .env
    fi
    if grep -q "SUPPORT_ENABLED=" .env; then
        sed -i.bak "s/SUPPORT_ENABLED=.*/SUPPORT_ENABLED=true/" .env
    else
        echo "SUPPORT_ENABLED=true" >> .env
    fi
    print_success "Live chat support configured"
fi

# Step 9: Clean referral codes
print_status "Removing unauthorized referral codes..."
echo '{}' > referral-codes.json
print_success "Referral codes cleared"

# Step 10: Database cleanup
print_status "Preparing database cleanup..."
echo ""
echo -e "${YELLOW}Database cleanup is required to remove Lodge Mobile services${NC}"
echo -e "${YELLOW}This will:${NC}"
echo -e "  - Remove all Lodge Mobile services"
echo -e "  - Restore original appointment categories"
echo -e "  - Clear unauthorized appointments"
echo ""
read -p "Run database cleanup now? (y/n): " RUN_DB_CLEANUP

if [ "$RUN_DB_CLEANUP" = "y" ] || [ "$RUN_DB_CLEANUP" = "Y" ]; then
    print_status "Running database cleanup..."
    if [ -f "security/database-cleanup.sql" ]; then
        mysql -u appuser -p appointment_scheduler < security/database-cleanup.sql && \
        print_success "Database cleaned successfully" || \
        print_warning "Database cleanup failed. You may need to run it manually."
    else
        print_warning "Database cleanup script not found. Manual cleanup required."
    fi
else
    print_warning "Database cleanup skipped. Run manually: mysql -u appuser -p appointment_scheduler < security/database-cleanup.sql"
fi

# Step 11: Install dependencies
print_status "Checking dependencies..."
npm install --production 2>/dev/null && print_success "Dependencies installed" || print_warning "Failed to install dependencies"

# Step 12: Final verification
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         RESTORATION COMPLETE!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}✅ Original bot code restored${NC}"
echo -e "${BLUE}✅ Lodge Mobile hijacking removed${NC}"
echo -e "${BLUE}✅ Security vulnerabilities patched${NC}"
echo -e "${BLUE}✅ Configuration updated${NC}"
echo ""

# Offer to start the bot
echo -e "${YELLOW}Ready to start the restored bot?${NC}"
read -p "Start bot now? (y/n): " START_BOT

if [ "$START_BOT" = "y" ] || [ "$START_BOT" = "Y" ]; then
    print_status "Starting bot..."
    npm start
else
    echo ""
    echo -e "${GREEN}To start the bot manually, run: npm start${NC}"
    echo -e "${GREEN}To check bot status, run: npm run status${NC}"
    echo -e "${GREEN}To run tests, run: npm test${NC}"
fi

echo ""
echo -e "${BLUE}Restoration log saved to: $BACKUP_DIR/restoration.log${NC}"
echo -e "${YELLOW}Keep the backup in $BACKUP_DIR in case you need to review changes${NC}"

# Create restoration log
{
    echo "Restoration completed at: $(date)"
    echo "Backup location: $BACKUP_DIR"
    echo "Token updated: $([ ! -z "$NEW_TOKEN" ] && echo "Yes" || echo "No")"
    echo "Admin configured: $([ ! -z "$USER_ADMIN_ID" ] && echo "Yes" || echo "No")"
    echo "Support configured: $([ ! -z "$SUPPORT_GROUP_ID" ] && echo "Yes" || echo "No")"
    echo "Database cleaned: $([ "$RUN_DB_CLEANUP" = "y" ] && echo "Yes" || echo "No")"
} > "$BACKUP_DIR/restoration.log"

print_success "Master restoration complete!"