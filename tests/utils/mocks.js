/**
 * Comprehensive mocking utilities for the Lodge Scheduler test suite
 */

class MockDatabase {
  constructor() {
    this.data = new Map();
    this.sequences = new Map();
  }

  // Simulate table operations
  table(tableName) {
    if (!this.data.has(tableName)) {
      this.data.set(tableName, []);
      this.sequences.set(tableName, 1);
    }
    return new MockQueryBuilder(this, tableName);
  }

  // Reset all data
  reset() {
    this.data.clear();
    this.sequences.clear();
  }

  // Get next ID for table
  getNextId(tableName) {
    const current = this.sequences.get(tableName) || 1;
    this.sequences.set(tableName, current + 1);
    return current;
  }
}

class MockQueryBuilder {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.whereConditions = [];
    this.selectFields = [];
    this.orderByFields = [];
    this.limitValue = null;
  }

  where(field, operator, value) {
    if (arguments.length === 2) {
      value = operator;
      operator = '=';
    }
    this.whereConditions.push({ field, operator, value });
    return this;
  }

  select(...fields) {
    this.selectFields = fields.length ? fields : ['*'];
    return this;
  }

  orderBy(field, direction = 'asc') {
    this.orderByFields.push({ field, direction });
    return this;
  }

  limit(count) {
    this.limitValue = count;
    return this;
  }

  async insert(data) {
    const tableData = this.db.data.get(this.tableName);
    const id = this.db.getNextId(this.tableName);
    const record = { id, ...data, created_at: new Date(), updated_at: new Date() };
    tableData.push(record);
    return record;
  }

  async update(data) {
    const tableData = this.db.data.get(this.tableName);
    const updatedRecords = [];
    
    for (let record of tableData) {
      if (this.matchesConditions(record)) {
        Object.assign(record, data, { updated_at: new Date() });
        updatedRecords.push(record);
      }
    }
    
    return updatedRecords.length;
  }

  async del() {
    const tableData = this.db.data.get(this.tableName);
    const initialLength = tableData.length;
    
    const filteredData = tableData.filter(record => !this.matchesConditions(record));
    this.db.data.set(this.tableName, filteredData);
    
    return initialLength - filteredData.length;
  }

  async select() {
    const tableData = this.db.data.get(this.tableName);
    let results = tableData.filter(record => this.matchesConditions(record));
    
    // Apply ordering
    if (this.orderByFields.length > 0) {
      results.sort((a, b) => {
        for (const { field, direction } of this.orderByFields) {
          const aVal = a[field];
          const bVal = b[field];
          if (aVal < bVal) return direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    
    // Apply limit
    if (this.limitValue) {
      results = results.slice(0, this.limitValue);
    }
    
    return results;
  }

  async first() {
    const results = await this.select();
    return results.length > 0 ? results[0] : null;
  }

  matchesConditions(record) {
    return this.whereConditions.every(({ field, operator, value }) => {
      const recordValue = record[field];
      switch (operator) {
        case '=': return recordValue === value;
        case '!=': return recordValue !== value;
        case '>': return recordValue > value;
        case '<': return recordValue < value;
        case '>=': return recordValue >= value;
        case '<=': return recordValue <= value;
        case 'like': return recordValue && recordValue.toString().includes(value.replace(/%/g, ''));
        default: return recordValue === value;
      }
    });
  }
}

class MockTelegramBot {
  constructor() {
    this.sentMessages = [];
    this.callbacks = new Map();
  }

  sendMessage(chatId, text, options = {}) {
    const message = {
      message_id: Date.now(),
      chat: { id: chatId },
      text,
      ...options
    };
    this.sentMessages.push(message);
    return Promise.resolve(message);
  }

  editMessageText(text, options = {}) {
    const message = {
      message_id: options.message_id || Date.now(),
      text,
      ...options
    };
    this.sentMessages.push({ ...message, edited: true });
    return Promise.resolve(message);
  }

  deleteMessage(chatId, messageId) {
    this.sentMessages.push({ deleted: true, chat: { id: chatId }, message_id: messageId });
    return Promise.resolve(true);
  }

  answerCallbackQuery(callbackQueryId, options = {}) {
    return Promise.resolve({ callback_query_id: callbackQueryId, ...options });
  }

  on(event, handler) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event).push(handler);
  }

  command(command, handler) {
    this.on(`command:${command}`, handler);
  }

  action(action, handler) {
    this.on(`action:${action}`, handler);
  }

  launch() {
    return Promise.resolve();
  }

  stop() {
    return Promise.resolve();
  }

  // Test helpers
  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getMessageCount() {
    return this.sentMessages.length;
  }

  clearMessages() {
    this.sentMessages = [];
  }

  // Simulate receiving a message
  simulateMessage(text, userId = '123456789') {
    const message = {
      message_id: Date.now(),
      from: { id: userId, username: `user${userId}` },
      chat: { id: userId },
      text,
      date: Math.floor(Date.now() / 1000)
    };

    // Trigger appropriate handlers
    if (text.startsWith('/')) {
      const command = text.split(' ')[0].substring(1);
      const handlers = this.callbacks.get(`command:${command}`);
      if (handlers) {
        handlers.forEach(handler => handler({ message }));
      }
    }

    return message;
  }
}

class MockEmailTransporter {
  constructor() {
    this.sentEmails = [];
  }

  sendMail(mailOptions) {
    const email = {
      messageId: `mock-${Date.now()}@test.com`,
      ...mailOptions,
      sent_at: new Date()
    };
    this.sentEmails.push(email);
    return Promise.resolve(email);
  }

  getLastEmail() {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  getEmailCount() {
    return this.sentEmails.length;
  }

  clearEmails() {
    this.sentEmails = [];
  }

  findEmails(predicate) {
    return this.sentEmails.filter(predicate);
  }
}

class MockSMSClient {
  constructor() {
    this.sentMessages = [];
  }

  messages = {
    create: (messageData) => {
      const sms = {
        sid: `SMS${Date.now()}`,
        ...messageData,
        sent_at: new Date()
      };
      this.sentMessages.push(sms);
      return Promise.resolve(sms);
    }
  };

  getLastSMS() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getSMSCount() {
    return this.sentMessages.length;
  }

  clearSMS() {
    this.sentMessages = [];
  }
}

class MockRedisClient {
  constructor() {
    this.data = new Map();
    this.ttls = new Map();
  }

  async set(key, value, ex = null) {
    this.data.set(key, value);
    if (ex) {
      setTimeout(() => {
        this.data.delete(key);
        this.ttls.delete(key);
      }, ex * 1000);
      this.ttls.set(key, Date.now() + (ex * 1000));
    }
    return 'OK';
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async del(key) {
    return this.data.delete(key) ? 1 : 0;
  }

  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  }

  async expire(key, seconds) {
    if (!this.data.has(key)) return 0;
    
    setTimeout(() => {
      this.data.delete(key);
      this.ttls.delete(key);
    }, seconds * 1000);
    
    this.ttls.set(key, Date.now() + (seconds * 1000));
    return 1;
  }

  async ttl(key) {
    const expiry = this.ttls.get(key);
    if (!expiry) return -1;
    return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
  }

  // Hash operations
  async hset(key, field, value) {
    if (!this.data.has(key)) {
      this.data.set(key, {});
    }
    const hash = this.data.get(key);
    hash[field] = value;
    return 1;
  }

  async hget(key, field) {
    const hash = this.data.get(key);
    return hash ? hash[field] || null : null;
  }

  async hgetall(key) {
    return this.data.get(key) || {};
  }

  // Test utilities
  clear() {
    this.data.clear();
    this.ttls.clear();
  }

  size() {
    return this.data.size;
  }
}

// Mock factory functions
const createMockExpress = () => ({
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  listen: jest.fn((port, callback) => {
    if (callback) callback();
    return { close: jest.fn() };
  })
});

const createMockRequest = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  headers: {},
  user: null,
  method: 'GET',
  url: '/',
  ip: '127.0.0.1',
  ...overrides
});

const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    locals: {}
  };
  return res;
};

// Global mock instances
const mockDb = new MockDatabase();
const mockTelegramBot = new MockTelegramBot();
const mockEmailTransporter = new MockEmailTransporter();
const mockSMSClient = new MockSMSClient();
const mockRedisClient = new MockRedisClient();

module.exports = {
  MockDatabase,
  MockQueryBuilder,
  MockTelegramBot,
  MockEmailTransporter,
  MockSMSClient,
  MockRedisClient,
  createMockExpress,
  createMockRequest,
  createMockResponse,
  
  // Global instances
  mockDb,
  mockTelegramBot,
  mockEmailTransporter,
  mockSMSClient,
  mockRedisClient
};