const nodemailer = require('nodemailer');

// Make Twilio optional for core functionality
let twilio;
try {
  twilio = require('twilio');
} catch (error) {
  console.warn('⚠️  Twilio not available - SMS notifications disabled');
  twilio = null;
}
const moment = require('moment-timezone');
const cron = require('node-cron');
const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { NotificationType, NotificationStatus } = require('../types');
const TemplateProcessor = require('../utils/TemplateProcessor');
const DateTimeUtils = require('../utils/DateTimeUtils');
const bookingConfig = require('../../config/booking.config');
const centralErrorHandler = require('../utils/CentralErrorHandler');
const logger = require('../utils/logger');

class NotificationService {
  constructor(bot = null) {
    this.emailTransporter = null;
    this.twilioClient = null;
    this.bot = bot; // Telegram bot instance for group notifications
    this.defaultTimeZone = process.env.DEFAULT_TIMEZONE || 'America/New_York';
    
    // Initialize utilities
    this.templateProcessor = new TemplateProcessor(this.defaultTimeZone);
    this.dateTimeUtils = new DateTimeUtils(this.defaultTimeZone);
    
    // Retry configuration
    this.config = {
      maxRetries: 3,
      retryBackoffMinutes: [5, 15, 30],
      batchSize: 25
    };
    
    // Group notification settings
    this.groupSettings = {
      chatId: process.env.TELEGRAM_GROUP_CHAT_ID || bookingConfig?.notifications?.groupChatId,
      enabled: true,
      templates: {
        newBooking: '🆕 *New Booking Alert*\n\n📱 Customer: {customerName}\n🔧 Service: {serviceName}\n📅 Date: {date}\n⏰ Time: {time}',
        cancellation: '❌ *Booking Cancelled*\n\n📱 Customer: {customerName}\n🔧 Service: {serviceName}\n📅 Date: {date}\n⏰ Time: {time}\n\n✅ This slot is now available'
      }
    };
    
    // Processing state
    this.isRunning = false;
    
    // Cron job references for cleanup
    this.cronJobs = [];
    
    this.initializeProviders();
    this.setupTemplateHelpers();
    this.startNotificationProcessor();
    
    // Register cleanup handler
    centralErrorHandler.registerCleanup(() => this.cleanup());
  }

  initializeProviders() {
    // Initialize email transporter
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
    }

