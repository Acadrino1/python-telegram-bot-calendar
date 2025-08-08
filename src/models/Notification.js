const { Model } = require('objection');
const { NotificationType, NotificationStatus } = require('../types');

class Notification extends Model {
  static get tableName() {
    return 'notifications';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['user_id', 'type', 'template_name', 'recipient', 'content', 'scheduled_for'],
      properties: {
        id: { type: 'integer' },
        appointment_id: { type: 'integer' },
        user_id: { type: 'integer' },
        type: { type: 'string', enum: Object.values(NotificationType) },
        template_name: { type: 'string' },
        recipient: { type: 'string' },
        subject: { type: 'string' },
        content: { type: 'string' },
        status: { type: 'string', enum: Object.values(NotificationStatus) },
        scheduled_for: { type: 'string', format: 'date-time' },
        sent_at: { type: 'string', format: 'date-time' },
        error_message: { type: 'string' },
        retry_count: { type: 'integer', minimum: 0 }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const Appointment = require('./Appointment');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'notifications.user_id',
          to: 'users.id'
        }
      },

      appointment: {
        relation: Model.BelongsToOneRelation,
        modelClass: Appointment,
        join: {
          from: 'notifications.appointment_id',
          to: 'appointments.id'
        }
      }
    };
  }

  // Set default values before inserting
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    if (!this.status) {
      this.status = NotificationStatus.PENDING;
    }
    if (!this.retry_count) {
      this.retry_count = 0;
    }
  }

  // Status check methods
  isPending() {
    return this.status === NotificationStatus.PENDING;
  }

  isSent() {
    return this.status === NotificationStatus.SENT;
  }

  isFailed() {
    return this.status === NotificationStatus.FAILED;
  }

  isCancelled() {
    return this.status === NotificationStatus.CANCELLED;
  }

  // Type check methods
  isEmail() {
    return this.type === NotificationType.EMAIL;
  }

  isSms() {
    return this.type === NotificationType.SMS;
  }

  // Check if notification can be retried
  canRetry() {
    return this.isPending() && this.retry_count < 3;
  }

  // Mark as sent
  async markSent() {
    await this.$query().patch({
      status: NotificationStatus.SENT,
      sent_at: new Date().toISOString(),
      error_message: null
    });
    this.status = NotificationStatus.SENT;
    this.sent_at = new Date().toISOString();
    this.error_message = null;
  }

  // Mark as failed
  async markFailed(errorMessage) {
    await this.$query().patch({
      status: NotificationStatus.FAILED,
      error_message: errorMessage,
      retry_count: this.retry_count + 1
    });
    this.status = NotificationStatus.FAILED;
    this.error_message = errorMessage;
    this.retry_count++;
  }

  // Mark as cancelled
  async markCancelled() {
    await this.$query().patch({
      status: NotificationStatus.CANCELLED
    });
    this.status = NotificationStatus.CANCELLED;
  }

  // Increment retry count and schedule next attempt
  async scheduleRetry(nextAttemptDate) {
    await this.$query().patch({
      retry_count: this.retry_count + 1,
      scheduled_for: nextAttemptDate.toISOString()
    });
    this.retry_count++;
    this.scheduled_for = nextAttemptDate.toISOString();
  }

  // Static methods for querying
  static async findPending() {
    return this.query()
      .where('status', NotificationStatus.PENDING)
      .where('scheduled_for', '<=', new Date().toISOString())
      .where('retry_count', '<', 3)
      .orderBy('scheduled_for');
  }

  static async findByAppointment(appointmentId) {
    return this.query()
      .where('appointment_id', appointmentId)
      .orderBy('created_at', 'desc');
  }

  static async findByUser(userId, status = null) {
    const query = this.query()
      .where('user_id', userId)
      .orderBy('created_at', 'desc');
    
    if (status) {
      query.where('status', status);
    }
    
    return query;
  }

  static async findByTemplate(templateName, startDate = null, endDate = null) {
    const query = this.query().where('template_name', templateName);
    
    if (startDate) {
      query.where('created_at', '>=', startDate);
    }
    
    if (endDate) {
      query.where('created_at', '<=', endDate);
    }
    
    return query.orderBy('created_at', 'desc');
  }

  // Get statistics
  static async getStatistics(startDate, endDate) {
    const notifications = await this.query()
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

    // Count by template
    notifications.forEach(notification => {
      if (!stats.by_template[notification.template_name]) {
        stats.by_template[notification.template_name] = 0;
      }
      stats.by_template[notification.template_name]++;
    });

    // Calculate success rate
    if (stats.total > 0) {
      stats.success_rate = Math.round((stats.by_status.sent / stats.total) * 100);
    } else {
      stats.success_rate = 0;
    }

    return stats;
  }

  // Clean up old notifications
  static async cleanup(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.query()
      .where('created_at', '<', cutoffDate.toISOString())
      .where('status', 'in', [
        NotificationStatus.SENT, 
        NotificationStatus.FAILED, 
        NotificationStatus.CANCELLED
      ])
      .del();
  }
}

module.exports = Notification;