const Joi = require('joi');
const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');
const NotificationService = require('../services/NotificationService');
const User = require('../models/User');

class NotificationController {
  /**
   * Get notifications
   * GET /api/notifications
   */
  static async getAll(req, res, next) {
    try {
      const { userId, type, status, channel, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      let query = Notification.query();

      // Apply role-based filtering
      if (req.user.role === 'client') {
        query = query.where('userId', req.user.userId);
      } else if (req.user.role === 'provider') {
        // Providers can see notifications for their clients
        query = query
          .joinRelated('appointment.provider')
          .where('appointment:provider.id', req.user.userId)
          .orWhere('userId', req.user.userId);
      }

      // Apply additional filters
      if (userId && req.user.role === 'admin') {
        query = query.where('userId', userId);
      }
      if (type) {
        query = query.where('type', type);
      }
      if (status) {
        query = query.where('status', status);
      }
      if (channel) {
        query = query.where('channel', channel);
      }

      // Get total count
      const totalQuery = query.clone();
      const total = await totalQuery.resultSize();

      // Get paginated results
      const notifications = await query
        .withGraphFetched('[user, appointment]')
        .modifyGraph('user', builder => {
          builder.select('id', 'firstName', 'lastName', 'email');
        })
        .limit(limit)
        .offset(offset)
        .orderBy('scheduledFor', 'desc')
        .orderBy('createdAt', 'desc');

      res.json({
        notifications,
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
   * Get notification by ID
   * GET /api/notifications/:id
   */
  static async getById(req, res, next) {
    try {
      const notification = await Notification.query()
        .findById(req.params.id)
        .withGraphFetched('[user, appointment.[client, provider, service]]');

      if (!notification) {
        return res.status(404).json({ 
          error: 'Notification not found' 
        });
      }

      // Check access permissions
      if (req.user.role === 'client' && notification.userId !== req.user.userId) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      res.json(notification);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create manual notification (admin/provider only)
   * POST /api/notifications
   */
  static async create(req, res, next) {
    try {
      // Only providers and admins can create manual notifications
      if (!['provider', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schema = Joi.object({
        userId: Joi.number().integer().required(),
        type: Joi.string().valid(
          'appointment_confirmation',
          'appointment_reminder',
          'appointment_cancelled',
          'appointment_rescheduled',
          'custom'
        ).required(),
        channel: Joi.string().valid('email', 'sms', 'both').required(),
        subject: Joi.string().when('type', {
          is: 'custom',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        content: Joi.string().when('type', {
          is: 'custom',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        appointmentId: Joi.number().integer(),
        scheduledFor: Joi.date().iso().default(() => new Date()),
        priority: Joi.string().valid('high', 'normal', 'low').default('normal')
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Verify user exists
      const user = await User.query().findById(value.userId);
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Check provider permissions
      if (req.user.role === 'provider') {
        // Providers can only send to their clients
        const isClient = await req.user
          .$relatedQuery('appointmentsAsProvider')
          .where('clientId', value.userId)
          .first();

        if (!isClient) {
          return res.status(403).json({ 
            error: 'You can only send notifications to your clients' 
          });
        }
      }

      // If using template, get template content
      let subject = value.subject;
      let content = value.content;

      if (value.type !== 'custom') {
        const template = await NotificationTemplate.query()
          .where('type', value.type)
          .where('channel', value.channel === 'both' ? 'email' : value.channel)
          .where('isActive', true)
          .first();

        if (template) {
          subject = template.subject || subject;
          content = template.content || content;

          // Replace placeholders if appointment provided
          if (value.appointmentId) {
            const appointment = await Appointment.query()
              .findById(value.appointmentId)
              .withGraphFetched('[client, provider, service]');

            if (appointment) {
              const replacements = {
                clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
                providerName: `${appointment.provider.firstName} ${appointment.provider.lastName}`,
                serviceName: appointment.service.name,
                appointmentDate: appointment.scheduledStart.toLocaleDateString(),
                appointmentTime: appointment.scheduledStart.toLocaleTimeString()
              };

              for (const [key, val] of Object.entries(replacements)) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                subject = subject?.replace(regex, val);
                content = content?.replace(regex, val);
              }
            }
          }
        }
      }

      // Create notification
      const notification = await Notification.query().insert({
        userId: value.userId,
        type: value.type,
        channel: value.channel,
        subject,
        content,
        appointmentId: value.appointmentId,
        scheduledFor: value.scheduledFor,
        status: 'pending',
        priority: value.priority
      });

      // Send immediately if scheduled for now
      if (new Date(value.scheduledFor) <= new Date()) {
        await NotificationService.processNotification(notification.id);
      }

      res.status(201).json({
        message: 'Notification created successfully',
        notification
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend notification
   * POST /api/notifications/:id/resend
   */
  static async resend(req, res, next) {
    try {
      const notificationId = req.params.id;

      // Get notification
      const notification = await Notification.query().findById(notificationId);
      if (!notification) {
        return res.status(404).json({ 
          error: 'Notification not found' 
        });
      }

      // Check permissions
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Only administrators can resend notifications' 
        });
      }

      // Reset notification status
      await Notification.query()
        .findById(notificationId)
        .patch({
          status: 'pending',
          attempts: 0,
          lastAttemptAt: null,
          sentAt: null,
          error: null,
          updatedAt: new Date()
        });

      // Process immediately
      await NotificationService.processNotification(notificationId);

      // Get updated notification
      const updatedNotification = await Notification.query()
        .findById(notificationId);

      res.json({
        message: 'Notification resent successfully',
        notification: updatedNotification
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel scheduled notification
   * DELETE /api/notifications/:id
   */
  static async cancel(req, res, next) {
    try {
      const notificationId = req.params.id;

      // Get notification
      const notification = await Notification.query().findById(notificationId);
      if (!notification) {
        return res.status(404).json({ 
          error: 'Notification not found' 
        });
      }

      // Check permissions
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Only administrators can cancel notifications' 
        });
      }

      // Check if already sent
      if (notification.status === 'sent') {
        return res.status(400).json({ 
          error: 'Cannot cancel a notification that has already been sent' 
        });
      }

      // Update status to cancelled
      await Notification.query()
        .findById(notificationId)
        .patch({
          status: 'cancelled',
          updatedAt: new Date()
        });

      res.json({
        message: 'Notification cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get notification templates
   * GET /api/notifications/templates
   */
  static async getTemplates(req, res, next) {
    try {
      // Only admins can manage templates
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const { type, channel, isActive } = req.query;

      let query = NotificationTemplate.query();

      if (type) {
        query = query.where('type', type);
      }
      if (channel) {
        query = query.where('channel', channel);
      }
      if (isActive !== undefined) {
        query = query.where('isActive', isActive === 'true');
      }

      const templates = await query.orderBy('type', 'asc');

      res.json(templates);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create notification template
   * POST /api/notifications/templates
   */
  static async createTemplate(req, res, next) {
    try {
      // Only admins can manage templates
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const schema = Joi.object({
        name: Joi.string().required(),
        type: Joi.string().valid(
          'appointment_confirmation',
          'appointment_reminder',
          'appointment_cancelled',
          'appointment_rescheduled',
          'waitlist_notification',
          'custom'
        ).required(),
        channel: Joi.string().valid('email', 'sms').required(),
        subject: Joi.string().when('channel', {
          is: 'email',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        content: Joi.string().required(),
        variables: Joi.array().items(Joi.string()).default([]),
        isActive: Joi.boolean().default(true)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Check for duplicate
      const existing = await NotificationTemplate.query()
        .where('type', value.type)
        .where('channel', value.channel)
        .where('isActive', true)
        .first();

      if (existing) {
        return res.status(409).json({ 
          error: 'An active template already exists for this type and channel' 
        });
      }

      // Extract variables from content
      const variableRegex = /{{(\w+)}}/g;
      const foundVariables = [];
      let match;
      while ((match = variableRegex.exec(value.content)) !== null) {
        if (!foundVariables.includes(match[1])) {
          foundVariables.push(match[1]);
        }
      }

      // Create template
      const template = await NotificationTemplate.query().insert({
        ...value,
        variables: foundVariables
      });

      res.status(201).json({
        message: 'Template created successfully',
        template
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update notification template
   * PUT /api/notifications/templates/:id
   */
  static async updateTemplate(req, res, next) {
    try {
      // Only admins can manage templates
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const templateId = req.params.id;

      // Get existing template
      const template = await NotificationTemplate.query().findById(templateId);
      if (!template) {
        return res.status(404).json({ 
          error: 'Template not found' 
        });
      }

      const schema = Joi.object({
        name: Joi.string(),
        subject: Joi.string(),
        content: Joi.string(),
        isActive: Joi.boolean()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Extract variables if content changed
      let variables = template.variables;
      if (value.content) {
        const variableRegex = /{{(\w+)}}/g;
        const foundVariables = [];
        let match;
        while ((match = variableRegex.exec(value.content)) !== null) {
          if (!foundVariables.includes(match[1])) {
            foundVariables.push(match[1]);
          }
        }
        variables = foundVariables;
      }

      // Update template
      const updatedTemplate = await NotificationTemplate.query()
        .patchAndFetchById(templateId, {
          ...value,
          variables,
          updatedAt: new Date()
        });

      res.json({
        message: 'Template updated successfully',
        template: updatedTemplate
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete notification template
   * DELETE /api/notifications/templates/:id
   */
  static async deleteTemplate(req, res, next) {
    try {
      // Only admins can manage templates
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const templateId = req.params.id;

      // Get template
      const template = await NotificationTemplate.query().findById(templateId);
      if (!template) {
        return res.status(404).json({ 
          error: 'Template not found' 
        });
      }

      // Soft delete by deactivating
      await NotificationTemplate.query()
        .findById(templateId)
        .patch({
          isActive: false,
          updatedAt: new Date()
        });

      res.json({
        message: 'Template deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get notification statistics
   * GET /api/notifications/stats
   */
  static async getStatistics(req, res, next) {
    try {
      // Only admins can view statistics
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const { startDate, endDate } = req.query;

      let query = Notification.query();

      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      if (endDate) {
        query = query.where('createdAt', '<=', endDate);
      }

      // Get statistics by status
      const byStatus = await query.clone()
        .select('status')
        .count('* as count')
        .groupBy('status');

      // Get statistics by channel
      const byChannel = await query.clone()
        .select('channel')
        .count('* as count')
        .groupBy('channel');

      // Get statistics by type
      const byType = await query.clone()
        .select('type')
        .count('* as count')
        .groupBy('type');

      // Get failure rate
      const total = await query.clone()
        .count('* as total')
        .first();

      const failed = await query.clone()
        .where('status', 'failed')
        .count('* as failed')
        .first();

      const failureRate = total?.total > 0 
        ? (failed?.failed / total.total) * 100 
        : 0;

      // Get average send time
      const avgSendTime = await query.clone()
        .where('status', 'sent')
        .whereNotNull('sentAt')
        .avg(Notification.raw('TIMESTAMPDIFF(SECOND, scheduledFor, sentAt) as avgSeconds'))
        .first();

      res.json({
        byStatus,
        byChannel,
        byType,
        totalNotifications: total?.total || 0,
        failureRate: Math.round(failureRate * 100) / 100,
        averageSendTimeSeconds: avgSendTime?.avgSeconds || 0
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test notification sending
   * POST /api/notifications/test
   */
  static async testNotification(req, res, next) {
    try {
      // Only admins can test notifications
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const schema = Joi.object({
        channel: Joi.string().valid('email', 'sms').required(),
        recipient: Joi.string().required(), // Email or phone number
        subject: Joi.string().when('channel', {
          is: 'email',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        content: Joi.string().required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Send test notification
      let result;
      if (value.channel === 'email') {
        result = await NotificationService.sendEmail(
          value.recipient,
          value.subject,
          value.content
        );
      } else {
        result = await NotificationService.sendSMS(
          value.recipient,
          value.content
        );
      }

      res.json({
        message: 'Test notification sent successfully',
        result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificationController;