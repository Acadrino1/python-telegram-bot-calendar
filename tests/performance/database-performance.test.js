const knex = require('knex');
const config = require('../../knexfile');
const Appointment = require('../../src/models/Appointment');
const User = require('../../src/models/User');
const Notification = require('../../src/models/Notification');
const Service = require('../../src/models/Service');

describe('Database Performance Tests', () => {
  let db;
  let testUsers = [];
  let testServices = [];
  let testAppointments = [];

  beforeAll(async () => {
    // Use test database configuration
    db = knex(config.test);
    
    // Run migrations
    await db.migrate.latest();
    
    // Create test data
    await createTestData();
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function createTestData() {
    // Create test users (providers and clients)
    const userPromises = [];
    
    // Create 10 providers
    for (let i = 1; i <= 10; i++) {
      userPromises.push(
        User.query().insert({
          first_name: `Provider${i}`,
          last_name: 'Test',
          email: `provider${i}@test.com`,
          role: 'provider',
          telegram_id: `provider${i}`,
          phone: `555-000-${i.toString().padStart(4, '0')}`
        })
      );
    }

    // Create 100 clients
    for (let i = 1; i <= 100; i++) {
      userPromises.push(
        User.query().insert({
          first_name: `Client${i}`,
          last_name: 'Test',
          email: `client${i}@test.com`,
          role: 'client',
          telegram_id: `client${i}`,
          phone: `555-100-${i.toString().padStart(4, '0')}`
        })
      );
    }

    testUsers = await Promise.all(userPromises);
    const providers = testUsers.slice(0, 10);
    const clients = testUsers.slice(10);

    // Create services for each provider
    const servicePromises = [];
    providers.forEach((provider, index) => {
      servicePromises.push(
        Service.query().insert({
          name: `Service ${index + 1}`,
          description: 'Test service',
          duration_minutes: 60,
          price: 100.00,
          provider_id: provider.id,
          is_active: true
        })
      );
    });

    testServices = await Promise.all(servicePromises);

    // Create appointments (1000 total)
    const appointmentPromises = [];
    for (let i = 0; i < 1000; i++) {
      const client = clients[Math.floor(Math.random() * clients.length)];
      const service = testServices[Math.floor(Math.random() * testServices.length)];
      const provider = providers.find(p => p.id === service.provider_id);
      
      const appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + Math.floor(Math.random() * 30));
      appointmentDate.setHours(9 + Math.floor(Math.random() * 8));
      appointmentDate.setMinutes(0);

      appointmentPromises.push(
        Appointment.query().insert({
          client_id: client.id,
          provider_id: provider.id,
          service_id: service.id,
          appointment_datetime: appointmentDate,
          status: ['scheduled', 'confirmed', 'completed'][Math.floor(Math.random() * 3)],
          duration_minutes: service.duration_minutes,
          total_price: service.price,
          notes: `Test appointment ${i + 1}`
        })
      );
    }

    testAppointments = await Promise.all(appointmentPromises);
  }

  describe('Query Performance Tests', () => {
    test('Appointment list query with eager loading should be fast', async () => {
      const startTime = process.hrtime.bigint();
      
      const appointments = await Appointment.query()
        .withGraphFetched('[client, provider, service]')
        .where('status', 'scheduled')
        .orderBy('appointment_datetime')
        .limit(50);

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      expect(appointments.length).toBeGreaterThan(0);
      expect(appointments[0].client).toBeDefined();
      expect(appointments[0].provider).toBeDefined();
      expect(appointments[0].service).toBeDefined();
      expect(executionTime).toBeLessThan(500); // Should complete in under 500ms

      console.log(`✅ Appointment list query took: ${executionTime.toFixed(2)}ms`);
    });

    test('User lookup by telegram_id should be fast', async () => {
      const testUser = testUsers[0];
      
      const startTime = process.hrtime.bigint();
      
      const user = await User.query()
        .where('telegram_id', testUser.telegram_id)
        .first();

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000;

      expect(user).toBeDefined();
      expect(user.id).toBe(testUser.id);
      expect(executionTime).toBeLessThan(50); // Should complete in under 50ms

      console.log(`✅ User lookup by telegram_id took: ${executionTime.toFixed(2)}ms`);
    });

    test('Provider appointment lookup should be fast', async () => {
      const provider = testUsers[0]; // First user is a provider
      
      const startTime = process.hrtime.bigint();
      
      const appointments = await Appointment.query()
        .withGraphFetched('[client, service]')
        .where('provider_id', provider.id)
        .where('appointment_datetime', '>=', new Date())
        .orderBy('appointment_datetime')
        .limit(20);

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000;

      expect(executionTime).toBeLessThan(200); // Should complete in under 200ms

      console.log(`✅ Provider appointment lookup took: ${executionTime.toFixed(2)}ms`);
    });

    test('Notification processing batch should be fast', async () => {
      // Create test notifications
      const notificationPromises = [];
      for (let i = 0; i < 50; i++) {
        const user = testUsers[Math.floor(Math.random() * testUsers.length)];
        notificationPromises.push(
          Notification.query().insert({
            user_id: user.id,
            type: 'email',
            template_name: 'test_template',
            recipient: user.email,
            subject: 'Test notification',
            content: 'This is a test notification',
            status: 'pending',
            scheduled_for: new Date(),
            retry_count: 0
          })
        );
      }
      await Promise.all(notificationPromises);

      const startTime = process.hrtime.bigint();
      
      const notifications = await Notification.query()
        .where('status', 'pending')
        .where('scheduled_for', '<=', new Date())
        .where('retry_count', '<', 3)
        .orderBy('scheduled_for')
        .limit(25);

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000;

      expect(notifications.length).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(100); // Should complete in under 100ms

      console.log(`✅ Notification batch query took: ${executionTime.toFixed(2)}ms`);
    });

    test('Complex appointment search should be efficient', async () => {
      const startTime = process.hrtime.bigint();
      
      const appointments = await Appointment.query()
        .withGraphFetched('[client, provider, service]')
        .where('status', 'in', ['scheduled', 'confirmed'])
        .where('appointment_datetime', '>=', new Date())
        .where('appointment_datetime', '<=', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        .orderBy('appointment_datetime')
        .limit(100);

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000;

      expect(executionTime).toBeLessThan(300); // Should complete in under 300ms

      console.log(`✅ Complex appointment search took: ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('Index Effectiveness Tests', () => {
    test('Query plan should use indexes for appointment queries', async () => {
      if (db.client.config.client === 'sqlite3') {
        const explain = await db.raw(`
          EXPLAIN QUERY PLAN 
          SELECT * FROM appointments 
          WHERE client_id = ? AND status = ?
        `, [testUsers[10].id, 'scheduled']);

        // SQLite should use index for client_id
        const planText = explain.map(row => row.detail).join(' ');
        expect(planText.toLowerCase()).toContain('index');
        
        console.log('✅ SQLite query plan uses indexes');
      }
    });

    test('Verify all expected indexes exist', async () => {
      if (db.client.config.client === 'sqlite3') {
        const indexes = await db.raw("SELECT name FROM sqlite_master WHERE type='index'");
        const indexNames = indexes.map(idx => idx.name);
        
        const expectedIndexes = [
          'idx_users_telegram_id',
          'idx_users_email',
          'idx_appointments_client_id',
          'idx_appointments_provider_id',
          'idx_appointments_datetime_status',
          'idx_notifications_status_scheduled'
        ];

        expectedIndexes.forEach(expectedIndex => {
          const exists = indexNames.some(name => name.includes(expectedIndex));
          expect(exists).toBe(true);
          console.log(`✅ Index ${expectedIndex} exists`);
        });
      }
    });
  });

  describe('Connection Pool Performance', () => {
    test('Concurrent queries should handle well with connection pool', async () => {
      const startTime = process.hrtime.bigint();
      
      // Run 20 concurrent queries
      const queryPromises = [];
      for (let i = 0; i < 20; i++) {
        queryPromises.push(
          User.query().where('role', 'client').limit(10)
        );
      }

      const results = await Promise.all(queryPromises);
      
      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000;

      expect(results).toHaveLength(20);
      results.forEach(result => {
        expect(result).toHaveLength(10);
      });
      expect(executionTime).toBeLessThan(1000); // Should complete in under 1 second

      console.log(`✅ 20 concurrent queries took: ${executionTime.toFixed(2)}ms`);
    });
  });
});