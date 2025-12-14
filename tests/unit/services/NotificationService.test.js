const NotificationService = require('../../../src/services/NotificationService');
const TestFactory = require('../../utils/test-factory');

// Mock dependencies
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
}));

jest.mock('twilio', () => ({
  Twilio: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'test-sms-sid' })
    }
  }))
}));

describe('NotificationService', () => {
  let notificationService;
  let mockUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    notificationService = new NotificationService();
    mockUser = await TestFactory.createUser({
      email: 'test@example.com',
      phone_number: '+1234567890'
    });
  });

  describe('Email Notifications', () => {
    test('should send appointment confirmation email', async () => {
      const appointment = TestFactory.createAppointment({
        appointment_datetime: new Date('2024-01-15T10:00:00Z')
      });

      const result = await notificationService.sendAppointmentConfirmation(mockUser, appointment);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(notificationService.emailTransporter.sendMail).toHaveBeenCalledWith({
        from: expect.any(String),
        to: mockUser.email,
        subject: expect.stringContaining('Appointment Confirmation'),
        html: expect.stringContaining('2024-01-15'),
        text: expect.any(String)
      });
    });

    test('should send appointment reminder email', async () => {
      const appointment = TestFactory.createAppointment({
        appointment_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
      });

      const result = await notificationService.sendAppointmentReminder(mockUser, appointment);

      expect(result.success).toBe(true);
      expect(notificationService.emailTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          subject: expect.stringContaining('Reminder')
        })
      );
    });

    test('should send cancellation notification', async () => {
      const appointment = TestFactory.createAppointment();

      const result = await notificationService.sendCancellationNotification(
        mockUser, 
        appointment, 
        'Provider unavailable'
      );

      expect(result.success).toBe(true);
      expect(notificationService.emailTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Cancelled')
        })
      );
    });

    test('should handle email sending failure', async () => {
      notificationService.emailTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));
      
      const appointment = TestFactory.createAppointment();

      const result = await notificationService.sendAppointmentConfirmation(mockUser, appointment);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('SMS Notifications', () => {
    test('should send SMS reminder', async () => {
      const appointment = TestFactory.createAppointment({
        appointment_datetime: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      });

      const result = await notificationService.sendSMSReminder(mockUser, appointment);

      expect(result.success).toBe(true);
      expect(notificationService.twilioClient.messages.create).toHaveBeenCalledWith({
        body: expect.stringContaining('reminder'),
        from: expect.any(String),
        to: mockUser.phone_number
      });
    });

    test('should handle invalid phone number', async () => {
      const userWithBadPhone = await TestFactory.createUser({
        phone_number: 'invalid-phone'
      });
      const appointment = TestFactory.createAppointment();

      const result = await notificationService.sendSMSReminder(userWithBadPhone, appointment);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid phone number');
    });

    test('should handle SMS sending failure', async () => {
      notificationService.twilioClient.messages.create.mockRejectedValue(new Error('Twilio Error'));
      
      const appointment = TestFactory.createAppointment();

      const result = await notificationService.sendSMSReminder(mockUser, appointment);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Telegram Notifications', () => {
    test('should send Telegram appointment confirmation', async () => {
      const mockTelegramUser = await TestFactory.createUser({
        telegram_user_id: '123456789'
      });
      const appointment = TestFactory.createAppointment();

      // Mock Telegram bot
      notificationService.telegramBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 123 })
      };

      const result = await notificationService.sendTelegramAppointmentConfirmation(
        mockTelegramUser, 
        appointment
      );

      expect(result.success).toBe(true);
      expect(notificationService.telegramBot.sendMessage).toHaveBeenCalledWith(
        mockTelegramUser.telegram_user_id,
        expect.stringContaining('confirmed'),
        expect.any(Object)
      );
    });

    test('should handle Telegram sending failure', async () => {
      const mockTelegramUser = await TestFactory.createUser({
        telegram_user_id: '123456789'
      });
      const appointment = TestFactory.createAppointment();

      notificationService.telegramBot = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Telegram Error'))
      };

      const result = await notificationService.sendTelegramAppointmentConfirmation(
        mockTelegramUser, 
        appointment
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Multi-channel Notifications', () => {
    test('should send notification via all available channels', async () => {
      const fullUser = await TestFactory.createUser({
        email: 'test@example.com',
        phone_number: '+1234567890',
        telegram_user_id: '123456789',
        notification_preferences: {
          email: true,
          sms: true,
          telegram: true
        }
      });
      
      const appointment = TestFactory.createAppointment();

      notificationService.telegramBot = {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 123 })
      };

      const result = await notificationService.sendMultiChannelNotification(
        fullUser, 
        appointment, 
        'confirmation'
      );

      expect(result.email.success).toBe(true);
      expect(result.sms.success).toBe(true);
      expect(result.telegram.success).toBe(true);
    });

    test('should respect user notification preferences', async () => {
      const emailOnlyUser = await TestFactory.createUser({
        email: 'test@example.com',
        phone_number: '+1234567890',
        notification_preferences: {
          email: true,
          sms: false,
          telegram: false
        }
      });
      
      const appointment = TestFactory.createAppointment();

      const result = await notificationService.sendMultiChannelNotification(
        emailOnlyUser, 
        appointment, 
        'confirmation'
      );

      expect(result.email.success).toBe(true);
      expect(result.sms).toBeUndefined();
      expect(result.telegram).toBeUndefined();
    });
  });

  describe('Template Rendering', () => {
    test('should render email template with appointment data', () => {
      const appointment = TestFactory.createAppointment({
        appointment_datetime: new Date('2024-01-15T10:00:00Z')
      });
      const provider = { first_name: 'Dr. John', last_name: 'Smith' };

      const rendered = notificationService.renderEmailTemplate('confirmation', {
        user: mockUser,
        appointment,
        provider
      });

      expect(rendered.subject).toContain('Appointment Confirmation');
      expect(rendered.html).toContain(mockUser.first_name);
      expect(rendered.html).toContain('Dr. John Smith');
      expect(rendered.html).toContain('2024-01-15');
      expect(rendered.text).toBeDefined();
    });

    test('should render SMS template with appointment data', () => {
      const appointment = TestFactory.createAppointment({
        appointment_datetime: new Date('2024-01-15T10:00:00Z')
      });

      const rendered = notificationService.renderSMSTemplate('reminder', {
        user: mockUser,
        appointment
      });

      expect(rendered).toContain('reminder');
      expect(rendered).toContain(mockUser.first_name);
      expect(rendered.length).toBeLessThan(160); // SMS length limit
    });
  });

  describe('Notification Scheduling', () => {
    test('should schedule appointment reminders', async () => {
      const appointment = TestFactory.createAppointment({
        appointment_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
      });

      const result = await notificationService.scheduleAppointmentReminders(
        mockUser, 
        appointment
      );

      expect(result.scheduled.length).toBeGreaterThan(0);
      expect(result.scheduled[0]).toHaveProperty('scheduleTime');
      expect(result.scheduled[0]).toHaveProperty('type');
    });

    test('should not schedule reminders for past appointments', async () => {
      const pastAppointment = TestFactory.createAppointment({
        appointment_datetime: new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
      });

      const result = await notificationService.scheduleAppointmentReminders(
        mockUser, 
        pastAppointment
      );

      expect(result.scheduled.length).toBe(0);
      expect(result.error).toContain('past');
    });
  });

  describe('Notification Preferences', () => {
    test('should validate notification preferences', () => {
      const validPrefs = {
        email: true,
        sms: false,
        telegram: true,
        reminders: {
          '24h': true,
          '1h': true,
          '15m': false
        }
      };

      const isValid = notificationService.validatePreferences(validPrefs);
      expect(isValid).toBe(true);
    });

    test('should reject invalid notification preferences', () => {
      const invalidPrefs = {
        email: 'yes', // Should be boolean
        sms: true,
        invalidChannel: true
      };

      const isValid = notificationService.validatePreferences(invalidPrefs);
      expect(isValid).toBe(false);
    });
  });
});