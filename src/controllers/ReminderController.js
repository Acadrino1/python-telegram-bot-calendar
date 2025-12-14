const CustomReminder = require('../models/CustomReminder');
const ReminderTemplate = require('../models/ReminderTemplate');
const RecurringPattern = require('../models/RecurringPattern');
const UserReminderPreferences = require('../models/UserReminderPreferences');
const ReminderDeliveryLog = require('../models/ReminderDeliveryLog');
const NotificationService = require('../services/NotificationService');
const moment = require('moment-timezone');
const Joi = require('joi');

class ReminderController {
  constructor() {
    this.reminderScheduler = null;
  }

  setReminderScheduler(scheduler) {
    this.reminderScheduler = scheduler;
  }

  async getUserReminders(req, res) {
    try {
      const userId = req.user.id;
      const {
        status,
        reminder_type,
        priority,
        limit = 50,
        offset = 0,
        start_date,
        end_date,
        search
      } = req.query;

      let query = CustomReminder.query()
        .where('user_id', userId)
        .withGraphFetched('[template, recurringPattern, deliveryLogs]')
        .orderBy('scheduled_for', 'desc');

      // Apply filters
      if (status) {
        query = query.where('status', status);
      }

      if (reminder_type) {
        query = query.where('reminder_type', reminder_type);
      }

      if (priority) {
        query = query.where('priority', priority);
      }

      if (start_date) {
        query = query.where('scheduled_for', '>=', start_date);
      }

      if (end_date) {
        query = query.where('scheduled_for', '<=', end_date);
      }

      if (search) {
        query = query.where(builder => {
          builder
            .where('title', 'like', `%${search}%`)
            .orWhere('content', 'like', `%${search}%`);
        });
      }

      // Get total count for pagination
      const totalQuery = query.clone();
      const [{ count }] = await totalQuery.count('id as count');

      // Apply pagination
      const reminders = await query.limit(parseInt(limit)).offset(parseInt(offset));

      res.json({
        reminders,
        pagination: {
          total: parseInt(count),
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      console.error('Error fetching user reminders:', error);
      res.status(500).json({ error: 'Failed to fetch reminders' });
    }
  }

  async createReminder(req, res) {
    try {
      const userId = req.user.id;
      
      // Validation schema
      const schema = Joi.object({
        title: Joi.string().required().max(255),
        content: Joi.string().required(),
        reminder_type: Joi.string().valid('custom', 'appointment', 'recurring').default('custom'),
        priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
        scheduled_for: Joi.string().isoDate().required(),
        advance_minutes: Joi.number().integer().min(0).default(60),
        send_telegram: Joi.boolean().default(true),
        send_email: Joi.boolean().default(false),
        send_sms: Joi.boolean().default(false),
        template_id: Joi.number().integer().optional(),
        recurring_pattern_id: Joi.number().integer().optional(),
        recurrence_end_date: Joi.string().isoDate().optional(),
        max_occurrences: Joi.number().integer().min(1).optional(),
        metadata: Joi.object().optional()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error',
          details: error.details[0].message
        });
      }

      // Check if scheduled time is in the future
      const scheduledTime = moment(value.scheduled_for);
      if (scheduledTime.isBefore(moment())) {
        return res.status(400).json({ 
          error: 'Scheduled time must be in the future' 
        });
      }

      // Validate template exists if provided
      if (value.template_id) {
        const template = await ReminderTemplate.query()
          .findById(value.template_id)
          .where('is_active', true);
        
        if (!template) {
          return res.status(400).json({ 
            error: 'Invalid or inactive template' 
          });
        }
      }

      // Validate recurring pattern exists if provided
      if (value.recurring_pattern_id) {
        const pattern = await RecurringPattern.query()
          .findById(value.recurring_pattern_id)
          .where('is_active', true);
        
        if (!pattern) {
          return res.status(400).json({ 
            error: 'Invalid or inactive recurring pattern' 
          });
        }

        value.reminder_type = 'recurring';
      }

      // Create reminder using the enhanced scheduler
      const reminder = await this.reminderScheduler.createCustomReminder(userId, {
        ...value,
        created_by_role: 'user'
      });

      // Return the created reminder with relations
      const createdReminder = await CustomReminder.query()
        .findById(reminder.id)
        .withGraphFetched('[template, recurringPattern]');

      res.status(201).json({ 
        message: 'Reminder created successfully',
        reminder: createdReminder 
      });

    } catch (error) {
      console.error('Error creating reminder:', error);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  }

  async updateReminder(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Find the reminder
      const reminder = await CustomReminder.query()
        .findById(id)
        .where('user_id', userId);

      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      // Don't allow editing sent reminders
      if (reminder.status === 'sent') {
        return res.status(400).json({ 
          error: 'Cannot edit sent reminders' 
        });
      }

      // Validation schema for updates
      const schema = Joi.object({
        title: Joi.string().max(255),
        content: Joi.string(),
        priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
        scheduled_for: Joi.string().isoDate(),
        advance_minutes: Joi.number().integer().min(0),
        send_telegram: Joi.boolean(),
        send_email: Joi.boolean(),
        send_sms: Joi.boolean(),
        metadata: Joi.object()
      }).min(1); // At least one field must be provided

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error',
          details: error.details[0].message
        });
      }

      // If updating scheduled_for, validate it's in the future
      if (value.scheduled_for) {
        const scheduledTime = moment(value.scheduled_for);
        if (scheduledTime.isBefore(moment())) {
          return res.status(400).json({ 
            error: 'Scheduled time must be in the future' 
          });
        }

        // If rescheduling, update original_scheduled_for if not already set
        if (!reminder.original_scheduled_for) {
          value.original_scheduled_for = reminder.scheduled_for;
        }
      }

      // Update the reminder
      const updatedReminder = await reminder.$query()
        .patchAndFetch(value)
        .withGraphFetched('[template, recurringPattern]');

      res.json({ 
        message: 'Reminder updated successfully',
        reminder: updatedReminder 
      });

    } catch (error) {
      console.error('Error updating reminder:', error);
      res.status(500).json({ error: 'Failed to update reminder' });
    }
  }

  async deleteReminder(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const reminder = await CustomReminder.query()
        .findById(id)
        .where('user_id', userId);

      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      if (reminder.status === 'sent') {
        return res.status(400).json({ 
          error: 'Cannot delete sent reminders' 
        });
      }

      // Mark as cancelled instead of hard delete
      await reminder.markCancelled('Cancelled by user');

      res.json({ 
        message: 'Reminder cancelled successfully' 
      });

    } catch (error) {
      console.error('Error deleting reminder:', error);
      res.status(500).json({ error: 'Failed to delete reminder' });
    }
  }

  async getReminderById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const reminder = await CustomReminder.query()
        .findById(id)
        .where('user_id', userId)
        .withGraphFetched('[template, recurringPattern, deliveryLogs, appointment.service]');

      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      // Add computed fields
      const reminderWithDetails = {
        ...reminder,
        is_due: reminder.isDue(),
        time_until_due: reminder.getTimeUntilDue(),
        enabled_channels: reminder.getEnabledChannels(),
        can_edit: !reminder.isSent(),
        delivery_summary: {
          total_attempts: reminder.deliveryLogs?.length || 0,
          successful_deliveries: reminder.deliveryLogs?.filter(log => log.status === 'sent').length || 0,
          failed_deliveries: reminder.deliveryLogs?.filter(log => log.status === 'failed').length || 0
        }
      };

      res.json({ reminder: reminderWithDetails });

    } catch (error) {
      console.error('Error fetching reminder:', error);
      res.status(500).json({ error: 'Failed to fetch reminder' });
    }
  }

  async getUserPreferences(req, res) {
    try {
      const userId = req.user.id;

      const preferences = await UserReminderPreferences.findOrCreateForUser(userId);
      const effectiveSettings = preferences.getEffectiveSettings();

      res.json({ 
        preferences,
        effective_settings: effectiveSettings
      });

    } catch (error) {
      console.error('Error fetching preferences:', error);
      res.status(500).json({ error: 'Failed to fetch preferences' });
    }
  }

  async updateUserPreferences(req, res) {
    try {
      const userId = req.user.id;

      const schema = Joi.object({
        default_telegram_enabled: Joi.boolean(),
        default_email_enabled: Joi.boolean(),
        default_sms_enabled: Joi.boolean(),
        preferred_reminder_times: Joi.array().items(Joi.number().integer().min(0)),
        timezone: Joi.string(),
        quiet_hours: Joi.object({
          start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
          end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        }).optional(),
        preferred_days: Joi.array().items(Joi.number().integer().min(1).max(7)),
        preferred_language: Joi.string().max(10),
        include_appointment_details: Joi.boolean(),
        include_cancellation_info: Joi.boolean(),
        include_location_info: Joi.boolean(),
        max_daily_reminders: Joi.string().valid('unlimited', 'limited'),
        max_daily_count: Joi.number().integer().min(1).max(50),
        group_similar_reminders: Joi.boolean()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error',
          details: error.details[0].message
        });
      }

      let preferences = await UserReminderPreferences.query()
        .where('user_id', userId)
        .first();

      if (preferences) {
        preferences = await preferences.$query().patchAndFetch(value);
      } else {
        preferences = await UserReminderPreferences.query().insert({
          user_id: userId,
          ...value
        });
      }

      res.json({ 
        message: 'Preferences updated successfully',
        preferences 
      });

    } catch (error) {
      console.error('Error updating preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }

  async getTemplates(req, res) {
    try {
      const { category, search } = req.query;

      let query = ReminderTemplate.query()
        .where('is_active', true)
        .orderBy('usage_count', 'desc')
        .orderBy('name');

      if (category) {
        query = query.where('category', category);
      }

      if (search) {
        query = query.where(builder => {
          builder
            .where('name', 'like', `%${search}%`)
            .orWhere('description', 'like', `%${search}%`);
        });
      }

      const templates = await query;

      // Group by category
      const groupedTemplates = await ReminderTemplate.getGroupedByCategory();

      res.json({ 
        templates,
        grouped_templates: groupedTemplates,
        categories: await ReminderTemplate.getCategories()
      });

    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  async previewTemplate(req, res) {
    try {
      const { id } = req.params;
      const { sample_data } = req.body;

      const template = await ReminderTemplate.query().findById(id);
      if (!template || !template.is_active) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const preview = template.testTemplate(sample_data);
      
      res.json({ 
        template_info: {
          name: template.name,
          category: template.category,
          description: template.description
        },
        preview 
      });

    } catch (error) {
      console.error('Error previewing template:', error);
      res.status(500).json({ error: 'Failed to preview template' });
    }
  }

  async getRecurringPatterns(req, res) {
    try {
      const { pattern_type } = req.query;

      let query = RecurringPattern.query()
        .where('is_active', true)
        .orderBy('name');

      if (pattern_type) {
        query = query.where('pattern_type', pattern_type);
      }

      const patterns = await query;

      // Add usage stats for each pattern
      const patternsWithStats = await Promise.all(
        patterns.map(async (pattern) => {
          const stats = await pattern.getUsageStats();
          return {
            ...pattern,
            usage_stats: stats,
            description_text: pattern.getDescription()
          };
        })
      );

      res.json({ 
        patterns: patternsWithStats,
        pattern_types: ['daily', 'weekly', 'monthly', 'yearly', 'custom']
      });

    } catch (error) {
      console.error('Error fetching recurring patterns:', error);
      res.status(500).json({ error: 'Failed to fetch recurring patterns' });
    }
  }

  async previewRecurringPattern(req, res) {
    try {
      const { id } = req.params;
      const { 
        start_date = moment().toISOString(), 
        count = 10 
      } = req.body;

      const pattern = await RecurringPattern.query().findById(id);
      if (!pattern || !pattern.is_active) {
        return res.status(404).json({ error: 'Pattern not found' });
      }

      const fromDate = moment(start_date);
      const occurrences = pattern.getNextOccurrence(fromDate, count);

      const formattedOccurrences = Array.isArray(occurrences)
        ? occurrences.map(date => ({
            datetime: date.toISOString(),
            formatted: date.format('MMMM Do YYYY, h:mm A'),
            day_of_week: date.format('dddd'),
            relative: date.fromNow()
          }))
        : occurrences ? [{
            datetime: occurrences.toISOString(),
            formatted: occurrences.format('MMMM Do YYYY, h:mm A'),
            day_of_week: occurrences.format('dddd'),
            relative: occurrences.fromNow()
          }] : [];

      res.json({
        pattern: {
          name: pattern.name,
          description: pattern.getDescription(),
          pattern_type: pattern.pattern_type
        },
        occurrences: formattedOccurrences,
        validation: pattern.validatePattern()
      });

    } catch (error) {
      console.error('Error previewing pattern:', error);
      res.status(500).json({ error: 'Failed to preview pattern' });
    }
  }

  async getDeliveryLogs(req, res) {
    try {
      const userId = req.user.id;
      const { 
        reminder_id, 
        delivery_channel, 
        status,
        limit = 50,
        offset = 0,
        start_date,
        end_date
      } = req.query;

      let query = ReminderDeliveryLog.query()
        .where('user_id', userId)
        .withGraphFetched('[customReminder]')
        .orderBy('sent_at', 'desc');

      // Apply filters
      if (reminder_id) {
        query = query.where('custom_reminder_id', reminder_id);
      }

      if (delivery_channel) {
        query = query.where('delivery_channel', delivery_channel);
      }

      if (status) {
        query = query.where('status', status);
      }

      if (start_date) {
        query = query.where('sent_at', '>=', start_date);
      }

      if (end_date) {
        query = query.where('sent_at', '<=', end_date);
      }

      // Get total count
      const totalQuery = query.clone();
      const [{ count }] = await totalQuery.count('id as count');

      // Apply pagination
      const logs = await query.limit(parseInt(limit)).offset(parseInt(offset));

      res.json({
        logs,
        pagination: {
          total: parseInt(count),
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      console.error('Error fetching delivery logs:', error);
      res.status(500).json({ error: 'Failed to fetch delivery logs' });
    }
  }

  async getUserStatistics(req, res) {
    try {
      const userId = req.user.id;
      const { 
        start_date = moment().subtract(30, 'days').toISOString(),
        end_date = moment().toISOString()
      } = req.query;

      // Get reminder statistics
      const reminders = await CustomReminder.query()
        .where('user_id', userId)
        .where('created_at', '>=', start_date)
        .where('created_at', '<=', end_date);

      // Get delivery statistics
      const deliveries = await ReminderDeliveryLog.query()
        .where('user_id', userId)
        .where('sent_at', '>=', start_date)
        .where('sent_at', '<=', end_date);

      // Calculate statistics
      const stats = {
        reminders: {
          total: reminders.length,
          by_status: {
            scheduled: reminders.filter(r => r.status === 'scheduled').length,
            sent: reminders.filter(r => r.status === 'sent').length,
            failed: reminders.filter(r => r.status === 'failed').length,
            cancelled: reminders.filter(r => r.status === 'cancelled').length,
            expired: reminders.filter(r => r.status === 'expired').length
          },
          by_priority: {
            low: reminders.filter(r => r.priority === 'low').length,
            medium: reminders.filter(r => r.priority === 'medium').length,
            high: reminders.filter(r => r.priority === 'high').length,
            urgent: reminders.filter(r => r.priority === 'urgent').length
          },
          by_type: {
            custom: reminders.filter(r => r.reminder_type === 'custom').length,
            appointment: reminders.filter(r => r.reminder_type === 'appointment').length,
            recurring: reminders.filter(r => r.reminder_type === 'recurring').length
          }
        },
        deliveries: {
          total: deliveries.length,
          by_channel: {
            telegram: deliveries.filter(d => d.delivery_channel === 'telegram').length,
            email: deliveries.filter(d => d.delivery_channel === 'email').length,
            sms: deliveries.filter(d => d.delivery_channel === 'sms').length
          },
          by_status: {
            sent: deliveries.filter(d => d.status === 'sent').length,
            failed: deliveries.filter(d => d.status === 'failed').length,
            pending: deliveries.filter(d => d.status === 'pending').length,
            retrying: deliveries.filter(d => d.status === 'retrying').length
          }
        },
        success_rate: reminders.length > 0 ? 
          Math.round((reminders.filter(r => r.status === 'sent').length / reminders.length) * 100) : 0,
        period: {
          start: start_date,
          end: end_date
        }
      };

      res.json({ statistics: stats });

    } catch (error) {
      console.error('Error fetching user statistics:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  }

  async createBulkReminders(req, res) {
    try {
      const userId = req.user.id;
      const { reminders } = req.body;

      if (!Array.isArray(reminders) || reminders.length === 0) {
        return res.status(400).json({ 
          error: 'Reminders array is required and must not be empty' 
        });
      }

      if (reminders.length > 100) {
        return res.status(400).json({ 
          error: 'Maximum 100 reminders can be created at once' 
        });
      }

      // Use the enhanced scheduler's bulk creation
      const results = await this.reminderScheduler.createBulkReminders(userId, reminders);

      res.json({
        message: `Successfully created ${results.created.length}/${results.total} reminders`,
        results
      });

    } catch (error) {
      console.error('Error creating bulk reminders:', error);
      res.status(500).json({ error: 'Failed to create bulk reminders' });
    }
  }
}

module.exports = ReminderController;