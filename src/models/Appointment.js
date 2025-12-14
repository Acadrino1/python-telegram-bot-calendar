const { Model } = require('objection');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');
const { AppointmentStatus } = require('../types');

class Appointment extends Model {
  static get tableName() {
    return 'appointments';
  }

  // Status constants for easy access
  static get statuses() {
    return {
      PENDING_APPROVAL: 'pending_approval',
      SCHEDULED: 'scheduled',
      CONFIRMED: 'confirmed',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      REJECTED: 'rejected',
      NO_SHOW: 'no_show'
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['client_id', 'provider_id', 'service_id', 'appointment_datetime', 'duration_minutes'],
      properties: {
        id: { type: 'integer' },
        uuid: { type: 'string' },
        client_id: { type: 'integer' },
        provider_id: { type: 'integer' },
        service_id: { type: 'integer' },
        appointment_datetime: { type: 'string', format: 'date-time' },
        duration_minutes: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: Object.values(AppointmentStatus) },
        notes: { type: 'string' },
        provider_notes: { type: 'string' },
        price: { type: 'number', minimum: 0 },
        cancellation_reason: { type: 'string' },
        cancelled_at: { type: 'string', format: 'date-time' },
        cancelled_by: { type: 'integer' },
        reminder_sent: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const Service = require('./Service');
    const AppointmentHistory = require('./AppointmentHistory');
    const Notification = require('./Notification');

    return {
      client: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'appointments.client_id',
          to: 'users.id'
        }
      },

      provider: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'appointments.provider_id',
          to: 'users.id'
        }
      },

      service: {
        relation: Model.BelongsToOneRelation,
        modelClass: Service,
        join: {
          from: 'appointments.service_id',
          to: 'services.id'
        }
      },

      cancelledBy: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'appointments.cancelled_by',
          to: 'users.id'
        }
      },

      history: {
        relation: Model.HasManyRelation,
        modelClass: AppointmentHistory,
        join: {
          from: 'appointments.id',
          to: 'appointment_history.appointment_id'
        }
      },

      notifications: {
        relation: Model.HasManyRelation,
        modelClass: Notification,
        join: {
          from: 'appointments.id',
          to: 'notifications.appointment_id'
        }
      }
    };
  }

  // Generate UUID before inserting
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
    if (!this.status) {
      this.status = AppointmentStatus.SCHEDULED;
    }
    if (!this.reminder_sent) {
      this.reminder_sent = {};
    }
  }

  // Status check methods
  isScheduled() {
    return this.status === AppointmentStatus.SCHEDULED;
  }

  isConfirmed() {
    return this.status === AppointmentStatus.CONFIRMED;
  }

  isCancelled() {
    return this.status === AppointmentStatus.CANCELLED;
  }

  isCompleted() {
    return this.status === AppointmentStatus.COMPLETED;
  }

  isActive() {
    return [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS].includes(this.status);
  }

  // Time-based methods
  getAppointmentMoment(timezone = null) {
    const tz = timezone || process.env.DEFAULT_TIMEZONE || 'America/New_York';
    return moment.tz(this.appointment_datetime, tz);
  }

  getEndTime(timezone = null) {
    const startMoment = this.getAppointmentMoment(timezone);
    return startMoment.clone().add(this.duration_minutes, 'minutes');
  }

  isPast(timezone = null) {
    const appointmentMoment = this.getAppointmentMoment(timezone);
    return appointmentMoment.isBefore(moment.tz(timezone));
  }

  isToday(timezone = null) {
    const appointmentMoment = this.getAppointmentMoment(timezone);
    const today = moment.tz(timezone);
    return appointmentMoment.isSame(today, 'day');
  }

  isTomorrow(timezone = null) {
    const appointmentMoment = this.getAppointmentMoment(timezone);
    const tomorrow = moment.tz(timezone).add(1, 'day');
    return appointmentMoment.isSame(tomorrow, 'day');
  }

  // Get time until appointment
  getTimeUntilAppointment(timezone = null) {
    const appointmentMoment = this.getAppointmentMoment(timezone);
    const now = moment.tz(timezone);
    return moment.duration(appointmentMoment.diff(now));
  }

  // Check if appointment can be cancelled
  canBeCancelled(cancellationHours = 24) {
    if (!this.isActive()) return false;
    
    const timeUntil = this.getTimeUntilAppointment();
    return timeUntil.asHours() >= cancellationHours;
  }

  // Check if appointment can be rescheduled
  canBeRescheduled(rescheduleHours = 24) {
    return this.canBeCancelled(rescheduleHours);
  }

  // Check if reminder should be sent
  shouldSendReminder(reminderHours = 24) {
    if (!this.isActive()) return false;
    
    const timeUntil = this.getTimeUntilAppointment();
    const reminderKey = `${reminderHours}h`;
    
    return timeUntil.asHours() <= reminderHours && 
           timeUntil.asHours() > 0 && 
           !this.reminder_sent[reminderKey];
  }

  // Mark reminder as sent
  async markReminderSent(reminderType) {
    const reminderSent = { ...this.reminder_sent };
    reminderSent[reminderType] = new Date().toISOString();
    
    await this.$query().patch({ reminder_sent: reminderSent });
    this.reminder_sent = reminderSent;
  }

  // Cancel appointment
  async cancel(cancelledBy, reason = null) {
    const updateData = {
      status: AppointmentStatus.CANCELLED,
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
      cancellation_reason: reason
    };

    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Confirm appointment
  async confirm() {
    if (this.isScheduled()) {
      await this.$query().patch({ status: AppointmentStatus.CONFIRMED });
      this.status = AppointmentStatus.CONFIRMED;
    }
  }

  // Complete appointment
  async complete(providerNotes = null) {
    const updateData = {
      status: AppointmentStatus.COMPLETED
    };
    
    if (providerNotes) {
      updateData.provider_notes = providerNotes;
    }

    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Start appointment
  async start() {
    if (this.isConfirmed() || this.isScheduled()) {
      await this.$query().patch({ status: AppointmentStatus.IN_PROGRESS });
      this.status = AppointmentStatus.IN_PROGRESS;
    }
  }

  // Mark as no-show
  async markNoShow() {
    if (this.isActive() && this.isPast()) {
      await this.$query().patch({ status: AppointmentStatus.NO_SHOW });
      this.status = AppointmentStatus.NO_SHOW;
    }
  }

  // Static methods for querying
  static async findByUuid(uuid) {
    return this.query().findOne({ uuid });
  }

  static async findConflictingAppointments(providerId, startTime, endTime, excludeId = null) {
    const query = this.query()
      .where('provider_id', providerId)
      .where('status', 'not in', [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW])
      .where(function() {
        this.where(function() {
          // Appointment starts during the proposed time
          this.where('appointment_datetime', '>=', startTime)
              .where('appointment_datetime', '<', endTime);
        }).orWhere(function() {
          // Appointment ends during the proposed time (SQLite compatible)
          this.whereRaw("datetime(appointment_datetime, '+' || duration_minutes || ' minutes') > ?", [startTime])
              .whereRaw("datetime(appointment_datetime, '+' || duration_minutes || ' minutes') <= ?", [endTime]);
        }).orWhere(function() {
          // Appointment surrounds the proposed time (SQLite compatible)
          this.where('appointment_datetime', '<=', startTime)
              .whereRaw("datetime(appointment_datetime, '+' || duration_minutes || ' minutes') >= ?", [endTime]);
        });
      });

    if (excludeId) {
      query.where('id', '!=', excludeId);
    }

    return query;
  }

  static async findUpcomingReminders(reminderHours = 24) {
    // Security: validate reminderHours is a safe integer
    const safeHours = parseInt(reminderHours, 10);
    if (isNaN(safeHours) || safeHours < 1 || safeHours > 168) {
      throw new Error('Invalid reminderHours value');
    }

    const now = moment().toISOString();
    const reminderTime = moment().add(safeHours, 'hours').toISOString();

    return this.query()
      .where('status', 'in', [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED])
      .where('appointment_datetime', '>', now)
      .where('appointment_datetime', '<=', reminderTime)
      .whereRaw(`JSON_EXTRACT(reminder_sent, '$.${safeHours}h') IS NULL`)
      .withGraphFetched('[client, provider, service]');
  }

  static async findPastUncompletedAppointments() {
    const now = moment().toISOString();

    return this.query()
      .where('status', 'in', [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS])
      .whereRaw("datetime(appointment_datetime, '+' || duration_minutes || ' minutes') < ?", [now]);
  }

  // Get appointments for a specific date range
  static async findInDateRange(providerId, startDate, endDate, status = null) {
    const query = this.query()
      .where('provider_id', providerId)
      .where('appointment_datetime', '>=', startDate)
      .where('appointment_datetime', '<=', endDate);

    if (status) {
      if (Array.isArray(status)) {
        query.where('status', 'in', status);
      } else {
        query.where('status', status);
      }
    }

    return query.withGraphFetched('[client, service]').orderBy('appointment_datetime');
  }
}

module.exports = Appointment;