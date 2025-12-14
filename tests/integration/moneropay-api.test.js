/**
 * MoneroPay API Integration Tests
 * Tests payment creation, status checking, and webhook handling
 */

const request = require('supertest');
const { Model } = require('objection');
const Knex = require('knex');
require('dotenv').config();

// Mock data
const mockPaymentData = {
  address: '48fT5T5VEjNrK5cLPLV4agpF5x8k3CUhp2hUZjNrSWLJLaHvNzFz12fVaLxTp2bhXB6vdJvf5LhKzfysFQ6nRWvvNE8Yd6A',
  amount: 1000000000000, // 1 XMR in piconero
  confirmations: 0,
  complete: false,
  amount_received: '0'
};

const mockWebhookData = {
  address: mockPaymentData.address,
  amount: mockPaymentData.amount,
  amount_received: mockPaymentData.amount,
  confirmations: 10,
  complete: true,
  payment_id: 'test_payment_123'
};

describe('MoneroPay API Endpoints', () => {
  let db;
  let appointmentId;
  let userId;
  let paymentId;
  let app;

  beforeAll(async () => {
    // Initialize database
    const knexConfig = require('../../knexfile')[process.env.NODE_ENV || 'development'];
    db = Knex(knexConfig);
    Model.knex(db);

    // Create test app instance
    const { AppointmentSchedulerApp } = require('../../src/index');
    const testApp = new AppointmentSchedulerApp();
    await testApp.initPromise;
    app = testApp.app;

    // Create test user
    const [testUserId] = await db('users').insert({
      telegram_id: 123456789,
      email: 'test@example.com',
      name: 'Test User',
      timezone: 'America/New_York',
      created_at: new Date(),
      updated_at: new Date()
    });
    userId = testUserId;

    // Create test appointment
    const [apptId] = await db('appointments').insert({
      user_id: userId,
      title: 'Test Appointment',
      description: 'Test payment appointment',
      date: new Date(Date.now() + 86400000), // Tomorrow
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    });
    appointmentId = apptId;
  });

  afterAll(async () => {
    // Cleanup
    if (paymentId) {
      await db('payments').where('id', paymentId).del();
    }
    if (appointmentId) {
      await db('appointments').where('id', appointmentId).del();
    }
    if (userId) {
      await db('users').where('id', userId).del();
    }
    await db.destroy();
  });

  describe('POST /api/payments/webhook - Webhook Handling', () => {
    test('should reject webhook with missing address', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send({ amount_received: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing address');
    });

    test('should return 404 for unknown payment address', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send({
          address: 'unknown_address_here',
          amount_received: 0,
          confirmations: 0,
          complete: false
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Payment not found');
    });

    test('should process valid webhook for partial payment', async () => {
      // First create a payment record
      const [pId] = await db('payments').insert({
        appointment_id: appointmentId,
        user_id: userId,
        moneropay_address: mockPaymentData.address,
        payment_id: null,
        amount_cad: 250,
        amount_xmr: String(mockPaymentData.amount),
        exchange_rate: 250,
        status: 'pending',
        expires_at: new Date(Date.now() + 1800000),
        metadata: JSON.stringify(mockPaymentData),
        created_at: new Date(),
        updated_at: new Date()
      });
      paymentId = pId;

      const partialData = {
        address: mockPaymentData.address,
        amount_received: Math.floor(mockPaymentData.amount / 2).toString(),
        confirmations: 1,
        complete: false
      };

      const response = await request(app)
        .post('/api/payments/webhook')
        .send(partialData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('partial');

      // Verify DB was updated
      const payment = await db('payments').where('id', paymentId).first();
      expect(payment.status).toBe('partial');
      expect(payment.amount_received).toBe(partialData.amount_received);
    });

    test('should process valid webhook for complete payment', async () => {
      const completeData = {
        address: mockPaymentData.address,
        amount_received: mockPaymentData.amount.toString(),
        confirmations: 10,
        complete: true
      };

      const response = await request(app)
        .post('/api/payments/webhook')
        .send(completeData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('confirmed');

      // Verify DB was updated
      const payment = await db('payments').where('id', paymentId).first();
      expect(payment.status).toBe('confirmed');
      expect(payment.confirmations).toBe(10);
    });

    test('should handle webhook error gracefully', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send(null);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Internal server error');
    });
  });

  describe('GET /api/payments/:id/status - Status Checking', () => {
    test('should return 404 for non-existent payment', async () => {
      const response = await request(app)
        .get('/api/payments/999999/status');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Payment not found');
    });

    test('should return payment status', async () => {
      const response = await request(app)
        .get(`/api/payments/${paymentId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(paymentId);
      expect(response.body.status).toBe('confirmed');
      expect(response.body.amountCad).toBe(250);
      expect(response.body.amountXmr).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
    });

    test('should include confirmations in status response', async () => {
      const response = await request(app)
        .get(`/api/payments/${paymentId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.confirmations).toBeGreaterThanOrEqual(0);
    });

    test('should include completion flag in status response', async () => {
      const response = await request(app)
        .get(`/api/payments/${paymentId}/status`);

      expect(response.status).toBe(200);
      expect('complete' in response.body).toBe(true);
    });
  });

  describe('POST /api/payments/expire-old - Expiration Handling', () => {
    test('should expire old pending payments', async () => {
      // Create an expired payment
      const [expiredId] = await db('payments').insert({
        appointment_id: appointmentId,
        user_id: userId,
        moneropay_address: 'expired_address_' + Date.now(),
        payment_id: null,
        amount_cad: 250,
        amount_xmr: String(mockPaymentData.amount),
        exchange_rate: 250,
        status: 'pending',
        expires_at: new Date(Date.now() - 1000), // Already expired
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date()
      });

      const response = await request(app)
        .post('/api/payments/expire-old')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.expired).toBeGreaterThanOrEqual(1);

      // Verify payment was expired
      const expired = await db('payments').where('id', expiredId).first();
      expect(expired.status).toBe('expired');

      // Cleanup
      await db('payments').where('id', expiredId).del();
    });

    test('should not expire pending payments with valid expiry', async () => {
      // Create a valid pending payment
      const [validId] = await db('payments').insert({
        appointment_id: appointmentId,
        user_id: userId,
        moneropay_address: 'valid_address_' + Date.now(),
        payment_id: null,
        amount_cad: 250,
        amount_xmr: String(mockPaymentData.amount),
        exchange_rate: 250,
        status: 'pending',
        expires_at: new Date(Date.now() + 1800000), // Valid for 30 mins
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date()
      });

      const response = await request(app)
        .post('/api/payments/expire-old')
        .send({});

      expect(response.status).toBe(200);

      // Verify payment is still pending
      const payment = await db('payments').where('id', validId).first();
      expect(payment.status).toBe('pending');

      // Cleanup
      await db('payments').where('id', validId).del();
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Test with invalid payment ID format
      const response = await request(app)
        .get('/api/payments/invalid-id/status');

      // Should either return 404 or 500
      expect([404, 500]).toContain(response.status);
    });

    test('should handle malformed webhook JSON', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect([400, 500]).toContain(response.status);
    });

    test('should return meaningful error for webhook processing', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .send({
          address: 'test_addr',
          // Missing required confirmation fields
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Payment Data Validation', () => {
    test('should store payment metadata correctly', async () => {
      const payment = await db('payments').where('id', paymentId).first();
      expect(payment.metadata).toBeDefined();
      expect(typeof payment.metadata).toBe('string');
    });

    test('should maintain atomic unit precision', async () => {
      const payment = await db('payments').where('id', paymentId).first();
      // amount_xmr should be stored as string to maintain precision
      expect(typeof payment.amount_xmr).toBe('string');
    });

    test('should track confirmation progression', async () => {
      const payment = await db('payments').where('id', paymentId).first();
      expect(payment.confirmations).toBeGreaterThanOrEqual(0);
    });

    test('should record confirmed_at timestamp on confirmation', async () => {
      const payment = await db('payments').where('id', paymentId).first();
      if (payment.status === 'confirmed') {
        expect(payment.confirmed_at).toBeDefined();
      }
    });
  });
});
