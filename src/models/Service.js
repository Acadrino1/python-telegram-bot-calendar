const { Model } = require('objection');

class Service extends Model {
  static get tableName() {
    return 'services';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'duration_minutes'],
      properties: {
        id: { type: 'integer' },
        provider_id: { type: ['integer', 'null'] },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        description: { type: 'string' },
        duration_minutes: { type: 'integer', minimum: 1 },
        price: { type: 'number', minimum: 0 },
        color_code: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        is_active: { type: 'boolean', default: true },
        booking_rules: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const Appointment = require('./Appointment');
    const WaitlistEntry = require('./WaitlistEntry');

    return {
      provider: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'services.provider_id',
          to: 'users.id'
        }
      },

      appointments: {
        relation: Model.HasManyRelation,
        modelClass: Appointment,
        join: {
          from: 'services.id',
          to: 'appointments.service_id'
        }
      },

      waitlistEntries: {
        relation: Model.HasManyRelation,
        modelClass: WaitlistEntry,
        join: {
          from: 'services.id',
          to: 'waitlist.service_id'
        }
      }
    };
  }

  // Set default values before inserting
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    
    if (!this.booking_rules) {
      this.booking_rules = this.getDefaultBookingRules();
    }
    
    if (!this.color_code) {
      this.color_code = this.generateRandomColor();
    }
  }

  // Get default booking rules
  getDefaultBookingRules() {
    return {
      advance_booking_days: 30,
      cancellation_hours: 24,
      same_day_booking: false,
      max_advance_days: 90,
      require_confirmation: false,
      allow_waitlist: true
    };
  }

  // Generate a random color for the service
  generateRandomColor() {
    const colors = [
      '#2196F3', // Blue
      '#4CAF50', // Green
      '#FF9800', // Orange
      '#9C27B0', // Purple
      '#F44336', // Red
      '#00BCD4', // Cyan
      '#FF5722', // Deep Orange
      '#795548', // Brown
      '#607D8B', // Blue Grey
      '#3F51B5'  // Indigo
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Booking rules helpers
  getAdvanceBookingDays() {
    return this.booking_rules?.advance_booking_days || 30;
  }

  getCancellationHours() {
    return this.booking_rules?.cancellation_hours || 24;
  }

  getMaxAdvanceDays() {
    return this.booking_rules?.max_advance_days || 90;
  }

  allowsSameDayBooking() {
    return this.booking_rules?.same_day_booking || false;
  }

  requiresConfirmation() {
    return this.booking_rules?.require_confirmation || false;
  }

  allowsWaitlist() {
    return this.booking_rules?.allow_waitlist !== false;
  }

  // Check if service allows booking at a specific time
  canBookAt(appointmentDateTime) {
    const now = new Date();
    const appointmentDate = new Date(appointmentDateTime);
    
    // Check if it's not in the past
    if (appointmentDate <= now) {
      return { allowed: false, reason: 'Cannot book appointments in the past' };
    }

    // Check same day booking rule
    const isSameDay = appointmentDate.toDateString() === now.toDateString();
    if (isSameDay && !this.allowsSameDayBooking()) {
      return { allowed: false, reason: 'Same-day booking is not allowed for this service' };
    }

    // Check advance booking limit
    const daysDifference = Math.ceil((appointmentDate - now) / (1000 * 60 * 60 * 24));
    const maxAdvanceDays = this.getMaxAdvanceDays();
    
    if (daysDifference > maxAdvanceDays) {
      return { 
        allowed: false, 
        reason: `Cannot book more than ${maxAdvanceDays} days in advance` 
      };
    }

    return { allowed: true };
  }

  // Get formatted duration
  getFormattedDuration() {
    const hours = Math.floor(this.duration_minutes / 60);
    const minutes = this.duration_minutes % 60;
    
    if (hours === 0) {
      return `${minutes} min`;
    } else if (minutes === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return `${hours}h ${minutes}min`;
    }
  }

  // Get formatted price
  getFormattedPrice() {
    if (!this.price) return 'Free';
    return `$${this.price.toFixed(2)}`;
  }

  // Static methods
  static async findByProvider(providerId, activeOnly = true) {
    const query = this.query().where('provider_id', providerId);
    
    if (activeOnly) {
      query.where('is_active', true);
    }
    
    return query.orderBy('name');
  }

  static async findActiveServices() {
    return this.query()
      .where('is_active', true)
      .withGraphFetched('provider')
      .orderBy(['provider_id', 'name']);
  }

  // Update booking rules
  async updateBookingRules(newRules) {
    const updatedRules = { ...this.booking_rules, ...newRules };
    await this.$query().patch({ booking_rules: updatedRules });
    this.booking_rules = updatedRules;
  }

  // Activate/deactivate service
  async activate() {
    await this.$query().patch({ is_active: true });
    this.is_active = true;
  }

  async deactivate() {
    await this.$query().patch({ is_active: false });
    this.is_active = false;
  }

  // Get service statistics
  async getStatistics(startDate = null, endDate = null) {
    const Appointment = require('./Appointment');
    let query = Appointment.query()
      .where('service_id', this.id);

    if (startDate) {
      query = query.where('appointment_datetime', '>=', startDate);
    }
    if (endDate) {
      query = query.where('appointment_datetime', '<=', endDate);
    }

    const appointments = await query;
    
    const stats = {
      total_appointments: appointments.length,
      completed: appointments.filter(a => a.status === 'completed').length,
      cancelled: appointments.filter(a => a.status === 'cancelled').length,
      no_shows: appointments.filter(a => a.status === 'no_show').length,
      total_revenue: 0,
      average_booking_advance_days: 0
    };

    let totalAdvanceDays = 0;
    appointments.forEach(appointment => {
      if (appointment.price) {
        stats.total_revenue += parseFloat(appointment.price);
      }
      
      if (appointment.status === 'completed' || appointment.status === 'confirmed') {
        const bookingDate = new Date(appointment.created_at);
        const appointmentDate = new Date(appointment.appointment_datetime);
        const advanceDays = Math.ceil((appointmentDate - bookingDate) / (1000 * 60 * 60 * 24));
        totalAdvanceDays += advanceDays;
      }
    });

    if (stats.total_appointments > 0) {
      stats.average_booking_advance_days = Math.round(totalAdvanceDays / stats.total_appointments);
    }

    stats.completion_rate = stats.total_appointments > 0 
      ? Math.round((stats.completed / stats.total_appointments) * 100) 
      : 0;

    return stats;
  }
}

module.exports = Service;