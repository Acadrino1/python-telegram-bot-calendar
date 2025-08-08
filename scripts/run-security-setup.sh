#!/bin/bash

# Security Setup and Database Cleanup Script
# ==========================================
# This script performs comprehensive security fixes for the appointment scheduler

echo "🔒 Starting Security Setup and Database Cleanup"
echo "================================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Create security directory if it doesn't exist
mkdir -p security
mkdir -p logs

echo "📋 Step 1: Running security audit and setup..."
node scripts/security-setup.js

echo ""
echo "🗄️  Step 2: Database cleanup (requires manual confirmation)"
echo "WARNING: This will remove Lodge Mobile contamination from the database"
echo "Make sure to backup your database first!"
echo ""
read -p "Do you want to proceed with database cleanup? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Proceeding with database cleanup..."
    
    # Check if MySQL is available
    if command -v mysql &> /dev/null; then
        echo "Found MySQL client"
        echo "Please enter your database credentials:"
        read -p "Database user (default: appuser): " DB_USER
        DB_USER=${DB_USER:-appuser}
        read -p "Database name (default: appointment_scheduler): " DB_NAME  
        DB_NAME=${DB_NAME:-appointment_scheduler}
        
        echo "Running database cleanup script..."
        mysql -u "$DB_USER" -p "$DB_NAME" < security/database-cleanup.sql
        
        if [ $? -eq 0 ]; then
            echo "✅ Database cleanup completed successfully"
        else
            echo "❌ Database cleanup failed. Please run manually:"
            echo "mysql -u $DB_USER -p $DB_NAME < security/database-cleanup.sql"
        fi
    else
        echo "⚠️  MySQL client not found. Please run the cleanup manually:"
        echo "mysql -u appuser -p appointment_scheduler < security/database-cleanup.sql"
    fi
else
    echo "Skipping database cleanup. You can run it manually later:"
    echo "mysql -u appuser -p appointment_scheduler < security/database-cleanup.sql"
fi

echo ""
echo "🔧 Step 3: Updating environment configuration..."

# Backup current .env file
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Current .env backed up"
fi

# Copy secure configuration
if [ -f "security/.env.secure" ]; then
    echo "⚠️  Please manually review and update the secure .env file:"
    echo "   1. Copy security/.env.secure to .env"
    echo "   2. Update all placeholder values"
    echo "   3. Generate new Telegram bot token from @BotFather"
    echo "   4. Configure live chat support group ID"
else
    echo "❌ Secure .env template not found"
fi

echo ""
echo "🚨 CRITICAL MANUAL ACTIONS REQUIRED:"
echo "===================================="
echo ""
echo "1. 🤖 TELEGRAM BOT TOKEN (CRITICAL):"
echo "   - The current token 8124276494:AAEXy61BMBQcrz6TCCNHRI3_4d6fbXERy8M is COMPROMISED"
echo "   - Message @BotFather on Telegram"
echo "   - Use /revoke to revoke the old token"
echo "   - Use /newtoken to generate a new token"
echo "   - Update TELEGRAM_BOT_TOKEN in your .env file"
echo ""
echo "2. 👥 REMOVE UNAUTHORIZED ADMIN:"
echo "   - User ID 7930798268 has unauthorized admin access"
echo "   - Ensure this ID is NOT in ADMIN_USER_IDS"
echo "   - Set your own Telegram user ID as admin"
echo ""
echo "3. 💬 CONFIGURE LIVE CHAT:"
echo "   - Create a Telegram group for customer support"
echo "   - Add your bot to the group as administrator"
echo "   - Get the group ID (negative number like -1001234567890)"
echo "   - Set SUPPORT_GROUP_ID in your .env file"
echo ""
echo "4. 🔐 UPDATE ALL CREDENTIALS:"
echo "   - Review security/.env.secure"
echo "   - Replace all placeholder values"
echo "   - Use strong, unique passwords"
echo "   - Enable 2FA where possible"
echo ""
echo "5. 🔄 RESTART SERVICES:"
echo "   - Stop all running processes"
echo "   - Update .env with secure configuration"
echo "   - npm run start:all"
echo ""

echo "📊 Security setup completed!"
echo "Review the security report in security/security-report.json"
echo ""
echo "⚠️  Remember: The system is NOT secure until you complete the manual actions above!"

exit 0