const authMiddleware = require('../../../src/middleware/auth');
const jwt = require('jsonwebtoken');
const TestFactory = require('../../utils/test-factory');
const { createMockRequest, createMockResponse } = require('../../utils/mocks');

// Mock JWT
jest.mock('jsonwebtoken');

// Mock User model
jest.mock('../../../src/models/User', () => ({
  findById: jest.fn()
}));

const User = require('../../../src/models/User');

describe('Auth Middleware', () => {
  let req, res, next;
  let mockUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockUser = await TestFactory.createUser();
    req = createMockRequest();
    res = createMockResponse();
    next = jest.fn();
  });

  describe('authenticateToken', () => {
    test('should authenticate valid JWT token', async () => {
      const token = 'valid.jwt.token';
      const decodedToken = { userId: mockUser.id, role: 'client' };
      
      req.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue(decodedToken);
      User.findById.mockResolvedValue(mockUser);

      await authMiddleware.authenticateToken(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET || 'fallback-secret');
      expect(User.findById).toHaveBeenCalledWith(mockUser.id);
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    test('should reject missing authorization header', async () => {
      await authMiddleware.authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'MISSING_TOKEN'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject malformed authorization header', async () => {
      req.headers.authorization = 'InvalidFormat';

      await authMiddleware.authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid JWT token', async () => {
      const token = 'invalid.jwt.token';
      req.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockImplementation(() => {
        throw new Error('JsonWebTokenError');
      });

      await authMiddleware.authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject expired JWT token', async () => {
      const token = 'expired.jwt.token';
      req.headers.authorization = `Bearer ${token}`;
      const error = new Error('TokenExpiredError');
      error.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => { throw error; });

      await authMiddleware.authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    });

    test('should handle user not found', async () => {
      const token = 'valid.jwt.token';
      const decodedToken = { userId: 999, role: 'client' };
      
      req.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue(decodedToken);
      User.findById.mockResolvedValue(null);

      await authMiddleware.authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    });

    test('should handle inactive user', async () => {
      const inactiveUser = await TestFactory.createUser({ is_active: false });
      const token = 'valid.jwt.token';
      const decodedToken = { userId: inactiveUser.id, role: 'client' };
      
      req.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue(decodedToken);
      User.findById.mockResolvedValue(inactiveUser);

      await authMiddleware.authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Account is inactive',
        code: 'ACCOUNT_INACTIVE'
      });
    });
  });

  describe('requireRole', () => {
    test('should allow access for matching role', async () => {
      req.user = await TestFactory.createUser({ role: 'admin' });

      const middleware = authMiddleware.requireRole('admin');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should allow access for multiple roles', async () => {
      req.user = await TestFactory.createUser({ role: 'provider' });

      const middleware = authMiddleware.requireRole(['admin', 'provider']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny access for non-matching role', async () => {
      req.user = await TestFactory.createUser({ role: 'client' });

      const middleware = authMiddleware.requireRole('admin');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        required_role: 'admin',
        user_role: 'client',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle missing user in request', async () => {
      req.user = null;

      const middleware = authMiddleware.requireRole('admin');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED'
      });
    });
  });

  describe('requireOwnership', () => {
    test('should allow resource owner access', async () => {
      req.user = mockUser;
      req.params.userId = mockUser.id;

      await authMiddleware.requireOwnership(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should allow admin access', async () => {
      const adminUser = await TestFactory.createAdmin();
      req.user = adminUser;
      req.params.userId = '999'; // Different user

      await authMiddleware.requireOwnership(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny access for non-owner', async () => {
      req.user = mockUser;
      req.params.userId = '999'; // Different user

      await authMiddleware.requireOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied to this resource',
        code: 'ACCESS_DENIED'
      });
    });
  });

  describe('optionalAuth', () => {
    test('should authenticate valid token', async () => {
      const token = 'valid.jwt.token';
      const decodedToken = { userId: mockUser.id, role: 'client' };
      
      req.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue(decodedToken);
      User.findById.mockResolvedValue(mockUser);

      await authMiddleware.optionalAuth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    test('should continue without authentication if no token', async () => {
      await authMiddleware.optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should continue with invalid token but set user to null', async () => {
      const token = 'invalid.jwt.token';
      req.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authMiddleware.optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('clientOnly', () => {
    test('should allow client role access', async () => {
      req.user = await TestFactory.createUser({ role: 'client' });

      await authMiddleware.clientOnly(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny non-client access', async () => {
      req.user = await TestFactory.createProvider();

      await authMiddleware.clientOnly(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'This endpoint is only available to clients',
        code: 'CLIENT_ONLY'
      });
    });
  });

  describe('providerOnly', () => {
    test('should allow provider role access', async () => {
      req.user = await TestFactory.createProvider();

      await authMiddleware.providerOnly(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should allow admin access to provider endpoints', async () => {
      req.user = await TestFactory.createAdmin();

      await authMiddleware.providerOnly(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should deny client access', async () => {
      req.user = await TestFactory.createUser({ role: 'client' });

      await authMiddleware.providerOnly(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'This endpoint is only available to providers',
        code: 'PROVIDER_ONLY'
      });
    });
  });
});