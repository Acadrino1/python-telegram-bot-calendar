const Joi = require('joi');
const moment = require('moment-timezone');
const AvailabilityService = require('../services/AvailabilityService');
const User = require('../models/User');

class AvailabilityController {

  static async getAvailableSlots(req, res, next) {
    try {
      const { providerId, date } = req.params;
      const { serviceId, timezone = 'America/New_York' } = req.query;

      // Validate date format
      if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
        return res.status(400).json({ 
          error: 'Invalid date format. Use YYYY-MM-DD' 
        });
      }

      // Check if provider exists
      const provider = await User.query()
        .findById(providerId)
        .where('role', 'provider');

      if (!provider) {
        return res.status(404).json({ 
          error: 'Provider not found' 
        });
      }

      // Get available slots
      const slots = await AvailabilityService.getAvailableSlots(
        providerId,
        date,
        serviceId,
        timezone
      );

      res.json({
        providerId,
        date,
        timezone,
        slots
      });
    } catch (error) {
      next(error);
    }
  }

  static async getSchedule(req, res, next) {
    try {
      const { providerId } = req.params;

      // Check permissions - providers can only view their own schedule
      if (req.user.role === 'provider' && req.user.userId !== parseInt(providerId)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schedule = await AvailabilityService.getProviderSchedule(providerId);

      if (!schedule) {
        return res.status(404).json({ 
          error: 'Schedule not found' 
        });
      }

      res.json(schedule);
    } catch (error) {
      next(error);
    }
  }

  static async createOrUpdateSchedule(req, res, next) {
    try {
      // Only providers and admins can manage schedules
      if (!['provider', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schema = Joi.object({
        providerId: Joi.number().integer(),
        timezone: Joi.string().default('America/New_York'),
        regularHours: Joi.object({
          monday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })),
          tuesday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })),
          wednesday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })),
          thursday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })),
          friday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })),
          saturday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })),
          sunday: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          }))
        }).required(),
        slotDuration: Joi.number().valid(15, 30, 45, 60).default(30),
        bufferTime: Joi.number().min(0).max(60).default(0)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Set provider ID
      const providerId = req.user.role === 'admin' && value.providerId 
        ? value.providerId 
        : req.user.userId;

      // Create or update schedule
      const schedule = await AvailabilityService.setProviderSchedule(
        providerId,
        value.regularHours,
        value.timezone,
        value.slotDuration,
        value.bufferTime
      );

      res.json({
        message: 'Schedule updated successfully',
        schedule
      });
    } catch (error) {
      next(error);
    }
  }

  static async addException(req, res, next) {
    try {
      // Only providers and admins can add exceptions
      if (!['provider', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schema = Joi.object({
        providerId: Joi.number().integer(),
        date: Joi.date().iso().required(),
        type: Joi.string().valid('unavailable', 'special_hours').required(),
        hours: Joi.when('type', {
          is: 'special_hours',
          then: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          })).required(),
          otherwise: Joi.forbidden()
        }),
        reason: Joi.string(),
        recurring: Joi.boolean().default(false),
        recurringEndDate: Joi.when('recurring', {
          is: true,
          then: Joi.date().iso().greater(Joi.ref('date')).required(),
          otherwise: Joi.forbidden()
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Set provider ID
      const providerId = req.user.role === 'admin' && value.providerId 
        ? value.providerId 
        : req.user.userId;

      // Add exception
      const exception = await AvailabilityService.addException(
        providerId,
        value.date,
        value.type,
        value.hours,
        value.reason,
        value.recurring,
        value.recurringEndDate
      );

      res.status(201).json({
        message: 'Exception added successfully',
        exception
      });
    } catch (error) {
      next(error);
    }
  }

  static async removeException(req, res, next) {
    try {
      const { id } = req.params;

      // Get exception to check permissions
      const exception = await AvailabilityService.getException(id);
      if (!exception) {
        return res.status(404).json({ 
          error: 'Exception not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'provider' && exception.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      await AvailabilityService.removeException(id);

      res.json({
        message: 'Exception removed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  static async getExceptions(req, res, next) {
    try {
      const { providerId } = req.params;
      const { startDate, endDate } = req.query;

      // Check permissions
      if (req.user.role === 'provider' && req.user.userId !== parseInt(providerId)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const exceptions = await AvailabilityService.getProviderExceptions(
        providerId,
        startDate,
        endDate
      );

      res.json(exceptions);
    } catch (error) {
      next(error);
    }
  }

  static async checkAvailability(req, res, next) {
    try {
      const schema = Joi.object({
        providerId: Joi.number().integer().required(),
        serviceId: Joi.number().integer().required(),
        dateTime: Joi.date().iso().required(),
        timezone: Joi.string().default('America/New_York')
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      const isAvailable = await AvailabilityService.checkSlotAvailability(
        value.providerId,
        value.serviceId,
        value.dateTime,
        value.timezone
      );

      res.json({
        available: isAvailable,
        ...value
      });
    } catch (error) {
      next(error);
    }
  }

  static async getNextAvailable(req, res, next) {
    try {
      const { providerId, serviceId } = req.params;
      const { timezone = 'America/New_York', days = 30 } = req.query;

      const nextSlot = await AvailabilityService.findNextAvailableSlot(
        providerId,
        serviceId,
        timezone,
        parseInt(days)
      );

      if (!nextSlot) {
        return res.status(404).json({ 
          error: 'No available slots found in the next ' + days + ' days' 
        });
      }

      res.json({
        providerId,
        serviceId,
        nextAvailable: nextSlot,
        timezone
      });
    } catch (error) {
      next(error);
    }
  }

  static async bulkUpdate(req, res, next) {
    try {
      // Only admins can bulk update
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Only administrators can perform bulk updates' 
        });
      }

      const schema = Joi.object({
        providerId: Joi.number().integer().required(),
        updates: Joi.array().items(Joi.object({
          date: Joi.date().iso().required(),
          type: Joi.string().valid('available', 'unavailable', 'special_hours').required(),
          hours: Joi.array().items(Joi.object({
            start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
            end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
          }))
        })).min(1).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      const results = await AvailabilityService.bulkUpdateAvailability(
        value.providerId,
        value.updates
      );

      res.json({
        message: 'Bulk update completed',
        results
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AvailabilityController;