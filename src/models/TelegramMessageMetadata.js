const { Model } = require('objection');

class TelegramMessageMetadata extends Model {
  static get tableName() {
    return 'telegram_message_metadata';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['support_message_id', 'telegram_message_id', 'telegram_chat_id', 'telegram_date'],
      properties: {
        id: { type: 'integer' },
        support_message_id: { type: 'integer' },
        telegram_message_id: { type: 'string' },
        telegram_chat_id: { type: 'string' },
        message_thread_id: { type: ['string', 'null'], maxLength: 32 },
        reply_to_message_id: { type: ['integer', 'null'] },
        content_type: { 
          type: 'string', 
          enum: ['text', 'photo', 'document', 'voice', 'video', 'sticker', 'location'] 
        },
        telegram_entities: { type: ['object', 'null'] },
        file_id: { type: ['string', 'null'] },
        file_size: { type: ['integer', 'null'] },
        mime_type: { type: ['string', 'null'] },
        is_edited: { type: 'boolean', default: false },
        is_forwarded: { type: 'boolean', default: false },
        is_deleted: { type: 'boolean', default: false },
        telegram_date: { type: 'string', format: 'date-time' },
        edit_date: { type: ['string', 'null'], format: 'date-time' },
        sent_to_group: { type: 'boolean', default: false },
        group_message_id: { type: ['string', 'null'] },
        agent_reactions: { type: ['object', 'null'] }
      }
    };
  }

  static get relationMappings() {
    const SupportMessage = require('./SupportMessage');

    return {
      supportMessage: {
        relation: Model.BelongsToOneRelation,
        modelClass: SupportMessage,
        join: {
          from: 'telegram_message_metadata.support_message_id',
          to: 'support_messages.id'
        }
      }
    };
  }

  // Message type helpers
  isMediaMessage() {
    return ['photo', 'document', 'voice', 'video'].includes(this.content_type);
  }

  hasFile() {
    return this.file_id !== null;
  }

  isThreaded() {
    return this.message_thread_id !== null;
  }

  isReply() {
    return this.reply_to_message_id !== null;
  }

  // Group coordination methods
  async markSentToGroup(groupMessageId) {
    return this.$query().patch({
      sent_to_group: true,
      group_message_id: groupMessageId.toString()
    });
  }

  async addAgentReaction(agentId, emoji) {
    const reactions = this.agent_reactions || {};
    reactions[agentId] = emoji;
    
    return this.$query().patch({
      agent_reactions: reactions
    });
  }

  async removeAgentReaction(agentId) {
    const reactions = this.agent_reactions || {};
    delete reactions[agentId];
    
    return this.$query().patch({
      agent_reactions: Object.keys(reactions).length > 0 ? reactions : null
    });
  }

  // Message status updates
  async markEdited() {
    return this.$query().patch({
      is_edited: true,
      edit_date: new Date()
    });
  }

  async markDeleted() {
    return this.$query().patch({
      is_deleted: true
    });
  }

  // Static methods for finding messages
  static async findByTelegramMessage(telegramChatId, telegramMessageId) {
    return this.query()
      .where('telegram_chat_id', telegramChatId.toString())
      .where('telegram_message_id', telegramMessageId.toString())
      .first();
  }

  static async findThreadMessages(messageThreadId) {
    return this.query()
      .where('message_thread_id', messageThreadId)
      .orderBy('telegram_date', 'asc');
  }

  static async findMediaMessages(telegramChatId, contentType = null) {
    let query = this.query()
      .where('telegram_chat_id', telegramChatId.toString())
      .where('content_type', 'in', ['photo', 'document', 'voice', 'video']);

    if (contentType) {
      query = query.where('content_type', contentType);
    }

    return query.orderBy('telegram_date', 'desc');
  }

  static async findUnsyncedMessages() {
    return this.query()
      .where('sent_to_group', false)
      .whereExists(
        this.relatedQuery('supportMessage')
          .where('sender_type', 'user')
      )
      .orderBy('telegram_date', 'asc');
  }

  // Message statistics
  static async getMessageStats(telegramChatId, timeframe = 'day') {
    const ALLOWED_TIMEFRAMES = ['hour', 'day', 'week', 'month'];
    const timeframeSql = {
      hour: "DATE_FORMAT(telegram_date, '%Y-%m-%d %H:00:00')",
      day: "DATE_FORMAT(telegram_date, '%Y-%m-%d')",
      week: "YEARWEEK(telegram_date)",
      month: "DATE_FORMAT(telegram_date, '%Y-%m')"
    };

    // Security: Validate timeframe against allowlist
    if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
      throw new Error(`Invalid timeframe: ${timeframe}. Allowed: ${ALLOWED_TIMEFRAMES.join(', ')}`);
    }

    return this.query()
      .where('telegram_chat_id', telegramChatId.toString())
      .select(this.raw(`${timeframeSql[timeframe]} as period`))
      .select('content_type')
      .count('* as message_count')
      .groupBy('period', 'content_type')
      .orderBy('period', 'desc');
  }

  // File handling utilities
  getFileInfo() {
    if (!this.hasFile()) return null;

    return {
      file_id: this.file_id,
      file_size: this.file_size,
      mime_type: this.mime_type,
      content_type: this.content_type,
      downloadable: this.isDownloadable()
    };
  }

  isDownloadable() {
    return this.hasFile() && 
           ['photo', 'document', 'voice', 'video'].includes(this.content_type) &&
           this.file_size && 
           this.file_size < 20 * 1024 * 1024; // 20MB limit
  }

  // Message formatting for different contexts
  getDisplayText() {
    switch (this.content_type) {
      case 'photo':
        return '📷 Photo';
      case 'document':
        return '📄 Document';
      case 'voice':
        return '🎵 Voice message';
      case 'video':
        return '🎥 Video';
      case 'sticker':
        return '😊 Sticker';
      case 'location':
        return '📍 Location';
      default:
        return '[Message]';
    }
  }

  // Entity processing helpers
  getMentions() {
    if (!this.telegram_entities) return [];
    
    return this.telegram_entities
      .filter(entity => entity.type === 'mention' || entity.type === 'text_mention')
      .map(entity => ({
        type: entity.type,
        offset: entity.offset,
        length: entity.length,
        user: entity.user || null
      }));
  }

  getUrls() {
    if (!this.telegram_entities) return [];
    
    return this.telegram_entities
      .filter(entity => entity.type === 'url' || entity.type === 'text_link')
      .map(entity => ({
        type: entity.type,
        offset: entity.offset,
        length: entity.length,
        url: entity.url || null
      }));
  }

  getHashtags() {
    if (!this.telegram_entities) return [];
    
    return this.telegram_entities
      .filter(entity => entity.type === 'hashtag')
      .map(entity => ({
        offset: entity.offset,
        length: entity.length
      }));
  }
}

module.exports = TelegramMessageMetadata;