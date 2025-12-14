const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');

class AuthController {

  static async register(req, res, next) {
    try {
      // Validation schema
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
        role: Joi.string().valid('client', 'provider', 'admin').default('client'),
        timezone: Joi.string().default('America/New_York'),
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

      // Create user with snake_case column names
      const user = await User.query().insert({
        email: value.email,
        password_hash: hashedPassword,
        first_name: value.firstName,
        last_name: value.lastName,
        phone: value.phone,
        role: value.role,
        timezone: value.timezone,
        preferences: value.preferences,
        is_active: true,
        email_verified: false
      });

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Remove password from response
      delete user.password_hash;

      res.status(201).json({
        message: 'User registered successfully',
        user,
        token
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      // Validation schema
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Find user
      const user = await User.query()
        .where('email', value.email)
        .first();

      if (!user) {
        return res.status(401).json({ 
          error: 'Invalid email or password' 
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          error: 'Account is deactivated. Please contact support.'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(value.password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ 
          error: 'Invalid email or password' 
        });
      }

      // Update last login
      await User.query()
        .findById(user.id)
        .patch({ updated_at: new Date() });

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Remove password from response
      delete user.password_hash;

      res.json({
        message: 'Login successful',
        user,
        token
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      // In a production environment, you might want to:
      // 1. Add the token to a blacklist (Redis)
      // 2. Clear any server-side sessions
      // 3. Log the logout event

      res.json({
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req, res, next) {
    try {
      const user = await User.query()
        .findById(req.user.userId)
        .select('id', 'email', 'first_name', 'last_name', 'phone', 'role',
                'timezone', 'preferences', 'is_active', 'email_verified',
                'created_at', 'updated_at');

      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req, res, next) {
    try {
      const schema = Joi.object({
        firstName: Joi.string(),
        lastName: Joi.string(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
        timezone: Joi.string(),
        preferences: Joi.object({
          notificationEmail: Joi.boolean(),
          notificationSms: Joi.boolean(),
          reminderHours: Joi.array().items(Joi.number())
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      const user = await User.query()
        .patchAndFetchById(req.user.userId, {
          first_name: value.firstName,
          last_name: value.lastName,
          phone: value.phone,
          timezone: value.timezone,
          preferences: value.preferences,
          updated_at: new Date()
        })
        .select('id', 'email', 'first_name', 'last_name', 'phone', 'role',
                'timezone', 'preferences', 'is_active', 'email_verified');

      res.json({
        message: 'Profile updated successfully',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req, res, next) {
    try {
      const schema = Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(8).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Get user with password
      const user = await User.query()
        .findById(req.user.userId);

      // Verify current password
      const isValidPassword = await bcrypt.compare(value.currentPassword, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          error: 'Current password is incorrect'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(value.newPassword, 10);

      // Update password
      await User.query()
        .findById(req.user.userId)
        .patch({
          password_hash: hashedPassword,
          updated_at: new Date()
        });

      res.json({
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      const user = await User.query()
        .where('email', value.email)
        .first();

      if (user) {
        // Generate reset token
        const resetToken = jwt.sign(
          { userId: user.id, type: 'password-reset' },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        // In production, send email with reset link
        // await NotificationService.sendPasswordResetEmail(user.email, resetToken);

        // For development, include token in response
        if (process.env.NODE_ENV === 'development') {
          return res.json({
            message: 'Password reset email sent',
            resetToken // Remove this in production
          });
        }
      }

      // Always return success to prevent email enumeration
      res.json({
        message: 'If the email exists, a password reset link has been sent'
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const schema = Joi.object({
        token: Joi.string().required(),
        newPassword: Joi.string().min(8).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.details[0].message 
        });
      }

      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(value.token, process.env.JWT_SECRET);
        if (decoded.type !== 'password-reset') {
          throw new Error('Invalid token type');
        }
      } catch (err) {
        return res.status(400).json({ 
          error: 'Invalid or expired reset token' 
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(value.newPassword, 10);

      // Update password
      await User.query()
        .findById(decoded.userId)
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
}

module.exports = AuthController;