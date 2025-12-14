const { Model } = require('objection');

class SupportTicket extends Model {
  static get tableName() {
    return 'support_tickets';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['ticket_id', 'user_id', 'status', 'priority'],
      properties: {
        id: { type: 'integer' },
        ticket_id: { type: 'string', maxLength: 32 },
        user_id: { type: 'integer' },
        agent_id: { type: ['integer', 'null'] },
        status: {
          type: 'string',
          enum: ['open', 'assigned', 'closed', 'escalated'],
          default: 'open'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          default: 'medium'
        },
        category: { type: ['string', 'null'], maxLength: 50 },
        subject: { type: ['string', 'null'], maxLength: 255 },
        message: { type: ['string', 'null'] },
        // Allow any type for timestamp fields since MySQL returns Date objects
        created_at: {},
        updated_at: {},
        assigned_at: {},
        closed_at: {},
        last_message_at: {},
        auto_close_at: {},
        escalation_level: { type: ['integer', 'null'] }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const SupportMessage = require('./SupportMessage');
    const SupportAgentAssignment = require('./SupportAgentAssignment');

    return {
      // User who created the ticket
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_tickets.user_id',
          to: 'users.id'
        }
      },

      // Assigned agent
      agent: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_tickets.agent_id',
          to: 'users.id'
        }
      },

      // Messages in this ticket
      messages: {
        relation: Model.HasManyRelation,
        modelClass: SupportMessage,
        join: {
          from: 'support_tickets.ticket_id',
          to: 'support_messages.ticket_id'
        }
      },

      // Assignment history
      assignments: {
        relation: Model.HasManyRelation,
        modelClass: SupportAgentAssignment,
        join: {
          from: 'support_tickets.ticket_id',
          to: 'support_agent_assignments.ticket_id'
        }
      }
    };
  }

  // Check if ticket is open
  isOpen() {
    return this.status === 'open';
  }

  // Check if ticket is assigned
  isAssigned() {
    return this.status === 'assigned';
  }

  // Check if ticket is closed
  isClosed() {
    return this.status === 'closed';
  }

  // Check if ticket is escalated
  isEscalated() {
    return this.status === 'escalated';
  }

  // Check if ticket is high priority
  isHighPriority() {
    return ['high', 'critical'].includes(this.priority);
  }

  // Check if ticket is critical
  isCritical() {
    return this.priority === 'critical';
  }

  // Get age in hours
  getAgeInHours() {
    return Math.floor((new Date() - new Date(this.created_at)) / (1000 * 60 * 60));
  }

  // Get time since last message in hours
  getTimeSinceLastMessage() {
    if (!this.last_message_at) return null;
    return Math.floor((new Date() - new Date(this.last_message_at)) / (1000 * 60 * 60));
  }

  // Check if ticket needs escalation (no response in 24h for high priority, 48h for others)
  needsEscalation() {
    const hoursSinceLastMessage = this.getTimeSinceLastMessage();
    if (hoursSinceLastMessage === null) return false;
    
    const threshold = this.isHighPriority() ? 24 : 48;
    return hoursSinceLastMessage >= threshold && !this.isClosed();
  }

  // Get status emoji
  getStatusEmoji() {
    switch (this.status) {
      case 'open': return '🟠';
      case 'assigned': return '🔵';
      case 'closed': return '🟢';
      case 'escalated': return '🔴';
      default: return '⚫';
    }
  }

  // Get priority emoji
  getPriorityEmoji() {
    switch (this.priority) {
      case 'critical': return '🚨';
      case 'high': return '🔴';
      case 'medium': return '🟠';
      case 'low': return '🟢';
      default: return '⚫';
    }
  }

  // Get category emoji
  getCategoryEmoji() {
    switch (this.category) {
      case 'booking': return '🏥';
      case 'technical': return '⚙️';
      case 'payment': return '💳';
      case 'general': return '❓';
      case 'urgent': return '🚨';
      default: return '📋';
    }
  }

  // Static methods for querying tickets

  static async findByTicketId(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .withGraphFetched('[user, agent, messages]')
      .first();
  }

  static async findUserTickets(userId, limit = 10) {
    return this.query()
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  static async findOpenTickets(limit = 20) {
    return this.query()
      .whereIn('status', ['open', 'assigned'])
      .withGraphFetched('[user, agent]')
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  static async findAgentTickets(agentId, status = null) {
    const query = this.query()
      .where('agent_id', agentId)
      .withGraphFetched('[user]')
      .orderBy('created_at', 'desc');

    if (status) {
      query.where('status', status);
    }

    return query;
  }

  static async findTicketsNeedingEscalation() {
    const criticalThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const normalThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours

    return this.query()
      .whereIn('status', ['open', 'assigned'])
      .andWhere(builder => {
        builder
          .where(subBuilder => {
            subBuilder
              .where('priority', 'critical')
              .andWhere('last_message_at', '<', criticalThreshold);
          })
          .orWhere(subBuilder => {
            subBuilder
              .whereIn('priority', ['low', 'medium', 'high'])
              .andWhere('last_message_at', '<', normalThreshold);
          });
      })
      .withGraphFetched('[user, agent]');
  }

  static async getStatistics() {
    const total = await this.query().count('* as count').first();
    const open = await this.query().where('status', 'open').count('* as count').first();
    const assigned = await this.query().where('status', 'assigned').count('* as count').first();
    const closed = await this.query().where('status', 'closed').count('* as count').first();
    const escalated = await this.query().where('status', 'escalated').count('* as count').first();
    const critical = await this.query().where('priority', 'critical').whereIn('status', ['open', 'assigned']).count('* as count').first();

    // Average response time for closed tickets
    const avgResponseTime = await this.knex().raw(`
      SELECT AVG(EXTRACT(EPOCH FROM (assigned_at - created_at))/3600) as avg_hours
      FROM support_tickets
      WHERE assigned_at IS NOT NULL AND status = 'closed'
    `);

    return {
      total: total.count,
      open: open.count,
      assigned: assigned.count,
      closed: closed.count,
      escalated: escalated.count,
      critical: critical.count,
      avgResponseTimeHours: avgResponseTime.rows[0]?.avg_hours ? parseFloat(avgResponseTime.rows[0].avg_hours).toFixed(2) : null
    };
  }
}

module.exports = SupportTicket;