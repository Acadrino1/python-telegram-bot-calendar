const { Model } = require('objection');
const moment = require('moment-timezone');

class CustomReminder extends Model {
  static get tableName() {
    return 'custom_reminders';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['user_id', 'title', 'content', 'scheduled_for', 'reminder_type'],
      properties: {
        id: { type: 'integer' },
        uuid: { type: 'string', format: 'uuid' },
        user_id: { type: 'integer' },
        appointment_id: { type: 'integer' },
        template_id: { type: 'integer' },
        
        title: { type: 'string', minLength: 1, maxLength: 255 },
        content: { type: 'string', minLength: 1 },
        reminder_type: { type: 'string', enum: ['appointment', 'custom', 'recurring'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        
        scheduled_for: { type: 'string', format: 'date-time' },
        original_scheduled_for: { type: 'string', format: 'date-time' },
        advance_minutes: { type: 'integer', minimum: 0 },
        
        send_telegram: { type: 'boolean' },
        send_email: { type: 'boolean' },
        send_sms: { type: 'boolean' },
        delivery_preferences: { type: 'object' },
        
        recurring_pattern_id: { type: 'integer' },
        recurrence_end_date: { type: 'string', format: 'date-time' },
        max_occurrences: { type: 'integer' },
        occurrence_count: { type: 'integer' },
        
        status: { type: 'string', enum: ['scheduled', 'sent', 'failed', 'cancelled', 'expired'] },
        sent_at: { type: 'string', format: 'date-time' },
        delivery_results: { type: 'object' },
        failure_reason: { type: 'string' },
        retry_count: { type: 'integer' },
        next_retry_at: { type: 'string', format: 'date-time' },
        
        metadata: { type: 'object' },
        is_system_generated: { type: 'boolean' },
        created_by_role: { type: 'string' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const Appointment = require('./Appointment');
    const ReminderTemplate = require('./ReminderTemplate');
    const RecurringPattern = require('./RecurringPattern');
    const ReminderDeliveryLog = require('./ReminderDeliveryLog');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'custom_reminders.user_id',
          to: 'users.id'
        }
      },

      appointment: {
        relation: Model.BelongsToOneRelation,
        modelClass: Appointment,
        join: {
          from: 'custom_reminders.appointment_id',
          to: 'appointments.id'
        }
      },

      template: {
        relation: Model.BelongsToOneRelation,
        modelClass: ReminderTemplate,
        join: {
          from: 'custom_reminders.template_id',
          to: 'reminder_templates.id'
        }
      },

      recurringPattern: {
        relation: Model.BelongsToOneRelation,
        modelClass: RecurringPattern,
        join: {
          from: 'custom_reminders.recurring_pattern_id',
          to: 'recurring_patterns.id'
        }
      },

      deliveryLogs: {
        relation: Model.HasManyRelation,
        modelClass: ReminderDeliveryLog,
        join: {
          from: 'custom_reminders.id',
          to: 'reminder_delivery_logs.custom_reminder_id'
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
    
    if (!this.status) {
      this.status = 'scheduled';
    }
    
    if (!this.priority) {
      this.priority = 'medium';
    }
    
    if (!this.advance_minutes) {
      this.advance_minutes = 60;
    }
    
    if (this.send_telegram === undefined) {
      this.send_telegram = true;
    }
    
    if (this.send_email === undefined) {
      this.send_email = false;
    }
    
    if (this.send_sms === undefined) {
      this.send_sms = false;
    }
    
    if (!this.occurrence_count) {
      this.occurrence_count = 0;
    }
    
    if (!this.retry_count) {
      this.retry_count = 0;
    }
  }

  // Status check methods
  isScheduled() {
    return this.status === 'scheduled';
  }

  isSent() {
    return this.status === 'sent';
  }

  isFailed() {
    return this.status === 'failed';
  }

  isCancelled() {
    return this.status === 'cancelled';
  }

  isExpired() {
    return this.status === 'expired';
  }

  // Type check methods
  isAppointmentReminder() {
    return this.reminder_type === 'appointment';
  }

  isCustomReminder() {
    return this.reminder_type === 'custom';
  }

  isRecurringReminder() {
    return this.reminder_type === 'recurring';
  }

  // Priority check methods
  isHighPriority() {
    return this.priority === 'high' || this.priority === 'urgent';
  }

  isUrgent() {
    return this.priority === 'urgent';
  }

  // Scheduling methods
  isDue(currentTime = null) {
    const now = currentTime || moment().tz('America/New_York');
    const scheduledTime = moment(this.scheduled_for).tz('America/New_York');
    return scheduledTime.isSameOrBefore(now) && this.isScheduled();
  }

  getScheduledTime(timezone = 'America/New_York') {
    return moment(this.scheduled_for).tz(timezone);
  }

  getTimeUntilDue(timezone = 'America/New_York') {
    const now = moment().tz(timezone);
    const scheduled = this.getScheduledTime(timezone);
    return scheduled.diff(now, 'minutes');
  }

  // Delivery channel methods
  getEnabledChannels() {
    const channels = [];
    if (this.send_telegram) channels.push('telegram');
    if (this.send_email) channels.push('email');
    if (this.send_sms) channels.push('sms');
    return channels;
  }

  hasMultipleChannels() {
    return this.getEnabledChannels().length > 1;
  }

  // Recurring methods
  isRecurring() {
    return this.recurring_pattern_id !== null && this.recurring_pattern_id !== undefined;
  }

  canCreateNextOccurrence() {
    if (!this.isRecurring()) return false;
    
    if (this.max_occurrences && this.occurrence_count >= this.max_occurrences) {
      return false;
    }
    
    if (this.recurrence_end_date) {
      const now = moment().tz('America/New_York');
      const endDate = moment(this.recurrence_end_date).tz('America/New_York');
      if (now.isAfter(endDate)) {
        return false;
      }
    }
    
    return true;
  }

  // State change methods
  async markSent(deliveryResults = null) {
    await this.$query().patch({
      status: 'sent',
      sent_at: new Date().toISOString(),
      delivery_results: deliveryResults || {},
      failure_reason: null,
      retry_count: 0
    });
    
    this.status = 'sent';
    this.sent_at = new Date().toISOString();
    this.delivery_results = deliveryResults || {};
  }

  async markFailed(reason, retryAt = null) {
    const updateData = {
      status: 'failed',
      failure_reason: reason,
      retry_count: this.retry_count + 1
    };
    
    if (retryAt) {
      updateData.next_retry_at = retryAt.toISOString();
      updateData.status = 'scheduled'; // Keep as scheduled for retry
    }
    
    await this.$query().patch(updateData);
    
    Object.assign(this, updateData);
  }

  async markCancelled(reason = null) {
    await this.$query().patch({
      status: 'cancelled',
      failure_reason: reason
    });
    
    this.status = 'cancelled';
    this.failure_reason = reason;
  }

  async markExpired() {
    await this.$query().patch({
      status: 'expired'
    });
    
    this.status = 'expired';
  }

  // Reschedule reminder
  async reschedule(newScheduledTime, reason = null) {
    const updateData = {
      original_scheduled_for: this.scheduled_for,
      scheduled_for: newScheduledTime.toISOString(),
      status: 'scheduled',
      retry_count: 0,
      failure_reason: reason,
      next_retry_at: null
    };
    
    // Store reschedule reason in metadata
    if (reason) {
      const metadata = this.metadata || {};
      metadata.reschedule_history = metadata.reschedule_history || [];
      metadata.reschedule_history.push({
        from: this.scheduled_for,
        to: newScheduledTime.toISOString(),
        reason: reason,
        timestamp: new Date().toISOString()
      });
      updateData.metadata = metadata;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Increment occurrence count (for recurring reminders)
  async incrementOccurrence() {
    await this.$query().patch({
      occurrence_count: this.occurrence_count + 1
    });
    this.occurrence_count++;
  }

  // Template processing
  processContent(templateData = {}) {
    let processedTitle = this.title;
    let processedContent = this.content;
    
    Object.keys(templateData).forEach(key => {
      const placeholder = `{${key}}`;
      const value = templateData[key] || '';
      processedTitle = processedTitle.replace(new RegExp(placeholder, 'g'), value);
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
    });
    
    return {
      title: processedTitle,
      content: processedContent
    };
  }

  // Static query methods
  static async findDueReminders() {
    const now = new Date().toISOString();
    
    return this.query()
      .where('status', 'scheduled')
      .where('scheduled_for', '<=', now)
      .withGraphFetched('[user, appointment, template, recurringPattern]')
      .orderBy('priority', 'desc')
      .orderBy('scheduled_for', 'asc');
  }

  static async findByUser(userId, status = null, limit = null) {
    const query = this.query()
      .where('user_id', userId)
      .withGraphFetched('[appointment, template, recurringPattern]')
      .orderBy('scheduled_for', 'desc');
    
    if (status) {
      query.where('status', status);
    }
    
    if (limit) {
      query.limit(limit);
    }
    
    return query;
  }

  static async findByAppointment(appointmentId) {
    return this.query()
      .where('appointment_id', appointmentId)
      .withGraphFetched('[user, template, recurringPattern]')
      .orderBy('scheduled_for', 'asc');
  }

  static async findRecurring(activeOnly = true) {
    const query = this.query()
      .whereNotNull('recurring_pattern_id')
      .withGraphFetched('[user, recurringPattern]')
      .orderBy('scheduled_for', 'asc');
    
    if (activeOnly) {
      query.where('status', 'scheduled');
    }
    
    return query;
  }

  static async findByPriority(priority) {
    return this.query()
      .where('priority', priority)
      .where('status', 'scheduled')
      .withGraphFetched('[user, appointment]')
      .orderBy('scheduled_for', 'asc');
  }

  static async findFailedWithRetries() {
    return this.query()
      .where('status', 'scheduled')
      .where('retry_count', '>', 0)
      .whereNotNull('next_retry_at')
      .where('next_retry_at', '<=', new Date().toISOString())
      .withGraphFetched('[user]')
      .orderBy('priority', 'desc')
      .orderBy('next_retry_at', 'asc');
  }

  // Analytics methods
  static async getStatistics(startDate, endDate) {
    const reminders = await this.query()
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate);

    return {
      total: reminders.length,
      by_status: {
        scheduled: reminders.filter(r => r.status === 'scheduled').length,
        sent: reminders.filter(r => r.status === 'sent').length,
        failed: reminders.filter(r => r.status === 'failed').length,
        cancelled: reminders.filter(r => r.status === 'cancelled').length,
        expired: reminders.filter(r => r.status === 'expired').length
      },
      by_type: {
        appointment: reminders.filter(r => r.reminder_type === 'appointment').length,
        custom: reminders.filter(r => r.reminder_type === 'custom').length,
        recurring: reminders.filter(r => r.reminder_type === 'recurring').length
      },
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
      },
      success_rate: reminders.length > 0 
        ? Math.round((reminders.filter(r => r.status === 'sent').length / reminders.length) * 100)
        : 0
    };
  }

  // Cleanup old reminders
  static async cleanup(daysOld = 90) {
    const cutoffDate = moment().subtract(daysOld, 'days').toISOString();
    
    return this.query()
      .where('created_at', '<', cutoffDate)
      .whereIn('status', ['sent', 'failed', 'cancelled', 'expired'])
      .del();
  }
}

module.exports = CustomReminder;