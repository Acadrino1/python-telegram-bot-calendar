const User = require('../models/User');
const logger = require('../utils/logger');
const { validateFieldName, validatePreferenceKey, escapeLikeWildcards } = require('../utils/sqlSecurity');

class RecipientTargetingService {

  static async buildRecipientList(criteria) {
    try {
      let recipients = [];

      // Handle different targeting strategies
      switch (criteria.strategy) {
        case 'all_users':
          recipients = await this.getAllUsers(criteria);
          break;
        case 'user_segments':
          recipients = await this.getSegmentedUsers(criteria);
          break;
        case 'specific_users':
          recipients = await this.getSpecificUsers(criteria);
          break;
        case 'dynamic_query':
          recipients = await this.getDynamicQueryUsers(criteria);
          break;
        case 'custom_list':
          recipients = await this.getCustomListUsers(criteria);
          break;
        default:
          recipients = await this.getSegmentedUsers(criteria);
      }

      // Apply additional filters
      if (criteria.filters) {
        recipients = await this.applyFilters(recipients, criteria.filters);
      }

      // Apply exclusions
      if (criteria.exclusions) {
        recipients = await this.applyExclusions(recipients, criteria.exclusions);
      }

      // Limit recipients if specified
      if (criteria.limit && recipients.length > criteria.limit) {
        recipients = this.sampleRecipients(recipients, criteria.limit, criteria.sampling_method);
      }

      logger.info(`Built recipient list: ${recipients.length} recipients`);
      return recipients;
    } catch (error) {
      logger.error('Error building recipient list:', error);
      throw error;
    }
  }

  static async getAllUsers(criteria = {}) {
    let query = User.query()
      .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
      .where('is_active', true)
      .whereNotNull('telegram_user_id');

    // Apply basic filters
    if (criteria.roles && criteria.roles.length > 0) {
      query = query.whereIn('role', criteria.roles);
    }

    if (criteria.created_after) {
      query = query.where('created_at', '>=', criteria.created_after);
    }

    if (criteria.created_before) {
      query = query.where('created_at', '<=', criteria.created_before);
    }

    const users = await query;
    return this.formatRecipients(users);
  }

