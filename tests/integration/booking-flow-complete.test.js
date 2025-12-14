/**
 * Comprehensive Booking Flow Testing Suite
 * Tests the complete end-to-end booking process including:
 * - Database operations
 * - User registration
 * - Appointment booking
 * - Confirmation flow
 * - Support commands
 */

const request = require('supertest');
const { Telegraf } = require('telegraf');
const knex = require('../../database/knexfile');
const db = require('knex')(knex.test);
const User = require('../../src/models/User');
const Appointment = require('../../src/models/Appointment');
const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');

describe('Complete Booking Flow Tests', () => {
  let bot;
  let testUser;
  let testTelegramId = '123456789';

  beforeAll(async () => {
    // Initialize test database
    await db.migrate.latest();
    
    // Initialize bot
    bot = new SimpleTelegramBot();
    await bot.initialize();
  });

  beforeEach(async () => {
    // Clean database before each test
    await db('appointments').del();
    await db('users').del();
    
    // Create test user
    testUser = await User.query().insert({
      telegram_id: testTelegramId,
      first_name: 'Test',
      last_name: 'User',
      email: `telegram_${testTelegramId}@telegram.local`,
      is_active: true,
      role: 'client',
      preferences: JSON.stringify({ notificationTelegram: true })
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('1. Database Schema Validation', () => {
    it('should have correct users table schema', async () => {
      const columns = await db('users').columnInfo();
      
      // Check required columns exist
      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('telegram_id');
      expect(columns).toHaveProperty('first_name');
      expect(columns).toHaveProperty('last_name');
      expect(columns).toHaveProperty('email');
      expect(columns).toHaveProperty('is_active');
      expect(columns).toHaveProperty('role');
      expect(columns).toHaveProperty('preferences');
      
      // Check for problematic columns
      console.log('Users table columns:', Object.keys(columns));
    });

    it('should have correct appointments table schema', async () => {
      const columns = await db('appointments').columnInfo();
      
      expect(columns).toHaveProperty('id');
      expect(columns).toHaveProperty('user_id');
      expect(columns).toHaveProperty('date');
      expect(columns).toHaveProperty('time');
      expect(columns).toHaveProperty('status');
      
      console.log('Appointments table columns:', Object.keys(columns));
    });
  });

  describe('2. User Registration Flow', () => {
    beforeEach(async () => {
      // Remove test user for registration tests
      await db('users').where('telegram_id', testTelegramId).del();
    });

    it('should register new user without password_hash field', async () => {
      const mockCtx = {
        from: {
          id: parseInt(testTelegramId),
          first_name: 'Test',
          last_name: 'User'
        },
        reply: jest.fn(),
        replyWithHTML: jest.fn()
      };

      // Test registration
      await expect(bot.registerUser(mockCtx)).resolves.not.toThrow();
      
      // Verify user was created
      const user = await User.query().findOne({ telegram_id: testTelegramId });
      expect(user).toBeTruthy();
      expect(user.first_name).toBe('Test');
      expect(user.last_name).toBe('User');
    });

    it('should handle existing user gracefully', async () => {
      const mockCtx = {
        from: {
          id: parseInt(testTelegramId),
          first_name: 'Test',
          last_name: 'Updated'
        },
        reply: jest.fn(),
        replyWithHTML: jest.fn()
      };

      // Should not throw error for existing user
      await expect(bot.registerUser(mockCtx)).resolves.not.toThrow();
    });
  });

  describe('3. Booking Confirmation Flow', () => {
    it('should process booking confirmation correctly', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        session: {
          bookingData: {
            date: '2025-08-09',
            time: '10:00',
            service: 'Test Service',
            duration: 60
          }
        }
      };

      // Mock bot.findOrCreateUser to return our test user
      jest.spyOn(bot, 'findOrCreateUser').mockResolvedValue(testUser);

      // Process confirmation
      await bot.handleBookingConfirmation(mockCtx);

      // Verify appointment was created
      const appointments = await Appointment.query()
        .where('user_id', testUser.id);
      
      expect(appointments).toHaveLength(1);
      expect(appointments[0].date).toBe('2025-08-09');
      expect(appointments[0].time).toBe('10:00');
    });

    it('should handle confirmation without valid user', async () => {
      const mockCtx = {
        from: { id: 999999999 }, // Non-existent user
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        session: {
          bookingData: {
            date: '2025-08-09',
            time: '10:00',
            service: 'Test Service'
          }
        }
      };

      // Should handle gracefully
      await expect(bot.handleBookingConfirmation(mockCtx)).resolves.not.toThrow();
      
      // Should prompt for registration
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('register')
      );
    });
  });

  describe('4. Registration Form Flow', () => {
    beforeEach(async () => {
      await db('users').where('telegram_id', testTelegramId).del();
    });

    it('should progress through registration fields with forceReply', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        session: {}
      };

      // Start registration
      await bot.startRegistration(mockCtx);
      
      // Should ask for first field with forceReply
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            force_reply: true
          })
        })
      );
    });

    it('should handle all 13 registration fields', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        message: { text: 'Test Input' },
        session: {
          registrationData: {},
          currentField: 'first_name'
        }
      };

      const fields = [
        'first_name', 'last_name', 'email', 'phone', 'date_of_birth',
        'emergency_contact_name', 'emergency_contact_phone', 'medical_conditions',
        'medications', 'dietary_restrictions', 'special_requests',
        'preferred_contact_method', 'timezone'
      ];

      for (let i = 0; i < fields.length; i++) {
        mockCtx.session.currentField = fields[i];
        
        await bot.handleRegistrationInput(mockCtx);
        
        if (i < fields.length - 1) {
          // Should proceed to next field
          expect(mockCtx.reply).toHaveBeenCalled();
        }
      }
    });
  });

  describe('5. Support Commands', () => {
    it('should handle /ticket command', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn()
      };

      await bot.handleTicketCommand(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should handle /support command', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn()
      };

      await bot.handleSupportCommand(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should create support ticket properly', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        message: { text: 'I need help with booking' }
      };

      // Mock user lookup
      jest.spyOn(bot, 'findOrCreateUser').mockResolvedValue(testUser);

      await bot.createSupportTicket(mockCtx, 'Test issue');
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('support ticket')
      );
    });
  });

  describe('6. Error Handling and Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // Mock database error
      jest.spyOn(User.query(), 'insert').mockRejectedValue(new Error('DB Error'));

      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn()
      };

      await expect(bot.registerUser(mockCtx)).resolves.not.toThrow();
      
      // Should show error message to user
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    it('should handle invalid booking data', async () => {
      const mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        session: {
          bookingData: null // Invalid booking data
        }
      };

      await bot.handleBookingConfirmation(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('7. Integration Tests', () => {
    it('should complete full booking flow end-to-end', async () => {
      // Step 1: User starts booking
      let mockCtx = {
        from: { id: parseInt(testTelegramId) },
        reply: jest.fn(),
        replyWithHTML: jest.fn(),
        session: {}
      };

      // Step 2: Select date and time
      mockCtx.session.bookingData = {
        date: '2025-08-09',
        time: '14:00',
        service: 'Consultation',
        duration: 60
      };

      // Step 3: Confirm booking
      jest.spyOn(bot, 'findOrCreateUser').mockResolvedValue(testUser);
      await bot.handleBookingConfirmation(mockCtx);

      // Verify booking was created
      const appointments = await Appointment.query()
        .where('user_id', testUser.id);
      
      expect(appointments).toHaveLength(1);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('confirmed')
      );
    });
  });
});

// Test runner helper
if (require.main === module) {
  console.log('Running booking flow tests...');
  
  // Run jest programmatically
  const { runCLI } = require('jest');
  
  runCLI({
    testPathPattern: __filename,
    verbose: true
  }, [process.cwd()]).then((results) => {
    console.log('Test Results:', results);
    process.exit(results.success ? 0 : 1);
  });
}

module.exports = {
  testSuite: 'BookingFlowComplete'
};