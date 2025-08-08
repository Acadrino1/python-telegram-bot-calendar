const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');

class LiveSupportManager {
  constructor(bot, config) {
    this.bot = bot;
    this.config = config;
    this.supportGroupId = config.supportGroupId || null; // Support agents group
    this.ticketsFile = path.join(__dirname, '../../data/support_tickets.json');
    this.agentsFile = path.join(__dirname, '../../data/support_agents.json');
    this.rateLimitsFile = path.join(__dirname, '../../data/support_rate_limits.json');
    
    // In-memory cache for active tickets
    this.activeTickets = new Map();
    this.userToTicket = new Map();
    this.agentAssignments = new Map();
    
    // Rate limiting settings
    this.maxTicketsPerDay = 5;
    this.maxMessagesPerHour = 50;
    
    this.ensureDataFiles();
  }
  
  ensureDataFiles() {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Initialize files if they don't exist
    if (!fs.existsSync(this.ticketsFile)) {
      fs.writeFileSync(this.ticketsFile, JSON.stringify({
        tickets: {},
        messageHistory: {}
      }, null, 2));
    }
    
    if (!fs.existsSync(this.agentsFile)) {
      fs.writeFileSync(this.agentsFile, JSON.stringify({
        agents: [],
        activeAgents: {}
      }, null, 2));
    }
    
    if (!fs.existsSync(this.rateLimitsFile)) {
      fs.writeFileSync(this.rateLimitsFile, JSON.stringify({
        userLimits: {},
        blockedUsers: []
      }, null, 2));
    }
  }
  
