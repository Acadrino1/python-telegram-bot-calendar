const { Model } = require('objection');

class SupportMessage extends Model {
  static get tableName() {
    return 'support_messages';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['ticket_id', 'sender_type'],
      properties: {
        id: { type: 'integer' },
        ticket_id: { type: 'string', maxLength: 32 },
        message_text: { type: ['string', 'null'] },
        message: { type: ['string', 'null'] },
        message_type: {
          type: ['string', 'null'],
          enum: ['user', 'agent', 'system', null]
        },
        telegram_message_id: { type: ['integer', 'null'] },
        sender_id: { type: ['integer', 'null'] },
        sender_type: {
          type: 'string',
          enum: ['user', 'agent', 'system']
        },
        // Allow any type for timestamp fields since MySQL returns Date objects
        created_at: {},
        updated_at: {},
        edited_at: {},
        is_internal: { type: 'boolean', default: false }
      }
    };
  }

  static get relationMappings() {
    const SupportTicket = require('./SupportTicket');
    const User = require('./User');

    return {
      // Ticket this message belongs to
      ticket: {
        relation: Model.BelongsToOneRelation,
        modelClass: SupportTicket,
        join: {
          from: 'support_messages.ticket_id',
          to: 'support_tickets.ticket_id'
        }
      },

      // User who sent the message
      sender: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_messages.sender_id',
          to: 'users.id'
        }
      }
    };
  }

  // Check if message is from user
  isFromUser() {
    return this.sender_type === 'user';
  }

  // Check if message is from agent
  isFromAgent() {
    return this.sender_type === 'agent';
  }

  // Check if message is system message
  isSystemMessage() {
    return this.sender_type === 'system';
  }

  // Check if message is internal note
  isInternal() {
    return this.is_internal === true;
  }

  // Get message age in minutes
  getAgeInMinutes() {
    return Math.floor((new Date() - new Date(this.created_at)) / (1000 * 60));
  }

  // Get sender emoji
  getSenderEmoji() {
    switch (this.sender_type) {
      case 'user': return '👤';
      case 'agent': return '👨‍💻';
      case 'system': return '🤖';
      default: return '❓';
    }
  }

  // Get formatted message for display
  getFormattedMessage() {
    const senderEmoji = this.getSenderEmoji();
    const timeAgo = this.getAgeInMinutes();
    const timeString = timeAgo < 60 ? `${timeAgo}m` : `${Math.floor(timeAgo / 60)}h`;
    
    let header = `${senderEmoji} ${this.sender_type === 'user' ? 'User' : this.sender_type === 'agent' ? 'Support' : 'System'}`;
    if (this.is_internal) {
      header += ' (Internal)';
    }
    header += ` • ${timeString} ago\n`;
    
    return header + this.message_text;
  }

  // Static methods for querying messages

  static async findByTicketId(ticketId, limit = 20, includeInternal = false) {
    const query = this.query()
      .where('ticket_id', ticketId)
      .withGraphFetched('[sender]')
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (!includeInternal) {
      query.where('is_internal', false);
    }

    return query;
  }

  static async findLatestByTicketId(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .orderBy('created_at', 'desc')
      .first();
  }

  static async findUserMessages(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .where('sender_type', 'user')
      .orderBy('created_at', 'asc');
  }

  static async findAgentMessages(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .where('sender_type', 'agent')
      .orderBy('created_at', 'asc');
  }

  static async findSystemMessages(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .where('sender_type', 'system')
      .orderBy('created_at', 'asc');
  }

  static async getMessageStatistics(ticketId) {
    const total = await this.query()
      .where('ticket_id', ticketId)
      .count('* as count')
      .first();

    const byType = await this.query()
      .where('ticket_id', ticketId)
      .groupBy('sender_type')
      .count('* as count')
      .select('sender_type');

    const internal = await this.query()
      .where('ticket_id', ticketId)
      .where('is_internal', true)
      .count('* as count')
      .first();

    // Calculate response times
    const firstUserMessage = await this.query()
      .where('ticket_id', ticketId)
      .where('sender_type', 'user')
      .orderBy('created_at', 'asc')
      .first();

    const firstAgentResponse = await this.query()
      .where('ticket_id', ticketId)
      .where('sender_type', 'agent')
      .orderBy('created_at', 'asc')
      .first();

    let firstResponseTime = null;
    if (firstUserMessage && firstAgentResponse) {
      const diff = new Date(firstAgentResponse.created_at) - new Date(firstUserMessage.created_at);
      firstResponseTime = Math.floor(diff / (1000 * 60)); // in minutes
    }

    const stats = {
      total: total.count,
      internal: internal.count,
      byType: {},
      firstResponseTimeMinutes: firstResponseTime
    };

    // Organize counts by type
    byType.forEach(row => {
      stats.byType[row.sender_type] = row.count;
    });

    return stats;
  }

  // Create system message helper
  static async createSystemMessage(ticketId, message, senderId = null) {
    return this.query().insert({
      ticket_id: ticketId,
      message_text: message,
      message_type: 'system',
      sender_id: senderId || 0, // Use 0 for system messages without specific sender
      sender_type: 'system',
      is_internal: false
    });
  }

  // Create internal note helper
  static async createInternalNote(ticketId, message, agentId) {
    return this.query().insert({
      ticket_id: ticketId,
      message_text: message,
      message_type: 'agent',
      sender_id: agentId,
      sender_type: 'agent',
      is_internal: true
    });
  }

  // Search messages
  static async searchMessages(searchTerm, ticketId = null, limit = 50) {
    const query = this.query()
      .where('message_text', 'ilike', `%${searchTerm}%`)
      .withGraphFetched('[ticket, sender]')
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (ticketId) {
      query.where('ticket_id', ticketId);
    }

    return query;
  }
}

module.exports = SupportMessage;