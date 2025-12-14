/**
 * Feature Toggle Management System
 * 
 * This module provides centralized feature flag management for the Lodge Scheduler.
 * It supports environment-based overrides, dependency checking, and preset configurations.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

class FeatureToggleManager {
  constructor() {
    this.configPath = path.join(__dirname, 'feature-toggles.json');
    this.config = null;
    this.cache = new Map();
    this.initialized = false;
    this.logger = null;
    
    this.loadConfiguration();
  }

  /**
   * Load feature configuration from JSON file
   */
  loadConfiguration() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      this.initialized = true;
      this.cache.clear();
      console.log(`✅ Feature toggles loaded (v${this.config.version})`);
    } catch (error) {
      console.error('❌ Failed to load feature toggles:', error.message);
      // Fallback to minimal configuration
      this.config = this.getMinimalConfig();
      this.initialized = true;
    }
  }

  /**
   * Set logger instance for feature toggle logging
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Get minimal fallback configuration
   */
  getMinimalConfig() {
    return {
      version: "fallback",
      features: {
        core: {
          telegram_bot: { enabled: true, dependencies: [], priority: "critical" },
          database: { enabled: true, dependencies: [], priority: "critical" }
        }
      },
      presets: {
        minimal: { features: ["telegram_bot", "database"] }
      },
      environment_overrides: {}
    };
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(featurePath) {
    if (!this.initialized) {
      console.warn('⚠️  Feature toggles not initialized, defaulting to false');
      return false;
    }

    // Check cache first
    const cacheKey = `enabled:${featurePath}:${process.env.NODE_ENV}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = this._checkFeatureEnabled(featurePath);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Internal method to check if feature is enabled
   */
  _checkFeatureEnabled(featurePath) {
    const feature = this.getFeature(featurePath);
    if (!feature) {
      return false;
    }

    // Check environment variable override first
    const envVar = this.getEnvironmentVariable(featurePath);
    if (envVar !== undefined) {
      const enabled = envVar === 'true' || envVar === '1';
      this.logFeatureCheck(featurePath, enabled, 'environment variable');
      return enabled;
    }

    // Check environment-specific overrides
    const envOverride = this.getEnvironmentOverride(featurePath);
    if (envOverride !== null) {
      this.logFeatureCheck(featurePath, envOverride, 'environment override');
      return envOverride;
    }

    // Check if required dependencies are met
    if (!this.areDependenciesMet(feature)) {
      this.logFeatureCheck(featurePath, false, 'dependencies not met');
      return false;
    }

    // Check if required environment variables are present
    if (!this.areRequiredEnvVarsPresent(feature)) {
      this.logFeatureCheck(featurePath, false, 'required env vars missing');
      return false;
    }

    // Return the configured value
    const enabled = feature.enabled === true;
    this.logFeatureCheck(featurePath, enabled, 'configuration');
    return enabled;
  }

  /**
   * Get feature configuration by path
   */
  getFeature(featurePath) {
    const parts = featurePath.split('.');
    let current = this.config.features;

    for (const part of parts) {
      if (current && current[part]) {
        current = current[part];
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * Get environment variable for feature
   */
  getEnvironmentVariable(featurePath) {
    const envVar = `FEATURE_${featurePath.toUpperCase().replace(/\./g, '_')}`;
    return process.env[envVar];
  }

  /**
   * Get environment-specific override
   */
  getEnvironmentOverride(featurePath) {
    const env = process.env.NODE_ENV || 'development';
    const overrides = this.config.environment_overrides[env];
    
    if (!overrides) return null;

    if (overrides.force_enabled && overrides.force_enabled.includes(featurePath)) {
      return true;
    }
    
    if (overrides.force_disabled && overrides.force_disabled.includes(featurePath)) {
      return false;
    }

    return null;
  }

  /**
   * Check if feature dependencies are met
   */
  areDependenciesMet(feature) {
    if (!feature.dependencies || feature.dependencies.length === 0) {
      return true;
    }

    for (const dependency of feature.dependencies) {
      if (!this.isEnabled(dependency)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if required environment variables are present
   */
  areRequiredEnvVarsPresent(feature) {
    if (!feature.required_env || feature.required_env.length === 0) {
      return true;
    }

    for (const envVar of feature.required_env) {
      if (!process.env[envVar] || process.env[envVar].trim() === '') {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(presetName) {
    const preset = this.config.presets[presetName];
    if (!preset) {
      throw new Error(`Preset '${presetName}' not found`);
    }

    console.log(`🎯 Applying feature preset: ${presetName}`);
    
    // Handle special case for "all features"
    if (preset.features === "*") {
      return this.enableAllFeatures();
    }

    let features = [...(preset.features || [])];
    
    // Handle preset inheritance
    if (preset.extends) {
      const basePreset = this.config.presets[preset.extends];
      if (basePreset && basePreset.features) {
        features = [...basePreset.features, ...features];
      }
    }
    
    // Add additional features
    if (preset.additional_features) {
      features = [...features, ...preset.additional_features];
    }

    return this.getPresetStatus(features);
  }

  /**
   * Enable all features (development mode)
   */
  enableAllFeatures() {
    const allFeatures = [];
    this.walkFeatures(this.config.features, '', (path, feature) => {
      allFeatures.push(path);
    });
    return this.getPresetStatus(allFeatures);
  }

  /**
   * Walk through features recursively
   */
  walkFeatures(features, prefix, callback) {
    for (const [key, value] of Object.entries(features)) {
      const path = prefix ? `${prefix}.${key}` : key;
      
      if (value.enabled !== undefined) {
        // This is a feature
        callback(path, value);
      } else {
        // This is a category, recurse
        this.walkFeatures(value, path, callback);
      }
    }
  }

  /**
   * Get status for preset features
   */
  getPresetStatus(features) {
    const status = {
      enabled: [],
      disabled: [],
      missing: []
    };

    for (const featurePath of features) {
      const feature = this.getFeature(featurePath);
      if (!feature) {
        status.missing.push(featurePath);
        continue;
      }

      if (this.isEnabled(featurePath)) {
        status.enabled.push(featurePath);
      } else {
        status.disabled.push(featurePath);
      }
    }

    return status;
  }

  /**
   * Get all enabled features
   */
  getEnabledFeatures() {
    const enabled = [];
    this.walkFeatures(this.config.features, '', (path, feature) => {
      if (this.isEnabled(path)) {
        enabled.push(path);
      }
    });
    return enabled;
  }

  /**
   * Get feature status report
   */
  getStatusReport() {
    const report = {
      version: this.config.version,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      features: {},
      summary: {
        total: 0,
        enabled: 0,
        disabled: 0,
        missing_deps: 0,
        missing_env: 0
      }
    };

    this.walkFeatures(this.config.features, '', (path, feature) => {
      const enabled = this.isEnabled(path);
      const depsMet = this.areDependenciesMet(feature);
      const envMet = this.areRequiredEnvVarsPresent(feature);
      
      report.features[path] = {
        enabled,
        configured: feature.enabled,
        dependencies_met: depsMet,
        env_vars_present: envMet,
        priority: feature.priority,
        description: feature.description
      };

      report.summary.total++;
      if (enabled) {
        report.summary.enabled++;
      } else {
        report.summary.disabled++;
        if (!depsMet) report.summary.missing_deps++;
        if (!envMet) report.summary.missing_env++;
      }
    });

    return report;
  }

  /**
   * Log feature check for debugging
   */
  logFeatureCheck(featurePath, enabled, reason) {
    const message = `Feature '${featurePath}': ${enabled ? 'ENABLED' : 'DISABLED'} (${reason})`;
    
    if (this.logger) {
      this.logger.debug(message);
    } else if (process.env.DEBUG_FEATURES === 'true') {
      console.log(`🎯 ${message}`);
    }
  }

  /**
   * Validate configuration integrity
   */
  validateConfiguration() {
    const errors = [];
    const warnings = [];

    // Check for circular dependencies
    this.walkFeatures(this.config.features, '', (path, feature) => {
      if (feature.dependencies) {
        const visited = new Set();
        const stack = new Set();
        
        if (this.hasCircularDependency(path, visited, stack)) {
          errors.push(`Circular dependency detected for feature: ${path}`);
        }
      }
    });

    // Check for missing dependencies
    this.walkFeatures(this.config.features, '', (path, feature) => {
      if (feature.dependencies) {
        for (const dep of feature.dependencies) {
          if (!this.getFeature(dep)) {
            errors.push(`Missing dependency '${dep}' for feature '${path}'`);
          }
        }
      }
    });

    return { errors, warnings };
  }

  /**
   * Check for circular dependencies
   */
  hasCircularDependency(featurePath, visited, stack) {
    if (stack.has(featurePath)) {
      return true;
    }

    if (visited.has(featurePath)) {
      return false;
    }

    visited.add(featurePath);
    stack.add(featurePath);

    const feature = this.getFeature(featurePath);
    if (feature && feature.dependencies) {
      for (const dep of feature.dependencies) {
        if (this.hasCircularDependency(dep, visited, stack)) {
          return true;
        }
      }
    }

    stack.delete(featurePath);
    return false;
  }

  /**
   * Reload configuration from file
   */
  reload() {
    console.log('🔄 Reloading feature toggles...');
    this.loadConfiguration();
  }

  /**
   * Get configuration version
   */
  getVersion() {
    return this.config ? this.config.version : 'unknown';
  }
}

// Create singleton instance
const featureManager = new FeatureToggleManager();

// Export convenience functions
module.exports = {
  // Main manager instance
  manager: featureManager,
  
  // Convenience functions
  isEnabled: (feature) => featureManager.isEnabled(feature),
  getEnabledFeatures: () => featureManager.getEnabledFeatures(),
  applyPreset: (preset) => featureManager.applyPreset(preset),
  getStatusReport: () => featureManager.getStatusReport(),
  reload: () => featureManager.reload(),
  
  // Feature checks for common modules
  features: {
    // Core features
    isTelegramBotEnabled: () => featureManager.isEnabled('core.telegram_bot'),
    isApiServerEnabled: () => featureManager.isEnabled('core.api_server'),
    isDatabaseEnabled: () => featureManager.isEnabled('core.database'),
    isAuthEnabled: () => featureManager.isEnabled('core.authentication'),
    
    // Scheduling features
    areAppointmentsEnabled: () => featureManager.isEnabled('scheduling.appointments'),
    isAvailabilityEnabled: () => featureManager.isEnabled('scheduling.availability'),
    isWaitlistEnabled: () => featureManager.isEnabled('scheduling.waitlist'),
    
    // Communication features
    areEmailNotificationsEnabled: () => featureManager.isEnabled('communications.email_notifications'),
    areSmsNotificationsEnabled: () => featureManager.isEnabled('communications.sms_notifications'),
    areTelegramNotificationsEnabled: () => featureManager.isEnabled('communications.telegram_notifications'),
    isReminderSystemEnabled: () => featureManager.isEnabled('communications.reminder_system'),
    
    // Admin features
    isAdminPanelEnabled: () => featureManager.isEnabled('admin.admin_panel'),
    isAdminSecurityEnabled: () => featureManager.isEnabled('admin.admin_security'),
    isUserManagementEnabled: () => featureManager.isEnabled('admin.user_management'),
    
    // Support features
    isLiveChatEnabled: () => featureManager.isEnabled('support.live_chat'),
    isTicketSystemEnabled: () => featureManager.isEnabled('support.ticket_system'),
    isPrivateSupportEnabled: () => featureManager.isEnabled('support.private_support'),
    
    // Broadcasting features
    isBroadcastSystemEnabled: () => featureManager.isEnabled('broadcasting.broadcast_system'),
    isCampaignManagementEnabled: () => featureManager.isEnabled('broadcasting.campaign_management'),
    areBroadcastAnalyticsEnabled: () => featureManager.isEnabled('broadcasting.broadcast_analytics'),
    
    // Analytics features
    areBasicAnalyticsEnabled: () => featureManager.isEnabled('analytics.basic_analytics'),
    areAdvancedAnalyticsEnabled: () => featureManager.isEnabled('analytics.advanced_analytics'),
    isDashboardEnabled: () => featureManager.isEnabled('analytics.dashboard'),
    
    // Security features
    isRateLimitingEnabled: () => featureManager.isEnabled('security.rate_limiting'),
    isInputValidationEnabled: () => featureManager.isEnabled('security.input_validation'),
    isAuditLoggingEnabled: () => featureManager.isEnabled('security.audit_logging'),
    isEncryptionEnabled: () => featureManager.isEnabled('security.encryption'),
    
    // Data management features
    isDataRetentionEnabled: () => featureManager.isEnabled('data_management.data_retention'),
    isDataExportEnabled: () => featureManager.isEnabled('data_management.data_export'),
    isBackupSystemEnabled: () => featureManager.isEnabled('data_management.backup_system')
  }
};