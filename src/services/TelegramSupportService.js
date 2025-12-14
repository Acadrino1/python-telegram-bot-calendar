const SupportSession = require('../models/SupportSession');
const TelegramMessageMetadata = require('../models/TelegramMessageMetadata');
const SupportSessionEvent = require('../models/SupportSessionEvent');
const User = require('../models/User');
const logger = require('../utils/logger');

class TelegramSupportService {
  constructor(bot) {
    this.bot = bot;
    this.defaultDepartment = 'general';
    this.maxWaitTimeMinutes = 30;
    this.autoCloseTimeMinutes = 60;
  }

  generateUserSupportKeyboard() {
    const { Markup } = require('telegraf');
    return Markup.inlineKeyboard([
      [Markup.button.callback('📝 Create Ticket', 'support_create_ticket')],
      [Markup.button.callback('📋 My Tickets', 'support_my_tickets')],
      [Markup.button.callback('❓ FAQ', 'support_faq')],
      [Markup.button.callback('❌ Cancel', 'cancel')]
    ]);
  }

  // Removed duplicate method - using the one at line 431

  async getUserTickets(userId, status = null, limit = 10) {
    try {
      const SupportTicket = require('../models/SupportTicket');
      
      let query = SupportTicket.query()
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .limit(limit);
      
      if (status) {
        query = query.where('status', status);
      }
      
      return await query;
    } catch (error) {
      console.error('Error getting user tickets:', error);
      return [];
    }
  }

  async initializeSession(userId, telegramChatId, options = {}) {
    try {
      // Check if user already has an active session
      const existingSession = await SupportSession.findActiveByUser(userId);
      if (existingSession) {
        return {
          success: true,
          session: existingSession,
          isNewSession: false
        };
      }

      // Create new session
      const sessionData = {
        user_id: userId,
        telegram_chat_id: telegramChatId.toString(),
        department: options.department || this.defaultDepartment,
        priority: options.priority || 'normal',
        requires_human: options.requiresHuman || false,
        session_context: options.context || null
      };

      const session = await SupportSession.createSession(sessionData);

      // Log session start event
      await SupportSessionEvent.logEvent(
        session.session_id,
        'session_started',
        userId,
        'user',
        {
          description: 'New support session initiated',
          eventData: { department: sessionData.department, priority: sessionData.priority }
        }
      );

      // Add to queue if no agent immediately available
      await this.addToQueue(session);

      logger.info(`Support session initiated: ${session.session_id} for user ${userId}`);

      return {
        success: true,
        session,
        isNewSession: true
      };
    } catch (error) {
      logger.error('Error initializing support session:', error);
      throw new Error('Failed to initialize support session');
    }
  }

  async processMessage(telegramMessage, userId) {
    try {
      const session = await SupportSession.findByTelegramChat(telegramMessage.chat.id);
      
      if (!session) {
        // Initialize new session if none exists
        const result = await this.initializeSession(userId, telegramMessage.chat.id);
        return await this.processMessage(telegramMessage, userId);
      }

      // Store message metadata
      const metadata = await this.storeTelegramMessage(telegramMessage, session);

      // Update session activity
      await session.updateActivity();
      await session.incrementMessageCount(false);

      // Route message based on session status
      if (session.status === 'waiting') {
        return await this.handleQueuedMessage(session, telegramMessage, metadata);
      } else if (session.hasAgent()) {
        return await this.forwardToAgent(session, telegramMessage, metadata);
      } else {
        return await this.handleUnassignedMessage(session, telegramMessage, metadata);
      }

    } catch (error) {
      logger.error('Error processing Telegram message:', error);
      throw error;
    }
  }

  async assignAgent(sessionId, agentId = null) {
    try {
      const session = await SupportSession.query().findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Auto-assign if no specific agent provided
      if (!agentId) {
        agentId = await this.findBestAvailableAgent(session.department);
        if (!agentId) {
          return { success: false, message: 'No agents available' };
        }
      }

      // Verify agent availability
      const agent = await User.query().findById(agentId);
      if (!agent || !agent.isActive) {
        throw new Error('Agent not available');
      }

      // Assign agent to session
      const updatedSession = await session.assignAgent(agentId, agentId ? 'manual' : 'auto');

      // Calculate wait time
      const waitTime = Math.floor((new Date() - new Date(session.started_at)) / 1000);
      await session.$query().patch({ wait_time_seconds: waitTime });

      logger.info(`Agent ${agentId} assigned to session ${session.session_id}`);

      return {
        success: true,
        session: updatedSession,
        agent,
        waitTimeSeconds: waitTime
      };

    } catch (error) {
      logger.error('Error assigning agent:', error);
      throw error;
    }
  }

