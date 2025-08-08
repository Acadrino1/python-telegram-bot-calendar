/**
 * Security Patches for Appointment Scheduler
 * Addresses critical vulnerabilities and unauthorized access
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

class SecurityPatches {
  constructor() {
    this.vulnerabilities = {
      exposedBotToken: '8124276494:AAEXy61BMBQcrz6TCCNHRI3_4d6fbXERy8M',
      unauthorizedAdminId: '7930798268',
      missingSupport: 'SUPPORT_GROUP_ID not configured',
      weakRateLimit: 'Insufficient rate limiting',
      hardcodedCredentials: 'Credentials hardcoded in source'
    };
  }

  /**
   * Generate a new secure bot token placeholder
   */
  generateSecureBotTokenPlaceholder() {
    return 'YOUR_NEW_BOT_TOKEN_FROM_BOTFATHER';
  }

  /**
   * Generate secure JWT secret
   */
  generateSecureJWTSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate secure session secret
   */
  generateSecureSessionSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Check if a user ID is authorized admin
   */
  isAuthorizedAdmin(userId, authorizedAdmins = []) {
    // Never allow the hardcoded unauthorized ID
    if (userId === this.vulnerabilities.unauthorizedAdminId) {
      console.warn(`SECURITY ALERT: Blocked unauthorized admin attempt by ID: ${userId}`);
      return false;
    }
    
    return authorizedAdmins.includes(userId.toString());
  }

  /**
   * Validate bot token format
   */
  validateBotToken(token) {
    if (!token) return false;
    
    // Check if it's the exposed vulnerable token
    if (token === this.vulnerabilities.exposedBotToken) {
      console.error('CRITICAL: Using exposed bot token! Generate a new one immediately!');
      return false;
    }
    
    // Basic Telegram bot token format validation
    const botTokenRegex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
    return botTokenRegex.test(token);
  }

  /**
   * Sanitize user input to prevent injection attacks
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[<>]/g, '') // Remove potential HTML/XML tags
      .replace(/['"]/g, '') // Remove quotes to prevent SQL injection
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim()
      .substring(0, 1000); // Limit length
  }

  /**
   * Validate and sanitize appointment data
   */
  sanitizeAppointmentData(data) {
    const sanitized = {};
    
    if (data.client_id) {
      sanitized.client_id = parseInt(data.client_id);
      if (isNaN(sanitized.client_id)) throw new Error('Invalid client ID');
    }
    
    if (data.provider_id) {
      sanitized.provider_id = parseInt(data.provider_id);
      if (isNaN(sanitized.provider_id)) throw new Error('Invalid provider ID');
    }
    
    if (data.service_id) {
      sanitized.service_id = parseInt(data.service_id);
      if (isNaN(sanitized.service_id)) throw new Error('Invalid service ID');
    }
    
    if (data.notes) {
      sanitized.notes = this.sanitizeInput(data.notes);
    }
    
    if (data.appointment_datetime) {
      const date = new Date(data.appointment_datetime);
      if (isNaN(date.getTime())) throw new Error('Invalid appointment date');
      sanitized.appointment_datetime = date.toISOString();
    }
    
    return sanitized;
  }

  /**
   * Generate secure API key
   */
  generateAPIKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash API key for storage
   */
  async hashAPIKey(apiKey) {
    return await bcrypt.hash(apiKey, 12);
  }

  /**
   * Verify API key
   */
  async verifyAPIKey(providedKey, hashedKey) {
    return await bcrypt.compare(providedKey, hashedKey);
  }

  /**
   * Create secure environment configuration
   */
  generateSecureEnvironmentConfig() {
    return {
      // Database security
      DB_PASSWORD: crypto.randomBytes(16).toString('hex'),
      
      // JWT security
      JWT_SECRET: this.generateSecureJWTSecret(),
      
      // Session security
      SESSION_SECRET: this.generateSecureSessionSecret(),
      
      // Bot token (requires manual setup)
      TELEGRAM_BOT_TOKEN: this.generateSecureBotTokenPlaceholder(),
      
      // API security
      API_KEY: this.generateAPIKey(),
      
      // Rate limiting
      RATE_LIMIT_MAX_REQUESTS: 50,
      RATE_LIMIT_MAX_REQUESTS_PER_IP: 20,
      
      // Support system (requires manual configuration)
      SUPPORT_GROUP_ID: 'YOUR_TELEGRAM_GROUP_ID',
      SUPPORT_SYSTEM_ENABLED: true,
      
      // Security features
      SECURITY_HEADERS_ENABLED: true,
      CSRF_PROTECTION_ENABLED: true,
      API_KEY_REQUIRED: true
    };
  }

  /**
   * Audit log entry for security events
   */
  createSecurityAuditLog(event, details = {}) {
    return {
      timestamp: new Date().toISOString(),
      event,
      severity: details.severity || 'medium',
      details: {
        ...details,
        user_agent: details.user_agent || 'unknown',
        ip_address: details.ip_address || 'unknown',
        user_id: details.user_id || 'anonymous'
      },
      mitigated: details.mitigated || false
    };
  }

  /**
   * Check for common security issues
   */
  performSecurityAudit(config = {}) {
    const issues = [];
    
    // Check for exposed bot token
    if (config.TELEGRAM_BOT_TOKEN === this.vulnerabilities.exposedBotToken) {
      issues.push({
        severity: 'critical',
        issue: 'Exposed bot token in use',
        remediation: 'Generate new bot token from @BotFather immediately'
      });
    }
    
    // Check for unauthorized admin ID
    if (config.ADMIN_USER_IDS && config.ADMIN_USER_IDS.includes(this.vulnerabilities.unauthorizedAdminId)) {
      issues.push({
        severity: 'high',
        issue: 'Unauthorized admin ID in configuration',
        remediation: 'Remove unauthorized admin ID from configuration'
      });
    }
    
    // Check for missing support configuration
    if (config.SUPPORT_SYSTEM_ENABLED === 'true' && !config.SUPPORT_GROUP_ID) {
      issues.push({
        severity: 'medium',
        issue: 'Support system enabled but not configured',
        remediation: 'Set SUPPORT_GROUP_ID or disable support system'
      });
    }
    
    // Check for weak JWT secret
    if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
      issues.push({
        severity: 'high',
        issue: 'Weak or missing JWT secret',
        remediation: 'Generate strong JWT secret (64+ characters)'
      });
    }
    
    // Check for insufficient rate limiting
    if (!config.RATE_LIMIT_MAX_REQUESTS || config.RATE_LIMIT_MAX_REQUESTS > 100) {
      issues.push({
        severity: 'medium',
        issue: 'Insufficient rate limiting',
        remediation: 'Set stricter rate limits (max 50-100 requests per window)'
      });
    }
    
    return {
      timestamp: new Date().toISOString(),
      total_issues: issues.length,
      critical_issues: issues.filter(i => i.severity === 'critical').length,
      high_issues: issues.filter(i => i.severity === 'high').length,
      medium_issues: issues.filter(i => i.severity === 'medium').length,
      issues
    };
  }

  /**
   * Generate security report
   */
  generateSecurityReport() {
    return {
      report_id: crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      vulnerabilities_identified: Object.keys(this.vulnerabilities).length,
      vulnerabilities: this.vulnerabilities,
      recommendations: [
        'Replace exposed bot token immediately',
        'Remove unauthorized admin ID (7930798268)',
        'Configure SUPPORT_GROUP_ID for live chat',
        'Implement stricter rate limiting',
        'Use environment variables for all secrets',
        'Enable security headers and CSRF protection',
        'Implement API key authentication',
        'Set up monitoring and alerting',
        'Regular security audits and updates',
        'Database cleanup to remove contaminated data'
      ],
      remediation_scripts: [
        'database-cleanup.sql',
        'rate-limiting-middleware.js',
        '.env.secure configuration'
      ]
    };
  }
}

module.exports = new SecurityPatches();