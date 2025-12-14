// Jest test setup file
require('dotenv').config({ path: '.env.test' });

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.LOG_LEVEL = 'error';

// Mock Telegram bot to prevent API calls during tests
jest.mock('telegraf', () => {
  const mockBot = {
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({}),
      getMe: jest.fn().mockResolvedValue({ id: 123456789, is_bot: true, username: 'test_bot' })
    },
    launch: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    command: jest.fn(),
    action: jest.fn(),
    hears: jest.fn(),
    use: jest.fn()
  };
  
  return {
    Telegraf: jest.fn(() => mockBot),
    Markup: {
      inlineKeyboard: jest.fn(() => ({ reply_markup: {} })),
      button: {
        callback: jest.fn()
      }
    }
  };
});

// Increase timeout for CI/CD environments
if (process.env.CI) {
  jest.setTimeout(60000);
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  generateMockUser: () => ({
    id: Math.floor(Math.random() * 1000000),
    telegramId: Math.floor(Math.random() * 1000000000).toString(),
    username: `test_user_${Date.now()}`,
    firstName: 'Test',
    lastName: 'User',
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  
  generateMockAppointment: () => ({
    id: Math.floor(Math.random() * 1000000),
    userId: Math.floor(Math.random() * 1000000),
    date: new Date(Date.now() + 86400000), // Tomorrow
    time: '10:00',
    service: 'Lodge Mobile Activations',
    notes: 'Test appointment',
    status: 'confirmed',
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};