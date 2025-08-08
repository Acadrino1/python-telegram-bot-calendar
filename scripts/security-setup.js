#!/usr/bin/env node

/**
 * Security Setup Script
 * Helps configure secure environment and fixes critical vulnerabilities
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SecurityPatches = require('../security/security-patches');

console.log('🔒 Appointment Scheduler Security Setup');
console.log('=====================================\n');

async function main() {
  try {
    // 1. Check current security status
    console.log('📊 Performing security audit...\n');
    
    const currentEnv = loadEnvironmentConfig();
    const audit = SecurityPatches.performSecurityAudit(currentEnv);
    
    console.log(`Security Audit Results:`);
    console.log(`- Total Issues: ${audit.total_issues}`);
    console.log(`- Critical: ${audit.critical_issues}`);
    console.log(`- High: ${audit.high_issues}`);
    console.log(`- Medium: ${audit.medium_issues}\n`);
    
    if (audit.critical_issues > 0) {
      console.log('🚨 CRITICAL ISSUES FOUND:');
      audit.issues.filter(i => i.severity === 'critical').forEach(issue => {
        console.log(`   - ${issue.issue}`);
        console.log(`     → ${issue.remediation}\n`);
      });
    }
    
    // 2. Generate secure configuration
    console.log('🔧 Generating secure configuration...\n');
    
    const secureConfig = SecurityPatches.generateSecureEnvironmentConfig();
    
    console.log('Generated secure values:');
    console.log(`- New JWT Secret: ${secureConfig.JWT_SECRET.substring(0, 20)}...`);
    console.log(`- New Session Secret: ${secureConfig.SESSION_SECRET.substring(0, 16)}...`);
    console.log(`- New API Key: ${secureConfig.API_KEY.substring(0, 16)}...`);
    console.log(`- Bot Token Placeholder: ${secureConfig.TELEGRAM_BOT_TOKEN}\n`);
    
    // 3. Create secure .env file
    const secureEnvPath = path.join(__dirname, '../.env.secure');
    await createSecureEnvFile(secureEnvPath, secureConfig);
    
    console.log(`✅ Secure environment file created: ${secureEnvPath}\n`);
    
    // 4. Generate security report
    const report = SecurityPatches.generateSecurityReport();
    const reportPath = path.join(__dirname, '../security/security-report.json');
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📋 Security report generated: ${reportPath}\n`);
    
    // 5. Display critical actions required
    console.log('🚨 CRITICAL ACTIONS REQUIRED:');
    console.log('============================');
    console.log('1. IMMEDIATELY generate a new Telegram bot token:');
    console.log('   - Message @BotFather on Telegram');
    console.log('   - Use /revoke to revoke the old token');
    console.log('   - Use /newtoken to generate a new token');
    console.log('   - Replace TELEGRAM_BOT_TOKEN in your .env file\n');
    
    console.log('2. Remove unauthorized admin access:');
    console.log('   - The user ID 7930798268 has unauthorized access');
    console.log('   - Remove this ID from ADMIN_USER_IDS');
    console.log('   - Verify your actual admin user IDs\n');
    
    console.log('3. Configure live chat support:');
    console.log('   - Create a Telegram group for support');
    console.log('   - Add your bot to the group as admin');
    console.log('   - Get the group ID and set SUPPORT_GROUP_ID\n');
    
    console.log('4. Run database cleanup:');
    console.log('   - Backup your database first!');
    console.log('   - Run: mysql -u appuser -p appointment_scheduler < security/database-cleanup.sql\n');
    
    console.log('5. Update application configuration:');
    console.log('   - Copy .env.secure to .env');
    console.log('   - Update all placeholder values');
    console.log('   - Restart your application\n');
    
    console.log('6. Enable rate limiting:');
    console.log('   - Import rate-limiting-middleware.js in your routes');
    console.log('   - Apply appropriate limiters to endpoints\n');
    
    console.log('✅ Security setup completed!');
    console.log('📖 Review the security report for detailed recommendations.');
    
  } catch (error) {
    console.error('❌ Security setup failed:', error.message);
    process.exit(1);
  }
}

function loadEnvironmentConfig() {
  const envPath = path.join(__dirname, '../.env');
  const config = {};
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        config[key] = valueParts.join('=');
      }
    });
  }
  
  return config;
}

async function createSecureEnvFile(filePath, config) {
  const template = `# SECURE ENVIRONMENT CONFIGURATION
# Generated on ${new Date().toISOString()}
# =====================================

# CRITICAL: Update all placeholder values before using!

# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration (UPDATE THESE!)
DB_HOST=localhost
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=${config.DB_PASSWORD}
DB_NAME=appointment_scheduler

# JWT Configuration
JWT_SECRET=${config.JWT_SECRET}
JWT_EXPIRES_IN=7d

# Session Security
SESSION_SECRET=${config.SESSION_SECRET}

# API Security
API_KEY=${config.API_KEY}
API_KEY_REQUIRED=true

# Telegram Bot Configuration
# CRITICAL: Get new token from @BotFather!
TELEGRAM_BOT_TOKEN=${config.TELEGRAM_BOT_TOKEN}
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_PORT=3001
TELEGRAM_ADMIN_ID=YOUR_TELEGRAM_USER_ID

# Live Chat Support (CONFIGURE THESE!)
SUPPORT_SYSTEM_ENABLED=true
SUPPORT_GROUP_ID=YOUR_TELEGRAM_GROUP_ID
SUPPORT_ANONYMIZE_DATA=true
SUPPORT_MAX_TICKETS=50

# Admin Configuration (NO UNAUTHORIZED IDS!)
ADMIN_USER_IDS=YOUR_AUTHORIZED_ADMIN_IDS

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=${config.RATE_LIMIT_MAX_REQUESTS}
RATE_LIMIT_MAX_REQUESTS_PER_IP=${config.RATE_LIMIT_MAX_REQUESTS_PER_IP}

# Security Features
SECURITY_HEADERS_ENABLED=true
CSRF_PROTECTION_ENABLED=true

# Email Configuration (UPDATE THESE!)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Additional Settings
TIMEZONE=America/New_York
LOG_LEVEL=info
`;

  fs.writeFileSync(filePath, template);
}

if (require.main === module) {
  main();
}

module.exports = { main };