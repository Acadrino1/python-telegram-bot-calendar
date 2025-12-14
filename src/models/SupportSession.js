const { Model } = require('objection');

class SupportSession extends Model {
  static get tableName() {
    return 'support_sessions';
  }

  static get idColumn() {
    return 'id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['session_id', 'user_id', 'telegram_chat_id'],
      properties: {
        id: { type: 'integer' },
        session_id: { type: 'string', maxLength: 64 },
        user_id: { type: 'integer' },
        ticket_id: { type: 'string', maxLength: 32 },
        status: { type: 'string', enum: ['active', 'waiting', 'assigned', 'paused', 'ended'] },
        agent_id: { type: ['integer', 'null'] },
        started_at: { type: 'string', format: 'date-time' },
        agent_joined_at: { type: ['string', 'null'], format: 'date-time' },
        last_activity_at: { type: 'string', format: 'date-time' },
        ended_at: { type: ['string', 'null'], format: 'date-time' },
        telegram_chat_id: { type: 'string' },
        agent_chat_id: { type: ['string', 'null'] },
        telegram_thread_id: { type: ['string', 'null'], maxLength: 32 },
        session_context: { type: ['object', 'null'] },
        queue_position: { type: ['integer', 'null'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        department: { type: 'string', maxLength: 50 },
        wait_time_seconds: { type: ['integer', 'null'] },
        session_duration_seconds: { type: ['integer', 'null'] },
        message_count: { type: 'integer', default: 0 },
        agent_response_count: { type: 'integer', default: 0 },
        previous_agent_id: { type: ['integer', 'null'] },
        last_handoff_at: { type: ['string', 'null'], format: 'date-time' },
        handoff_notes: { type: ['string', 'null'] },
        escalation_count: { type: 'integer', default: 0 },
        satisfaction_rating: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
        feedback_text: { type: ['string', 'null'] },
        resolved: { type: 'boolean', default: false },
        auto_assigned: { type: 'boolean', default: false },
        requires_human: { type: 'boolean', default: false },
        automation_flags: { type: ['object', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const SupportTicket = require('./SupportTicket');
    const TelegramMessageMetadata = require('./TelegramMessageMetadata');
    const SupportSessionEvent = require('./SupportSessionEvent');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_sessions.user_id',
          to: 'users.id'
        }
      },

      agent: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_sessions.agent_id',
          to: 'users.id'
        }
      },

      previousAgent: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_sessions.previous_agent_id',
          to: 'users.id'
        }
      },

      ticket: {
        relation: Model.BelongsToOneRelation,
        modelClass: SupportTicket,
        join: {
          from: 'support_sessions.ticket_id',
          to: 'support_tickets.ticket_id'
        }
      },

      telegramMessages: {
        relation: Model.HasManyRelation,
        modelClass: TelegramMessageMetadata,
        join: {
          from: 'support_sessions.id',
          through: {
            from: 'support_messages.id',
            to: 'telegram_message_metadata.support_message_id'
          },
          to: 'support_messages.ticket_id'
        }
      },

