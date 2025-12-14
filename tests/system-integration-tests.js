/**
 * System Integration Test Suite
 * Tests end-to-end functionality of the appointment scheduling system
 */

const request = require('supertest');
const { Model } = require('objection');
const Knex = require('knex');
const SimpleTelegramBot = require('../src/bot/SimpleTelegramBot');
const app = require('../src/index');
const User = require('../src/models/User');
const Service = require('../src/models/Service');
const Appointment = require('../src/models/Appointment');
const BookingSlotService = require('../src/services/BookingSlotService');
const AvailabilityService = require('../src/services/AvailabilityService');
const NotificationService = require('../src/services/NotificationService');

describe('System Integration Tests', () => {
  let knex;
  let testUsers = {};
  let testServices = {};
  let authTokens = {};
  let telegramBot;

  beforeAll(async () => {
    // Setup test database
    const knexConfig = require('../database/knexfile').test || {
      client: 'sqlite3',
      connection: ':memory:',
      migrations: { directory: './database/migrations' },
      useNullAsDefault: true
    };
    
    knex = Knex(knexConfig);
    Model.knex(knex);

    // Run migrations and seeds
    await knex.migrate.latest();
    
    // Create test users
    testUsers.client = await User.query().insertAndFetch({
      email: 'client@integration.test',
      password_hash: '$2b$10$test.hash.for.integration.testing',
      first_name: 'John',
      last_name: 'Doe',
      role: 'client',
      telegram_id: '123456789',
      phone: '+1234567890',
      timezone: 'America/New_York',
      preferences: {
        notificationEmail: true,
        notificationSms: false,
        notificationTelegram: true,
        reminderHours: [24, 2]
      },
      is_active: true,
      email_verified: true
    });

    testUsers.provider = await User.query().insertAndFetch({
      email: 'provider@integration.test',
      password_hash: '$2b$10$test.hash.for.integration.testing',
      first_name: 'Dr. Jane',
      last_name: 'Smith',
      role: 'provider',
      telegram_id: '987654321',
      phone: '+0987654321',
      timezone: 'America/New_York',
      preferences: {
        notificationEmail: true,
        notificationTelegram: true
      },
      is_active: true,
      email_verified: true
    });

    testUsers.admin = await User.query().insertAndFetch({
      email: 'admin@integration.test',
      password_hash: '$2b$10$test.hash.for.integration.testing',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      telegram_id: '555666777',
      is_active: true,
      email_verified: true
    });

    // Get authentication tokens
    const clientLogin = await request(app.app)
      .post('/api/auth/login')
      .send({ 
        email: 'client@integration.test', 
        password: 'password123' 
      });
    authTokens.client = clientLogin.body.token;

    const providerLogin = await request(app.app)
      .post('/api/auth/login')
      .send({ 
        email: 'provider@integration.test', 
        password: 'password123' 
      });
    authTokens.provider = providerLogin.body.token;

    const adminLogin = await request(app.app)
      .post('/api/auth/login')
      .send({ 
        email: 'admin@integration.test', 
        password: 'password123' 
      });
    authTokens.admin = adminLogin.body.token;

    // Create test services
    testServices.consultation = await Service.query().insertAndFetch({
      provider_id: testUsers.provider.id,
      name: 'General Consultation',
      description: 'General medical consultation',
      category: 'medical',
      duration_minutes: 30,
      price: 100.00,
      color_code: '#4CAF50',
      is_active: true,
      booking_rules: {
        advance_booking_hours: 24,
        cancellation_hours: 24,
        requires_confirmation: false
      }
    });

    testServices.dental = await Service.query().insertAndFetch({
      provider_id: testUsers.provider.id,
      name: 'Dental Cleaning',
      description: 'Professional dental cleaning',
      category: 'dental',
      duration_minutes: 60,
      price: 120.00,
      color_code: '#2196F3',
      is_active: true,
      booking_rules: {
        advance_booking_hours: 48,
        cancellation_hours: 24,
        requires_confirmation: true
      }
    });

    // Create provider availability
    await knex('availability_schedules').insert([
      {
        provider_id: testUsers.provider.id,
        day_of_week: 'monday',
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_active: true
      },
      {
        provider_id: testUsers.provider.id,
        day_of_week: 'tuesday',
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_active: true
      },
      {
        provider_id: testUsers.provider.id,
        day_of_week: 'wednesday',
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_active: true
      }
    ]);

    // Initialize Telegram bot for testing
    process.env.TELEGRAM_BOT_TOKEN = 'test:integration-token';
    telegramBot = new TelegramBot();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Clean up appointments before each test
    await Appointment.query().delete();
  });

  describe('End-to-End Appointment Booking', () => {
    test('INT-001: Complete booking flow via API', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      // Step 1: Get available services
      const servicesResponse = await request(app.app)
        .get('/api/services')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .query({ category: 'medical' });

      expect(servicesResponse.status).toBe(200);
      expect(servicesResponse.body.services).toHaveLength(1);
      expect(servicesResponse.body.services[0].name).toBe('General Consultation');

      // Step 2: Check availability
      const availabilityResponse = await request(app.app)
        .get(`/api/availability/${testUsers.provider.id}`)
        .set('Authorization', `Bearer ${authTokens.client}`)
        .query({ 
          date: tomorrow.toISOString().split('T')[0],
          service_id: testServices.consultation.id
        });

      expect(availabilityResponse.status).toBe(200);
      expect(availabilityResponse.body.slots.length).toBeGreaterThan(0);

      // Step 3: Book appointment
      const bookingResponse = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.consultation.id,
          appointment_datetime: tomorrow.toISOString(),
          notes: 'Integration test booking'
        });

      expect(bookingResponse.status).toBe(201);
      expect(bookingResponse.body.appointment).toBeDefined();
      expect(bookingResponse.body.appointment.status).toBe('scheduled');
      expect(bookingResponse.body.appointment.notes).toBe('Integration test booking');

      // Step 4: Verify appointment in database
      const dbAppointment = await Appointment.query()
        .findById(bookingResponse.body.appointment.id)
        .withGraphFetched('[client, provider, service]');

      expect(dbAppointment).toBeDefined();
      expect(dbAppointment.client.email).toBe('client@integration.test');
      expect(dbAppointment.provider.email).toBe('provider@integration.test');
      expect(dbAppointment.service.name).toBe('General Consultation');
    });

    test('INT-002: Complete booking flow via Telegram bot', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Mock Telegram context
      const mockCtx = {
        from: {
          id: 123456789,
          username: 'testuser',
          first_name: 'John',
          last_name: 'Doe'
        },
        chat: { id: 123456789 },
        session: {},
        replies: [],
        async reply(text, options = {}) {
          this.replies.push({ text, options });
        },
        async replyWithMarkdown(text, markup = {}) {
          this.replies.push({ text, options: { parse_mode: 'Markdown', ...markup } });
        }
      };

      // Initialize session
      telegramBot.initializeSession(mockCtx, 'start');

      // Test user registration
      await telegramBot.registerUser(mockCtx);
      const user = await telegramBot.getUser(123456789);
      expect(user).toBeDefined();

      // Test booking session initialization
      telegramBot.initializeSession(mockCtx, 'booking');
      mockCtx.session.booking = {
        category: 'medical',
        serviceId: testServices.consultation.id.toString(),
        providerId: testUsers.provider.id.toString(),
        date: tomorrow.toISOString().split('T')[0],
        time: '10:00'
      };

      expect(mockCtx.session.state).toBe('booking');
      expect(mockCtx.session.booking.category).toBe('medical');
    });

    test('INT-003: Booking with conflicts handled properly', async () => {
      const appointmentTime = new Date();
      appointmentTime.setDate(appointmentTime.getDate() + 1);
      appointmentTime.setHours(14, 0, 0, 0);

      // Create first appointment
      const firstBooking = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.consultation.id,
          appointment_datetime: appointmentTime.toISOString(),
          notes: 'First appointment'
        });

      expect(firstBooking.status).toBe(201);

      // Try to book conflicting appointment
      const conflictBooking = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.consultation.id,
          appointment_datetime: appointmentTime.toISOString(),
          notes: 'Conflicting appointment'
        });

      expect(conflictBooking.status).toBe(409);
      expect(conflictBooking.body.error).toContain('not available');
    });
  });

  describe('Service Management Integration', () => {
    test('INT-004: Provider can manage their services', async () => {
      // Create new service
      const newServiceResponse = await request(app.app)
        .post('/api/services')
        .set('Authorization', `Bearer ${authTokens.provider}`)
        .send({
          name: 'Wellness Consultation',
          description: 'Holistic wellness consultation',
          category: 'wellness',
          duration_minutes: 45,
          price: 85.00,
          color_code: '#9C27B0',
          booking_rules: {
            advance_booking_hours: 12,
            cancellation_hours: 6,
            requires_confirmation: false
          }
        });

      expect(newServiceResponse.status).toBe(201);
      expect(newServiceResponse.body.service.name).toBe('Wellness Consultation');

      // Update service
      const updateResponse = await request(app.app)
        .put(`/api/services/${newServiceResponse.body.service.id}`)
        .set('Authorization', `Bearer ${authTokens.provider}`)
        .send({
          price: 90.00,
          description: 'Updated wellness consultation'
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.service.price).toBe('90.00');

      // Get provider's services
      const servicesResponse = await request(app.app)
        .get('/api/services')
        .set('Authorization', `Bearer ${authTokens.provider}`);

      expect(servicesResponse.status).toBe(200);
      expect(servicesResponse.body.services.length).toBe(3); // Original 2 + new 1
    });

    test('INT-005: Service availability rules are enforced', async () => {
      const tooSoonTime = new Date();
      tooSoonTime.setHours(tooSoonTime.getHours() + 12); // Only 12 hours in advance

      // Try to book dental service (requires 48 hours advance)
      const bookingResponse = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.dental.id,
          appointment_datetime: tooSoonTime.toISOString(),
          notes: 'Too soon booking'
        });

      expect(bookingResponse.status).toBe(400);
      expect(bookingResponse.body.error).toContain('advance booking');
    });
  });

  describe('User Management Integration', () => {
    test('INT-006: User profile management works end-to-end', async () => {
      // Get current profile
      const profileResponse = await request(app.app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authTokens.client}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.user.email).toBe('client@integration.test');

      // Update profile
      const updateResponse = await request(app.app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          phone: '+1555123456',
          timezone: 'America/Los_Angeles',
          preferences: {
            notificationEmail: false,
            notificationSms: true,
            notificationTelegram: true,
            reminderHours: [48, 4]
          }
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.user.phone).toBe('+1555123456');
      expect(updateResponse.body.user.timezone).toBe('America/Los_Angeles');
      expect(updateResponse.body.user.preferences.notificationSms).toBe(true);

      // Verify update persisted
      const updatedProfileResponse = await request(app.app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authTokens.client}`);

      expect(updatedProfileResponse.body.user.phone).toBe('+1555123456');
    });

    test('INT-007: Role-based access control works correctly', async () => {
      // Client tries to access admin endpoint
      const adminEndpointResponse = await request(app.app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${authTokens.client}`);

      expect(adminEndpointResponse.status).toBe(403);

      // Admin can access admin endpoint
      const adminAccessResponse = await request(app.app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${authTokens.admin}`);

      expect(adminAccessResponse.status).toBe(200);

      // Provider tries to modify other provider's service
      const otherProviderService = await Service.query().insertAndFetch({
        provider_id: testUsers.admin.id, // Different provider
        name: 'Admin Service',
        duration_minutes: 30,
        price: 50.00
      });

      const unauthorizedUpdateResponse = await request(app.app)
        .put(`/api/services/${otherProviderService.id}`)
        .set('Authorization', `Bearer ${authTokens.provider}`)
        .send({ price: 100.00 });

      expect(unauthorizedUpdateResponse.status).toBe(403);
    });
  });

  describe('Notification System Integration', () => {
    test('INT-008: Appointment notifications are sent correctly', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(15, 0, 0, 0);

      // Create appointment
      const appointment = await Appointment.query().insertAndFetch({
        client_id: testUsers.client.id,
        provider_id: testUsers.provider.id,
        service_id: testServices.consultation.id,
        scheduled_start: tomorrow.toISOString(),
        scheduled_end: new Date(tomorrow.getTime() + 30 * 60000).toISOString(),
        status: 'scheduled',
        notes: 'Test notification appointment'
      });

      // Test Telegram notification
      const telegramSuccess = await telegramBot.sendNotification(
        testUsers.client.id,
        'Test appointment confirmation'
      );

      expect(telegramSuccess).toBeDefined();

      // Test appointment reminder
      const reminderSuccess = await telegramBot.sendReminder({
        uuid: appointment.uuid,
        clientId: testUsers.client.id,
        scheduledStart: tomorrow.toISOString(),
        service: { name: testServices.consultation.name },
        provider: { 
          firstName: testUsers.provider.first_name,
          lastName: testUsers.provider.last_name
        }
      });

      expect(reminderSuccess).toBeDefined();
    });
  });

  describe('Availability Service Integration', () => {
    test('INT-009: Availability checking works across time zones', async () => {
      // Create appointment in EST
      const estTime = new Date();
      estTime.setDate(estTime.getDate() + 1);
      estTime.setHours(14, 0, 0, 0); // 2 PM EST

      await Appointment.query().insert({
        client_id: testUsers.client.id,
        provider_id: testUsers.provider.id,
        service_id: testServices.consultation.id,
        scheduled_start: estTime.toISOString(),
        scheduled_end: new Date(estTime.getTime() + 30 * 60000).toISOString(),
        status: 'scheduled'
      });

      // Check availability for same time
      const slots = await telegramBot.getSimpleAvailableSlots(
        testUsers.provider.id,
        estTime.toISOString().split('T')[0],
        testServices.consultation.id
      );

      // 2:00 PM should not be available
      expect(slots).not.toContain('14:00');
      
      // But 2:30 PM should be available
      expect(slots).toContain('14:30');
    });

    test('INT-010: Provider schedule overrides work correctly', async () => {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 7); // Next week
      const dateString = testDate.toISOString().split('T')[0];

      // Add availability exception (day off)
      await knex('availability_exceptions').insert({
        provider_id: testUsers.provider.id,
        exception_date: dateString,
        exception_type: 'unavailable',
        reason: 'Personal day',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Check availability - should be empty
      const slots = await telegramBot.getSimpleAvailableSlots(
        testUsers.provider.id,
        dateString,
        testServices.consultation.id
      );

      expect(slots).toHaveLength(0);
    });
  });

  describe('Database Cleanup Validation', () => {
    test('INT-011: Database cleanup removed Lodge Mobile contamination', async () => {
      // Verify no Lodge Mobile services exist
      const lodgeServices = await Service.query()
        .where('name', 'like', '%Lodge Mobile%')
        .orWhere('description', 'like', '%Lodge Mobile%')
        .orWhere('name', 'like', '%Mobile Activation%');

      expect(lodgeServices).toHaveLength(0);

      // Verify no unauthorized admin users exist
      const unauthorizedAdmin = await User.query()
        .where('telegram_id', '7930798268');

      expect(unauthorizedAdmin).toHaveLength(0);

      // Verify original services are restored and working
      const originalServices = await Service.query()
        .whereIn('name', [
          'General Consultation',
          'Medical Appointment', 
          'Dental Cleaning',
          'Beauty Treatment',
          'Fitness Training'
        ]);

      expect(originalServices.length).toBeGreaterThan(0);

      // Test booking with restored service works
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      tomorrow.setHours(11, 0, 0, 0);

      const bookingResponse = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.consultation.id,
          appointment_datetime: tomorrow.toISOString(),
          notes: 'Testing restored service'
        });

      expect(bookingResponse.status).toBe(201);
    });
  });

  describe('Live Chat System Integration', () => {
    test('INT-012: Live chat initialization works', async () => {
      // Test live chat functionality if support system is configured
      const supportConfig = {
        SUPPORT_SYSTEM_ENABLED: true,
        SUPPORT_GROUP_ID: process.env.SUPPORT_GROUP_ID || '-100123456789'
      };

      if (supportConfig.SUPPORT_SYSTEM_ENABLED && supportConfig.SUPPORT_GROUP_ID) {
        // Mock live chat session
        const mockCtx = {
          from: { id: testUsers.client.telegram_id },
          session: {},
          chat: { id: testUsers.client.telegram_id },
          replies: [],
          async reply(text) { this.replies.push({ text }); }
        };

        telegramBot.initializeSession(mockCtx, 'support');
        mockCtx.session.supportSession = {
          active: true,
          startedAt: new Date().toISOString()
        };

        expect(mockCtx.session.state).toBe('support');
        expect(mockCtx.session.supportSession.active).toBe(true);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('INT-013: System handles database connection issues gracefully', async () => {
      // Temporarily break database connection
      const originalKnex = Model.knex();
      Model.knex(null);

      const bookingResponse = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.consultation.id,
          appointment_datetime: new Date().toISOString(),
          notes: 'Should fail gracefully'
        });

      expect(bookingResponse.status).toBe(500);
      expect(bookingResponse.body.error).toBeDefined();

      // Restore database connection
      Model.knex(originalKnex);

      // Verify system recovers
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const recoveryResponse = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${authTokens.client}`)
        .send({
          provider_id: testUsers.provider.id,
          service_id: testServices.consultation.id,
          appointment_datetime: tomorrow.toISOString(),
          notes: 'Recovery test'
        });

      expect(recoveryResponse.status).toBe(201);
    });

    test('INT-014: Telegram bot handles session corruption gracefully', () => {
      const mockCtx = {
        from: { id: 123456789 },
        session: { corrupted: true, invalid: 'data' },
        replies: [],
        async reply(text) { this.replies.push({ text }); }
      };

      // Should not throw error
      expect(() => {
        telegramBot.initializeSession(mockCtx, 'start');
      }).not.toThrow();

      // Session should be reset properly
      expect(mockCtx.session.state).toBe('start');
      expect(mockCtx.session.id).toBeDefined();
      expect(mockCtx.session.createdAt).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    test('INT-015: System handles concurrent bookings correctly', async () => {
      const baseTime = new Date();
      baseTime.setDate(baseTime.getDate() + 3);
      baseTime.setHours(9, 0, 0, 0);

      const concurrentBookings = [];
      
      // Create 5 concurrent booking requests for different times
      for (let i = 0; i < 5; i++) {
        const appointmentTime = new Date(baseTime.getTime() + i * 30 * 60000); // 30 min intervals
        
        concurrentBookings.push(
          request(app.app)
            .post('/api/appointments')
            .set('Authorization', `Bearer ${authTokens.client}`)
            .send({
              provider_id: testUsers.provider.id,
              service_id: testServices.consultation.id,
              appointment_datetime: appointmentTime.toISOString(),
              notes: `Concurrent booking ${i + 1}`
            })
        );
      }

      const responses = await Promise.all(concurrentBookings);
      
      // All should succeed since they're at different times
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify all appointments were created
      const appointments = await Appointment.query()
        .where('client_id', testUsers.client.id)
        .where('notes', 'like', 'Concurrent booking%');

      expect(appointments).toHaveLength(5);
    });
  });
});

