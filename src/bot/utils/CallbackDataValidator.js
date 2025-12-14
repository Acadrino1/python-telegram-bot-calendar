/**
 * Callback Data Validator
 * Ensures all callback queries have proper structure and data
 */

class CallbackDataValidator {
  constructor() {
    this.MAX_CALLBACK_DATA_LENGTH = 64;
    this.REQUIRED_FIELDS = ['id', 'data'];
    this.USER_FIELDS = ['id', 'first_name'];
  }

  /**
   * Validate callback query structure
   */
  validateCallbackQuery(callbackQuery) {
    const validation = {
      isValid: false,
      errors: [],
      warnings: [],
      structure: {}
    };

    // Check if callback query exists
    if (!callbackQuery) {
      validation.errors.push('Callback query is null or undefined');
      return validation;
    }

    // Validate callback query ID
    if (!callbackQuery.id) {
      validation.errors.push('Missing callback query ID');
    } else if (typeof callbackQuery.id !== 'string') {
      validation.errors.push('Callback query ID must be a string');
    } else {
      validation.structure.hasQueryId = true;
    }

    // Validate callback data
    if (!callbackQuery.data) {
      validation.errors.push('Missing callback data');
    } else if (typeof callbackQuery.data !== 'string') {
      validation.errors.push('Callback data must be a string');
    } else if (callbackQuery.data.length > this.MAX_CALLBACK_DATA_LENGTH) {
      validation.errors.push(`Callback data too long: ${callbackQuery.data.length} > ${this.MAX_CALLBACK_DATA_LENGTH}`);
    } else {
      validation.structure.hasData = true;
    }

    // Validate user information
    if (!callbackQuery.from) {
      validation.errors.push('Missing user information (from field)');
    } else {
      if (!callbackQuery.from.id) {
        validation.errors.push('Missing user ID');
      } else {
        validation.structure.hasUserId = true;
      }

      if (!callbackQuery.from.first_name) {
        validation.warnings.push('Missing user first name');
      }
    }

    // Validate message reference
    if (!callbackQuery.message) {
      validation.warnings.push('Missing message reference');
    } else {
      validation.structure.hasMessage = true;
    }

    // Set overall validity
    validation.isValid = validation.errors.length === 0;

    return validation;
  }

  /**
   * Sanitize callback data
   */
  sanitizeCallbackData(data) {
    if (typeof data !== 'string') {
      return '';
    }

    // Truncate if too long
    if (data.length > this.MAX_CALLBACK_DATA_LENGTH) {
      const truncated = data.substring(0, this.MAX_CALLBACK_DATA_LENGTH - 3) + '...';
      console.warn(`Callback data truncated: ${data} -> ${truncated}`);
      return truncated;
    }

    // Remove invalid characters
    const sanitized = data.replace(/[^\w\-_.,]/g, '_');
    
    if (sanitized !== data) {
      console.warn(`Callback data sanitized: ${data} -> ${sanitized}`);
    }

    return sanitized;
  }

  /**
   * Create safe callback data for buttons
   */
  createSafeCallbackData(action, params = []) {
    const parts = [action, ...params];
    const data = parts.join('_');
    
    return this.sanitizeCallbackData(data);
  }

  /**
   * Parse callback data safely
   */
  parseCallbackData(data) {
    if (!data || typeof data !== 'string') {
      return {
        action: 'unknown',
        params: [],
        isValid: false
      };
    }

    const parts = data.split('_');
    const action = parts[0] || 'unknown';
    const params = parts.slice(1);

    return {
      action,
      params,
      isValid: true,
      original: data
    };
  }

  /**
   * Validate specific callback actions
   */
  validateAction(action, params) {
    const validation = {
      isValid: false,
      action,
      params,
      errors: []
    };

    switch (action) {
      case 'service':
        if (!params[0] || isNaN(parseInt(params[0]))) {
          validation.errors.push('Service ID must be a number');
        } else {
          validation.isValid = true;
        }
        break;

      case 'date':
        if (!params[0]) {
          validation.errors.push('Date parameter is required');
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(params[0])) {
          validation.errors.push('Date must be in YYYY-MM-DD format');
        } else {
          validation.isValid = true;
        }
        break;

      case 'time':
        if (!params[0]) {
          validation.errors.push('Time parameter is required');
        } else if (!/^\d{2}:\d{2}$/.test(params[0])) {
          validation.errors.push('Time must be in HH:MM format');
        } else {
          validation.isValid = true;
        }
        break;

      case 'confirm_booking':
      case 'cancel_booking':
      case 'show_calendar':
      case 'support_create_ticket':
      case 'support_my_tickets':
      case 'support_faq':
        validation.isValid = true;
        break;

      default:
        validation.errors.push(`Unknown action: ${action}`);
        break;
    }

    return validation;
  }

  /**
   * Get validation error message for user display
   */
  getErrorMessage(validation) {
    if (validation.isValid) {
      return null;
    }

    const primaryErrors = validation.errors.filter(e => 
      !e.includes('warning') && !e.includes('Missing user first name')
    );

    if (primaryErrors.length === 0) {
      return 'Something went wrong. Please try again.';
    }

    if (primaryErrors.some(e => e.includes('Missing callback data'))) {
      return 'Invalid button press. Please refresh and try again.';
    }

    if (primaryErrors.some(e => e.includes('Missing callback query ID'))) {
      return 'Session expired. Please start over.';
    }

    return 'Invalid request. Please try again.';
  }

  /**
   * Log validation details for debugging
   */
  logValidation(validation, context = 'Unknown') {
    if (validation.isValid) {
      console.log(`✅ Callback validation passed for ${context}`);
      return;
    }

    console.error(`❌ Callback validation failed for ${context}:`);
    
    if (validation.errors.length > 0) {
      console.error('  Errors:', validation.errors);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('  Warnings:', validation.warnings);
    }
    
    console.log('  Structure:', validation.structure);
  }

  /**
   * Get callback statistics for monitoring
   */
  getStats() {
    // This would be implemented with actual tracking in production
    return {
      totalValidated: 0,
      validCallbacks: 0,
      invalidCallbacks: 0,
      commonErrors: [],
      lastValidated: null
    };
  }
}

module.exports = CallbackDataValidator;