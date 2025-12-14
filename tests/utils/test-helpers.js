const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class TestHelpers {
  static async createTestUser(userData = {}) {
    const defaultUser = {
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      phone_number: '+1234567890',
      telegram_user_id: '123456789',
      role: 'user',
      password_hash: await bcrypt.hash('testpassword', 10)
    };
    
    return { ...defaultUser, ...userData };
  }
  
  static async createAdminUser() {
    return await this.createTestUser({
      email: 'admin@example.com',
      role: 'admin',
      telegram_user_id: '987654321'
    });
  }
  
  static generateAuthToken(userId, role = 'user') {
    return jwt.sign(
      { userId, role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  }
  
  static async createTestAppointment(appointmentData = {}) {
    const defaultAppointment = {
      user_id: 1,
      appointment_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      appointment_time: '10:00:00',
      service_type: 'consultation',
      status: 'scheduled',
      notes: 'Test appointment'
    };
    
    return { ...defaultAppointment, ...appointmentData };
  }
  
  static async makeAuthenticatedRequest(app, method, endpoint, token, data = null) {
    const req = request(app)[method](endpoint)
      .set('Authorization', `Bearer ${token}`);
    
    if (data) {
      req.send(data);
    }
    
    return req;
  }
  
  static async waitForCondition(condition, timeout = 5000, interval = 100) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }
  
  static mockTelegramBot() {
    return {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      editMessageText: jest.fn().mockResolvedValue({ message_id: 123 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
      sendPhoto: jest.fn().mockResolvedValue({ message_id: 124 }),
      answerCallbackQuery: jest.fn().mockResolvedValue(true)
    };
  }
  
  static generateTestData(type, count = 10) {
    const generators = {
      users: () => Array.from({ length: count }, (_, i) => ({
        first_name: `User${i}`,
        last_name: `Test${i}`,
        email: `user${i}@test.com`,
        phone_number: `+123456789${i}`,
        telegram_user_id: `${1000 + i}`
      })),
      
      appointments: () => Array.from({ length: count }, (_, i) => ({
        user_id: Math.floor(Math.random() * 10) + 1,
        appointment_date: new Date(Date.now() + (i * 24 * 60 * 60 * 1000)),
        appointment_time: `${9 + (i % 8)}:00:00`,
        service_type: ['consultation', 'meeting', 'interview'][i % 3],
        status: ['scheduled', 'completed', 'cancelled'][i % 3]
      }))
    };
    
    return generators[type] ? generators[type]() : [];
  }
  
  static async cleanupTestData(db) {
    const tables = [
      'appointment_history',
      'notifications', 
      'waitlist_entries',
      'appointments',
      'users',
      'notification_templates'
    ];
    
    for (const table of tables) {
      try {
        await db(table).del();
      } catch (error) {
        // Table might not exist in all test scenarios
      }
    }
  }
  
  static validateApiResponse(response, expectedStructure) {
    expect(response).toBeDefined();
    expect(response.status).toBeDefined();
    expect(response.body).toBeDefined();
    
    if (expectedStructure) {
      expect(response.body).toHaveValidStructure(expectedStructure);
    }
  }
  
  static generateMockMetrics() {
    return {
      totalUsers: Math.floor(Math.random() * 1000) + 100,
      totalAppointments: Math.floor(Math.random() * 5000) + 500,
      completedAppointments: Math.floor(Math.random() * 4000) + 400,
      cancelledAppointments: Math.floor(Math.random() * 500) + 50,
      averageRating: (Math.random() * 2 + 3).toFixed(1),
      systemUptime: Math.floor(Math.random() * 30) + 1
    };
  }
}

module.exports = TestHelpers;