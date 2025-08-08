const { Model } = require('objection');
const { NotificationType } = require('../types');

class NotificationTemplate extends Model {
  static get tableName() {
    return 'notification_templates';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'type', 'content'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        type: { type: 'string', enum: Object.values(NotificationType) },
        subject: { type: 'string' },
        content: { type: 'string', minLength: 1 },
        is_active: { type: 'boolean', default: true }
      }
    };
  }

  static get relationMappings() {
    const Notification = require('./Notification');

    return {
      notifications: {
        relation: Model.HasManyRelation,
        modelClass: Notification,
        join: {
          from: 'notification_templates.name',
          to: 'notifications.template_name'
        }
      }
    };
  }

  // Check template type
  isEmail() {
    return this.type === NotificationType.EMAIL;
  }

  isSms() {
    return this.type === NotificationType.SMS;
  }

  // Validate template placeholders
  validatePlaceholders() {
    const requiredPlaceholders = [
      'client_name',
      'provider_name',
      'service_name',
      'appointment_datetime'
    ];
    
    const missingPlaceholders = [];
    
    requiredPlaceholders.forEach(placeholder => {
      const pattern = `{${placeholder}}`;
      if (!this.content.includes(pattern)) {
        missingPlaceholders.push(placeholder);
      }
    });
    
    if (this.isEmail() && this.subject) {
      requiredPlaceholders.forEach(placeholder => {
        const pattern = `{${placeholder}}`;
        if (this.subject.includes(pattern) && !this.content.includes(pattern)) {
          // Subject has placeholder but content doesn't - this is okay
        }
      });
    }
    
    return {
      valid: missingPlaceholders.length === 0,
      missing_placeholders: missingPlaceholders
    };
  }

  // Get all placeholders used in template
  getUsedPlaceholders() {
    const placeholders = new Set();
    const content = this.content + (this.subject || '');
    
    const regex = /{([^}]+)}/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      placeholders.add(match[1]);
    }
    
    return Array.from(placeholders);
  }

  // Test template with sample data
  testTemplate(sampleData = null) {
    const defaultSampleData = {
      client_name: 'John Doe',
      client_first_name: 'John',
      provider_name: 'Dr. Smith',
      service_name: 'General Consultation',
      appointment_datetime: 'January 15th 2024, 2:00 PM EST',
      appointment_date: 'January 15th 2024',
      appointment_time: '2:00 PM',
      duration_minutes: 30,
      duration_formatted: '30 min',
      price: '$150.00',
      cancellation_hours: 24,
      appointment_uuid: 'abc123',
      appointment_id: 1,
      provider_address: 'Main Clinic Location',
      provider_phone: '(555) 123-4567'
    };
    
    const testData = sampleData || defaultSampleData;
    
    let processedContent = this.content;
    let processedSubject = this.subject || '';
    
    // Replace placeholders
    Object.keys(testData).forEach(key => {
      const placeholder = `{${key}}`;
      const value = testData[key] || '';
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
      processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), value);
    });
    
    return {
      subject: this.isEmail() ? processedSubject : null,
      content: processedContent,
      remaining_placeholders: this.findRemainingPlaceholders(processedContent + processedSubject)
    };
  }

  findRemainingPlaceholders(text) {
    const regex = /{([^}]+)}/g;
    const remaining = [];
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      remaining.push(match[1]);
    }
    
    return remaining;
  }

  // Activate/deactivate template
  async activate() {
    await this.$query().patch({ is_active: true });
    this.is_active = true;
  }

  async deactivate() {
    await this.$query().patch({ is_active: false });
    this.is_active = false;
  }

  // Update template content
  async updateContent(newContent, newSubject = null) {
    const updateData = { content: newContent };
    
    if (this.isEmail() && newSubject !== null) {
      updateData.subject = newSubject;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Static methods
  static async findByName(name, type = null) {
    const query = this.query().where('name', name).where('is_active', true);
    
    if (type) {
      query.where('type', type);
    }
    
    return query.first();
  }

  static async findActive() {
    return this.query().where('is_active', true).orderBy('name');
  }

  static async findByType(type) {
    return this.query()
      .where('type', type)
      .where('is_active', true)
      .orderBy('name');
  }

  // Get template usage statistics
  async getUsageStatistics(startDate = null, endDate = null) {
    const Notification = require('./Notification');
    
    const query = Notification.query().where('template_name', this.name);
    
    if (startDate) {
      query.where('created_at', '>=', startDate);
    }
    
    if (endDate) {
      query.where('created_at', '<=', endDate);
    }
    
    const notifications = await query;
    
    return {
      total_sent: notifications.length,
      successful: notifications.filter(n => n.status === 'sent').length,
      failed: notifications.filter(n => n.status === 'failed').length,
      pending: notifications.filter(n => n.status === 'pending').length,
      cancelled: notifications.filter(n => n.status === 'cancelled').length,
      success_rate: notifications.length > 0 
        ? Math.round((notifications.filter(n => n.status === 'sent').length / notifications.length) * 100)
        : 0
    };
  }

  // Clone template
  async clone(newName) {
    const clonedTemplate = await NotificationTemplate.query().insert({
      name: newName,
      type: this.type,
      subject: this.subject,
      content: this.content,
      is_active: false // Start as inactive
    });
    
    return clonedTemplate;
  }
}

module.exports = NotificationTemplate;