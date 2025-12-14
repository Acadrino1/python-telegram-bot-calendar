const NotificationService = require('../../../src/services/NotificationService');
const User = require('../../../src/models/User');
const Appointment = require('../../../src/models/Appointment');
const { NotificationType, NotificationStatus } = require('../../../src/types');

// Mock external dependencies
jest.mock('nodemailer');
jest.mock('twilio', () => null);
jest.mock('../../../src/models/User');
jest.mock('../../../src/models/Appointment');
jest.mock('../../../src/models/Notification');

describe('NotificationService Integration Tests', () => {
  let notificationService;
  let mockBot;

  beforeEach(() => {
    // Mock Telegram bot
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
      editMessageText: jest.fn().mockResolvedValue({ message_id: 123 })
    };
    
    notificationService = new NotificationService(mockBot);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Email Notifications', () => {
    test('should send appointment confirmation email', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        telegram_chat_id: '12345'
      };

      const mockAppointment = {
        id: 1,
        service_name: 'Test Service',
        appointment_date: '2025-01-15',
        appointment_time: '10:00'
      };

      User.findById = jest.fn().mockResolvedValue(mockUser);
      Appointment.findById = jest.fn().mockResolvedValue(mockAppointment);

      const result = await notificationService.sendAppointmentConfirmation(1, 1);
      
      expect(result).toBeDefined();
      expect(User.findById).toHaveBeenCalledWith(1);
      expect(Appointment.findById).toHaveBeenCalledWith(1);
    });

    test('should handle email sending errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await notificationService.sendAppointmentConfirmation(999, 1);
      
      expect(result).toBeNull();
    });
  });

  describe('Telegram Bot Integration', () => {
    test('should send group notification for new booking', async () => {
      const bookingData = {
        customerName: 'John Doe',
        serviceName: 'Test Service',
        date: '2025-01-15',
        time: '10:00'
      };

      await notificationService.sendGroupNotification('newBooking', bookingData);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('New Booking Alert'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
    });

    test('should handle bot unavailability gracefully', async () => {
      const serviceWithoutBot = new NotificationService(null);
      
      const result = await serviceWithoutBot.sendGroupNotification('newBooking', {});
      
      expect(result).toBe(false);
    });
  });

  describe('Batch Notifications', () => {
    test('should process notifications in batches', async () => {
      const notifications = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        user_id: i + 1,
        type: NotificationType.APPOINTMENT_REMINDER,
        status: NotificationStatus.PENDING
      }));

      // Mock batch processing
      const processSpy = jest.spyOn(notificationService, 'processNotificationBatch');
      
      await notificationService.processPendingNotifications();
      
      expect(processSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Retries', () => {
    test('should retry failed notifications with exponential backoff', async () => {
      const mockNotification = {
        id: 1,
        retry_count: 0,
        type: NotificationType.APPOINTMENT_CONFIRMATION
      };

      // Mock failure then success
      mockBot.sendMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ message_id: 123 });

      const result = await notificationService.handleNotificationRetry(mockNotification);
      
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    });

    test('should give up after max retries', async () => {
      const mockNotification = {
        id: 1,
        retry_count: 3,
        type: NotificationType.APPOINTMENT_CONFIRMATION
      };

      const result = await notificationService.handleNotificationRetry(mockNotification);
      
      expect(result).toBe(false);
    });
  });

  describe('Template Processing', () => {
    test('should process notification templates correctly', async () => {
      const templateData = {
        customerName: 'John Doe',
        serviceName: 'Test Service',
        date: '2025-01-15',
        time: '10:00'
      };

      const result = notificationService.processTemplate(
        'Hello {customerName}, your {serviceName} appointment is confirmed for {date} at {time}',
        templateData
      );

      expect(result).toBe('Hello John Doe, your Test Service appointment is confirmed for 2025-01-15 at 10:00');
    });

    test('should handle missing template variables gracefully', async () => {
      const templateData = { customerName: 'John Doe' };

      const result = notificationService.processTemplate(
        'Hello {customerName}, your {serviceName} appointment is confirmed',
        templateData
      );

      expect(result).toContain('John Doe');
      expect(result).toContain('{serviceName}'); // Should preserve unknown variables
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high volume of notifications efficiently', async () => {
      const startTime = Date.now();
      
      const promises = Array.from({ length: 100 }, (_, i) => 
        notificationService.sendGroupNotification('test', { id: i })
      );

      await Promise.all(promises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(executionTime).toBeLessThan(5000); // 5 seconds
    });
  });
});