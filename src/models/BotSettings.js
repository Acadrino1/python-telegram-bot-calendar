const { Model } = require('objection');

class BotSettings extends Model {
  static get tableName() {
    return 'bot_settings';
  }

  static get idColumn() {
    return 'id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['setting_key', 'setting_value'],
      properties: {
        id: { type: 'integer' },
        setting_key: { type: 'string', maxLength: 100 },
        setting_value: { type: 'string' },
        setting_type: { type: 'string', enum: ['string', 'number', 'boolean', 'json'] },
        category: { type: 'string', maxLength: 50 },
        description: { type: 'string', maxLength: 255 },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  // In-memory cache for settings
  static _cache = new Map();
  static _cacheExpiry = null;
  static _cacheTTL = 60000; // 1 minute cache

  /**
   * Get a setting value by key
   */
  static async get(key, defaultValue = null) {
    try {
      // Check cache first
      if (this._cache.has(key) && this._cacheExpiry && Date.now() < this._cacheExpiry) {
        return this._cache.get(key);
      }

      const setting = await this.query().where('setting_key', key).first();
      if (!setting) return defaultValue;

      const value = this.parseValue(setting.setting_value, setting.setting_type);
      this._cache.set(key, value);
      this._cacheExpiry = Date.now() + this._cacheTTL;

      return value;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Set a setting value
   */
  static async set(key, value) {
    try {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      await this.query()
        .where('setting_key', key)
        .patch({
          setting_value: stringValue,
          updated_at: new Date().toISOString()
        });

      // Update cache
      this._cache.set(key, value);

      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Get all settings for a category
   */
  static async getByCategory(category) {
    try {
      const settings = await this.query().where('category', category);
      const result = {};

      for (const setting of settings) {
        result[setting.setting_key] = {
          value: this.parseValue(setting.setting_value, setting.setting_type),
          type: setting.setting_type,
          description: setting.description
        };
      }

      return result;
    } catch (error) {
      console.error(`Error getting settings for ${category}:`, error.message);
      return {};
    }
  }

  /**
   * Get all settings grouped by category
   */
  static async getAll() {
    try {
      const settings = await this.query().orderBy('category').orderBy('setting_key');
      const grouped = {};

      for (const setting of settings) {
        if (!grouped[setting.category]) {
          grouped[setting.category] = {};
        }
        grouped[setting.category][setting.setting_key] = {
          value: this.parseValue(setting.setting_value, setting.setting_type),
          type: setting.setting_type,
          description: setting.description
        };
      }

      return grouped;
    } catch (error) {
      console.error('Error getting all settings:', error.message);
      return {};
    }
  }

  /**
   * Parse a string value to its proper type
   */
  static parseValue(value, type) {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Clear the settings cache
   */
  static clearCache() {
    this._cache.clear();
    this._cacheExpiry = null;
  }

  /**
   * Helper methods for common settings
   */
  static async isNotificationsEnabled() {
    return await this.get('notifications_enabled', true);
  }

  static async isNewBookingNotificationEnabled() {
    return await this.get('new_booking_notification', true);
  }

  static async isCancellationNotificationEnabled() {
    return await this.get('cancellation_notification', true);
  }

  static async getSlotWarningThreshold() {
    return await this.get('slot_warning_threshold', 2);
  }

  static async isCouponDropsEnabled() {
    return await this.get('coupon_drops_enabled', true);
  }

  static async getCouponDropFrequency() {
    return await this.get('coupon_drop_frequency', 1);
  }

  static async getCouponWeeklyBudget() {
    return await this.get('coupon_weekly_budget', 100);
  }

  static async getMaxSlotsPerDay() {
    return await this.get('max_slots_per_day', 6);
  }

  static async getCouponDropHours() {
    const start = await this.get('coupon_drop_start_hour', 11);
    const end = await this.get('coupon_drop_end_hour', 20);
    return { start, end };
  }
}

module.exports = BotSettings;
