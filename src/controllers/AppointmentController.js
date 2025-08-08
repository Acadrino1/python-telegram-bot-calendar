const express = require('express');
const router = express.Router();
const Joi = require('joi');
const moment = require('moment-timezone');

const Appointment = require('../models/Appointment');
const BookingService = require('../services/BookingService');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { checkAppointmentAccess, providerOrAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// Validation schemas
const bookAppointmentSchema = Joi.object({
  provider_id: Joi.number().integer().positive().required(),
  service_id: Joi.number().integer().positive().required(),
  appointment_datetime: Joi.string().isoDate().required(),
  notes: Joi.string().max(1000).allow('', null),
  timezone: Joi.string().default('America/New_York')
});

const updateAppointmentSchema = Joi.object({
  appointment_datetime: Joi.string().isoDate(),
  notes: Joi.string().max(1000).allow('', null),
  status: Joi.string().valid('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'),
  provider_notes: Joi.string().max(1000).allow('', null),
  timezone: Joi.string().default('America/New_York')
});

const cancelAppointmentSchema = Joi.object({
  reason: Joi.string().max(500).allow('', null)
});

/**
 * @route   GET /api/appointments
 * @desc    Get appointments for the authenticated user
 * @access  Private
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    status,
    start_date,
    end_date,
    provider_id,
    service_id,
    page = 1,
    limit = 20,
    sort_by = 'appointment_datetime',
    sort_order = 'asc'
  } = req.query;

  const user = req.user;
  let query = Appointment.query().withGraphFetched('[client, provider, service]');

  // Filter by user role
  if (user.role === 'client') {
    query = query.where('client_id', user.id);
  } else if (user.role === 'provider') {
    query = query.where('provider_id', user.id);
  }
  // Admin can see all appointments (no additional filter)

  // Apply filters
  if (status) {
    const statusList = Array.isArray(status) ? status : [status];
    query = query.where('status', 'in', statusList);
  }

  if (start_date) {
    query = query.where('appointment_datetime', '>=', moment(start_date).format('YYYY-MM-DD HH:mm:ss'));
  }

  if (end_date) {
    query = query.where('appointment_datetime', '<=', moment(end_date).format('YYYY-MM-DD HH:mm:ss'));
  }

  if (provider_id) {
    query = query.where('provider_id', provider_id);
  }

  if (service_id) {
    query = query.where('service_id', service_id);
  }

  // Apply sorting
  const validSortFields = ['appointment_datetime', 'created_at', 'status'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'appointment_datetime';
  const sortDirection = ['asc', 'desc'].includes(sort_order.toLowerCase()) ? sort_order : 'asc';
  
  query = query.orderBy(sortField, sortDirection);

  // Apply pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const totalQuery = query.clone().count('* as total');
  const appointments = await query.limit(parseInt(limit)).offset(offset);
  const totalResult = await totalQuery;
  const total = parseInt(totalResult[0].total);

  logger.info('Appointments retrieved', {
    userId: user.id,
    userRole: user.role,
    count: appointments.length,
    filters: { status, start_date, end_date, provider_id, service_id }
  });

  res.json({
    appointments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
}));

/**
 * @route   GET /api/appointments/:uuid
 * @desc    Get a specific appointment
 * @access  Private
 */
router.get('/:uuid', checkAppointmentAccess, asyncHandler(async (req, res) => {
  const appointment = await Appointment.query()
    .findOne('uuid', req.params.uuid)
    .withGraphFetched('[client, provider, service, history.changedBy]');

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  logger.info('Appointment retrieved', {
    appointmentId: appointment.id,
    userId: req.user.id,
    userRole: req.user.role
  });

  res.json({ appointment });
}));

/**
 * @route   POST /api/appointments
 * @desc    Book a new appointment
 * @access  Private (Clients only)
 */
router.post('/', asyncHandler(async (req, res) => {
  // Only clients can book appointments
  if (req.user.role !== 'client') {
    return res.status(403).json({
      error: 'Only clients can book appointments',
      code: 'CLIENT_ONLY'
    });
  }

  const { error, value } = bookAppointmentSchema.validate(req.body);
  if (error) {
    throw new ValidationError('Invalid appointment data', error.details);
  }

  const bookingData = {
    ...value,
    client_id: req.user.id
  };

  const result = await BookingService.bookAppointment(bookingData);

  logger.logBookingAttempt(
    req.user.id,
    value.provider_id,
    value.service_id,
    value.appointment_datetime,
    result.success,
    result.reason
  );

  if (result.success) {
    res.status(201).json({
      message: result.message,
      appointment: result.appointment
    });
  } else {
    const statusCode = result.reason === 'slot_unavailable' ? 409 : 400;
    res.status(statusCode).json({
      error: result.message,
      code: result.reason,
      waitlist_added: result.waitlist_added,
      waitlist_entry: result.waitlist_entry
    });
  }
}));

/**
 * @route   PUT /api/appointments/:uuid
 * @desc    Update an appointment
 * @access  Private
 */
router.put('/:uuid', checkAppointmentAccess, asyncHandler(async (req, res) => {
  const { error, value } = updateAppointmentSchema.validate(req.body);
  if (error) {
    throw new ValidationError('Invalid update data', error.details);
  }

  const appointment = req.appointment;
  const updateData = value;

  // Handle different types of updates
  if (updateData.appointment_datetime && updateData.appointment_datetime !== appointment.appointment_datetime) {
    // Reschedule appointment
    const result = await BookingService.rescheduleAppointment(
      appointment.uuid,
      updateData.appointment_datetime,
      req.user.id,
      updateData.timezone
    );

    if (result.success) {
      logger.logAppointmentAction('rescheduled', appointment.id, req.user.id, {
        old_datetime: result.old_datetime,
        new_datetime: result.appointment.appointment_datetime
      });

      res.json({
        message: result.message,
        appointment: result.appointment
      });
    } else {
      return res.status(409).json({
        error: result.message,
        code: result.reason
      });
    }

  } else if (updateData.status) {
    // Status change
    let result;

    switch (updateData.status) {
      case 'confirmed':
        result = await BookingService.confirmAppointment(appointment.uuid, req.user.id);
        break;
      
      case 'completed':
        result = await BookingService.completeAppointment(
          appointment.uuid, 
          req.user.id, 
          updateData.provider_notes
        );
        break;

      default:
        // For other status updates, update directly
        await appointment.$query().patch({ 
          status: updateData.status,
          provider_notes: updateData.provider_notes || appointment.provider_notes,
          notes: updateData.notes || appointment.notes
        });
        
        const updatedAppointment = await Appointment.query()
          .findById(appointment.id)
          .withGraphFetched('[client, provider, service]');
        
        result = { success: true, appointment: updatedAppointment };
    }

    if (result.success) {
      logger.logAppointmentAction('status_updated', appointment.id, req.user.id, {
        new_status: updateData.status
      });

      res.json({
        message: result.message || 'Appointment updated successfully',
        appointment: result.appointment
      });
    } else {
      return res.status(400).json({
        error: result.message,
        code: 'UPDATE_FAILED'
      });
    }

  } else {
    // Simple field updates
    const allowedUpdates = ['notes'];
    if (req.user.role === 'provider' || req.user.role === 'admin') {
      allowedUpdates.push('provider_notes');
    }

    const updates = {};
    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        code: 'NO_UPDATES'
      });
    }

    await appointment.$query().patch(updates);
    
    const updatedAppointment = await Appointment.query()
      .findById(appointment.id)
      .withGraphFetched('[client, provider, service]');

    logger.logAppointmentAction('updated', appointment.id, req.user.id, updates);

    res.json({
      message: 'Appointment updated successfully',
      appointment: updatedAppointment
    });
  }
}));

