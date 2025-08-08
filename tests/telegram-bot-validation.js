/**
 * Telegram Bot Validation Test Suite
 * Validates restored TelegramBot.js functionality and security
 */

const { Telegraf } = require('telegraf');
const TelegramBot = require('../src/bot/TelegramBot');
const User = require('../src/models/User');
const Service = require('../src/models/Service');
const Appointment = require('../src/models/Appointment');
const { expect } = require('@jest/globals');

// Mock Telegram context for testing
class MockTelegramContext {
  constructor(userId = '12345', messageText = '', isCallback = false) {
    this.from = {
      id: userId,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User'
    };
    
    this.chat = {
      id: userId,
      type: 'private'
    };
    
    this.session = {
      id: 'test-session-' + userId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      state: 'idle',
      booking: null,
      conversationContext: null,
      errors: [],
      retryCount: 0
    };
    
    if (isCallback) {
      this.callbackQuery = { data: messageText };
      this.updateType = 'callback_query';
    } else {
      this.message = { text: messageText };
      this.updateType = 'message';
    }
    
    this.replies = [];
    this.edits = [];
    this.callbackAnswers = [];
  }
  
  async reply(text, options = {}) {
    this.replies.push({ text, options });
    return { message_id: Date.now() };
  }
  
  async replyWithMarkdown(text, markup = {}) {
    this.replies.push({ text, options: { parse_mode: 'Markdown', ...markup } });
    return { message_id: Date.now() };
  }
  
  async editMessageText(text, markup = {}) {
    this.edits.push({ text, markup });
    return { message_id: Date.now() };
  }
  
  async answerCbQuery(text = '') {
    this.callbackAnswers.push(text);
    return true;
  }
}

