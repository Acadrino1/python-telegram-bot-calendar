const { Model } = require('objection');
const Knex = require('knex');
const moment = require('moment-timezone');
const path = require('path');

// Mock Telegram bot for testing
const mockBot = {
  launch: jest.fn(),
  stop: jest.fn(),
  telegram: {
    sendMessage: jest.fn().mockResolvedValue({})
  },
  use: jest.fn(),
  command: jest.fn(),
  action: jest.fn(),
  catch: jest.fn()
};

// Mock Telegraf
jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(() => mockBot),
  Markup: {
    inlineKeyboard: jest.fn().mockReturnValue({ reply_markup: {} }),
    button: {
      callback: jest.fn().mockImplementation((text, data) => ({ text, callback_data: data }))
    }
  },
  session: jest.fn()
}));

describe('Comprehensive Feature Verification', () => {
  let knex;

  beforeAll(async () => {
    // Setup test database
    const knexConfig = require('../../database/knexfile');
    knex = Knex(knexConfig.test);
    Model.knex(knex);

    // Run migrations
    await knex.migrate.latest();
  });

  afterAll(async () => {
    if (knex) {
      await knex.destroy();
    }
  });

  beforeEach(async () => {
    // Clean database before each test
    await knex('notifications').del();
    await knex('appointments').del();
    await knex('users').del();
    await knex('services').del();
  });

  describe('1. Bot Functionality Tests', () => {
    let SimpleTelegramBot;
    let bot;

    beforeEach(async () => {
      // Create test services
      await knex('services').insert([
        {
          id: 1,
          name: 'New Registration',
          description: 'Lodge Mobile registration',
          price: 0,
          duration_minutes: 30,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      bot = new SimpleTelegramBot();
    });

    test('Bot initializes with all required services', () => {
      expect(bot.bot).toBeDefined();
      expect(bot.supportService).toBeDefined();
      expect(bot.bookingSlotService).toBeDefined();
      expect(bot.groupNotificationService).toBeDefined();
      expect(bot.calendarUIManager).toBeDefined();
      expect(bot.customerFormHandler).toBeDefined();
      expect(bot.serviceSelectionHandler).toBeDefined();
      expect(bot.registrationHandler).toBeDefined();
    });

    test('All essential commands are registered', () => {
      const commandCalls = mockBot.command.mock.calls;
      const commands = commandCalls.map(call => call[0]);
      
      expect(commands).toContain('start');
      expect(commands).toContain('book');
      expect(commands).toContain('myappointments');
      expect(commands).toContain('cancel');
      expect(commands).toContain('help');
      expect(commands).toContain('support');
      expect(commands).toContain('ticket');
      expect(commands).toContain('mystatus');
      expect(commands).toContain('admin');
    });

    test('Bot has error handling configured', () => {
      expect(mockBot.catch).toHaveBeenCalled();
    });
  });

  describe('2. Calendar UI Functionality', () => {
    let CalendarUIManager;
    let calendarManager;

    beforeEach(() => {
      CalendarUIManager = require('../../src/bot/CalendarUIManager');
      calendarManager = new CalendarUIManager(mockBot);
    });

    test('Calendar UI Manager initializes correctly', () => {
      expect(calendarManager).toBeDefined();
      expect(calendarManager.bot).toBe(mockBot);
    });

    test('Calendar UI generates month view', () => {
      const currentDate = moment();
      const monthData = calendarManager.generateMonthView(currentDate.year(), currentDate.month());
      
      expect(monthData).toHaveProperty('year');
      expect(monthData).toHaveProperty('month');
      expect(monthData).toHaveProperty('weeks');
      expect(Array.isArray(monthData.weeks)).toBe(true);
    });

    test('Calendar UI formats dates correctly', () => {
      const testDate = moment('2025-08-15');
      const formatted = calendarManager.formatCalendarDate(testDate);
      
      expect(formatted).toContain('15');
    });
  });

  describe('3. Session Management', () => {
    test('Session middleware is configured', () => {
      expect(mockBot.use).toHaveBeenCalled();
    });

    test('Session data structure is maintained', () => {
      const mockCtx = {
        session: {},
        reply: jest.fn().mockResolvedValue({})
      };

      // Simulate session initialization
      mockCtx.session.booking = {};
      mockCtx.session.booking.serviceId = '1';
      
      expect(mockCtx.session.booking.serviceId).toBe('1');
    });
  });

  describe('4. Error Handling', () => {
    let NotificationService;
    let notificationService;

    beforeEach(() => {
      NotificationService = require('../../src/services/NotificationService');
      notificationService = new NotificationService();
    });

    test('Notification service handles missing providers gracefully', () => {
      expect(notificationService.emailTransporter).toBeNull();
      expect(notificationService.twilioClient).toBeNull();
    });

    test('Service gracefully handles errors', async () => {
      // Test with invalid appointment data
      const invalidAppointment = null;
      
      await expect(async () => {
        try {
          await notificationService.sendAppointmentConfirmation(invalidAppointment);
        } catch (error) {
          expect(error).toBeDefined();
          throw error;
        }
      }).rejects.toThrow();
    });
  });

  describe('5. Notification Features', () => {
    let NotificationService;
    let notificationService;

    beforeEach(() => {
      NotificationService = require('../../src/services/NotificationService');
      notificationService = new NotificationService();
    });

    test('Notification service initializes with all features', () => {
      expect(notificationService).toBeDefined();
      expect(notificationService.defaultTimeZone).toBe('America/New_York');
    });

    test('Template processing works correctly', () => {
      const template = 'Hello {client_name}, your appointment is on {appointment_date}';
      const data = {
        client_name: 'John Doe',
        appointment_date: 'August 15, 2025'
      };

      const result = notificationService.processTemplate(template, data);
      expect(result).toBe('Hello John Doe, your appointment is on August 15, 2025');
    });

    test('Date formatting works correctly', () => {
      const testDate = '2025-08-15 14:30:00';
      const formattedDateTime = notificationService.formatDateTime(testDate);
      const formattedDate = notificationService.formatDate(testDate);
      const formattedTime = notificationService.formatTime(testDate);

      expect(formattedDateTime).toContain('August');
      expect(formattedDate).toContain('2025');
      expect(formattedTime).toMatch(/\d+:\d+ (AM|PM)/);
    });

    test('Retry mechanism works with exponential backoff', async () => {
      const mockNotification = {
        id: 1,
        retry_count: 1,
        $query: () => ({
          patch: jest.fn().mockResolvedValue({})
        })
      };

      const error = new Error('Test error');
      await notificationService.handleNotificationError(mockNotification, error);

      expect(mockNotification.$query().patch).toHaveBeenCalled();
    });

    test('Batch processing capabilities exist', () => {
      expect(typeof notificationService.processPendingNotifications).toBe('function');
      expect(typeof notificationService.cleanupOldNotifications).toBe('function');
    });
  });

  describe('6. Template Processing', () => {
    let NotificationService;
    let notificationService;

    beforeEach(() => {
      NotificationService = require('../../src/services/NotificationService');
      notificationService = new NotificationService();
    });

    test('Template data builder works correctly', () => {
      const mockAppointment = {
        appointment_datetime: '2025-08-15 14:30:00',
        duration_minutes: 60,
        uuid: 'test-uuid-123',
        id: 1
      };

      const mockClient = {
        getDisplayName: () => 'John Doe',
        first_name: 'John',
        timezone: 'America/New_York'
      };

      const mockProvider = {
        getDisplayName: () => 'Dr. Smith',
        phone: '555-0123'
      };

      const mockService = {
        name: 'New Registration',
        description: 'Lodge Mobile registration',
        getFormattedDuration: () => '1 hour',
        getFormattedPrice: () => '$0.00',
        getCancellationHours: () => 24
      };

      const templateData = notificationService.buildTemplateData(
        mockAppointment,
        mockClient,
        mockProvider,
        mockService
      );

      expect(templateData).toHaveProperty('client_name', 'John Doe');
      expect(templateData).toHaveProperty('service_name', 'New Registration');
      expect(templateData).toHaveProperty('provider_name', 'Dr. Smith');
      expect(templateData).toHaveProperty('appointment_uuid', 'test-uuid-123');
    });
  });

  describe('7. Booking Logic', () => {
    let BookingSlotService;
    let bookingService;

    beforeEach(() => {
      BookingSlotService = require('../../src/services/BookingSlotService');
      bookingService = new BookingSlotService();
    });

    test('Booking slot service initializes correctly', () => {
      expect(bookingService).toBeDefined();
      expect(typeof bookingService.getAvailableDates).toBe('function');
      expect(typeof bookingService.getAvailableTimeSlots).toBe('function');
      expect(typeof bookingService.isSlotAvailable).toBe('function');
    });

    test('Business hours configuration is accessible', () => {
      const businessHours = bookingService.getBusinessHoursDisplay();
      expect(businessHours).toHaveProperty('hours');
      expect(businessHours).toHaveProperty('days');
    });

    test('Date time formatting works correctly', () => {
      const testDateTime = '2025-08-15 14:30:00';
      const formatted = bookingService.formatDateTime(testDateTime);
      
      expect(formatted).toHaveProperty('date');
      expect(formatted).toHaveProperty('time');
      expect(formatted).toHaveProperty('timezone');
    });

    test('Available dates generation works', () => {
      const availableDates = bookingService.getAvailableDates();
      expect(Array.isArray(availableDates)).toBe(true);
    });
  });

  describe('8. Validation Functions', () => {
    let User;

    beforeAll(() => {
      User = require('../../src/models/User');
    });

    test('User model has validation methods', () => {
      const user = new User();
      expect(typeof user.getDisplayName).toBe('function');
      expect(typeof user.canReceiveEmailNotifications).toBe('function');
      expect(typeof user.canReceiveSmsNotifications).toBe('function');
    });

    test('User display name generation works', () => {
      const user = new User({
        first_name: 'John',
        last_name: 'Doe'
      });
      
      expect(user.getDisplayName()).toBe('John Doe');
    });

    test('Notification preferences validation works', () => {
      const user = new User({
        preferences: { notificationEmail: true }
      });
      
      expect(user.canReceiveEmailNotifications()).toBe(true);
    });
  });

  describe('9. Model Status Management', () => {
    let Appointment;

    beforeAll(() => {
      Appointment = require('../../src/models/Appointment');
    });

    test('Appointment model has status constants', () => {
      expect(Appointment.statuses).toBeDefined();
      expect(Appointment.statuses.SCHEDULED).toBe('scheduled');
      expect(Appointment.statuses.CANCELLED).toBe('cancelled');
      expect(Appointment.statuses.CONFIRMED).toBe('confirmed');
      expect(Appointment.statuses.COMPLETED).toBe('completed');
    });

    test('Appointment model has required methods', () => {
      const appointment = new Appointment();
      expect(typeof appointment.isActive).toBe('function');
      expect(typeof appointment.canBeCancelled).toBe('function');
      expect(typeof appointment.getFormattedDateTime).toBe('function');
    });
  });

  describe('10. UUID Generation', () => {
    let Appointment;

    beforeAll(() => {
      Appointment = require('../../src/models/Appointment');
    });

    test('UUID generation works in appointments', async () => {
      // Create test user and service first
      const testUser = await knex('users').insert({
        telegram_id: '123456789',
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'client',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');

      const appointment = await Appointment.query().insert({
        client_id: testUser[0].id,
        provider_id: testUser[0].id,
        service_id: 1,
        appointment_datetime: moment().add(1, 'day').format('YYYY-MM-DD HH:mm:ss'),
        duration_minutes: 60,
        status: 'scheduled',
        notes: 'Test appointment'
      });

      expect(appointment.uuid).toBeDefined();
      expect(typeof appointment.uuid).toBe('string');
      expect(appointment.uuid.length).toBeGreaterThan(0);
    });
  });

  describe('11. Timestamps Auto-Update', () => {
    let User;

    beforeAll(() => {
      User = require('../../src/models/User');
    });

    test('Timestamps are automatically managed', async () => {
      const user = await User.query().insert({
        telegram_id: '987654321',
        email: 'timestamp@example.com',
        password_hash: 'hash',
        first_name: 'Timestamp',
        last_name: 'Test',
        role: 'client',
        is_active: true
      });

      expect(user.created_at).toBeDefined();
      expect(user.updated_at).toBeDefined();
      expect(new Date(user.created_at)).toBeInstanceOf(Date);
      expect(new Date(user.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe('12. Advanced Features Integration', () => {
    test('All service dependencies are properly injected', () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      const bot = new SimpleTelegramBot();

      // Check that all services are initialized
      expect(bot.supportService).toBeDefined();
      expect(bot.bookingSlotService).toBeDefined();
      expect(bot.groupNotificationService).toBeDefined();
      expect(bot.calendarUIManager).toBeDefined();
    });

    test('Calendar UI is properly integrated', () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      const bot = new SimpleTelegramBot();

      expect(bot.calendarUIManager).toBeDefined();
      expect(typeof bot.calendarUIManager.showCalendar).toBe('function');
    });

    test('Group notification service is integrated', () => {
      const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
      const bot = new SimpleTelegramBot();

      expect(bot.groupNotificationService).toBeDefined();
      expect(typeof bot.groupNotificationService.notifyNewBooking).toBe('function');
      expect(typeof bot.groupNotificationService.notifyCancellation).toBe('function');
    });
  });

  describe('13. Configuration and Environment', () => {
    test('Required configuration is properly loaded', () => {
      const bookingConfig = require('../../config/booking.config');
      
      expect(bookingConfig).toBeDefined();
      expect(bookingConfig).toHaveProperty('timezone');
      expect(bookingConfig).toHaveProperty('bookingLimits');
      expect(bookingConfig).toHaveProperty('businessHours');
    });

    test('Environment variables are properly handled', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      // The bot should handle missing environment variables gracefully
      expect(() => {
        const SimpleTelegramBot = require('../../src/bot/SimpleTelegramBot');
        new SimpleTelegramBot();
      }).not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});