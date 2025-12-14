const { Model } = require('objection');

class UserReminderPreferences extends Model {
  static get tableName() {
    return 'user_reminder_preferences';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['user_id'],
      properties: {
        id: { type: 'integer' },
        user_id: { type: 'integer' },
        
        default_telegram_enabled: { type: 'boolean' },
        default_email_enabled: { type: 'boolean' },
        default_sms_enabled: { type: 'boolean' },
        
        preferred_reminder_times: { type: 'array' },
        timezone: { type: 'string' },
        quiet_hours: { type: 'object' },
        preferred_days: { type: 'array' },
        
        preferred_language: { type: 'string', maxLength: 10 },
        include_appointment_details: { type: 'boolean' },
        include_cancellation_info: { type: 'boolean' },
        include_location_info: { type: 'boolean' },
        
        max_daily_reminders: { type: 'string' },
        max_daily_count: { type: 'integer' },
        group_similar_reminders: { type: 'boolean' },
        
        custom_templates: { type: 'object' },
        channel_settings: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'user_reminder_preferences.user_id',
          to: 'users.id'
        }
      }
    };
  }

  // Set defaults before insert
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    
    if (this.default_telegram_enabled === undefined) {
      this.default_telegram_enabled = true;
    }
    
    if (this.default_email_enabled === undefined) {
      this.default_email_enabled = false;
    }
    
    if (this.default_sms_enabled === undefined) {
      this.default_sms_enabled = false;
    }
    
    if (!this.timezone) {
      this.timezone = 'America/New_York';
    }
    
    if (!this.preferred_language) {
      this.preferred_language = 'en';
    }
    
    if (this.include_appointment_details === undefined) {
      this.include_appointment_details = true;
    }
    
    if (this.include_cancellation_info === undefined) {
      this.include_cancellation_info = true;
    }
    
    if (this.include_location_info === undefined) {
      this.include_location_info = true;
    }
    
    if (!this.max_daily_reminders) {
      this.max_daily_reminders = 'unlimited';
    }
    
    if (this.group_similar_reminders === undefined) {
      this.group_similar_reminders = false;
    }
  }

  // Channel preferences
  isTelegramEnabled() {
    return this.default_telegram_enabled === true;
  }

  isEmailEnabled() {
    return this.default_email_enabled === true;
  }

  isSmsEnabled() {
    return this.default_sms_enabled === true;
  }

  getEnabledChannels() {
    const channels = [];
    if (this.isTelegramEnabled()) channels.push('telegram');
    if (this.isEmailEnabled()) channels.push('email');
    if (this.isSmsEnabled()) channels.push('sms');
    return channels;
  }

  // Reminder timing preferences
  getPreferredReminderTimes() {
    return this.preferred_reminder_times || [60, 180, 720]; // Default: 1h, 3h, 12h
  }

  hasPreferredDays() {
    return this.preferred_days && this.preferred_days.length > 0;
  }

  isPreferredDay(dayOfWeek) {
    if (!this.hasPreferredDays()) return true; // All days are preferred if none specified
    return this.preferred_days.includes(dayOfWeek);
  }

  // Quiet hours check
  hasQuietHours() {
    return this.quiet_hours && (this.quiet_hours.start || this.quiet_hours.end);
  }

  isInQuietHours(time) {
    if (!this.hasQuietHours()) return false;
    
    const { start, end } = this.quiet_hours;
    if (!start || !end) return false;
    
    const currentHour = parseInt(time.split(':')[0]);
    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);
    
    if (startHour <= endHour) {
      // Same day quiet hours (e.g., 22:00 to 08:00 next day)
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Quiet hours span midnight (e.g., 22:00 to 08:00)
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  // Daily limits
  hasUnlimitedReminders() {
    return this.max_daily_reminders === 'unlimited';
  }

  hasReachedDailyLimit(todayCount) {
    if (this.hasUnlimitedReminders()) return false;
    return this.max_daily_count && todayCount >= this.max_daily_count;
  }

  // Content preferences
  shouldIncludeAppointmentDetails() {
    return this.include_appointment_details === true;
  }

  shouldIncludeCancellationInfo() {
    return this.include_cancellation_info === true;
  }

  shouldIncludeLocationInfo() {
    return this.include_location_info === true;
  }

  shouldGroupSimilarReminders() {
    return this.group_similar_reminders === true;
  }

  // Channel-specific settings
  getChannelSettings(channel) {
    if (!this.channel_settings || !this.channel_settings[channel]) {
      return this.getDefaultChannelSettings(channel);
    }
    
    return {
      ...this.getDefaultChannelSettings(channel),
      ...this.channel_settings[channel]
    };
  }

  getDefaultChannelSettings(channel) {
    const defaults = {
      telegram: {
        parse_mode: 'Markdown',
        disable_notification: false,
        disable_web_page_preview: true
      },
      email: {
        format: 'html',
        priority: 'normal',
        include_icalendar: false
      },
      sms: {
        max_length: 160,
        unicode: false,
        delivery_receipt: false
      }
    };
    
    return defaults[channel] || {};
  }

  async setChannelSettings(channel, settings) {
    const currentSettings = this.channel_settings || {};
    currentSettings[channel] = {
      ...this.getDefaultChannelSettings(channel),
      ...settings
    };
    
    await this.$query().patch({ channel_settings: currentSettings });
    this.channel_settings = currentSettings;
  }

  // Custom templates
  hasCustomTemplates() {
    return this.custom_templates && Object.keys(this.custom_templates).length > 0;
  }

  getCustomTemplate(templateName) {
    if (!this.hasCustomTemplates()) return null;
    return this.custom_templates[templateName];
  }

  async addCustomTemplate(name, template) {
    const templates = this.custom_templates || {};
    templates[name] = {
      ...template,
      created_at: new Date().toISOString()
    };
    
    await this.$query().patch({ custom_templates: templates });
    this.custom_templates = templates;
  }

  async removeCustomTemplate(name) {
    if (!this.hasCustomTemplates() || !this.custom_templates[name]) {
      return false;
    }
    
    const templates = { ...this.custom_templates };
    delete templates[name];
    
    await this.$query().patch({ custom_templates: templates });
    this.custom_templates = templates;
    
    return true;
  }

  // Update preferences
  async updateChannelPreferences(telegram, email, sms) {
    await this.$query().patch({
      default_telegram_enabled: telegram,
      default_email_enabled: email,
      default_sms_enabled: sms
    });
    
    this.default_telegram_enabled = telegram;
    this.default_email_enabled = email;
    this.default_sms_enabled = sms;
  }

  async updateReminderTimes(times) {
    // Validate times are positive integers
    const validTimes = times.filter(time => Number.isInteger(time) && time > 0);
    
    await this.$query().patch({
      preferred_reminder_times: validTimes
    });
    
    this.preferred_reminder_times = validTimes;
  }

  async updateQuietHours(start, end) {
    const quietHours = start && end ? { start, end } : null;
    
    await this.$query().patch({
      quiet_hours: quietHours
    });
    
    this.quiet_hours = quietHours;
  }

  async updateTimezone(timezone) {
    await this.$query().patch({ timezone });
    this.timezone = timezone;
  }

  async updateLanguage(language) {
    await this.$query().patch({
      preferred_language: language
    });
    this.preferred_language = language;
  }

  async updateContentPreferences(details, cancellation, location) {
    await this.$query().patch({
      include_appointment_details: details,
      include_cancellation_info: cancellation,
      include_location_info: location
    });
    
    this.include_appointment_details = details;
    this.include_cancellation_info = cancellation;
    this.include_location_info = location;
  }

  async updateDailyLimits(maxType, maxCount = null) {
    const updateData = {
      max_daily_reminders: maxType
    };
    
    if (maxType === 'limited' && maxCount) {
      updateData.max_daily_count = maxCount;
    } else {
      updateData.max_daily_count = null;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  async updateGroupingPreference(shouldGroup) {
    await this.$query().patch({
      group_similar_reminders: shouldGroup
    });
    this.group_similar_reminders = shouldGroup;
  }

  // Get effective settings for a reminder
  getEffectiveSettings(reminderType = 'general') {
    return {
      channels: this.getEnabledChannels(),
      reminder_times: this.getPreferredReminderTimes(),
      timezone: this.timezone,
      language: this.preferred_language,
      quiet_hours: this.quiet_hours,
      preferred_days: this.preferred_days,
      daily_limit: {
        type: this.max_daily_reminders,
        count: this.max_daily_count
      },
      content: {
        include_appointment_details: this.shouldIncludeAppointmentDetails(),
        include_cancellation_info: this.shouldIncludeCancellationInfo(),
        include_location_info: this.shouldIncludeLocationInfo()
      },
      grouping: this.shouldGroupSimilarReminders(),
      channel_settings: {
        telegram: this.getChannelSettings('telegram'),
        email: this.getChannelSettings('email'),
        sms: this.getChannelSettings('sms')
      }
    };
  }

  // Export preferences
  exportPreferences() {
    return {
      channels: {
        telegram: this.default_telegram_enabled,
        email: this.default_email_enabled,
        sms: this.default_sms_enabled
      },
      timing: {
        preferred_reminder_times: this.preferred_reminder_times,
        timezone: this.timezone,
        quiet_hours: this.quiet_hours,
        preferred_days: this.preferred_days
      },
      content: {
        preferred_language: this.preferred_language,
        include_appointment_details: this.include_appointment_details,
        include_cancellation_info: this.include_cancellation_info,
        include_location_info: this.include_location_info
      },
      limits: {
        max_daily_reminders: this.max_daily_reminders,
        max_daily_count: this.max_daily_count,
        group_similar_reminders: this.group_similar_reminders
      },
      customization: {
        custom_templates: this.custom_templates,
        channel_settings: this.channel_settings
      }
    };
  }

  // Static methods
  static async findOrCreateForUser(userId) {
    let preferences = await this.query().where('user_id', userId).first();
    
    if (!preferences) {
      preferences = await this.query().insert({ user_id: userId });
    }
    
    return preferences;
  }

  static async findByUser(userId) {
    return this.query()
      .where('user_id', userId)
      .withGraphFetched('[user]')
      .first();
  }

  static async getDefaultPreferences() {
    return {
      default_telegram_enabled: true,
      default_email_enabled: false,
      default_sms_enabled: false,
      preferred_reminder_times: [60, 180, 720],
      timezone: 'America/New_York',
      preferred_language: 'en',
      include_appointment_details: true,
      include_cancellation_info: true,
      include_location_info: true,
      max_daily_reminders: 'unlimited',
      group_similar_reminders: false
    };
  }

  static async bulkUpdatePreferences(userIds, preferences) {
    return this.query()
      .whereIn('user_id', userIds)
      .patch(preferences);
  }

  // Analytics
  static async getPreferencesAnalytics() {
    const allPreferences = await this.query();
    
    const analytics = {
      total_users: allPreferences.length,
      channel_preferences: {
        telegram_enabled: allPreferences.filter(p => p.default_telegram_enabled).length,
        email_enabled: allPreferences.filter(p => p.default_email_enabled).length,
        sms_enabled: allPreferences.filter(p => p.default_sms_enabled).length
      },
      timing_preferences: {
        has_quiet_hours: allPreferences.filter(p => p.quiet_hours).length,
        has_preferred_days: allPreferences.filter(p => p.preferred_days && p.preferred_days.length > 0).length,
        custom_reminder_times: allPreferences.filter(p => p.preferred_reminder_times && p.preferred_reminder_times.length > 3).length
      },
      content_preferences: {
        include_details: allPreferences.filter(p => p.include_appointment_details).length,
        include_cancellation: allPreferences.filter(p => p.include_cancellation_info).length,
        include_location: allPreferences.filter(p => p.include_location_info).length,
        group_reminders: allPreferences.filter(p => p.group_similar_reminders).length
      },
      languages: {}
    };
    
    // Count languages
    allPreferences.forEach(pref => {
      const lang = pref.preferred_language || 'en';
      analytics.languages[lang] = (analytics.languages[lang] || 0) + 1;
    });
    
    // Calculate percentages
    Object.keys(analytics.channel_preferences).forEach(key => {
      analytics.channel_preferences[key + '_percentage'] = 
        Math.round((analytics.channel_preferences[key] / analytics.total_users) * 100);
    });
    
    return analytics;
  }
}

module.exports = UserReminderPreferences;