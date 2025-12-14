/**
 * Startup Validator for Feature-Driven Architecture
 * 
 * This module validates that all enabled features have their required dependencies
 * and environment variables available before the application starts.
 */

const { manager: featureManager, features } = require('./features');
require('dotenv').config();

class StartupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.logger = null;
  }

  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Validate all enabled features and their dependencies
   */
  async validate() {
    console.log('🔍 Validating feature configuration...');

    // Apply feature preset if specified
    this.applyFeaturePreset();

    // Validate feature configuration integrity
    this.validateFeatureConfiguration();

    // Validate enabled features
    this.validateEnabledFeatures();

    // Validate critical system requirements
    this.validateCriticalRequirements();

    // Generate validation report
    const report = this.generateValidationReport();
    
    // Log results
    this.logValidationResults(report);

    return report;
  }

  /**
   * Apply feature preset from environment
   */
  applyFeaturePreset() {
    const preset = process.env.FEATURE_PRESET || 'basic';
    
    try {
      const status = featureManager.applyPreset(preset);
      console.log(`✅ Applied feature preset: ${preset}`);
      
      if (status.missing.length > 0) {
        this.warnings.push(`Missing features in preset '${preset}': ${status.missing.join(', ')}`);
      }
      
      if (process.env.DEBUG_FEATURES === 'true') {
        console.log(`📊 Preset Status:
  ✅ Enabled: ${status.enabled.length}
  ❌ Disabled: ${status.disabled.length}
  ❓ Missing: ${status.missing.length}`);
      }
    } catch (error) {
      this.errors.push(`Failed to apply preset '${preset}': ${error.message}`);
    }
  }

  /**
   * Validate feature configuration for circular dependencies and missing refs
   */
  validateFeatureConfiguration() {
    const validation = featureManager.validateConfiguration();
    
    this.errors.push(...validation.errors);
    this.warnings.push(...validation.warnings);
  }

  /**
   * Validate all currently enabled features
   */
  validateEnabledFeatures() {
    const enabledFeatures = featureManager.getEnabledFeatures();
    
    console.log(`📋 Validating ${enabledFeatures.length} enabled features...`);

    for (const featurePath of enabledFeatures) {
      this.validateFeature(featurePath);
    }
  }

  /**
   * Validate a specific feature
   */
  validateFeature(featurePath) {
    const feature = featureManager.getFeature(featurePath);
    
    if (!feature) {
      this.errors.push(`Feature configuration missing: ${featurePath}`);
      return;
    }

    // Check required environment variables
    if (feature.required_env) {
      for (const envVar of feature.required_env) {
        if (!process.env[envVar] || process.env[envVar].trim() === '') {
          this.errors.push(`Required environment variable missing for '${featurePath}': ${envVar}`);
        }
      }
    }

    // Check dependencies
    if (feature.dependencies) {
      for (const dependency of feature.dependencies) {
        if (!featureManager.isEnabled(dependency)) {
          this.errors.push(`Dependency not enabled for '${featurePath}': ${dependency}`);
        }
      }
    }
  }

  /**
   * Validate critical system requirements
   */
  validateCriticalRequirements() {
    // Database is always required
    if (features.isDatabaseEnabled()) {
      this.validateDatabaseConnection();
    } else {
      this.errors.push('Database is required but not enabled');
    }

    // Telegram bot token is required only if bot is actually enabled
    if (features.isTelegramBotEnabled()) {
      if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN.includes('YOUR_')) {
        // Only error if we're not in admin-only mode
        if (process.env.ADMIN_ONLY_MODE !== 'true' && !process.env.BYPASS_TELEGRAM_CHECK) {
          this.errors.push('Valid TELEGRAM_BOT_TOKEN is required for bot functionality');
        } else {
          this.warnings.push('Telegram bot disabled - running in admin-only mode');
        }
      }
    }

    // If API server is enabled, validate port
    if (features.isApiServerEnabled()) {
      const port = process.env.PORT || 3000;
      if (isNaN(port) || port < 1 || port > 65535) {
        this.errors.push('Invalid PORT specified for API server');
      }
    }

    // JWT secret is required if auth is enabled
    if (features.isAuthEnabled()) {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-this')) {
        this.errors.push('Strong JWT_SECRET is required for authentication');
      }
    }
  }

  /**
   * Validate database connection requirements
   */
  validateDatabaseConnection() {
    const requiredDbVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    
    for (const envVar of requiredDbVars) {
      if (!process.env[envVar]) {
        this.errors.push(`Database configuration missing: ${envVar}`);
      }
    }

    // Check for default/insecure values
    if (process.env.DB_PASSWORD === 'apppassword123') {
      this.warnings.push('Using default database password - change in production');
    }
  }

  /**
   * Generate comprehensive validation report
   */
  generateValidationReport() {
    const statusReport = featureManager.getStatusReport();
    
    return {
      valid: this.errors.length === 0,
      timestamp: new Date().toISOString(),
      preset: process.env.FEATURE_PRESET || 'basic',
      environment: process.env.NODE_ENV || 'development',
      features: statusReport,
      validation: {
        errors: this.errors,
        warnings: this.warnings,
        error_count: this.errors.length,
        warning_count: this.warnings.length
      },
      runtime_info: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime: process.uptime()
      }
    };
  }

  /**
   * Log validation results
   */
  logValidationResults(report) {
    console.log(`\\n${'='.repeat(60)}`);
    console.log('🎯 FEATURE VALIDATION REPORT');
    console.log(`${'='.repeat(60)}`);
    
    console.log(`📊 Summary:
  Environment: ${report.environment}
  Preset: ${report.preset}
  Total Features: ${report.features.summary.total}
  ✅ Enabled: ${report.features.summary.enabled}
  ❌ Disabled: ${report.features.summary.disabled}
  🔧 Status: ${report.valid ? 'VALID' : 'INVALID'}`);

    if (this.errors.length > 0) {
      console.log(`\\n❌ ERRORS (${this.errors.length}):`);
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\\n⚠️  WARNINGS (${this.warnings.length}):`);
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }

    // Show enabled features in debug mode
    if (process.env.DEBUG_FEATURES === 'true') {
      const enabledFeatures = featureManager.getEnabledFeatures();
      console.log(`\\n✅ ENABLED FEATURES (${enabledFeatures.length}):`);
      enabledFeatures.forEach(feature => {
        console.log(`  • ${feature}`);
      });
    }

    console.log(`\\n🚀 Ready to start: ${report.valid ? 'YES' : 'NO'}`);
    console.log(`${'='.repeat(60)}\\n`);

    // Log to file if logger is available
    if (this.logger) {
      this.logger.info('Feature validation completed', {
        valid: report.valid,
        errors: this.errors.length,
        warnings: this.warnings.length,
        enabled_features: featureManager.getEnabledFeatures().length
      });
    }
  }

  /**
   * Get startup configuration for the application
   */
  getStartupConfiguration() {
    return {
      // Core components
      startTelegramBot: features.isTelegramBotEnabled(),
      startApiServer: features.isApiServerEnabled(),
      initializeDatabase: features.isDatabaseEnabled(),
      
      // Optional components
      enableAdminPanel: features.isAdminPanelEnabled(),
      enableBroadcasting: features.isBroadcastSystemEnabled(),
      enableAnalytics: features.areBasicAnalyticsEnabled(),
      enableSupport: features.isLiveChatEnabled(),
      
      // Security features
      enableRateLimit: features.isRateLimitingEnabled(),
      enableInputValidation: features.isInputValidationEnabled(),
      enableAuditLogging: features.isAuditLoggingEnabled(),
      
      // Communication features
      enableEmailNotifications: features.areEmailNotificationsEnabled(),
      enableSmsNotifications: features.areSmsNotificationsEnabled(),
      enableTelegramNotifications: features.areTelegramNotificationsEnabled(),
      
      // Data features
      enableDataRetention: features.isDataRetentionEnabled(),
      enableDataExport: features.isDataExportEnabled()
    };
  }

  /**
   * Validate specific component requirements
   */
  validateComponent(componentName) {
    const config = this.getStartupConfiguration();
    const errors = [];
    const warnings = [];

    switch (componentName) {
      case 'telegram':
        if (!config.startTelegramBot) {
          errors.push('Telegram bot is disabled');
        } else if (!process.env.TELEGRAM_BOT_TOKEN) {
          errors.push('TELEGRAM_BOT_TOKEN is required');
        }
        break;

      case 'api':
        if (!config.startApiServer) {
          warnings.push('API server is disabled');
        } else if (!config.initializeDatabase) {
          errors.push('API server requires database');
        }
        break;

      case 'admin':
        if (config.enableAdminPanel && !config.startApiServer) {
          errors.push('Admin panel requires API server');
        }
        break;

      default:
        warnings.push(`Unknown component: ${componentName}`);
    }

    return { errors, warnings };
  }
}

// Create and export singleton
const validator = new StartupValidator();

module.exports = {
  validator,
  validate: () => validator.validate(),
  getStartupConfiguration: () => validator.getStartupConfiguration(),
  validateComponent: (component) => validator.validateComponent(component)
};