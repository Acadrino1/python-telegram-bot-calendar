const crypto = require('crypto');

class SecureConfig {
  constructor() {
    this.validateEnvironment();
  }

  validateEnvironment() {
    // Check for exposed bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const exposedTokens = [
      'TELEGRAM_BOT_TOKEN_PLACEHOLDER',
      // Add other known exposed tokens here
    ];
    
    if (exposedTokens.includes(botToken)) {
      console.error('🚨 CRITICAL: Using exposed bot token! System blocked.');
      console.error('Please generate a new bot token via @BotFather');
      process.exit(1);
    }

    // Validate bot token format
    if (!botToken || !this.isValidBotToken(botToken)) {
      console.error('🚨 Invalid bot token format');
      process.exit(1);
    }

    // Validate JWT secret strength
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
      console.error('🚨 JWT secret too weak (minimum 64 characters)');
      console.error('Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
      process.exit(1);
    }

    // Check for test/example admin IDs in production
    const testAdminIds = ['123456789', '000000000'];
    const adminIds = process.env.ADMIN_USER_IDS?.split(',') || [];
    const hasTestId = adminIds.some(id => testAdminIds.includes(id.trim()));

    if (hasTestId && process.env.NODE_ENV === 'production') {
      console.error('🚨 Test admin ID detected in production ADMIN_USER_IDS');
      process.exit(1);
    }
  }

  isValidBotToken(token) {
    // Telegram bot token format: number:alphanumeric_string
    const botTokenRegex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
    return botTokenRegex.test(token);
  }

  generateSecureSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate all required secrets
  generateSecrets() {
    console.log('Generated secrets (add to .env):');
    console.log(`JWT_SECRET=${this.generateSecureSecret(64)}`);
    console.log(`SESSION_SECRET=${this.generateSecureSecret(32)}`);
    console.log(`API_KEY=${this.generateSecureSecret(32)}`);
    console.log(`ENCRYPTION_KEY=${this.generateSecureSecret(32)}`);
  }
}

module.exports = new SecureConfig();