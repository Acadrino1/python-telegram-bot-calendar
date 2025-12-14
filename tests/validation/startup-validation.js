/**
 * Startup Validation Script
 * 
 * Tests application startup and basic functionality
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class StartupValidator {
  constructor() {
    this.results = {
      startup: null,
      imports: null,
      dependencies: null,
      botConnectivity: null,
      errors: []
    };
  }

  async validateStartup() {
    console.log('🚀 Starting Lodge Scheduler Validation...\n');

    try {
      await this.checkFileStructure();
      await this.validateImports();
      await this.validateDependencies();
      await this.testStartup();
      await this.validateBotConfiguration();
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      this.results.errors.push(error.message);
    }
  }

  async checkFileStructure() {
    console.log('📁 Checking file structure...');
    
    const requiredFiles = [
      'src/index.js',
      'src/bot/bot.js',
      'src/models/User.js',
      'package.json',
      '.env.example'
    ];

    const missingFiles = [];
    
    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
    }

    console.log('✅ File structure check passed\n');
  }

  async validateImports() {
    console.log('🔍 Validating imports...');
    
    const filesToCheck = [
      'src/index.js',
      'src/bot/bot.js',
      'src/models/User.js'
    ];

    const importIssues = [];

    for (const file of filesToCheck) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for problematic imports
        const adminImports = content.match(/require\(['"][^'"]*admin[^'"]*['"]\)/g);
        const supportImports = content.match(/require\(['"][^'"]*support[^'"]*['"]\)/g);
        const broadcastImports = content.match(/require\(['"][^'"]*broadcast[^'"]*['"]\)/g);

        if (adminImports) {
          importIssues.push(`${file}: Found admin imports - ${adminImports.join(', ')}`);
        }
        if (supportImports) {
          importIssues.push(`${file}: Found support imports - ${supportImports.join(', ')}`);
        }
        if (broadcastImports) {
          importIssues.push(`${file}: Found broadcast imports - ${broadcastImports.join(', ')}`);
        }
      }
    }

    this.results.imports = importIssues.length === 0 ? 'PASSED' : 'FAILED';
    
    if (importIssues.length > 0) {
      console.log('⚠️  Import issues found:');
      importIssues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✅ Import validation passed');
    }
    console.log('');
  }

  async validateDependencies() {
    console.log('📦 Checking dependencies...');
    
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

      const coreDeps = [
        'express',
        'node-telegram-bot-api',
        'sequelize',
        'dotenv'
      ];

      const missingDeps = [];
      
      for (const dep of coreDeps) {
        if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
          missingDeps.push(dep);
        }
      }

      this.results.dependencies = missingDeps.length === 0 ? 'PASSED' : 'FAILED';
      
      if (missingDeps.length > 0) {
        console.log(`⚠️  Missing dependencies: ${missingDeps.join(', ')}`);
      } else {
        console.log('✅ Dependencies check passed');
      }
    } catch (error) {
      this.results.dependencies = 'FAILED';
      console.log('❌ Failed to read package.json');
    }
    console.log('');
  }

  async testStartup() {
    console.log('🔄 Testing application startup...');
    
    return new Promise((resolve) => {
      const startProcess = spawn('node', ['src/index.js'], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let hasError = false;

      const timeout = setTimeout(() => {
        startProcess.kill();
        this.results.startup = hasError ? 'FAILED' : 'PASSED';
        
        if (hasError) {
          console.log('❌ Startup test failed - errors detected');
          console.log('Output:', output);
        } else {
          console.log('✅ Startup test passed - no critical errors');
        }
        console.log('');
        resolve();
      }, 8000);

      startProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      startProcess.stderr.on('data', (data) => {
        const error = data.toString();
        output += error;
        
        if (error.includes('Error:') || 
            error.includes('Cannot find module') ||
            error.includes('TypeError') ||
            error.includes('ReferenceError')) {
          hasError = true;
        }
      });

      startProcess.on('error', (error) => {
        hasError = true;
        output += error.toString();
      });

      startProcess.on('exit', (code) => {
        clearTimeout(timeout);
        this.results.startup = (hasError || code !== 0) ? 'FAILED' : 'PASSED';
        
        if (hasError || code !== 0) {
          console.log(`❌ Process exited with code ${code}`);
          console.log('Output:', output);
        } else {
          console.log('✅ Process started successfully');
        }
        console.log('');
        resolve();
      });
    });
  }

  async validateBotConfiguration() {
    console.log('🤖 Validating bot configuration...');
    
    try {
      const botPath = path.join(process.cwd(), 'src/bot/bot.js');
      if (fs.existsSync(botPath)) {
        const botContent = fs.readFileSync(botPath, 'utf8');
        
        // Check for required bot elements
        const hasTelegramBot = botContent.includes('TelegramBot') || botContent.includes('telegram');
        const hasTokenRef = botContent.includes('TOKEN') || botContent.includes('token');
        
        if (hasTelegramBot && hasTokenRef) {
          this.results.botConnectivity = 'PASSED';
          console.log('✅ Bot configuration looks valid');
        } else {
          this.results.botConnectivity = 'FAILED';
          console.log('⚠️  Bot configuration may have issues');
        }
      } else {
        this.results.botConnectivity = 'FAILED';
        console.log('❌ Bot file not found');
      }
    } catch (error) {
      this.results.botConnectivity = 'FAILED';
      console.log('❌ Failed to validate bot configuration');
    }
    console.log('');
  }

  generateReport() {
    console.log('📋 VALIDATION REPORT');
    console.log('=====================');
    console.log(`File Structure: ✅ PASSED`);
    console.log(`Import Validation: ${this.results.imports === 'PASSED' ? '✅' : '❌'} ${this.results.imports}`);
    console.log(`Dependencies: ${this.results.dependencies === 'PASSED' ? '✅' : '❌'} ${this.results.dependencies}`);
    console.log(`Startup Test: ${this.results.startup === 'PASSED' ? '✅' : '❌'} ${this.results.startup}`);
    console.log(`Bot Configuration: ${this.results.botConnectivity === 'PASSED' ? '✅' : '❌'} ${this.results.botConnectivity}`);
    
    if (this.results.errors.length > 0) {
      console.log('\n⚠️  ERRORS FOUND:');
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    const allPassed = Object.values(this.results).every(result => 
      result === 'PASSED' || result === null || (Array.isArray(result) && result.length === 0)
    );

    console.log('\n' + (allPassed ? '🎉 OVERALL: VALIDATION PASSED' : '⚠️  OVERALL: ISSUES FOUND'));
    console.log('=====================\n');
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new StartupValidator();
  validator.validateStartup();
}

module.exports = StartupValidator;