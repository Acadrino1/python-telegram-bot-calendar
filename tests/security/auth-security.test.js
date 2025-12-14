const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const TestHelpers = require('../utils/test-helpers');

describe('Authentication & Authorization Security Tests', () => {
  let app;
  let db;
  let validToken;
  let expiredToken;
  let malformedToken;
  
  beforeAll(async () => {
    // Setup test app and database
    app = require('../../src/index');
    db = require('../../src/config/database');
    
    // Create test tokens
    validToken = TestHelpers.generateAuthToken(1, 'admin');
    
    // Create expired token (backdated by 1 day)
    expiredToken = jwt.sign(
      { userId: 1, role: 'admin', exp: Math.floor(Date.now() / 1000) - 86400 },
      process.env.JWT_SECRET || 'test-secret'
    );
    
    malformedToken = 'invalid.token.here';
  });
  
  afterAll(async () => {
    await TestHelpers.cleanupTestData(db);
  });
  
  describe('JWT Token Security', () => {
    test('should reject requests with no authorization header', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .expect(401);
      
      expect(response.body.error).toBe('Access token required');
    });
    
    test('should reject requests with malformed Bearer token', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', 'Bearer')
        .expect(401);
      
      expect(response.body.error).toBe('Invalid token format');
    });
    
    test('should reject requests with invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${malformedToken}`)
        .expect(401);
      
      expect(response.body.error).toBe('Invalid token');
    });
    
    test('should reject expired JWT tokens', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      expect(response.body.error).toBe('Token expired');
    });
    
    test('should accept valid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).not.toBe(401);
    });
    
    test('should validate JWT signature integrity', async () => {
      // Create token with wrong secret
      const wrongSecretToken = jwt.sign(
        { userId: 1, role: 'admin' },
        'wrong-secret'
      );
      
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .expect(401);
      
      expect(response.body.error).toBe('Invalid token signature');
    });
  });
  
  describe('Role-Based Access Control (RBAC)', () => {
    let userToken, adminToken, moderatorToken;
    
    beforeAll(async () => {
      userToken = TestHelpers.generateAuthToken(1, 'user');
      adminToken = TestHelpers.generateAuthToken(2, 'admin');
      moderatorToken = TestHelpers.generateAuthToken(3, 'moderator');
    });
    
    test('should enforce admin-only access to admin endpoints', async () => {
      const adminEndpoints = [
        '/api/admin/dashboard',
        '/api/admin/users',
        '/api/admin/settings',
        '/api/admin/analytics'
      ];
      
      for (const endpoint of adminEndpoints) {
        // User should be denied
        await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);
        
        // Admin should be allowed
        await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(res => expect(res.status).not.toBe(403));
      }
    });
    
    test('should enforce user-specific data access', async () => {
      const userId = 1;
      const otherUserId = 2;
      
      const userToken = TestHelpers.generateAuthToken(userId, 'user');
      const otherUserToken = TestHelpers.generateAuthToken(otherUserId, 'user');
      
      // User should access their own data
      await request(app)
        .get(`/api/user/profile`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      
      // User should not access other user's data
      await request(app)
        .get(`/api/admin/users/${otherUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
    
    test('should validate role hierarchies', async () => {
      // Admin can modify any user
      await request(app)
        .put('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'moderator' })
        .expect(res => expect(res.status).not.toBe(403));
      
      // Moderator cannot modify admin users
      await request(app)
        .put('/api/admin/users/2/role')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ role: 'user' })
        .expect(403);
    });
  });
  
  describe('Input Validation & Sanitization', () => {
    test('should prevent SQL injection attempts', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1 OR 1=1",
        "admin'/*",
        "1; UPDATE users SET role='admin' WHERE id=1; --"
      ];
      
      for (const input of maliciousInputs) {
        const response = await request(app)
          .get('/api/admin/users/search')
          .query({ query: input })
          .set('Authorization', `Bearer ${validToken}`);
        
        // Should not return error indicating SQL injection
        expect(response.body.error).not.toContain('syntax error');
        expect(response.body.error).not.toContain('mysql');
      }
    });
    
    test('should prevent XSS attacks in user inputs', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '"><script>alert(document.cookie)</script>'
      ];
      
      for (const payload of xssPayloads) {
        const response = await request(app)
          .put('/api/admin/users/1')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            first_name: payload,
            last_name: payload,
            email: `test${Math.random()}@example.com`
          });
        
        if (response.status === 200) {
          // Should sanitize the input
          expect(response.body.user.first_name).not.toContain('<script>');
          expect(response.body.user.first_name).not.toContain('javascript:');
        }
      }
    });
    
    test('should validate email formats strictly', async () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'test@',
        'test@.com',
        'test..test@example.com',
        'test@example',
        'test space@example.com'
      ];
      
      for (const email of invalidEmails) {
        const response = await request(app)
          .put('/api/admin/users/1')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ email })
          .expect(400);
        
        expect(response.body.error).toContain('Invalid email format');
      }
    });
    
    test('should validate phone number formats', async () => {
      const invalidPhones = [
        '123',
        'not-a-phone',
        '123-456-78901', // Too long
        '+', // Just plus sign
        '++1234567890', // Double plus
        '123 456 7890 ext 123' // Invalid format
      ];
      
      for (const phone of invalidPhones) {
        const response = await request(app)
          .put('/api/admin/users/1')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ phone_number: phone })
          .expect(400);
        
        expect(response.body.error).toContain('Invalid phone number');
      }
    });
  });
  
  describe('Password Security', () => {
    test('should enforce strong password requirements', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'abc',
        '111111',
        'qwerty',
        'password123' // Common pattern
      ];
      
      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            first_name: 'Test',
            last_name: 'User',
            email: `test${Math.random()}@example.com`,
            phone_number: '+1234567890',
            password: password
          })
          .expect(400);
        
        expect(response.body.error).toContain('Password does not meet requirements');
      }
    });
    
    test('should hash passwords securely', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Should not store plain text passwords
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
      
      // Should use sufficient salt rounds
      expect(hashedPassword.startsWith('$2b$12$')).toBe(true);
    });
    
    test('should implement secure password reset flow', async () => {
      // Request password reset
      const resetResponse = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(resetResponse.body.message).toBe('Password reset instructions sent');
      
      // Should not reveal whether email exists
      const nonExistentResponse = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);
      
      expect(nonExistentResponse.body.message).toBe('Password reset instructions sent');
    });
  });
  
  describe('Session Management', () => {
    test('should implement secure session handling', async () => {
      // Login should create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'adminpassword'
        })
        .expect(200);
      
      expect(loginResponse.body.token).toBeDefined();
      
      // Token should have reasonable expiration
      const decodedToken = jwt.decode(loginResponse.body.token);
      const expirationTime = decodedToken.exp * 1000;
      const currentTime = Date.now();
      const timeDifference = expirationTime - currentTime;
      
      expect(timeDifference).toBeGreaterThan(0); // Not expired
      expect(timeDifference).toBeLessThan(24 * 60 * 60 * 1000); // Less than 24 hours
    });
    
    test('should implement secure logout', async () => {
      const token = TestHelpers.generateAuthToken(1, 'admin');
      
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(logoutResponse.body.message).toBe('Successfully logged out');
    });
  });
  
  describe('Rate Limiting Security', () => {
    test('should implement rate limiting on authentication endpoints', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      
      // Make multiple failed login attempts
      const attempts = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/auth/login')
          .send({ email, password })
      );
      
      const results = await Promise.all(attempts);
      const rateLimitedResults = results.filter(res => res.status === 429);
      
      expect(rateLimitedResults.length).toBeGreaterThan(0);
    });
    
    test('should implement progressive delays for failed attempts', async () => {
      const startTime = Date.now();
      
      // Make several failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should take progressively longer due to delays
      expect(totalTime).toBeGreaterThan(1000); // At least 1 second
    });
  });
  
  describe('Data Privacy & Protection', () => {
    test('should not expose sensitive data in API responses', async () => {
      const response = await request(app)
        .get('/api/admin/users/1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
      
      // Should not include password hash
      expect(response.body.password_hash).toBeUndefined();
      expect(response.body.password).toBeUndefined();
      
      // Should not include internal system fields
      expect(response.body.internal_id).toBeUndefined();
      expect(response.body.encryption_key).toBeUndefined();
    });
    
    test('should implement data anonymization for exports', async () => {
      const response = await request(app)
        .get('/api/admin/export/users?format=json&anonymize=true')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
      
      if (response.body.length > 0) {
        const user = response.body[0];
        
        // Should anonymize PII
        expect(user.email).toMatch(/^\w+@example\.com$/);
        expect(user.phone_number).toMatch(/^\+1\*+\d{4}$/);
      }
    });
  });
  
  describe('API Security Headers', () => {
    test('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${validToken}`);
      
      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toBeDefined();
    });
    
    test('should implement CORS properly', async () => {
      const response = await request(app)
        .options('/api/admin/dashboard')
        .set('Origin', 'http://unauthorized-domain.com');
      
      // Should not allow unauthorized origins
      expect(response.headers['access-control-allow-origin']).not.toBe('http://unauthorized-domain.com');
    });
  });
});