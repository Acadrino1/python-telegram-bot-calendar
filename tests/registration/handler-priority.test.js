const { describe, it, expect, beforeEach } = require('@jest/globals');

/**
 * Test Handler Priority and Middleware Chain
 * This test specifically focuses on identifying handler conflicts
 * and middleware execution order issues in the registration flow
 */

describe('Handler Priority and Middleware Chain Tests', () => {
  let mockBot;
  let mockCtx;

  beforeEach(() => {
    mockBot = {
      on: jest.fn(),
      action: jest.fn(),
      use: jest.fn()
    };

    mockCtx = {
      session: {},
      from: { id: 12345 },
      message: { text: 'test' },
      reply: jest.fn(),
      editMessageText: jest.fn(),
      answerCbQuery: jest.fn()
    };

    jest.clearAllMocks();
  });

  describe('Text Handler Registration Order', () => {
    it('should register handlers in correct order', () => {
      const BotEngine = require('../../src/bot/BotEngine');
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      
      // Mock environment
      process.env.TELEGRAM_BOT_TOKEN = 'mock_token';
      
      // Create bot instance (this will setup handlers)
      const bot = new SimpleTelegramBot();
      
      // Verify multiple text handlers were registered
      // This will help us understand the handler registration order
      const handlerCalls = mockBot.on.mock.calls || [];
      
      console.log('📊 Handler registration analysis:', {
        totalHandlers: handlerCalls.length,
        textHandlers: handlerCalls.filter(call => call[0] === 'text').length,
        otherHandlers: handlerCalls.filter(call => call[0] !== 'text').map(call => call[0])
      });
    });
  });

  describe('Middleware Chain Execution', () => {
    it('should execute middleware in proper order', async () => {
      const executionOrder = [];
      
      // Mock middleware functions that track execution order
      const middleware1 = async (ctx, next) => {
        executionOrder.push('middleware1-start');
        await next();
        executionOrder.push('middleware1-end');
      };
      
      const middleware2 = async (ctx, next) => {
        executionOrder.push('middleware2-start');
        await next();
        executionOrder.push('middleware2-end');
      };
      
      const handler = async (ctx, next) => {
        executionOrder.push('handler');
        // Don't call next() - handler processes the request
      };
      
      // Simulate middleware chain execution
      await middleware1(mockCtx, () => middleware2(mockCtx, () => handler(mockCtx, () => {})));
      
      expect(executionOrder).toEqual([
        'middleware1-start',
        'middleware2-start', 
        'handler',
        'middleware2-end',
        'middleware1-end'
      ]);
    });

    it('should handle when middleware calls next() vs when it doesn\'t', async () => {
      const executionTracker = [];
      
      const blockingHandler = async (ctx, next) => {
        executionTracker.push('blocking-handler');
        // Don't call next() - this should stop the chain
      };
      
      const unreachableHandler = async (ctx, next) => {
        executionTracker.push('unreachable-handler');
        await next();
      };
      
      // Chain: blockingHandler -> unreachableHandler
      await blockingHandler(mockCtx, () => unreachableHandler(mockCtx, () => {}));
      
      expect(executionTracker).toEqual(['blocking-handler']);
      expect(executionTracker).not.toContain('unreachable-handler');
    });
  });

  describe('Registration Handler vs Message Handler Conflict', () => {
    it('should identify which handler processes text first', async () => {
      const EnhancedCustomerFormHandler = require('../../src/bot/handlers/EnhancedCustomerFormHandler');
      const MessageHandler = require('../../src/bot/handlers/MessageHandler');
      
      const mockServices = {
        commandRegistry: { getCommand: () => null }
      };
      
      const formHandler = new EnhancedCustomerFormHandler();
      const messageHandler = new MessageHandler(mockBot, mockServices);
      
      // Setup active registration session
      mockCtx.session = {
        registration: {
          step: 'firstName',
          awaitingInput: true,
          pendingInput: null,
          data: {}
        }
      };
      
      mockCtx.message = { text: 'John' };
      
      const executionTracker = [];
      
      // Mock the actual handlers with tracking
      const formTextHandler = async (ctx, next) => {
        executionTracker.push('form-handler-start');
        
        if (ctx.session?.registration?.step && ctx.session?.registration?.awaitingInput) {
          executionTracker.push('form-handler-processing');
          ctx.session.registration.pendingInput = ctx.message.text;
          ctx.session.registration.awaitingInput = false;
          // Don't call next() - form handler processes the request
          return;
        }
        
        executionTracker.push('form-handler-passing');
        await next();
      };
      
      const messageTextHandler = async (ctx, next) => {
        executionTracker.push('message-handler-start');
        
        if (ctx.message.text.startsWith('/')) {
          executionTracker.push('message-handler-passing-command');
          return next();
        }
        
        executionTracker.push('message-handler-processing');
        await ctx.reply('Generic response');
      };
      
      // Simulate handler chain: form -> message
      await formTextHandler(mockCtx, () => messageTextHandler(mockCtx, () => {}));
      
      expect(executionTracker).toContain('form-handler-processing');
      expect(executionTracker).not.toContain('message-handler-processing');
      expect(mockCtx.session.registration.pendingInput).toBe('John');
    });

    it('should identify conflicts when registration session is malformed', async () => {
      const executionTracker = [];
      
      // Test various malformed session states
      const testCases = [
        { 
          name: 'missing registration',
          session: {} 
        },
        { 
          name: 'missing step',
          session: { registration: {} } 
        },
        { 
          name: 'missing awaitingInput flag',
          session: { registration: { step: 'firstName' } } 
        },
        { 
          name: 'awaitingInput false',
          session: { registration: { step: 'firstName', awaitingInput: false } } 
        }
      ];
      
      for (const testCase of testCases) {
        executionTracker.length = 0; // Clear tracker
        
        const ctx = { 
          ...mockCtx, 
          session: testCase.session,
          message: { text: 'test input' }
        };
        
        const formHandler = async (ctx, next) => {
          executionTracker.push(`form-start-${testCase.name}`);
          
          if (ctx.session?.registration?.step && ctx.session?.registration?.awaitingInput) {
            executionTracker.push(`form-processing-${testCase.name}`);
            return; // Don't call next
          }
          
          executionTracker.push(`form-passing-${testCase.name}`);
          await next();
        };
        
        const messageHandler = async (ctx, next) => {
          executionTracker.push(`message-processing-${testCase.name}`);
        };
        
        await formHandler(ctx, () => messageHandler(ctx, () => {}));
        
        // Analyze which handler processed the request
        const formProcessed = executionTracker.includes(`form-processing-${testCase.name}`);
        const messagePassed = executionTracker.includes(`form-passing-${testCase.name}`);
        const messageProcessed = executionTracker.includes(`message-processing-${testCase.name}`);
        
        console.log(`Test case: ${testCase.name}`, {
          formProcessed,
          messagePassed,
          messageProcessed,
          executionFlow: executionTracker
        });
        
        if (testCase.name === 'awaitingInput false') {
          // This might be our breaking point - registration exists but not awaiting input
          expect(messagePassed).toBe(true);
          expect(messageProcessed).toBe(true);
        }
      }
    });
  });

  describe('Session State Edge Cases', () => {
    it('should handle session state transitions correctly', async () => {
      const testScenarios = [
        {
          name: 'Initial registration setup',
          initialSession: {},
          expectedBehavior: 'should pass to message handler'
        },
        {
          name: 'Registration started but not awaiting input',
          initialSession: {
            registration: {
              step: 'firstName',
              awaitingInput: false,
              data: {}
            }
          },
          expectedBehavior: 'should pass to message handler'
        },
        {
          name: 'Registration active and awaiting input',
          initialSession: {
            registration: {
              step: 'firstName', 
              awaitingInput: true,
              data: {}
            }
          },
          expectedBehavior: 'should process in form handler'
        },
        {
          name: 'Registration completed',
          initialSession: {
            registration: {
              step: 'confirm',
              awaitingInput: false,
              data: { firstName: 'John' }
            }
          },
          expectedBehavior: 'should pass to message handler'
        }
      ];
      
      for (const scenario of testScenarios) {
        const ctx = { 
          ...mockCtx,
          session: scenario.initialSession,
          message: { text: 'user input' }
        };
        
        let handlerResult = '';
        
        const formHandler = async (ctx, next) => {
          if (ctx.session?.registration?.step && ctx.session?.registration?.awaitingInput) {
            handlerResult = 'form-handler-processed';
            return;
          }
          
          handlerResult = 'form-handler-passed';
          await next();
        };
        
        const messageHandler = async (ctx, next) => {
          handlerResult += '-message-handler-processed';
        };
        
        await formHandler(ctx, () => messageHandler(ctx, () => {}));
        
        console.log(`Scenario: ${scenario.name}`, {
          result: handlerResult,
          expected: scenario.expectedBehavior
        });
        
        if (scenario.expectedBehavior === 'should process in form handler') {
          expect(handlerResult).toBe('form-handler-processed');
        } else {
          expect(handlerResult).toContain('message-handler-processed');
        }
      }
    });
  });

  describe('Real-world Flow Simulation', () => {
    it('should simulate the exact user experience step by step', async () => {
      const flowTracker = [];
      let currentSession = {};
      
      // Step 1: User clicks /book
      flowTracker.push('user-clicks-book');
      
      // Step 2: User selects "New Registration" 
      flowTracker.push('user-selects-new-registration');
      currentSession = {
        booking: { 
          service: 'Lodge Mobile: New Registration',
          requiresForm: true 
        },
        registration: {
          step: 'firstName',
          data: {},
          awaitingInput: false,
          pendingInput: null
        }
      };
      
      // Step 3: User clicks "Start Registration"
      flowTracker.push('user-clicks-start-registration');
      currentSession.registration.awaitingInput = true;
      
      // Step 4: System shows "Please enter your first name:"
      flowTracker.push('system-shows-first-name-prompt');
      
      // Step 5: User types "John" - THIS IS WHERE THE ISSUE OCCURS
      flowTracker.push('user-types-john');
      
      const userInput = 'John';
      const ctx = {
        session: currentSession,
        message: { text: userInput },
        reply: jest.fn()
      };
      
      // Simulate the actual handler logic
      const textHandler = async (ctx, next) => {
        flowTracker.push('text-handler-called');
        
        // This is the actual logic from EnhancedCustomerFormHandler
        if (!ctx.session?.registration?.step || !ctx.session?.registration?.awaitingInput) {
          flowTracker.push('text-handler-conditions-not-met');
          flowTracker.push(`step: ${ctx.session?.registration?.step}`);
          flowTracker.push(`awaitingInput: ${ctx.session?.registration?.awaitingInput}`);
          return next();
        }
        
        flowTracker.push('text-handler-processing-registration');
        
        const step = ctx.session.registration.step;
        const text = ctx.message.text.trim();
        
        // Store the pending input
        ctx.session.registration.pendingInput = text;
        ctx.session.registration.awaitingInput = false;
        
        flowTracker.push('input-stored-successfully');
      };
      
      const next = () => {
        flowTracker.push('passed-to-next-handler');
      };
      
      await textHandler(ctx, next);
      
      console.log('🔍 Flow Analysis:', flowTracker);
      console.log('🔍 Final Session State:', ctx.session.registration);
      
      // Check if the input was processed correctly
      const inputProcessed = ctx.session.registration.pendingInput === 'John';
      const conditionsMet = !flowTracker.includes('text-handler-conditions-not-met');
      
      expect(inputProcessed).toBe(true);
      expect(conditionsMet).toBe(true);
      
      if (!conditionsMet) {
        console.log('❌ ISSUE FOUND: Handler conditions not met');
        console.log('Session state analysis:');
        console.log('- step exists:', !!currentSession.registration?.step);
        console.log('- awaitingInput:', currentSession.registration?.awaitingInput);
      }
    });
  });
});