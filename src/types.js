
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

const NotificationType = {
  EMAIL: 'email',
  SMS: 'sms',
  TELEGRAM: 'telegram'
};

const NotificationStatus = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

module.exports = {
  UserRole,
  AppointmentStatus,
  WaitlistStatus,
  NotificationType,
  NotificationStatus
};