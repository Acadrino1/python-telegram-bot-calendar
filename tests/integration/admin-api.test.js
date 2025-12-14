const request = require('supertest');
const express = require('express');
const TestHelpers = require('../utils/test-helpers');
const knex = require('knex');

// Mock the entire app structure for integration testing
const createTestApp = () => {
  const app = express();
  
  // Middleware setup
  app.use(express.json());
  app.use(require('../../src/middleware/auth'));
  app.use(require('../../src/middleware/errorHandler'));
  
  // Admin routes
  app.use('/api/admin', require('../../src/routes/admin'));
  
  return app;
};

describe('Admin API Integration Tests', () => {
  let app;
  let db;
  let adminToken;
  let userToken;
  let testUserId;
  let testAppointmentId;
  
  beforeAll(async () => {
    app = createTestApp();
    
    db = knex({
      client: 'mysql2',
      connection: global.testConfig.dbConfig,
      useNullAsDefault: true
    });
    
    // Create test users and get tokens
    const adminUser = await TestHelpers.createAdminUser();
    const regularUser = await TestHelpers.createTestUser();
    
    const [adminId] = await db('users').insert(adminUser);
    const [userId] = await db('users').insert(regularUser);
    
    testUserId = userId;
    adminToken = TestHelpers.generateAuthToken(adminId, 'admin');
    userToken = TestHelpers.generateAuthToken(userId, 'user');
    
    // Create test appointment
    const appointment = await TestHelpers.createTestAppointment({ user_id: userId });
    const [appointmentId] = await db('appointments').insert(appointment);
    testAppointmentId = appointmentId;
  });
  
  beforeEach(async () => {
    // Reset any test-specific data if needed
  });
  
  afterAll(async () => {
    await TestHelpers.cleanupTestData(db);
    await db.destroy();
  });
  
  describe('Authentication & Authorization', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .expect(401);
      
      expect(response.body.error).toBe('Access token required');
    });
    
    test('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      
      expect(response.body.error).toBe('Admin access required');
    });
    
    test('should allow admin users access', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      TestHelpers.validateApiResponse(response, ['totalUsers', 'totalAppointments']);
    });
  });
  
  describe('Dashboard Endpoints', () => {
    test('GET /api/admin/dashboard should return comprehensive metrics', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/dashboard', adminToken
      ).expect(200);
      
      expect(response.body).toHaveValidStructure([
        'totalUsers', 'totalAppointments', 'pendingAppointments',
        'completedAppointments', 'cancelledAppointments', 'revenueThisMonth',
        'averageRating', 'systemUptime'
      ]);
      
      expect(typeof response.body.totalUsers).toBe('number');
      expect(typeof response.body.totalAppointments).toBe('number');
    });
    
    test('GET /api/admin/analytics should return detailed analytics', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/analytics', adminToken
      ).expect(200);
      
      expect(response.body).toHaveProperty('appointmentStats');
      expect(response.body).toHaveProperty('userStats');
      expect(response.body).toHaveProperty('revenueStats');
      expect(response.body.appointmentStats).toHaveProperty('byStatus');
      expect(response.body.appointmentStats).toHaveProperty('byServiceType');
    });
    
    test('GET /api/admin/analytics with date range filters', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', `/api/admin/analytics?startDate=${startDate}&endDate=${endDate}`, adminToken
      ).expect(200);
      
      expect(response.body).toHaveProperty('dateRange');
      expect(response.body.dateRange.startDate).toBe(startDate.split('T')[0]);
    });
  });
  
  describe('User Management Endpoints', () => {
    test('GET /api/admin/users should return paginated user list', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/users?page=1&limit=10', adminToken
      ).expect(200);
      
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(response.body.pagination.currentPage).toBe(1);
    });
    
    test('GET /api/admin/users/:id should return specific user details', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', `/api/admin/users/${testUserId}`, adminToken
      ).expect(200);
      
      expect(response.body).toHaveValidStructure([
        'id', 'first_name', 'last_name', 'email', 'phone_number', 
        'role', 'status', 'created_at'
      ]);
      expect(response.body.id).toBe(testUserId);
    });
    
    test('PUT /api/admin/users/:id should update user information', async () => {
      const updateData = {
        first_name: 'Updated',
        last_name: 'Name',
        email: 'updated@example.com'
      };
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'put', `/api/admin/users/${testUserId}`, adminToken, updateData
      ).expect(200);
      
      expect(response.body.message).toBe('User updated successfully');
      expect(response.body.user.first_name).toBe('Updated');
    });
    
    test('PUT /api/admin/users/:id/role should update user role', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'put', `/api/admin/users/${testUserId}/role`, adminToken, { role: 'moderator' }
      ).expect(200);
      
      expect(response.body.message).toBe('User role updated successfully');
    });
    
    test('DELETE /api/admin/users/:id should deactivate user', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'delete', `/api/admin/users/${testUserId}`, adminToken
      ).expect(200);
      
      expect(response.body.message).toBe('User deactivated successfully');
    });
    
    test('GET /api/admin/users/search should search users', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/users/search?query=test', adminToken
      ).expect(200);
      
      expect(Array.isArray(response.body.users)).toBe(true);
    });
  });
  
  describe('Appointment Management Endpoints', () => {
    test('GET /api/admin/appointments should return appointments with filters', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/appointments?status=scheduled', adminToken
      ).expect(200);
      
      expect(response.body).toHaveProperty('appointments');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.appointments)).toBe(true);
    });
    
    test('GET /api/admin/appointments/:id should return specific appointment', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', `/api/admin/appointments/${testAppointmentId}`, adminToken
      ).expect(200);
      
      expect(response.body).toHaveValidStructure([
        'id', 'user_id', 'appointment_date', 'appointment_time',
        'service_type', 'status', 'notes'
      ]);
    });
    
    test('PUT /api/admin/appointments/:id should update appointment', async () => {
      const updateData = {
        status: 'confirmed',
        notes: 'Updated by admin'
      };
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'put', `/api/admin/appointments/${testAppointmentId}`, adminToken, updateData
      ).expect(200);
      
      expect(response.body.message).toBe('Appointment updated successfully');
      expect(response.body.appointment.status).toBe('confirmed');
    });
    
    test('POST /api/admin/appointments/:id/reschedule should reschedule appointment', async () => {
      const rescheduleData = {
        appointment_date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        appointment_time: '15:00:00'
      };
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'post', `/api/admin/appointments/${testAppointmentId}/reschedule`, 
        adminToken, rescheduleData
      ).expect(200);
      
      expect(response.body.message).toBe('Appointment rescheduled successfully');
    });
    
    test('DELETE /api/admin/appointments/:id should cancel appointment', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'delete', `/api/admin/appointments/${testAppointmentId}`, adminToken
      ).expect(200);
      
      expect(response.body.message).toBe('Appointment cancelled successfully');
    });
  });
  
  describe('System Configuration Endpoints', () => {
    test('GET /api/admin/settings should return system settings', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/settings', adminToken
      ).expect(200);
      
      expect(response.body).toHaveProperty('businessHours');
      expect(response.body).toHaveProperty('appointmentDuration');
      expect(response.body).toHaveProperty('maxAdvanceBooking');
    });
    
    test('PUT /api/admin/settings should update system settings', async () => {
      const settings = {
        businessHours: { start: '08:00', end: '18:00' },
        appointmentDuration: 45,
        maxAdvanceBooking: 60
      };
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'put', '/api/admin/settings', adminToken, settings
      ).expect(200);
      
      expect(response.body.message).toBe('Settings updated successfully');
    });
    
    test('GET /api/admin/notification-templates should return templates', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/notification-templates', adminToken
      ).expect(200);
      
      expect(Array.isArray(response.body.templates)).toBe(true);
    });
    
    test('POST /api/admin/notification-templates should create template', async () => {
      const template = {
        name: 'test_template',
        subject: 'Test Template',
        content: 'This is a test template',
        type: 'email'
      };
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'post', '/api/admin/notification-templates', adminToken, template
      ).expect(201);
      
      expect(response.body.message).toBe('Template created successfully');
      expect(response.body.template.name).toBe('test_template');
    });
  });
  
  describe('Export and Reporting Endpoints', () => {
    test('GET /api/admin/export/users should export user data', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/export/users?format=csv', adminToken
      ).expect(200);
      
      expect(response.headers['content-type']).toContain('text/csv');
    });
    
    test('GET /api/admin/export/appointments should export appointment data', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/export/appointments?format=json', adminToken
      ).expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
    });
    
    test('GET /api/admin/reports/revenue should return revenue report', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/reports/revenue', adminToken
      ).expect(200);
      
      expect(response.body).toHaveValidStructure([
        'totalRevenue', 'averagePerAppointment', 'byServiceType'
      ]);
    });
    
    test('GET /api/admin/reports/performance should return performance metrics', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/reports/performance', adminToken
      ).expect(200);
      
      expect(response.body).toHaveValidStructure([
        'averageResponseTime', 'appointmentCompletionRate', 
        'customerSatisfactionScore', 'systemUptime'
      ]);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send('invalid json')
        .expect(400);
      
      expect(response.body.error).toBe('Invalid JSON format');
    });
    
    test('should handle requests to non-existent resources', async () => {
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'get', '/api/admin/users/99999', adminToken
      ).expect(404);
      
      expect(response.body.error).toBe('User not found');
    });
    
    test('should handle validation errors', async () => {
      const invalidData = {
        email: 'invalid-email',
        phone_number: '123' // Too short
      };
      
      const response = await TestHelpers.makeAuthenticatedRequest(
        app, 'put', `/api/admin/users/${testUserId}`, adminToken, invalidData
      ).expect(400);
      
      expect(response.body.error).toContain('Validation failed');
    });
  });
  
  describe('Rate Limiting', () => {
    test('should implement rate limiting for admin endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 20 }, () =>
        TestHelpers.makeAuthenticatedRequest(
          app, 'get', '/api/admin/dashboard', adminToken
        )
      );
      
      const responses = await Promise.allSettled(requests);
      const rateLimited = responses.some(
        response => response.status === 'fulfilled' && response.value.status === 429
      );
      
      // Should have some rate-limited responses
      expect(rateLimited).toBe(true);
    });
  });
});