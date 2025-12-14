const { Model } = require('objection');
const moment = require('moment-timezone');

class ReminderDeliveryLog extends Model {
  static get tableName() {
    return 'reminder_delivery_logs';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['custom_reminder_id', 'user_id', 'delivery_channel', 'recipient', 'status'],
      properties: {
        id: { type: 'integer' },
        custom_reminder_id: { type: 'integer' },
        user_id: { type: 'integer' },
        
        delivery_channel: { type: 'string', enum: ['telegram', 'email', 'sms'] },
        recipient: { type: 'string', minLength: 1, maxLength: 255 },
        message_content: { type: 'string' },
        subject: { type: 'string', maxLength: 255 },
        
        status: { type: 'string', enum: ['sent', 'failed', 'pending', 'retrying'] },
        response_data: { type: 'string' },
        error_message: { type: 'string' },
        sent_at: { type: 'string', format: 'date-time' },
        delivered_at: { type: 'string', format: 'date-time' },
        read_at: { type: 'string', format: 'date-time' },
        
        attempt_number: { type: 'integer', minimum: 1 },
        next_retry_at: { type: 'string', format: 'date-time' },
        
        metadata: { type: 'object' },
        cost: { type: 'number', minimum: 0 }
      }
    };
  }

  static get relationMappings() {
    const CustomReminder = require('./CustomReminder');
    const User = require('./User');

    return {
      customReminder: {
        relation: Model.BelongsToOneRelation,
        modelClass: CustomReminder,
        join: {
          from: 'reminder_delivery_logs.custom_reminder_id',
          to: 'custom_reminders.id'
        }
      },

      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'reminder_delivery_logs.user_id',
          to: 'users.id'
        }
      }
    };
  }

  // Set defaults before insert
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    
    if (!this.attempt_number) {
      this.attempt_number = 1;
    }
    
    if (!this.status) {
      this.status = 'pending';
    }
  }

  // Status check methods
  isSent() {
    return this.status === 'sent';
  }

  isFailed() {
    return this.status === 'failed';
  }

  isPending() {
    return this.status === 'pending';
  }

  isRetrying() {
    return this.status === 'retrying';
  }

  // Channel check methods
  isTelegram() {
    return this.delivery_channel === 'telegram';
  }

  isEmail() {
    return this.delivery_channel === 'email';
  }

  isSms() {
    return this.delivery_channel === 'sms';
  }

  // Timing methods
  getDeliveryTime() {
    if (!this.sent_at) return null;
    return moment(this.sent_at).tz('America/New_York');
  }

  getTimeSinceSent() {
    if (!this.sent_at) return null;
    const now = moment().tz('America/New_York');
    const sent = this.getDeliveryTime();
    return now.diff(sent, 'minutes');
  }

  wasRecentlyDelivered(minutesThreshold = 30) {
    const timeSince = this.getTimeSinceSent();
    return timeSince !== null && timeSince <= minutesThreshold;
  }

  // State change methods
  async markSent(responseData = null) {
    const updateData = {
      status: 'sent',
      sent_at: new Date().toISOString(),
      error_message: null
    };
    
    if (responseData) {
      updateData.response_data = JSON.stringify(responseData);
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  async markDelivered(deliveryConfirmation = null) {
    const updateData = {
      delivered_at: new Date().toISOString()
    };
    
    if (deliveryConfirmation) {
      const metadata = this.metadata || {};
      metadata.delivery_confirmation = deliveryConfirmation;
      updateData.metadata = metadata;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  async markRead(readConfirmation = null) {
    const updateData = {
      read_at: new Date().toISOString()
    };
    
    if (readConfirmation) {
      const metadata = this.metadata || {};
      metadata.read_confirmation = readConfirmation;
      updateData.metadata = metadata;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  async markFailed(errorMessage, responseData = null) {
    const updateData = {
      status: 'failed',
      error_message: errorMessage
    };
    
    if (responseData) {
      updateData.response_data = JSON.stringify(responseData);
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  async scheduleRetry(retryAt, reason = null) {
    const updateData = {
      status: 'retrying',
      attempt_number: this.attempt_number + 1,
      next_retry_at: retryAt.toISOString()
    };
    
    if (reason) {
      const metadata = this.metadata || {};
      metadata.retry_history = metadata.retry_history || [];
      metadata.retry_history.push({
        attempt: this.attempt_number,
        reason: reason,
        scheduled_for: retryAt.toISOString(),
        scheduled_at: new Date().toISOString()
      });
      updateData.metadata = metadata;
    }
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Cost tracking
  async recordCost(amount, currency = 'USD', details = null) {
    const updateData = {
      cost: amount
    };
    
    const metadata = this.metadata || {};
    metadata.cost_details = {
      amount: amount,
      currency: currency,
      details: details,
      recorded_at: new Date().toISOString()
    };
    updateData.metadata = metadata;
    
    await this.$query().patch(updateData);
    Object.assign(this, updateData);
  }

  // Performance metrics
  getDeliveryMetrics() {
    const metrics = {
      attempts: this.attempt_number,
      final_status: this.status,
      has_cost: this.cost !== null && this.cost > 0,
      cost: this.cost || 0
    };
    
    if (this.sent_at) {
      metrics.delivery_time = this.sent_at;
      
      if (this.delivered_at) {
        const sent = moment(this.sent_at);
        const delivered = moment(this.delivered_at);
        metrics.delivery_duration_seconds = delivered.diff(sent, 'seconds');
      }
      
      if (this.read_at) {
        const sent = moment(this.sent_at);
        const read = moment(this.read_at);
        metrics.read_duration_seconds = read.diff(sent, 'seconds');
      }
    }
    
    return metrics;
  }

  // Static query methods
  static async findByReminder(customReminderId) {
    return this.query()
      .where('custom_reminder_id', customReminderId)
      .withGraphFetched('[user]')
      .orderBy('attempt_number', 'asc');
  }

  static async findByUser(userId, startDate = null, endDate = null) {
    const query = this.query()
      .where('user_id', userId)
      .withGraphFetched('[customReminder]')
      .orderBy('sent_at', 'desc');
    
    if (startDate) {
      query.where('sent_at', '>=', startDate);
    }
    
    if (endDate) {
      query.where('sent_at', '<=', endDate);
    }
    
    return query;
  }

  static async findByChannel(channel, status = null) {
    const query = this.query()
      .where('delivery_channel', channel)
      .withGraphFetched('[customReminder, user]')
      .orderBy('sent_at', 'desc');
    
    if (status) {
      query.where('status', status);
    }
    
    return query;
  }

  static async findFailed(sinceDate = null) {
    const query = this.query()
      .where('status', 'failed')
      .withGraphFetched('[customReminder, user]')
      .orderBy('sent_at', 'desc');
    
    if (sinceDate) {
      query.where('sent_at', '>=', sinceDate);
    }
    
    return query;
  }

  static async findPendingRetries() {
    const now = new Date().toISOString();
    
    return this.query()
      .where('status', 'retrying')
      .where('next_retry_at', '<=', now)
      .withGraphFetched('[customReminder, user]')
      .orderBy('next_retry_at', 'asc');
  }

  static async findRecentDeliveries(minutesBack = 60) {
    const since = moment().subtract(minutesBack, 'minutes').toISOString();
    
    return this.query()
      .where('status', 'sent')
      .where('sent_at', '>=', since)
      .withGraphFetched('[customReminder, user]')
      .orderBy('sent_at', 'desc');
  }

  // Analytics methods
  static async getDeliveryStatistics(startDate, endDate, channel = null) {
    let query = this.query()
      .where('sent_at', '>=', startDate)
      .where('sent_at', '<=', endDate);
    
    if (channel) {
      query = query.where('delivery_channel', channel);
    }
    
    const logs = await query;
    
    const stats = {
      total: logs.length,
      by_status: {
        sent: logs.filter(l => l.status === 'sent').length,
        failed: logs.filter(l => l.status === 'failed').length,
        pending: logs.filter(l => l.status === 'pending').length,
        retrying: logs.filter(l => l.status === 'retrying').length
      },
      by_channel: {
        telegram: logs.filter(l => l.delivery_channel === 'telegram').length,
        email: logs.filter(l => l.delivery_channel === 'email').length,
        sms: logs.filter(l => l.delivery_channel === 'sms').length
      },
      by_attempts: {
        first_attempt: logs.filter(l => l.attempt_number === 1).length,
        retry_attempts: logs.filter(l => l.attempt_number > 1).length,
        max_attempts: Math.max(...logs.map(l => l.attempt_number), 0)
      }
    };
    
    // Calculate rates
    if (stats.total > 0) {
      stats.success_rate = Math.round((stats.by_status.sent / stats.total) * 100);
      stats.failure_rate = Math.round((stats.by_status.failed / stats.total) * 100);
      stats.first_attempt_success_rate = Math.round(
        (logs.filter(l => l.status === 'sent' && l.attempt_number === 1).length / stats.total) * 100
      );
    } else {
      stats.success_rate = 0;
      stats.failure_rate = 0;
      stats.first_attempt_success_rate = 0;
    }
    
    // Calculate costs
    const costLogs = logs.filter(l => l.cost !== null && l.cost > 0);
    stats.cost_info = {
      total_cost: costLogs.reduce((sum, l) => sum + (l.cost || 0), 0),
      average_cost: costLogs.length > 0 
        ? costLogs.reduce((sum, l) => sum + (l.cost || 0), 0) / costLogs.length
        : 0,
      costly_deliveries: costLogs.length
    };
    
    // Calculate performance metrics
    const sentLogs = logs.filter(l => l.status === 'sent' && l.sent_at);
    if (sentLogs.length > 0) {
      const deliveryTimes = sentLogs
        .filter(l => l.delivered_at)
        .map(l => moment(l.delivered_at).diff(moment(l.sent_at), 'seconds'));
      
      if (deliveryTimes.length > 0) {
        stats.performance = {
          average_delivery_time_seconds: deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length,
          fastest_delivery_seconds: Math.min(...deliveryTimes),
          slowest_delivery_seconds: Math.max(...deliveryTimes)
        };
      }
    }
    
    return stats;
  }

  static async getChannelPerformance(startDate, endDate) {
    const channels = ['telegram', 'email', 'sms'];
    const performance = {};
    
    for (const channel of channels) {
      const stats = await this.getDeliveryStatistics(startDate, endDate, channel);
      performance[channel] = stats;
    }
    
    return performance;
  }

  static async getHourlyDeliveryPattern(date) {
    const startOfDay = moment(date).startOf('day').toISOString();
    const endOfDay = moment(date).endOf('day').toISOString();
    
    const logs = await this.query()
      .where('sent_at', '>=', startOfDay)
      .where('sent_at', '<=', endOfDay)
      .where('status', 'sent')
      .orderBy('sent_at');
    
    const hourlyData = {};
    
    // Initialize all hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyData[hour] = {
        total: 0,
        telegram: 0,
        email: 0,
        sms: 0
      };
    }
    
    // Populate with actual data
    logs.forEach(log => {
      const hour = moment(log.sent_at).hour();
      hourlyData[hour].total++;
      hourlyData[hour][log.delivery_channel]++;
    });
    
    return hourlyData;
  }

  // Cleanup methods
  static async cleanupOldLogs(daysOld = 90) {
    const cutoffDate = moment().subtract(daysOld, 'days').toISOString();
    
    const deletedCount = await this.query()
      .where('sent_at', '<', cutoffDate)
      .whereIn('status', ['sent', 'failed'])
      .del();
    
    return deletedCount;
  }

  static async archiveOldLogs(daysOld = 180) {
    const cutoffDate = moment().subtract(daysOld, 'days').toISOString();
    
    // This would typically move logs to an archive table
    // For now, we'll just mark them for archival
    const archived = await this.query()
      .where('sent_at', '<', cutoffDate)
      .patch({
        metadata: this.knex().raw("JSON_SET(COALESCE(metadata, '{}'), '$.archived', true)")
      });
    
    return archived;
  }
}

module.exports = ReminderDeliveryLog;