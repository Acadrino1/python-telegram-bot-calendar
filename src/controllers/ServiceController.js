const Joi = require('joi');
const Service = require('../models/Service');

class ServiceController {

  static async getAll(req, res, next) {
    try {
      // Parse query parameters
      const { providerId, isActive, category } = req.query;

      let query = Service.query();

      // Apply filters
      if (providerId) {
        query = query.where('providerId', providerId);
      }
      if (isActive !== undefined) {
        query = query.where('isActive', isActive === 'true');
      }
      if (category) {
        query = query.where('category', category);
      }

      // Include provider information if requested
      if (req.query.includeProvider === 'true') {
        query = query.withGraphFetched('provider');
      }

      const services = await query.orderBy('name');

      res.json(services);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const service = await Service.query()
        .findById(req.params.id)
        .withGraphFetched('[provider, appointments]');

      if (!service) {
        return res.status(404).json({ 
          error: 'Service not found' 
        });
      }

      // Check access permissions
      if (req.user.role === 'provider' && service.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      res.json(service);
    } catch (error) {
      next(error);
    }
  }

  static async create(req, res, next) {
    try {
      // Only providers and admins can create services
      if (!['provider', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Only providers and admins can create services' 
        });
      }

      // Validation schema
      const schema = Joi.object({
        name: Joi.string().required(),
        description: Joi.string().required(),
        duration: Joi.number().min(15).max(480).required(), // 15 min to 8 hours
        price: Joi.number().min(0).required(),
        category: Joi.string(),
        maxConcurrent: Joi.number().min(1).default(1),
        bufferTime: Joi.number().min(0).default(0),
        isActive: Joi.boolean().default(true),
        bookingRules: Joi.object({
          advanceBookingDays: Joi.number().min(1).max(365),
          minAdvanceHours: Joi.number().min(0),
          maxBookingsPerDay: Joi.number().min(1),
          allowWaitlist: Joi.boolean(),
          requiresApproval: Joi.boolean(),
          cancellationHours: Joi.number().min(0)
        }).default()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Set provider ID
      const providerId = req.user.role === 'admin' && req.body.providerId 
        ? req.body.providerId 
        : req.user.userId;

      // Create service
      const service = await Service.query().insert({
        ...value,
        providerId
      });

      res.status(201).json({
        message: 'Service created successfully',
        service
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req, res, next) {
    try {
      const serviceId = req.params.id;

      // Get existing service
      const existingService = await Service.query().findById(serviceId);
      if (!existingService) {
        return res.status(404).json({ 
          error: 'Service not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'provider' && existingService.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      // Validation schema
      const schema = Joi.object({
        name: Joi.string(),
        description: Joi.string(),
        duration: Joi.number().min(15).max(480),
        price: Joi.number().min(0),
        category: Joi.string(),
        maxConcurrent: Joi.number().min(1),
        bufferTime: Joi.number().min(0),
        isActive: Joi.boolean(),
        bookingRules: Joi.object({
          advanceBookingDays: Joi.number().min(1).max(365),
          minAdvanceHours: Joi.number().min(0),
          maxBookingsPerDay: Joi.number().min(1),
          allowWaitlist: Joi.boolean(),
          requiresApproval: Joi.boolean(),
          cancellationHours: Joi.number().min(0)
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Update service
      const service = await Service.query()
        .patchAndFetchById(serviceId, {
          ...value,
          updatedAt: new Date()
        });

      res.json({
        message: 'Service updated successfully',
        service
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req, res, next) {
    try {
      const serviceId = req.params.id;

      // Get existing service
      const existingService = await Service.query().findById(serviceId);
      if (!existingService) {
        return res.status(404).json({ 
          error: 'Service not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'provider' && existingService.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      // Check for existing appointments
      const appointmentCount = await existingService
        .$relatedQuery('appointments')
        .where('status', 'scheduled')
        .orWhere('status', 'confirmed')
        .count('id as count')
        .first();

      if (appointmentCount && appointmentCount.count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete service with active appointments' 
        });
      }

      // Soft delete by deactivating
      await Service.query()
        .findById(serviceId)
        .patch({ 
          isActive: false,
          updatedAt: new Date()
        });

      res.json({
        message: 'Service deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStats(req, res, next) {
    try {
      const serviceId = req.params.id;

      // Get service
      const service = await Service.query().findById(serviceId);
      if (!service) {
        return res.status(404).json({ 
          error: 'Service not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'provider' && service.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      // Get appointment statistics
      const stats = await service.$relatedQuery('appointments')
        .select('status')
        .count('* as count')
        .groupBy('status');

      // Calculate revenue
      const revenue = await service.$relatedQuery('appointments')
        .where('status', 'completed')
        .sum('price as total')
        .first();

      // Get upcoming appointments count
      const upcoming = await service.$relatedQuery('appointments')
        .where('status', 'scheduled')
        .orWhere('status', 'confirmed')
        .where('scheduledStart', '>', new Date())
        .count('* as count')
        .first();

      res.json({
        service: {
          id: service.id,
          name: service.name,
          price: service.price,
          duration: service.duration
        },
        statistics: {
          appointments: stats,
          totalRevenue: revenue?.total || 0,
          upcomingAppointments: upcoming?.count || 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProvidersByCategory(req, res, next) {
    try {
      const { category } = req.params;

      const services = await Service.query()
        .where('category', category)
        .where('isActive', true)
        .withGraphFetched('provider')
        .modifyGraph('provider', builder => {
          builder.select('id', 'firstName', 'lastName', 'email');
        })
        .select('id', 'name', 'providerId')
        .distinct('providerId');

      // Group by provider
      const providers = {};
      services.forEach(service => {
        if (!providers[service.providerId]) {
          providers[service.providerId] = {
            ...service.provider,
            services: []
          };
        }
        providers[service.providerId].services.push({
          id: service.id,
          name: service.name
        });
      });

      res.json(Object.values(providers));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ServiceController;