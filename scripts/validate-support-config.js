#!/usr/bin/env node

/**
 * Support System Configuration Validator
 * 
 * This script validates the support system configuration and provides
 * helpful information for administrators setting up the system.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

class SupportConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  addError(message) {
    this.errors.push(message);
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  addInfo(message) {
    this.info.push(message);
  }

  validateEnvironmentVariables() {
    console.log('🔍 Validating environment variables...\n');

    // Required variables
    const requiredVars = {
      'TELEGRAM_BOT_TOKEN': 'Telegram Bot Token',
    };

    // Optional but recommended variables
    const optionalVars = {
      'SUPPORT_GROUP_ID': 'Support Group Chat ID',
      'SUPPORT_SYSTEM_ENABLED': 'Support System Enable Flag',
      'SUPPORT_ANONYMIZE_DATA': 'Data Anonymization Flag',
      'SUPPORT_MAX_TICKETS': 'Maximum Support Tickets',
      'SUPPORT_TICKET_TIMEOUT': 'Ticket Timeout (minutes)',
      'SUPPORT_AUTO_ESCALATE': 'Auto-escalation Timeout (minutes)',
      'ADMIN_USER_IDS': 'Admin User IDs'
    };

    // Check required variables
    for (const [varName, description] of Object.entries(requiredVars)) {
      if (!process.env[varName]) {
        this.addError(`${varName} is required but not set (${description})`);
      } else {
        this.addInfo(`✅ ${varName} is configured`);
      }
    }

    // Check optional variables
    for (const [varName, description] of Object.entries(optionalVars)) {
      if (!process.env[varName]) {
        this.addWarning(`${varName} is not set (${description})`);
      } else {
        this.addInfo(`✅ ${varName} is configured: ${this.maskSensitive(varName, process.env[varName])}`);
      }
    }
  }

  maskSensitive(varName, value) {
    if (varName.includes('TOKEN') || varName.includes('SECRET')) {
      return value.substring(0, 8) + '...' + value.slice(-4);
    }
    return value;
  }

  validateSupportConfiguration() {
    console.log('\n🎯 Validating support system configuration...\n');

    const supportEnabled = process.env.SUPPORT_SYSTEM_ENABLED === 'true';
    const supportGroupId = process.env.SUPPORT_GROUP_ID;

    if (!supportEnabled) {
      this.addWarning('Support system is disabled (SUPPORT_SYSTEM_ENABLED=false)');
      return;
    }

    this.addInfo('✅ Support system is enabled');

    if (!supportGroupId) {
      this.addError('Support system is enabled but SUPPORT_GROUP_ID is not configured');
      return;
    }

    // Validate support group ID format
    if (!supportGroupId.startsWith('-100')) {
      this.addError('SUPPORT_GROUP_ID should start with -100 (Telegram supergroup format)');
    } else {
      this.addInfo('✅ Support Group ID format looks correct');
    }

    // Validate numeric settings
    const numericSettings = {
      'SUPPORT_MAX_TICKETS': { default: 50, min: 1, max: 1000 },
      'SUPPORT_TICKET_TIMEOUT': { default: 30, min: 5, max: 1440 },
      'SUPPORT_AUTO_ESCALATE': { default: 60, min: 10, max: 2880 }
    };

    for (const [setting, config] of Object.entries(numericSettings)) {
      const value = process.env[setting];
      if (value) {
        const numValue = parseInt(value);
        if (isNaN(numValue)) {
          this.addError(`${setting} should be a number, got: ${value}`);
        } else if (numValue < config.min || numValue > config.max) {
          this.addWarning(`${setting}=${numValue} is outside recommended range (${config.min}-${config.max})`);
        } else {
          this.addInfo(`✅ ${setting} is configured: ${numValue}`);
        }
      } else {
        this.addInfo(`ℹ️  ${setting} will use default: ${config.default}`);
      }
    }

    // Validate admin user IDs
    const adminIds = process.env.ADMIN_USER_IDS;
    if (adminIds) {
      const ids = adminIds.split(',').map(id => id.trim());
      let validIds = 0;
      for (const id of ids) {
        if (!/^\d+$/.test(id)) {
          this.addError(`Invalid admin user ID: ${id} (should be numeric)`);
        } else {
          validIds++;
        }
      }
      if (validIds > 0) {
        this.addInfo(`✅ ${validIds} admin user ID(s) configured`);
      }
    } else {
      this.addWarning('No admin user IDs configured (bot will use default admin)');
    }
  }

  validateFileStructure() {
    console.log('\n📁 Validating file structure...\n');

    const requiredFiles = [
      'src/bot/EnhancedTelegramBot.js',
      'src/bot/LiveSupportManager.js',
      'src/bot/translations.js',
      'config.json.example',
      '.env.example'
    ];

    const requiredDirs = [
      'data',
      'src/bot'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        this.addInfo(`✅ Found: ${file}`);
      } else {
        this.addError(`Missing required file: ${file}`);
      }
    }

    for (const dir of requiredDirs) {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        this.addInfo(`✅ Found directory: ${dir}`);
      } else {
        this.addWarning(`Directory not found (will be created): ${dir}`);
      }
    }
  }

  checkDatabaseMigration() {
    console.log('\n🗄️  Checking database migration status...\n');

    const migrationFile = 'database/migrations/005_create_support_system.js';
    const migrationPath = path.join(process.cwd(), migrationFile);

    if (fs.existsSync(migrationPath)) {
      this.addInfo(`✅ Support system migration found: ${migrationFile}`);
      this.addInfo('ℹ️  Remember to run: npm run migrate');
    } else {
      this.addWarning('Support system database migration not found');
      this.addInfo('The support system will use file-based storage');
    }
  }

  generateSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONFIGURATION VALIDATION SUMMARY');
    console.log('='.repeat(60));

    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS (Must be fixed):');
      this.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (Should be addressed):');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    if (this.info.length > 0) {
      console.log('\n✅ INFO:');
      this.info.forEach(info => console.log(`   • ${info}`));
    }

    console.log('\n' + '='.repeat(60));

    if (this.errors.length === 0) {
      console.log('🎉 CONFIGURATION STATUS: READY');
      console.log('\nYour support system is properly configured and ready to use!');
      
      console.log('\n📋 NEXT STEPS:');
      console.log('1. Start the bot: npm run start:bot');
      console.log('2. Test support functionality with /support command');
      console.log('3. Monitor bot logs for any issues');
      console.log('4. Review SUPPORT_SYSTEM_SETUP.md for detailed instructions');
    } else {
      console.log('🚨 CONFIGURATION STATUS: NEEDS ATTENTION');
      console.log('\nPlease fix the errors above before running the bot.');
      
      console.log('\n📋 RECOMMENDED ACTIONS:');
      console.log('1. Review and update your .env file');
      console.log('2. Check SUPPORT_SYSTEM_SETUP.md for setup instructions');
      console.log('3. Run this validator again after making changes');
    }

    console.log('\n📚 DOCUMENTATION:');
    console.log('• Setup Guide: SUPPORT_SYSTEM_SETUP.md');
    console.log('• Configuration Reference: config.json.example');
    console.log('• Environment Template: .env.example');
    
    console.log('\n🔧 QUICK COMMANDS:');
    console.log('• Validate config: node scripts/validate-support-config.js');
    console.log('• Start bot only: npm run start:bot');
    console.log('• Start everything: npm run start:all');

    return this.errors.length === 0;
  }

  run() {
    console.log('🔧 Support System Configuration Validator');
    console.log('==========================================\n');

    this.validateEnvironmentVariables();
    this.validateSupportConfiguration();
    this.validateFileStructure();
    this.checkDatabaseMigration();

    const isValid = this.generateSummary();
    
    process.exit(isValid ? 0 : 1);
  }
}

// Run the validator
if (require.main === module) {
  const validator = new SupportConfigValidator();
  validator.run();
}

module.exports = SupportConfigValidator;