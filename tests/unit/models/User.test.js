const User = require('../../../src/models/User');
const TestFactory = require('../../utils/test-factory');
const bcrypt = require('bcrypt');

// Mock the database connection
jest.mock('objection', () => ({
  Model: class MockModel {
    static get tableName() { return 'users'; }
    static query() { return new MockQueryBuilder(); }
    $query() { return new MockQueryBuilder(); }
  }
}));

class MockQueryBuilder {
  insert = jest.fn().mockReturnThis();
  select = jest.fn().mockReturnThis();
  where = jest.fn().mockReturnThis();
  findById = jest.fn().mockReturnThis();
  patch = jest.fn().mockReturnThis();
  delete = jest.fn().mockReturnThis();
  first = jest.fn().mockReturnThis();
}

describe('User Model', () => {
  let mockUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUser = await TestFactory.createUser();
  });

  describe('Model Structure', () => {
    test('should have correct table name', () => {
      expect(User.tableName).toBe('users');
    });

    test('should have uuid as id column', () => {
      expect(User.idColumn).toBe('uuid');
    });

    test('should define correct JSON schema', () => {
      const schema = User.jsonSchema;
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('first_name');
      expect(schema.required).toContain('last_name');
      expect(schema.required).toContain('email');
      expect(schema.properties.email.format).toBe('email');
    });
  });

  describe('Virtual Properties', () => {
    test('should calculate fullName correctly', () => {
      const user = new User();
      user.first_name = 'John';
      user.last_name = 'Doe';
      
      expect(user.fullName).toBe('John Doe');
    });

    test('should handle missing names gracefully', () => {
      const user = new User();
      user.first_name = 'John';
      
      expect(user.fullName).toBe('John ');
    });
  });

  describe('Static Methods', () => {
    test('should find user by email', async () => {
      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.first.mockResolvedValue(mockUser);
      User.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await User.findByEmail('test@example.com');

      expect(User.query).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('email', 'test@example.com');
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    test('should find user by telegram ID', async () => {
      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.first.mockResolvedValue(mockUser);
      User.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await User.findByTelegramId('123456789');

      expect(User.query).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('telegram_user_id', '123456789');
      expect(result).toEqual(mockUser);
    });

    test('should create user with hashed password', async () => {
      const userData = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        password: 'plaintext123'
      };

      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.insert.mockResolvedValue(mockUser);
      User.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await User.createUser(userData);

      expect(User.query).toHaveBeenCalled();
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          password_hash: expect.any(String)
        })
      );
      expect(result).toEqual(mockUser);
    });
  });

  describe('Instance Methods', () => {
    test('should verify correct password', async () => {
      const plainPassword = 'testpassword123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      const user = new User();
      user.password_hash = hashedPassword;

      const result = await user.verifyPassword(plainPassword);
      expect(result).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const plainPassword = 'testpassword123';
      const wrongPassword = 'wrongpassword';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      const user = new User();
      user.password_hash = hashedPassword;

      const result = await user.verifyPassword(wrongPassword);
      expect(result).toBe(false);
    });

    test('should update last login timestamp', async () => {
      const user = new User();
      user.$query = jest.fn().mockReturnValue({
        patch: jest.fn().mockResolvedValue(user)
      });

      await user.updateLastLogin();

      expect(user.$query).toHaveBeenCalled();
      expect(user.$query().patch).toHaveBeenCalledWith({
        last_login: expect.any(Date)
      });
    });
  });

  describe('Validation', () => {
    test('should validate required fields', () => {
      expect(() => {
        User.fromJson({});
      }).not.toThrow(); // Objection handles validation

      const schema = User.jsonSchema;
      expect(schema.required).toEqual(
        expect.arrayContaining(['first_name', 'last_name', 'email'])
      );
    });

    test('should validate email format', () => {
      const schema = User.jsonSchema;
      expect(schema.properties.email.format).toBe('email');
    });

    test('should validate role enum', () => {
      const schema = User.jsonSchema;
      expect(schema.properties.role.enum).toContain('client');
      expect(schema.properties.role.enum).toContain('provider');
      expect(schema.properties.role.enum).toContain('admin');
    });
  });

  describe('Relationships', () => {
    test('should define appointments relationship', () => {
      expect(User.relationMappings).toBeDefined();
      expect(User.relationMappings.appointments).toBeDefined();
      expect(User.relationMappings.appointments.relation).toBe(User.HasManyRelation);
    });

    test('should define services relationship for providers', () => {
      expect(User.relationMappings.services).toBeDefined();
      expect(User.relationMappings.services.relation).toBe(User.HasManyRelation);
    });
  });
});