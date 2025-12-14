const { Model } = require('objection');
const moment = require('moment-timezone');

class RecurringPattern extends Model {
  static get tableName() {
    return 'recurring_patterns';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'pattern_type'],
      properties: {
        id: { type: 'integer' },
        uuid: { type: 'string', format: 'uuid' },
        
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: 'string' },
        pattern_type: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'] },
        interval_value: { type: 'integer', minimum: 1 },
        pattern_config: { type: 'object' },
        
        days_of_week: { type: 'array' },
        weeks_of_month: { type: 'array' },
        days_of_month: { type: 'array' },
        months_of_year: { type: 'array' },
        
        timezone: { type: 'string' },
        preferred_time: { type: 'string' },
        exclusion_dates: { type: 'array' },
        inclusion_dates: { type: 'array' },
        
        is_active: { type: 'boolean' },
        is_template: { type: 'boolean' }
      }
    };
  }

  static get relationMappings() {
    const CustomReminder = require('./CustomReminder');

    return {
      customReminders: {
        relation: Model.HasManyRelation,
        modelClass: CustomReminder,
        join: {
          from: 'recurring_patterns.id',
          to: 'custom_reminders.recurring_pattern_id'
        }
      }
    };
  }

  // Set defaults before insert
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    
    if (!this.uuid) {
      this.uuid = require('uuid').v4();
    }
    
    if (this.interval_value === undefined) {
      this.interval_value = 1;
    }
    
    if (!this.timezone) {
      this.timezone = 'America/New_York';
    }
    
    if (this.is_active === undefined) {
      this.is_active = true;
    }
    
    if (this.is_template === undefined) {
      this.is_template = false;
    }
  }

  // Pattern type checks
  isDaily() {
    return this.pattern_type === 'daily';
  }

  isWeekly() {
    return this.pattern_type === 'weekly';
  }

  isMonthly() {
    return this.pattern_type === 'monthly';
  }

  isYearly() {
    return this.pattern_type === 'yearly';
  }

  isCustom() {
    return this.pattern_type === 'custom';
  }

  // Status checks
  isActive() {
    return this.is_active === true;
  }

  isTemplate() {
    return this.is_template === true;
  }

  // Calculate next occurrence
  getNextOccurrence(fromDate = null, count = 1) {
    const baseDate = fromDate ? moment(fromDate).tz(this.timezone) : moment().tz(this.timezone);
    const occurrences = [];
    
    let currentDate = baseDate.clone();
    
    for (let i = 0; i < count; i++) {
      const nextDate = this.calculateNextDate(currentDate);
      if (nextDate) {
        occurrences.push(nextDate);
        currentDate = nextDate.clone();
      } else {
        break;
      }
    }
    
    return count === 1 ? occurrences[0] : occurrences;
  }

  calculateNextDate(fromDate) {
    const current = fromDate.clone();
    
    switch (this.pattern_type) {
      case 'daily':
        return this.calculateDailyNext(current);
      case 'weekly':
        return this.calculateWeeklyNext(current);
      case 'monthly':
        return this.calculateMonthlyNext(current);
      case 'yearly':
        return this.calculateYearlyNext(current);
      case 'custom':
        return this.calculateCustomNext(current);
      default:
        return null;
    }
  }

  calculateDailyNext(fromDate) {
    const nextDate = fromDate.clone().add(this.interval_value, 'days');
    
    // Apply preferred time if specified
    if (this.preferred_time) {
      const [hours, minutes] = this.preferred_time.split(':');
      nextDate.hour(parseInt(hours)).minute(parseInt(minutes)).second(0);
    }
    
    return this.applyExclusions(nextDate) ? this.calculateDailyNext(nextDate) : nextDate;
  }

  calculateWeeklyNext(fromDate) {
    if (!this.days_of_week || this.days_of_week.length === 0) {
      // Default to same day of week
      const nextDate = fromDate.clone().add(this.interval_value, 'weeks');
      if (this.preferred_time) {
        const [hours, minutes] = this.preferred_time.split(':');
        nextDate.hour(parseInt(hours)).minute(parseInt(minutes)).second(0);
      }
      return this.applyExclusions(nextDate) ? this.calculateWeeklyNext(nextDate) : nextDate;
    }
    
    // Find next occurrence on specified days
    let currentDate = fromDate.clone().add(1, 'day');
    const maxIterations = 7 * this.interval_value + 7; // Safety limit
    let iterations = 0;
    
    while (iterations < maxIterations) {
      const dayOfWeek = currentDate.day();
      
      if (this.days_of_week.includes(dayOfWeek)) {
        if (this.preferred_time) {
          const [hours, minutes] = this.preferred_time.split(':');
          currentDate.hour(parseInt(hours)).minute(parseInt(minutes)).second(0);
        }
        
        if (!this.applyExclusions(currentDate)) {
          return currentDate;
        }
      }
      
      currentDate.add(1, 'day');
      iterations++;
    }
    
    return null;
  }

  calculateMonthlyNext(fromDate) {
    let nextDate = fromDate.clone();
    
    if (this.days_of_month && this.days_of_month.length > 0) {
      // Specific days of month
      const currentDay = nextDate.date();
      let targetDay = null;
      
      // Find next day in this month or next month
      for (const day of this.days_of_month.sort((a, b) => a - b)) {
        if (day > currentDay) {
          targetDay = day;
          break;
        }
      }
      
      if (targetDay) {
        nextDate.date(targetDay);
      } else {
        // Move to next month and use first day from list
        nextDate.add(this.interval_value, 'months').date(this.days_of_month[0]);
      }
    } else {
      // Same day of month
      nextDate.add(this.interval_value, 'months');
    }
    
    // Handle months with fewer days
    const maxDay = nextDate.daysInMonth();
    if (nextDate.date() > maxDay) {
      nextDate.date(maxDay);
    }
    
    if (this.preferred_time) {
      const [hours, minutes] = this.preferred_time.split(':');
      nextDate.hour(parseInt(hours)).minute(parseInt(minutes)).second(0);
    }
    
    return this.applyExclusions(nextDate) ? this.calculateMonthlyNext(nextDate) : nextDate;
  }

  calculateYearlyNext(fromDate) {
    let nextDate = fromDate.clone().add(this.interval_value, 'years');
    
    if (this.months_of_year && this.months_of_year.length > 0) {
      // Specific months
      const currentMonth = fromDate.month() + 1; // moment uses 0-based months
      let targetMonth = null;
      
      for (const month of this.months_of_year.sort((a, b) => a - b)) {
        if (month > currentMonth) {
          targetMonth = month;
          break;
        }
      }
      
      if (targetMonth) {
        nextDate = fromDate.clone().month(targetMonth - 1); // Convert back to 0-based
      } else {
        nextDate = fromDate.clone().add(this.interval_value, 'years').month(this.months_of_year[0] - 1);
      }
    }
    
    // Apply day of month if specified
    if (this.days_of_month && this.days_of_month.length > 0) {
      const targetDay = this.days_of_month[0];
      const maxDay = nextDate.daysInMonth();
      nextDate.date(Math.min(targetDay, maxDay));
    }
    
    if (this.preferred_time) {
      const [hours, minutes] = this.preferred_time.split(':');
      nextDate.hour(parseInt(hours)).minute(parseInt(minutes)).second(0);
    }
    
    return this.applyExclusions(nextDate) ? this.calculateYearlyNext(nextDate) : nextDate;
  }

  calculateCustomNext(fromDate) {
    if (!this.pattern_config || !this.pattern_config.rule) {
      return null;
    }
    
    // Custom pattern logic would be implemented here
    // This could support complex patterns like "every 2nd Tuesday of the month"
    // For now, return null to indicate unsupported
    return null;
  }

  // Apply exclusion and inclusion rules
  applyExclusions(date) {
    const dateStr = date.format('YYYY-MM-DD');
    
    // Check exclusion dates
    if (this.exclusion_dates && this.exclusion_dates.includes(dateStr)) {
      return true; // Excluded
    }
    
    // Custom exclusion rules could be added here
    // For example, excluding weekends, holidays, etc.
    
    return false; // Not excluded
  }

  // Get all occurrences within a date range
  getOccurrencesBetween(startDate, endDate, maxCount = 100) {
    const start = moment(startDate).tz(this.timezone);
    const end = moment(endDate).tz(this.timezone);
    const occurrences = [];
    
    let currentDate = start.clone();
    let count = 0;
    
    while (currentDate.isBefore(end) && count < maxCount) {
      const nextDate = this.calculateNextDate(currentDate);
      
      if (!nextDate || nextDate.isAfter(end)) {
        break;
      }
      
      occurrences.push(nextDate.clone());
      currentDate = nextDate;
      count++;
    }
    
    return occurrences;
  }

  // Validate pattern configuration
  validatePattern() {
    const errors = [];
    
    switch (this.pattern_type) {
      case 'weekly':
        if (this.days_of_week) {
          const invalidDays = this.days_of_week.filter(day => day < 0 || day > 6);
          if (invalidDays.length > 0) {
            errors.push('Invalid days of week: must be 0-6 (Sunday-Saturday)');
          }
        }
        break;
      
      case 'monthly':
        if (this.days_of_month) {
          const invalidDays = this.days_of_month.filter(day => day < 1 || day > 31);
          if (invalidDays.length > 0) {
            errors.push('Invalid days of month: must be 1-31');
          }
        }
        if (this.weeks_of_month) {
          const invalidWeeks = this.weeks_of_month.filter(week => week < 1 || week > 5);
          if (invalidWeeks.length > 0) {
            errors.push('Invalid weeks of month: must be 1-5');
          }
        }
        break;
      
      case 'yearly':
        if (this.months_of_year) {
          const invalidMonths = this.months_of_year.filter(month => month < 1 || month > 12);
          if (invalidMonths.length > 0) {
            errors.push('Invalid months of year: must be 1-12');
          }
        }
        break;
    }
    
    if (this.interval_value < 1) {
      errors.push('Interval value must be at least 1');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  // Get human-readable description
  getDescription() {
    let desc = '';
    
    switch (this.pattern_type) {
      case 'daily':
        desc = this.interval_value === 1 ? 'Daily' : `Every ${this.interval_value} days`;
        break;
      
      case 'weekly':
        if (this.interval_value === 1) {
          desc = 'Weekly';
        } else {
          desc = `Every ${this.interval_value} weeks`;
        }
        
        if (this.days_of_week && this.days_of_week.length > 0) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const selectedDays = this.days_of_week.map(day => dayNames[day]);
          desc += ` on ${selectedDays.join(', ')}`;
        }
        break;
      
      case 'monthly':
        desc = this.interval_value === 1 ? 'Monthly' : `Every ${this.interval_value} months`;
        
        if (this.days_of_month && this.days_of_month.length > 0) {
          desc += ` on day(s) ${this.days_of_month.join(', ')}`;
        }
        break;
      
      case 'yearly':
        desc = this.interval_value === 1 ? 'Yearly' : `Every ${this.interval_value} years`;
        
        if (this.months_of_year && this.months_of_year.length > 0) {
          const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          const selectedMonths = this.months_of_year.map(month => monthNames[month - 1]);
          desc += ` in ${selectedMonths.join(', ')}`;
        }
        break;
      
      case 'custom':
        desc = this.description || 'Custom pattern';
        break;
    }
    
    if (this.preferred_time) {
      desc += ` at ${this.preferred_time}`;
    }
    
    return desc;
  }

  // State management
  async activate() {
    await this.$query().patch({ is_active: true });
    this.is_active = true;
  }

  async deactivate() {
    await this.$query().patch({ is_active: false });
    this.is_active = false;
  }

  async makeTemplate() {
    await this.$query().patch({ is_template: true });
    this.is_template = true;
  }

  // Clone pattern
  async clone(newName) {
    const clonedPattern = await RecurringPattern.query().insert({
      name: newName,
      description: this.description,
      pattern_type: this.pattern_type,
      interval_value: this.interval_value,
      pattern_config: this.pattern_config,
      days_of_week: this.days_of_week,
      weeks_of_month: this.weeks_of_month,
      days_of_month: this.days_of_month,
      months_of_year: this.months_of_year,
      timezone: this.timezone,
      preferred_time: this.preferred_time,
      exclusion_dates: this.exclusion_dates,
      inclusion_dates: this.inclusion_dates,
      is_active: false,
      is_template: false
    });
    
    return clonedPattern;
  }

  // Static methods
  static async findActive() {
    return this.query().where('is_active', true).orderBy('name');
  }

  static async findTemplates() {
    return this.query().where('is_template', true).orderBy('name');
  }

  static async findByType(patternType) {
    return this.query()
      .where('pattern_type', patternType)
      .where('is_active', true)
      .orderBy('name');
  }

  static async createDailyPattern(name, intervalDays = 1, preferredTime = null) {
    return this.query().insert({
      name: name,
      pattern_type: 'daily',
      interval_value: intervalDays,
      preferred_time: preferredTime,
      is_active: true
    });
  }

  static async createWeeklyPattern(name, daysOfWeek, intervalWeeks = 1, preferredTime = null) {
    return this.query().insert({
      name: name,
      pattern_type: 'weekly',
      interval_value: intervalWeeks,
      days_of_week: daysOfWeek,
      preferred_time: preferredTime,
      is_active: true
    });
  }

  static async createMonthlyPattern(name, daysOfMonth, intervalMonths = 1, preferredTime = null) {
    return this.query().insert({
      name: name,
      pattern_type: 'monthly',
      interval_value: intervalMonths,
      days_of_month: daysOfMonth,
      preferred_time: preferredTime,
      is_active: true
    });
  }

  // Get usage statistics
  async getUsageStats() {
    const CustomReminder = require('./CustomReminder');
    
    const reminders = await CustomReminder.query()
      .where('recurring_pattern_id', this.id);
    
    return {
      total_reminders: reminders.length,
      active_reminders: reminders.filter(r => r.status === 'scheduled').length,
      sent_reminders: reminders.filter(r => r.status === 'sent').length,
      failed_reminders: reminders.filter(r => r.status === 'failed').length
    };
  }
}

module.exports = RecurringPattern;