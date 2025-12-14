const { Model } = require('objection');

class BroadcastCampaign extends Model {
  static get tableName() {
    return 'broadcast_campaigns';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'status', 'type'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        description: { type: 'string' },
        status: { 
          type: 'string', 
          enum: ['draft', 'scheduled', 'sending', 'completed', 'paused', 'cancelled'] 
        },
        type: { 
          type: 'string', 
          enum: ['broadcast', 'announcement', 'ab_test'] 
        },
        created_by: { type: 'integer' },
        scheduled_at: { type: 'string', format: 'date-time' },
        sent_at: { type: 'string', format: 'date-time' },
        total_recipients: { type: 'integer', minimum: 0 },
        sent_count: { type: 'integer', minimum: 0 },
        delivered_count: { type: 'integer', minimum: 0 },
        failed_count: { type: 'integer', minimum: 0 },
        targeting_criteria: { type: 'object' },
        ab_test_config: { type: 'object' },
        delivery_settings: { type: 'object' },
        statistics: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const BroadcastMessage = require('./BroadcastMessage');
    const BroadcastRecipient = require('./BroadcastRecipient');
    const BroadcastAnalytics = require('./BroadcastAnalytics');

    return {
      creator: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'broadcast_campaigns.created_by',
          to: 'users.id'
        }
      },

      messages: {
        relation: Model.HasManyRelation,
        modelClass: BroadcastMessage,
        join: {
          from: 'broadcast_campaigns.id',
          to: 'broadcast_messages.campaign_id'
        }
      },

      recipients: {
        relation: Model.HasManyRelation,
        modelClass: BroadcastRecipient,
        join: {
          from: 'broadcast_campaigns.id',
          to: 'broadcast_recipients.campaign_id'
        }
      },

      analytics: {
        relation: Model.HasManyRelation,
        modelClass: BroadcastAnalytics,
        join: {
          from: 'broadcast_campaigns.id',
          to: 'broadcast_analytics.campaign_id'
        }
      }
    };
  }

  // Campaign status methods
  isDraft() {
    return this.status === 'draft';
  }

  isScheduled() {
    return this.status === 'scheduled';
  }

  isSending() {
    return this.status === 'sending';
  }

  isCompleted() {
    return this.status === 'completed';
  }

  isPaused() {
    return this.status === 'paused';
  }

  isCancelled() {
    return this.status === 'cancelled';
  }

  // Type methods
  isBroadcast() {
    return this.type === 'broadcast';
  }

  isAnnouncement() {
    return this.type === 'announcement';
  }

  isABTest() {
    return this.type === 'ab_test';
  }

  // Progress calculation
  getProgressPercentage() {
    if (this.total_recipients === 0) return 0;
    return Math.round((this.sent_count / this.total_recipients) * 100);
  }

  getDeliveryRate() {
    if (this.sent_count === 0) return 0;
    return Math.round((this.delivered_count / this.sent_count) * 100);
  }

  getFailureRate() {
    if (this.sent_count === 0) return 0;
    return Math.round((this.failed_count / this.sent_count) * 100);
  }

  // Status updates
  async markAsScheduled(scheduledAt) {
    return await this.$query().patch({
      status: 'scheduled',
      scheduled_at: scheduledAt
    });
  }

  async markAsSending() {
    return await this.$query().patch({
      status: 'sending',
      sent_at: new Date().toISOString()
    });
  }

  async markAsCompleted() {
    return await this.$query().patch({
      status: 'completed'
    });
  }

  async markAsPaused() {
    return await this.$query().patch({
      status: 'paused'
    });
  }

  async markAsCancelled() {
    return await this.$query().patch({
      status: 'cancelled'
    });
  }

  // Statistics updates
  async updateStatistics(stats) {
    const currentStats = this.statistics || {};
    const updatedStats = { ...currentStats, ...stats };
    
    return await this.$query().patch({
      statistics: updatedStats
    });
  }

  async incrementSentCount(count = 1) {
    return await this.$query().increment('sent_count', count);
  }

  async incrementDeliveredCount(count = 1) {
    return await this.$query().increment('delivered_count', count);
  }

  async incrementFailedCount(count = 1) {
    return await this.$query().increment('failed_count', count);
  }

  // Static methods
  static async findActive() {
    return this.query()
      .whereIn('status', ['scheduled', 'sending'])
      .orderBy('scheduled_at', 'asc');
  }

  static async findByStatus(status) {
    return this.query()
      .where('status', status)
      .orderBy('created_at', 'desc');
  }

  static async findByCreator(userId) {
    return this.query()
      .where('created_by', userId)
      .orderBy('created_at', 'desc');
  }

  static async getStatsSummary() {
    const result = await this.query()
      .select('status')
      .count('* as count')
      .groupBy('status');
    
    return result.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});
  }
}

module.exports = BroadcastCampaign;