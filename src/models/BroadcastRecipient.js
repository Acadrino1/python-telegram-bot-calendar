const { Model } = require('objection');

class BroadcastRecipient extends Model {
  static get tableName() {
    return 'broadcast_recipients';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['campaign_id', 'message_id', 'recipient_type', 'recipient_id'],
      properties: {
        id: { type: 'integer' },
        campaign_id: { type: 'integer' },
        message_id: { type: 'integer' },
        recipient_type: { type: 'string', maxLength: 50 },
        recipient_id: { type: 'string', maxLength: 255 },
        user_id: { type: 'integer' },
        status: { 
          type: 'string', 
          enum: ['queued', 'sending', 'sent', 'delivered', 'failed', 'blocked'] 
        },
        telegram_message_id: { type: 'string', maxLength: 255 },
        queued_at: { type: 'string', format: 'date-time' },
        sent_at: { type: 'string', format: 'date-time' },
        delivered_at: { type: 'string', format: 'date-time' },
        error_details: { type: 'object' },
        retry_count: { type: 'integer', minimum: 0 },
        next_retry_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  static get relationMappings() {
    const BroadcastCampaign = require('./BroadcastCampaign');
    const BroadcastMessage = require('./BroadcastMessage');
    const User = require('./User');

    return {
      campaign: {
        relation: Model.BelongsToOneRelation,
        modelClass: BroadcastCampaign,
        join: {
          from: 'broadcast_recipients.campaign_id',
          to: 'broadcast_campaigns.id'
        }
      },

      message: {
        relation: Model.BelongsToOneRelation,
        modelClass: BroadcastMessage,
        join: {
          from: 'broadcast_recipients.message_id',
          to: 'broadcast_messages.id'
        }
      },

      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'broadcast_recipients.user_id',
          to: 'users.id'
        }
      }
    };
  }

  // Status check methods
  isQueued() {
    return this.status === 'queued';
  }

  isSending() {
    return this.status === 'sending';
  }

  isSent() {
    return this.status === 'sent';
  }

  isDelivered() {
    return this.status === 'delivered';
  }

  isFailed() {
    return this.status === 'failed';
  }

  isBlocked() {
    return this.status === 'blocked';
  }

  // Recipient type checks
  isUser() {
    return this.recipient_type === 'user';
  }

  isChat() {
    return this.recipient_type === 'chat';
  }

  isChannel() {
    return this.recipient_type === 'channel';
  }

  // Retry logic
  canRetry() {
    return this.isFailed() && this.retry_count < 3;
  }

  getNextRetryDelay() {
    // Exponential backoff: 1min, 5min, 15min
    const delays = [60000, 300000, 900000]; // milliseconds
    return delays[this.retry_count] || delays[delays.length - 1];
  }

  async scheduleRetry() {
    if (!this.canRetry()) return false;

    const delay = this.getNextRetryDelay();
    const nextRetryAt = new Date(Date.now() + delay);

    return await this.$query().patch({
      status: 'queued',
      next_retry_at: nextRetryAt.toISOString(),
      retry_count: this.retry_count + 1
    });
  }

  // Status update methods
  async markAsSending() {
    return await this.$query().patch({
      status: 'sending'
    });
  }

  async markAsSent(telegramMessageId) {
    return await this.$query().patch({
      status: 'sent',
      telegram_message_id: telegramMessageId,
      sent_at: new Date().toISOString()
    });
  }

  async markAsDelivered() {
    return await this.$query().patch({
      status: 'delivered',
      delivered_at: new Date().toISOString()
    });
  }

  async markAsFailed(error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    };

    return await this.$query().patch({
      status: 'failed',
      error_details: errorDetails
    });
  }

  async markAsBlocked() {
    return await this.$query().patch({
      status: 'blocked'
    });
  }

  // Timing calculations
  getDeliveryTime() {
    if (!this.sent_at || !this.delivered_at) return null;
    return new Date(this.delivered_at) - new Date(this.sent_at);
  }

  getProcessingTime() {
    if (!this.queued_at || !this.sent_at) return null;
    return new Date(this.sent_at) - new Date(this.queued_at);
  }

  // Static methods
  static async findPendingRecipients(limit = 100) {
    return this.query()
      .where('status', 'queued')
      .where(function() {
        this.whereNull('next_retry_at')
          .orWhere('next_retry_at', '<=', new Date().toISOString());
      })
      .orderBy('queued_at', 'asc')
      .limit(limit);
  }

  static async findByCampaign(campaignId) {
    return this.query()
      .where('campaign_id', campaignId)
      .orderBy('queued_at', 'asc');
  }

  static async findByStatus(status) {
    return this.query()
      .where('status', status)
      .orderBy('queued_at', 'asc');
  }

  static async getStatusCounts(campaignId) {
    const result = await this.query()
      .where('campaign_id', campaignId)
      .select('status')
      .count('* as count')
      .groupBy('status');
    
    return result.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});
  }

  static async createBulkRecipients(campaignId, messageId, recipients) {
    const recipientData = recipients.map(recipient => ({
      campaign_id: campaignId,
      message_id: messageId,
      recipient_type: recipient.type || 'user',
      recipient_id: recipient.id.toString(),
      user_id: recipient.user_id || null,
      status: 'queued',
      queued_at: new Date().toISOString(),
      retry_count: 0
    }));

    return this.query().insert(recipientData);
  }

  static async findFailedRecipients(campaignId) {
    return this.query()
      .where('campaign_id', campaignId)
      .where('status', 'failed')
      .orderBy('sent_at', 'desc');
  }

  static async getDeliveryStats(campaignId) {
    const stats = await this.query()
      .where('campaign_id', campaignId)
      .select(
        this.raw('AVG(TIMESTAMPDIFF(SECOND, sent_at, delivered_at)) as avg_delivery_time'),
        this.raw('MIN(TIMESTAMPDIFF(SECOND, sent_at, delivered_at)) as min_delivery_time'),
        this.raw('MAX(TIMESTAMPDIFF(SECOND, sent_at, delivered_at)) as max_delivery_time')
      )
      .whereNotNull('sent_at')
      .whereNotNull('delivered_at')
      .first();

    return stats;
  }
}

module.exports = BroadcastRecipient;