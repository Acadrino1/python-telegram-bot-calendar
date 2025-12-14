const { Model } = require('objection');

class SupportAgentAssignment extends Model {
  static get tableName() {
    return 'support_agent_assignments';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['agent_id', 'ticket_id'],
      properties: {
        id: { type: 'integer' },
        agent_id: { type: 'integer' },
        ticket_id: { type: 'string', maxLength: 32 },
        assigned_at: { type: 'string', format: 'date-time' },
        unassigned_at: { type: ['string', 'null'], format: 'date-time' },
        assignment_type: { 
          type: 'string', 
          enum: ['auto', 'manual', 'escalated'],
          default: 'auto'
        },
        first_response_time: { type: ['integer', 'null'] }, // seconds
        avg_response_time: { type: ['number', 'null'] },
        satisfaction_rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const SupportTicket = require('./SupportTicket');

    return {
      // Agent assigned to ticket
      agent: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_agent_assignments.agent_id',
          to: 'users.id'
        }
      },

      // Ticket being assigned
      ticket: {
        relation: Model.BelongsToOneRelation,
        modelClass: SupportTicket,
        join: {
          from: 'support_agent_assignments.ticket_id',
          to: 'support_tickets.ticket_id'
        }
      }
    };
  }

  // Check if assignment is active
  isActive() {
    return this.unassigned_at === null;
  }

  // Check if assignment was automatic
  isAutomatic() {
    return this.assignment_type === 'auto';
  }

  // Check if assignment was manual
  isManual() {
    return this.assignment_type === 'manual';
  }

  // Check if assignment was due to escalation
  isEscalated() {
    return this.assignment_type === 'escalated';
  }

  // Get assignment duration in hours
  getDurationInHours() {
    const endTime = this.unassigned_at ? new Date(this.unassigned_at) : new Date();
    const startTime = new Date(this.assigned_at);
    return Math.floor((endTime - startTime) / (1000 * 60 * 60));
  }

  // Get first response time in minutes
  getFirstResponseTimeInMinutes() {
    return this.first_response_time ? Math.floor(this.first_response_time / 60) : null;
  }

  // Get average response time in minutes
  getAvgResponseTimeInMinutes() {
    return this.avg_response_time ? Math.floor(this.avg_response_time / 60) : null;
  }

  // Check if assignment has good satisfaction rating (4-5 stars)
  hasGoodSatisfaction() {
    return this.satisfaction_rating && this.satisfaction_rating >= 4;
  }

  // Static methods for querying assignments

  static async findActiveAssignments(agentId = null) {
    const query = this.query()
      .whereNull('unassigned_at')
      .withGraphFetched('[agent, ticket]')
      .orderBy('assigned_at', 'desc');

    if (agentId) {
      query.where('agent_id', agentId);
    }

    return query;
  }

  static async findAgentAssignments(agentId, includeCompleted = true) {
    const query = this.query()
      .where('agent_id', agentId)
      .withGraphFetched('[ticket]')
      .orderBy('assigned_at', 'desc');

    if (!includeCompleted) {
      query.whereNull('unassigned_at');
    }

    return query;
  }

  static async findTicketAssignments(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .withGraphFetched('[agent]')
      .orderBy('assigned_at', 'desc');
  }

  static async getCurrentAssignment(ticketId) {
    return this.query()
      .where('ticket_id', ticketId)
      .whereNull('unassigned_at')
      .withGraphFetched('[agent]')
      .first();
  }

  static async getAgentWorkload(agentId) {
    const active = await this.query()
      .where('agent_id', agentId)
      .whereNull('unassigned_at')
      .count('* as count')
      .first();

    const total = await this.query()
      .where('agent_id', agentId)
      .count('* as count')
      .first();

    const avgSatisfaction = await this.query()
      .where('agent_id', agentId)
      .whereNotNull('satisfaction_rating')
      .avg('satisfaction_rating as avg')
      .first();

    const avgFirstResponse = await this.query()
      .where('agent_id', agentId)
      .whereNotNull('first_response_time')
      .avg('first_response_time as avg')
      .first();

    return {
      activeTickets: active.count,
      totalTickets: total.count,
      avgSatisfactionRating: avgSatisfaction.avg ? parseFloat(avgSatisfaction.avg).toFixed(2) : null,
      avgFirstResponseTimeMinutes: avgFirstResponse.avg ? Math.floor(avgFirstResponse.avg / 60) : null
    };
  }

  static async getAssignmentStatistics(timeframe = '24h') {
    let timeFilter;
    switch (timeframe) {
      case '1h':
        timeFilter = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '24h':
        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const total = await this.query()
      .where('assigned_at', '>=', timeFilter)
      .count('* as count')
      .first();

    const byType = await this.query()
      .where('assigned_at', '>=', timeFilter)
      .groupBy('assignment_type')
      .count('* as count')
      .select('assignment_type');

    const avgFirstResponse = await this.query()
      .where('assigned_at', '>=', timeFilter)
      .whereNotNull('first_response_time')
      .avg('first_response_time as avg')
      .first();

    const avgSatisfaction = await this.query()
      .where('assigned_at', '>=', timeFilter)
      .whereNotNull('satisfaction_rating')
      .avg('satisfaction_rating as avg')
      .first();

    const stats = {
      totalAssignments: total.count,
      byType: {},
      avgFirstResponseTimeMinutes: avgFirstResponse.avg ? Math.floor(avgFirstResponse.avg / 60) : null,
      avgSatisfactionRating: avgSatisfaction.avg ? parseFloat(avgSatisfaction.avg).toFixed(2) : null
    };

    byType.forEach(row => {
      stats.byType[row.assignment_type] = row.count;
    });

    return stats;
  }

  // Unassign agent from ticket
  async unassign() {
    return this.$query().patch({
      unassigned_at: new Date()
    });
  }

  // Update first response time
  async updateFirstResponseTime(responseTimeSeconds) {
    return this.$query().patch({
      first_response_time: responseTimeSeconds
    });
  }

  // Update satisfaction rating
  async updateSatisfactionRating(rating) {
    if (rating < 1 || rating > 5) {
      throw new Error('Satisfaction rating must be between 1 and 5');
    }
    
    return this.$query().patch({
      satisfaction_rating: rating
    });
  }

  // Calculate and update average response time
  async calculateAvgResponseTime() {
    // This would typically query support_messages to calculate actual response times
    // For now, we'll use a placeholder implementation
    const messages = await this.knex().raw(`
      SELECT 
        created_at,
        sender_type,
        LAG(created_at) OVER (ORDER BY created_at) as prev_message_time,
        LAG(sender_type) OVER (ORDER BY created_at) as prev_sender_type
      FROM support_messages
      WHERE ticket_id = ?
      ORDER BY created_at
    `, [this.ticket_id]);

    let responseTimes = [];
    for (let i = 1; i < messages.rows.length; i++) {
      const msg = messages.rows[i];
      const prevMsg = messages.rows[i - 1];
      
      // If current message is from agent and previous was from user
      if (msg.sender_type === 'agent' && prevMsg.sender_type === 'user') {
        const responseTime = (new Date(msg.created_at) - new Date(prevMsg.created_at)) / 1000;
        responseTimes.push(responseTime);
      }
    }

    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      await this.$query().patch({
        avg_response_time: avgResponseTime
      });
      return avgResponseTime;
    }

    return null;
  }
}

module.exports = SupportAgentAssignment;