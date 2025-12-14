const nodemailer = require('nodemailer');
const logger = require('../../utils/logger');
const TemplateProcessor = require('../../utils/TemplateProcessor');
const centralErrorHandler = require('../../utils/CentralErrorHandler');

/**
 * Email-specific notification service
 * Handles all email delivery functionality
 * Part of the refactored NotificationService architecture
 */
class NotificationEmailService {
  constructor() {
    this.transporter = null;
    this.templateProcessor = new TemplateProcessor();
    this.isEnabled = this.initializeTransporter();
    
    this.config = {
      maxRetries: 3,
      retryDelayMs: [1000, 3000, 5000],
      batchSize: 20,
      rateLimit: {
        maxPerMinute: 50,
        maxPerHour: 1000
      }
    };

    // Track rate limiting
    this.sentThisMinute = 0;
    this.sentThisHour = 0;
    this.resetRateLimits();
  }

  initializeTransporter() {
    try {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        logger.warn('SMTP configuration missing - email notifications disabled');
        return false;
      }

      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 60000, // 1 minute
        rateLimit: this.config.rateLimit.maxPerMinute
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('SMTP configuration error:', error);
          this.isEnabled = false;
        } else {
          logger.info('Email service initialized successfully');
        }
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
      return false;
    }
  }

  resetRateLimits() {
    // Reset minute counter every minute
    setInterval(() => {
      this.sentThisMinute = 0;
    }, 60000);

    // Reset hour counter every hour
    setInterval(() => {
      this.sentThisHour = 0;
    }, 3600000);
  }

  async sendEmail(to, subject, htmlContent, textContent = null, attachments = []) {
    if (!this.isEnabled) {
      logger.warn('Email service not enabled - skipping email send');
      return { success: false, reason: 'service_disabled' };
    }

    // Check rate limits
    if (this.sentThisMinute >= this.config.rateLimit.maxPerMinute) {
      logger.warn('Email rate limit reached (per minute)');
      return { success: false, reason: 'rate_limit_minute' };
    }

    if (this.sentThisHour >= this.config.rateLimit.maxPerHour) {
      logger.warn('Email rate limit reached (per hour)');
      return { success: false, reason: 'rate_limit_hour' };
    }

    const mailOptions = {
      from: {
        name: process.env.EMAIL_FROM_NAME || 'Lodge Scheduler',
        address: process.env.EMAIL_FROM || process.env.SMTP_USER
      },
      to: Array.isArray(to) ? to : [to],
      subject,
      html: htmlContent,
      text: textContent || this.stripHtml(htmlContent),
      attachments
    };

    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      try {
        const result = await this.transporter.sendMail(mailOptions);
        
        // Update rate limit counters
        this.sentThisMinute++;
        this.sentThisHour++;

        logger.info(`Email sent successfully to ${to}`, {
          messageId: result.messageId,
          subject,
          attempt: attempt + 1
        });

        return {
          success: true,
          messageId: result.messageId,
          attempt: attempt + 1
        };

      } catch (error) {
        attempt++;
        logger.error(`Email send attempt ${attempt} failed:`, error);

        if (attempt < this.config.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = this.config.retryDelayMs[attempt - 1] || 5000;
          await this.delay(delay);
          continue;
        }

        // Log final failure
        centralErrorHandler.handleError(error, 'email_send_failed', {
          to,
          subject,
          attempts: attempt
        });

        return {
          success: false,
          error: error.message,
          attempts: attempt
        };
      }
    }
  }

  async sendAppointmentConfirmation(userEmail, appointmentData) {
    const subject = 'Appointment Confirmation - Lodge Scheduler';
    
    const templateData = {
      customerName: appointmentData.customerName,
      serviceName: appointmentData.serviceName,
      date: appointmentData.date,
      time: appointmentData.time,
      duration: appointmentData.duration,
      location: appointmentData.location || 'TBD',
      notes: appointmentData.notes || '',
      confirmationUrl: appointmentData.confirmationUrl || '#',
      cancelUrl: appointmentData.cancelUrl || '#'
    };

    const htmlContent = this.templateProcessor.processTemplate(
      this.getAppointmentConfirmationTemplate(),
      templateData
    );

    return this.sendEmail(userEmail, subject, htmlContent);
  }

  async sendAppointmentReminder(userEmail, appointmentData) {
    const subject = `Reminder: Your appointment tomorrow at ${appointmentData.time}`;
    
    const templateData = {
      customerName: appointmentData.customerName,
      serviceName: appointmentData.serviceName,
      date: appointmentData.date,
      time: appointmentData.time,
      location: appointmentData.location || 'TBD',
      rescheduleUrl: appointmentData.rescheduleUrl || '#',
      cancelUrl: appointmentData.cancelUrl || '#'
    };

    const htmlContent = this.templateProcessor.processTemplate(
      this.getAppointmentReminderTemplate(),
      templateData
    );

    return this.sendEmail(userEmail, subject, htmlContent);
  }

  async sendAppointmentCancellation(userEmail, appointmentData) {
    const subject = 'Appointment Cancelled - Lodge Scheduler';
    
    const templateData = {
      customerName: appointmentData.customerName,
      serviceName: appointmentData.serviceName,
      date: appointmentData.date,
      time: appointmentData.time,
      reason: appointmentData.cancellationReason || 'No reason provided',
      rebookUrl: appointmentData.rebookUrl || '#'
    };

    const htmlContent = this.templateProcessor.processTemplate(
      this.getAppointmentCancellationTemplate(),
      templateData
    );

    return this.sendEmail(userEmail, subject, htmlContent);
  }

  async sendBulkEmails(emailBatch) {
    const results = [];
    
    // Process in smaller batches to respect rate limits
    for (let i = 0; i < emailBatch.length; i += this.config.batchSize) {
      const batch = emailBatch.slice(i, i + this.config.batchSize);
      
      const batchPromises = batch.map(async (emailData) => {
        const result = await this.sendEmail(
          emailData.to,
          emailData.subject,
          emailData.html,
          emailData.text,
          emailData.attachments
        );
        
        return {
          ...emailData,
          result
        };
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + this.config.batchSize < emailBatch.length) {
        await this.delay(1000); // 1 second delay between batches
      }
    }

    return results;
  }

  // Email templates
  getAppointmentConfirmationTemplate() {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px;">
            <h1 style="color: #2c3e50; text-align: center;">Appointment Confirmed!</h1>
            
            <p>Dear {customerName},</p>
            
            <p>Your appointment has been successfully confirmed. Here are the details:</p>
            
            <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service:</strong> {serviceName}</p>
              <p><strong>Date:</strong> {date}</p>
              <p><strong>Time:</strong> {time}</p>
              <p><strong>Duration:</strong> {duration}</p>
              <p><strong>Location:</strong> {location}</p>
            </div>
            
            <p>We look forward to seeing you!</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="{confirmationUrl}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Details</a>
              <a href="{cancelUrl}" style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">Cancel</a>
            </div>
            
            <p style="font-size: 12px; color: #7f8c8d; text-align: center;">
              This is an automated message. Please do not reply directly to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  getAppointmentReminderTemplate() {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px;">
            <h1 style="color: #f39c12; text-align: center;">Appointment Reminder</h1>
            
            <p>Hello {customerName},</p>
            
            <p>This is a friendly reminder about your upcoming appointment:</p>
            
            <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f39c12;">
              <p><strong>Service:</strong> {serviceName}</p>
              <p><strong>Date:</strong> {date}</p>
              <p><strong>Time:</strong> {time}</p>
              <p><strong>Location:</strong> {location}</p>
            </div>
            
            <p>Please arrive 5 minutes early. If you need to reschedule or cancel, please do so at least 2 hours in advance.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="{rescheduleUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reschedule</a>
              <a href="{cancelUrl}" style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">Cancel</a>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getAppointmentCancellationTemplate() {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px;">
            <h1 style="color: #e74c3c; text-align: center;">Appointment Cancelled</h1>
            
            <p>Dear {customerName},</p>
            
            <p>Your appointment has been cancelled:</p>
            
            <div style="background-color: #fadbd8; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service:</strong> {serviceName}</p>
              <p><strong>Date:</strong> {date}</p>
              <p><strong>Time:</strong> {time}</p>
              <p><strong>Reason:</strong> {reason}</p>
            </div>
            
            <p>We apologize for any inconvenience. You can book a new appointment at any time.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="{rebookUrl}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Book New Appointment</a>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Utility methods
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check
  async healthCheck() {
    if (!this.isEnabled) {
      return { status: 'disabled', healthy: false };
    }

    try {
      await this.transporter.verify();
      return {
        status: 'healthy',
        healthy: true,
        rateLimits: {
          sentThisMinute: this.sentThisMinute,
          sentThisHour: this.sentThisHour,
          maxPerMinute: this.config.rateLimit.maxPerMinute,
          maxPerHour: this.config.rateLimit.maxPerHour
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        healthy: false,
        error: error.message
      };
    }
  }

  // Cleanup
  async close() {
    if (this.transporter) {
      this.transporter.close();
      logger.info('Email service closed');
    }
  }
}

module.exports = NotificationEmailService;