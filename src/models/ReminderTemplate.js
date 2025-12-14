const { Model } = require('objection');

class ReminderTemplate extends Model {
  static get tableName() {
    return 'reminder_templates';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'title_template', 'content_template'],
      properties: {
        id: { type: 'integer' },
        uuid: { type: 'string', format: 'uuid' },
        
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: 'string' },
        category: { type: 'string' },
        
        title_template: { type: 'string', minLength: 1, maxLength: 255 },
        content_template: { type: 'string', minLength: 1 },
        required_variables: { type: 'array' },
        optional_variables: { type: 'array' },
        
        default_advance_minutes: { type: 'integer', minimum: 0 },
        default_priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        default_telegram: { type: 'boolean' },
        default_email: { type: 'boolean' },
        default_sms: { type: 'boolean' },
        
        usage_count: { type: 'integer', minimum: 0 },
        is_active: { type: 'boolean' },
        is_system_template: { type: 'boolean' },
        created_by: { type: 'string' }
      }
    };
  }

  static get relationMappings() {
    const CustomReminder = require('./CustomReminder');

    return {
      customReminders: {
        relation: Model.HasManyRelation,
        modelClass: CustomReminder,
        join: {
          from: 'reminder_templates.id',
          to: 'custom_reminders.template_id'
        }
      }
    };
  }

  // Set defaults before insert
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    
    if (!this.uuid) {
      this.uuid = require('uuid').v4();
    }
    
    if (!this.category) {
      this.category = 'general';
    }
    
    if (this.default_advance_minutes === undefined) {
      this.default_advance_minutes = 60;
    }
    
    if (!this.default_priority) {
      this.default_priority = 'medium';
    }
    
    if (this.default_telegram === undefined) {
      this.default_telegram = true;
    }
    
    if (this.default_email === undefined) {
      this.default_email = false;
    }
    
    if (this.default_sms === undefined) {
      this.default_sms = false;
    }
    
    if (this.usage_count === undefined) {
      this.usage_count = 0;
    }
    
    if (this.is_active === undefined) {
      this.is_active = true;
    }
    
    if (this.is_system_template === undefined) {
      this.is_system_template = false;
    }
  }

  // Status checks
  isActive() {
    return this.is_active === true;
  }

  isSystemTemplate() {
    return this.is_system_template === true;
  }

  // Category checks
  isAppointmentTemplate() {
    return this.category === 'appointment';
  }

  isMedicalTemplate() {
    return this.category === 'medical';
  }

  isBusinessTemplate() {
    return this.category === 'business';
  }

  isPersonalTemplate() {
    return this.category === 'personal';
  }

  // Template processing
  processTemplate(variables = {}) {
    let processedTitle = this.title_template;
    let processedContent = this.content_template;
    
    // Replace variables in title and content
    Object.keys(variables).forEach(key => {
      const placeholder = `{${key}}`;
      const value = variables[key] || '';
      processedTitle = processedTitle.replace(new RegExp(placeholder, 'g'), value);
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
    });
    
    return {
      title: processedTitle,
      content: processedContent,
      missing_variables: this.getMissingVariables(variables),
      unused_variables: this.getUnusedVariables(variables)
    };
  }

  // Get all variables used in templates
  getUsedVariables() {
    const variables = new Set();
    const content = this.title_template + ' ' + this.content_template;
    
    const regex = /{([^}]+)}/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  }

  // Check for missing required variables
  getMissingVariables(providedVariables) {
    const required = this.required_variables || [];
    const provided = Object.keys(providedVariables);
    
    return required.filter(variable => !provided.includes(variable));
  }

  // Check for unused provided variables
  getUnusedVariables(providedVariables) {
    const usedVariables = this.getUsedVariables();
    const provided = Object.keys(providedVariables);
    
    return provided.filter(variable => !usedVariables.includes(variable));
  }

  // Validate template
  validateTemplate() {
    const errors = [];
    const warnings = [];
    
    // Check for required variables in content
    const usedVariables = this.getUsedVariables();
    const requiredVariables = this.required_variables || [];
    
    // Check if all required variables are used
    const unusedRequired = requiredVariables.filter(variable => !usedVariables.includes(variable));
    if (unusedRequired.length > 0) {
      warnings.push(`Required variables not used in template: ${unusedRequired.join(', ')}`);
    }
    
    // Check for variables used but not declared
    const declaredVariables = [...(this.required_variables || []), ...(this.optional_variables || [])];
    const undeclaredUsed = usedVariables.filter(variable => !declaredVariables.includes(variable));
    if (undeclaredUsed.length > 0) {
      warnings.push(`Variables used but not declared: ${undeclaredUsed.join(', ')}`);
    }
    
    // Basic content validation
    if (this.title_template.length < 1) {
      errors.push('Title template cannot be empty');
    }
    
    if (this.title_template.length > 255) {
      errors.push('Title template too long (max 255 characters)');
    }
    
    if (this.content_template.length < 1) {
      errors.push('Content template cannot be empty');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      used_variables: usedVariables,
      required_variables: this.required_variables || [],
      optional_variables: this.optional_variables || []
    };
  }

  // Test template with sample data
  testTemplate(sampleData = null) {
    const defaultSampleData = {
      client_name: 'John Doe',
      client_first_name: 'John',
      appointment_date: 'January 15th 2024',
      appointment_time: '2:00 PM',
      appointment_datetime: 'January 15th 2024, 2:00 PM EST',
      service_name: 'General Consultation',
      provider_name: 'Dr. Smith',
      duration_minutes: 30,
      duration_formatted: '30 min',
      location: 'Main Clinic',
      confirmation_code: 'ABC123',
      cancellation_hours: 24,
      price: '$150.00'
    };
    
    const testData = sampleData || defaultSampleData;
    const result = this.processTemplate(testData);
    
    // Find remaining unprocessed placeholders
    const remainingPlaceholders = this.findRemainingPlaceholders(
      result.title + ' ' + result.content
    );
    
    return {
      ...result,
      remaining_placeholders: remainingPlaceholders,
      test_data_used: testData
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

  // Increment usage count
  async incrementUsage() {
    await this.$query().patch({
      usage_count: this.usage_count + 1
    });
    this.usage_count++;
  }

  // State management
  async activate() {
    await this.$query().patch({ is_active: true });
    this.is_active = true;
  }

  async deactivate() {
    await this.$query().patch({ is_active: false });
    this.is_active = false;
  }

  async updateTemplate(titleTemplate, contentTemplate, variables = {}) {
    const updateData = {
      title_template: titleTemplate,
      content_template: contentTemplate
    };
    
    if (variables.required) {
      updateData.required_variables = variables.required;
    }
    
    if (variables.optional) {
      updateData.optional_variables = variables.optional;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Clone template
  async clone(newName, category = null) {
    const clonedTemplate = await ReminderTemplate.query().insert({
      name: newName,
      description: this.description,
      category: category || this.category,
      title_template: this.title_template,
      content_template: this.content_template,
      required_variables: this.required_variables,
      optional_variables: this.optional_variables,
      default_advance_minutes: this.default_advance_minutes,
      default_priority: this.default_priority,
      default_telegram: this.default_telegram,
      default_email: this.default_email,
      default_sms: this.default_sms,
      is_active: false, // Start as inactive
      is_system_template: false,
      created_by: 'cloned_from_' + this.id
    });
    
    return clonedTemplate;
  }

  // Static methods
  static async findActive() {
    return this.query().where('is_active', true).orderBy('name');
  }

  static async findByCategory(category) {
    return this.query()
      .where('category', category)
      .where('is_active', true)
      .orderBy('name');
  }

  static async findSystemTemplates() {
    return this.query()
      .where('is_system_template', true)
      .where('is_active', true)
      .orderBy('category')
      .orderBy('name');
  }

  static async findUserTemplates(createdBy = null) {
    const query = this.query()
      .where('is_system_template', false)
      .where('is_active', true)
      .orderBy('name');
    
    if (createdBy) {
      query.where('created_by', createdBy);
    }
    
    return query;
  }

  static async findPopular(limit = 10) {
    return this.query()
      .where('is_active', true)
      .orderBy('usage_count', 'desc')
      .limit(limit);
  }

  static async search(searchTerm, category = null) {
    const query = this.query()
      .where('is_active', true)
      .where(builder => {
        builder
          .where('name', 'like', `%${searchTerm}%`)
          .orWhere('description', 'like', `%${searchTerm}%`)
          .orWhere('content_template', 'like', `%${searchTerm}%`);
      })
      .orderBy('usage_count', 'desc');
    
    if (category) {
      query.where('category', category);
    }
    
    return query;
  }

  // Get usage statistics
  async getUsageStatistics(startDate = null, endDate = null) {
    const CustomReminder = require('./CustomReminder');
    
    let query = CustomReminder.query().where('template_id', this.id);
    
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }
    
    const reminders = await query;
    
    return {
      total_usage: reminders.length,
      successful: reminders.filter(r => r.status === 'sent').length,
      failed: reminders.filter(r => r.status === 'failed').length,
      pending: reminders.filter(r => r.status === 'scheduled').length,
      cancelled: reminders.filter(r => r.status === 'cancelled').length,
      success_rate: reminders.length > 0 
        ? Math.round((reminders.filter(r => r.status === 'sent').length / reminders.length) * 100)
        : 0,
      by_priority: {
        low: reminders.filter(r => r.priority === 'low').length,
        medium: reminders.filter(r => r.priority === 'medium').length,
        high: reminders.filter(r => r.priority === 'high').length,
        urgent: reminders.filter(r => r.priority === 'urgent').length
      },
      by_channel: {
        telegram: reminders.filter(r => r.send_telegram).length,
        email: reminders.filter(r => r.send_email).length,
        sms: reminders.filter(r => r.send_sms).length
      }
    };
  }

  // Create system templates
  static async createSystemTemplates() {
    const templates = [
      {
        name: 'Appointment Reminder',
        category: 'appointment',
        title_template: 'Appointment Reminder - {service_name}',
        content_template: `🔔 Appointment Reminder

⏰ Your appointment is in {time_until}

📅 Date: {appointment_date}
🕐 Time: {appointment_time}
📱 Service: {service_name}
👨‍💼 Provider: {provider_name}
⏱️ Duration: {duration_formatted}
📍 Location: {location}

🆔 Confirmation: {confirmation_code}

To cancel or reschedule, please contact us as soon as possible.`,
        required_variables: ['service_name', 'appointment_date', 'appointment_time', 'provider_name'],
        optional_variables: ['time_until', 'duration_formatted', 'location', 'confirmation_code'],
        is_system_template: true
      },
      {
        name: 'Medication Reminder',
        category: 'medical',
        title_template: 'Medication Reminder - {medication_name}',
        content_template: `💊 Medication Reminder

It's time to take your {medication_name}

📋 Dosage: {dosage}
🕐 Time: {scheduled_time}
📝 Instructions: {instructions}

⚠️ Important: Take as prescribed by your healthcare provider.`,
        required_variables: ['medication_name', 'dosage', 'scheduled_time'],
        optional_variables: ['instructions'],
        is_system_template: true
      },
      {
        name: 'Meeting Reminder',
        category: 'business',
        title_template: 'Meeting Reminder - {meeting_title}',
        content_template: `📅 Meeting Reminder

📋 Meeting: {meeting_title}
🕐 Time: {meeting_datetime}
📍 Location: {meeting_location}
👥 Attendees: {attendee_count} participants

📝 Agenda: {agenda}

Join link: {meeting_link}`,
        required_variables: ['meeting_title', 'meeting_datetime'],
        optional_variables: ['meeting_location', 'attendee_count', 'agenda', 'meeting_link'],
        default_advance_minutes: 15,
        is_system_template: true
      },
      {
        name: 'Birthday Reminder',
        category: 'personal',
        title_template: "Birthday Reminder - {person_name}'s Birthday",
        content_template: `🎂 Birthday Reminder

Today is {person_name}'s birthday!

🎁 Don't forget to wish them well.
📧 Contact: {contact_info}

🎉 Make their day special!`,
        required_variables: ['person_name'],
        optional_variables: ['contact_info'],
        default_advance_minutes: 480, // 8 hours before
        is_system_template: true
      }
    ];
    
    const createdTemplates = [];
    
    for (const templateData of templates) {
      try {
        // Check if template already exists
        const existing = await this.query()
          .where('name', templateData.name)
          .where('category', templateData.category)
          .where('is_system_template', true)
          .first();
        
        if (!existing) {
          const template = await this.query().insert(templateData);
          createdTemplates.push(template);
        }
      } catch (error) {
        console.error(`Error creating system template ${templateData.name}:`, error);
      }
    }
    
    return createdTemplates;
  }

  // Get template categories
  static async getCategories() {
    const result = await this.query()
      .distinct('category')
      .where('is_active', true)
      .orderBy('category');
    
    return result.map(r => r.category);
  }

  // Get templates grouped by category
  static async getGroupedByCategory() {
    const templates = await this.query()
      .where('is_active', true)
      .orderBy('category')
      .orderBy('name');
    
    const grouped = {};
    
    templates.forEach(template => {
      if (!grouped[template.category]) {
        grouped[template.category] = [];
      }
      grouped[template.category].push(template);
    });
    
    return grouped;
  }
}

module.exports = ReminderTemplate;