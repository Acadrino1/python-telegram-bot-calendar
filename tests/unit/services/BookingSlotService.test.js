const { Model } = require('objection');
const Knex = require('knex');
const BookingSlotService = require('../../../src/services/BookingSlotService');
const Appointment = require('../../../src/models/Appointment');
const Service = require('../../../src/models/Service');

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('BookingSlotService', () => {
  let knex;
  let bookingService;
  let testProvider;
  let testService;

  beforeAll(async () => {
    knex = Knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    });
    
    Model.knex(knex);
    
    // Create test tables
    await knex.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('first_name');
      table.string('last_name');
      table.string('role').defaultTo('client');
      table.timestamps(true, true);
    });

    await knex.schema.createTable('services', table => {
      table.increments('id').primary();
      table.integer('provider_id').references('users.id');
      table.string('name');
      table.integer('duration_minutes');
      table.decimal('price', 8, 2);
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });

    await knex.schema.createTable('appointments', table => {
      table.increments('id').primary();
      table.string('uuid').unique();
      table.integer('client_id').references('users.id');
      table.integer('provider_id').references('users.id');
      table.integer('service_id').references('services.id');
      table.datetime('scheduled_start');
      table.datetime('scheduled_end');
      table.string('status').defaultTo('scheduled');
      table.timestamps(true, true);
    });

    await knex.schema.createTable('availability_schedules', table => {
      table.increments('id').primary();
      table.integer('provider_id').references('users.id');
      table.string('day_of_week');
      table.time('start_time');
      table.time('end_time');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });

    // Create test data
    testProvider = await knex('users').insert({
      first_name: 'Test',
      last_name: 'Provider',
      role: 'provider'
    }).returning('*').then(rows => rows[0] || { id: 1 });

    testService = await knex('services').insert({
      provider_id: testProvider.id,
      name: 'Test Service',
      duration_minutes: 30,
      price: 100.00
    }).returning('*').then(rows => rows[0] || { id: 1 });

    // Add availability
    await knex('availability_schedules').insert([
      {
        provider_id: testProvider.id,
        day_of_week: 'monday',
        start_time: '09:00:00',
        end_time: '17:00:00'
      },
      {
        provider_id: testProvider.id,
        day_of_week: 'tuesday',
        start_time: '09:00:00',
        end_time: '17:00:00'
      }
    ]);

    bookingService = new BookingSlotService();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    await knex('appointments').del();
  });

  describe('getAvailableSlots', () => {
    test('should return available slots for a given date', async () => {
      const date = '2024-12-16'; // Assuming this is a Monday
      const slots = await bookingService.getAvailableSlots(
        testProvider.id,
        date,
        testService.id
      );

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      
      // Check slot format
      if (slots.length > 0) {
        expect(slots[0]).toHaveProperty('time');
        expect(slots[0]).toHaveProperty('available');
        expect(typeof slots[0].time).toBe('string');
        expect(typeof slots[0].available).toBe('boolean');
      }
    });

    test('should exclude booked slots', async () => {
      const date = '2024-12-16';
      const bookedTime = '10:00:00';

      // Create a booking at 10:00
      await knex('appointments').insert({
        uuid: 'test-uuid-123',
        client_id: testProvider.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        scheduled_start: `${date} ${bookedTime}`,
        scheduled_end: `${date} 10:30:00`,
        status: 'scheduled'
      });

      const slots = await bookingService.getAvailableSlots(
        testProvider.id,
        date,
        testService.id
      );

      const bookedSlot = slots.find(slot => slot.time === '10:00');
      if (bookedSlot) {
        expect(bookedSlot.available).toBe(false);
      }
    });

    test('should handle invalid provider ID', async () => {
      const slots = await bookingService.getAvailableSlots(
        99999, // Non-existent provider
        '2024-12-16',
        testService.id
      );

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBe(0);
    });

    test('should handle weekend dates with no availability', async () => {
      const sundayDate = '2024-12-15'; // Assuming this is a Sunday
      const slots = await bookingService.getAvailableSlots(
        testProvider.id,
        sundayDate,
        testService.id
      );

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBe(0);
    });
  });

  describe('isSlotAvailable', () => {
    test('should return true for available slot', async () => {
      const isAvailable = await bookingService.isSlotAvailable(
        testProvider.id,
        '2024-12-16',
        '14:00',
        testService.id
      );

      expect(typeof isAvailable).toBe('boolean');
      expect(isAvailable).toBe(true);
    });

    test('should return false for booked slot', async () => {
      const date = '2024-12-16';
      const time = '15:00';

      // Book the slot
      await knex('appointments').insert({
        uuid: 'test-uuid-456',
        client_id: testProvider.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        scheduled_start: `${date} ${time}:00`,
        scheduled_end: `${date} 15:30:00`,
        status: 'scheduled'
      });

      const isAvailable = await bookingService.isSlotAvailable(
        testProvider.id,
        date,
        time,
        testService.id
      );

      expect(isAvailable).toBe(false);
    });

    test('should handle invalid input gracefully', async () => {
      const isAvailable = await bookingService.isSlotAvailable(
        null,
        'invalid-date',
        'invalid-time',
        null
      );

      expect(typeof isAvailable).toBe('boolean');
      expect(isAvailable).toBe(false);
    });
  });

  describe('bookSlot', () => {
    test('should successfully book an available slot', async () => {
      const bookingData = {
        clientId: testProvider.id,
        providerId: testProvider.id,
        serviceId: testService.id,
        date: '2024-12-16',
        time: '11:00',
        notes: 'Test booking'
      };

      const booking = await bookingService.bookSlot(bookingData);

      expect(booking).toBeDefined();
      expect(booking.status).toBe('scheduled');
      expect(booking.notes).toBe('Test booking');

      // Verify in database
      const dbBooking = await knex('appointments')
        .where('uuid', booking.uuid)
        .first();
      expect(dbBooking).toBeDefined();
    });

    test('should reject booking for unavailable slot', async () => {
      // First booking
      await bookingService.bookSlot({
        clientId: testProvider.id,
        providerId: testProvider.id,
        serviceId: testService.id,
        date: '2024-12-16',
        time: '12:00',
        notes: 'First booking'
      });

      // Try to book same slot
      await expect(bookingService.bookSlot({
        clientId: testProvider.id,
        providerId: testProvider.id,
        serviceId: testService.id,
        date: '2024-12-16',
        time: '12:00',
        notes: 'Conflicting booking'
      })).rejects.toThrow();
    });

    test('should validate required booking data', async () => {
      const invalidBookingData = {
        clientId: testProvider.id,
        // Missing required fields
      };

      await expect(bookingService.bookSlot(invalidBookingData))
        .rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Temporarily break the database connection
      const originalKnex = Model.knex();
      Model.knex(null);

      await expect(bookingService.getAvailableSlots(
        testProvider.id,
        '2024-12-16',
        testService.id
      )).rejects.toThrow();

      // Restore connection
      Model.knex(originalKnex);
    });

    test('should handle timezone conversions', async () => {
      const bookingData = {
        clientId: testProvider.id,
        providerId: testProvider.id,
        serviceId: testService.id,
        date: '2024-12-16',
        time: '13:00',
        timezone: 'America/Los_Angeles'
      };

      const booking = await bookingService.bookSlot(bookingData);
      expect(booking).toBeDefined();
    });
  });

  describe('Performance', () => {
    test('should handle multiple concurrent booking attempts', async () => {
      const bookingPromises = [];
      
      // Try to book the same slot multiple times concurrently
      for (let i = 0; i < 5; i++) {
        bookingPromises.push(
          bookingService.bookSlot({
            clientId: testProvider.id + i,
            providerId: testProvider.id,
            serviceId: testService.id,
            date: '2024-12-16',
            time: '16:00',
            notes: `Concurrent booking ${i}`
          }).catch(error => error)
        );
      }

      const results = await Promise.all(bookingPromises);
      
      // Only one should succeed, others should fail
      const successes = results.filter(result => !(result instanceof Error));
      const failures = results.filter(result => result instanceof Error);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(4);
    });
  });
});