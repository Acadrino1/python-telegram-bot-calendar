const Joi = require('joi');
const validator = require('validator');

/**
 * Input validation utility for Telegram bot commands and user data
 */
class InputValidator {
  constructor() {
    // Define validation schemas
    this.schemas = {
      // User input schemas
      ticketSubject: Joi.string()
        .min(3)
        .max(100)
        .pattern(/^[a-zA-Z0-9\s\-_.,!?]+$/)
        .trim(),
      
      ticketMessage: Joi.string()
        .min(5)
        .max(1000)
        .trim(),
      
      appointmentId: Joi.string()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(50),
      
      telegramId: Joi.string()
        .pattern(/^\d+$/)
        .min(6)
        .max(15),
      
      referralCode: Joi.string()
        .pattern(/^[A-Z0-9]+$/)
        .min(3)
        .max(20),
      
      userName: Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[a-zA-Z\s\-']+$/),
      
      email: Joi.string()
        .email()
        .max(255),
      
      phoneNumber: Joi.string()
        .pattern(/^\+?[\d\-\s()]+$/)
        .min(10)
        .max(20),
      
      // Command validation
      commandArgs: Joi.array()
        .items(Joi.string().max(500))
        .max(10)
    };
  }

  /**
   * Sanitize user input by removing/escaping dangerous characters
   */
  sanitizeInput(input, options = {}) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove or escape HTML
    let sanitized = options.allowHtml 
      ? validator.escape(input) 
      : validator.stripLow(input);

    // Remove potential SQL injection patterns
    sanitized = sanitized.replace(/['";\\]/g, '');
    
    // Remove script tags and javascript
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    
    // Limit length
    const maxLength = options.maxLength || 1000;
    sanitized = sanitized.substring(0, maxLength);

    return sanitized.trim();
  }

  /**
   * Validate ticket creation input
   */
  validateTicketInput(subject, message) {
    const errors = [];

    // Validate subject
    const subjectValidation = this.schemas.ticketSubject.validate(subject);
    if (subjectValidation.error) {
      errors.push(`Subject: ${subjectValidation.error.message}`);
    }

    // Validate message
    const messageValidation = this.schemas.ticketMessage.validate(message);
    if (messageValidation.error) {
      errors.push(`Message: ${messageValidation.error.message}`);
    }

    // Additional security checks
    if (this.containsSuspiciousContent(subject) || this.containsSuspiciousContent(message)) {
      errors.push('Input contains potentially harmful content');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized: {
        subject: this.sanitizeInput(subject, { maxLength: 100 }),
        message: this.sanitizeInput(message, { maxLength: 1000 })
      }
    };
  }

  /**
   * Validate appointment ID
   */
  validateAppointmentId(appointmentId) {
    const validation = this.schemas.appointmentId.validate(appointmentId);
    return {
      isValid: !validation.error,
      error: validation.error?.message,
      sanitized: this.sanitizeInput(appointmentId, { maxLength: 50 })
    };
  }

  /**
   * Validate Telegram user ID
   */
  validateTelegramId(telegramId) {
    const validation = this.schemas.telegramId.validate(telegramId.toString());
    return {
      isValid: !validation.error,
      error: validation.error?.message,
      sanitized: telegramId.toString()
    };
  }

  /**
   * Validate referral code
   */
  validateReferralCode(code) {
    const validation = this.schemas.referralCode.validate(code.toUpperCase());
    return {
      isValid: !validation.error,
      error: validation.error?.message,
      sanitized: code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    };
  }

  /**
   * Validate user registration data
   */
  validateUserData(userData) {
    const errors = [];
    const sanitized = {};

    // Validate first name
    if (userData.first_name) {
      const nameValidation = this.schemas.userName.validate(userData.first_name);
      if (nameValidation.error) {
        errors.push(`First name: ${nameValidation.error.message}`);
      }
      sanitized.first_name = this.sanitizeInput(userData.first_name, { maxLength: 50 });
    }

    // Validate last name
    if (userData.last_name) {
      const nameValidation = this.schemas.userName.validate(userData.last_name);
      if (nameValidation.error) {
        errors.push(`Last name: ${nameValidation.error.message}`);
      }
      sanitized.last_name = this.sanitizeInput(userData.last_name, { maxLength: 50 });
    }

    // Validate email if provided
    if (userData.email) {
      const emailValidation = this.schemas.email.validate(userData.email);
      if (emailValidation.error) {
        errors.push(`Email: ${emailValidation.error.message}`);
      }
      sanitized.email = validator.normalizeEmail(userData.email) || userData.email;
    }

    // Validate phone if provided
    if (userData.phone) {
      const phoneValidation = this.schemas.phoneNumber.validate(userData.phone);
      if (phoneValidation.error) {
        errors.push(`Phone: ${phoneValidation.error.message}`);
      }
      sanitized.phone = this.sanitizeInput(userData.phone, { maxLength: 20 });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized
    };
  }

  /**
   * Validate command arguments
   */
  validateCommandArgs(args) {
    const validation = this.schemas.commandArgs.validate(args);
    return {
      isValid: !validation.error,
      error: validation.error?.message,
      sanitized: args.map(arg => this.sanitizeInput(arg, { maxLength: 500 }))
    };
  }

  /**
   * Check for suspicious content patterns
   */
  containsSuspiciousContent(input) {
    if (typeof input !== 'string') {
      return false;
    }

    const suspiciousPatterns = [
      // SQL injection patterns
      /('|;|--|\s(or|and)\s)/gi,
      /union\s+(all\s+)?select/gi,
      /insert\s+into|update\s+\w+\s+set|delete\s+from/gi,
      
      // XSS patterns
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload|onerror|onclick|onmouseover/gi,
      
      // Command injection
      /(\||&&|;|\$\(|`)/g,
      
      // Path traversal
      /\.\.\//g,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Rate limiting validation (simple in-memory implementation)
   */
  validateRateLimit(userId, action, windowMs = 60000, maxRequests = 10) {
    const now = Date.now();
    const key = `${userId}_${action}`;
    
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const userRequests = this.rateLimitStore.get(key) || [];
    
    // Remove expired requests
    const validRequests = userRequests.filter(timestamp => 
      now - timestamp < windowMs
    );

    if (validRequests.length >= maxRequests) {
      return {
        allowed: false,
        resetTime: Math.min(...validRequests) + windowMs
      };
    }

    // Add current request
    validRequests.push(now);
    this.rateLimitStore.set(key, validRequests);

    return {
      allowed: true,
      remaining: maxRequests - validRequests.length
    };
  }

  /**
   * Clean up rate limit store periodically
   */
  cleanupRateLimitStore() {
    if (!this.rateLimitStore) return;

    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [key, requests] of this.rateLimitStore.entries()) {
      const validRequests = requests.filter(timestamp => 
        now - timestamp < maxAge
      );
      
      if (validRequests.length === 0) {
        this.rateLimitStore.delete(key);
      } else {
        this.rateLimitStore.set(key, validRequests);
      }
    }
  }
}

// Create singleton instance
const inputValidator = new InputValidator();

// Clean up rate limit store every 30 minutes
setInterval(() => {
  inputValidator.cleanupRateLimitStore();
}, 30 * 60 * 1000);

module.exports = inputValidator;