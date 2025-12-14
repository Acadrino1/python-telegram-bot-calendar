const AppointmentController = require('../../../src/controllers/AppointmentController');
const TestFactory = require('../../utils/test-factory');

// Mock dependencies
jest.mock('../../../src/models/Appointment');
jest.mock('../../../src/models/User');
jest.mock('../../../src/models/Service');
jest.mock('../../../src/services/NotificationService');
jest.mock('../../../src/services/AvailabilityService');

const Appointment = require('../../../src/models/Appointment');
const User = require('../../../src/models/User');
const Service = require('../../../src/services/Service');
const NotificationService = require('../../../src/services/NotificationService');
const AvailabilityService = require('../../../src/services/AvailabilityService');

describe('AppointmentController', () => {
  let appointmentController;
  let req;
  let res;
  let mockUser;
  let mockAppointment;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    appointmentController = new AppointmentController();
    
    mockUser = await TestFactory.createUser();
    mockAppointment = TestFactory.createAppointment({
      client_id: mockUser.id,
      provider_id: 2,
      service_id: 3
    });

    req = {
      user: mockUser,
      params: {},
      query: {},
      body: {},
      headers: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('GET /appointments', () => {
    test('should return appointments for authenticated user', async () => {
      Appointment.findByClient.mockResolvedValue([mockAppointment]);

      req.query = { status: 'scheduled' };

      await appointmentController.getAppointments(req, res);

      expect(Appointment.findByClient).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ status: 'scheduled' })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        appointments: [mockAppointment],
        count: 1,
        filters: { status: 'scheduled' }
      });
    });

    test('should return appointments for provider role', async () => {
      const providerUser = await TestFactory.createProvider();
      req.user = providerUser;

      Appointment.findByProvider.mockResolvedValue([mockAppointment]);

      await appointmentController.getAppointments(req, res);

      expect(Appointment.findByProvider).toHaveBeenCalledWith(
        providerUser.id,
        expect.any(Object)
      );
    });

    test('should handle date range filtering', async () => {
      req.query = {
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      };

      Appointment.findByClient.mockResolvedValue([]);

      await appointmentController.getAppointments(req, res);

      expect(Appointment.findByClient).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-01-31')
        })
      );
    });

    test('should handle database errors', async () => {
      Appointment.findByClient.mockRejectedValue(new Error('Database error'));

      await appointmentController.getAppointments(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve appointments',
        message: expect.any(String)
      });
    });
  });

  describe('POST /appointments', () => {
    test('should create new appointment successfully', async () => {
      req.body = {
        provider_id: 2,
        service_id: 3,
        appointment_datetime: '2024-01-15T10:00:00Z',
        notes: 'Test appointment'
      };

      // Mock availability check
      AvailabilityService.prototype.isTimeSlotAvailable = jest.fn().mockResolvedValue(true);
      
      // Mock service lookup
      Service.findById = jest.fn().mockResolvedValue({ 
        id: 3, 
        duration_minutes: 30,
        price: 100 
      });
      
      // Mock provider lookup
      User.findById = jest.fn().mockResolvedValue({
        id: 2,
        role: 'provider'
      });

      // Mock appointment creation
      Appointment.query = jest.fn().mockReturnValue({
        insertAndFetch: jest.fn().mockResolvedValue(mockAppointment)
      });

      // Mock notification service
      NotificationService.prototype.sendAppointmentConfirmation = jest.fn()
        .mockResolvedValue({ success: true });

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        appointment: mockAppointment,
        message: 'Appointment created successfully'
      });
    });

    test('should reject appointment for unavailable time slot', async () => {
      req.body = {
        provider_id: 2,
        service_id: 3,
        appointment_datetime: '2024-01-15T10:00:00Z'
      };

      AvailabilityService.prototype.isTimeSlotAvailable = jest.fn().mockResolvedValue(false);

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Time slot not available',
        code: 'TIME_SLOT_UNAVAILABLE'
      });
    });

    test('should validate required fields', async () => {
      req.body = {
        provider_id: 2
        // Missing required fields
      };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('validation'),
          details: expect.any(Array)
        })
      );
    });

    test('should reject appointments in the past', async () => {
      req.body = {
        provider_id: 2,
        service_id: 3,
        appointment_datetime: '2020-01-15T10:00:00Z' // Past date
      };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot schedule appointments in the past',
        code: 'INVALID_DATETIME'
      });
    });
  });

  describe('PUT /appointments/:uuid', () => {
    test('should update appointment successfully', async () => {
      req.params.uuid = mockAppointment.uuid;
      req.body = {
        notes: 'Updated notes',
        status: 'confirmed'
      };

      // Mock appointment lookup
      Appointment.findByUuid = jest.fn().mockResolvedValue(mockAppointment);
      
      // Mock update
      mockAppointment.$query = jest.fn().mockReturnValue({
        patchAndFetch: jest.fn().mockResolvedValue({
          ...mockAppointment,
          notes: 'Updated notes',
          status: 'confirmed'
        })
      });

      await appointmentController.updateAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        appointment: expect.objectContaining({
          notes: 'Updated notes',
          status: 'confirmed'
        }),
        message: 'Appointment updated successfully'
      });
    });

    test('should enforce access control', async () => {
      const otherUserAppointment = TestFactory.createAppointment({
        client_id: 999, // Different user
        provider_id: 2
      });

      req.params.uuid = otherUserAppointment.uuid;
      req.body = { notes: 'Should not update' };

      Appointment.findByUuid = jest.fn().mockResolvedValue(otherUserAppointment);

      await appointmentController.updateAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    });

    test('should validate status transitions', async () => {
      req.params.uuid = mockAppointment.uuid;
      req.body = { status: 'completed' };

      mockAppointment.status = 'scheduled';
      mockAppointment.canTransitionTo = jest.fn().mockReturnValue(false);

      Appointment.findByUuid = jest.fn().mockResolvedValue(mockAppointment);

      await appointmentController.updateAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid status transition',
        current_status: 'scheduled',
        requested_status: 'completed'
      });
    });
  });

  describe('DELETE /appointments/:uuid', () => {
    test('should cancel appointment successfully', async () => {
      req.params.uuid = mockAppointment.uuid;
      req.body = { reason: 'Cannot attend' };

      mockAppointment.canBeCancelled = jest.fn().mockReturnValue(true);
      mockAppointment.updateStatus = jest.fn().mockResolvedValue(mockAppointment);

      Appointment.findByUuid = jest.fn().mockResolvedValue(mockAppointment);

      await appointmentController.cancelAppointment(req, res);

      expect(mockAppointment.updateStatus).toHaveBeenCalledWith('cancelled');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        appointment: mockAppointment,
        message: 'Appointment cancelled successfully'
      });
    });

    test('should enforce cancellation policy', async () => {
      req.params.uuid = mockAppointment.uuid;
      req.body = { reason: 'Last minute' };

      mockAppointment.canBeCancelled = jest.fn().mockReturnValue(false);

      Appointment.findByUuid = jest.fn().mockResolvedValue(mockAppointment);

      await appointmentController.cancelAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('cancellation policy'),
        code: 'CANCELLATION_POLICY_VIOLATION'
      });
    });
  });

  describe('GET /appointments/availability', () => {
    test('should return available time slots', async () => {
      req.query = {
        provider_id: '2',
        date: '2024-01-15',
        service_id: '3'
      };

      const mockAvailableSlots = [
        '09:00:00', '09:30:00', '10:00:00', '10:30:00'
      ];

      AvailabilityService.prototype.getAvailableSlots = jest.fn()
        .mockResolvedValue(mockAvailableSlots);

      await appointmentController.getAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        available_slots: mockAvailableSlots,
        date: '2024-01-15',
        provider_id: 2,
        service_id: 3
      });
    });

    test('should handle invalid date format', async () => {
      req.query = {
        provider_id: '2',
        date: 'invalid-date'
      };

      await appointmentController.getAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid date format',
        code: 'INVALID_DATE'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    test('should require authentication', async () => {
      req.user = null;

      await appointmentController.getAppointments(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED'
      });
    });

    test('should handle role-based permissions', async () => {
      const adminUser = await TestFactory.createAdmin();
      req.user = adminUser;

      // Admin should be able to access all appointments
      Appointment.query = jest.fn().mockReturnValue({
        withGraphFetched: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnValue([mockAppointment])
      });

      await appointmentController.getAppointments(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});