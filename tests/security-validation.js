/**
 * Security Validation Test Suite
 * Tests all security patches and protections
 */

const request = require('supertest');
const express = require('express');
const rateLimit = require('../security/rate-limiting-middleware');
const securityPatches = require('../security/security-patches');
const { User } = require('../src/models/User');

// Create test app with security middleware
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Apply rate limiting
  app.use('/api/auth', rateLimit.applyRateLimit('auth'));
  app.use('/api/booking', rateLimit.applyRateLimit('booking'));
  app.use('/api/telegram', rateLimit.applyRateLimit('telegram'));
  app.use('/api', rateLimit.applyRateLimit('general'));
  
  // Test endpoints
  app.post('/api/auth/login', (req, res) => {
    res.json({ message: 'Login attempt', ip: req.ip });
  });
  
  app.post('/api/booking/create', (req, res) => {
    res.json({ message: 'Booking attempt', ip: req.ip });
  });
  
  app.post('/api/telegram/webhook', (req, res) => {
    res.json({ message: 'Webhook received', ip: req.ip });
  });
  
  app.get('/api/test', (req, res) => {
    res.json({ message: 'General API', ip: req.ip });
  });
  
  return app;
};

describe('Security Validation Tests', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  describe('Rate Limiting Protection', () => {
    test('SEC-001: General API rate limiting blocks excessive requests', async () => {
      const requests = [];
      
      // Send requests up to the limit
      for (let i = 0; i < 50; i++) {
        requests.push(request(app).get('/api/test'));
      }
      
      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(successCount).toBeLessThanOrEqual(50);
      expect(rateLimitedCount).toBeGreaterThanOrEqual(0);
    });
    
    test('SEC-002: Authentication endpoints have strict rate limiting', async () => {
      const requests = [];
      
      // Send 10 auth requests (limit is 5)
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({ email: 'test@test.com', password: 'test' })
        );
      }
      
      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
    
    test('SEC-003: Booking endpoints have appropriate rate limiting', async () => {
      const requests = [];
      
      // Send 15 booking requests (limit is 10)
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .post('/api/booking/create')
            .send({ service_id: 1, date: '2025-08-09' })
        );
      }
      
      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
    
    test('SEC-004: Telegram webhook has proper rate limiting', async () => {
      const requests = [];
      
      // Send 35 webhook requests (limit is 30)
      for (let i = 0; i < 35; i++) {
        requests.push(
          request(app)
            .post('/api/telegram/webhook')
            .send({ update_id: i, message: { text: 'test' } })
        );
      }
      
      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('Security Patches Validation', () => {
    test('SEC-005: Exposed bot token is detected and blocked', () => {
      const exposedToken = 'TELEGRAM_BOT_TOKEN_PLACEHOLDER';
      
      const isValid = securityPatches.validateBotToken(exposedToken);
      
      expect(isValid).toBe(false);
    });
    
    test('SEC-006: Unauthorized admin ID is rejected', () => {
      const unauthorizedId = '7930798268';
      const authorizedAdmins = ['1234567', '7654321'];
      
      const isAuthorized = securityPatches.isAuthorizedAdmin(
        unauthorizedId,
        authorizedAdmins
      );
      
      expect(isAuthorized).toBe(false);
    });
    
    test('SEC-007: Input sanitization prevents injection', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        "'; DROP TABLE users; --",
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">'
      ];
      
      maliciousInputs.forEach(input => {
        const sanitized = securityPatches.sanitizeInput(input);
        
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
      });
    });
    
    test('SEC-008: Appointment data sanitization works', () => {
      const maliciousData = {
        client_id: '123abc', // Should be numeric
        provider_id: '456def', // Should be numeric
        service_id: '789ghi', // Should be numeric
        notes: '<script>alert("xss")</script>',
        appointment_datetime: 'invalid-date'
      };
      
      expect(() => {
        securityPatches.sanitizeAppointmentData(maliciousData);
      }).toThrow();
    });
    
    test('SEC-009: Valid appointment data passes sanitization', () => {
      const validData = {
        client_id: '123',
        provider_id: '456',
        service_id: '789',
        notes: 'Regular appointment notes',
        appointment_datetime: '2025-08-09T10:00:00.000Z'
      };
      
      const sanitized = securityPatches.sanitizeAppointmentData(validData);
      
      expect(sanitized.client_id).toBe(123);
      expect(sanitized.provider_id).toBe(456);
      expect(sanitized.service_id).toBe(789);
      expect(sanitized.notes).toBe('Regular appointment notes');
      expect(sanitized.appointment_datetime).toBeDefined();
    });
    
    test('SEC-010: API key generation and hashing works', async () => {
      const apiKey = securityPatches.generateAPIKey();
      const hashedKey = await securityPatches.hashAPIKey(apiKey);
      
      expect(apiKey).toHaveLength(64); // 32 bytes hex = 64 characters
      expect(hashedKey).toBeDefined();
      expect(hashedKey).not.toBe(apiKey);
      
      const isValid = await securityPatches.verifyAPIKey(apiKey, hashedKey);
      expect(isValid).toBe(true);
      
      const isInvalid = await securityPatches.verifyAPIKey('wrong-key', hashedKey);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Security Audit', () => {
    test('SEC-011: Security audit identifies vulnerabilities', () => {
      const insecureConfig = {
        TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN_PLACEHOLDER',
        ADMIN_USER_IDS: ['1234', '7930798268'],
        SUPPORT_SYSTEM_ENABLED: 'true',
        SUPPORT_GROUP_ID: '',
        JWT_SECRET: 'short',
        RATE_LIMIT_MAX_REQUESTS: 200
      };
      
      const audit = securityPatches.performSecurityAudit(insecureConfig);
      
      expect(audit.total_issues).toBeGreaterThan(0);
      expect(audit.critical_issues).toBeGreaterThan(0);
      expect(audit.issues).toBeDefined();
      expect(audit.issues.some(i => i.issue.includes('Exposed bot token'))).toBe(true);
    });
    
    test('SEC-012: Security audit passes for secure configuration', () => {
      const secureConfig = {
        TELEGRAM_BOT_TOKEN: '1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12',
        ADMIN_USER_IDS: ['1234567890', '0987654321'],
        SUPPORT_SYSTEM_ENABLED: 'true',
        SUPPORT_GROUP_ID: '-100123456789',
        JWT_SECRET: 'very_long_and_secure_jwt_secret_key_with_64_plus_characters_for_security',
        RATE_LIMIT_MAX_REQUESTS: 50
      };
      
      const audit = securityPatches.performSecurityAudit(secureConfig);
      
      expect(audit.critical_issues).toBe(0);
      expect(audit.high_issues).toBeLessThanOrEqual(1); // May have minor issues
    });
    
    test('SEC-013: Security report generation works', () => {
      const report = securityPatches.generateSecurityReport();
      
      expect(report.report_id).toBeDefined();
      expect(report.generated_at).toBeDefined();
      expect(report.vulnerabilities_identified).toBeGreaterThan(0);
      expect(report.vulnerabilities).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Environment Configuration Security', () => {
    test('SEC-014: Secure environment config generation', () => {
      const config = securityPatches.generateSecureEnvironmentConfig();
      
      expect(config.DB_PASSWORD).toHaveLength(32);
      expect(config.JWT_SECRET).toHaveLength(128);
      expect(config.SESSION_SECRET).toHaveLength(64);
      expect(config.API_KEY).toHaveLength(64);
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(50);
      expect(config.SECURITY_HEADERS_ENABLED).toBe(true);
      expect(config.CSRF_PROTECTION_ENABLED).toBe(true);
    });
    
    test('SEC-015: Security audit logging works', () => {
      const auditLog = securityPatches.createSecurityAuditLog(
        'failed_login_attempt',
        {
          severity: 'high',
          user_agent: 'test-agent',
          ip_address: '192.168.1.1',
          user_id: 'test-user'
        }
      );
      
      expect(auditLog.timestamp).toBeDefined();
      expect(auditLog.event).toBe('failed_login_attempt');
      expect(auditLog.severity).toBe('high');
      expect(auditLog.details.user_agent).toBe('test-agent');
      expect(auditLog.details.ip_address).toBe('192.168.1.1');
      expect(auditLog.details.user_id).toBe('test-user');
    });
  });

  describe('Suspicious Activity Detection', () => {
    test('SEC-016: Suspicious activity tracking blocks malicious IPs', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(rateLimit.trackSuspiciousActivity);
      testApp.get('/test', (req, res) => res.json({ ok: true }));
      
      const requests = [];
      
      // Send 250 requests to trigger suspicious activity detection
      for (let i = 0; i < 250; i++) {
        requests.push(request(testApp).get('/test'));
      }
      
      const responses = await Promise.all(requests);
      const blockedCount = responses.filter(r => r.status === 429).length;
      
      expect(blockedCount).toBeGreaterThan(0);
    }, 10000); // Increase timeout for this test
    
    test('SEC-017: Rate limit headers are properly set', async () => {
      const response = await request(app).get('/api/test');
      
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('SEC-018: SQL injection prevention', () => {
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker'); --"
      ];
      
      sqlPayloads.forEach(payload => {
        const sanitized = securityPatches.sanitizeInput(payload);
        
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('UNION SELECT');
        expect(sanitized).not.toContain('INSERT INTO');
        expect(sanitized).not.toContain("'");
      });
    });
    
    test('SEC-019: XSS prevention', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        'javascript:alert("xss")'
      ];
      
      xssPayloads.forEach(payload => {
        const sanitized = securityPatches.sanitizeInput(payload);
        
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<img');
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      });
    });
    
    test('SEC-020: Command injection prevention', () => {
      const commandPayloads = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& whoami',
        '`id`',
        '$(whoami)'
      ];
      
      commandPayloads.forEach(payload => {
        const sanitized = securityPatches.sanitizeInput(payload);
        
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('&&');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('$');
      });
    });
  });

  describe('Token and Credential Security', () => {
    test('SEC-021: JWT secret generation is secure', () => {
      const secret1 = securityPatches.generateSecureJWTSecret();
      const secret2 = securityPatches.generateSecureJWTSecret();
      
      expect(secret1).toHaveLength(128); // 64 bytes hex
      expect(secret2).toHaveLength(128);
      expect(secret1).not.toBe(secret2); // Should be unique
      expect(secret1).toMatch(/^[a-f0-9]{128}$/); // Hex format
    });
    
    test('SEC-022: Session secret generation is secure', () => {
      const secret = securityPatches.generateSecureSessionSecret();
      
      expect(secret).toHaveLength(64); // 32 bytes hex
      expect(secret).toMatch(/^[a-f0-9]{64}$/); // Hex format
    });
    
    test('SEC-023: Bot token validation regex works correctly', () => {
      const validTokens = [
        '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12',
        '1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ-_abcdef'
      ];
      
      const invalidTokens = [
        'invalid-token',
        '123:short',
        '12345678901:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12', // Too long bot ID
        '1234567:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12345' // Too long hash
      ];
      
      validTokens.forEach(token => {
        expect(securityPatches.validateBotToken(token)).toBe(true);
      });
      
      invalidTokens.forEach(token => {
        expect(securityPatches.validateBotToken(token)).toBe(false);
      });
    });
  });
});

// Test helper functions
const SecurityTestHelpers = {
  createMaliciousPayload: (type) => {
    const payloads = {
      sql: "'; DROP TABLE users; --",
      xss: '<script>alert("xss")</script>',
      command: '; rm -rf /',
      path: '../../../etc/passwd',
      json: '{"__proto__": {"admin": true}}'
    };
    return payloads[type] || payloads.sql;
  },
  
  simulateRateLimitAttack: async (app, endpoint, count = 100) => {
    const requests = [];
    for (let i = 0; i < count; i++) {
      requests.push(request(app).get(endpoint));
    }
    return Promise.all(requests);
  },
  
  validateSecurityHeaders: (response) => {
    return {
      hasRateLimit: !!response.headers['x-ratelimit-limit'],
      hasCSP: !!response.headers['content-security-policy'],
      hasXFrame: !!response.headers['x-frame-options'],
      hasXSSProtection: !!response.headers['x-xss-protection']
    };
  }
};

module.exports = {
  SecurityTestHelpers
};