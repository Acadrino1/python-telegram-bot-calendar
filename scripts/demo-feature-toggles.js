#!/usr/bin/env node

/**
 * Feature Toggle System Demo
 * 
 * Demonstrates how to use the feature toggle system in the Lodge Scheduler.
 */

require('dotenv').config();
const { features, manager: featureManager, getStatusReport } = require('../config/features');
const { validator } = require('../config/startup-validator');

async function demo() {
  console.log(`
┌─────────────────────────────────────────────────┐
│        FEATURE TOGGLE SYSTEM DEMO              │
└─────────────────────────────────────────────────┘

This demo shows how the Lodge Scheduler feature toggle system works.
`);

  // Demo 1: Show current configuration
  console.log('📋 DEMO 1: Current Configuration');
  console.log('================================');
  console.log(`Current preset: ${process.env.FEATURE_PRESET || 'not set'}`);
  console.log(`Enabled features: ${featureManager.getEnabledFeatures().length}`);
  console.log();

  // Demo 2: Show different presets
  console.log('🎯 DEMO 2: Different Presets');
  console.log('============================');
  
  const presets = ['minimal', 'basic', 'standard', 'enterprise'];
  
  for (const preset of presets) {
    const status = featureManager.applyPreset(preset);
    console.log(`${preset.toUpperCase()} preset:`);
    console.log(`  ✅ Enabled: ${status.enabled.length} features`);
    console.log(`  ❌ Disabled: ${status.disabled.length} features`);
    console.log(`  ❓ Missing: ${status.missing.length} features`);
    console.log();
  }

  // Demo 3: Feature checks
  console.log('🔍 DEMO 3: Feature Checks (using minimal preset)');
  console.log('===============================================');
  featureManager.applyPreset('minimal');
  
  const featureChecks = [
    { name: 'Telegram Bot', fn: features.isTelegramBotEnabled },
    { name: 'API Server', fn: features.isApiServerEnabled },
    { name: 'Database', fn: features.isDatabaseEnabled },
    { name: 'Admin Panel', fn: features.isAdminPanelEnabled },
    { name: 'Email Notifications', fn: features.areEmailNotificationsEnabled },
    { name: 'Broadcasting', fn: features.isBroadcastSystemEnabled },
    { name: 'Analytics', fn: features.areBasicAnalyticsEnabled },
  ];

  for (const check of featureChecks) {
    const enabled = check.fn();
    const status = enabled ? '✅ ENABLED' : '❌ DISABLED';
    console.log(`  ${check.name}: ${status}`);
  }
  console.log();

  // Demo 4: Environment overrides
  console.log('⚙️  DEMO 4: Environment Variable Overrides');
  console.log('==========================================');
  console.log('Setting FEATURE_CORE_API_SERVER=true...');
  process.env.FEATURE_CORE_API_SERVER = 'true';
  featureManager.cache.clear(); // Clear cache to force re-evaluation
  
  console.log(`API Server now: ${features.isApiServerEnabled() ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log('(This overrides the preset configuration)');
  console.log();
  
  // Clean up
  delete process.env.FEATURE_CORE_API_SERVER;
  featureManager.cache.clear();

  // Demo 5: Startup configuration
  console.log('🚀 DEMO 5: Startup Configuration');
  console.log('================================');
  const config = validator.getStartupConfiguration();
  
  console.log('Components that would start:');
  console.log(`  Telegram Bot: ${config.startTelegramBot ? '✅ YES' : '❌ NO'}`);
  console.log(`  API Server: ${config.startApiServer ? '✅ YES' : '❌ NO'}`);
  console.log(`  Database: ${config.initializeDatabase ? '✅ YES' : '❌ NO'}`);
  console.log(`  Admin Panel: ${config.enableAdminPanel ? '✅ YES' : '❌ NO'}`);
  console.log(`  Broadcasting: ${config.enableBroadcasting ? '✅ YES' : '❌ NO'}`);
  console.log();

  // Demo 6: Validation
  console.log('🔍 DEMO 6: Configuration Validation');
  console.log('===================================');
  
  // Set minimal preset again for clean validation
  featureManager.applyPreset('minimal');
  
  const validation = await validator.validate();
  console.log(`Validation status: ${validation.valid ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Errors found: ${validation.validation.errors.length}`);
  console.log(`Warnings: ${validation.validation.warnings.length}`);
  
  if (validation.validation.errors.length > 0) {
    console.log('\\nMain errors:');
    validation.validation.errors.slice(0, 3).forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
    if (validation.validation.errors.length > 3) {
      console.log(`  ... and ${validation.validation.errors.length - 3} more`);
    }
  }
  console.log();

  // Demo 7: Usage scenarios
  console.log('💡 DEMO 7: Common Usage Scenarios');
  console.log('=================================');
  
  console.log('Scenario 1: Bot-only deployment');
  console.log('  • Set FEATURE_PRESET=minimal in .env');
  console.log('  • Only needs TELEGRAM_BOT_TOKEN and database');
  console.log('  • Run: npm run start:minimal');
  console.log();
  
  console.log('Scenario 2: Full-featured development');
  console.log('  • Set FEATURE_PRESET=development in .env');
  console.log('  • All features enabled for testing');
  console.log('  • Run: npm run start');
  console.log();
  
  console.log('Scenario 3: Production with admin panel');
  console.log('  • Set FEATURE_PRESET=enterprise in .env');
  console.log('  • Configure all required environment variables');
  console.log('  • Run: npm run start:enterprise');
  console.log();

  console.log('📚 Available npm scripts:');
  const scripts = [
    'npm run start:minimal      # Bot only',
    'npm run start:basic        # Bot + API',
    'npm run start:standard     # + Notifications',
    'npm run start:enterprise   # + Admin panel',
    'npm run features:status    # Show feature status',
    'npm run features:validate  # Validate config',
    'npm run config:check       # Check startup config'
  ];
  
  scripts.forEach(script => console.log(`  ${script}`));

  console.log(`
┌─────────────────────────────────────────────────┐
│                DEMO COMPLETE                    │
├─────────────────────────────────────────────────┤
│  The feature toggle system is now ready!       │
│  Check the .env.example file for configuration │
│  Use different presets for different needs     │
└─────────────────────────────────────────────────┘
`);
}

// Run the demo
demo().catch(error => {
  console.error('Demo failed:', error.message);
  process.exit(1);
});