/**
 * @route   DELETE /api/appointments/:uuid
 * @desc    Cancel an appointment
 * @access  Private
 */
router.delete('/:uuid', checkAppointmentAccess, asyncHandler(async (req, res) => {
  const { error, value } = cancelAppointmentSchema.validate(req.body);
  if (error) {
    throw new ValidationError('Invalid cancellation data', error.details);
  }

  const appointment = req.appointment;

  const result = await BookingService.cancelAppointment(
    appointment.uuid,
    req.user.id,
    value.reason
  );

  if (result.success) {
    logger.logAppointmentAction('cancelled', appointment.id, req.user.id, {
      reason: value.reason
    });

    res.json({
      message: result.message,
      appointment: result.appointment
    });
  } else {
    return res.status(400).json({
      error: result.message,
      code: 'CANCELLATION_FAILED'
    });
  }
}));

/**
 * @route   GET /api/appointments/:uuid/history
 * @desc    Get appointment history
 * @access  Private
 */
router.get('/:uuid/history', checkAppointmentAccess, asyncHandler(async (req, res) => {
  const AppointmentHistory = require('../models/AppointmentHistory');
  
  const history = await AppointmentHistory.findByAppointment(req.appointment.id);

  res.json({ history });
}));

/**
 * @route   POST /api/appointments/:uuid/confirm
 * @desc    Confirm an appointment
 * @access  Private (Providers and Admins)
 */
