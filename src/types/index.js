// Type definitions and enums for the appointment system

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} email
 * @property {string} password_hash
 * @property {string} first_name
 * @property {string} last_name
 * @property {string} phone
 * @property {'client'|'provider'|'admin'} role
 * @property {string} timezone
 * @property {boolean} email_notifications
 * @property {boolean} sms_notifications
 * @property {boolean} is_active
 * @property {Object} preferences
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Service
 * @property {number} id
 * @property {number} provider_id
 * @property {string} name
 * @property {string} description
 * @property {number} duration_minutes
 * @property {number} price
 * @property {string} color_code
 * @property {boolean} is_active
 * @property {Object} booking_rules
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Appointment
 * @property {number} id
 * @property {string} uuid
 * @property {number} client_id
 * @property {number} provider_id
 * @property {number} service_id
 * @property {Date} appointment_datetime
 * @property {number} duration_minutes
 * @property {'scheduled'|'confirmed'|'in_progress'|'completed'|'cancelled'|'no_show'} status
 * @property {string} notes
 * @property {string} provider_notes
 * @property {number} price
 * @property {string} cancellation_reason
 * @property {Date} cancelled_at
 * @property {number} cancelled_by
 * @property {Object} reminder_sent
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} AvailabilitySchedule
 * @property {number} id
 * @property {number} provider_id
 * @property {'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'} day_of_week
 * @property {string} start_time
 * @property {string} end_time
 * @property {boolean} is_active
 * @property {Date} effective_from
 * @property {Date} effective_until
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} AvailabilityException
 * @property {number} id
 * @property {number} provider_id
 * @property {Date} date
 * @property {string} start_time
 * @property {string} end_time
 * @property {'unavailable'|'special_hours'|'holiday'} type
 * @property {string} reason
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} WaitlistEntry
 * @property {number} id
 * @property {number} client_id
 * @property {number} provider_id
 * @property {number} service_id
 * @property {Date} preferred_date
 * @property {string} preferred_start_time
 * @property {string} preferred_end_time
 * @property {'active'|'notified'|'expired'|'fulfilled'} status
 * @property {string} notes
 * @property {Date} expires_at
 * @property {Date} notified_at
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} NotificationTemplate
 * @property {number} id
 * @property {string} name
 * @property {'email'|'sms'} type
 * @property {string} subject
 * @property {string} content
 * @property {boolean} is_active
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} Notification
 * @property {number} id
 * @property {number} appointment_id
 * @property {number} user_id
 * @property {'email'|'sms'} type
 * @property {string} template_name
 * @property {string} recipient
 * @property {string} subject
 * @property {string} content
 * @property {'pending'|'sent'|'failed'|'cancelled'} status
 * @property {Date} scheduled_for
 * @property {Date} sent_at
 * @property {string} error_message
 * @property {number} retry_count
 * @property {Date} created_at
 * @property {Date} updated_at
 */

// Enums
const UserRole = {
  CLIENT: 'client',
  PROVIDER: 'provider',
  ADMIN: 'admin'
};

const AppointmentStatus = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
};

const WaitlistStatus = {
  ACTIVE: 'active',
  NOTIFIED: 'notified',
  EXPIRED: 'expired',
  FULFILLED: 'fulfilled'
};

const NotificationStatus = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const NotificationType = {
  EMAIL: 'email',
  SMS: 'sms'
};

const DayOfWeek = {
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday'
};

const AvailabilityExceptionType = {
  UNAVAILABLE: 'unavailable',
  SPECIAL_HOURS: 'special_hours',
  HOLIDAY: 'holiday'
};

module.exports = {
  UserRole,
  AppointmentStatus,
  WaitlistStatus,
  NotificationStatus,
  NotificationType,
  DayOfWeek,
  AvailabilityExceptionType
};