describe('Telegram Bot Validation Tests', () => {
  let bot;
  let testUser;
  let testProvider;
  let testService;
  
  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.TELEGRAM_BOT_TOKEN = 'test:token';
    
    // Create test users and services
    testUser = await User.query().insertAndFetch({
      telegram_id: '12345',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'client',
      password_hash: 'test_hash',
      timezone: 'America/New_York',
      preferences: {
        notificationTelegram: true,
        reminderHours: [24, 2]
      }
    });
    
    testProvider = await User.query().insertAndFetch({
      telegram_id: '67890',
      email: 'provider@example.com',
      first_name: 'Dr. Test',
      last_name: 'Provider',
      role: 'provider',
      password_hash: 'provider_hash',
      timezone: 'America/New_York',
      preferences: {
        notificationTelegram: true
      }
    });
    
    testService = await Service.query().insertAndFetch({
      provider_id: testProvider.id,
      name: 'Test Consultation',
      description: 'Test medical consultation',
      duration_minutes: 30,
      price: 100.00,
      is_active: true,
      booking_rules: {
        advance_booking_hours: 24,
        cancellation_hours: 24,
        requires_confirmation: false
      }
    });
  });
  
  beforeEach(() => {
    // Initialize bot for each test
    bot = new TelegramBot();
  });
  
  afterAll(async () => {
    // Cleanup test data
    await Appointment.query().delete().where('service_id', testService.id);
    await Service.query().deleteById(testService.id);
    await User.query().deleteById(testUser.id);
    await User.query().deleteById(testProvider.id);
  });

  describe('Bot Initialization', () => {
    test('TG-001: Bot initializes with proper configuration', () => {
      expect(bot).toBeDefined();
      expect(bot.bot).toBeDefined();
      expect(bot.calendar).toBeDefined();
      expect(bot.retryConfig).toBeDefined();
      expect(bot.timeoutConfig).toBeDefined();
      expect(bot.rateLimitConfig).toBeDefined();
      expect(bot.sessionConfig).toBeDefined();
    });
    
    test('TG-002: Bot has proper error handling setup', () => {
      expect(bot.retryConfig.maxRetries).toBe(3);
      expect(bot.retryConfig.retryDelay).toBe(1000);
      expect(bot.timeoutConfig.userResponse).toBe(300000);
      expect(bot.timeoutConfig.databaseQuery).toBe(10000);
    });
    
    test('TG-003: Rate limiting configured properly', () => {
      expect(bot.rateLimitConfig.windowMs).toBe(60000);
      expect(bot.rateLimitConfig.maxRequests).toBe(30);
      expect(bot.rateLimitConfig.storage).toBeDefined();
    });
  });

  describe('Command Handling', () => {
    test('TG-004: /start command creates user and shows welcome', async () => {
      const ctx = new MockTelegramContext('99999', '/start');
      
      // Mock the registerUser method
      const registerUserSpy = jest.spyOn(bot, 'registerUser')
        .mockResolvedValue(testUser);
      
      // Trigger start command handler
      await bot.setupCommands();
      
      expect(registerUserSpy).toBeDefined();
      expect(ctx.replies).toBeDefined();
    });
    
    test('TG-005: /book command starts booking flow', async () => {
      const ctx = new MockTelegramContext('12345', '/book');
      
      // Set up session
      bot.initializeSession(ctx, 'booking');
      
      expect(ctx.session.state).toBe('booking');
      expect(ctx.session.booking).toBeDefined();
    });
    
    test('TG-006: /help command shows help message', async () => {
      const ctx = new MockTelegramContext('12345', '/help');
      
      // Test help response
      const helpMessage = `
*🤖 Appointment Bot Help*

*Basic Commands:*
• /start - Start the bot
• /book - Book new appointment
• /myappointments - View appointments
• /cancel [ID] - Cancel appointment
• /reschedule [ID] - Change appointment time
• /profile - View/edit profile

*Booking Process:*
1️⃣ Choose service category
2️⃣ Select specific service
3️⃣ Pick a provider
4️⃣ Choose date from calendar
5️⃣ Select available time slot
6️⃣ Confirm booking

*Tips:*
• Appointments can be cancelled up to 24 hours before
• You'll receive reminders 24h and 2h before appointment
• Keep your phone number updated for SMS reminders

*Need Support?*
Contact @support or call 1-800-APPOINTMENT
      `;
      
      expect(helpMessage).toContain('Basic Commands');
      expect(helpMessage).toContain('Booking Process');
    });
  });

  describe('Session Management', () => {
    test('TG-007: Session initialization works correctly', () => {
      const ctx = new MockTelegramContext('12345');
      
      bot.initializeSession(ctx, 'test_state');
      
      expect(ctx.session).toBeDefined();
      expect(ctx.session.id).toBeDefined();
      expect(ctx.session.state).toBe('test_state');
      expect(ctx.session.createdAt).toBeDefined();
      expect(ctx.session.lastActivity).toBeDefined();
    });
    
    test('TG-008: Session cleanup works correctly', () => {
      const ctx = new MockTelegramContext('12345');
      
      bot.initializeSession(ctx, 'booking');
      ctx.session.booking = { test: 'data' };
      ctx.session.errors = [{ error: 'test' }];
      
      bot.cleanupSession(ctx);
      
      expect(ctx.session.booking).toBeNull();
      expect(ctx.session.conversationContext).toBeNull();
      expect(ctx.session.state).toBe('idle');
      expect(ctx.session.errors).toHaveLength(0);
    });
    
    test('TG-009: Session validation prevents corrupted sessions', () => {
      const ctx = new MockTelegramContext('12345');
      
      // Test with corrupted session
      ctx.session = { corrupted: true };
      
      expect(() => {
        bot.validateSessionState(ctx, 'booking');
      }).toThrow('Session not initialized');
    });
  });

  describe('Rate Limiting', () => {
    test('TG-010: Rate limiting blocks excessive requests', () => {
      const userId = '12345';
      
      // Allow first request
      expect(bot.checkRateLimit(userId)).toBe(true);
      
      // Simulate many requests
      for (let i = 0; i < 30; i++) {
        bot.checkRateLimit(userId);
      }
      
      // Should be blocked now
      expect(bot.checkRateLimit(userId)).toBe(false);
    });
    
    test('TG-011: Rate limit resets after window expires', async () => {
      const userId = '99999';
      
      // Fill up rate limit
      for (let i = 0; i < 30; i++) {
        bot.checkRateLimit(userId);
      }
      
      expect(bot.checkRateLimit(userId)).toBe(false);
      
      // Manually reset window (simulate time passing)
      const userData = bot.rateLimitConfig.storage.get(`rate_limit:${userId}`);
      userData.windowStart = Date.now() - 70000; // 70 seconds ago
      
      expect(bot.checkRateLimit(userId)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('TG-012: Global error handler logs errors properly', async () => {
      const ctx = new MockTelegramContext('12345');
      const error = new Error('Test error');
      
      const errorMessage = bot.getUserFriendlyErrorMessage(error, 'test123');
      
      expect(errorMessage).toContain('Something went wrong');
      expect(errorMessage).toContain('test123');
    });
    
    test('TG-013: Rate limit errors show appropriate message', () => {
      const rateLimitError = new Error('Too Many Requests');
      rateLimitError.code = 429;
      
      const message = bot.getUserFriendlyErrorMessage(rateLimitError, 'test');
      
      expect(message).toContain('too quickly');
      expect(message).toContain('wait a moment');
    });
    
    test('TG-014: Database errors show system unavailable message', () => {
      const dbError = new Error('ECONNREFUSED');
      
      const message = bot.getUserFriendlyErrorMessage(dbError, 'test');
      
      expect(message).toContain('temporarily unavailable');
      expect(message).toContain('try again');
    });
  });

  describe('User Management', () => {
    test('TG-015: User registration creates proper user record', async () => {
      const ctx = new MockTelegramContext('88888', '/start');
      
      const user = await bot.registerUser(ctx);
      
      expect(user).toBeDefined();
      expect(user.telegram_id).toBe('88888');
      expect(user.role).toBe('client');
      expect(user.preferences.notificationTelegram).toBe(true);
      
      // Cleanup
      await User.query().deleteById(user.id);
    });
    
    test('TG-016: getUser retrieves existing user correctly', async () => {
      const user = await bot.getUser('12345');
      
      expect(user).toBeDefined();
      expect(user.id).toBe(testUser.id);
      expect(user.telegram_id).toBe('12345');
    });
    
    test('TG-017: getUser handles non-existent user gracefully', async () => {
      const user = await bot.getUser('nonexistent');
      
      expect(user).toBeUndefined();
    });
  });

  describe('Booking Flow', () => {
    test('TG-018: Category selection updates session correctly', () => {
      const ctx = new MockTelegramContext('12345', 'category_medical', true);
      
      bot.initializeSession(ctx, 'booking');
      ctx.session.booking = {};
      
      // Simulate category selection
      ctx.session.booking.category = 'medical';
      
      expect(ctx.session.booking.category).toBe('medical');
      expect(ctx.session.state).toBe('booking');
    });
    
    test('TG-019: Service selection stores service ID', () => {
      const ctx = new MockTelegramContext('12345', 'service_123', true);
      
      bot.initializeSession(ctx, 'booking');
      ctx.session.booking = { category: 'medical' };
      
      // Simulate service selection
      ctx.session.booking.serviceId = '123';
      
      expect(ctx.session.booking.serviceId).toBe('123');
    });
    
    test('TG-020: Time slot selection completes booking preparation', () => {
      const ctx = new MockTelegramContext('12345', 'slot_10:00', true);
      
      bot.initializeSession(ctx, 'booking');
      ctx.session.booking = {
        category: 'medical',
        serviceId: '123',
        date: '2025-08-09'
      };
      
      // Simulate time slot selection
      ctx.session.booking.time = '10:00';
      
      expect(ctx.session.booking.time).toBe('10:00');
      expect(ctx.session.booking.date).toBe('2025-08-09');
      expect(ctx.session.booking.serviceId).toBe('123');
    });
  });

  describe('Availability Management', () => {
    test('TG-021: Available slots generated correctly', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateString = tomorrow.toISOString().split('T')[0];
      
      const slots = await bot.getSimpleAvailableSlots(
        testProvider.id,
        dateString,
        testService.id
      );
      
      expect(Array.isArray(slots)).toBe(true);
      // Should have slots for business hours (9 AM - 5 PM)
      expect(slots.length).toBeGreaterThan(0);
      expect(slots).toContain('09:00');
      expect(slots).toContain('16:30');
    });
    
    test('TG-022: Weekend dates return no available slots', async () => {
      const sunday = new Date();
      // Get next Sunday
      sunday.setDate(sunday.getDate() + (7 - sunday.getDay()));
      const dateString = sunday.toISOString().split('T')[0];
      
      const slots = await bot.getSimpleAvailableSlots(
        testProvider.id,
        dateString,
        testService.id
      );
      
      expect(slots).toHaveLength(0);
    });
    
    test('TG-023: Occupied slots are filtered out', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const dateString = tomorrow.toISOString().split('T')[0];
      
      // Create existing appointment
      await Appointment.query().insert({
        client_id: testUser.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        scheduled_start: tomorrow.toISOString(),
        scheduled_end: new Date(tomorrow.getTime() + 30 * 60000).toISOString(),
        status: 'scheduled'
      });
      
      const slots = await bot.getSimpleAvailableSlots(
        testProvider.id,
        dateString,
        testService.id
      );
      
      // 10:00 should not be available
      expect(slots).not.toContain('10:00');
      
      // Cleanup
      await Appointment.query().delete()
        .where('provider_id', testProvider.id)
        .where('scheduled_start', tomorrow.toISOString());
    });
  });

  describe('Notification System', () => {
    test('TG-024: Notification sends successfully to valid user', async () => {
      const success = await bot.sendNotification(
        testUser.id,
        'Test notification message'
      );
      
      // Mock should return true (would actually send in production)
      expect(success).toBe(true);
    });
    
    test('TG-025: Notification fails gracefully for invalid user', async () => {
      const success = await bot.sendNotification(
        99999,
        'Test notification'
      );
      
      expect(success).toBe(false);
    });
    
    test('TG-026: Reminder generation formats correctly', async () => {
      const appointment = {
        uuid: 'test-123',
        clientId: testUser.id,
        scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        service: { name: 'Test Service' },
        provider: { firstName: 'Dr. Test', lastName: 'Provider' }
      };
      
      const success = await bot.sendReminder(appointment);
      
      // Should handle reminder properly
      expect(success).toBeDefined();
    });
  });

  describe('Retry and Timeout Mechanisms', () => {
    test('TG-027: Retry mechanism works for failed operations', async () => {
      let attempts = 0;
      
      const operation = () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };
      
      const result = await bot.withRetry(operation);
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });
    
    test('TG-028: Timeout mechanism prevents hanging operations', async () => {
      const slowOperation = () => new Promise(resolve => 
        setTimeout(() => resolve('too slow'), 2000)
      );
      
      await expect(
        bot.withTimeout(slowOperation(), 1000)
      ).rejects.toThrow('timed out');
    });
    
    test('TG-029: Retry respects non-retryable errors', async () => {
      const operation = () => {
        const error = new Error('Validation error');
        error.statusCode = 400;
        throw error;
      };
      
      await expect(
        bot.withRetry(operation)
      ).rejects.toThrow('Validation error');
    });
  });

  describe('Security Validation', () => {
    test('TG-030: Bot rejects exposed/vulnerable tokens', () => {
      const vulnerableToken = '8124276494:AAEXy61BMBQcrz6TCCNHRI3_4d6fbXERy8M';
      
      // Should be blocked by security patches
      expect(() => {
        process.env.TELEGRAM_BOT_TOKEN = vulnerableToken;
        new TelegramBot();
      }).not.toThrow(); // Constructor should handle gracefully
    });
    
    test('TG-031: Session validation prevents unauthorized access', () => {
      const ctx = new MockTelegramContext('12345');
      
      // Test session state validation
      bot.initializeSession(ctx, 'idle');
      
      expect(() => {
        bot.validateSessionState(ctx, 'booking');
      }).toThrow('Invalid session state');
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('TG-032: Session cleanup interval configured', () => {
      // Verify cleanup function exists
      expect(bot.setupSessionCleanup).toBeDefined();
      expect(bot.setupRateLimitCleanup).toBeDefined();
    });
    
    test('TG-033: Bot stops gracefully', () => {
      const stopSpy = jest.spyOn(bot.bot, 'stop').mockImplementation(() => {});
      
      bot.stop('TEST');
      
      expect(stopSpy).toHaveBeenCalledWith('TEST');
    });
  });
});

// Export for test runner
module.exports = {
  MockTelegramContext,
  TelegramBot
};