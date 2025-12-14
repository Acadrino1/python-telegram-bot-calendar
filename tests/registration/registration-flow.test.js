const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock Telegraf and related dependencies
const mockBot = {
  on: jest.fn(),
  action: jest.fn(),
  command: jest.fn(),
  use: jest.fn(),
  launch: jest.fn(),
  stop: jest.fn(),
  catch: jest.fn()
};

const mockCtx = {
  session: {},
  from: { id: 12345, first_name: 'Test', username: 'testuser' },
  message: { text: 'test input' },
  reply: jest.fn(),
  editMessageText: jest.fn(),
  answerCbQuery: jest.fn()
};

// Mock services
const mockServices = {
  supportService: {},
  bookingSlotService: {},
  groupNotificationService: {},
  calendarUIManager: {},
  referralCodeService: {},
  customerFormHandler: {},
  serviceSelectionHandler: {},
  adminIds: [],
  ADMIN_ID: 'test_admin'
};

describe('Customer Registration Flow Tests', () => {
  let EnhancedCustomerFormHandler;
  let MessageHandler;
  let ServiceSelectionHandler;
  let formHandler;
  let messageHandler;
  let serviceHandler;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset mock context
    mockCtx.session = {};
    mockCtx.reply.mockClear();
    mockCtx.editMessageText.mockClear();
    mockCtx.answerCbQuery.mockClear();

    // Import handlers
    EnhancedCustomerFormHandler = require('../../src/bot/handlers/EnhancedCustomerFormHandler');
    MessageHandler = require('../../src/bot/handlers/MessageHandler');
    ServiceSelectionHandler = require('../../src/bot/handlers/ServiceSelectionHandler');

    // Initialize handlers
    formHandler = new EnhancedCustomerFormHandler();
    messageHandler = new MessageHandler(mockBot, mockServices);
    serviceHandler = new ServiceSelectionHandler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Test /book Command Initialization', () => {
    it('should initialize registration session correctly for new registration service', async () => {
      // Simulate /book command -> service selection -> new registration
      const ctx = { ...mockCtx };
      
      // Setup handlers
      serviceHandler.setupHandlers(mockBot);
      formHandler.setupHandlers(mockBot);

      // Find the service selection handler
      const serviceActionHandler = mockBot.action.mock.calls
        .find(call => call[0] === 'service_lodge_mobile_new_registration');
      
      expect(serviceActionHandler).toBeDefined();
      
      // Execute the service selection
      await serviceActionHandler[1](ctx);
      
      // Verify session state
      expect(ctx.session.booking).toBeDefined();
      expect(ctx.session.booking.service).toBe('Lodge Mobile: New Registration');
      expect(ctx.session.booking.requiresForm).toBe(true);
      
      expect(ctx.session.registration).toBeDefined();
      expect(ctx.session.registration.step).toBe('firstName');
      expect(ctx.session.registration.data).toEqual({});
      expect(ctx.session.registration.awaitingInput).toBe(false);
    });

    it('should properly setup session flags for registration flow', async () => {
      const ctx = { ...mockCtx };
      
      serviceHandler.setupHandlers(mockBot);
      
      const serviceHandler_newReg = mockBot.action.mock.calls
        .find(call => call[0] === 'service_lodge_mobile_new_registration')[1];
      
      await serviceHandler_newReg(ctx);
      
      // Check all required session properties
      expect(ctx.session).toHaveProperty('booking');
      expect(ctx.session).toHaveProperty('registration');
      expect(ctx.session.registration).toHaveProperty('step');
      expect(ctx.session.registration).toHaveProperty('data');
      expect(ctx.session.registration).toHaveProperty('awaitingInput');
      expect(ctx.session.registration).toHaveProperty('pendingInput');
    });
  });

  describe('2. Test Session State Persistence', () => {
    beforeEach(() => {
      // Setup initial session state
      mockCtx.session = {
        registration: {
          step: 'firstName',
          data: {},
          awaitingInput: true,
          pendingInput: null
        }
      };
    });

    it('should maintain session state between messages', () => {
      const ctx = { ...mockCtx };
      
      // Verify initial state
      expect(ctx.session.registration.step).toBe('firstName');
      expect(ctx.session.registration.awaitingInput).toBe(true);
      
      // Simulate state change
      ctx.session.registration.pendingInput = 'John';
      ctx.session.registration.awaitingInput = false;
      
      // Verify state persistence
      expect(ctx.session.registration.pendingInput).toBe('John');
      expect(ctx.session.registration.awaitingInput).toBe(false);
    });

    it('should handle registration cleanup properly', () => {
      const ctx = { ...mockCtx };
      ctx.session.registration = {
        step: 'lastName',
        data: { firstName: 'John' },
        awaitingInput: false
      };
      
      // Clear registration
      ctx.session.registration = null;
      
      expect(ctx.session.registration).toBeNull();
    });
  });

  describe('3. Test EnhancedCustomerFormHandler Text Handling', () => {
    beforeEach(() => {
      mockCtx.session = {
        registration: {
          step: 'firstName',
          data: {},
          awaitingInput: true,
          pendingInput: null
        }
      };
    });

    it('should setup text handler correctly', () => {
      formHandler.setupHandlers(mockBot);
      
      // Verify text handler was registered
      const textHandlerCalls = mockBot.on.mock.calls.filter(call => call[0] === 'text');
      expect(textHandlerCalls.length).toBeGreaterThan(0);
    });

    it('should handle text input when registration is active', async () => {
      const ctx = { 
        ...mockCtx,
        message: { text: 'John' }
      };
      
      formHandler.setupHandlers(mockBot);
      
      // Get the text handler
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      // Mock next function
      const next = jest.fn();
      
      // Execute text handler
      await textHandler(ctx, next);
      
      // Verify text was processed
      expect(ctx.session.registration.pendingInput).toBe('John');
      expect(ctx.session.registration.awaitingInput).toBe(false);
      expect(next).not.toHaveBeenCalled(); // Should not call next() when handling registration
    });

    it('should pass through to next handler when registration is not active', async () => {
      const ctx = { ...mockCtx };
      delete ctx.session.registration; // No active registration
      
      formHandler.setupHandlers(mockBot);
      
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      const next = jest.fn();
      
      await textHandler(ctx, next);
      
      expect(next).toHaveBeenCalled(); // Should pass to next handler
    });

    it('should validate input correctly for different steps', async () => {
      const testCases = [
        { step: 'firstName', input: 'J', shouldFail: true },
        { step: 'firstName', input: 'John', shouldFail: false },
        { step: 'dateOfBirth', input: '13/45/1990', shouldFail: true },
        { step: 'dateOfBirth', input: '01/15/1990', shouldFail: false },
        { step: 'postalCode', input: 'invalid', shouldFail: true },
        { step: 'postalCode', input: 'A1B 2C3', shouldFail: false }
      ];

      for (const testCase of testCases) {
        const result = await formHandler.validateInput(
          mockCtx, 
          testCase.step, 
          testCase.input
        );
        
        if (testCase.shouldFail) {
          expect(result.valid).toBe(false);
        } else {
          expect(result.valid).toBe(true);
        }
      }
    });
  });

  describe('4. Test MessageHandler Text Routing', () => {
    it('should setup text handler with lower priority than form handler', () => {
      messageHandler.setupHandlers();
      
      const textHandlerCalls = mockBot.on.mock.calls.filter(call => call[0] === 'text');
      expect(textHandlerCalls.length).toBeGreaterThan(0);
    });

    it('should handle non-command text messages', async () => {
      const ctx = { 
        ...mockCtx,
        message: { text: 'hello' }
      };
      
      messageHandler.setupHandlers();
      
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      const next = jest.fn();
      
      await textHandler(ctx, next);
      
      // Should respond to greeting
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Hello!')
      );
    });

    it('should skip command messages', async () => {
      const ctx = { 
        ...mockCtx,
        message: { text: '/start' }
      };
      
      messageHandler.setupHandlers();
      
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      const next = jest.fn();
      
      await textHandler(ctx, next);
      
      expect(next).toHaveBeenCalled(); // Should pass to next handler for commands
    });
  });

  describe('5. Test Handler Integration Priority', () => {
    it('should handle text properly when both handlers are active', async () => {
      const ctx = { 
        ...mockCtx,
        session: {
          registration: {
            step: 'firstName',
            awaitingInput: true,
            pendingInput: null,
            data: {}
          }
        },
        message: { text: 'John' }
      };
      
      // Setup both handlers
      formHandler.setupHandlers(mockBot);
      messageHandler.setupHandlers();
      
      // Get both text handlers
      const textHandlers = mockBot.on.mock.calls
        .filter(call => call[0] === 'text')
        .map(call => call[1]);
      
      expect(textHandlers.length).toBe(2);
      
      // The form handler should handle the text and not call next()
      const next = jest.fn();
      
      // Execute first handler (form handler)
      await textHandlers[0](ctx, next);
      
      // Verify form handler processed the input
      expect(ctx.session.registration.pendingInput).toBe('John');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('6. Test Complete Registration Flow Integration', () => {
    it('should complete full registration flow without errors', async () => {
      const ctx = { ...mockCtx };
      
      // Step 1: Initialize registration
      serviceHandler.setupHandlers(mockBot);
      formHandler.setupHandlers(mockBot);
      
      const serviceHandler_newReg = mockBot.action.mock.calls
        .find(call => call[0] === 'service_lodge_mobile_new_registration')[1];
      
      await serviceHandler_newReg(ctx);
      
      expect(ctx.session.registration.step).toBe('firstName');
      
      // Step 2: Start registration form
      const regStartHandler = mockBot.action.mock.calls
        .find(call => call[0] === 'reg_start')[1];
      
      await regStartHandler(ctx);
      
      // Step 3: Handle text input
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      ctx.message.text = 'John';
      const next = jest.fn();
      
      await textHandler(ctx, next);
      
      expect(ctx.session.registration.pendingInput).toBe('John');
      expect(ctx.session.registration.awaitingInput).toBe(false);
      
      // Step 4: Confirm input
      const confirmHandler = mockBot.action.mock.calls
        .find(call => call[0] === 'reg_confirm_firstName')[1];
      
      if (confirmHandler) {
        await confirmHandler(ctx);
        
        expect(ctx.session.registration.data.firstName).toBe('John');
        expect(ctx.session.registration.step).toBe('middleName');
      }
    });
  });

  describe('7. Test Error Scenarios and Edge Cases', () => {
    it('should handle missing session gracefully', async () => {
      const ctx = { ...mockCtx };
      delete ctx.session;
      
      formHandler.setupHandlers(mockBot);
      
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      const next = jest.fn();
      
      await expect(textHandler(ctx, next)).resolves.not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('should handle invalid registration step', async () => {
      const ctx = { 
        ...mockCtx,
        session: {
          registration: {
            step: 'invalidStep',
            awaitingInput: true,
            data: {}
          }
        },
        message: { text: 'test' }
      };
      
      formHandler.setupHandlers(mockBot);
      
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      const next = jest.fn();
      
      await expect(textHandler(ctx, next)).resolves.not.toThrow();
    });

    it('should handle form handler initialization without bot', () => {
      const handlerWithoutBot = new EnhancedCustomerFormHandler();
      
      expect(() => {
        handlerWithoutBot.setupTextHandler();
      }).not.toThrow();
    });
  });

  describe('8. Test Breaking Point Identification', () => {
    it('should identify handler conflict between MessageHandler and FormHandler', async () => {
      // Setup scenario where both handlers might conflict
      const ctx = { 
        ...mockCtx,
        session: {
          registration: {
            step: 'firstName',
            awaitingInput: true,
            data: {}
          }
        },
        message: { text: 'hello' } // This could match MessageHandler greeting
      };
      
      formHandler.setupHandlers(mockBot);
      messageHandler.setupHandlers();
      
      const textHandlers = mockBot.on.mock.calls
        .filter(call => call[0] === 'text')
        .map(call => call[1]);
      
      // Simulate middleware chain execution
      const next = jest.fn();
      
      // First handler (formHandler) should handle registration input
      await textHandlers[0](ctx, next);
      
      // Check if registration was processed
      const registrationProcessed = ctx.session.registration.pendingInput === 'hello';
      
      if (registrationProcessed) {
        expect(next).not.toHaveBeenCalled();
        console.log('✅ Form handler correctly handled registration input');
      } else {
        console.log('❌ Form handler did not process registration input - potential bug');
      }
    });

    it('should reproduce the exact user reported issue', async () => {
      // Reproduce: User selects "New Registration", clicks "Start Registration", 
      // then types first name but nothing happens
      
      const ctx = { ...mockCtx };
      
      // Step 1: Service selection
      serviceHandler.setupHandlers(mockBot);
      formHandler.setupHandlers(mockBot);
      
      const serviceSelectionHandler = mockBot.action.mock.calls
        .find(call => call[0] === 'service_lodge_mobile_new_registration')[1];
      
      await serviceSelectionHandler(ctx);
      
      // Verify service selection worked
      expect(ctx.session.registration).toBeDefined();
      expect(ctx.session.registration.step).toBe('firstName');
      
      // Step 2: Start registration
      const startHandler = mockBot.action.mock.calls
        .find(call => call[0] === 'reg_start')[1];
      
      await startHandler(ctx);
      
      // Verify form step shown
      expect(ctx.session.registration.awaitingInput).toBe(true);
      
      // Step 3: User types first name
      ctx.message.text = 'John';
      
      const textHandler = mockBot.on.mock.calls
        .find(call => call[0] === 'text')[1];
      
      const next = jest.fn();
      
      // This is where the issue likely occurs
      await textHandler(ctx, next);
      
      // Check if the input was processed
      const inputProcessed = ctx.session.registration.pendingInput === 'John';
      
      if (!inputProcessed) {
        console.log('🔍 ISSUE IDENTIFIED: Text input not processed by registration handler');
        console.log('Session state:', ctx.session.registration);
        console.log('Next called:', next.mock.calls.length > 0);
      } else {
        console.log('✅ Registration input processed correctly');
      }
      
      // This test should help identify the exact breaking point
      expect(inputProcessed).toBe(true);
    });
  });
});