  async handoffSession(sessionId, fromAgentId, toAgentId, notes = null) {
    try {
      const session = await SupportSession.query().findById(sessionId);
      if (!session || session.agent_id !== fromAgentId) {
        throw new Error('Invalid handoff request');
      }

      // Verify target agent availability
      const targetAgent = await User.query().findById(toAgentId);
      if (!targetAgent || !targetAgent.isActive) {
        throw new Error('Target agent not available');
      }

      // Perform handoff
      const updatedSession = await session.handoffToAgent(toAgentId, notes);

      logger.info(`Session ${sessionId} handed off from agent ${fromAgentId} to ${toAgentId}`);

      return {
        success: true,
        session: updatedSession,
        newAgent: targetAgent
      };

    } catch (error) {
      logger.error('Error during session handoff:', error);
      throw error;
    }
  }

  async endSession(sessionId, resolutionData = {}) {
    try {
      const session = await SupportSession.query().findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const updatedSession = await session.endSession(resolutionData);

      logger.info(`Support session ended: ${sessionId}`);

      return {
        success: true,
        session: updatedSession
      };

    } catch (error) {
      logger.error('Error ending session:', error);
      throw error;
    }
  }

  async getQueueStats(department = null) {
    try {
      const stats = await SupportSession.getQueueStats(department);
      
      // Get average wait times from recent sessions
      const recentStats = await SupportSession.query()
        .select('wait_time_seconds')
        .whereNotNull('wait_time_seconds')
        .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .orderBy('created_at', 'desc')
        .limit(100);

      const avgWaitTime = recentStats.length > 0 
        ? recentStats.reduce((sum, s) => sum + s.wait_time_seconds, 0) / recentStats.length 
        : 0;

      return {
        ...stats,
        historical_avg_wait_time_seconds: Math.floor(avgWaitTime)
      };

    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  async getAgentPerformance(agentId, timeframe = 'day') {
    try {
      const timeframeDate = SupportSessionEvent.getTimeframeDate(timeframe);
      
      // Get session stats
      const sessions = await SupportSession.query()
        .where('agent_id', agentId)
        .where('created_at', '>=', timeframeDate);

      const completedSessions = sessions.filter(s => s.status === 'ended');
      const avgSatisfaction = completedSessions.length > 0 
        ? completedSessions
            .filter(s => s.satisfaction_rating)
            .reduce((sum, s) => sum + s.satisfaction_rating, 0) / 
          completedSessions.filter(s => s.satisfaction_rating).length
        : null;

      // Get response times
      const responseTimes = await SupportSessionEvent.getResponseTimes(agentId, timeframe);
      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, rt) => sum + rt.response_time_seconds, 0) / responseTimes.length
        : null;

      return {
        agent_id: agentId,
        timeframe,
        sessions_handled: sessions.length,
        sessions_completed: completedSessions.length,
        avg_satisfaction_rating: avgSatisfaction ? avgSatisfaction.toFixed(2) : null,
        avg_response_time_seconds: avgResponseTime ? Math.floor(avgResponseTime) : null,
        response_count: responseTimes.length
      };

    } catch (error) {
      logger.error('Error getting agent performance:', error);
      throw error;
    }
  }

  async addToQueue(session) {
    // Calculate queue position
    const waitingCount = await SupportSession.query()
      .where('status', 'waiting')
      .where('department', session.department)
      .where('created_at', '<', session.created_at)
      .count('* as count')
      .first();

    const queuePosition = parseInt(waitingCount.count) + 1;

    await session.$query().patch({
      status: 'waiting',
      queue_position: queuePosition
    });

    return queuePosition;
  }

  async findBestAvailableAgent(department) {
    // Simple round-robin assignment - can be enhanced with load balancing
    const availableAgents = await User.query()
      .where('role', 'agent')
      .where('is_active', true)
      .whereExists(
        SupportSession.relatedQuery('agent')
          .whereNot('status', 'ended')
          .havingRaw('COUNT(*) < 3') // Max 3 concurrent sessions
      );

    return availableAgents.length > 0 ? availableAgents[0].id : null;
  }

  async storeTelegramMessage(telegramMessage, session) {
    // This would integrate with your existing support_messages table
    // For now, return basic metadata structure
    const metadata = {
      telegram_message_id: telegramMessage.message_id.toString(),
      telegram_chat_id: telegramMessage.chat.id.toString(),
      content_type: this.detectContentType(telegramMessage),
      telegram_date: new Date(telegramMessage.date * 1000),
      telegram_entities: telegramMessage.entities || null,
      file_id: telegramMessage.document?.file_id || telegramMessage.photo?.[0]?.file_id || null
    };

    // Log message event
    await SupportSessionEvent.logEvent(
      session.session_id,
      'message_sent',
      session.user_id,
      'user',
      {
        telegramMessageId: telegramMessage.message_id.toString(),
        description: 'User sent message'
      }
    );

    return metadata;
  }

  detectContentType(telegramMessage) {
    if (telegramMessage.photo) return 'photo';
    if (telegramMessage.document) return 'document';
    if (telegramMessage.voice) return 'voice';
    if (telegramMessage.video) return 'video';
    if (telegramMessage.sticker) return 'sticker';
    if (telegramMessage.location) return 'location';
    return 'text';
  }