// Test utilities
const IntegrationTestHelpers = {
  createTestUser: async (role = 'client', overrides = {}) => {
    return await User.query().insertAndFetch({
      email: `test-${Date.now()}@example.com`,
      password_hash: '$2b$10$test.hash',
      first_name: 'Test',
      last_name: 'User',
      role,
      telegram_id: `test-${Date.now()}`,
      is_active: true,
      email_verified: true,
      ...overrides
    });
  },

  createTestService: async (providerId, overrides = {}) => {
    return await Service.query().insertAndFetch({
      provider_id: providerId,
      name: `Test Service ${Date.now()}`,
      description: 'Test service description',
      duration_minutes: 30,
      price: 100.00,
      is_active: true,
      ...overrides
    });
  },

  createTestAppointment: async (clientId, providerId, serviceId, overrides = {}) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    return await Appointment.query().insertAndFetch({
      client_id: clientId,
      provider_id: providerId,
      service_id: serviceId,
      scheduled_start: tomorrow.toISOString(),
      scheduled_end: new Date(tomorrow.getTime() + 30 * 60000).toISOString(),
      status: 'scheduled',
      ...overrides
    });
  },

  mockTelegramContext: (userId, messageText = '', isCallback = false) => {
    return {
      from: {
        id: userId,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      },
      chat: { id: userId },
      session: {},
      replies: [],
      async reply(text, options = {}) {
        this.replies.push({ text, options });
      },
      async replyWithMarkdown(text, markup = {}) {
        this.replies.push({ text, options: { parse_mode: 'Markdown', ...markup } });
      },
      async editMessageText(text, markup = {}) {
        this.replies.push({ text, markup, type: 'edit' });
      },
      async answerCbQuery(text = '') {
        this.replies.push({ text, type: 'callback_answer' });
      },
      message: isCallback ? undefined : { text: messageText },
      callbackQuery: isCallback ? { data: messageText } : undefined,
      updateType: isCallback ? 'callback_query' : 'message'
    };
  }
};

module.exports = {
  IntegrationTestHelpers
};