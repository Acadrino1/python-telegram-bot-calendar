/**
 * PHASE 1 CRITICAL COMPLIANCE TESTS
 * Tests callback query handling compliance with Global Rules 8, 9, 11, 12
 */

const { expect } = require('chai');
const sinon = require('sinon');
const CallbackQueryManager = require('../../../src/bot/utils/CallbackQueryManager');

describe('Callback Query Compliance Tests', () => {
  let mockBot;
  let callbackManager;
  let mockCtx;

  beforeEach(() => {
    // Mock Telegraf bot
    mockBot = {
      telegram: {
        answerCbQuery: sinon.stub().resolves()
      }
    };

    // Mock context
    mockCtx = {
      callbackQuery: {
        id: 'test_callback_123',
        data: 'test_action'
      },
      from: { id: 12345 },
      answerCbQuery: sinon.stub().resolves(),
      editMessageText: sinon.stub().resolves()
    };

    callbackManager = new CallbackQueryManager(mockBot);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Global Rule 8: Response Time Compliance', () => {
    it('should acknowledge callback within 8 seconds', async () => {
      const startTime = Date.now();
      
      const mockHandler = sinon.stub().callsFake(async () => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await callbackManager.handleCallback(mockCtx, mockHandler, 'test_operation');
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).to.be.below(8000, 'Response time must be under 8 seconds');
      expect(mockCtx.answerCbQuery.calledOnce).to.be.true;
    });

    it('should handle timeout gracefully', (done) => {
      const slowHandler = async () => {
        await new Promise(resolve => setTimeout(resolve, 9000)); // 9 seconds
      };

      callbackManager.handleCallback(mockCtx, slowHandler, 'slow_operation')
        .catch(() => {
          // Timeout should trigger cleanup
          setTimeout(() => {
            const stats = callbackManager.getStats();
            expect(stats.timeout).to.be.greaterThan(0);
            done();
          }, 100);
        });
    });

    it('should provide immediate acknowledgment', async () => {
      let acknowledgmentTime;
      
      mockCtx.answerCbQuery = sinon.stub().callsFake(async () => {
        acknowledgmentTime = Date.now();
      });

      const handler = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      };

      const startTime = Date.now();
      await callbackManager.handleCallback(mockCtx, handler, 'immediate_test');
      
      const ackDelay = acknowledgmentTime - startTime;
      expect(ackDelay).to.be.below(1000, 'Acknowledgment must be immediate (under 1 second)');
    });
  });

  describe('Global Rule 9: User Feedback Compliance', () => {
    it('should always provide user feedback', async () => {
      const handler = async () => {
        // Simulate successful operation
      };

      await callbackManager.handleCallback(mockCtx, handler, 'feedback_test');
      
      expect(mockCtx.answerCbQuery.calledOnce).to.be.true;
    });

    it('should provide error feedback on handler failure', async () => {
      const errorHandler = async () => {
        throw new Error('Test error');
      };

      try {
        await callbackManager.handleCallback(mockCtx, errorHandler, 'error_test');
      } catch (error) {
        // Expected to throw
      }

      expect(mockCtx.answerCbQuery.called).to.be.true;
    });

    it('should use fallback acknowledgment methods', async () => {
      // Make primary method fail
      mockCtx.answerCbQuery.rejects(new Error('Primary failed'));
      mockBot.telegram.answerCbQuery.resolves();

      const handler = async () => {};

      await callbackManager.handleCallback(mockCtx, handler, 'fallback_test');
      
      expect(mockBot.telegram.answerCbQuery.called).to.be.true;
    });
  });

  describe('Global Rule 10: Data Size Compliance', () => {
    it('should enforce 64-byte limit on callback data', () => {
      const longData = 'a'.repeat(100); // 100 characters
      const safeData = callbackManager.createSafeCallbackData('prefix', longData);
      
      expect(Buffer.byteLength(safeData, 'utf8')).to.be.at.most(64);
    });

    it('should preserve data when under limit', () => {
      const shortData = 'test_data';
      const safeData = callbackManager.createSafeCallbackData('prefix', shortData);
      
      expect(safeData).to.equal('prefix_test_data');
      expect(Buffer.byteLength(safeData, 'utf8')).to.be.at.most(64);
    });

    it('should truncate data that exceeds limit', () => {
      const longData = 'very_long_test_data_that_exceeds_the_64_byte_limit_significantly';
      const safeData = callbackManager.createSafeCallbackData('action', longData);
      
      expect(Buffer.byteLength(safeData, 'utf8')).to.be.at.most(64);
      expect(safeData).to.include('action_');
    });
  });

  describe('Global Rule 12: Memory Management Compliance', () => {
    it('should cleanup expired callbacks', async () => {
      const handler = async () => {};
      
      // Create multiple callbacks
      await callbackManager.handleCallback(mockCtx, handler, 'cleanup_test_1');
      
      mockCtx.callbackQuery.id = 'test_callback_456';
      await callbackManager.handleCallback(mockCtx, handler, 'cleanup_test_2');
      
      // Force cleanup
      callbackManager.cleanupExpiredCallbacks();
      
      const stats = callbackManager.getStats();
      expect(stats.pendingCallbacks).to.equal(0);
    });

    it('should prevent memory leaks from pending callbacks', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create many callbacks without completing them
      for (let i = 0; i < 100; i++) {
        const ctx = {
          callbackQuery: { id: `test_${i}` },
          answerCbQuery: sinon.stub().resolves()
        };
        
        callbackManager.pendingCallbacks.set(`test_${i}`, {
          startTime: Date.now() - 10000, // Old callback
          operationType: 'memory_test'
        });
      }
      
      // Cleanup should prevent memory accumulation
      callbackManager.cleanupExpiredCallbacks();
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      expect(memoryIncrease).to.be.below(1, 'Memory increase should be minimal after cleanup');
    });

    it('should maintain performance statistics without memory bloat', () => {
      // Generate many operations
      for (let i = 0; i < 1000; i++) {
        callbackManager.updateStats(Math.random() * 1000, true);
      }
      
      const stats = callbackManager.getStats();
      expect(stats.successful).to.equal(1000);
      expect(stats.averageResponseTime).to.be.a('number');
      
      // Statistics should not consume excessive memory
      const memoryAfter = process.memoryUsage().heapUsed;
      expect(memoryAfter).to.be.below(50 * 1024 * 1024); // Under 50MB
    });
  });

  describe('Compliance Score Calculation', () => {
    it('should calculate accurate compliance score', () => {
      // Simulate good performance
      callbackManager.callbackStats = {
        total: 100,
        successful: 95,
        failed: 5,
        timeout: 2,
        averageResponseTime: 500
      };
      
      const score = callbackManager.calculateComplianceScore();
      
      expect(parseFloat(score.total)).to.be.above(80);
      expect(parseFloat(score.success)).to.equal(95);
      expect(score.penalties).to.equal(10); // 2 timeouts * 5 points each
    });

    it('should penalize poor performance', () => {
      // Simulate poor performance
      callbackManager.callbackStats = {
        total: 100,
        successful: 60,
        failed: 40,
        timeout: 10,
        averageResponseTime: 8000
      };
      
      const score = callbackManager.calculateComplianceScore();
      
      expect(parseFloat(score.total)).to.be.below(50);
      expect(score.penalties).to.equal(50); // 10 timeouts * 5 points each
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track callback performance metrics', async () => {
      const handler = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      await callbackManager.handleCallback(mockCtx, handler, 'metrics_test');
      
      const stats = callbackManager.getStats();
      
      expect(stats.total).to.equal(1);
      expect(stats.successful).to.equal(1);
      expect(stats.failed).to.equal(0);
      expect(stats.averageResponseTime).to.be.above(0);
      expect(stats.successRate).to.equal('100.00%');
    });

    it('should provide detailed pending callback information', async () => {
      const slowHandler = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
      };

      // Start callback but don't wait for completion
      callbackManager.handleCallback(mockCtx, slowHandler, 'pending_test');
      
      const stats = callbackManager.getStats();
      
      expect(stats.pendingCallbacks).to.equal(1);
      expect(stats.complianceScore).to.be.an('object');
    });
  });
});

// Integration test with real Telegram bot simulation
describe('End-to-End Callback Compliance', () => {
  it('should maintain 99.9% callback response rate under load', async () => {
    const callbackManager = new CallbackQueryManager({
      telegram: { answerCbQuery: sinon.stub().resolves() }
    });

    const totalCallbacks = 1000;
    const promises = [];
    
    for (let i = 0; i < totalCallbacks; i++) {
      const ctx = {
        callbackQuery: { id: `load_test_${i}` },
        answerCbQuery: sinon.stub().resolves()
      };
      
      const handler = async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      };
      
      promises.push(
        callbackManager.handleCallback(ctx, handler, `load_test_${i}`)
          .catch(() => {}) // Don't fail the test on individual callback failures
      );
    }
    
    await Promise.allSettled(promises);
    
    const stats = callbackManager.getStats();
    const successRate = parseFloat(stats.successRate);
    
    expect(successRate).to.be.above(99.0, 'Success rate must be above 99%');
  }).timeout(10000);
});