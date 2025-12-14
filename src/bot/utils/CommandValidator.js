/**
 * Command Validation and Processing Utility
 * Ensures compliance with Telegram Global Rule 8
 */

class CommandValidator {
  constructor() {
    this.commandSchemas = new Map();
    this.validationRules = {
      required: (value) => value !== undefined && value !== null && value !== '',
      minLength: (value, min) => value && value.length >= min,
      maxLength: (value, max) => value && value.length <= max,
      numeric: (value) => !isNaN(value) && isFinite(value),
      email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      phone: (value) => /^\+?[\d\s\-\(\)]+$/.test(value),
      date: (value) => {
        const date = new Date(value);
        return date instanceof Date && !isNaN(date);
      },
      uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
      alphanumeric: (value) => /^[a-zA-Z0-9]+$/.test(value),
      postalCode: (value) => /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(value)
    };
  }

  /**
   * Register command schema for validation
   * @param {string} commandName - Command name
   * @param {Object} schema - Validation schema
   */
  registerCommand(commandName, schema) {
    this.commandSchemas.set(commandName, {
      description: schema.description || `Execute ${commandName} command`,
      args: schema.args || [],
      permissions: schema.permissions || [],
      rateLimit: schema.rateLimit || null,
      ...schema
    });
  }

  /**
   * Validate and parse command
   * @param {Object} ctx - Telegram context
   * @param {string} commandName - Command name
   * @returns {Object} - Validation result
   */
  async validateCommand(ctx, commandName) {
    const result = {
      valid: false,
      args: {},
      errors: [],
      help: null
    };

    const schema = this.commandSchemas.get(commandName);
    if (!schema) {
      result.errors.push(`Unknown command: ${commandName}`);
      return result;
    }

    // Check permissions
    const permissionCheck = await this.checkPermissions(ctx, schema.permissions);
    if (!permissionCheck.allowed) {
      result.errors.push(permissionCheck.reason);
      return result;
    }

    // Parse and validate arguments
    const argValidation = this.validateArguments(ctx.message.text, commandName, schema.args);
    if (!argValidation.valid) {
      result.errors = argValidation.errors;
      result.help = this.generateCommandHelp(commandName, schema);
      return result;
    }

    result.valid = true;
    result.args = argValidation.args;
    return result;
  }

  /**
   * Check user permissions for command
   * @param {Object} ctx - Telegram context
   * @param {Array} requiredPermissions - Required permissions
   * @returns {Object} - Permission check result
   */
  async checkPermissions(ctx, requiredPermissions = []) {
    if (requiredPermissions.length === 0) {
      return { allowed: true };
    }

    const userId = ctx.from.id.toString();
    const adminIds = process.env.ADMIN_USER_IDS?.split(',') || [];
    const isAdmin = adminIds.includes(userId) || userId === process.env.ADMIN_USER_ID;

    for (const permission of requiredPermissions) {
      switch (permission) {
        case 'admin':
          if (!isAdmin) {
            return { 
              allowed: false, 
              reason: 'This command requires administrator privileges.' 
            };
          }
          break;
          
        case 'registered':
          // Check if user is registered (implementation depends on your user model)
          const isRegistered = await this.checkUserRegistration(ctx);
          if (!isRegistered) {
            return { 
              allowed: false, 
              reason: 'Please use /start to register first.' 
            };
          }
          break;
          
        case 'approved':
          // Check if user is approved
          const isApproved = await this.checkUserApproval(ctx);
          if (!isApproved) {
            return { 
              allowed: false, 
              reason: 'Your access is pending approval. Use /request to check status.' 
            };
          }
          break;
      }
    }

    return { allowed: true };
  }

