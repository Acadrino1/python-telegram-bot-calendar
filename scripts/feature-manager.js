#!/usr/bin/env node

/**
 * Feature Manager CLI Tool
 * 
 * Command-line interface for managing feature toggles in the Lodge Scheduler.
 * Provides easy commands to check status, apply presets, and validate configuration.
 */

const { program } = require('commander');
const { features, manager: featureManager, getStatusReport, applyPreset } = require('../config/features');
const { validator } = require('../config/startup-validator');
const fs = require('fs');
const path = require('path');

// Configure commander
program
  .name('feature-manager')
  .description('CLI tool for managing Lodge Scheduler feature toggles')
  .version('1.0.0');

// Status command
program
  .command('status')
  .description('Show current feature status')
  .option('-d, --detailed', 'Show detailed feature information')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const report = getStatusReport();
      
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(`
┌─────────────────────────────────────────────────┐
│           FEATURE STATUS REPORT                 │
├─────────────────────────────────────────────────┤
│  Version: ${report.version.padEnd(35)} │
│  Environment: ${report.environment.padEnd(31)} │
│  Timestamp: ${new Date(report.timestamp).toLocaleString().padEnd(29)} │
└─────────────────────────────────────────────────┘

📊 Summary:
  Total Features: ${report.summary.total}
  ✅ Enabled: ${report.summary.enabled}
  ❌ Disabled: ${report.summary.disabled}
  ⚠️  Missing Dependencies: ${report.summary.missing_deps}
  🔧 Missing Environment: ${report.summary.missing_env}
`);

      if (options.detailed) {
        console.log('📋 Detailed Feature Status:');
        for (const [feature, status] of Object.entries(report.features)) {
          const icon = status.enabled ? '✅' : '❌';
          console.log(`  ${icon} ${feature}: ${status.description}`);
          
          if (!status.dependencies_met) {
            console.log(`    ⚠️  Dependencies not met`);
          }
          if (!status.env_vars_present) {
            console.log(`    🔧 Environment variables missing`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error getting status:', error.message);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List enabled features')
  .option('-a, --all', 'Show all features (enabled and disabled)')
  .action((options) => {
    try {
      const enabledFeatures = featureManager.getEnabledFeatures();
      
      if (options.all) {
        const report = getStatusReport();
        console.log('All Features:');
        for (const [feature, status] of Object.entries(report.features)) {
          const icon = status.enabled ? '✅' : '❌';
          console.log(`  ${icon} ${feature}`);
        }
      } else {
        console.log('Enabled Features:');
        enabledFeatures.forEach(feature => {
          console.log(`  ✅ ${feature}`);
        });
      }
    } catch (error) {
      console.error('❌ Error listing features:', error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate feature configuration')
  .option('-v, --verbose', 'Show detailed validation output')
  .action(async (options) => {
    try {
      const validation = await validator.validate();
      
      if (validation.valid) {
        console.log('✅ Feature configuration is valid');
        if (options.verbose) {
          console.log(`  Features enabled: ${validation.features.summary.enabled}`);
          console.log(`  Preset: ${validation.preset}`);
        }
      } else {
        console.log('❌ Feature configuration is invalid');
        console.log('\\nErrors:');
        validation.validation.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
        
        if (validation.validation.warnings.length > 0) {
          console.log('\\nWarnings:');
          validation.validation.warnings.forEach((warning, index) => {
            console.log(`  ${index + 1}. ${warning}`);
          });
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  });

// Preset command
program
  .command('preset <name>')
  .description('Apply a feature preset')
  .option('-d, --dry-run', 'Show what would be enabled/disabled without applying')
  .action((name, options) => {
    try {
      console.log(`🎯 ${options.dryRun ? 'Would apply' : 'Applying'} preset: ${name}`);
      
      const status = applyPreset(name);
      
      console.log(`\\n📊 Preset Status:
  ✅ Would be enabled: ${status.enabled.length}
  ❌ Would be disabled: ${status.disabled.length}
  ❓ Missing features: ${status.missing.length}`);
      
      if (status.enabled.length > 0) {
        console.log('\\nEnabled features:');
        status.enabled.forEach(feature => {
          console.log(`  ✅ ${feature}`);
        });
      }
      
      if (status.missing.length > 0) {
        console.log('\\nMissing features (ignored):');
        status.missing.forEach(feature => {
          console.log(`  ❓ ${feature}`);
        });
      }
      
      if (!options.dryRun) {
        console.log('\\n✅ Preset applied successfully');
        console.log('💡 Restart the application to apply changes');
      }
    } catch (error) {
      console.error('❌ Error applying preset:', error.message);
      process.exit(1);
    }
  });

// Presets command
program
  .command('presets')
  .description('List available presets')
  .action(() => {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/feature-toggles.json'), 'utf8'));
      
      console.log('Available Presets:\\n');
      
      for (const [name, preset] of Object.entries(config.presets)) {
        console.log(`📋 ${name}:`);
        console.log(`   ${preset.description}`);
        
        if (preset.extends) {
          console.log(`   Extends: ${preset.extends}`);
        }
        
        if (preset.features === '*') {
          console.log(`   Features: All features enabled`);
        } else if (Array.isArray(preset.features)) {
          console.log(`   Features: ${preset.features.length} features`);
        }
        console.log();
      }
    } catch (error) {
      console.error('❌ Error listing presets:', error.message);
      process.exit(1);
    }
  });

// Check command
program
  .command('check <feature>')
  .description('Check if a specific feature is enabled')
  .action((feature) => {
    try {
      const enabled = featureManager.isEnabled(feature);
      const featureInfo = featureManager.getFeature(feature);
      
      if (!featureInfo) {
        console.log(`❓ Feature '${feature}' not found`);
        process.exit(1);
      }
      
      console.log(`Feature: ${feature}`);
      console.log(`Status: ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
      console.log(`Description: ${featureInfo.description}`);
      console.log(`Priority: ${featureInfo.priority}`);
      
      if (featureInfo.dependencies && featureInfo.dependencies.length > 0) {
        console.log(`Dependencies: ${featureInfo.dependencies.join(', ')}`);
      }
      
      if (featureInfo.required_env && featureInfo.required_env.length > 0) {
        console.log(`Required env vars: ${featureInfo.required_env.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Error checking feature:', error.message);
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Show startup configuration for enabled features')
  .action(async () => {
    try {
      const config = validator.getStartupConfiguration();
      
      console.log('🚀 Startup Configuration:\\n');
      
      console.log('Core Components:');
      console.log(`  Telegram Bot: ${config.startTelegramBot ? '✅' : '❌'}`);
      console.log(`  API Server: ${config.startApiServer ? '✅' : '❌'}`);
      console.log(`  Database: ${config.initializeDatabase ? '✅' : '❌'}`);
      
      console.log('\\nOptional Features:');
      console.log(`  Admin Panel: ${config.enableAdminPanel ? '✅' : '❌'}`);
      console.log(`  Broadcasting: ${config.enableBroadcasting ? '✅' : '❌'}`);
      console.log(`  Analytics: ${config.enableAnalytics ? '✅' : '❌'}`);
      console.log(`  Support System: ${config.enableSupport ? '✅' : '❌'}`);
      
      console.log('\\nSecurity Features:');
      console.log(`  Rate Limiting: ${config.enableRateLimit ? '✅' : '❌'}`);
      console.log(`  Input Validation: ${config.enableInputValidation ? '✅' : '❌'}`);
      console.log(`  Audit Logging: ${config.enableAuditLogging ? '✅' : '❌'}`);
      
      console.log('\\nCommunications:');
      console.log(`  Email Notifications: ${config.enableEmailNotifications ? '✅' : '❌'}`);
      console.log(`  SMS Notifications: ${config.enableSmsNotifications ? '✅' : '❌'}`);
      console.log(`  Telegram Notifications: ${config.enableTelegramNotifications ? '✅' : '❌'}`);
    } catch (error) {
      console.error('❌ Error getting config:', error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();