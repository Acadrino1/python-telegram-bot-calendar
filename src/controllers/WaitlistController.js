const Joi = require('joi');
const WaitlistEntry = require('../models/WaitlistEntry');
const Service = require('../models/Service');
const User = require('../models/User');
const BookingService = require('../services/BookingService');

class WaitlistController {
  /**
   * Get waitlist entries
   * GET /api/waitlist
   */
  static async getAll(req, res, next) {
    try {
      const { providerId, clientId, serviceId, status, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      let query = WaitlistEntry.query();

      // Apply role-based filtering
      if (req.user.role === 'client') {
        query = query.where('clientId', req.user.userId);
      } else if (req.user.role === 'provider') {
        query = query
          .joinRelated('service')
          .where('service.providerId', req.user.userId);
      }

      // Apply additional filters
      if (providerId) {
        query = query
          .joinRelated('service')
          .where('service.providerId', providerId);
      }
      if (clientId) {
        query = query.where('clientId', clientId);
      }
      if (serviceId) {
        query = query.where('serviceId', serviceId);
      }
      if (status) {
        query = query.where('status', status);
      }

      // Get total count
      const totalQuery = query.clone();
      const total = await totalQuery.resultSize();

      // Get paginated results with relations
      const entries = await query
        .withGraphFetched('[client, service.[provider]]')
        .modifyGraph('client', builder => {
          builder.select('id', 'firstName', 'lastName', 'email', 'phone');
        })
        .modifyGraph('service.provider', builder => {
          builder.select('id', 'firstName', 'lastName', 'email');
        })
        .limit(limit)
        .offset(offset)
        .orderBy('position', 'asc')
        .orderBy('createdAt', 'asc');

      res.json({
        entries,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get waitlist entry by ID
   * GET /api/waitlist/:id
   */
  static async getById(req, res, next) {
    try {
      const entry = await WaitlistEntry.query()
        .findById(req.params.id)
        .withGraphFetched('[client, service.[provider]]')
        .modifyGraph('client', builder => {
          builder.select('id', 'firstName', 'lastName', 'email', 'phone');
        })
        .modifyGraph('service.provider', builder => {
          builder.select('id', 'firstName', 'lastName', 'email');
        });

      if (!entry) {
        return res.status(404).json({ 
          error: 'Waitlist entry not found' 
        });
      }

      // Check access permissions
      if (req.user.role === 'client' && entry.clientId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }
      if (req.user.role === 'provider' && entry.service.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      res.json(entry);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Join waitlist
   * POST /api/waitlist
   */
  static async join(req, res, next) {
    try {
      const schema = Joi.object({
        serviceId: Joi.number().integer().required(),
        preferredDates: Joi.array().items(Joi.date().iso()).min(1).max(5).required(),
        preferredTimes: Joi.object({
          morning: Joi.boolean().default(true),    // 8am-12pm
          afternoon: Joi.boolean().default(true),  // 12pm-5pm
          evening: Joi.boolean().default(true)     // 5pm-8pm
        }).default(),
        notes: Joi.string().max(500),
        notifyByEmail: Joi.boolean().default(true),
        notifyBySms: Joi.boolean().default(false)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Check if service exists
      const service = await Service.query()
        .findById(value.serviceId)
        .withGraphFetched('provider');

      if (!service) {
        return res.status(404).json({ 
          error: 'Service not found' 
        });
      }

      if (!service.isActive) {
        return res.status(400).json({ 
          error: 'Service is not available' 
        });
      }

      // Check if waitlist is enabled for this service
      if (service.bookingRules && !service.bookingRules.allowWaitlist) {
        return res.status(400).json({ 
          error: 'Waitlist is not available for this service' 
        });
      }

      // Check for existing waitlist entry
      const existingEntry = await WaitlistEntry.query()
        .where('clientId', req.user.userId)
        .where('serviceId', value.serviceId)
        .where('status', 'active')
        .first();

      if (existingEntry) {
        return res.status(409).json({ 
          error: 'You are already on the waitlist for this service' 
        });
      }

      // Get current position in waitlist
      const lastEntry = await WaitlistEntry.query()
        .where('serviceId', value.serviceId)
        .where('status', 'active')
        .orderBy('position', 'desc')
        .first();

      const position = lastEntry ? lastEntry.position + 1 : 1;

      // Create waitlist entry
      const entry = await WaitlistEntry.query().insert({
        clientId: req.user.userId,
        serviceId: value.serviceId,
        position,
        preferredDates: value.preferredDates,
        preferredTimes: value.preferredTimes,
        notes: value.notes,
        status: 'active',
        notificationPreferences: {
          email: value.notifyByEmail,
          sms: value.notifyBySms
        }
      });

      // Load relations for response
      await entry.$loadRelated('[client, service.[provider]]');

      res.status(201).json({
        message: 'Successfully joined the waitlist',
        entry: {
          ...entry,
          estimatedWaitTime: await this.estimateWaitTime(value.serviceId, position)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update waitlist preferences
   * PUT /api/waitlist/:id
   */
  static async update(req, res, next) {
    try {
      const entryId = req.params.id;

      // Get existing entry
      const entry = await WaitlistEntry.query()
        .findById(entryId)
        .withGraphFetched('service');

      if (!entry) {
        return res.status(404).json({ 
          error: 'Waitlist entry not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'client' && entry.clientId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }
      if (req.user.role === 'provider' && entry.service.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schema = Joi.object({
        preferredDates: Joi.array().items(Joi.date().iso()).min(1).max(5),
        preferredTimes: Joi.object({
          morning: Joi.boolean(),
          afternoon: Joi.boolean(),
          evening: Joi.boolean()
        }),
        notes: Joi.string().max(500),
        notifyByEmail: Joi.boolean(),
        notifyBySms: Joi.boolean(),
        status: req.user.role === 'admin' ? 
          Joi.string().valid('active', 'contacted', 'booked', 'expired', 'cancelled') : 
          Joi.forbidden()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Prepare update data
      const updateData = {
        updatedAt: new Date()
      };

      if (value.preferredDates) updateData.preferredDates = value.preferredDates;
      if (value.preferredTimes) updateData.preferredTimes = value.preferredTimes;
      if (value.notes !== undefined) updateData.notes = value.notes;
      if (value.status) updateData.status = value.status;

      if (value.notifyByEmail !== undefined || value.notifyBySms !== undefined) {
        updateData.notificationPreferences = {
          email: value.notifyByEmail ?? entry.notificationPreferences?.email,
          sms: value.notifyBySms ?? entry.notificationPreferences?.sms
        };
      }

      // Update entry
      const updatedEntry = await WaitlistEntry.query()
        .patchAndFetchById(entryId, updateData)
        .withGraphFetched('[client, service.[provider]]');

      res.json({
        message: 'Waitlist preferences updated successfully',
        entry: updatedEntry
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Leave waitlist
   * DELETE /api/waitlist/:id
   */
  static async leave(req, res, next) {
    try {
      const entryId = req.params.id;

      // Get existing entry
      const entry = await WaitlistEntry.query()
        .findById(entryId)
        .withGraphFetched('service');

      if (!entry) {
        return res.status(404).json({ 
          error: 'Waitlist entry not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'client' && entry.clientId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      // Update status to cancelled
      await WaitlistEntry.query()
        .findById(entryId)
        .patch({
          status: 'cancelled',
          updatedAt: new Date()
        });

      // Update positions for remaining entries
      await WaitlistEntry.query()
        .where('serviceId', entry.serviceId)
        .where('position', '>', entry.position)
        .where('status', 'active')
        .decrement('position', 1);

      res.json({
        message: 'Successfully removed from waitlist'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get waitlist position
   * GET /api/waitlist/:id/position
   */
  static async getPosition(req, res, next) {
    try {
      const entry = await WaitlistEntry.query()
        .findById(req.params.id)
        .withGraphFetched('service');

      if (!entry) {
        return res.status(404).json({ 
          error: 'Waitlist entry not found' 
        });
      }

      // Check permissions
      if (req.user.role === 'client' && entry.clientId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      // Get current position (in case it changed)
      const activeEntriesBefore = await WaitlistEntry.query()
        .where('serviceId', entry.serviceId)
        .where('status', 'active')
        .where('position', '<', entry.position)
        .count('id as count')
        .first();

      const currentPosition = (activeEntriesBefore?.count || 0) + 1;

      // Get total active entries
      const totalActive = await WaitlistEntry.query()
        .where('serviceId', entry.serviceId)
        .where('status', 'active')
        .count('id as count')
        .first();

      res.json({
        entryId: entry.id,
        currentPosition,
        totalInWaitlist: totalActive?.count || 0,
        estimatedWaitTime: await this.estimateWaitTime(entry.serviceId, currentPosition),
        status: entry.status
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process waitlist (provider/admin only)
   * POST /api/waitlist/process
   */
  static async processWaitlist(req, res, next) {
    try {
      // Only providers and admins can process waitlist
      if (!['provider', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schema = Joi.object({
        serviceId: Joi.number().integer().required(),
        availableSlot: Joi.date().iso().required(),
        maxContacts: Joi.number().integer().min(1).max(10).default(3)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Check service ownership
      const service = await Service.query().findById(value.serviceId);
      if (!service) {
        return res.status(404).json({ 
          error: 'Service not found' 
        });
      }

      if (req.user.role === 'provider' && service.providerId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied to this service' 
        });
      }

      // Get eligible waitlist entries
      const slotDate = new Date(value.availableSlot);
      const slotDateOnly = slotDate.toISOString().split('T')[0];
      const slotHour = slotDate.getHours();

      let timePreference = 'morning';
      if (slotHour >= 12 && slotHour < 17) timePreference = 'afternoon';
      else if (slotHour >= 17) timePreference = 'evening';

      const eligibleEntries = await WaitlistEntry.query()
        .where('serviceId', value.serviceId)
        .where('status', 'active')
        .whereRaw('JSON_CONTAINS(preferredDates, ?)', [JSON.stringify(slotDateOnly)])
        .whereRaw(`JSON_EXTRACT(preferredTimes, '$.${timePreference}') = true`)
        .orderBy('position', 'asc')
        .limit(value.maxContacts)
        .withGraphFetched('[client]');

      // Contact eligible clients
      const contacted = [];
      for (const entry of eligibleEntries) {
        // Update status to contacted
        await WaitlistEntry.query()
          .findById(entry.id)
          .patch({
            status: 'contacted',
            contactedAt: new Date(),
            offeredSlot: value.availableSlot,
            updatedAt: new Date()
          });

        // Send notification (in production, would actually send email/SMS)
        // await NotificationService.sendWaitlistNotification(entry.client, service, value.availableSlot);

        contacted.push({
          entryId: entry.id,
          client: `${entry.client.firstName} ${entry.client.lastName}`,
          email: entry.client.email
        });
      }

      res.json({
        message: `Successfully contacted ${contacted.length} clients from waitlist`,
        contacted,
        availableSlot: value.availableSlot
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get waitlist statistics (provider/admin only)
   * GET /api/waitlist/stats
   */
  static async getStatistics(req, res, next) {
    try {
      // Only providers and admins can view statistics
      if (!['provider', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const { serviceId } = req.query;

      let query = WaitlistEntry.query();

      // Filter by service if specified
      if (serviceId) {
        const service = await Service.query().findById(serviceId);
        if (!service) {
          return res.status(404).json({ 
            error: 'Service not found' 
          });
        }

        // Check ownership for providers
        if (req.user.role === 'provider' && service.providerId !== req.user.userId) {
          return res.status(403).json({ 
            error: 'Access denied to this service' 
          });
        }

        query = query.where('serviceId', serviceId);
      } else if (req.user.role === 'provider') {
        // Filter by provider's services
        query = query
          .joinRelated('service')
          .where('service.providerId', req.user.userId);
      }

      // Get statistics by status
      const byStatus = await query.clone()
        .select('status')
        .count('* as count')
        .groupBy('status');

      // Get average wait time for booked entries
      const avgWaitTime = await query.clone()
        .where('status', 'booked')
        .whereNotNull('contactedAt')
        .avg(WaitlistEntry.raw('TIMESTAMPDIFF(HOUR, createdAt, contactedAt) as avgHours'))
        .first();

      // Get conversion rate
      const totalContacted = await query.clone()
        .where('status', 'contacted')
        .orWhere('status', 'booked')
        .count('* as total')
        .first();

      const totalBooked = await query.clone()
        .where('status', 'booked')
        .count('* as booked')
        .first();

      const conversionRate = totalContacted?.total > 0 
        ? (totalBooked?.booked / totalContacted.total) * 100 
        : 0;

      res.json({
        byStatus,
        averageWaitTimeHours: avgWaitTime?.avgHours || 0,
        conversionRate: Math.round(conversionRate * 100) / 100
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper: Estimate wait time based on position
   */
  static async estimateWaitTime(serviceId, position) {
    // Get average appointments per week for this service
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const appointmentsLastMonth = await Service.query()
      .findById(serviceId)
      .$relatedQuery('appointments')
      .where('createdAt', '>', lastMonth)
      .where('status', 'completed')
      .count('* as count')
      .first();

    const avgPerWeek = (appointmentsLastMonth?.count || 0) / 4;

    if (avgPerWeek === 0) {
      return 'Unable to estimate';
    }

    const estimatedWeeks = Math.ceil(position / avgPerWeek);
    
    if (estimatedWeeks <= 1) return 'Less than 1 week';
    if (estimatedWeeks <= 2) return '1-2 weeks';
    if (estimatedWeeks <= 4) return '2-4 weeks';
    return 'More than 4 weeks';
  }
}

module.exports = WaitlistController;