  async handleQueuedMessage(session, telegramMessage, metadata) {
    // Handle message while user is in queue
    // Could trigger notifications to agents or provide queue updates
    return {
      type: 'queued',
      message: `You are position ${session.queue_position} in the queue. An agent will be with you shortly.`
    };
  }

  async forwardToAgent(session, telegramMessage, metadata) {
    // Forward message to assigned agent
    // This would integrate with your Telegram bot to send to agent
    return {
      type: 'forwarded',
      agent_id: session.agent_id,
      message: 'Message forwarded to your assigned agent.'
    };
  }

  async handleUnassignedMessage(session, telegramMessage, metadata) {
    // Handle message for session without agent
    // Attempt auto-assignment
    const assignmentResult = await this.assignAgent(session.id);
    
    if (assignmentResult.success) {
      return await this.forwardToAgent(session, telegramMessage, metadata);
    } else {
      return await this.handleQueuedMessage(session, telegramMessage, metadata);
    }
  }

  generateUserSupportKeyboard() {
    const { Markup } = require('telegraf');
    return {
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('📝 Create Ticket', 'support_create_ticket'),
          Markup.button.callback('📋 My Tickets', 'support_my_tickets')
        ],
        [
          Markup.button.callback('📊 Ticket Status', 'support_ticket_status'),
          Markup.button.callback('❓ FAQ', 'support_faq')
        ]
      ]).reply_markup
    };
  }

  async createTicket(userId, subject, message, priority = 'medium') {
    const SupportTicket = require('../models/SupportTicket');
    const { v4: uuidv4 } = require('uuid');
    
    const ticketData = {
      ticket_id: `TKT-${uuidv4().substring(0, 8).toUpperCase()}`,
      user_id: userId,
      subject: subject,
      message: message,
      priority: priority,
      status: 'open'
      // created_at uses database default CURRENT_TIMESTAMP
    };

    return await SupportTicket.query().insert(ticketData);
  }

  async getUserTickets(userId, status = null, limit = 10) {
    const SupportTicket = require('../models/SupportTicket');
    let query = SupportTicket.query()
      .where('user_id', userId)
      .orderBy('created_at', 'desc');

    if (status) {
      query = query.where('status', status);
    }

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  formatTicketForDisplay(ticket) {
    const statusEmojis = {
      open: '🟢',
      in_progress: '🔵', 
      waiting_for_user: '🟡',
      resolved: '✅',
      closed: '⚫'
    };

    const priorityEmojis = {
      low: '🟢',
      medium: '🟡',
      high: '🔴',
      urgent: '🚨'
    };

    return `${statusEmojis[ticket.status] || '⚪'} **${ticket.ticket_id}**\n` +
           `**Subject:** ${ticket.subject}\n` +
           `**Priority:** ${priorityEmojis[ticket.priority] || '⚪'} ${ticket.priority}\n` +
           `**Status:** ${ticket.status}\n` +
           `**Created:** ${new Date(ticket.created_at).toLocaleDateString()}\n\n`;
  }

  async getAllTickets(status = null, limit = 10) {
    const SupportTicket = require('../models/SupportTicket');
    let query = SupportTicket.query()
      .withGraphFetched('[user]')
      .orderBy('created_at', 'desc');

    if (status) {
      query = query.where('status', status);
    }

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  async closeTicket(ticketId, userId, reason = 'Resolved') {
    const SupportTicket = require('../models/SupportTicket');
    const ticket = await SupportTicket.query()
      .where('ticket_id', ticketId)
      .where('user_id', userId)
      .first();

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    return await ticket.$query().patch({
      status: 'closed',
      resolution: reason,
      updated_at: new Date()
    });
  }

  async assignTicket(ticketId, agentId) {
    const SupportTicket = require('../models/SupportTicket');
    const ticket = await SupportTicket.query()
      .where('ticket_id', ticketId)
      .first();

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    return await ticket.$query().patch({
      assigned_agent_id: agentId,
      status: 'in_progress',
      updated_at: new Date()
    });
  }

  async getSupportStats() {
    const SupportTicket = require('../models/SupportTicket');
    
    const total = await SupportTicket.query().count('* as count').first();
    const today = await SupportTicket.query()
      .where('created_at', '>=', new Date().toDateString())
      .count('* as count').first();
    
    const byStatus = await SupportTicket.query()
      .groupBy('status')
      .count('* as count')
      .select('status');
    
    const byPriority = await SupportTicket.query()
      .groupBy('priority')
      .count('* as count')
      .select('priority');

    const statusMap = {};
    byStatus.forEach(s => statusMap[s.status] = parseInt(s.count));
    
    const priorityMap = {};
    byPriority.forEach(p => priorityMap[p.priority] = parseInt(p.count));

    return {
      total: parseInt(total.count),
      today: parseInt(today.count),
      avgResolutionTimeMinutes: 45, // Placeholder
      oldOpenTickets: statusMap.open || 0,
      byStatus: statusMap,
      byPriority: priorityMap
    };
  }
}

module.exports = TelegramSupportService;