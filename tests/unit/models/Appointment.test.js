const Appointment = require('../../../src/models/Appointment');
const TestFactory = require('../../utils/test-factory');

// Mock the database connection
jest.mock('objection', () => ({
  Model: class MockModel {
    static get tableName() { return 'appointments'; }
    static query() { return new MockQueryBuilder(); }
    $query() { return new MockQueryBuilder(); }
    static get HasOneRelation() { return 'HasOneRelation'; }
    static get BelongsToOneRelation() { return 'BelongsToOneRelation'; }
  }
}));

class MockQueryBuilder {
  insert = jest.fn().mockReturnThis();
  select = jest.fn().mockReturnThis();
  where = jest.fn().mockReturnThis();
  findById = jest.fn().mockReturnThis();
  patch = jest.fn().mockReturnThis();
  delete = jest.fn().mockReturnThis();
  first = jest.fn().mockReturnThis();
  orderBy = jest.fn().mockReturnThis();
  withGraphFetched = jest.fn().mockReturnThis();
}

describe('Appointment Model', () => {
  let mockAppointment;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAppointment = TestFactory.createAppointment({
      client_id: 1,
      provider_id: 2,
      service_id: 3
    });
  });

  describe('Model Structure', () => {
    test('should have correct table name', () => {
      expect(Appointment.tableName).toBe('appointments');
    });

    test('should have uuid as id column', () => {
      expect(Appointment.idColumn).toBe('uuid');
    });

    test('should define correct JSON schema', () => {
      const schema = Appointment.jsonSchema;
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('client_id');
      expect(schema.required).toContain('provider_id');
      expect(schema.required).toContain('service_id');
      expect(schema.required).toContain('appointment_datetime');
    });
  });

  describe('Status Transitions', () => {
    test('should validate appointment status transitions', () => {
      const appointment = new Appointment();
      
      // Valid transitions
      expect(appointment.canTransitionTo('scheduled', 'confirmed')).toBe(true);
      expect(appointment.canTransitionTo('confirmed', 'in_progress')).toBe(true);
      expect(appointment.canTransitionTo('in_progress', 'completed')).toBe(true);
      expect(appointment.canTransitionTo('scheduled', 'cancelled')).toBe(true);
      
      // Invalid transitions
      expect(appointment.canTransitionTo('completed', 'scheduled')).toBe(false);
      expect(appointment.canTransitionTo('cancelled', 'confirmed')).toBe(false);
    });

    test('should get valid next statuses', () => {
      const appointment = new Appointment();
      
      expect(appointment.getValidNextStatuses('scheduled')).toContain('confirmed');
      expect(appointment.getValidNextStatuses('scheduled')).toContain('cancelled');
      expect(appointment.getValidNextStatuses('confirmed')).toContain('in_progress');
      expect(appointment.getValidNextStatuses('in_progress')).toContain('completed');
    });
  });

  describe('Business Logic', () => {
    test('should check if appointment is in past', () => {
      const pastAppointment = new Appointment();
      pastAppointment.appointment_datetime = new Date(Date.now() - 86400000); // Yesterday
      
      const futureAppointment = new Appointment();
      futureAppointment.appointment_datetime = new Date(Date.now() + 86400000); // Tomorrow
      
      expect(pastAppointment.isInPast()).toBe(true);
      expect(futureAppointment.isInPast()).toBe(false);
    });

    test('should check if appointment can be cancelled', () => {
      const appointment = new Appointment();
      appointment.status = 'scheduled';
      appointment.appointment_datetime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
      
      expect(appointment.canBeCancelled()).toBe(true);
      
      // Too close to appointment time
      appointment.appointment_datetime = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
      expect(appointment.canBeCancelled()).toBe(false);
      
      // Already completed
      appointment.status = 'completed';
      appointment.appointment_datetime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      expect(appointment.canBeCancelled()).toBe(false);
    });

    test('should calculate duration', () => {
      const appointment = new Appointment();
      appointment.duration_minutes = 30;
      
      expect(appointment.getDurationInHours()).toBe(0.5);
      
      appointment.duration_minutes = 90;
      expect(appointment.getDurationInHours()).toBe(1.5);
    });
  });

  describe('Static Methods', () => {
    test('should find appointments by client', async () => {
      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.where.mockResolvedValue([mockAppointment]);
      Appointment.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await Appointment.findByClient(1);

      expect(Appointment.query).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('client_id', 1);
      expect(result).toEqual([mockAppointment]);
    });

    test('should find appointments by provider', async () => {
      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.where.mockResolvedValue([mockAppointment]);
      Appointment.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await Appointment.findByProvider(2);

      expect(Appointment.query).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('provider_id', 2);
      expect(result).toEqual([mockAppointment]);
    });

    test('should find appointments by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.where.mockResolvedValue([mockAppointment]);
      Appointment.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await Appointment.findByDateRange(startDate, endDate);

      expect(Appointment.query).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('appointment_datetime', '>=', startDate);
      expect(result).toEqual([mockAppointment]);
    });

    test('should check time slot availability', async () => {
      const providerId = 2;
      const datetime = new Date();
      const duration = 30;
      
      const mockQueryBuilder = new MockQueryBuilder();
      mockQueryBuilder.first.mockResolvedValue(null); // No conflicting appointment
      Appointment.query = jest.fn().mockReturnValue(mockQueryBuilder);

      const result = await Appointment.isTimeSlotAvailable(providerId, datetime, duration);

      expect(result).toBe(true);
      expect(Appointment.query).toHaveBeenCalled();
    });
  });

  describe('Instance Methods', () => {
    test('should format appointment datetime', () => {
      const appointment = new Appointment();
      appointment.appointment_datetime = new Date('2024-01-15T10:00:00Z');
      
      const formatted = appointment.getFormattedDateTime();
      expect(formatted).toMatch(/2024-01-15.*10:00/);
    });

    test('should get appointment end time', () => {
      const appointment = new Appointment();
      appointment.appointment_datetime = new Date('2024-01-15T10:00:00Z');
      appointment.duration_minutes = 30;
      
      const endTime = appointment.getEndTime();
      expect(endTime.getTime()).toBe(appointment.appointment_datetime.getTime() + 30 * 60 * 1000);
    });

    test('should update status with timestamp', async () => {
      const appointment = new Appointment();
      appointment.$query = jest.fn().mockReturnValue({
        patch: jest.fn().mockResolvedValue(appointment)
      });

      await appointment.updateStatus('confirmed');

      expect(appointment.$query).toHaveBeenCalled();
      expect(appointment.$query().patch).toHaveBeenCalledWith({
        status: 'confirmed',
        status_updated_at: expect.any(Date)
      });
    });
  });

  describe('Validation', () => {
    test('should validate required fields', () => {
      const schema = Appointment.jsonSchema;
      expect(schema.required).toEqual(
        expect.arrayContaining(['client_id', 'provider_id', 'service_id', 'appointment_datetime'])
      );
    });

    test('should validate status enum', () => {
      const schema = Appointment.jsonSchema;
      const validStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
      expect(schema.properties.status.enum).toEqual(expect.arrayContaining(validStatuses));
    });

    test('should validate datetime is in future', () => {
      const appointment = new Appointment();
      const pastDate = new Date(Date.now() - 86400000);
      
      expect(appointment.validateFutureDateTime(pastDate)).toBe(false);
      
      const futureDate = new Date(Date.now() + 86400000);
      expect(appointment.validateFutureDateTime(futureDate)).toBe(true);
    });
  });

  describe('Relationships', () => {
    test('should define client relationship', () => {
      expect(Appointment.relationMappings).toBeDefined();
      expect(Appointment.relationMappings.client).toBeDefined();
      expect(Appointment.relationMappings.client.relation).toBe(Appointment.BelongsToOneRelation);
    });

    test('should define provider relationship', () => {
      expect(Appointment.relationMappings.provider).toBeDefined();
      expect(Appointment.relationMappings.provider.relation).toBe(Appointment.BelongsToOneRelation);
    });

    test('should define service relationship', () => {
      expect(Appointment.relationMappings.service).toBeDefined();
      expect(Appointment.relationMappings.service.relation).toBe(Appointment.BelongsToOneRelation);
    });
  });
});