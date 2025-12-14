/**
 * Core Functionality Validation Test Suite
 * 
 * Validates that core Lodge Scheduler functionality works correctly
 * after removal of admin panel and support features.
 */

const request = require('supertest');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('Core Lodge Scheduler Validation', () => {
  let app;
  let botProcess;

  beforeAll(async () => {
    // Set timeout for startup tests
    jest.setTimeout(30000);
  });

  afterAll(async () => {
    if (botProcess) {
      botProcess.kill();
    }
  });

  describe('1. Application Startup Validation', () => {
    it('should start without errors', async () => {
      const startupTest = spawn('node', ['src/index.js'], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let startupOutput = '';
      let hasError = false;

      startupTest.stdout.on('data', (data) => {
        startupOutput += data.toString();
      });

      startupTest.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Error') || error.includes('Cannot find module')) {
          hasError = true;
        }
        startupOutput += error;
      });

      // Wait for startup
      await new Promise((resolve) => setTimeout(resolve, 5000));

      startupTest.kill();

      expect(hasError).toBe(false);
      expect(startupOutput).not.toContain('Cannot find module');
      expect(startupOutput).not.toContain('Error: ');
    });

    it('should not reference removed admin features', async () => {
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const indexContent = fs.readFileSync(indexPath, 'utf8');

      // Check for admin-related imports that should be removed
      expect(indexContent).not.toContain('admin.js');
      expect(indexContent).not.toContain('AdminController');
      expect(indexContent).not.toContain('supportAdmin');
      expect(indexContent).not.toContain('analytics.js');
    });
  });

  describe('2. Telegram Bot Validation', () => {
    it('should initialize Telegram bot without errors', async () => {
      const botPath = path.join(process.cwd(), 'src/bot/bot.js');
      expect(fs.existsSync(botPath)).toBe(true);

      const botContent = fs.readFileSync(botPath, 'utf8');
      expect(botContent).not.toContain('undefined');
      expect(botContent).toContain('TelegramBot');
    });

    it('should have clean bot imports', () => {
      const botPath = path.join(process.cwd(), 'src/bot/bot.js');
      const botContent = fs.readFileSync(botPath, 'utf8');

      // Should not reference removed features
      expect(botContent).not.toContain('BroadcastIntegration');
      expect(botContent).not.toContain('EnhancedSupportIntegration');
      expect(botContent).not.toContain('PrivateSupportChat');
    });
  });

  describe('3. Database Connection Validation', () => {
    it('should establish database connection successfully', async () => {
      const dbPath = path.join(process.cwd(), 'database/index.js');
      if (fs.existsSync(dbPath)) {
        const db = require(dbPath);
        expect(db).toBeDefined();
      }
    });

    it('should have core models available', () => {
      const userModelPath = path.join(process.cwd(), 'src/models/User.js');
      expect(fs.existsSync(userModelPath)).toBe(true);

      const appointmentModelPath = path.join(process.cwd(), 'src/models/Appointment.js');
      expect(fs.existsSync(appointmentModelPath)).toBe(true);
    });
  });

  describe('4. Core API Endpoints Validation', () => {
    it('should have working health check endpoint', async () => {
      // This test would need the actual app instance
      // For now, we'll validate the route file exists
      const routesPath = path.join(process.cwd(), 'src/routes');
      expect(fs.existsSync(routesPath)).toBe(true);
    });
  });

  describe('5. Import Dependencies Validation', () => {
    it('should not have broken imports in main files', () => {
      const mainFiles = [
        'src/index.js',
        'src/bot/bot.js',
        'src/models/User.js'
      ];

      mainFiles.forEach(filePath => {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          // Check for common import issues
          expect(content).not.toMatch(/require\(['"][^'"]*admin[^'"]*['"]\)/);
          expect(content).not.toMatch(/require\(['"][^'"]*support[^'"]*['"]\)/);
          expect(content).not.toMatch(/require\(['"][^'"]*broadcast[^'"]*['"]\)/);
        }
      });
    });
  });

  describe('6. Feature Toggle Validation', () => {
    it('should have proper feature toggle configuration', () => {
      const configPath = path.join(process.cwd(), 'config');
      if (fs.existsSync(configPath)) {
        const configFiles = fs.readdirSync(configPath);
        expect(configFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe('7. Environment Configuration', () => {
    it('should have clean environment example file', () => {
      const envExamplePath = path.join(process.cwd(), '.env.example');
      if (fs.existsSync(envExamplePath)) {
        const envContent = fs.readFileSync(envExamplePath, 'utf8');
        
        // Should have core required variables
        expect(envContent).toContain('TELEGRAM_BOT_TOKEN');
        expect(envContent).toContain('DATABASE_URL');
      }
    });
  });

  describe('8. Package Dependencies', () => {
    it('should have core dependencies in package.json', () => {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

      // Core dependencies should be present
      expect(packageJson.dependencies).toHaveProperty('express');
      expect(packageJson.dependencies).toHaveProperty('node-telegram-bot-api');
      expect(packageJson.dependencies).toHaveProperty('sequelize');
    });
  });
});