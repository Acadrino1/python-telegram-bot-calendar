const moment = require('moment-timezone');

class TemplateProcessor {
  constructor(defaultTimezone = 'America/New_York') {
    this.defaultTimezone = defaultTimezone;
    this.helpers = new Map();
    this.registerDefaultHelpers();
  }

  registerDefaultHelpers() {
    // Date formatting helpers
    this.registerHelper('formatDate', (data, path, format = 'MMM DD, YYYY') => {
      const date = this.getNestedProperty(data, path);
      if (!date) return '';
      return moment(date).tz(this.defaultTimezone).format(format);
    });

    this.registerHelper('formatTime', (data, path, format = 'h:mm A') => {
      const date = this.getNestedProperty(data, path);
      if (!date) return '';
      return moment(date).tz(this.defaultTimezone).format(format);
    });

    this.registerHelper('formatDateTime', (data, path) => {
      const date = this.getNestedProperty(data, path);
      if (!date) return '';
      return moment(date).tz(this.defaultTimezone).format('MMM DD, YYYY h:mm A z');
    });

    // Text helpers
    this.registerHelper('uppercase', (data, path) => {
      const value = this.getNestedProperty(data, path);
      return value ? value.toString().toUpperCase() : '';
    });

    this.registerHelper('lowercase', (data, path) => {
      const value = this.getNestedProperty(data, path);
      return value ? value.toString().toLowerCase() : '';
    });

    this.registerHelper('capitalize', (data, path) => {
      const value = this.getNestedProperty(data, path);
      if (!value) return '';
      const str = value.toString();
      return str.charAt(0).toUpperCase() + str.slice(1);
    });
  }

  registerHelper(name, fn) {
    this.helpers.set(name, fn);
  }

  processTemplate(template, data, options = {}) {
    if (!template) return '';
    
    let processed = template;
    
    // Replace simple placeholders: {property}
    processed = processed.replace(/\{([^}]+)\}/g, (match, key) => {
      const value = this.getNestedProperty(data, key.trim());
      return value !== undefined ? value : match;
    });
    
    // Replace helper placeholders: {{helper property}}
    processed = processed.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const parts = expression.trim().split(/\s+/);
      const helperName = parts[0];
      const propertyPath = parts[1];
      const additionalArgs = parts.slice(2);
      
      if (this.helpers.has(helperName) && propertyPath) {
        try {
          const helper = this.helpers.get(helperName);
          return helper(data, propertyPath, ...additionalArgs) || match;
        } catch (error) {
          console.warn(`Helper ${helperName} failed:`, error.message);
          return match;
        }
      }
      
      return match;
    });
    
    return processed;
  }

  getNestedProperty(obj, path) {
    if (!obj || !path) return undefined;
    
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  buildAppointmentTemplateData(appointment, client, provider, service, businessInfo = {}) {
    const appointmentMoment = moment(appointment.appointment_datetime).tz(client.timezone || this.defaultTimezone);
    
    return {
      // Client information
      client_name: this.getDisplayName(client),
      client_first_name: client.first_name || '',
      client_last_name: client.last_name || '',
      client_email: client.email || '',
      client_phone: client.phone || '',
      
      // Provider information
      provider_name: this.getDisplayName(provider),
      provider_first_name: provider.first_name || '',
      provider_last_name: provider.last_name || '',
      
      // Service information
      service_name: service.name || 'Service',
      service_description: service.description || '',
      service_duration: service.duration_minutes || 60,
      service_price: service.price || 0,
      service_price_formatted: this.formatPrice(service.price || 0),
      
      // Appointment information
      appointment_id: appointment.id,
      appointment_uuid: appointment.uuid,
      appointment_datetime: appointmentMoment.format('YYYY-MM-DD HH:mm:ss'),
      appointment_date: appointmentMoment.format('MMM DD, YYYY'),
      appointment_time: appointmentMoment.format('h:mm A'),
      appointment_day: appointmentMoment.format('dddd'),
      appointment_timezone: appointmentMoment.format('z'),
      duration_minutes: appointment.duration_minutes || service.duration_minutes || 60,
      status: appointment.status || 'scheduled',
      notes: appointment.notes || '',
      
      // Business information
      business_name: businessInfo.businessName || 'Lodge Mobile',
      business_address: businessInfo.businessAddress || '',
      business_phone: businessInfo.businessPhone || '',
      business_email: businessInfo.businessEmail || '',
      business_website: businessInfo.businessWebsite || '',
      
      // System information
      current_date: moment().tz(this.defaultTimezone).format('MMM DD, YYYY'),
      current_time: moment().tz(this.defaultTimezone).format('h:mm A z'),
      system_timezone: this.defaultTimezone
    };
  }

  getDisplayName(user) {
    if (!user) return 'User';
    
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    
    if (user.email) {
      return user.email.split('@')[0];
    }
    
    return 'User';
  }

  formatPrice(price) {
    if (price === 0) return 'Free';
    if (!price) return '$0.00';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }

  textToHtml(text) {
    if (!text) return '';
    
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  htmlToText(html) {
    if (!html) return '';
    
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }

  validateTemplate(template) {
    const errors = [];
    
    if (!template) {
      errors.push('Template is empty');
      return { valid: false, errors };
    }
    
    // Check for unmatched braces
    const openBraces = (template.match(/\{/g) || []).length;
    const closeBraces = (template.match(/\}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      errors.push('Unmatched braces in template');
    }
    
    // Check for invalid helper syntax
    const helperMatches = template.match(/\{\{([^}]+)\}\}/g) || [];
    helperMatches.forEach(match => {
      const expression = match.slice(2, -2).trim();
      const parts = expression.split(/\s+/);
      const helperName = parts[0];
      
      if (!this.helpers.has(helperName)) {
        errors.push(`Unknown helper: ${helperName}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  getAvailablePlaceholders(templateType = 'appointment') {
    const common = [
      'client_name', 'client_first_name', 'client_last_name',
      'business_name', 'current_date', 'current_time'
    ];
    
    const appointment = [
      ...common,
      'provider_name', 'service_name', 'appointment_date',
      'appointment_time', 'duration_minutes', 'appointment_uuid'
    ];
    
    const reminder = [
      ...appointment,
      'time_until', 'appointment_day'
    ];
    
    switch (templateType) {
      case 'reminder':
        return reminder;
      case 'appointment':
        return appointment;
      default:
        return common;
    }
  }

  previewTemplate(template, templateType = 'appointment') {
    const sampleData = this.getSampleData(templateType);
    return this.processTemplate(template, sampleData);
  }

  getSampleData(templateType) {
    const now = moment().tz(this.defaultTimezone);
    const appointmentTime = now.clone().add(1, 'day').hour(14).minute(0);
    
    return {
      client_name: 'John Doe',
      client_first_name: 'John',
      client_last_name: 'Doe',
      client_email: 'john.doe@example.com',
      provider_name: 'Dr. Smith',
      service_name: 'Phone Setup',
      appointment_date: appointmentTime.format('MMM DD, YYYY'),
      appointment_time: appointmentTime.format('h:mm A'),
      appointment_day: appointmentTime.format('dddd'),
      appointment_uuid: 'APT-123456',
      duration_minutes: 60,
      business_name: 'Lodge Mobile',
      current_date: now.format('MMM DD, YYYY'),
      current_time: now.format('h:mm A z'),
      time_until: '24 hours'
    };
  }
}

module.exports = TemplateProcessor;