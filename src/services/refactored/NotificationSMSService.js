const logger = require('../../utils/logger');
const TemplateProcessor = require('../../utils/TemplateProcessor');
const centralErrorHandler = require('../../utils/CentralErrorHandler');

/**
 * SMS-specific notification service
 * Handles all SMS delivery functionality via Twilio
 * Part of the refactored NotificationService architecture
 */
class NotificationSMSService {
  constructor() {
    this.twilioClient = null;
    this.templateProcessor = new TemplateProcessor();
    this.isEnabled = this.initializeTwilio();
    
    this.config = {
      maxRetries: 3,
      retryDelayMs: [2000, 5000, 10000],
      batchSize: 10,
      rateLimit: {
        maxPerMinute: 60,
        maxPerHour: 1000
      },
      messageLength: {
        single: 160,
        multipart: 1600
      }
    };

    // Track rate limiting
    this.sentThisMinute = 0;
    this.sentThisHour = 0;
    this.resetRateLimits();
  }

  initializeTwilio() {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        logger.info('Twilio configuration missing - SMS notifications disabled');
        return false;
      }

      const twilio = require('twilio');
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (!this.fromNumber) {
        logger.warn('Twilio phone number not configured - SMS notifications disabled');
        return false;
      }

      logger.info('SMS service initialized successfully');
      return true;

    } catch (error) {
      logger.error('Failed to initialize Twilio client:', error);
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

  async sendSMS(to, message, options = {}) {
    if (!this.isEnabled) {
      logger.warn('SMS service not enabled - skipping SMS send');
      return { success: false, reason: 'service_disabled' };
    }

    // Normalize phone number
    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      logger.warn(`Invalid phone number: ${to}`);
      return { success: false, reason: 'invalid_phone_number' };
    }

    // Check rate limits
    if (this.sentThisMinute >= this.config.rateLimit.maxPerMinute) {
      logger.warn('SMS rate limit reached (per minute)');
      return { success: false, reason: 'rate_limit_minute' };
    }

    if (this.sentThisHour >= this.config.rateLimit.maxPerHour) {
      logger.warn('SMS rate limit reached (per hour)');
      return { success: false, reason: 'rate_limit_hour' };
    }

    // Optimize message for SMS
    const optimizedMessage = this.optimizeMessageForSMS(message);
    
    const messageOptions = {
      body: optimizedMessage,
      from: this.fromNumber,
      to: phoneNumber,
      ...options
    };

    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      try {
        const result = await this.twilioClient.messages.create(messageOptions);
        
        // Update rate limit counters
        this.sentThisMinute++;
        this.sentThisHour++;

        logger.info(`SMS sent successfully to ${phoneNumber}`, {
          sid: result.sid,
          status: result.status,
          attempt: attempt + 1
        });

        return {
          success: true,
          sid: result.sid,
          status: result.status,
          attempt: attempt + 1,
          cost: this.estimateCost(optimizedMessage)
        };

      } catch (error) {
        attempt++;
        logger.error(`SMS send attempt ${attempt} failed:`, error);

        // Check if it's a permanent error
        if (this.isPermanentError(error)) {
          logger.error(`Permanent SMS error for ${phoneNumber}:`, error.message);
          break;
        }

        if (attempt < this.config.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = this.config.retryDelayMs[attempt - 1] || 10000;
          await this.delay(delay);
          continue;
        }

        // Log final failure
        centralErrorHandler.handleError(error, 'sms_send_failed', {
          to: phoneNumber,
          message: optimizedMessage.substring(0, 100),
          attempts: attempt
        });

        return {
          success: false,
          error: error.message,
          code: error.code,
          attempts: attempt
        };
      }
    }
  }

  async sendAppointmentConfirmation(phoneNumber, appointmentData) {
    const message = this.templateProcessor.processTemplate(
      'Appointment Confirmed! {serviceName} on {date} at {time}. Details: {confirmationUrl}',
      {
        serviceName: appointmentData.serviceName,
        date: appointmentData.date,
        time: appointmentData.time,
        confirmationUrl: appointmentData.confirmationUrl || this.generateShortUrl(appointmentData.id)
      }
    );

    return this.sendSMS(phoneNumber, message);
  }

  async sendAppointmentReminder(phoneNumber, appointmentData) {
    const message = this.templateProcessor.processTemplate(
      'Reminder: {serviceName} appointment tomorrow at {time}. Need to reschedule? {rescheduleUrl}',
      {
        serviceName: appointmentData.serviceName,
        time: appointmentData.time,
        rescheduleUrl: appointmentData.rescheduleUrl || this.generateShortUrl(appointmentData.id, 'reschedule')
      }
    );

    return this.sendSMS(phoneNumber, message);
  }

  async sendAppointmentCancellation(phoneNumber, appointmentData) {
    const message = this.templateProcessor.processTemplate(
      'Appointment Cancelled: {serviceName} on {date} at {time}. Reason: {reason}. Book again: {rebookUrl}',
      {
        serviceName: appointmentData.serviceName,
        date: appointmentData.date,
        time: appointmentData.time,
        reason: appointmentData.cancellationReason || 'Not specified',
        rebookUrl: appointmentData.rebookUrl || this.generateShortUrl('book')
      }
    );

    return this.sendSMS(phoneNumber, message);
  }

  async sendVerificationCode(phoneNumber, code) {
    const message = `Your Lodge Scheduler verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;
    
    return this.sendSMS(phoneNumber, message, {
      // High priority for verification codes
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID
    });
  }

  async sendBulkSMS(smsBatch) {
    const results = [];
    
    // Process in smaller batches to respect rate limits
    for (let i = 0; i < smsBatch.length; i += this.config.batchSize) {
      const batch = smsBatch.slice(i, i + this.config.batchSize);
      
      const batchPromises = batch.map(async (smsData) => {
        const result = await this.sendSMS(
          smsData.to,
          smsData.message,
          smsData.options || {}
        );
        
        return {
          ...smsData,
          result
        };
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + this.config.batchSize < smsBatch.length) {
        await this.delay(2000); // 2 second delay between batches
      }
    }

    return results;
  }

  // Utility methods
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if missing (assume US/Canada +1)
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    // Add + if missing
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    // International format
    if (cleaned.length > 10) {
      return `+${cleaned}`;
    }
    
    return null;
  }

  optimizeMessageForSMS(message) {
    // Ensure message fits within SMS length limits
    if (message.length <= this.config.messageLength.single) {
      return message;
    }
    
    // For longer messages, truncate smartly
    if (message.length > this.config.messageLength.multipart) {
      const truncated = message.substring(0, this.config.messageLength.multipart - 20);
      return truncated + '... (continued online)';
    }
    
    return message;
  }

  isPermanentError(error) {
    const permanentCodes = [
      21211, // Invalid 'To' Phone Number
      21214, // 'To' phone number cannot be reached
      21408, // Permission to send an SMS has not been enabled
      21610, // Attempt to send to unsubscribed recipient
    ];
    
    return permanentCodes.includes(error.code);
  }

  estimateCost(message) {
    // Estimate SMS cost based on message length
    const segments = Math.ceil(message.length / this.config.messageLength.single);
    const costPerSegment = 0.0075; // USD, approximate Twilio cost
    return segments * costPerSegment;
  }

  generateShortUrl(appointmentId, action = 'view') {
    // Generate short URLs for SMS links
    const baseUrl = process.env.APP_BASE_URL || 'https://scheduler.lodge.com';
    return `${baseUrl}/a/${appointmentId}/${action}`;
  }

  // Webhook handling for delivery status
  handleDeliveryStatus(webhookData) {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = webhookData;
    
    logger.info(`SMS delivery status update`, {
      sid: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage
    });

    // Update delivery status in database if needed
    this.updateDeliveryStatus(MessageSid, MessageStatus, ErrorCode);
    
    return { received: true };
  }

  async updateDeliveryStatus(messageSid, status, errorCode) {
    try {
      // Update notification record in database
      // This would integrate with your notification tracking system
      logger.debug(`Updated delivery status for ${messageSid}: ${status}`);
    } catch (error) {
      logger.error('Error updating SMS delivery status:', error);
    }
  }

  // Analytics and reporting
  async getDeliveryStats(timeRange = '24h') {
    try {
      const messages = await this.twilioClient.messages.list({
        dateSentAfter: this.getDateFromRange(timeRange)
      });

      const stats = {
        total: messages.length,
        delivered: messages.filter(m => m.status === 'delivered').length,
        failed: messages.filter(m => m.status === 'failed').length,
        pending: messages.filter(m => ['queued', 'sending'].includes(m.status)).length,
        undelivered: messages.filter(m => m.status === 'undelivered').length
      };

      stats.deliveryRate = stats.total > 0 ? (stats.delivered / stats.total * 100).toFixed(2) : 0;
      stats.failureRate = stats.total > 0 ? (stats.failed / stats.total * 100).toFixed(2) : 0;

      return stats;
    } catch (error) {
      logger.error('Error getting SMS delivery stats:', error);
      return null;
    }
  }

  getDateFromRange(range) {
    const now = new Date();
    switch (range) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default: return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
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
      // Check Twilio account balance and status
      const account = await this.twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      
      return {
        status: 'healthy',
        healthy: true,
        account: {
          status: account.status,
          balance: account.balance
        },
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
}

module.exports = NotificationSMSService;