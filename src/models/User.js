const { Model } = require('objection');
const bcrypt = require('bcrypt');
const { UserRole } = require('../types');

class User extends Model {
  static get tableName() {
    return 'users';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['email', 'password_hash', 'first_name', 'last_name', 'role'],
      properties: {
        id: { type: 'integer' },
        email: { type: 'string', format: 'email' },
        password_hash: { type: 'string' },
        first_name: { type: 'string', minLength: 1, maxLength: 255 },
        last_name: { type: 'string', minLength: 1, maxLength: 255 },
        phone: { type: 'string', maxLength: 20 },
        role: { type: 'string', enum: Object.values(UserRole) },
        timezone: { type: 'string', default: 'America/New_York' },
        email_notifications: { type: 'boolean', default: true },
        sms_notifications: { type: 'boolean', default: false },
        is_active: { type: 'boolean', default: true },
        preferences: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    const Appointment = require('./Appointment');
    const Service = require('./Service');
    const AvailabilitySchedule = require('./AvailabilitySchedule');
    const AvailabilityException = require('./AvailabilityException');
    const WaitlistEntry = require('./WaitlistEntry');

    return {
      // Client appointments
      clientAppointments: {
        relation: Model.HasManyRelation,
        modelClass: Appointment,
        join: {
          from: 'users.id',
          to: 'appointments.client_id'
        }
      },

      // Provider appointments
      providerAppointments: {
        relation: Model.HasManyRelation,
        modelClass: Appointment,
        join: {
          from: 'users.id',
          to: 'appointments.provider_id'
        }
      },

      // Services offered (for providers)
      services: {
        relation: Model.HasManyRelation,
        modelClass: Service,
        join: {
          from: 'users.id',
          to: 'services.provider_id'
        }
      },

      // Availability schedules (for providers)
      availabilitySchedules: {
        relation: Model.HasManyRelation,
        modelClass: AvailabilitySchedule,
        join: {
          from: 'users.id',
          to: 'availability_schedules.provider_id'
        }
      },

      // Availability exceptions (for providers)
      availabilityExceptions: {
        relation: Model.HasManyRelation,
        modelClass: AvailabilityException,
        join: {
          from: 'users.id',
          to: 'availability_exceptions.provider_id'
        }
      },

      // Waitlist entries (for clients)
      waitlistEntries: {
        relation: Model.HasManyRelation,
        modelClass: WaitlistEntry,
        join: {
          from: 'users.id',
          to: 'waitlist.client_id'
        }
      }
    };
  }

  // Hash password before inserting
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    if (this.password) {
      this.password_hash = await bcrypt.hash(this.password, 10);
      delete this.password;
    }
  }

  // Hash password before updating if changed
  async $beforeUpdate(opt, queryContext) {
    await super.$beforeUpdate(opt, queryContext);
    if (this.password) {
      this.password_hash = await bcrypt.hash(this.password, 10);
      delete this.password;
    }
  }

  // Hide sensitive data when converting to JSON
  $formatJson(json) {
    json = super.$formatJson(json);
    delete json.password_hash;
    return json;
  }

  // Verify password
  async verifyPassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }

  // Check if user is a provider
  isProvider() {
    return this.role === UserRole.PROVIDER;
  }

  // Check if user is a client
  isClient() {
    return this.role === UserRole.CLIENT;
  }

  // Check if user is an admin
  isAdmin() {
    return this.role === UserRole.ADMIN;
  }

  // Get full name
  getFullName() {
    return `${this.first_name} ${this.last_name}`;
  }

  // Get display name for notifications
  getDisplayName() {
    return this.isProvider() ? `Dr. ${this.last_name}` : this.getFullName();
  }

  // Check if notifications are enabled
  canReceiveEmailNotifications() {
    return this.is_active && this.email_notifications;
  }

  canReceiveSmsNotifications() {
    return this.is_active && this.sms_notifications && this.phone;
  }

  // Static methods for finding users
  static async findByEmail(email) {
    return this.query().findOne({ email: email.toLowerCase() });
  }

  static async findProviders() {
    return this.query().where('role', UserRole.PROVIDER).where('is_active', true);
  }

  static async findClients() {
    return this.query().where('role', UserRole.CLIENT).where('is_active', true);
  }
}

module.exports = User;