const nodemailer = require('nodemailer');
const twilio = require('twilio');
const moment = require('moment-timezone');
const cron = require('node-cron');
const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { NotificationType, NotificationStatus } = require('../types');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.twilioClient = null;
    this.defaultTimeZone = process.env.DEFAULT_TIMEZONE || 'America/New_York';
    
    this.initializeProviders();
    this.startNotificationProcessor();
  }

  /**
   * Initialize email and SMS providers
   */
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

  /**
   * Start the notification processor (runs every minute)
   */
  startNotificationProcessor() {
    // Process pending notifications every minute
    cron.schedule('* * * * *', async () => {
      try {
        await this.processPendingNotifications();
      } catch (error) {
        console.error('Error processing pending notifications:', error);
      }
    });

    // Clean up old notifications daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.cleanupOldNotifications();
      } catch (error) {
        console.error('Error cleaning up notifications:', error);
      }
    });

    console.log('Notification processor started');
  }

  /**
   * Send appointment confirmation
   * @param {Object} appointment - Appointment with relations
   */
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

  /**
   * Send appointment cancellation notification
   * @param {Object} appointment - Cancelled appointment
   * @param {string} reason - Cancellation reason
   */
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

  /**
   * Send appointment reschedule notification
   * @param {Object} appointment - Rescheduled appointment
   * @param {string} oldDateTime - Old appointment date/time
   */
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

  /**
   * Send waitlist notification
   * @param {Object} waitlistEntry - Waitlist entry with relations
   * @param {Object} availabilityData - Available slot data
   */
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

  /**
   * Schedule a reminder notification
   * @param {Object} appointment - Appointment object
   * @param {number} hours - Hours before appointment
   * @param {Date} scheduledFor - When to send the reminder
   */
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

  /**
   * Queue a notification for sending
   * @param {Object} notificationData - Notification data
   */
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

      // Get notification template
      const template = await NotificationTemplate.query()
        .where('name', template_name)
        .where('type', type)
        .where('is_active', true)
        .first();

      if (!template) {
        console.warn(`Template not found: ${template_name} (${type})`);
        return;
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

  /**
   * Process pending notifications
   */
  async processPendingNotifications() {
    try {
      const pendingNotifications = await Notification.query()
        .where('status', NotificationStatus.PENDING)
        .where('scheduled_for', '<=', new Date())
        .where('retry_count', '<', 3)
        .orderBy('scheduled_for');

      for (const notification of pendingNotifications) {
        try {
          await this.sendNotification(notification);
        } catch (error) {
          console.error(`Failed to send notification ${notification.id}:`, error);
          await this.handleNotificationError(notification, error);
        }
      }

    } catch (error) {
      console.error('Error processing pending notifications:', error);
    }
  }

  /**
   * Send a single notification
   * @param {Object} notification - Notification record
   */
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

  /**
   * Send email notification
   * @param {Object} notification - Email notification
   */
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

  /**
   * Send SMS notification
   * @param {Object} notification - SMS notification
   */
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

  /**
   * Handle notification sending error
   * @param {Object} notification - Failed notification
   * @param {Error} error - Error that occurred
   */
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

  /**
   * Cancel notifications for an appointment
   * @param {number} appointmentId - Appointment ID
   */
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

  /**
   * Build template data for notifications
   * @param {Object} appointment - Appointment
   * @param {Object} client - Client user
   * @param {Object} provider - Provider user
   * @param {Object} service - Service
   */
  buildTemplateData(appointment, client, provider, service) {
    return {
      client_name: client.getDisplayName(),
      client_first_name: client.first_name,
      provider_name: provider.getDisplayName(),
      service_name: service.name,
      service_description: service.description || '',
      appointment_datetime: this.formatDateTime(appointment.appointment_datetime, client.timezone),
      appointment_date: this.formatDate(appointment.appointment_datetime, client.timezone),
      appointment_time: this.formatTime(appointment.appointment_datetime, client.timezone),
      duration_minutes: appointment.duration_minutes,
      duration_formatted: service.getFormattedDuration(),
      price: service.getFormattedPrice(),
      cancellation_hours: service.getCancellationHours(),
      appointment_uuid: appointment.uuid,
      appointment_id: appointment.id,
      provider_address: 'Main Clinic Location', // You can make this configurable
      provider_phone: provider.phone || 'Contact clinic'
    };
  }

  /**
   * Process template with data placeholders
   * @param {string} template - Template string
   * @param {Object} data - Data to replace placeholders
   */
  processTemplate(template, data) {
    let processed = template;
    
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      const value = data[key] || '';
      processed = processed.replace(new RegExp(placeholder, 'g'), value);
    });

    return processed;
  }

  /**
   * Format date and time for display
   */
  formatDateTime(dateTime, timezone = this.defaultTimeZone) {
    return moment.tz(dateTime, timezone).format('MMMM Do YYYY, h:mm A z');
  }

  formatDate(dateTime, timezone = this.defaultTimeZone) {
    return moment.tz(dateTime, timezone).format('MMMM Do YYYY');
  }

  formatTime(dateTime, timezone = this.defaultTimeZone) {
    return moment.tz(dateTime, timezone).format('h:mm A');
  }

  /**
   * Convert plain text to HTML for email
   * @param {string} text - Plain text
   */
  convertToHtml(text) {
    return text.replace(/\n/g, '<br>');
  }

  /**
   * Clean up old notifications (older than 30 days)
   */
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

  /**
   * Get notification statistics
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   */
  async getNotificationStatistics(startDate, endDate) {
    try {
      const notifications = await Notification.query()
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate);

      const stats = {
        total: notifications.length,
        by_type: {
          email: notifications.filter(n => n.type === NotificationType.EMAIL).length,
          sms: notifications.filter(n => n.type === NotificationType.SMS).length
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
}

module.exports = NotificationService;