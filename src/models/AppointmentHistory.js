const { Model } = require('objection');

class AppointmentHistory extends Model {
  static get tableName() {
    return 'appointment_history';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['appointment_id', 'action'],
      properties: {
        id: { type: 'integer' },
        appointment_id: { type: 'integer' },
        action: { type: 'string', minLength: 1 },
        changes: { type: 'object' },
        changed_by: { type: 'integer' },
        notes: { type: 'string' }
      }
    };
  }

  static get relationMappings() {
    const Appointment = require('./Appointment');
    const User = require('./User');

    return {
      appointment: {
        relation: Model.BelongsToOneRelation,
        modelClass: Appointment,
        join: {
          from: 'appointment_history.appointment_id',
          to: 'appointments.id'
        }
      },

      changedBy: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'appointment_history.changed_by',
          to: 'users.id'
        }
      }
    };
  }

  // Get formatted action description
  getActionDescription() {
    const actionDescriptions = {
      'created': 'Appointment created',
      'updated': 'Appointment updated',
      'confirmed': 'Appointment confirmed',
      'cancelled': 'Appointment cancelled',
      'completed': 'Appointment completed',
      'rescheduled': 'Appointment rescheduled',
      'no_show': 'Marked as no-show',
      'started': 'Appointment started',
      'reminder_sent': 'Reminder sent',
      'modified': 'Appointment modified'
    };

    return actionDescriptions[this.action] || this.action;
  }

  // Get changes summary
  getChangesSummary() {
    if (!this.changes || typeof this.changes !== 'object') {
      return 'No changes recorded';
    }

    const changes = this.changes;
    const summaryParts = [];

    // Handle different types of changes
    if (changes.old_status && changes.new_status) {
      summaryParts.push(`Status: ${changes.old_status} → ${changes.new_status}`);
    }

    if (changes.old_appointment_datetime && changes.new_appointment_datetime) {
      summaryParts.push(`Time: ${this.formatDateTime(changes.old_appointment_datetime)} → ${this.formatDateTime(changes.new_appointment_datetime)}`);
    }

    if (changes.cancellation_reason) {
      summaryParts.push(`Reason: ${changes.cancellation_reason}`);
    }

    if (changes.provider_notes) {
      summaryParts.push(`Notes added`);
    }

    return summaryParts.length > 0 ? summaryParts.join(', ') : 'Changes made';
  }

  formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString();
  }

  // Static methods
  static async findByAppointment(appointmentId) {
    return this.query()
      .where('appointment_id', appointmentId)
      .withGraphFetched('changedBy')
      .orderBy('created_at', 'desc');
  }

  static async findByUser(userId) {
    return this.query()
      .where('changed_by', userId)
      .withGraphFetched('appointment')
      .orderBy('created_at', 'desc');
  }

  static async findByAction(action, startDate = null, endDate = null) {
    const query = this.query().where('action', action);

    if (startDate) {
      query.where('created_at', '>=', startDate);
    }

    if (endDate) {
      query.where('created_at', '<=', endDate);
    }

    return query.withGraphFetched('[appointment, changedBy]').orderBy('created_at', 'desc');
  }

  // Create history entry helper
  static async createEntry(appointmentId, action, changes = null, changedBy = null, notes = null) {
    return this.query().insert({
      appointment_id: appointmentId,
      action,
      changes,
      changed_by: changedBy,
      notes
    });
  }

  // Get activity summary for a date range
  static async getActivitySummary(startDate, endDate) {
    const activities = await this.query()
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .withGraphFetched('[appointment, changedBy]');

    const summary = {
      total_activities: activities.length,
      by_action: {},
      by_user: {},
      timeline: []
    };

    activities.forEach(activity => {
      // Count by action
      if (!summary.by_action[activity.action]) {
        summary.by_action[activity.action] = 0;
      }
      summary.by_action[activity.action]++;

      // Count by user
      if (activity.changedBy) {
        const userName = activity.changedBy.getFullName();
        if (!summary.by_user[userName]) {
          summary.by_user[userName] = 0;
        }
        summary.by_user[userName]++;
      }

      // Add to timeline
      summary.timeline.push({
        date: activity.created_at,
        action: activity.getActionDescription(),
        changes: activity.getChangesSummary(),
        user: activity.changedBy ? activity.changedBy.getFullName() : 'System',
        appointment_id: activity.appointment_id
      });
    });

    // Sort timeline by date (newest first)
    summary.timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    return summary;
  }
}

module.exports = AppointmentHistory;