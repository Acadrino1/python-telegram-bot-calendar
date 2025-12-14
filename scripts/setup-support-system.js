#!/usr/bin/env node

/**
 * Support System Setup Script
 * 
 * This script helps administrators set up the support system by:
 * 1. Creating necessary directories
 * 2. Copying configuration templates
 * 3. Providing setup guidance
 * 4. Validating the configuration
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class SupportSystemSetup {
  constructor() {
    this.config = {};
    this.envPath = path.join(process.cwd(), '.env');
    this.envExamplePath = path.join(process.cwd(), '.env.example');
  }

  async question(prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  async run() {
    console.log('🚀 Support System Setup Wizard');
    console.log('================================\n');
    
    console.log('This wizard will help you configure the live support system for your Telegram bot.\n');

    try {
      await this.checkPrerequisites();
      await this.createDirectories();
      await this.gatherConfiguration();
      await this.updateEnvironmentFile();
      await this.runValidation();
      await this.showFinalInstructions();
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...\n');

    const requiredFiles = [
      'src/bot/EnhancedTelegramBot.js',
      'src/bot/LiveSupportManager.js',
      '.env.example'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
      console.log(`✅ Found: ${file}`);
    }

    console.log('✅ All prerequisites met!\n');
  }

  async createDirectories() {
    console.log('📁 Creating directories...\n');

    const directories = [
      'data',
      'logs',
      '.swarm'
    ];

    for (const dir of directories) {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      } else {
        console.log(`ℹ️  Directory exists: ${dir}`);
      }
    }

    console.log('✅ Directory setup complete!\n');
  }

  async gatherConfiguration() {
    console.log('⚙️  Configuration Setup\n');
    console.log('Please provide the following information:\n');

    // Bot Token
    this.config.TELEGRAM_BOT_TOKEN = await this.question(
      '🤖 Telegram Bot Token (get from @BotFather): '
    );

    if (!this.config.TELEGRAM_BOT_TOKEN) {
      throw new Error('Bot token is required');
    }

    // Support Group ID
    console.log('\n📝 To get your support group chat ID:');
    console.log('1. Create a Telegram group for support agents');
    console.log('2. Add your bot to the group as administrator');
    console.log('3. Send a message to the group');
    console.log('4. Forward any message from the group to @userinfobot');
    console.log('5. Copy the chat ID (starts with -100)\n');

    this.config.SUPPORT_GROUP_ID = await this.question(
      '💬 Support Group Chat ID (e.g., -1001234567890): '
    );

    if (!this.config.SUPPORT_GROUP_ID || !this.config.SUPPORT_GROUP_ID.startsWith('-100')) {
      console.log('⚠️  Invalid group ID format. You can update this later in .env');
    }

    // Admin User IDs
    console.log('\n👨‍💼 To get your Telegram user ID:');
    console.log('1. Send any message to @userinfobot');
    console.log('2. Copy your user ID from the response\n');

    this.config.ADMIN_USER_IDS = await this.question(
      '👤 Admin User IDs (comma-separated, e.g., 123456789,987654321): '
    );

    // Support System Settings
    const enableSupport = await this.question(
      '\n🎛️  Enable support system? (y/n) [y]: '
    );
    this.config.SUPPORT_SYSTEM_ENABLED = !enableSupport || enableSupport.toLowerCase() === 'y' ? 'true' : 'false';

    if (this.config.SUPPORT_SYSTEM_ENABLED === 'true') {
      const anonymize = await this.question(
        '🔐 Anonymize user data in support messages? (y/n) [y]: '
      );
      this.config.SUPPORT_ANONYMIZE_DATA = !anonymize || anonymize.toLowerCase() === 'y' ? 'true' : 'false';

      const maxTickets = await this.question(
        '📊 Maximum support tickets per user (1-1000) [50]: '
      );
      this.config.SUPPORT_MAX_TICKETS = maxTickets || '50';

      const timeout = await this.question(
        '⏱️  Ticket timeout in minutes (5-1440) [30]: '
      );
      this.config.SUPPORT_TICKET_TIMEOUT = timeout || '30';

      const escalate = await this.question(
        '🚨 Auto-escalate timeout in minutes (10-2880) [60]: '
      );
      this.config.SUPPORT_AUTO_ESCALATE = escalate || '60';
    }

    console.log('\n✅ Configuration gathered!\n');
  }

  async updateEnvironmentFile() {
    console.log('📝 Updating environment file...\n');

    let envContent = '';

    // Read existing .env if it exists
    if (fs.existsSync(this.envPath)) {
      envContent = fs.readFileSync(this.envPath, 'utf8');
      console.log('ℹ️  Updating existing .env file');
    } else {
      // Copy from .env.example
      if (fs.existsSync(this.envExamplePath)) {
        envContent = fs.readFileSync(this.envExamplePath, 'utf8');
        console.log('ℹ️  Creating .env from .env.example');
      }
    }

    // Update configuration values
    for (const [key, value] of Object.entries(this.config)) {
      if (value) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }
    }

    // Write updated .env file
    fs.writeFileSync(this.envPath, envContent);
    console.log('✅ Environment file updated!\n');
  }

  async runValidation() {
    console.log('🔍 Running configuration validation...\n');

    try {
      const validatorPath = path.join(__dirname, 'validate-support-config.js');
      if (fs.existsSync(validatorPath)) {
        const SupportConfigValidator = require('./validate-support-config.js');
        const validator = new SupportConfigValidator();
        
        // Reload environment variables
        delete require.cache[require.resolve('dotenv')];
        require('dotenv').config();
        
        validator.validateEnvironmentVariables();
        validator.validateSupportConfiguration();
        validator.validateFileStructure();
        
        const isValid = validator.generateSummary();
        
        if (!isValid) {
          console.log('\n⚠️  Some configuration issues found. Please review and fix them.');
        }
      } else {
        console.log('⚠️  Validation script not found, skipping validation');
      }
    } catch (error) {
      console.log('⚠️  Validation failed:', error.message);
    }
  }

  async showFinalInstructions() {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SETUP COMPLETE!');
    console.log('='.repeat(60));

    console.log('\n📋 NEXT STEPS:');
    console.log('1. Review your .env file and make any necessary adjustments');
    console.log('2. Ensure your bot is added to the support group as administrator');
    console.log('3. Run database migrations: npm run migrate');
    console.log('4. Start the bot: npm run start:bot');
    console.log('5. Test the support system with /support command');

    console.log('\n🔧 USEFUL COMMANDS:');
    console.log('• Validate configuration: npm run validate-support');
    console.log('• Start bot only: npm run start:bot');
    console.log('• Start everything: npm run start:all');
    console.log('• View logs: tail -f logs/combined.log');

    console.log('\n📚 DOCUMENTATION:');
    console.log('• Detailed setup guide: SUPPORT_SYSTEM_SETUP.md');
    console.log('• Configuration reference: config.json.example');
    console.log('• Bot documentation: README.md');

    console.log('\n🚨 IMPORTANT SECURITY NOTES:');
    console.log('• Never share your bot token publicly');
    console.log('• Regularly review admin user permissions');
    console.log('• Monitor support conversations for compliance');
    console.log('• Keep your .env file secure and out of version control');

    if (this.config.SUPPORT_SYSTEM_ENABLED === 'true' && this.config.SUPPORT_GROUP_ID) {
      console.log('\n✅ Your support system is configured and ready to use!');
    } else {
      console.log('\n⚠️  Support system is disabled or not fully configured.');
      console.log('Update your .env file and run npm run validate-support when ready.');
    }

    console.log('\n🆘 NEED HELP?');
    console.log('• Check the troubleshooting section in SUPPORT_SYSTEM_SETUP.md');
    console.log('• Review error logs in logs/ directory');
    console.log('• Ensure all environment variables are properly set');
    
    console.log('\n✨ Happy supporting! Your users will love the new live chat feature.');
  }
}

// Run the setup wizard
if (require.main === module) {
  const setup = new SupportSystemSetup();
  setup.run().catch(console.error);
}

module.exports = SupportSystemSetup;