  // Generate unique ticket ID with letters only
  generateTicketId() {
    const generateLetterCode = (length) => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += letters.charAt(Math.floor(Math.random() * letters.length));
      }
      return result;
    };
    
    // Create unique ID: SUPP-XXXX-XXXX (8 random letters)
    return `SUPP-${generateLetterCode(4)}-${generateLetterCode(4)}`;
  }
  
  // Check rate limits
  async checkRateLimit(userId) {
    const rateLimits = this.getRateLimits();
    const userLimit = rateLimits.userLimits[userId] || { 
      dailyTickets: 0, 
      hourlyMessages: 0,
      lastTicketDate: null,
      lastMessageHour: null
    };
    
    const now = new Date();
    const today = now.toDateString();
    const currentHour = now.getHours();
    
    // Reset daily counter if new day
    if (userLimit.lastTicketDate !== today) {
      userLimit.dailyTickets = 0;
      userLimit.lastTicketDate = today;
    }
    
    // Reset hourly counter if new hour
    if (userLimit.lastMessageHour !== currentHour) {
      userLimit.hourlyMessages = 0;
      userLimit.lastMessageHour = currentHour;
    }
    
    // Check if user is blocked
    if (rateLimits.blockedUsers.includes(userId)) {
      return { allowed: false, reason: 'blocked' };
    }
    
    // Check daily ticket limit
    if (userLimit.dailyTickets >= this.maxTicketsPerDay) {
      return { allowed: false, reason: 'daily_limit' };
    }
    
    // Check hourly message limit
    if (userLimit.hourlyMessages >= this.maxMessagesPerHour) {
      return { allowed: false, reason: 'hourly_limit' };
    }
    
    return { allowed: true };
  }
  
  // Update rate limits
  updateRateLimit(userId, type = 'message') {
    const rateLimits = this.getRateLimits();
    
    if (!rateLimits.userLimits[userId]) {
      rateLimits.userLimits[userId] = {
        dailyTickets: 0,
        hourlyMessages: 0,
        lastTicketDate: null,
        lastMessageHour: null
      };
    }
    
    const now = new Date();
    const userLimit = rateLimits.userLimits[userId];
    
    if (type === 'ticket') {
      userLimit.dailyTickets++;
      userLimit.lastTicketDate = now.toDateString();
    } else if (type === 'message') {
      userLimit.hourlyMessages++;
      userLimit.lastMessageHour = now.getHours();
    }
    
    this.saveRateLimits(rateLimits);
  }
  
  // Create new support ticket
  async createTicket(userId, userName, initialMessage) {
    const ticketId = this.generateTicketId();
    const ticket = {
      ticketId,
      userId,
      userName: userName || 'User',
      status: 'open',
      priority: 'normal',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      assignedAgent: null
    };
    
    // Save ticket
    const tickets = this.getTickets();
    tickets.tickets[ticketId] = ticket;
    tickets.messageHistory[ticketId] = [];
    
    // Add initial message if provided
    if (initialMessage) {
      tickets.messageHistory[ticketId].push({
        sender: 'user',
        message: initialMessage,
        timestamp: new Date().toISOString()
      });
    }
    
    this.saveTickets(tickets);
    
    // Update caches
    this.activeTickets.set(ticketId, ticket);
    this.userToTicket.set(userId, ticketId);
    
    // Update rate limit
    this.updateRateLimit(userId, 'ticket');
    
    return ticket;
  }
  
  // Get active ticket for user
  getActiveTicket(userId) {
    const ticketId = this.userToTicket.get(userId);
    if (ticketId) {
      return this.activeTickets.get(ticketId);
    }
    
    // Check persistent storage
    const tickets = this.getTickets();
    for (const [id, ticket] of Object.entries(tickets.tickets)) {
      if (ticket.userId === userId && ticket.status === 'open') {
        // Cache it
        this.activeTickets.set(id, ticket);
        this.userToTicket.set(userId, id);
        return ticket;
      }
    }
    
    return null;
  }
  
  // Close ticket
  closeTicket(ticketId) {
    const tickets = this.getTickets();
    
    if (tickets.tickets[ticketId]) {
      tickets.tickets[ticketId].status = 'closed';
      tickets.tickets[ticketId].closedAt = new Date().toISOString();
      this.saveTickets(tickets);
      
      // Clear caches
      const ticket = this.activeTickets.get(ticketId);
      if (ticket) {
        this.userToTicket.delete(ticket.userId);
        this.activeTickets.delete(ticketId);
        
        // Clear agent assignment
        if (ticket.assignedAgent) {
          this.agentAssignments.delete(ticket.assignedAgent);
        }
      }
      
      return true;
    }
    
    return false;
  }
  
  // Add message to ticket history
  addMessage(ticketId, sender, message) {
    const tickets = this.getTickets();
    
    if (!tickets.messageHistory[ticketId]) {
      tickets.messageHistory[ticketId] = [];
    }
    
    tickets.messageHistory[ticketId].push({
      sender,
      message,
      timestamp: new Date().toISOString()
    });
    
    // Update last activity
    if (tickets.tickets[ticketId]) {
      tickets.tickets[ticketId].lastActivity = new Date().toISOString();
    }
    
    this.saveTickets(tickets);
  }
  
  // Forward message to support group (anonymized)
  async forwardToSupport(ctx, ticket, message) {
    if (!this.supportGroupId) {
      console.error('Support group ID not configured');
      return false;
    }
    
    try {
      // Create anonymous message for support group
      const supportMessage = `🎫 *Ticket: ${ticket.ticketId}*\n` +
        `👤 User: Anonymous (ID: ${ticket.userId.substring(0, 6)}...)\n` +
        `📅 Created: ${new Date(ticket.createdAt).toLocaleString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💬 *Message:*\n${message}\n` +
        `━━━━━━━━━━━━━━━━━━━━━`;
      
      // Send to support group with inline keyboard
      await this.bot.telegram.sendMessage(this.supportGroupId, supportMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✍️ Reply', callback_data: `support_reply_${ticket.ticketId}` },
              { text: '✅ Close', callback_data: `support_close_${ticket.ticketId}` }
            ],
            [
              { text: '📊 History', callback_data: `support_history_${ticket.ticketId}` },
              { text: '🚨 Escalate', callback_data: `support_escalate_${ticket.ticketId}` }
            ]
          ]
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error forwarding to support:', error);
      return false;
    }
  }
  
  // Send response from agent to user (appears as "Live Support")
  async sendResponseToUser(userId, message) {
    try {
      const responseMessage = `💬 *Live Support:*\n\n${message}`;
      
      await this.bot.telegram.sendMessage(userId, responseMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💬 Reply', callback_data: 'support_continue' },
              { text: '✅ Close Ticket', callback_data: 'support_end' }
            ]
          ]
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error sending response to user:', error);
      return false;
    }
  }
  
  // Get available support agents
  getAvailableAgents() {
    const agents = this.getAgents();
    return agents.agents.filter(agent => 
      agents.activeAgents[agent.id] && 
      agents.activeAgents[agent.id].status === 'available'
    );
  }
  
  // Assign ticket to agent
  assignTicket(ticketId, agentId) {
    const tickets = this.getTickets();
    
    if (tickets.tickets[ticketId]) {
      tickets.tickets[ticketId].assignedAgent = agentId;
      this.saveTickets(tickets);
      
      // Update cache
      this.agentAssignments.set(agentId, ticketId);
      
      return true;
    }
    
    return false;
  }
  
  // File operations
  getTickets() {
    try {
      const data = fs.readFileSync(this.ticketsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading tickets:', error);
      return { tickets: {}, messageHistory: {} };
    }
  }
  
  saveTickets(data) {
    try {
      fs.writeFileSync(this.ticketsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving tickets:', error);
    }
  }
  
  getAgents() {
    try {
      const data = fs.readFileSync(this.agentsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading agents:', error);
      return { agents: [], activeAgents: {} };
    }
  }
  
  saveAgents(data) {
    try {
      fs.writeFileSync(this.agentsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving agents:', error);
    }
  }
  
  getRateLimits() {
    try {
      const data = fs.readFileSync(this.rateLimitsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading rate limits:', error);
      return { userLimits: {}, blockedUsers: [] };
    }
  }
  
  saveRateLimits(data) {
    try {
      fs.writeFileSync(this.rateLimitsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving rate limits:', error);
    }
  }
  
  // Admin functions
  addSupportAgent(agentId, agentName) {
    const agents = this.getAgents();
    
    // Check if agent already exists
    const exists = agents.agents.find(a => a.id === agentId);
    if (!exists) {
      agents.agents.push({
        id: agentId,
        name: agentName,
        addedAt: new Date().toISOString()
      });
      
      agents.activeAgents[agentId] = {
        status: 'available',
        currentTickets: 0,
        lastActivity: new Date().toISOString()
      };
      
      this.saveAgents(agents);
      return true;
    }
    
    return false;
  }
  
  removeSupportAgent(agentId) {
    const agents = this.getAgents();
    
    agents.agents = agents.agents.filter(a => a.id !== agentId);
    delete agents.activeAgents[agentId];
    
    this.saveAgents(agents);
    return true;
  }
  
  // Get statistics
  getStatistics() {
    const tickets = this.getTickets();
    const agents = this.getAgents();
    
    const stats = {
      totalTickets: Object.keys(tickets.tickets).length,
      openTickets: Object.values(tickets.tickets).filter(t => t.status === 'open').length,
      closedTickets: Object.values(tickets.tickets).filter(t => t.status === 'closed').length,
      totalAgents: agents.agents.length,
      availableAgents: this.getAvailableAgents().length,
      todayTickets: Object.values(tickets.tickets).filter(t => {
        const created = new Date(t.createdAt);
        const today = new Date();
        return created.toDateString() === today.toDateString();
      }).length
    };
    
    return stats;
  }
}

module.exports = LiveSupportManager;