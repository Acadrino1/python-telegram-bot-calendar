const request = require('supertest');
const { Model } = require('objection');
const Knex = require('knex');
const app = require('../../src/index');
const User = require('../../src/models/User');
const Service = require('../../src/models/Service');
const Appointment = require('../../src/models/Appointment');

describe('Appointment Integration Tests', () => {
  let knex;
  let clientToken;
  let providerToken;
  let adminToken;
  let testClient;
  let testProvider;
  let testService;

  beforeAll(async () => {
    // Setup test database
    const knexConfig = require('../../database/knexfile').test || {
      client: 'sqlite3',
      connection: ':memory:',
      migrations: { directory: './database/migrations' },
      useNullAsDefault: true
    };
    
    // Fix migration directory path
    if (knexConfig.migrations && knexConfig.migrations.directory) {
      knexConfig.migrations.directory = knexConfig.migrations.directory.replace('./database/migrations', './database/migrations');
    }
    
    knex = Knex(knexConfig);
    Model.knex(knex);

    // Run migrations
    await knex.migrate.latest();

    // Create test users
    testClient = await User.query().insert({
      email: 'client@test.com',
      password: 'password123',
      first_name: 'John',
      last_name: 'Doe',
      role: 'client'
    });

    testProvider = await User.query().insert({
      email: 'provider@test.com',
      password: 'password123',
      first_name: 'Dr. Jane',
      last_name: 'Smith',
      role: 'provider'
    });

    const testAdmin = await User.query().insert({
      email: 'admin@test.com',
      password: 'password123',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin'
    });

    // Get authentication tokens
    const clientLogin = await request(app.app)
      .post('/api/auth/login')
      .send({ email: 'client@test.com', password: 'password123' });
    clientToken = clientLogin.body.token;

    const providerLogin = await request(app.app)
      .post('/api/auth/login')
      .send({ email: 'provider@test.com', password: 'password123' });
    providerToken = providerLogin.body.token;

    const adminLogin = await request(app.app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = adminLogin.body.token;

    // Create test service
    testService = await Service.query().insert({
      provider_id: testProvider.id,
      name: 'Test Consultation',
      duration_minutes: 30,
      price: 100.00
    });

    // Create provider availability
    await knex('availability_schedules').insert([
      {
        provider_id: testProvider.id,
        day_of_week: 'monday',
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_active: true
      },
      {
        provider_id: testProvider.id,
        day_of_week: 'tuesday',
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_active: true
      }
    ]);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Clean up appointments before each test
    await Appointment.query().delete();
  });

  describe('POST /api/appointments', () => {
    it('should successfully book an appointment', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const response = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          provider_id: testProvider.id,
          service_id: testService.id,
          appointment_datetime: tomorrow.toISOString(),
          notes: 'Test appointment'
        });

      expect(response.status).toBe(201);
      expect(response.body.appointment).toBeDefined();
      expect(response.body.appointment.client_id).toBe(testClient.id);
      expect(response.body.appointment.provider_id).toBe(testProvider.id);
      expect(response.body.appointment.service_id).toBe(testService.id);
      expect(response.body.appointment.notes).toBe('Test appointment');
    });

    it('should reject booking for unavailable time slot', async () => {
      const sunday = new Date();
      // Get next Sunday
      sunday.setDate(sunday.getDate() + (7 - sunday.getDay()));
      sunday.setHours(10, 0, 0, 0);

      const response = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          provider_id: testProvider.id,
          service_id: testService.id,
          appointment_datetime: sunday.toISOString(),
          notes: 'Should fail'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('available');
    });

    it('should reject booking from non-client users', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const response = await request(app.app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          provider_id: testProvider.id,
          service_id: testService.id,
          appointment_datetime: tomorrow.toISOString()
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CLIENT_ONLY');
    });
  });

  describe('GET /api/appointments', () => {
    let testAppointment;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      testAppointment = await Appointment.query().insert({
        client_id: testClient.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        appointment_datetime: tomorrow.toISOString(),
        duration_minutes: 30,
        status: 'scheduled'
      });
    });

    it('should return appointments for client', async () => {
      const response = await request(app.app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointments).toHaveLength(1);
      expect(response.body.appointments[0].client_id).toBe(testClient.id);
    });

    it('should return appointments for provider', async () => {
      const response = await request(app.app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointments).toHaveLength(1);
      expect(response.body.appointments[0].provider_id).toBe(testProvider.id);
    });

    it('should filter appointments by status', async () => {
      const response = await request(app.app)
        .get('/api/appointments?status=scheduled')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointments).toHaveLength(1);
      expect(response.body.appointments[0].status).toBe('scheduled');
    });
  });

  describe('PUT /api/appointments/:uuid', () => {
    let testAppointment;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      testAppointment = await Appointment.query().insert({
        client_id: testClient.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        appointment_datetime: tomorrow.toISOString(),
        duration_minutes: 30,
        status: 'scheduled'
      });
    });

    it('should allow client to update notes', async () => {
      const response = await request(app.app)
        .put(`/api/appointments/${testAppointment.uuid}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          notes: 'Updated notes'
        });

      expect(response.status).toBe(200);
      expect(response.body.appointment.notes).toBe('Updated notes');
    });

    it('should allow provider to confirm appointment', async () => {
      const response = await request(app.app)
        .put(`/api/appointments/${testAppointment.uuid}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          status: 'confirmed'
        });

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('confirmed');
    });

    it('should allow rescheduling to available slot', async () => {
      const newTime = new Date();
      newTime.setDate(newTime.getDate() + 2);
      newTime.setHours(15, 0, 0, 0);

      const response = await request(app.app)
        .put(`/api/appointments/${testAppointment.uuid}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          appointment_datetime: newTime.toISOString()
        });

      expect(response.status).toBe(200);
      expect(new Date(response.body.appointment.appointment_datetime).getTime())
        .toBe(newTime.getTime());
    });
  });

  describe('DELETE /api/appointments/:uuid', () => {
    let testAppointment;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      testAppointment = await Appointment.query().insert({
        client_id: testClient.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        appointment_datetime: tomorrow.toISOString(),
        duration_minutes: 30,
        status: 'scheduled'
      });
    });

    it('should allow client to cancel appointment', async () => {
      const response = await request(app.app)
        .delete(`/api/appointments/${testAppointment.uuid}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          reason: 'Cannot attend'
        });

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('cancelled');
      expect(response.body.appointment.cancellation_reason).toBe('Cannot attend');
    });

    it('should allow provider to cancel appointment', async () => {
      const response = await request(app.app)
        .delete(`/api/appointments/${testAppointment.uuid}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          reason: 'Provider unavailable'
        });

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('cancelled');
    });

    it('should not allow cancellation too close to appointment time', async () => {
      // Create appointment in 1 hour (within cancellation policy)
      const soonAppointment = await Appointment.query().insert({
        client_id: testClient.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        appointment_datetime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        duration_minutes: 30,
        status: 'scheduled'
      });

      const response = await request(app.app)
        .delete(`/api/appointments/${soonAppointment.uuid}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          reason: 'Last minute cancellation'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('24 hours');
    });
  });

  describe('Appointment Status Transitions', () => {
    let testAppointment;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      testAppointment = await Appointment.query().insert({
        client_id: testClient.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        appointment_datetime: tomorrow.toISOString(),
        duration_minutes: 30,
        status: 'scheduled'
      });
    });

    it('should allow provider to confirm appointment', async () => {
      const response = await request(app.app)
        .post(`/api/appointments/${testAppointment.uuid}/confirm`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('confirmed');
    });

    it('should allow provider to start appointment', async () => {
      await testAppointment.$query().patch({ status: 'confirmed' });

      const response = await request(app.app)
        .post(`/api/appointments/${testAppointment.uuid}/start`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('in_progress');
    });

    it('should allow provider to complete appointment', async () => {
      await testAppointment.$query().patch({ status: 'in_progress' });

      const response = await request(app.app)
        .post(`/api/appointments/${testAppointment.uuid}/complete`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          provider_notes: 'Patient responded well to treatment'
        });

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('completed');
      expect(response.body.appointment.provider_notes).toBe('Patient responded well to treatment');
    });

    it('should allow provider to mark as no-show', async () => {
      const response = await request(app.app)
        .post(`/api/appointments/${testAppointment.uuid}/no-show`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointment.status).toBe('no_show');
    });
  });

  describe('Access Control', () => {
    let clientAppointment;
    let otherClient;
    let otherClientToken;

    beforeEach(async () => {
      // Create another client
      otherClient = await User.query().insert({
        email: 'other@test.com',
        password: 'password123',
        first_name: 'Other',
        last_name: 'Client',
        role: 'client'
      });

      const otherLogin = await request(app.app)
        .post('/api/auth/login')
        .send({ email: 'other@test.com', password: 'password123' });
      otherClientToken = otherLogin.body.token;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      clientAppointment = await Appointment.query().insert({
        client_id: testClient.id,
        provider_id: testProvider.id,
        service_id: testService.id,
        appointment_datetime: tomorrow.toISOString(),
        duration_minutes: 30,
        status: 'scheduled'
      });
    });

    it('should not allow client to access other client\'s appointment', async () => {
      const response = await request(app.app)
        .get(`/api/appointments/${clientAppointment.uuid}`)
        .set('Authorization', `Bearer ${otherClientToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow provider to access their appointment', async () => {
      const response = await request(app.app)
        .get(`/api/appointments/${clientAppointment.uuid}`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointment.id).toBe(clientAppointment.id);
    });

    it('should allow admin to access any appointment', async () => {
      const response = await request(app.app)
        .get(`/api/appointments/${clientAppointment.uuid}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.appointment.id).toBe(clientAppointment.id);
    });
  });
});