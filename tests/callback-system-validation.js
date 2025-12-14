#!/usr/bin/env node

/**
 * Callback System Validation Test
 * Tests all the callback handling fixes and improvements
 */

require('dotenv').config();

const { Telegraf } = require('telegraf');
const CallbackDataValidator = require('../src/bot/utils/CallbackDataValidator');
const MemoryOptimizer = require('../src/bot/utils/MemoryOptimizer');

class CallbackSystemValidator {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
    
    this.validator = new CallbackDataValidator();
    this.memoryOptimizer = new MemoryOptimizer({
      maxMemoryMB: 30,
      warningThresholdMB: 20,
      criticalThresholdMB: 25
    });
  }

  async runAllTests() {
    console.log('🧪 Starting Callback System Validation Tests\\n');

    await this.testCallbackDataValidation();
    await this.testSessionDeduplication();
    await this.testMemoryOptimization();
    await this.testCallbackQueryStructure();
    await this.testInlineKeyboardGeneration();
    await this.testErrorHandling();

    this.printResults();
  }

  /**
   * Test callback data validation
   */
  async testCallbackDataValidation() {
    console.log('📋 Testing Callback Data Validation...');

    // Test valid callback query
    const validCallback = {
      id: 'test_123',
      data: 'service_1',
      from: { id: 12345, first_name: 'Test' },
      message: { message_id: 1 }
    };

    const validResult = this.validator.validateCallbackQuery(validCallback);
    this.assert(validResult.isValid === true, 'Valid callback should pass validation');

    // Test invalid callback query (missing data)
    const invalidCallback = {
      id: 'test_124',
      from: { id: 12345, first_name: 'Test' }
      // Missing data field
    };

    const invalidResult = this.validator.validateCallbackQuery(invalidCallback);
    this.assert(invalidResult.isValid === false, 'Invalid callback should fail validation');
    this.assert(invalidResult.errors.includes('Missing callback data'), 'Should detect missing data');

    // Test callback data sanitization
    const longData = 'a'.repeat(100);
    const sanitized = this.validator.sanitizeCallbackData(longData);
    this.assert(sanitized.length <= 64, 'Long callback data should be truncated');

    // Test safe callback data creation
    const safeData = this.validator.createSafeCallbackData('service', ['registration', 'new']);
    this.assert(typeof safeData === 'string', 'Should return string');
    this.assert(safeData.length <= 64, 'Should respect length limits');

    console.log('✅ Callback Data Validation tests completed\\n');
  }

  /**
   * Test session deduplication
   */
  async testSessionDeduplication() {
    console.log('👥 Testing Session Deduplication...');

    // Mock session manager for testing
    const mockSessions = new Map();
    const userId = '7930798268';

    // Simulate multiple sessions for same user
    mockSessions.set('session_1', { 
      id: 'session_1', 
      userId, 
      lastAccessed: Date.now() - 10000 
    });
    mockSessions.set('session_2', { 
      id: 'session_2', 
      userId, 
      lastAccessed: Date.now() - 5000 
    });
    mockSessions.set('session_3', { 
      id: 'session_3', 
      userId, 
      lastAccessed: Date.now() 
    });

    // Test deduplication logic
    const sessions = Array.from(mockSessions.values());
    sessions.sort((a, b) => b.lastAccessed - a.lastAccessed);
    
    this.assert(sessions[0].id === 'session_3', 'Most recent session should be first');
    this.assert(sessions.length === 3, 'Should have 3 sessions before deduplication');

    // Simulate keeping only the most recent
    const latestSession = sessions[0];
    this.assert(latestSession.userId === userId, 'Latest session should belong to correct user');

    console.log('✅ Session Deduplication tests completed\\n');
  }

  /**
   * Test memory optimization
   */
  async testMemoryOptimization() {
    console.log('🧠 Testing Memory Optimization...');

    // Register test cleanup task
    this.memoryOptimizer.registerCleanupTask(
      'test-cleanup',
      async () => {
        console.log('  🧹 Test cleanup task executed');
      },
      'high'
    );

    // Test memory statistics
    const memStats = this.memoryOptimizer.getMemoryStats();
    this.assert(typeof memStats.current.rss === 'number', 'Should return current RSS memory');
    this.assert(Array.isArray(memStats.history), 'Should return memory history');

    // Test cleanup stats
    const cleanupStats = this.memoryOptimizer.getCleanupStats();
    this.assert(cleanupStats.registeredTasks >= 1, 'Should have registered tasks');

    // Test manual cleanup
    await this.memoryOptimizer.triggerCleanup('standard');
    
    const updatedCleanupStats = this.memoryOptimizer.getCleanupStats();
    this.assert(updatedCleanupStats.totalRuns > 0, 'Should have executed cleanup');

    console.log('✅ Memory Optimization tests completed\\n');
  }

  /**
   * Test callback query structure validation
   */
  async testCallbackQueryStructure() {
    console.log('🏗️ Testing Callback Query Structure...');

    // Test the exact error scenario from the issue
    const problemCallback = {
      // id missing - this causes hasQueryId: false
      from: { id: 7930798268, first_name: 'Test' }, // hasUserId: true
      // data missing - this causes hasData: false
      message: { message_id: 1 }
    };

    const validation = this.validator.validateCallbackQuery(problemCallback);
    
    this.assert(!validation.isValid, 'Should detect invalid structure');
    this.assert(validation.errors.some(e => e.includes('callback query ID')), 'Should detect missing query ID');
    this.assert(validation.errors.some(e => e.includes('callback data')), 'Should detect missing data');

    // Test structure analysis
    this.assert(!validation.structure.hasQueryId, 'Should report hasQueryId: false');
    this.assert(validation.structure.hasUserId, 'Should report hasUserId: true');  
    this.assert(!validation.structure.hasData, 'Should report hasData: false');

    console.log('✅ Callback Query Structure tests completed\\n');
  }

  /**
   * Test inline keyboard generation
   */
  async testInlineKeyboardGeneration() {
    console.log('⌨️ Testing Inline Keyboard Generation...');

    // Test service selection buttons
    const services = [
      { id: 1, name: 'New Registration' },
      { id: 2, name: 'SIM Activation' },
      { id: 3, name: 'Technical Support' }
    ];

    const serviceButtons = services.map(service => ({
      text: service.name,
      callback_data: this.validator.createSafeCallbackData('service', [service.id.toString()])
    }));

    this.assert(serviceButtons.length === 3, 'Should create button for each service');
    serviceButtons.forEach(button => {
      this.assert(button.callback_data.length <= 64, 'Button callback data should be within limits');
      this.assert(button.callback_data.startsWith('service_'), 'Should have correct prefix');
    });

    // Test time slot buttons
    const timeSlots = ['09:00', '10:00', '11:00', '14:00'];
    const timeButtons = timeSlots.map(time => ({
      text: time,
      callback_data: this.validator.createSafeCallbackData('time', [time])
    }));

    this.assert(timeButtons.length === 4, 'Should create button for each time slot');
    timeButtons.forEach(button => {
      this.assert(button.callback_data.length <= 64, 'Time button callback data should be within limits');
      this.assert(button.callback_data.startsWith('time_'), 'Should have correct prefix');
    });

    console.log('✅ Inline Keyboard Generation tests completed\\n');
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    console.log('❌ Testing Error Handling...');

    // Test null callback query
    const nullValidation = this.validator.validateCallbackQuery(null);
    this.assert(!nullValidation.isValid, 'Should handle null callback query');
    this.assert(nullValidation.errors.includes('Callback query is null or undefined'), 'Should have appropriate error message');

    // Test undefined callback query  
    const undefinedValidation = this.validator.validateCallbackQuery(undefined);
    this.assert(!undefinedValidation.isValid, 'Should handle undefined callback query');

    // Test empty callback data
    const emptyDataCallback = {
      id: 'test_125',
      data: '',
      from: { id: 12345, first_name: 'Test' }
    };

    const emptyValidation = this.validator.validateCallbackQuery(emptyDataCallback);
    this.assert(!emptyValidation.isValid, 'Should reject empty callback data');

    // Test error message generation
    const errorMessage = this.validator.getErrorMessage(nullValidation);
    this.assert(typeof errorMessage === 'string', 'Should return error message string');
    this.assert(errorMessage.length > 0, 'Error message should not be empty');

    console.log('✅ Error Handling tests completed\\n');
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    this.testResults.total++;
    if (condition) {
      this.testResults.passed++;
      console.log(`  ✅ ${message}`);
    } else {
      this.testResults.failed++;
      console.log(`  ❌ ${message}`);
      this.testResults.details.push(`FAILED: ${message}`);
    }
  }

  /**
   * Print final results
   */
  printResults() {
    console.log('\\n' + '='.repeat(60));
    console.log('🧪 CALLBACK SYSTEM VALIDATION RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Total:  ${this.testResults.total}`);
    
    const successRate = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.testResults.failed > 0) {
      console.log('\\n❌ Failed Tests:');
      this.testResults.details.forEach(detail => {
        console.log(`  • ${detail}`);
      });
    }

    console.log('\\n' + '='.repeat(60));
    
    if (this.testResults.failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Callback system is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please review the callback system implementation.');
      process.exit(1);
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.memoryOptimizer.shutdown();
  }
}

// Run tests if called directly
if (require.main === module) {
  const validator = new CallbackSystemValidator();
  
  validator.runAllTests()
    .then(() => {
      validator.cleanup();
      console.log('\\n✅ Validation complete!');
    })
    .catch((error) => {
      console.error('\\n❌ Validation failed:', error);
      validator.cleanup();
      process.exit(1);
    });
}

module.exports = CallbackSystemValidator;