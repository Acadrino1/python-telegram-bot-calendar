#!/usr/bin/env node
/**
 * Phase 1 Diagnostic Script
 * Run with: node scripts/diagnose-api.js
 */

console.log('═'.repeat(60));
console.log('🔍 PHASE 1: API SERVER DIAGNOSTIC');
console.log('═'.repeat(60));
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log('');

// Step 1.1: Check environment loading
console.log('─'.repeat(60));
console.log('1.1 ENVIRONMENT CONFIGURATION');
console.log('─'.repeat(60));

// Clear any cached modules to get fresh state
delete require.cache[require.resolve('dotenv')];

// Load with override to ensure we get current .env values
require('dotenv').config({ override: true });

console.log(`  FEATURE_PRESET:           ${process.env.FEATURE_PRESET || '(not set)'}`);
console.log(`  NODE_ENV:                 ${process.env.NODE_ENV || '(not set)'}`);
console.log(`  PORT:                     ${process.env.PORT || '(not set)'}`);
console.log(`  DEBUG_FEATURES:           ${process.env.DEBUG_FEATURES || '(not set)'}`);
console.log(`  FEATURE_CORE_API_SERVER:  ${process.env.FEATURE_CORE_API_SERVER || '(not set - will use JSON config)'}`);
console.log('');

// Step 1.2: Check feature toggle system
console.log('─'.repeat(60));
console.log('1.2 FEATURE TOGGLE SYSTEM STATE');
console.log('─'.repeat(60));

try {
  // Clear cached feature module
  const featurePath = require.resolve('../config/features');
  delete require.cache[featurePath];
  
  const { features, manager } = require('../config/features');
  
  console.log(`  Feature system version:   ${manager.getVersion()}`);
  console.log(`  Initialized:              ${manager.initialized}`);
  console.log('');
  console.log('  CRITICAL FEATURE CHECKS:');
  console.log(`    isApiServerEnabled():   ${features.isApiServerEnabled() ? '✅ TRUE' : '❌ FALSE'}`);
  console.log(`    isDatabaseEnabled():    ${features.isDatabaseEnabled() ? '✅ TRUE' : '❌ FALSE'}`);
  console.log(`    isTelegramBotEnabled(): ${features.isTelegramBotEnabled() ? '✅ TRUE' : '❌ FALSE'}`);
  console.log(`    isAuthEnabled():        ${features.isAuthEnabled() ? '✅ TRUE' : '❌ FALSE'}`);
  console.log('');
  
  // Check what the preset SHOULD enable
  console.log('  PRESET ANALYSIS:');
  const presetName = process.env.FEATURE_PRESET || 'basic';
  const presetStatus = manager.applyPreset(presetName);
  console.log(`    Active preset: "${presetName}"`);
  console.log(`    Features in preset: ${presetStatus.enabled.length + presetStatus.disabled.length}`);
  console.log(`    Currently enabled:  ${presetStatus.enabled.length}`);
  console.log(`    Currently disabled: ${presetStatus.disabled.length}`);
  
  if (presetStatus.disabled.length > 0) {
    console.log('');
    console.log('  ⚠️  DISABLED FEATURES (should be enabled by preset):');
    presetStatus.disabled.forEach(f => console.log(`      - ${f}`));
  }
  
  // Check core.api_server specifically
  console.log('');
  console.log('  DEEP DIVE: core.api_server');
  const apiFeature = manager.getFeature('core.api_server');
  if (apiFeature) {
    console.log(`    JSON enabled value:     ${apiFeature.enabled}`);
    console.log(`    Dependencies:           ${apiFeature.dependencies.join(', ') || 'none'}`);
    console.log(`    Required env vars:      ${apiFeature.required_env.join(', ') || 'none'}`);
    console.log(`    Dependencies met:       ${manager.areDependenciesMet(apiFeature) ? '✅ YES' : '❌ NO'}`);
    console.log(`    Env vars present:       ${manager.areRequiredEnvVarsPresent(apiFeature) ? '✅ YES' : '❌ NO'}`);
    
    // Check env override
    const envOverride = process.env.FEATURE_CORE_API_SERVER;
    if (envOverride !== undefined) {
      console.log(`    ENV override active:    ${envOverride}`);
    }
  }
  
} catch (error) {
  console.log(`  ❌ ERROR loading feature system: ${error.message}`);
  console.log(`     Stack: ${error.stack}`);
}

console.log('');

// Step 1.3: Network diagnostics (what we can check from Node)
console.log('─'.repeat(60));
console.log('1.3 PORT 3000 STATUS');
console.log('─'.repeat(60));

const net = require('net');
const server = net.createServer();

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('  ❌ Port 3000 is ALREADY IN USE');
    console.log('  ⚠️  Another process is binding to this port');
    console.log('');
    console.log('  Run in PowerShell to find the process:');
    console.log('    netstat -ano | findstr :3000');
    console.log('');
  } else {
    console.log(`  ❌ Port check error: ${err.message}`);
  }
  finishDiagnostic();
});

server.once('listening', () => {
  console.log('  ✅ Port 3000 is AVAILABLE');
  server.close();
  finishDiagnostic();
});

server.listen(3000);

function finishDiagnostic() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('📋 DIAGNOSTIC COMPLETE');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Next steps based on findings:');
  console.log('  - If isApiServerEnabled() = FALSE → Proceed to Phase 3 (config fix)');
  console.log('  - If Port 3000 IN USE → Proceed to Phase 2 (process cleanup)');
  console.log('  - If both OK but still failing → Check startup-validator errors');
  console.log('');
}