  /**
   * Validate command arguments
   * @param {string} messageText - Full message text
   * @param {string} commandName - Command name
   * @param {Array} argSpecs - Argument specifications
   * @returns {Object} - Validation result
   */
  validateArguments(messageText, commandName, argSpecs = []) {
    const result = {
      valid: true,
      args: {},
      errors: []
    };

    // Extract arguments from message
    const parts = messageText.split(' ');
    const args = parts.slice(1); // Remove command name

    // Check required argument count
    const requiredArgs = argSpecs.filter(spec => spec.required !== false);
    if (args.length < requiredArgs.length) {
      result.valid = false;
      result.errors.push(`Missing required arguments. Expected ${requiredArgs.length}, got ${args.length}.`);
      return result;
    }

    // Validate each argument
    for (let i = 0; i < argSpecs.length; i++) {
      const spec = argSpecs[i];
      const value = args[i];

      // Check if required argument is missing
      if (spec.required !== false && (value === undefined || value === '')) {
        result.valid = false;
        result.errors.push(`Missing required argument: ${spec.name}`);
        continue;
      }

      // Skip validation if optional and not provided
      if (spec.required === false && (value === undefined || value === '')) {
        continue;
      }

      // Validate argument
      const validation = this.validateValue(value, spec);
      if (!validation.valid) {
        result.valid = false;
        result.errors.push(`Invalid ${spec.name}: ${validation.error}`);
      } else {
        result.args[spec.name] = validation.value;
      }
    }

    return result;
  }

  /**
   * Validate single value against specification
   * @param {*} value - Value to validate
   * @param {Object} spec - Validation specification
   * @returns {Object} - Validation result
   */
  validateValue(value, spec) {
    const result = {
      valid: true,
      value: value,
      error: null
    };

    // Apply transformations
    if (spec.transform) {
      switch (spec.transform) {
        case 'trim':
          result.value = value.trim();
          break;
        case 'lowercase':
          result.value = value.toLowerCase();
          break;
        case 'uppercase':
          result.value = value.toUpperCase();
          break;
        case 'number':
          result.value = parseFloat(value);
          break;
      }
    }

    // Apply validations
    if (spec.validations) {
      for (const validation of spec.validations) {
        const { rule, params, message } = validation;
        const validator = this.validationRules[rule];
        
        if (validator) {
          const isValid = params ? validator(result.value, ...params) : validator(result.value);
          if (!isValid) {
            result.valid = false;
            result.error = message || `Validation failed for rule: ${rule}`;
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Generate help text for command
   * @param {string} commandName - Command name
   * @param {Object} schema - Command schema
   * @returns {string} - Help text
   */
  generateCommandHelp(commandName, schema) {
    let help = `📋 *${commandName.toUpperCase()} Command Help*\n\n`;
    help += `${schema.description}\n\n`;

    if (schema.args && schema.args.length > 0) {
      help += `*Usage:*\n/${commandName}`;
      
      schema.args.forEach(arg => {
        const bracket = arg.required !== false ? '<>' : '[]';
        help += ` ${bracket[0]}${arg.name}${bracket[1]}`;
      });
      
      help += '\n\n*Arguments:*\n';
      
      schema.args.forEach(arg => {
        const required = arg.required !== false ? 'Required' : 'Optional';
        help += `• *${arg.name}* (${required}): ${arg.description || 'No description'}\n`;
      });
    }

    if (schema.examples) {
      help += '\n*Examples:*\n';
      schema.examples.forEach(example => {
        help += `• ${example}\n`;
      });
    }

    return help;
  }

  /**
   * Generate acknowledgment message
   * @param {string} commandName - Command name
   * @param {Object} args - Parsed arguments
   * @returns {string} - Acknowledgment message
   */
  generateAcknowledgment(commandName, args = {}) {
    const argSummary = Object.keys(args).length > 0 
      ? ` with ${Object.keys(args).length} parameter(s)`
      : '';
      
    return `✅ Processing ${commandName} command${argSummary}...`;
  }

  /**
   * Check if user is registered
   * @param {Object} ctx - Telegram context
   * @returns {boolean} - Registration status
   */
  async checkUserRegistration(ctx) {
    try {
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();
      return !!user;
    } catch (error) {
      console.error('Error checking user registration:', error);
      return false;
    }
  }

  /**
   * Check if user is approved
   * @param {Object} ctx - Telegram context
   * @returns {boolean} - Approval status
   */
  async checkUserApproval(ctx) {
    try {
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();
      return user && user.isApproved();
    } catch (error) {
      console.error('Error checking user approval:', error);
      return false;
    }
  }

  /**
   * Get all registered commands
   * @returns {Array} - Command list
   */
  getCommands() {
    return Array.from(this.commandSchemas.entries()).map(([name, schema]) => ({
      name,
      description: schema.description,
      permissions: schema.permissions
    }));
  }
}

module.exports = CommandValidator;