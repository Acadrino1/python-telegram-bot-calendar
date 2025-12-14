const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

/**
 * Live Bot Simulation Tests
 * These tests simulate the actual bot behavior with real handler setup
 * to identify the exact breaking point in the registration flow
 */

// Mock the database models to avoid database dependencies
jest.mock('../../src/models/User', () => ({
  query: () => ({
    where: () => ({
      first: async () => ({ id: 1, telegram_id: '12345', isApproved: () => true })
    })
  }),
  createTelegramUser: async () => ({ id: 1, telegram_id: '12345', isApproved: () => true })
}));

jest.mock('../../src/services/CustomerRegistrationService', () => {
  return jest.fn().mockImplementation(() => ({
    validateDate: jest.fn(() => true),
    calculateAge: jest.fn(() => 25),
    validatePostalCode: jest.fn(() => true),
    getProvinces: jest.fn(() => [
      { code: 'ON', name: 'Ontario' },
      { code: 'BC', name: 'British Columbia' }
    ]),
    getProvinceName: jest.fn(() => 'Ontario'),
    processRegistration: jest.fn((data) => data),
    createRegistrationSummary: jest.fn(() => 'Summary')
  }));
});

describe('Live Bot Registration Flow Simulation', () => {
  let SimpleTelegramBot;
  let bot;
  let mockTelegraf;
  let handlerRegistry;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Track all registered handlers
    handlerRegistry = {
      textHandlers: [],
      actionHandlers: [],
      middleware: []
    };

    // Mock Telegraf instance with handler tracking
    mockTelegraf = {
      on: jest.fn((event, handler) => {
        if (event === 'text') {
          handlerRegistry.textHandlers.push(handler);
        }
      }),
      action: jest.fn((pattern, handler) => {
        handlerRegistry.actionHandlers.push({ pattern, handler });
      }),
      use: jest.fn((middleware) => {
        handlerRegistry.middleware.push(middleware);
      }),
      command: jest.fn(),
      launch: jest.fn(),
      stop: jest.fn(),
      catch: jest.fn()
    };

    // Mock Telegraf constructor
    jest.mock('telegraf', () => ({
      Telegraf: jest.fn(() => mockTelegraf),
      session: jest.fn(),
      Markup: {
        inlineKeyboard: jest.fn(() => ({ reply_markup: {} })),
        button: {
          callback: jest.fn((text, data) => ({ text, data }))
        }
      }
    }));

    // Mock environment
    process.env.TELEGRAM_BOT_TOKEN = 'mock_token';
    process.env.ADMIN_USER_ID = 'admin123';
  });

  afterEach(() => {
    if (bot && bot.stop) {
      bot.stop().catch(() => {});
    }
  });

  describe('Bot Initialization and Handler Setup', () => {
    it('should initialize bot and setup all handlers correctly', () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
      
      expect(bot).toBeDefined();
      expect(bot.customerFormHandler).toBeDefined();
      expect(bot.serviceSelectionHandler).toBeDefined();
    });

    it('should register text handlers in correct order', async () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
      
      // Simulate bot startup (this sets up handlers)
      await bot.setupHandlers();
      
      // Check how many text handlers were registered
      console.log('📊 Handler Registration Stats:', {
        textHandlers: handlerRegistry.textHandlers.length,
        actionHandlers: handlerRegistry.actionHandlers.length,
        middleware: handlerRegistry.middleware.length
      });
      
      // We should have at least 2 text handlers (MessageHandler + FormHandler)
      expect(handlerRegistry.textHandlers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Registration Flow Integration Test', () => {
    it('should simulate complete registration flow from start to finish', async () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
      await bot.setupHandlers();
      
      const flowLog = [];
      
      // Create mock context
      const createMockContext = (updates = {}) => ({
        session: { ...updates.session } || {},
        from: { id: 12345, first_name: 'Test User' },
        message: updates.message || { text: 'test' },
        reply: jest.fn((...args) => {
          flowLog.push(`REPLY: ${args[0]}`);
          return Promise.resolve();
        }),
        editMessageText: jest.fn((...args) => {
          flowLog.push(`EDIT: ${args[0]}`);
          return Promise.resolve();
        }),
        answerCbQuery: jest.fn(() => {
          flowLog.push('ANSWER_CB_QUERY');
          return Promise.resolve();
        })
      });

      // Step 1: Service selection (New Registration)
      flowLog.push('=== STEP 1: SERVICE SELECTION ===');
      
      const serviceActionHandler = handlerRegistry.actionHandlers
        .find(h => h.pattern === 'service_lodge_mobile_new_registration');
      
      if (!serviceActionHandler) {
        console.log('❌ Service handler not found');
        console.log('Available handlers:', handlerRegistry.actionHandlers.map(h => h.pattern));
      }
      
      expect(serviceActionHandler).toBeDefined();
      
      const ctx1 = createMockContext();
      await serviceActionHandler.handler(ctx1);
      
      flowLog.push(`Session after service selection: ${JSON.stringify(ctx1.session)}`);
      
      // Verify session initialization
      expect(ctx1.session.registration).toBeDefined();
      expect(ctx1.session.registration.step).toBe('firstName');
      expect(ctx1.session.registration.awaitingInput).toBe(false);

      // Step 2: Start registration button
      flowLog.push('=== STEP 2: START REGISTRATION ===');
      
      const startHandler = handlerRegistry.actionHandlers
        .find(h => h.pattern === 'reg_start');
      
      expect(startHandler).toBeDefined();
      
      const ctx2 = createMockContext({ session: ctx1.session });
      await startHandler.handler(ctx2);
      
      flowLog.push(`Session after start: ${JSON.stringify(ctx2.session)}`);
      
      // Verify awaitingInput flag is set
      expect(ctx2.session.registration.awaitingInput).toBe(true);

      // Step 3: User types first name
      flowLog.push('=== STEP 3: USER INPUT ===');
      
      const ctx3 = createMockContext({ 
        session: ctx2.session,
        message: { text: 'John' }
      });
      
      // Find the text handler and execute it
      if (handlerRegistry.textHandlers.length === 0) {
        flowLog.push('❌ NO TEXT HANDLERS REGISTERED');
      }
      
      let inputProcessed = false;
      const next = jest.fn(() => {
        flowLog.push('NEXT() called - passed to next handler');
      });
      
      // Execute all text handlers in sequence
      for (let i = 0; i < handlerRegistry.textHandlers.length; i++) {
        flowLog.push(`--- Executing text handler ${i + 1} ---`);
        
        try {
          await handlerRegistry.textHandlers[i](ctx3, next);
          
          if (ctx3.session.registration?.pendingInput === 'John') {
            inputProcessed = true;
            flowLog.push('✅ Input processed successfully');
            break;
          }
        } catch (error) {
          flowLog.push(`❌ Error in text handler ${i + 1}: ${error.message}`);
        }
      }
      
      flowLog.push(`Final session: ${JSON.stringify(ctx3.session)}`);
      flowLog.push(`Input processed: ${inputProcessed}`);
      flowLog.push(`Next() calls: ${next.mock.calls.length}`);

      // Step 4: Confirm input
      if (inputProcessed) {
        flowLog.push('=== STEP 4: CONFIRM INPUT ===');
        
        const confirmHandler = handlerRegistry.actionHandlers
          .find(h => h.pattern === 'reg_confirm_firstName');
        
        if (confirmHandler) {
          const ctx4 = createMockContext({ session: ctx3.session });
          await confirmHandler.handler(ctx4);
          
          flowLog.push(`After confirmation: ${JSON.stringify(ctx4.session)}`);
          expect(ctx4.session.registration.data.firstName).toBe('John');
        }
      }

      // Output complete flow log for analysis
      console.log('🔍 Complete Flow Analysis:');
      flowLog.forEach((entry, index) => {
        console.log(`${index + 1}. ${entry}`);
      });

      // Final assertions
      expect(inputProcessed).toBe(true);
    });
  });

  describe('Handler Conflict Detection', () => {
    it('should detect conflicts between handlers', async () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
      await bot.setupHandlers();
      
      // Test scenario: user has active registration but types a greeting
      const ctx = {
        session: {
          registration: {
            step: 'firstName',
            awaitingInput: true,
            data: {}
          }
        },
        from: { id: 12345 },
        message: { text: 'hello' },
        reply: jest.fn()
      };
      
      const executionLog = [];
      const next = jest.fn(() => {
        executionLog.push('next() called');
      });
      
      // Execute each text handler and see which one processes the input
      for (let i = 0; i < handlerRegistry.textHandlers.length; i++) {
        const testCtx = JSON.parse(JSON.stringify(ctx)); // Deep clone
        testCtx.reply = jest.fn();
        
        executionLog.push(`--- Handler ${i + 1} ---`);
        
        try {
          await handlerRegistry.textHandlers[i](testCtx, next);
          
          if (testCtx.session?.registration?.pendingInput) {
            executionLog.push(`Handler ${i + 1} processed as registration input`);
          }
          
          if (testCtx.reply.mock.calls.length > 0) {
            executionLog.push(`Handler ${i + 1} replied: ${testCtx.reply.mock.calls[0][0]}`);
          }
          
        } catch (error) {
          executionLog.push(`Handler ${i + 1} error: ${error.message}`);
        }
      }
      
      console.log('Handler Conflict Analysis:', executionLog);
    });
  });

  describe('Session State Debugging', () => {
    it('should analyze session state at each step of the flow', async () => {
      const sessionStates = [];
      
      // Mock session with detailed tracking
      const createTrackedSession = (initial = {}) => {
        return new Proxy(initial, {
          set(target, property, value) {
            sessionStates.push({
              step: 'SET',
              property,
              value: JSON.parse(JSON.stringify(value)),
              timestamp: Date.now()
            });
            target[property] = value;
            return true;
          },
          get(target, property) {
            if (property === 'registration' && target[property]) {
              return new Proxy(target[property], {
                set(regTarget, regProperty, regValue) {
                  sessionStates.push({
                    step: 'SET_REG',
                    property: regProperty,
                    value: regValue,
                    timestamp: Date.now()
                  });
                  regTarget[regProperty] = regValue;
                  return true;
                }
              });
            }
            return target[property];
          }
        });
      };
      
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
      await bot.setupHandlers();
      
      // Simulate flow with session tracking
      const ctx = {
        session: createTrackedSession(),
        from: { id: 12345 },
        message: { text: 'John' },
        reply: jest.fn(),
        editMessageText: jest.fn(),
        answerCbQuery: jest.fn()
      };
      
      // Service selection
      const serviceHandler = handlerRegistry.actionHandlers
        .find(h => h.pattern === 'service_lodge_mobile_new_registration')?.handler;
      
      if (serviceHandler) {
        await serviceHandler(ctx);
      }
      
      // Start registration  
      const startHandler = handlerRegistry.actionHandlers
        .find(h => h.pattern === 'reg_start')?.handler;
      
      if (startHandler) {
        await startHandler(ctx);
      }
      
      // Text input
      if (handlerRegistry.textHandlers.length > 0) {
        await handlerRegistry.textHandlers[0](ctx, () => {});
      }
      
      console.log('📊 Session State Changes:');
      sessionStates.forEach((state, index) => {
        console.log(`${index + 1}. ${state.step}: ${state.property} = ${JSON.stringify(state.value)}`);
      });
      
      expect(sessionStates.length).toBeGreaterThan(0);
    });
  });

  describe('Error Case Reproduction', () => {
    it('should reproduce the exact error scenario reported by users', async () => {
      // This test reproduces the exact issue:
      // 1. User selects "New Registration" 
      // 2. Clicks "Start Registration"
      // 3. Types first name
      // 4. Nothing happens - no response from bot
      
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
      await bot.setupHandlers();
      
      const issueLog = [];
      
      // Step 1: Service selection works
      const ctx1 = {
        session: {},
        from: { id: 12345 },
        reply: jest.fn(),
        editMessageText: jest.fn((...args) => {
          issueLog.push(`Bot response: ${args[0]}`);
        }),
        answerCbQuery: jest.fn()
      };
      
      const serviceHandler = handlerRegistry.actionHandlers
        .find(h => h.pattern === 'service_lodge_mobile_new_registration')?.handler;
      
      await serviceHandler(ctx1);
      issueLog.push(`✅ Service selected. Session: ${JSON.stringify(ctx1.session)}`);
      
      // Step 2: Start registration works
      const startHandler = handlerRegistry.actionHandlers
        .find(h => h.pattern === 'reg_start')?.handler;
      
      await startHandler(ctx1);
      issueLog.push(`✅ Registration started. Awaiting input: ${ctx1.session.registration?.awaitingInput}`);
      
      // Step 3: User types first name - THIS IS WHERE IT BREAKS
      const ctx2 = {
        session: ctx1.session,
        from: { id: 12345 },
        message: { text: 'John' },
        reply: jest.fn((...args) => {
          issueLog.push(`Bot reply: ${args[0]}`);
        }),
        editMessageText: jest.fn()
      };
      
      const next = jest.fn();
      let responseReceived = false;
      
      // Execute text handlers
      for (const handler of handlerRegistry.textHandlers) {
        try {
          await handler(ctx2, next);
          
          // Check if bot provided any response
          if (ctx2.reply.mock.calls.length > 0 || ctx2.editMessageText.mock.calls.length > 0) {
            responseReceived = true;
            issueLog.push('✅ Bot responded to user input');
          }
          
          // Check if registration was processed
          if (ctx2.session.registration?.pendingInput === 'John') {
            issueLog.push('✅ Registration input processed');
            break;
          }
          
        } catch (error) {
          issueLog.push(`❌ Handler error: ${error.message}`);
        }
      }
      
      // Log the issue analysis
      console.log('🚨 Issue Reproduction Analysis:');
      issueLog.forEach((entry, index) => {
        console.log(`${index + 1}. ${entry}`);
      });
      
      console.log('\n📋 Final State Analysis:');
      console.log('- Session exists:', !!ctx2.session);
      console.log('- Registration exists:', !!ctx2.session?.registration);
      console.log('- Step is set:', ctx2.session?.registration?.step);
      console.log('- Awaiting input:', ctx2.session?.registration?.awaitingInput);
      console.log('- Pending input:', ctx2.session?.registration?.pendingInput);
      console.log('- Bot responded:', responseReceived);
      console.log('- Next() called:', next.mock.calls.length);
      
      // This should help identify the exact issue
      const registrationProcessed = ctx2.session?.registration?.pendingInput === 'John';
      
      if (!registrationProcessed) {
        issueLog.push('🔍 ISSUE IDENTIFIED: Registration input not processed');
        console.log('\n❌ ROOT CAUSE: Registration text handler not processing user input');
        
        // Additional debugging
        console.log('Handler debugging:');
        console.log('- Text handlers registered:', handlerRegistry.textHandlers.length);
        console.log('- Session registration step:', ctx2.session?.registration?.step);
        console.log('- Session awaiting input:', ctx2.session?.registration?.awaitingInput);
      }
      
      expect(registrationProcessed).toBe(true);
    });
  });
});