  static async getSegmentedUsers(criteria) {
    let query = User.query()
      .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
      .where('is_active', true)
      .whereNotNull('telegram_user_id');

    // Role-based targeting
    if (criteria.target_roles && criteria.target_roles.length > 0) {
      query = query.whereIn('role', criteria.target_roles);
    }

    // Date-based targeting
    if (criteria.registration_period) {
      const { start_date, end_date } = criteria.registration_period;
      if (start_date) query = query.where('created_at', '>=', start_date);
      if (end_date) query = query.where('created_at', '<=', end_date);
    }

    // Activity-based targeting
    if (criteria.activity_level) {
      // This would require additional tables/fields to track user activity
      // For now, we'll use a simple last_active_at filter
      switch (criteria.activity_level) {
        case 'active':
          query = query.where('updated_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // Last 7 days
          break;
        case 'inactive':
          query = query.where('updated_at', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // More than 30 days
          break;
        case 'new':
          query = query.where('created_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // Last 7 days
          break;
      }
    }

    // Preference-based targeting
    if (criteria.preferences) {
      Object.keys(criteria.preferences).forEach(key => {
        const safeKey = validatePreferenceKey(key);
        const value = criteria.preferences[key];
        query = query.whereRaw('JSON_EXTRACT(preferences, ?) = ?', [`$.${safeKey}`, value]);
      });
    }

    // Notification settings
    if (criteria.notification_preferences) {
      if (criteria.notification_preferences.email) {
        query = query.where('email_notifications', true);
      }
      if (criteria.notification_preferences.sms) {
        query = query.where('sms_notifications', true);
      }
    }

    const users = await query;
    return this.formatRecipients(users);
  }

  static async getSpecificUsers(criteria) {
    if (!criteria.user_ids || criteria.user_ids.length === 0) {
      return [];
    }

    const users = await User.query()
      .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
      .whereIn('id', criteria.user_ids)
      .where('is_active', true)
      .whereNotNull('telegram_user_id');

    return this.formatRecipients(users);
  }

  static async getDynamicQueryUsers(criteria) {
    let query = User.query()
      .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
      .where('is_active', true)
      .whereNotNull('telegram_user_id');

    // Apply dynamic conditions
    if (criteria.conditions && criteria.conditions.length > 0) {
      criteria.conditions.forEach(condition => {
        const { field, operator, value } = condition;
        const safeField = validateFieldName(field);

        switch (operator) {
          case 'equals':
            query = query.where(safeField, value);
            break;
          case 'not_equals':
            query = query.where(safeField, '!=', value);
            break;
          case 'greater_than':
            query = query.where(safeField, '>', value);
            break;
          case 'less_than':
            query = query.where(safeField, '<', value);
            break;
          case 'greater_equal':
            query = query.where(safeField, '>=', value);
            break;
          case 'less_equal':
            query = query.where(safeField, '<=', value);
            break;
          case 'like':
            query = query.where(safeField, 'like', `%${escapeLikeWildcards(value)}%`);
            break;
          case 'in':
            query = query.whereIn(safeField, Array.isArray(value) ? value : [value]);
            break;
          case 'not_in':
            query = query.whereNotIn(safeField, Array.isArray(value) ? value : [value]);
            break;
          case 'is_null':
            query = query.whereNull(safeField);
            break;
          case 'is_not_null':
            query = query.whereNotNull(safeField);
            break;
          case 'json_contains':
            query = query.whereRaw('JSON_CONTAINS(preferences, ?)', [JSON.stringify(value)]);
            break;
          case 'json_extract':
            const safePath = validatePreferenceKey(value.path.replace('$.', ''));
            query = query.whereRaw('JSON_EXTRACT(preferences, ?) = ?', [`$.${safePath}`, value.value]);
            break;
        }
      });
    }

    const users = await query;
    return this.formatRecipients(users);
  }

  static async getCustomListUsers(criteria) {
    const { list_data, list_format = 'telegram_ids' } = criteria;
    
    if (!list_data || list_data.length === 0) {
      return [];
    }

    let userIdentifiers = [];
    
    switch (list_format) {
      case 'telegram_ids':
        userIdentifiers = list_data;
        break;
      case 'emails':
        const usersByEmail = await User.query()
          .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
          .whereIn('email', list_data)
          .where('is_active', true)
          .whereNotNull('telegram_user_id');
        return this.formatRecipients(usersByEmail);
      case 'phone_numbers':
        const usersByPhone = await User.query()
          .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
          .whereIn('phone', list_data)
          .where('is_active', true)
          .whereNotNull('telegram_user_id');
        return this.formatRecipients(usersByPhone);
      case 'user_ids':
        const usersById = await User.query()
          .select('id', 'telegram_user_id', 'first_name', 'last_name', 'role', 'preferences')
          .whereIn('id', list_data)
          .where('is_active', true)
          .whereNotNull('telegram_user_id');
        return this.formatRecipients(usersById);
    }

    // If we have telegram_user_ids, create recipients directly
    if (list_format === 'telegram_ids') {
      return list_data.map(telegramId => ({
        type: 'user',
        id: telegramId.toString(),
        user_id: null, // We don't have our internal user ID
        name: null,
        role: null
      }));
    }

    return [];
  }

  static async applyFilters(recipients, filters) {
    let filteredRecipients = [...recipients];

    // Time zone filter
    if (filters.timezone) {
      // This would require timezone data in user preferences
      filteredRecipients = filteredRecipients.filter(recipient => {
        const userTimezone = recipient.preferences?.timezone;
        return !userTimezone || userTimezone === filters.timezone;
      });
    }

    // Language filter
    if (filters.language) {
      filteredRecipients = filteredRecipients.filter(recipient => {
        const userLanguage = recipient.preferences?.language;
        return !userLanguage || userLanguage === filters.language;
      });
    }

    // Custom preference filters
    if (filters.custom_preferences) {
      Object.keys(filters.custom_preferences).forEach(key => {
        const expectedValue = filters.custom_preferences[key];
        filteredRecipients = filteredRecipients.filter(recipient => {
          const userValue = recipient.preferences?.[key];
          return userValue === expectedValue;
        });
      });
    }

    return filteredRecipients;
  }

  static async applyExclusions(recipients, exclusions) {
    let filteredRecipients = [...recipients];

    // Exclude specific user IDs
    if (exclusions.user_ids && exclusions.user_ids.length > 0) {
      filteredRecipients = filteredRecipients.filter(
        recipient => !exclusions.user_ids.includes(recipient.user_id)
      );
    }

    // Exclude specific Telegram IDs
    if (exclusions.telegram_ids && exclusions.telegram_ids.length > 0) {
      filteredRecipients = filteredRecipients.filter(
        recipient => !exclusions.telegram_ids.includes(recipient.id)
      );
    }

    // Exclude based on recent campaign participation
    if (exclusions.recent_campaigns && exclusions.recent_campaigns.length > 0) {
      // This would require querying recent recipients from those campaigns
      // For now, we'll skip this implementation
    }

    // Exclude based on roles
    if (exclusions.roles && exclusions.roles.length > 0) {
      filteredRecipients = filteredRecipients.filter(
        recipient => !exclusions.roles.includes(recipient.role)
      );
    }

    return filteredRecipients;
  }

  static sampleRecipients(recipients, limit, method = 'random') {
    if (recipients.length <= limit) {
      return recipients;
    }

    switch (method) {
      case 'random':
        return this.randomSample(recipients, limit);
      case 'first':
        return recipients.slice(0, limit);
      case 'last':
        return recipients.slice(-limit);
      case 'stratified':
        return this.stratifiedSample(recipients, limit);
      default:
        return this.randomSample(recipients, limit);
    }
  }

  static randomSample(recipients, limit) {
    const shuffled = [...recipients].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, limit);
  }

  static stratifiedSample(recipients, limit) {
    // Group by role
    const roleGroups = recipients.reduce((acc, recipient) => {
      const role = recipient.role || 'unknown';
      if (!acc[role]) acc[role] = [];
      acc[role].push(recipient);
      return acc;
    }, {});

    const roles = Object.keys(roleGroups);
    const samplePerRole = Math.floor(limit / roles.length);
    const remainder = limit % roles.length;

    let sampled = [];
    
    roles.forEach((role, index) => {
      const roleRecipients = roleGroups[role];
      const roleSampleSize = samplePerRole + (index < remainder ? 1 : 0);
      const roleSample = this.randomSample(roleRecipients, Math.min(roleSampleSize, roleRecipients.length));
      sampled = sampled.concat(roleSample);
    });

    return sampled.slice(0, limit);
  }

  static formatRecipients(users) {
    return users.map(user => ({
      type: 'user',
      id: user.telegram_user_id,
      user_id: user.id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      role: user.role,
      preferences: user.preferences
    }));
  }

  static validateCriteria(criteria) {
    const errors = [];

    if (!criteria.strategy) {
      errors.push('Targeting strategy is required');
    }

    const validStrategies = ['all_users', 'user_segments', 'specific_users', 'dynamic_query', 'custom_list'];
    if (criteria.strategy && !validStrategies.includes(criteria.strategy)) {
      errors.push(`Invalid targeting strategy. Must be one of: ${validStrategies.join(', ')}`);
    }

    if (criteria.strategy === 'specific_users') {
      if (!criteria.user_ids || !Array.isArray(criteria.user_ids) || criteria.user_ids.length === 0) {
        errors.push('user_ids array is required for specific_users strategy');
      }
    }

    if (criteria.strategy === 'custom_list') {
      if (!criteria.list_data || !Array.isArray(criteria.list_data) || criteria.list_data.length === 0) {
        errors.push('list_data array is required for custom_list strategy');
      }
    }

    if (criteria.strategy === 'dynamic_query') {
      if (!criteria.conditions || !Array.isArray(criteria.conditions) || criteria.conditions.length === 0) {
        errors.push('conditions array is required for dynamic_query strategy');
      }
    }

    if (criteria.limit && (typeof criteria.limit !== 'number' || criteria.limit <= 0)) {
      errors.push('limit must be a positive number');
    }

    return errors;
  }

  static async estimateRecipientCount(criteria) {
    try {
      const validationErrors = this.validateCriteria(criteria);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }

      let countQuery = User.query()
        .count('* as count')
        .where('is_active', true)
        .whereNotNull('telegram_user_id');

      // Apply the same logic as in getSegmentedUsers but for counting
      if (criteria.strategy === 'all_users' || criteria.strategy === 'user_segments') {
        if (criteria.target_roles && criteria.target_roles.length > 0) {
          countQuery = countQuery.whereIn('role', criteria.target_roles);
        }
        
        if (criteria.registration_period) {
          const { start_date, end_date } = criteria.registration_period;
          if (start_date) countQuery = countQuery.where('created_at', '>=', start_date);
          if (end_date) countQuery = countQuery.where('created_at', '<=', end_date);
        }
      }

      if (criteria.strategy === 'specific_users') {
        countQuery = countQuery.whereIn('id', criteria.user_ids || []);
      }

      if (criteria.strategy === 'custom_list') {
        return criteria.list_data ? criteria.list_data.length : 0;
      }

      const result = await countQuery.first();
      let estimatedCount = parseInt(result.count);

      // Apply limit if specified
      if (criteria.limit && estimatedCount > criteria.limit) {
        estimatedCount = criteria.limit;
      }

      return estimatedCount;
    } catch (error) {
      logger.error('Error estimating recipient count:', error);
      throw error;
    }
  }
}

module.exports = RecipientTargetingService;