      events: {
        relation: Model.HasManyRelation,
        modelClass: SupportSessionEvent,
        join: {
          from: 'support_sessions.session_id',
          to: 'support_session_events.session_id'
        }
      }
    };
  }

  // Session lifecycle methods
  async assignAgent(agentId, assignmentType = 'manual') {
    const now = new Date();
    await this.$query().patch({
      agent_id: agentId,
      status: 'assigned',
      agent_joined_at: now,
      auto_assigned: assignmentType === 'auto',
      updated_at: now
    });

    // Log the assignment event
    await this.$relatedQuery('events').insert({
      session_id: this.session_id,
      event_type: 'agent_joined',
      actor_id: agentId,
      actor_type: 'agent',
      event_data: { assignment_type: assignmentType },
      event_description: `Agent assigned via ${assignmentType} assignment`
    });

    return this.$query().findById(this.id);
  }

  async updateActivity() {
    return this.$query().patch({
      last_activity_at: new Date()
    });
  }

  async incrementMessageCount(isAgentMessage = false) {
    const updates = {
      message_count: this.message_count + 1,
      last_activity_at: new Date()
    };

    if (isAgentMessage) {
      updates.agent_response_count = this.agent_response_count + 1;
    }

    return this.$query().patch(updates);
  }

  async handoffToAgent(newAgentId, notes = null) {
    const now = new Date();
    const updates = {
      previous_agent_id: this.agent_id,
      agent_id: newAgentId,
      last_handoff_at: now,
      handoff_notes: notes,
      updated_at: now
    };

    await this.$query().patch(updates);

    // Log handoff event
    await this.$relatedQuery('events').insert({
      session_id: this.session_id,
      event_type: 'handoff_completed',
      actor_id: newAgentId,
      actor_type: 'agent',
      event_data: { 
        previous_agent_id: this.agent_id,
        handoff_notes: notes 
      },
      event_description: `Session handed off from agent ${this.agent_id} to agent ${newAgentId}`
    });

    return this.$query().findById(this.id);
  }

  async endSession(resolutionData = {}) {
    const now = new Date();
    const duration = Math.floor((now - new Date(this.started_at)) / 1000);
    
    const updates = {
      status: 'ended',
      ended_at: now,
      session_duration_seconds: duration,
      resolved: resolutionData.resolved || false,
      satisfaction_rating: resolutionData.rating || null,
      feedback_text: resolutionData.feedback || null,
      updated_at: now
    };

    await this.$query().patch(updates);

    // Log session end event
    await this.$relatedQuery('events').insert({
      session_id: this.session_id,
      event_type: 'session_ended',
      actor_id: this.user_id,
      actor_type: 'user',
      event_data: resolutionData,
      event_description: 'Support session ended'
    });

    return this.$query().findById(this.id);
  }

  // Utility methods
  isActive() {
    return ['active', 'waiting', 'assigned'].includes(this.status);
  }

  hasAgent() {
    return this.agent_id !== null && this.status === 'assigned';
  }

  getWaitTimeMinutes() {
    if (!this.agent_joined_at) return null;
    return Math.floor((new Date(this.agent_joined_at) - new Date(this.started_at)) / (1000 * 60));
  }

  getDurationMinutes() {
    const endTime = this.ended_at ? new Date(this.ended_at) : new Date();
    return Math.floor((endTime - new Date(this.started_at)) / (1000 * 60));
  }

  // Static query methods
  static async findActiveByUser(userId) {
    return this.query()
      .where('user_id', userId)
      .where('status', 'in', ['active', 'waiting', 'assigned'])
      .orderBy('created_at', 'desc')
      .first();
  }

  static async findByTelegramChat(telegramChatId) {
    return this.query()
      .where('telegram_chat_id', telegramChatId.toString())
      .where('status', 'in', ['active', 'waiting', 'assigned'])
      .orderBy('created_at', 'desc')
      .first();
  }

  static async findAgentSessions(agentId, status = null) {
    const query = this.query().where('agent_id', agentId);
    
    if (status) {
      if (Array.isArray(status)) {
        query.where('status', 'in', status);
      } else {
        query.where('status', status);
      }
    }

    return query.orderBy('created_at', 'desc');
  }

  static async getQueueStats(department = null) {
    let query = this.query()
      .where('status', 'waiting')
      .orderBy('created_at', 'asc');

    if (department) {
      query = query.where('department', department);
    }

    const waitingSessions = await query;
    const totalWaiting = waitingSessions.length;
    
    const avgWaitTime = waitingSessions.length > 0 
      ? waitingSessions.reduce((sum, session) => {
          return sum + (new Date() - new Date(session.started_at)) / 1000;
        }, 0) / waitingSessions.length
      : 0;

    return {
      total_waiting: totalWaiting,
      avg_wait_time_seconds: Math.floor(avgWaitTime),
      oldest_waiting: waitingSessions[0] || null
    };
  }

  static async createSession(sessionData) {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.query().insert({
      session_id: sessionId,
      ...sessionData,
      started_at: new Date()
    });
  }
}

module.exports = SupportSession;