router.post('/:uuid/confirm', checkAppointmentAccess, providerOrAdmin, asyncHandler(async (req, res) => {
  const appointment = req.appointment;

  const result = await BookingService.confirmAppointment(appointment.uuid, req.user.id);

  if (result.success) {
    logger.logAppointmentAction('confirmed', appointment.id, req.user.id);

    res.json({
      message: result.message,
      appointment: result.appointment
    });
  } else {
    return res.status(400).json({
      error: result.message,
      code: 'CONFIRMATION_FAILED'
    });
  }
}));

/**
 * @route   POST /api/appointments/:uuid/start
 * @desc    Start an appointment
 * @access  Private (Providers and Admins)
 */
router.post('/:uuid/start', checkAppointmentAccess, providerOrAdmin, asyncHandler(async (req, res) => {
  const appointment = req.appointment;

  await appointment.start();
  
  const updatedAppointment = await Appointment.query()
    .findById(appointment.id)
    .withGraphFetched('[client, provider, service]');

  logger.logAppointmentAction('started', appointment.id, req.user.id);

  res.json({
    message: 'Appointment started successfully',
    appointment: updatedAppointment
  });
}));

/**
 * @route   POST /api/appointments/:uuid/complete
 * @desc    Complete an appointment
 * @access  Private (Providers and Admins)
 */
router.post('/:uuid/complete', checkAppointmentAccess, providerOrAdmin, asyncHandler(async (req, res) => {
  const { provider_notes } = req.body;
  const appointment = req.appointment;

  const result = await BookingService.completeAppointment(
    appointment.uuid,
    req.user.id,
    provider_notes
  );

  if (result.success) {
    logger.logAppointmentAction('completed', appointment.id, req.user.id, {
      provider_notes: provider_notes ? 'added' : 'none'
    });

    res.json({
      message: result.message,
      appointment: result.appointment
    });
  } else {
    return res.status(400).json({
      error: result.message,
      code: 'COMPLETION_FAILED'
    });
  }
}));

/**
 * @route   POST /api/appointments/:uuid/no-show
 * @desc    Mark appointment as no-show
 * @access  Private (Providers and Admins)
 */
router.post('/:uuid/no-show', checkAppointmentAccess, providerOrAdmin, asyncHandler(async (req, res) => {
  const appointment = req.appointment;

  await appointment.markNoShow();
  
  const updatedAppointment = await Appointment.query()
    .findById(appointment.id)
    .withGraphFetched('[client, provider, service]');

  logger.logAppointmentAction('no_show', appointment.id, req.user.id);

  res.json({
    message: 'Appointment marked as no-show',
    appointment: updatedAppointment
  });
}));

module.exports = router;