    // Initialize Twilio client
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
  }

  setupTemplateHelpers() {
    this.templateProcessor.registerDefaultHelpers();
    
    // Register custom helpers for notifications
    this.templateProcessor.registerHelper('timeUntil', (data, path) => {
      const date = this.templateProcessor.getNestedProperty(data, path);
      if (!date) return '';
      const timeInfo = this.dateTimeUtils.getTimeUntil(date);
      return timeInfo ? timeInfo.text : '';
    });
    
    this.templateProcessor.registerHelper('businessHours', () => {
      return this.dateTimeUtils.getBusinessHoursDisplay().full;
    });
  }

  startNotificationProcessor() {
    console.log('🔔 Enhanced Notification Service starting...');
    
    try {
      // Process pending notifications every minute
      const pendingJob = cron.schedule('* * * * *', centralErrorHandler.wrapAsync(async () => {
        if (!this.isRunning) {
          await this.processPendingNotifications();
        }
      }, 'NotificationService.processPending'), {
        scheduled: true
      });
      this.cronJobs.push(pendingJob);
      centralErrorHandler.registerCronJob(pendingJob);

      // Process retry queue every 5 minutes
      const retryJob = cron.schedule('*/5 * * * *', centralErrorHandler.wrapAsync(async () => {
        await this.processRetryQueue();
      }, 'NotificationService.processRetry'), {
        scheduled: true
      });
      this.cronJobs.push(retryJob);
      centralErrorHandler.registerCronJob(retryJob);

      // Clean up old notifications daily at 2 AM
      const maintenanceJob = cron.schedule('0 2 * * *', centralErrorHandler.wrapAsync(async () => {
        try {
          await this.performDailyMaintenance();
        } catch (error) {
          logger.error('Error in daily maintenance:', error);
        }
      }, 'NotificationService.dailyMaintenance'), {
        scheduled: true
      });
      this.cronJobs.push(maintenanceJob);
      centralErrorHandler.registerCronJob(maintenanceJob);

      console.log('✅ Enhanced Notification Service started');
    } catch (error) {
      logger.error('Error starting notification processor:', error);
      throw error;
    }
  }

  async sendAppointmentConfirmation(appointment) {
    try {
      const client = appointment.client;
      const provider = appointment.provider;
      const service = appointment.service;

      const templateData = this.buildTemplateData(appointment, client, provider, service);

      // Send email confirmation
      if (client.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.EMAIL,
          template_name: 'appointment_confirmation',
          recipient: client.email,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

      // Send SMS confirmation
      if (client.canReceiveSmsNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.SMS,
          template_name: 'appointment_confirmation',
          recipient: client.phone,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

      // Also notify provider if they want notifications
      if (provider.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: provider.id,
          type: NotificationType.EMAIL,
          template_name: 'provider_booking_notification',
          recipient: provider.email,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

    } catch (error) {
      console.error('Error sending appointment confirmation:', error);
      throw error;
    }
  }

  async sendAppointmentCancellation(appointment, reason) {
    try {
      const client = appointment.client;
      const provider = appointment.provider;
      const service = appointment.service;

      const templateData = {
        ...this.buildTemplateData(appointment, client, provider, service),
        cancellation_reason: reason || 'No reason provided'
      };

      // Notify client
      if (client.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.EMAIL,
          template_name: 'appointment_cancelled',
          recipient: client.email,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

      if (client.canReceiveSmsNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.SMS,
          template_name: 'appointment_cancelled',
          recipient: client.phone,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

      // Notify provider
      if (provider.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: provider.id,
          type: NotificationType.EMAIL,
          template_name: 'provider_cancellation_notification',
          recipient: provider.email,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

    } catch (error) {
      console.error('Error sending cancellation notification:', error);
      throw error;
    }
  }

  async sendAppointmentReschedule(appointment, oldDateTime) {
    try {
      const client = appointment.client;
      const provider = appointment.provider;
      const service = appointment.service;

      const templateData = {
        ...this.buildTemplateData(appointment, client, provider, service),
        old_appointment_datetime: this.formatDateTime(oldDateTime, client.timezone),
        old_appointment_date: this.formatDate(oldDateTime, client.timezone),
        old_appointment_time: this.formatTime(oldDateTime, client.timezone)
      };

      // Notify client
      if (client.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.EMAIL,
          template_name: 'appointment_rescheduled',
          recipient: client.email,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

      if (client.canReceiveSmsNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.SMS,
          template_name: 'appointment_rescheduled',
          recipient: client.phone,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

    } catch (error) {
      console.error('Error sending reschedule notification:', error);
      throw error;
    }
  }

  async sendWaitlistNotification(waitlistEntry, availabilityData) {
    try {
      const client = waitlistEntry.client;
      const service = waitlistEntry.service;

      const templateData = {
        client_name: client.getDisplayName(),
        service_name: service.name,
        provider_name: service.provider?.getDisplayName() || 'Provider',
        appointment_datetime: this.formatDateTime(availabilityData.available_datetime, client.timezone),
        appointment_date: this.formatDate(availabilityData.available_datetime, client.timezone),
        appointment_time: this.formatTime(availabilityData.available_datetime, client.timezone),
        duration_minutes: availabilityData.duration_minutes,
        service_price: service.getFormattedPrice()
      };

      // Send email notification
      if (client.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: null,
          user_id: client.id,
          type: NotificationType.EMAIL,
          template_name: 'waitlist_available',
          recipient: client.email,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

      // Send SMS notification
      if (client.canReceiveSmsNotifications()) {
        await this.queueNotification({
          appointment_id: null,
          user_id: client.id,
          type: NotificationType.SMS,
          template_name: 'waitlist_available',
          recipient: client.phone,
          template_data: templateData,
          scheduled_for: new Date()
        });
      }

    } catch (error) {
      console.error('Error sending waitlist notification:', error);
      throw error;
    }
  }

  async scheduleReminder(appointment, hours, scheduledFor) {
    try {
      const client = appointment.client;
      const provider = appointment.provider;
      const service = appointment.service;

      const templateName = `reminder_${hours}h`;
      const templateData = this.buildTemplateData(appointment, client, provider, service);

      // Schedule email reminder
      if (client.canReceiveEmailNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.EMAIL,
          template_name: templateName,
          recipient: client.email,
          template_data: templateData,
          scheduled_for: scheduledFor
        });
      }

      // Schedule SMS reminder
      if (client.canReceiveSmsNotifications()) {
        await this.queueNotification({
          appointment_id: appointment.id,
          user_id: client.id,
          type: NotificationType.SMS,
          template_name: templateName,
          recipient: client.phone,
          template_data: templateData,
          scheduled_for: scheduledFor
        });
      }

    } catch (error) {
      console.error('Error scheduling reminder:', error);
      throw error;
    }
  }

  async queueNotification(notificationData) {
    try {
      const {
        appointment_id,
        user_id,
        type,
        template_name,
        recipient,
        template_data,
        scheduled_for
      } = notificationData;

      // Get notification template with fallback
      let template = await NotificationTemplate.query()
        .where('name', template_name)
        .where('type', type)
        .where('is_active', true)
        .first();

      // ERROR HANDLING: Fallback to default template if specific not found
      if (!template) {
        console.warn(`Template not found: ${template_name} (${type}), trying default`);

        template = await NotificationTemplate.query()
          .where('name', 'default')
          .where('type', type)
          .where('is_active', true)
          .first();

        if (!template) {
          // ERROR HANDLING: Throw error for monitoring instead of silent return
          const error = new Error(`No template or fallback found: ${template_name} (${type})`);
          console.error('❌ Missing notification template:', {
            requestedTemplate: template_name,
            type,
            appointmentId: appointment_id,
            userId: user_id
          });
          throw error;
        }
      }

      // Process template with data
      const subject = this.processTemplate(template.subject || '', template_data);
      const content = this.processTemplate(template.content, template_data);

      // Create notification record
      await Notification.query().insert({
        appointment_id,
        user_id,
        type,
        template_name,
        recipient,
        subject: type === NotificationType.EMAIL ? subject : null,
        content,
        status: NotificationStatus.PENDING,
        scheduled_for: scheduled_for || new Date(),
        retry_count: 0
      });

    } catch (error) {
      console.error('Error queuing notification:', error);
      throw error;
    }
  }

  async processPendingNotifications() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    try {
      const pendingNotifications = await Notification.query()
        .where('status', NotificationStatus.PENDING)
        .where('scheduled_for', '<=', new Date())
        .where('retry_count', '<', this.config.maxRetries)
        .orderBy('scheduled_for')
        .limit(this.config.batchSize);

      if (pendingNotifications.length === 0) {
        this.isRunning = false;
        return;
      }

      console.log(`📋 Processing ${pendingNotifications.length} pending notifications`);

      // Batch process notifications by type for better performance
      const notificationsByType = pendingNotifications.reduce((acc, notification) => {
        if (!acc[notification.type]) acc[notification.type] = [];
        acc[notification.type].push(notification);
        return acc;
      }, {});

      // ERROR HANDLING: Track batch results with structured logging
      const batchStats = {
        total: allPending.length,
        success: 0,
        failed: 0,
        errors: []
      };

      // Process each type in parallel
      await Promise.all(Object.entries(notificationsByType).map(async ([type, notifications]) => {
        // Process notifications of same type in batches to avoid overwhelming services
        const batchSize = type === NotificationType.EMAIL ? 5 : 10;
        for (let i = 0; i < notifications.length; i += batchSize) {
          const batch = notifications.slice(i, i + batchSize);
          const results = await Promise.allSettled(batch.map(async (notification) => {
            try {
              await this.sendNotification(notification);
              batchStats.success++;
            } catch (error) {
              batchStats.failed++;
              batchStats.errors.push({
                notificationId: notification.id,
                type: notification.type,
                recipient: notification.recipient,
                error: error.message
              });
              console.error(`Failed to send notification ${notification.id}:`, error);
              await this.handleNotificationError(notification, error);
            }
          }));
        }
      }));

      // ERROR HANDLING: Log batch summary with context
      if (batchStats.failed > 0) {
        console.warn('⚠️ Notification batch completed with failures:', {
          total: batchStats.total,
          success: batchStats.success,
          failed: batchStats.failed,
          errors: batchStats.errors.slice(0, 5) // First 5 errors for visibility
        });
      }

      return batchStats;

    } catch (error) {
      console.error('Error processing pending notifications:', error);
      throw error; // Re-throw for visibility
    } finally {
      this.isRunning = false;
    }
  }

  async sendNotification(notification) {
    try {
      let result;

      if (notification.type === NotificationType.EMAIL) {
        result = await this.sendEmail(notification);
      } else if (notification.type === NotificationType.SMS) {
        result = await this.sendSms(notification);
      } else {
        throw new Error(`Unsupported notification type: ${notification.type}`);
      }

      // Mark as sent
      await notification.$query().patch({
        status: NotificationStatus.SENT,
        sent_at: new Date(),
        error_message: null
      });

      console.log(`Notification ${notification.id} sent successfully`);

    } catch (error) {
      throw error;
    }
  }

  async sendEmail(notification) {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: notification.recipient,
      subject: notification.subject,
      text: notification.content,
      html: this.convertToHtml(notification.content)
    };

    return this.emailTransporter.sendMail(mailOptions);
  }

  async sendSms(notification) {
    if (!this.twilioClient) {
      throw new Error('Twilio client not configured');
    }

    return this.twilioClient.messages.create({
      body: notification.content,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: notification.recipient
    });
  }

  async handleNotificationError(notification, error) {
    const retryCount = notification.retry_count + 1;
    const maxRetries = 3;

    if (retryCount >= maxRetries) {
      // Mark as failed after max retries
      await notification.$query().patch({
        status: NotificationStatus.FAILED,
        error_message: error.message,
        retry_count: retryCount
      });
    } else {
      // Schedule retry (exponential backoff)
      const retryMinutes = Math.pow(2, retryCount) * 5; // 5, 10, 20 minutes
      const nextRetry = moment().add(retryMinutes, 'minutes').toDate();

      await notification.$query().patch({
        retry_count: retryCount,
        error_message: error.message,
        scheduled_for: nextRetry
      });
    }
  }

  async cancelAppointmentNotifications(appointmentId) {
    try {
      await Notification.query()
        .where('appointment_id', appointmentId)
        .where('status', NotificationStatus.PENDING)
        .patch({
          status: NotificationStatus.CANCELLED
        });

    } catch (error) {
      console.error('Error cancelling notifications:', error);
      throw error;
    }
  }

  buildTemplateData(appointment, client, provider, service, options = {}) {
    return this.templateProcessor.buildAppointmentTemplateData(
      appointment, 
      client, 
      provider, 
      service, 
      {
        businessName: 'Lodge Mobile',
        businessAddress: 'Main Location',
        businessPhone: process.env.BUSINESS_PHONE,
        ...options
      }
    );
  }

  processTemplate(template, data, options = {}) {
    return this.templateProcessor.processTemplate(template, data, options);
  }

  formatDateTime(dateTime, timezone = this.defaultTimeZone) {
    return this.dateTimeUtils.format(dateTime, this.dateTimeUtils.formats.displayWithTimeZone, timezone);
  }

  formatDate(dateTime, timezone = this.defaultTimeZone) {
    return this.dateTimeUtils.format(dateTime, this.dateTimeUtils.formats.display, timezone);
  }

  formatTime(dateTime, timezone = this.defaultTimeZone) {
    return this.dateTimeUtils.format(dateTime, this.dateTimeUtils.formats.time12, timezone);
  }

  convertToHtml(text) {
    return this.templateProcessor.textToHtml(text);
  }

  async cleanupOldNotifications() {
    try {
      const cutoffDate = moment().subtract(30, 'days').toDate();
      
      const deletedCount = await Notification.query()
        .where('created_at', '<', cutoffDate)
        .where('status', 'in', [NotificationStatus.SENT, NotificationStatus.FAILED, NotificationStatus.CANCELLED])
        .del();

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old notifications`);
      }

    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }

  async getNotificationStatistics(startDate, endDate) {
    try {
      const notifications = await Notification.query()
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .limit(10000); // Prevent unbounded queries

      const stats = {
        total: notifications.length,
        by_type: {
          email: notifications.filter(n => n.type === NotificationType.EMAIL).length,
          sms: notifications.filter(n => n.type === NotificationType.SMS).length,
          telegram: notifications.filter(n => n.type === 'telegram').length
        },
        by_status: {
          pending: notifications.filter(n => n.status === NotificationStatus.PENDING).length,
          sent: notifications.filter(n => n.status === NotificationStatus.SENT).length,
          failed: notifications.filter(n => n.status === NotificationStatus.FAILED).length,
          cancelled: notifications.filter(n => n.status === NotificationStatus.CANCELLED).length
        },
        by_template: {}
      };

      // Group by template
      notifications.forEach(notification => {
        if (!stats.by_template[notification.template_name]) {
          stats.by_template[notification.template_name] = 0;
        }
        stats.by_template[notification.template_name]++;
      });

      // Calculate rates
      if (stats.total > 0) {
        stats.success_rate = Math.round((stats.by_status.sent / stats.total) * 100);
        stats.failure_rate = Math.round((stats.by_status.failed / stats.total) * 100);
      } else {
        stats.success_rate = 0;
        stats.failure_rate = 0;
      }

      return stats;

    } catch (error) {
      console.error('Error getting notification statistics:', error);
      throw error;
    }
  }

  // ========================
  // GROUP NOTIFICATION METHODS
  // ========================

  async notifyGroupNewBooking(booking, customer, service) {
    if (!this.bot || !this.groupSettings.chatId || !this.groupSettings.enabled) {
      return;
    }

    try {
      const dateTime = this.dateTimeUtils.formatDateTime(booking.appointment_datetime);
      
      const templateData = {
        customerName: this.templateProcessor.getDisplayName(customer),
        serviceName: service.name || 'Lodge Mobile Service',
        date: dateTime.date,
        time: dateTime.time
      };

      const message = this.templateProcessor.processTemplate(
        this.groupSettings.templates.newBooking,
        templateData
      );

      await this.bot.telegram.sendMessage(this.groupSettings.chatId, message, {
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('Failed to send group new booking notification:', error);
    }
  }

  async notifyGroupCancellation(booking, customer, service) {
    if (!this.bot || !this.groupSettings.chatId || !this.groupSettings.enabled) {
      return;
    }

    try {
      const dateTime = this.dateTimeUtils.formatDateTime(booking.appointment_datetime);
      
      const templateData = {
        customerName: this.templateProcessor.getDisplayName(customer),
        serviceName: service.name || 'Lodge Mobile Service',
        date: dateTime.date,
        time: dateTime.time
      };

      const message = this.templateProcessor.processTemplate(
        this.groupSettings.templates.cancellation,
        templateData
      );

      await this.bot.telegram.sendMessage(this.groupSettings.chatId, message, {
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('Failed to send group cancellation notification:', error);
    }
  }

  setGroupChatId(chatId) {
    this.groupSettings.chatId = chatId;
  }

  async processRetryQueue() {
    try {
      const retryNotifications = await Notification.query()
        .where('status', NotificationStatus.FAILED)
        .where('retry_count', '<', this.config.maxRetries)
        .where('scheduled_for', '<=', new Date())
        .orderBy('scheduled_for')
        .limit(this.config.batchSize);

      for (const notification of retryNotifications) {
        try {
          await this.sendNotification(notification);
        } catch (error) {
          await this.handleNotificationError(notification, error);
        }
      }

    } catch (error) {
      console.error('Error processing retry queue:', error);
    }
  }

  async performDailyMaintenance() {
    try {
      console.log('🧹 Starting notification service daily maintenance...');
      
      // Clean up old notifications
      await this.cleanupOldNotifications();
      
      console.log('✅ Notification service daily maintenance completed');
      
    } catch (error) {
      console.error('Error in notification service daily maintenance:', error);
    }
  }

  async sendTelegram(notification) {
    if (!this.bot) {
      throw new Error('Telegram bot not configured');
    }

    const user = await User.query()
      .select(['id', 'telegram_id', 'first_name', 'last_name'])
      .where('id', notification.user_id)
      .first();
    if (!user || !user.telegram_id) {
      throw new Error('User has no Telegram ID');
    }

    const message = notification.subject ? 
      `*${notification.subject}*\n\n${notification.content}` : 
      notification.content;

    const options = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    const result = await this.bot.telegram.sendMessage(user.telegram_id, message, options);
    
    return {
      success: true,
      message_id: result.message_id,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup() {
    try {
      logger.info('Cleaning up NotificationService...');
      
      // Stop all cron jobs
      for (const job of this.cronJobs) {
        try {
          if (job && typeof job.stop === 'function') {
            job.stop();
          }
        } catch (error) {
          logger.error('Error stopping cron job:', error);
        }
      }
      
      // Clear job references
      this.cronJobs = [];
      
      // Set shutdown flag
      this.isRunning = false;
      
      logger.info('NotificationService cleanup completed');
    } catch (error) {
      logger.error('Error during NotificationService cleanup:', error);
    }
  }
}

module.exports = NotificationService;