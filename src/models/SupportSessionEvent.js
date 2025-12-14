const { Model } = require('objection');

class SupportSessionEvent extends Model {
  static get tableName() {
    return 'support_session_events';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['session_id', 'event_type', 'actor_type'],
      properties: {
        id: { type: 'integer' },
        session_id: { type: 'string', maxLength: 64 },
        event_type: { 
          type: 'string', 
          enum: [
            'session_started', 'agent_joined', 'agent_left', 'user_left',
            'message_sent', 'file_uploaded', 'status_changed', 'escalated',
            'handoff_requested', 'handoff_completed', 'session_paused',
            'session_resumed', 'session_ended', 'feedback_submitted'
          ]
        },
        actor_id: { type: ['integer', 'null'] },
        actor_type: { type: 'string', enum: ['user', 'agent', 'system'] },
        event_data: { type: ['object', 'null'] },
        event_description: { type: ['string', 'null'] },
        telegram_message_id: { type: ['string', 'null'] },
        event_timestamp: { type: 'string', format: 'date-time' },
        ip_address: { type: ['string', 'null'], maxLength: 45 }
      }
    };
  }

  static get relationMappings() {
    const SupportSession = require('./SupportSession');
    const User = require('./User');

    return {
      session: {
        relation: Model.BelongsToOneRelation,
        modelClass: SupportSession,
        join: {
          from: 'support_session_events.session_id',
          to: 'support_sessions.session_id'
        }
      },

      actor: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'support_session_events.actor_id',
          to: 'users.id'
        }
      }
    };
  }

  // Event type helpers
  isUserEvent() {
    return this.actor_type === 'user';
  }

  isAgentEvent() {
    return this.actor_type === 'agent';
  }

  isSystemEvent() {
    return this.actor_type === 'system';
  }

  isSessionLifecycleEvent() {
    return [
      'session_started', 'session_paused', 'session_resumed', 'session_ended'
    ].includes(this.event_type);
  }

  isAgentActivityEvent() {
    return [
      'agent_joined', 'agent_left', 'handoff_requested', 'handoff_completed'
    ].includes(this.event_type);
  }

  isCommunicationEvent() {
    return [
      'message_sent', 'file_uploaded'
    ].includes(this.event_type);
  }

  // Event data accessors
  getEventData(key = null) {
    if (!this.event_data) return key ? null : {};
    return key ? this.event_data[key] : this.event_data;
  }

  hasEventData(key) {
    return this.event_data && this.event_data.hasOwnProperty(key);
  }

  // Time-based queries
  static async getSessionTimeline(sessionId) {
    return this.query()
      .where('session_id', sessionId)
      .withGraphJoined('actor')
      .orderBy('event_timestamp', 'asc');
  }

  static async getEventsByType(eventType, limit = 100) {
    return this.query()
      .where('event_type', eventType)
      .withGraphJoined('[session, actor]')
      .orderBy('event_timestamp', 'desc')
      .limit(limit);
  }

  static async getAgentActivity(agentId, timeframe = 'day') {
    const timeframeDate = this.getTimeframeDate(timeframe);
    
    return this.query()
      .where('actor_id', agentId)
      .where('actor_type', 'agent')
      .where('event_timestamp', '>=', timeframeDate)
      .orderBy('event_timestamp', 'desc');
  }

  static async getUserActivity(userId, timeframe = 'day') {
    const timeframeDate = this.getTimeframeDate(timeframe);
    
    return this.query()
      .where('actor_id', userId)
      .where('actor_type', 'user')
      .where('event_timestamp', '>=', timeframeDate)
      .orderBy('event_timestamp', 'desc');
  }

  // Analytics and reporting
  static async getEventStats(timeframe = 'day') {
    const timeframeDate = this.getTimeframeDate(timeframe);
    
    return this.query()
      .where('event_timestamp', '>=', timeframeDate)
      .select('event_type')
      .select('actor_type')
      .count('* as event_count')
      .groupBy('event_type', 'actor_type')
      .orderBy('event_count', 'desc');
  }

  static async getSessionMetrics(sessionIds) {
    if (!Array.isArray(sessionIds)) {
      sessionIds = [sessionIds];
    }

    const events = await this.query()
      .where('session_id', 'in', sessionIds)
      .orderBy(['session_id', 'event_timestamp']);

    const metrics = {};
    
    events.forEach(event => {
      if (!metrics[event.session_id]) {
        metrics[event.session_id] = {
          session_id: event.session_id,
          total_events: 0,
          user_events: 0,
          agent_events: 0,
          system_events: 0,
          first_event: null,
          last_event: null,
          events_by_type: {}
        };
      }

      const sessionMetrics = metrics[event.session_id];
      sessionMetrics.total_events++;
      sessionMetrics[`${event.actor_type}_events`]++;
      
      if (!sessionMetrics.first_event) {
        sessionMetrics.first_event = event.event_timestamp;
      }
      sessionMetrics.last_event = event.event_timestamp;

      if (!sessionMetrics.events_by_type[event.event_type]) {
        sessionMetrics.events_by_type[event.event_type] = 0;
      }
      sessionMetrics.events_by_type[event.event_type]++;
    });

    return Object.values(metrics);
  }

  // Performance tracking
  static async getResponseTimes(agentId, timeframe = 'day') {
    const timeframeDate = this.getTimeframeDate(timeframe);
    
    const events = await this.query()
      .where('event_timestamp', '>=', timeframeDate)
      .where('event_type', 'in', ['message_sent', 'agent_joined'])
      .whereExists(function() {
        this.select('*')
          .from('support_session_events as prev_events')
          .where('prev_events.session_id', this.raw('support_session_events.session_id'))
          .where('prev_events.actor_type', 'user')
          .where('prev_events.event_timestamp', '<', this.raw('support_session_events.event_timestamp'));
      })
      .orderBy(['session_id', 'event_timestamp']);

    // Calculate response times between user messages and agent responses
    const responseTimes = [];
    let currentSession = null;
    let lastUserMessage = null;

    for (const event of events) {
      if (event.session_id !== currentSession) {
        currentSession = event.session_id;
        lastUserMessage = null;
      }

      if (event.actor_type === 'user' && event.event_type === 'message_sent') {
        lastUserMessage = new Date(event.event_timestamp);
      } else if (event.actor_type === 'agent' && lastUserMessage) {
        const responseTime = (new Date(event.event_timestamp) - lastUserMessage) / 1000;
        responseTimes.push({
          session_id: event.session_id,
          agent_id: event.actor_id,
          response_time_seconds: responseTime,
          timestamp: event.event_timestamp
        });
        lastUserMessage = null;
      }
    }

    return responseTimes;
  }

  // Utility methods
  static getTimeframeDate(timeframe) {
    const now = new Date();
    const timeframeMap = {
      hour: new Date(now - 60 * 60 * 1000),
      day: new Date(now - 24 * 60 * 60 * 1000),
      week: new Date(now - 7 * 24 * 60 * 60 * 1000),
      month: new Date(now - 30 * 24 * 60 * 60 * 1000)
    };
    
    return timeframeMap[timeframe] || timeframeMap.day;
  }

  static async logEvent(sessionId, eventType, actorId, actorType, options = {}) {
    return this.query().insert({
      session_id: sessionId,
      event_type: eventType,
      actor_id: actorId,
      actor_type: actorType,
      event_data: options.eventData || null,
      event_description: options.description || null,
      telegram_message_id: options.telegramMessageId || null,
      ip_address: options.ipAddress || null,
      event_timestamp: new Date()
    });
  }

  // Session analysis helpers
  static async findLongSessions(minimumDurationMinutes = 60, timeframe = 'day') {
    const timeframeDate = this.getTimeframeDate(timeframe);
    
    return this.query()
      .select('session_id')
      .min('event_timestamp as session_start')
      .max('event_timestamp as session_end')
      .where('event_timestamp', '>=', timeframeDate)
      .groupBy('session_id')
      .havingRaw('TIMESTAMPDIFF(MINUTE, MIN(event_timestamp), MAX(event_timestamp)) >= ?', [minimumDurationMinutes])
      .orderBy(this.raw('TIMESTAMPDIFF(MINUTE, MIN(event_timestamp), MAX(event_timestamp))'), 'desc');
  }

  static async findQuickResolutions(maximumDurationMinutes = 5, timeframe = 'day') {
    const timeframeDate = this.getTimeframeDate(timeframe);
    
    return this.query()
      .select('session_id')
      .min('event_timestamp as session_start')
      .max('event_timestamp as session_end')
      .where('event_timestamp', '>=', timeframeDate)
      .where('event_type', 'session_ended')
      .groupBy('session_id')
      .havingRaw('TIMESTAMPDIFF(MINUTE, MIN(event_timestamp), MAX(event_timestamp)) <= ?', [maximumDurationMinutes])
      .orderBy(this.raw('TIMESTAMPDIFF(MINUTE, MIN(event_timestamp), MAX(event_timestamp))'), 'asc');
  }

  // Audit and compliance
  static async getAuditTrail(sessionId) {
    return this.query()
      .where('session_id', sessionId)
      .withGraphJoined('[session, actor(minimal)]')
      .orderBy('event_timestamp', 'asc')
      .modifiers({
        minimal(builder) {
          builder.select('id', 'first_name', 'last_name', 'email', 'role');
        }
      });
  }

  formatForAudit() {
    return {
      id: this.id,
      session_id: this.session_id,
      event_type: this.event_type,
      actor: this.actor ? {
        id: this.actor.id,
        name: `${this.actor.first_name} ${this.actor.last_name}`,
        role: this.actor.role
      } : null,
      actor_type: this.actor_type,
      timestamp: this.event_timestamp,
      description: this.event_description,
      ip_address: this.ip_address,
      event_data: this.event_data
    };
  }
}

module.exports = SupportSessionEvent;