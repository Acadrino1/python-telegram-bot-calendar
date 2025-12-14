const { Model, transaction } = require('objection');
const bcrypt = require('bcrypt');
const { UserRole } = require('../types');
const crypto = require('crypto');
const centralErrorHandler = require('../utils/CentralErrorHandler');

class User extends Model {
  static get tableName() {
    return 'users';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      // Minimal required fields that exist in the database
      required: ['first_name', 'last_name'],
      properties: {
        id: { type: 'integer' },
        telegram_id: { type: 'string' },
        first_name: { type: 'string', minLength: 1, maxLength: 255 },
        last_name: { type: 'string', minLength: 1, maxLength: 255 },
        username: { type: 'string' },
        phone: { type: 'string', maxLength: 20 },
        email: { type: 'string' },
        is_active: { type: 'boolean', default: true },
        preferences: { type: 'string' },
        role: { type: 'string', default: 'client' },
        timezone: { type: 'string', default: 'America/New_York' }
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

  // Hash password before inserting with high security salt rounds
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    if (this.password) {
      // Use 12 salt rounds for enhanced security (recommended for admin users)
      this.password_hash = await bcrypt.hash(this.password, 12);
      delete this.password;
    }
  }

  // Hash password before updating if changed with high security salt rounds
  async $beforeUpdate(opt, queryContext) {
    await super.$beforeUpdate(opt, queryContext);
    if (this.password) {
      // Use 12 salt rounds for enhanced security (recommended for admin users)
      this.password_hash = await bcrypt.hash(this.password, 12);
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

  // User approval methods - simplified for databases without approval columns
  async approve(approvedBy) {
    const now = new Date();
    let prefs = {};
    if (this.preferences) {
      try {
        prefs = JSON.parse(this.preferences);
      } catch (error) {
        prefs = {};
      }
    }

    prefs.approval_status = 'approved';
    prefs.approved_by = approvedBy;
    prefs.approved_at = now;

    const updatePayload = {
      preferences: JSON.stringify(prefs),
      updated_at: now
    };

    if (this.approval_status !== undefined) {
      updatePayload.approval_status = 'approved';
      updatePayload.approved_by = approvedBy || null;
      updatePayload.approved_at = now;
    }

    return this.$query().patch(updatePayload);
  }

  async deny(deniedBy) {
    const now = new Date();
    let prefs = {};
    if (this.preferences) {
      try {
        prefs = JSON.parse(this.preferences);
      } catch (error) {
        prefs = {};
      }
    }

    prefs.approval_status = 'denied';
    prefs.denied_by = deniedBy;
    prefs.denied_at = now;

    const updatePayload = {
      preferences: JSON.stringify(prefs),
      updated_at: now
    };

    if (this.approval_status !== undefined) {
      updatePayload.approval_status = 'denied';
      updatePayload.approved_by = null;
      updatePayload.approved_at = null;
    }

    return this.$query().patch(updatePayload);
  }

  isApproved() {
    // Admin is always approved
    if (this.role === 'admin') return true;

    // Check if approval_status column exists
    if (this.approval_status !== undefined) {
      return this.approval_status === 'approved';
    }

    // Check preferences for approval status
    if (this.preferences) {
      try {
        const prefs = JSON.parse(this.preferences);
        return prefs.approval_status === 'approved';
      } catch (e) {
        // If preferences can't be parsed, user is NOT approved
        return false;
      }
    }

    // Default: user is NOT approved - must be explicitly approved
    return false;
  }

  isPending() {
    if (this.role === 'admin') return false;
    
    if (this.approval_status !== undefined) {
      return this.approval_status === 'pending';
    }
    
    if (this.preferences) {
      try {
        const prefs = JSON.parse(this.preferences);
        return prefs.approval_status === 'pending';
      } catch (e) {
        return false;
      }
    }
    
    return false;
  }

  isDenied() {
    if (this.role === 'admin') return false;
    
    if (this.approval_status !== undefined) {
      return this.approval_status === 'denied';
    }
    
    if (this.preferences) {
      try {
        const prefs = JSON.parse(this.preferences);
        return prefs.approval_status === 'denied';
      } catch (e) {
        return false;
      }
    }
    
    return false;
  }

  // Telegram-specific methods
  async updateBotInteraction() {
    // Simple update without tracking counts for now
    return this.$query().patch({
      updated_at: new Date()
    });
  }

  async updateLastLogin() {
    return this.$query().patch({
      updated_at: new Date()
    });
  }

  // Static methods for finding users
  static async findByEmail(email) {
    return this.query().findOne({ email: email.toLowerCase() });
  }

  static async findByTelegramId(telegramId) {
    return this.query().findOne({ telegram_id: telegramId.toString() });
  }

  // Helper method for creating Telegram users with transaction support
  static async createTelegramUser(telegramData, approvalStatus = 'pending') {
    const { id, username, first_name, last_name } = telegramData;
    
    // Create a simple email from telegram data for uniqueness
    const email = username ? `${username}@telegram.user` : `user${id}@telegram.user`;
    
    // Admin auto-approval
    const adminId = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
    const isAdmin = adminId && id.toString() === adminId;
    const finalApprovalStatus = isAdmin ? 'approved' : approvalStatus;
    const approvalTimestamp = finalApprovalStatus === 'approved' ? new Date() : null;
    
    // Use transaction for data consistency
    const trx = await transaction.start(Model.knex());
    
    try {
      // First check if user already exists
      const existingUser = await this.query(trx).where('telegram_id', id.toString()).first();
      if (existingUser) {
        await trx.commit();
        console.log('User already exists, returning existing user');
        return existingUser;
      }
      
      // Also check if email already exists (for username-based emails)
      const existingEmail = await this.query(trx).where('email', email).first();
      if (existingEmail) {
        // Update the existing user with telegram_id if not set
        if (!existingEmail.telegram_id) {
          let prefs = {};
          if (existingEmail.preferences) {
            try {
              prefs = JSON.parse(existingEmail.preferences);
            } catch (error) {
              prefs = {};
            }
          }
          prefs.approval_status = finalApprovalStatus;

          const updated = await existingEmail.$query(trx).patchAndFetch({
            telegram_id: id.toString(),
            telegram_username: username || existingEmail.telegram_username,
            approval_status: finalApprovalStatus,
            approved_by: null,
            approved_at: approvalTimestamp,
            preferences: JSON.stringify(prefs),
            updated_at: new Date()
          });
          await trx.commit();
          return updated;
        }
        await trx.commit();
        return existingEmail;
      }

      // Create new user with only fields that exist in the database
      const userData = {
        telegram_id: id.toString(),
        first_name: first_name || 'Telegram',
        last_name: last_name || 'User',
        telegram_username: username || null,
        telegram_first_name: first_name || null,
        telegram_last_name: last_name || null,
        email: email,
        password_hash: 'telegram_user_no_password',
        role: isAdmin ? 'admin' : 'client',
        is_active: true,
        registration_source: 'telegram',
        approval_status: finalApprovalStatus,
        approved_at: approvalTimestamp,
        approved_by: null,
        preferences: JSON.stringify({ approval_status: finalApprovalStatus })
      };

      // Add optional phone field
      if (telegramData.phone) {
        userData.phone = telegramData.phone;
      }

      const newUser = await this.query(trx).insert(userData);
      await trx.commit();
      return newUser;
      
    } catch (error) {
      await trx.rollback();
      console.error('Error creating Telegram user:', error.message);
      
      // If any field doesn't exist, try with absolute minimal fields
      if (error.message.includes('no column') || error.message.includes('no such column') || error.message.includes('Unknown column')) {
        const minimalTrx = await transaction.start(Model.knex());
        try {
          // Try with absolute minimum fields that we know exist
          const minimalUser = await this.query(minimalTrx).insert({
            telegram_id: id.toString(),
            first_name: first_name || 'Telegram',
            last_name: last_name || 'User',
            telegram_username: username || null,
            email: email,
            password_hash: 'telegram_user_no_password',
            role: isAdmin ? 'admin' : 'client',
            is_active: true,
            registration_source: 'telegram',
            approval_status: finalApprovalStatus,
            approved_at: approvalTimestamp,
            approved_by: null,
            preferences: JSON.stringify({ approval_status: finalApprovalStatus })
          });
          await minimalTrx.commit();
          return minimalUser;
        } catch (minimalError) {
          await minimalTrx.rollback();
          console.error('Error with minimal fields:', minimalError.message);
          throw minimalError;
        }
      }
      throw error;
    }
  }

  static async findProviders() {
    return this.query().where('role', UserRole.PROVIDER).where('is_active', true);
  }

  static async findClients() {
    return this.query().where('role', UserRole.CLIENT).where('is_active', true);
  }

  static async findRecentRegistrations(days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this.query().where('created_at', '>=', date);
  }

  static async getRegistrationStats() {
    const total = await this.query().count('* as count').first();
    const telegramUsers = await this.query().whereNotNull('telegram_id').count('* as count').first();
    const activeUsers = await this.query().where('is_active', true).count('* as count').first();
    const pendingUsers = await this.query().where('approval_status', 'pending').count('* as count').first();
    const approvedUsers = await this.query().where('approval_status', 'approved').count('* as count').first();
    
    return {
      total: total.count,
      telegramUsers: telegramUsers.count,
      activeUsers: activeUsers.count,
      pendingUsers: pendingUsers.count,
      approvedUsers: approvedUsers.count
    };
  }

  // Find users by approval status
  static async findByApprovalStatus(status, limit = 10) {
    return this.query()
      .where('approval_status', status)
      .whereNotNull('telegram_id')
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  // Find pending requests
  static async findPendingRequests(limit = 10) {
    return this.findByApprovalStatus('pending', limit);
  }
}

module.exports = User;
