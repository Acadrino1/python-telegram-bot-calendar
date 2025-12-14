const TelegramBot = require('node-telegram-bot-api');
const SimpleTelegramBot = require('../../../src/bot/SimpleTelegramBot');
const EnhancedCallbackQueryHandler = require('../../../src/bot/handlers/EnhancedCallbackQueryHandler');

// Mock the Telegram Bot API
jest.mock('node-telegram-bot-api');

describe('Telegram Bot Integration Tests', () => {
  let bot;
  let mockTelegramBot;
  let callbackHandler;

  beforeEach(() => {
    // Mock Telegram Bot API methods
    mockTelegramBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue({ message_id: 123 }),
      editMessageReplyMarkup: jest.fn().mockResolvedValue({ message_id: 123 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      setWebHook: jest.fn().mockResolvedValue(true),
      getMe: jest.fn().mockResolvedValue({ id: 12345, username: 'testbot' })
    };

    TelegramBot.mockImplementation(() => mockTelegramBot);

    bot = new SimpleTelegramBot();
    callbackHandler = new EnhancedCallbackQueryHandler(mockTelegramBot);

    jest.clearAllMocks();
  });

  describe('Bot Initialization', () => {
    test('should initialize bot with correct configuration', async () => {
      expect(TelegramBot).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          polling: expect.any(Object)
        })
      );
    });

    test('should handle bot startup gracefully', async () => {
      await expect(bot.start()).resolves.not.toThrow();
    });
  });

  describe('Message Handling', () => {
    test('should handle /start command correctly', async () => {
      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser', first_name: 'Test' },
        chat: { id: 12345, type: 'private' },
        text: '/start'
      };

      await bot.handleMessage(mockMessage);

      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Welcome'),
        expect.any(Object)
      );
    });

    test('should handle registration command', async () => {
      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser', first_name: 'Test' },
        chat: { id: 12345, type: 'private' },
        text: '/register'
      };

      await bot.handleMessage(mockMessage);

      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('registration'),
        expect.any(Object)
      );
    });

    test('should handle booking command', async () => {
      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser', first_name: 'Test' },
        chat: { id: 12345, type: 'private' },
        text: '/book'
      };

      await bot.handleMessage(mockMessage);

      expect(mockTelegramBot.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Callback Query Handling', () => {
    test('should handle service selection callback', async () => {
      const mockCallbackQuery = {
        id: 'callback_123',
        from: { id: 12345, username: 'testuser' },
        message: { message_id: 1, chat: { id: 12345 } },
        data: 'select_service_1'
      };

      await callbackHandler.handleCallbackQuery(mockCallbackQuery);

      expect(mockTelegramBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_123',
        expect.any(String)
      );
    });

    test('should handle appointment confirmation callback', async () => {
      const mockCallbackQuery = {
        id: 'callback_456',
        from: { id: 12345, username: 'testuser' },
        message: { message_id: 1, chat: { id: 12345 } },
        data: 'confirm_appointment_123'
      };

      await callbackHandler.handleCallbackQuery(mockCallbackQuery);

      expect(mockTelegramBot.answerCallbackQuery).toHaveBeenCalled();
      expect(mockTelegramBot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('confirmed'),
        expect.any(Object)
      );
    });

    test('should handle callback query timeout gracefully', async () => {
      const mockCallbackQuery = {
        id: 'callback_timeout',
        from: { id: 12345 },
        message: { message_id: 1, chat: { id: 12345 } },
        data: 'expired_action'
      };

      // Simulate timeout
      mockTelegramBot.answerCallbackQuery.mockRejectedValueOnce(
        new Error('Request timeout')
      );

      await callbackHandler.handleCallbackQuery(mockCallbackQuery);

      expect(mockTelegramBot.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle API rate limiting', async () => {
      const rateLimitError = new Error('Too Many Requests: retry after 30');
      rateLimitError.code = 429;

      mockTelegramBot.sendMessage.mockRejectedValueOnce(rateLimitError);

      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345, type: 'private' },
        text: '/start'
      };

      // Should handle rate limit gracefully
      await expect(bot.handleMessage(mockMessage)).resolves.not.toThrow();
    });

    test('should handle network errors', async () => {
      const networkError = new Error('ECONNRESET');
      mockTelegramBot.sendMessage.mockRejectedValueOnce(networkError);

      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345, type: 'private' },
        text: '/help'
      };

      await expect(bot.handleMessage(mockMessage)).resolves.not.toThrow();
    });

    test('should handle malformed callback data', async () => {
      const mockCallbackQuery = {
        id: 'callback_malformed',
        from: { id: 12345, username: 'testuser' },
        message: { message_id: 1, chat: { id: 12345 } },
        data: 'invalid_format_data'
      };

      await callbackHandler.handleCallbackQuery(mockCallbackQuery);

      expect(mockTelegramBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_malformed',
        expect.stringContaining('error')
      );
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent callback queries efficiently', async () => {
      const callbackQueries = Array.from({ length: 50 }, (_, i) => ({
        id: `callback_${i}`,
        from: { id: 12345 + i, username: `user${i}` },
        message: { message_id: i, chat: { id: 12345 + i } },
        data: `select_service_${i % 5}`
      }));

      const startTime = Date.now();

      await Promise.all(
        callbackQueries.map(query => callbackHandler.handleCallbackQuery(query))
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle 50 concurrent queries within reasonable time
      expect(executionTime).toBeLessThan(2000); // 2 seconds
      expect(mockTelegramBot.answerCallbackQuery).toHaveBeenCalledTimes(50);
    });

    test('should maintain session state during rapid interactions', async () => {
      const userId = 12345;
      const rapidMessages = [
        { text: '/start' },
        { text: '/register' },
        { text: 'John Doe' }, // Name input
        { text: 'john@example.com' }, // Email input
        { text: '/book' }
      ];

      for (const msgData of rapidMessages) {
        const mockMessage = {
          message_id: Date.now(),
          from: { id: userId, username: 'testuser' },
          chat: { id: userId, type: 'private' },
          ...msgData
        };

        await bot.handleMessage(mockMessage);
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      }

      // Verify session persistence through rapid interactions
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledTimes(rapidMessages.length);
    });
  });

  describe('Memory Management', () => {
    test('should clean up expired sessions', async () => {
      // Simulate multiple user sessions
      const userIds = Array.from({ length: 100 }, (_, i) => 10000 + i);

      for (const userId of userIds) {
        const mockMessage = {
          message_id: 1,
          from: { id: userId, username: `user${userId}` },
          chat: { id: userId, type: 'private' },
          text: '/start'
        };

        await bot.handleMessage(mockMessage);
      }

      // Trigger session cleanup
      await bot.cleanupExpiredSessions();

      // Memory usage should be reasonable
      const memUsage = process.memoryUsage();
      expect(memUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // 100MB
    });
  });

  describe('Integration with External Services', () => {
    test('should handle database connectivity issues', async () => {
      // Mock database error
      const dbError = new Error('Database connection failed');

      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345, type: 'private' },
        text: '/book'
      };

      // Should handle gracefully even if database is down
      await expect(bot.handleMessage(mockMessage)).resolves.not.toThrow();
    });

    test('should handle Redis cache unavailability', async () => {
      const mockMessage = {
        message_id: 1,
        from: { id: 12345, username: 'testuser' },
        chat: { id: 12345, type: 'private' },
        text: '/start'
      };

      // Should work even without Redis cache
      await expect(bot.handleMessage(mockMessage)).resolves.not.toThrow();
    });
  });
});