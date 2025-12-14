const { Model } = require('objection');

class BotChannel extends Model {
  static get tableName() {
    return 'bot_channels';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['chat_id', 'chat_type'],
      properties: {
        id: { type: 'integer' },
        chat_id: { type: 'string', maxLength: 64 },
        chat_type: { type: 'string', enum: ['group', 'supergroup', 'channel'] },
        title: { type: ['string', 'null'], maxLength: 255 },
        username: { type: ['string', 'null'], maxLength: 255 },
        topic_id: { type: ['integer', 'null'] },
        is_active: { type: 'boolean', default: true },
        can_post: { type: 'boolean', default: true },
        broadcast_enabled: { type: 'boolean', default: true },
        added_by_user_id: { type: ['string', 'null'], maxLength: 64 },
        joined_at: { type: 'string', format: 'date-time' },
        left_at: { type: ['string', 'null'], format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }

  // Register bot joining a group/channel
  static async registerChannel(chatData, addedByUserId = null) {
    const existing = await this.query()
      .where('chat_id', chatData.id.toString())
      .first();

    if (existing) {
      // Reactivate if previously left
      return existing.$query().patchAndFetch({
        is_active: true,
        title: chatData.title || existing.title,
        username: chatData.username || existing.username,
        left_at: null,
        can_post: true
      });
    }

    return this.query().insert({
      chat_id: chatData.id.toString(),
      chat_type: chatData.type,
      title: chatData.title || null,
      username: chatData.username || null,
      is_active: true,
      can_post: true,
      broadcast_enabled: true,
      added_by_user_id: addedByUserId?.toString() || null
    });
  }

  // Mark bot as having left a group/channel
  static async markLeft(chatId) {
    return this.query()
      .where('chat_id', chatId.toString())
      .patch({
        is_active: false,
        left_at: new Date().toISOString()
      });
  }

  // Get all active channels for broadcast
  static async getActiveBroadcastChannels() {
    return this.query()
      .where('is_active', true)
      .where('broadcast_enabled', true)
      .where('can_post', true)
      .orderBy('title', 'asc');
  }

  // Get all active channels
  static async getAllActive() {
    return this.query()
      .where('is_active', true)
      .orderBy('title', 'asc');
  }

  // Toggle broadcast for a channel
  static async toggleBroadcast(chatId, enabled) {
    return this.query()
      .where('chat_id', chatId.toString())
      .patch({ broadcast_enabled: enabled });
  }

  // Update posting permission
  static async updateCanPost(chatId, canPost) {
    return this.query()
      .where('chat_id', chatId.toString())
      .patch({ can_post: canPost });
  }

  // Get channel count
  static async getActiveCount() {
    const result = await this.query()
      .where('is_active', true)
      .where('broadcast_enabled', true)
      .count('* as count')
      .first();
    return parseInt(result?.count) || 0;
  }
}

module.exports = BotChannel;
