/**
 * Basic functionality tests to validate test framework
 */
const TestFactory = require('../utils/test-factory');
const { 
  MockDatabase, 
  MockTelegramBot, 
  MockEmailTransporter,
  createMockRequest,
  createMockResponse 
} = require('../utils/mocks');

describe('Basic Functionality Tests', () => {
  describe('Test Framework Validation', () => {
    test('should run basic Jest test', () => {
      expect(true).toBe(true);
      expect(1 + 1).toBe(2);
      expect('hello').toBe('hello');
    });

    test('should handle async/await', async () => {
      const promise = Promise.resolve('success');
      const result = await promise;
      expect(result).toBe('success');
    });

    test('should mock functions', () => {
      const mockFn = jest.fn();
      mockFn('test');
      expect(mockFn).toHaveBeenCalledWith('test');
    });

    test('should test objects', () => {
      const obj = { name: 'test', value: 42 };
      expect(obj).toHaveProperty('name');
      expect(obj.name).toBe('test');
      expect(obj).toMatchObject({ name: 'test' });
    });

    test('should test arrays', () => {
      const arr = [1, 2, 3];
      expect(arr).toHaveLength(3);
      expect(arr).toContain(2);
      expect(arr[0]).toBe(1);
    });
  });

  describe('Test Factory', () => {
    test('should create user data', async () => {
      const user = await TestFactory.createUser();
      
      expect(user).toBeDefined();
      expect(user.first_name).toBeDefined();
      expect(user.last_name).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.password_hash).toBeDefined();
      expect(user.role).toBe('client');
    });

    test('should create provider data', async () => {
      const provider = await TestFactory.createProvider();
      
      expect(provider).toBeDefined();
      expect(provider.role).toBe('provider');
      expect(provider.first_name).toContain('Provider');
    });

    test('should create admin data', async () => {
      const admin = await TestFactory.createAdmin();
      
      expect(admin).toBeDefined();
      expect(admin.role).toBe('admin');
      expect(admin.first_name).toBe('Admin');
    });

    test('should create appointment data', () => {
      const appointment = TestFactory.createAppointment();
      
      expect(appointment).toBeDefined();
      expect(appointment.appointment_datetime).toBeInstanceOf(Date);
      expect(appointment.status).toBe('scheduled');
      expect(appointment.duration_minutes).toBe(30);
    });

    test('should create service data', () => {
      const service = TestFactory.createService();
      
      expect(service).toBeDefined();
      expect(service.name).toBeDefined();
      expect(service.duration_minutes).toBe(30);
      expect(service.price).toBe(100.00);
    });

    test('should create multiple items', async () => {
      const users = await TestFactory.createMultiple('createUser', 3);
      
      expect(users).toHaveLength(3);
      expect(users[0].email).not.toBe(users[1].email);
      expect(users[1].email).not.toBe(users[2].email);
    });

    test('should reset sequences', async () => {
      TestFactory.resetSequences();
      const user1 = await TestFactory.createUser();
      const user2 = await TestFactory.createUser();
      
      expect(user1.first_name).toBe('Test1');
      expect(user2.first_name).toBe('Test2');
    });
  });

  describe('Mock Database', () => {
    let mockDb;

    beforeEach(() => {
      mockDb = new MockDatabase();
    });

    test('should insert data', async () => {
      const userData = { name: 'John', email: 'john@test.com' };
      const result = await mockDb.table('users').insert(userData);
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('John');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    test('should query data', async () => {
      await mockDb.table('users').insert({ name: 'John', email: 'john@test.com' });
      await mockDb.table('users').insert({ name: 'Jane', email: 'jane@test.com' });
      
      const users = await mockDb.table('users').select();
      expect(users).toHaveLength(2);
      
      const john = await mockDb.table('users').where('name', 'John').first();
      expect(john).toBeDefined();
      expect(john.name).toBe('John');
    });

    test('should update data', async () => {
      await mockDb.table('users').insert({ name: 'John', email: 'john@test.com' });
      
      const updateCount = await mockDb.table('users')
        .where('name', 'John')
        .update({ email: 'john.updated@test.com' });
      
      expect(updateCount).toBe(1);
    });

    test('should delete data', async () => {
      await mockDb.table('users').insert({ name: 'John', email: 'john@test.com' });
      
      const deleteCount = await mockDb.table('users')
        .where('name', 'John')
        .del();
      
      expect(deleteCount).toBe(1);
      
      const users = await mockDb.table('users').select();
      expect(users).toHaveLength(0);
    });
  });

  describe('Mock Telegram Bot', () => {
    let mockBot;

    beforeEach(() => {
      mockBot = new MockTelegramBot();
    });

    test('should send message', async () => {
      const chatId = '123456789';
      const text = 'Hello, World!';
      
      const result = await mockBot.sendMessage(chatId, text);
      
      expect(result).toBeDefined();
      expect(result.message_id).toBeDefined();
      expect(result.text).toBe(text);
      expect(mockBot.sentMessages).toHaveLength(1);
    });

    test('should track message count', async () => {
      await mockBot.sendMessage('123', 'Message 1');
      await mockBot.sendMessage('456', 'Message 2');
      
      expect(mockBot.getMessageCount()).toBe(2);
    });

    test('should get last message', async () => {
      await mockBot.sendMessage('123', 'First message');
      await mockBot.sendMessage('456', 'Second message');
      
      const lastMessage = mockBot.getLastMessage();
      expect(lastMessage.text).toBe('Second message');
    });

    test('should clear messages', async () => {
      await mockBot.sendMessage('123', 'Message');
      expect(mockBot.getMessageCount()).toBe(1);
      
      mockBot.clearMessages();
      expect(mockBot.getMessageCount()).toBe(0);
    });
  });

  describe('Mock Email Transporter', () => {
    let mockTransporter;

    beforeEach(() => {
      mockTransporter = new MockEmailTransporter();
    });

    test('should send email', async () => {
      const mailOptions = {
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email'
      };
      
      const result = await mockTransporter.sendMail(mailOptions);
      
      expect(result).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(mockTransporter.sentEmails).toHaveLength(1);
    });

    test('should track sent emails', async () => {
      await mockTransporter.sendMail({ to: 'user1@test.com', subject: 'Email 1' });
      await mockTransporter.sendMail({ to: 'user2@test.com', subject: 'Email 2' });
      
      expect(mockTransporter.getEmailCount()).toBe(2);
      
      const lastEmail = mockTransporter.getLastEmail();
      expect(lastEmail.subject).toBe('Email 2');
    });

    test('should find emails by criteria', async () => {
      await mockTransporter.sendMail({ to: 'user1@test.com', subject: 'Welcome' });
      await mockTransporter.sendMail({ to: 'user2@test.com', subject: 'Reminder' });
      await mockTransporter.sendMail({ to: 'user1@test.com', subject: 'Welcome Back' });
      
      const welcomeEmails = mockTransporter.findEmails(email => 
        email.subject.includes('Welcome')
      );
      
      expect(welcomeEmails).toHaveLength(2);
    });
  });

  describe('HTTP Request/Response Mocks', () => {
    test('should create mock request', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/test',
        body: { name: 'test' }
      });
      
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/api/test');
      expect(req.body.name).toBe('test');
    });

    test('should create mock response', () => {
      const res = createMockResponse();
      
      res.status(200).json({ message: 'success' });
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'success' });
    });
  });

  describe('Date and Time Utilities', () => {
    test('should handle future dates', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(futureDate.getTime()).toBeGreaterThan(Date.now());
    });

    test('should handle past dates', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(pastDate.getTime()).toBeLessThan(Date.now());
    });

    test('should calculate time differences', () => {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const diff = oneHourLater.getTime() - now.getTime();
      
      expect(diff).toBe(60 * 60 * 1000); // 1 hour in milliseconds
    });
  });

  describe('Error Handling', () => {
    test('should handle thrown errors', () => {
      const errorFunction = () => {
        throw new Error('Test error');
      };
      
      expect(errorFunction).toThrow('Test error');
    });

    test('should handle async errors', async () => {
      const asyncErrorFunction = async () => {
        throw new Error('Async error');
      };
      
      await expect(asyncErrorFunction()).rejects.toThrow('Async error');
    });

    test('should handle promise rejection', async () => {
      const rejectedPromise = Promise.reject(new Error('Promise rejected'));
      
      await expect(rejectedPromise).rejects.toThrow('Promise rejected');
    });
  });
});