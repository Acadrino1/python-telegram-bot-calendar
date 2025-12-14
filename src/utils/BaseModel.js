
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

class BaseModel {

  static generateUuid() {
    return uuidv4();
  }

  static generateShortId() {
    return uuidv4().substring(0, 8).toUpperCase();
  }

  static createTimestamps(timezone = 'America/New_York') {
    const now = moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
    return {
      created_at: now,
      updated_at: now
    };
  }

  static updateTimestamp(timezone = 'America/New_York') {
    return {
      updated_at: moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss')
    };
  }

  static get STATUS() {
    return {
      // General status
      ACTIVE: 'active',
      INACTIVE: 'inactive',
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      
      // Appointment status
      SCHEDULED: 'scheduled',
      CONFIRMED: 'confirmed',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show',
      RESCHEDULED: 'rescheduled',
      
      // Notification status
      QUEUED: 'queued',
      SENT: 'sent',
      FAILED: 'failed',
      RETRYING: 'retrying',
      
      // Support ticket status
      OPEN: 'open',
      IN_PROGRESS: 'in_progress',
      WAITING_FOR_USER: 'waiting_for_user',
      RESOLVED: 'resolved',
      CLOSED: 'closed',
      
      // Reminder status
      DUE: 'due',
      OVERDUE: 'overdue',
      SNOOZED: 'snoozed'
    };
  }

  static get PRIORITY() {
    return {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      URGENT: 'urgent',
      CRITICAL: 'critical'
    };
  }

  static get ROLES() {
    return {
      ADMIN: 'admin',
      PROVIDER: 'provider',
      CLIENT: 'client',
      SUPPORT: 'support'
    };
  }

  static get NOTIFICATION_TYPES() {
    return {
      EMAIL: 'email',
      SMS: 'sms',
      TELEGRAM: 'telegram',
      PUSH: 'push',
      IN_APP: 'in_app'
    };
  }

  static isValidStatus(status, allowedStatuses) {
    return allowedStatuses.includes(status);
  }

  static getStatusDisplayName(status) {
    if (!status) return '';
    
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  static getStatusColor(status) {
    const colorMap = {
      [this.STATUS.ACTIVE]: 'success',
      [this.STATUS.APPROVED]: 'success',
      [this.STATUS.CONFIRMED]: 'primary',
      [this.STATUS.COMPLETED]: 'success',
      [this.STATUS.SENT]: 'success',
      
      [this.STATUS.PENDING]: 'warning',
      [this.STATUS.SCHEDULED]: 'info',
      [this.STATUS.IN_PROGRESS]: 'warning',
      [this.STATUS.WAITING_FOR_USER]: 'warning',
      [this.STATUS.SNOOZED]: 'warning',
      [this.STATUS.RETRYING]: 'warning',
      
      [this.STATUS.INACTIVE]: 'secondary',
      [this.STATUS.CANCELLED]: 'danger',
      [this.STATUS.REJECTED]: 'danger',
      [this.STATUS.FAILED]: 'danger',
      [this.STATUS.NO_SHOW]: 'danger',
      [this.STATUS.CLOSED]: 'secondary',
      
      [this.STATUS.URGENT]: 'danger',
      [this.STATUS.CRITICAL]: 'danger'
    };

    return colorMap[status] || 'secondary';
  }

  static createError(message, code = 'UNKNOWN_ERROR', details = {}) {
    return {
      error: true,
      message,
      code,
      details,
      timestamp: moment().toISOString()
    };
  }

  static createSuccess(message, data = {}) {
    return {
      success: true,
      message,
      data,
      timestamp: moment().toISOString()
    };
  }

  static sanitizeForDb(data) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  static createPagination(page, limit, total) {
    const totalPages = Math.ceil(total / limit);
    
    return {
      current_page: page,
      per_page: limit,
      total_items: total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
      next_page: page < totalPages ? page + 1 : null,
      prev_page: page > 1 ? page - 1 : null
    };
  }

  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidPhone(phone) {
    const phoneRegex = /^\+?1?[2-9]\d{2}[2-9]\d{2}\d{4}$/;
    const cleaned = phone.replace(/\D/g, '');
    return phoneRegex.test(cleaned);
  }

  static formatPhone(phone) {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    }
    
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return cleaned.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '+$1 ($2) $3-$4');
    }
    
    return phone;
  }

  static generateCode(length = 6, alphanumeric = false) {
    const numbers = '0123456789';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const chars = alphanumeric ? numbers + letters : numbers;
    
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
  }

  static calculateAge(birthDate) {
    return moment().diff(moment(birthDate), 'years');
  }

  static formatDate(date, format = 'MMM DD, YYYY', timezone = 'America/New_York') {
    if (!date) return '';
    return moment(date).tz(timezone).format(format);
  }

  static isDateInPast(date, timezone = 'America/New_York') {
    return moment().tz(timezone).isAfter(moment(date));
  }

  static getTimeUntil(futureDate, timezone = 'America/New_York') {
    const now = moment().tz(timezone);
    const future = moment(futureDate).tz(timezone);
    const duration = moment.duration(future.diff(now));
    
    return {
      days: Math.floor(duration.asDays()),
      hours: duration.hours(),
      minutes: duration.minutes(),
      totalMinutes: Math.floor(duration.asMinutes()),
      totalHours: Math.floor(duration.asHours()),
      humanReadable: duration.humanize()
    };
  }

  static deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  static async retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  static debounce(func, wait) {
    let timeout;
    
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

module.exports = BaseModel;