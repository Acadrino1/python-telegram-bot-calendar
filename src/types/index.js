// Type definitions and enums for the appointment system

// Enums
const UserRole = {
  CLIENT: 'client',
  PROVIDER: 'provider',
  ADMIN: 'admin'
};

const AppointmentStatus = {
  PENDING_APPROVAL: 'pending_approval',
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
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