const Joi = require('joi');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Appointment = require('../models/Appointment');

class UserController {

  static async getAll(req, res, next) {
    try {
      // Only admins can list all users
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const { role, isActive, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      let query = User.query()
        .select('id', 'email', 'first_name', 'last_name', 'phone', 'role',
                'timezone', 'is_active', 'email_verified', 'created_at', 'updated_at');

      // Apply filters
      if (role) {
        query = query.where('role', role);
      }
      if (isActive !== undefined) {
        query = query.where('is_active', isActive === 'true');
      }

      // Get total count
      const totalQuery = query.clone();
      const total = await totalQuery.resultSize();

      // Get paginated results
      const users = await query
        .limit(limit)
        .offset(offset)
        .orderBy('created_at', 'desc');

      res.json({
        users,
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

  static async getById(req, res, next) {
    try {
      const userId = req.params.id;

      // Check permissions
      if (req.user.role !== 'admin' && req.user.userId !== parseInt(userId)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const user = await User.query()
        .findById(userId)
        .select('id', 'email', 'first_name', 'last_name', 'phone', 'role',
                'timezone', 'preferences', 'is_active', 'email_verified',
                'created_at', 'updated_at');

      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Include additional stats for admins
      if (req.user.role === 'admin') {
        const appointmentStats = await Appointment.query()
          .where('client_id', userId)
          .orWhere('provider_id', userId)
          .select('status')
          .count('* as count')
          .groupBy('status');

        user.statistics = {
          appointments: appointmentStats
        };
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }

  static async create(req, res, next) {
    try {
      // Only admins can create users directly
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
        role: Joi.string().valid('client', 'provider', 'admin').required(),
        timezone: Joi.string().default('America/New_York'),
        isActive: Joi.boolean().default(true),
        emailVerified: Joi.boolean().default(false),
        preferences: Joi.object({
          notificationEmail: Joi.boolean().default(true),
          notificationSms: Joi.boolean().default(false),
          reminderHours: Joi.array().items(Joi.number()).default([24, 2])
        }).default()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Check if user already exists
      const existingUser = await User.query()
        .where('email', value.email)
        .first();

      if (existingUser) {
        return res.status(409).json({ 
          error: 'User already exists with this email' 
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(value.password, 10);

      // Create user
      const user = await User.query().insert({
        email: value.email,
        password_hash: hashedPassword,
        first_name: value.firstName,
        last_name: value.lastName,
        phone: value.phone,
        role: value.role,
        timezone: value.timezone,
        is_active: value.isActive,
        email_verified: value.emailVerified,
        preferences: value.preferences
      });

      // Remove password from response
      delete user.password;

      res.status(201).json({
        message: 'User created successfully',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req, res, next) {
    try {
      const userId = req.params.id;

      // Check permissions
      if (req.user.role !== 'admin' && req.user.userId !== parseInt(userId)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      const schema = Joi.object({
        firstName: Joi.string(),
        lastName: Joi.string(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
        timezone: Joi.string(),
        preferences: Joi.object({
          notificationEmail: Joi.boolean(),
          notificationSms: Joi.boolean(),
          reminderHours: Joi.array().items(Joi.number())
        }),
        // Admin-only fields
        role: req.user.role === 'admin' ? Joi.string().valid('client', 'provider', 'admin') : Joi.forbidden(),
        isActive: req.user.role === 'admin' ? Joi.boolean() : Joi.forbidden(),
        emailVerified: req.user.role === 'admin' ? Joi.boolean() : Joi.forbidden()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Check if user exists
      const existingUser = await User.query().findById(userId);
      if (!existingUser) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Update user - map camelCase input to snake_case columns
      const updateData = { updated_at: new Date() };
      if (value.firstName) updateData.first_name = value.firstName;
      if (value.lastName) updateData.last_name = value.lastName;
      if (value.phone) updateData.phone = value.phone;
      if (value.timezone) updateData.timezone = value.timezone;
      if (value.preferences) updateData.preferences = value.preferences;
      if (value.role) updateData.role = value.role;
      if (value.isActive !== undefined) updateData.is_active = value.isActive;
      if (value.emailVerified !== undefined) updateData.email_verified = value.emailVerified;

      const user = await User.query()
        .patchAndFetchById(userId, updateData)
        .select('id', 'email', 'first_name', 'last_name', 'phone', 'role',
                'timezone', 'preferences', 'is_active', 'email_verified');

      res.json({
        message: 'User updated successfully',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req, res, next) {
    try {
      const userId = req.params.id;

      // Only admins can delete users
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      // Check if user exists
      const user = await User.query().findById(userId);
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Don't allow deleting self
      if (req.user.userId === parseInt(userId)) {
        return res.status(400).json({ 
          error: 'Cannot delete your own account' 
        });
      }

      // Check for active appointments
      const activeAppointments = await Appointment.query()
        .where(builder => {
          builder.where('client_id', userId).orWhere('provider_id', userId);
        })
        .whereIn('status', ['scheduled', 'confirmed'])
        .count('id as count')
        .first();

      if (activeAppointments && activeAppointments.count > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete user with active appointments' 
        });
      }

      // Soft delete by deactivating
      await User.query()
        .findById(userId)
        .patch({
          is_active: false,
          updated_at: new Date()
        });

      res.json({
        message: 'User deactivated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  static async getUserAppointments(req, res, next) {
    try {
      const userId = req.params.id;
      const { status, startDate, endDate, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // Check permissions
      if (req.user.role !== 'admin' && req.user.userId !== parseInt(userId)) {
        return res.status(403).json({ 
          error: 'Access denied' 
        });
      }

      // Check if user exists
      const user = await User.query().findById(userId);
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      let query = Appointment.query();

      // Filter by user role
      if (user.role === 'client') {
        query = query.where('client_id', userId);
      } else if (user.role === 'provider') {
        query = query.where('provider_id', userId);
      }

      // Apply filters
      if (status) {
        query = query.where('status', status);
      }
      if (startDate) {
        query = query.where('appointment_datetime', '>=', startDate);
      }
      if (endDate) {
        query = query.where('appointment_datetime', '<=', endDate);
      }

      // Get total count
      const totalQuery = query.clone();
      const total = await totalQuery.resultSize();

      // Get paginated results with relations
      const appointments = await query
        .withGraphFetched('[client, provider, service]')
        .modifyGraph('client', builder => {
          builder.select('id', 'first_name', 'last_name', 'email');
        })
        .modifyGraph('provider', builder => {
          builder.select('id', 'first_name', 'last_name', 'email');
        })
        .limit(limit)
        .offset(offset)
        .orderBy('appointment_datetime', 'desc');

      res.json({
        appointments,
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

  static async getProviders(req, res, next) {
    try {
      const { category, isActive = true } = req.query;

      let query = User.query()
        .where('role', 'provider')
        .where('is_active', isActive)
        .select('id', 'first_name', 'last_name', 'email', 'phone', 'timezone');

      // If category specified, join with services
      if (category) {
        query = query
          .joinRelated('services')
          .where('services.category', category)
          .where('services.is_active', true)
          .distinct('users.id');
      }

      const providers = await query.orderBy('last_name', 'asc');

      res.json(providers);
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const userId = req.params.id;

      // Only admins can reset passwords
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      const schema = Joi.object({
        newPassword: Joi.string().min(8).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Check if user exists
      const user = await User.query().findById(userId);
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(value.newPassword, 10);

      // Update password
      await User.query()
        .findById(userId)
        .patch({
          password_hash: hashedPassword,
          updated_at: new Date()
        });

      res.json({
        message: 'Password reset successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(req, res, next) {
    try {
      // Only admins can view statistics
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied. Admin only.' 
        });
      }

      // User counts by role
      const usersByRole = await User.query()
        .select('role')
        .count('* as count')
        .groupBy('role');

      // Active vs inactive users
      const usersByStatus = await User.query()
        .select('is_active')
        .count('* as count')
        .groupBy('is_active');

      // New users this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const newUsersThisMonth = await User.query()
        .where('created_at', '>=', startOfMonth)
        .count('* as count')
        .first();

      // Users with appointments
      const usersWithAppointments = await User.query()
        .joinRelated('appointmentsAsClient')
        .countDistinct('users.id as count')
        .first();

      res.json({
        usersByRole,
        usersByStatus,
        newUsersThisMonth: newUsersThisMonth?.count || 0,
        usersWithAppointments: usersWithAppointments?.count || 0
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserController;