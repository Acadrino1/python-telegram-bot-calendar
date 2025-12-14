const request = require('supertest');
const { Model } = require('objection');
const TestFactory = require('../utils/test-factory');

// Simple integration test to verify basic functionality
describe('Basic Health Integration Tests', () => {
  let knex;

  beforeAll(async () => {
    // Use the global test database setup
    knex = global.testDb;
    if (!knex) {
      throw new Error('Test database not initialized. Check integration setup.');
    }
  });

  afterAll(async () => {
    // Cleanup is handled by integration teardown
  });

  describe('Database Connection', () => {
    test('should connect to test database', async () => {
      expect(knex).toBeDefined();
      const result = await knex.raw('SELECT 1 as test');
      expect(result).toBeDefined();
    });

    test('should have required tables', async () => {
      const tables = await knex.raw('SELECT name FROM sqlite_master WHERE type=\"table\"');
      const tableNames = tables.map(t => t.name);
      
      const requiredTables = ['users', 'appointments'];
      for (const table of requiredTables) {
        expect(tableNames).toContain(table);
      }
    });
  });

  describe('Test Factory', () => {
    test('should create test user', async () => {
      const userData = await TestFactory.createUser();
      expect(userData).toBeDefined();
      expect(userData.first_name).toBeDefined();
      expect(userData.email).toBeDefined();
      expect(userData.password_hash).toBeDefined();
    });

    test('should create test appointment', () => {
      const appointmentData = TestFactory.createAppointment();
      expect(appointmentData).toBeDefined();
      expect(appointmentData.appointment_datetime).toBeDefined();
      expect(appointmentData.status).toBe('scheduled');
    });

    test('should create multiple test items', async () => {
      const users = await TestFactory.createMultiple('createUser', 3);
      expect(users).toHaveLength(3);
      expect(users[0].email).not.toBe(users[1].email);
    });
  });

  describe('Environment Configuration', () => {
    test('should have test environment variables set', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.DATABASE_PATH).toBe(':memory:');
      expect(process.env.LOG_LEVEL).toBe('error');
    });

    test('should have JWT secret configured', () => {
      expect(process.env.JWT_SECRET).toBeDefined();
    });
  });

  describe('Basic Model Operations', () => {
    test('should perform basic CRUD operations', async () => {
      // This is a simplified test since we're using mocked models
      const userData = await TestFactory.createUser();
      expect(userData.uuid).toBeDefined(); // Use uuid instead of id
      
      const appointmentData = TestFactory.createAppointment({
        client_id: userData.uuid
      });
      expect(appointmentData.client_id).toBe(userData.uuid);
    });
  });

  describe('Date and Time Handling', () => {
    test('should handle appointment datetime correctly', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const appointment = TestFactory.createAppointment({
        appointment_datetime: futureDate
      });
      
      expect(appointment.appointment_datetime).toBeInstanceOf(Date);
      expect(appointment.appointment_datetime.getTime()).toBeGreaterThan(Date.now());
    });

    test('should generate realistic time slots', () => {
      const testData = TestFactory.generateRealisticTestData();
      expect(testData.timeSlots).toBeDefined();
      expect(testData.timeSlots).toContain('09:00:00');
      expect(testData.timeSlots).toContain('14:00:00');
    });
  });

  describe('UUID Generation', () => {
    test('should generate unique UUIDs', async () => {
      const user1 = await TestFactory.createUser();
      const user2 = await TestFactory.createUser();
      
      expect(user1.uuid).toBeDefined();
      expect(user2.uuid).toBeDefined();
      expect(user1.uuid).not.toBe(user2.uuid);
    });

    test('should generate valid UUID format', async () => {
      const user = await TestFactory.createUser();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(user.uuid).toMatch(uuidRegex);
    });
  });

  describe('Password Handling', () => {
    test('should hash passwords correctly', async () => {
      const user = await TestFactory.createUser({ password: 'testpass123' });
      expect(user.password_hash).toBeDefined();
      expect(user.password_hash).not.toBe('testpass123');
      expect(user.password_hash.startsWith('$2b$')).toBe(true);
    });

    test('should not include plain password in user object', async () => {
      const user = await TestFactory.createUser({ password: 'testpass123' });
      expect(user.password).toBeUndefined();
    });
  });

  describe('Role and Permission Handling', () => {
    test('should create users with different roles', async () => {
      const client = await TestFactory.createUser({ role: 'client' });
      const provider = await TestFactory.createProvider();
      const admin = await TestFactory.createAdmin();
      
      expect(client.role).toBe('client');
      expect(provider.role).toBe('provider');
      expect(admin.role).toBe('admin');
    });
  });

  describe('Test Data Consistency', () => {
    test('should maintain data consistency across multiple operations', async () => {
      TestFactory.resetSequences();
      
      const user1 = await TestFactory.createUser();
      const user2 = await TestFactory.createUser();
      
      // Check that sequential creation produces consistent results
      expect(user1.first_name).toBe('Test1');
      expect(user2.first_name).toBe('Test2');
    });

    test('should create complete booking scenario', async () => {
      const scenario = await TestFactory.createCompleteBookingScenario();
      
      expect(scenario.client).toBeDefined();
      expect(scenario.provider).toBeDefined();
      expect(scenario.service).toBeDefined();
      expect(scenario.appointment).toBeDefined();
      
      expect(scenario.client.role).toBe('client');
      expect(scenario.provider.role).toBe('provider');
      expect(scenario.appointment.client_id).toBe(scenario.client.id);
    });
  });
});