const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

/**
 * Test data factory for creating consistent test data
 */
class TestFactory {
  constructor() {
    this.sequences = {
      user: 1,
      appointment: 1,
      service: 1,
      notification: 1
    };
  }

  async createUser(overrides = {}) {
    const sequence = this.sequences.user++;
    const defaultUser = {
      uuid: uuidv4(),
      first_name: `Test${sequence}`,
      last_name: `User${sequence}`,
      email: `test${sequence}@example.com`,
      phone_number: `+123456789${sequence}`,
      telegram_user_id: `telegram${sequence}`,
      telegram_username: `testuser${sequence}`,
      role: 'client',
      is_active: true,
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!overrides.password_hash && !overrides.password) {
      defaultUser.password_hash = await bcrypt.hash('testpassword123', 10);
    } else if (overrides.password) {
      defaultUser.password_hash = await bcrypt.hash(overrides.password, 10);
      delete overrides.password;
    }

    return { ...defaultUser, ...overrides };
  }

  async createProvider(overrides = {}) {
    const providerData = await this.createUser({
      role: 'provider',
      first_name: 'Dr. Provider',
      last_name: 'Test',
      ...overrides
    });
    return providerData;
  }

  async createAdmin(overrides = {}) {
    const adminData = await this.createUser({
      role: 'admin',
      first_name: 'Admin',
      last_name: 'Test',
      ...overrides
    });
    return adminData;
  }

  createService(overrides = {}) {
    const sequence = this.sequences.service++;
    const defaultService = {
      uuid: uuidv4(),
      name: `Test Service ${sequence}`,
      description: `Test service description ${sequence}`,
      duration_minutes: 30,
      price: 100.00,
      is_active: true,
      category: 'consultation',
      requires_preparation: false,
      max_advance_booking_days: 30,
      min_advance_booking_hours: 2,
      cancellation_policy_hours: 24,
      created_at: new Date(),
      updated_at: new Date()
    };

    return { ...defaultService, ...overrides };
  }

  createAppointment(overrides = {}) {
    const sequence = this.sequences.appointment++;
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 1);
    appointmentDate.setHours(10 + (sequence % 8), 0, 0, 0);

    const defaultAppointment = {
      uuid: uuidv4(),
      appointment_datetime: appointmentDate,
      duration_minutes: 30,
      status: 'scheduled',
      notes: `Test appointment ${sequence}`,
      created_at: new Date(),
      updated_at: new Date()
    };

    return { ...defaultAppointment, ...overrides };
  }

  createAvailabilitySchedule(overrides = {}) {
    const defaultSchedule = {
      uuid: uuidv4(),
      day_of_week: 'monday',
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_active: true,
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
      created_at: new Date(),
      updated_at: new Date()
    };

    return { ...defaultSchedule, ...overrides };
  }

  createNotification(overrides = {}) {
    const sequence = this.sequences.notification++;
    const defaultNotification = {
      uuid: uuidv4(),
      type: 'email',
      subject: `Test Notification ${sequence}`,
      message: `This is a test notification message ${sequence}`,
      status: 'pending',
      scheduled_at: new Date(Date.now() + 60000), // 1 minute from now
      created_at: new Date(),
      updated_at: new Date()
    };

    return { ...defaultNotification, ...overrides };
  }

  createWaitlistEntry(overrides = {}) {
    const defaultEntry = {
      uuid: uuidv4(),
      preferred_date: new Date(Date.now() + 86400000), // Tomorrow
      preferred_time_start: '09:00:00',
      preferred_time_end: '17:00:00',
      priority: 'normal',
      status: 'active',
      notes: 'Test waitlist entry',
      created_at: new Date(),
      updated_at: new Date()
    };

    return { ...defaultEntry, ...overrides };
  }

  /**
   * Creates a complete appointment booking scenario with all related data
   */
  async createCompleteBookingScenario() {
    const client = await this.createUser({ role: 'client' });
    const provider = await this.createProvider();
    const service = this.createService({ provider_id: provider.id });
    const availability = this.createAvailabilitySchedule({ provider_id: provider.id });
    const appointment = this.createAppointment({
      client_id: client.id,
      provider_id: provider.id,
      service_id: service.id
    });

    return {
      client,
      provider,
      service,
      availability,
      appointment
    };
  }

  /**
   * Generate multiple instances of any factory method
   */
  async createMultiple(factoryMethod, count = 5, overrides = []) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const override = overrides[i] || {};
      const item = await this[factoryMethod](override);
      items.push(item);
    }
    return items;
  }

  /**
   * Reset sequences for consistent test data
   */
  resetSequences() {
    this.sequences = {
      user: 1,
      appointment: 1,
      service: 1,
      notification: 1
    };
  }

  /**
   * Generate realistic test data patterns
   */
  generateRealisticTestData() {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    return {
      timeSlots: [
        '09:00:00', '09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:30:00',
        '14:00:00', '14:30:00', '15:00:00', '15:30:00', '16:00:00', '16:30:00'
      ],
      statuses: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
      roles: ['client', 'provider', 'admin'],
      serviceCategories: ['consultation', 'follow-up', 'initial', 'emergency'],
      timeRange: { past: pastDate, present: now, future: futureDate }
    };
  }
}

// Export singleton instance
module.exports = new TestFactory();