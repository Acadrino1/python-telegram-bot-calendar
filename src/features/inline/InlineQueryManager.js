/**
 * Advanced Inline Query Manager - Rule 15 Compliance
 * Implements advanced inline query features with caching, pagination, and smart suggestions
 */

const NodeCache = require('node-cache');

class InlineQueryManager {
  constructor() {
    // Cache for inline query results (5 minute TTL)
    this.queryCache = new NodeCache({ stdTTL: 300 });
    this.suggestionCache = new NodeCache({ stdTTL: 600 });
    this.analytics = new Map();
    
    this.pageSize = 20; // Results per page
    this.maxCacheSize = 1000; // Maximum cached queries
  }

  /**
   * Handle inline query with advanced features
   */
  async handleInlineQuery(ctx) {
    const query = ctx.inlineQuery.query.trim();
    const offset = parseInt(ctx.inlineQuery.offset) || 0;
    const userId = ctx.from.id;

    try {
      // Track analytics
      this.trackQueryAnalytics(userId, query);

      // Check cache first
      const cacheKey = `query:${query}:${offset}`;
      let results = this.queryCache.get(cacheKey);

      if (!results) {
        // Generate fresh results
        results = await this.generateInlineResults(query, offset, userId);
        
        // Cache results
        this.queryCache.set(cacheKey, results);
      }

      // Add smart suggestions if query is short
      if (query.length < 3 && offset === 0) {
        const suggestions = await this.getSmartSuggestions(userId);
        results.results = [...suggestions, ...results.results];
      }

      // Answer inline query with pagination
      await ctx.answerInlineQuery(results.results, {
        next_offset: results.hasMore ? (offset + this.pageSize).toString() : '',
        cache_time: 300, // 5 minutes client-side cache
        is_personal: true,
        switch_pm_text: results.results.length === 0 ? 'No results - Tap to open bot' : undefined,
        switch_pm_parameter: 'inline_help'
      });

    } catch (error) {
      console.error('Inline query error:', error);
      
      // Fallback results
      await ctx.answerInlineQuery([{
        type: 'article',
        id: 'error',
        title: '❌ Error',
        description: 'An error occurred. Please try again.',
        input_message_content: {
          message_text: 'Error processing your query. Please use /help for assistance.'
        }
      }]);
    }
  }

  /**
   * Generate inline results based on query
   */
  async generateInlineResults(query, offset, userId) {
    const results = [];
    let hasMore = false;

    if (!query) {
      // Default suggestions for empty query
      const defaultResults = await this.getDefaultSuggestions(userId);
      return { results: defaultResults.slice(offset, offset + this.pageSize), hasMore: defaultResults.length > offset + this.pageSize };
    }

    // Search appointments
    const appointments = await this.searchAppointments(query, userId, offset);
    results.push(...appointments.results);
    hasMore = appointments.hasMore;

    // Search availability if query looks like a date
    if (this.isDateQuery(query)) {
      const availability = await this.searchAvailability(query, offset);
      results.push(...availability);
    }

    // Search help topics
    if (query.toLowerCase().includes('help') || query.includes('?')) {
      const helpResults = await this.searchHelpTopics(query);
      results.push(...helpResults);
    }

    // Search commands
    if (query.startsWith('/') || query.toLowerCase().includes('command')) {
      const commandResults = await this.searchCommands(query);
      results.push(...commandResults);
    }

    return {
      results: results.slice(0, this.pageSize),
      hasMore: hasMore || results.length > this.pageSize
    };
  }

  /**
   * Get smart suggestions based on user behavior
   */
  async getSmartSuggestions(userId) {
    const cacheKey = `suggestions:${userId}`;
    let suggestions = this.suggestionCache.get(cacheKey);

    if (!suggestions) {
      suggestions = await this.generateSmartSuggestions(userId);
      this.suggestionCache.set(cacheKey, suggestions);
    }

    return suggestions;
  }

  /**
   * Generate personalized smart suggestions
   */
  async generateSmartSuggestions(userId) {
    const suggestions = [];

    try {
      const User = require('../../models/User');
      const Appointment = require('../../models/Appointment');
      
      const user = await User.query().where('telegram_id', userId.toString()).first();
      
      if (user) {
        // Suggest upcoming appointments
        const upcomingAppointments = await Appointment.query()
          .where('user_id', user.id)
          .where('appointment_date', '>', new Date())
          .orderBy('appointment_date')
          .limit(3);

        upcomingAppointments.forEach((apt, index) => {
          suggestions.push({
            type: 'article',
            id: `upcoming_${apt.id}`,
            title: `📅 Upcoming: ${apt.appointment_date.toDateString()}`,
            description: `${apt.appointment_time} - Lodge Mobile Activation`,
            thumb_url: 'https://via.placeholder.com/64x64/4CAF50/FFFFFF?text=📅',
            input_message_content: {
              message_text: `📅 *Upcoming Appointment*\n\nDate: ${apt.appointment_date.toDateString()}\nTime: ${apt.appointment_time}\nService: Lodge Mobile Activation\nReference: ${apt.reference_id}`
            }
          });
        });

        // Suggest quick actions
        suggestions.push({
          type: 'article',
          id: 'quick_book',
          title: '⚡ Quick Book',
          description: 'Book a new appointment quickly',
          thumb_url: 'https://via.placeholder.com/64x64/2196F3/FFFFFF?text=📅',
          input_message_content: {
            message_text: '/book'
          }
        });

        suggestions.push({
          type: 'article',
          id: 'quick_appointments',
          title: '📋 My Appointments',
          description: 'View all your appointments',
          thumb_url: 'https://via.placeholder.com/64x64/FF9800/FFFFFF?text=📋',
          input_message_content: {
            message_text: '/myappointments'
          }
        });
      }

      // Add general help suggestion
      suggestions.push({
        type: 'article',
        id: 'help_general',
        title: '❓ Need Help?',
        description: 'Get help with using the bot',
        thumb_url: 'https://via.placeholder.com/64x64/9C27B0/FFFFFF?text=❓',
        input_message_content: {
          message_text: '/help'
        }
      });

    } catch (error) {
      console.error('Error generating smart suggestions:', error);
    }

    return suggestions;
  }

  /**
   * Search user appointments
   */
  async searchAppointments(query, userId, offset) {
    try {
      const User = require('../../models/User');
      const Appointment = require('../../models/Appointment');
      
      const user = await User.query().where('telegram_id', userId.toString()).first();
      if (!user) return { results: [], hasMore: false };

      const appointments = await Appointment.query()
        .where('user_id', user.id)
        .where(builder => {
          builder
            .whereRaw('LOWER(reference_id) LIKE ?', [`%${query.toLowerCase()}%`])
            .orWhereRaw('DATE(appointment_date) LIKE ?', [`%${query}%`])
            .orWhereRaw('appointment_time LIKE ?', [`%${query}%`]);
        })
        .orderBy('appointment_date', 'desc')
        .limit(this.pageSize + 1)
        .offset(offset);

      const hasMore = appointments.length > this.pageSize;
      const results = appointments.slice(0, this.pageSize).map(apt => ({
        type: 'article',
        id: `apt_${apt.id}`,
        title: `📅 ${apt.appointment_date.toDateString()}`,
        description: `${apt.appointment_time} - ${apt.status} (Ref: ${apt.reference_id})`,
        thumb_url: apt.status === 'confirmed' 
          ? 'https://via.placeholder.com/64x64/4CAF50/FFFFFF?text=✅'
          : 'https://via.placeholder.com/64x64/FF9800/FFFFFF?text=⏳',
        input_message_content: {
          message_text: `📅 *Appointment Details*\n\nDate: ${apt.appointment_date.toDateString()}\nTime: ${apt.appointment_time}\nStatus: ${apt.status}\nReference: ${apt.reference_id}\n\nUse /myappointments to manage your appointments.`
        }
      }));

      return { results, hasMore };
    } catch (error) {
      console.error('Error searching appointments:', error);
      return { results: [], hasMore: false };
    }
  }

  /**
   * Search available time slots
   */
  async searchAvailability(dateQuery, offset) {
    try {
      const AvailabilityService = require('../../services/AvailabilityService');
      const availabilityService = new AvailabilityService();

      // Parse date query
      const date = this.parseDate(dateQuery);
      if (!date) return [];

      const availability = await availabilityService.getAvailableSlots(date);
      
      return availability.slice(offset, offset + 5).map(slot => ({
        type: 'article',
        id: `avail_${slot.time}`,
        title: `🕐 ${slot.time} Available`,
        description: `Available slot on ${date.toDateString()}`,
        thumb_url: 'https://via.placeholder.com/64x64/4CAF50/FFFFFF?text=🕐',
        input_message_content: {
          message_text: `🕐 *Available Time Slot*\n\nDate: ${date.toDateString()}\nTime: ${slot.time}\n\nUse /book to schedule this appointment.`
        }
      }));
    } catch (error) {
      console.error('Error searching availability:', error);
      return [];
    }
  }

  /**
   * Search help topics
   */
  async searchHelpTopics(query) {
    const helpTopics = [
      { key: 'booking', title: 'How to Book', description: 'Learn how to book appointments' },
      { key: 'cancel', title: 'Cancel Appointment', description: 'How to cancel your appointment' },
      { key: 'reschedule', title: 'Reschedule', description: 'How to reschedule appointments' },
      { key: 'support', title: 'Get Support', description: 'Contact live support' },
      { key: 'account', title: 'Account Help', description: 'Account and profile help' }
    ];

    return helpTopics
      .filter(topic => 
        topic.title.toLowerCase().includes(query.toLowerCase()) ||
        topic.description.toLowerCase().includes(query.toLowerCase())
      )
      .map(topic => ({
        type: 'article',
        id: `help_${topic.key}`,
        title: `❓ ${topic.title}`,
        description: topic.description,
        thumb_url: 'https://via.placeholder.com/64x64/2196F3/FFFFFF?text=❓',
        input_message_content: {
          message_text: `/help ${topic.key}`
        }
      }));
  }

  /**
   * Search available commands
   */
  async searchCommands(query) {
    const commands = [
      { cmd: '/book', desc: 'Book a new appointment' },
      { cmd: '/myappointments', desc: 'View your appointments' },
      { cmd: '/cancel', desc: 'Cancel an appointment' },
      { cmd: '/help', desc: 'Get help and support' },
      { cmd: '/support', desc: 'Live support chat' },
      { cmd: '/language', desc: 'Change language' }
    ];

    return commands
      .filter(command => 
        command.cmd.includes(query.toLowerCase()) ||
        command.desc.toLowerCase().includes(query.toLowerCase())
      )
      .map(command => ({
        type: 'article',
        id: `cmd_${command.cmd.replace('/', '')}`,
        title: `⚡ ${command.cmd}`,
        description: command.desc,
        thumb_url: 'https://via.placeholder.com/64x64/9C27B0/FFFFFF?text=⚡',
        input_message_content: {
          message_text: command.cmd
        }
      }));
  }

  /**
   * Get default suggestions for empty queries
   */
  async getDefaultSuggestions(userId) {
    return [
      {
        type: 'article',
        id: 'default_book',
        title: '📅 Book Appointment',
        description: 'Schedule your Lodge Mobile activation',
        thumb_url: 'https://via.placeholder.com/64x64/4CAF50/FFFFFF?text=📅',
        input_message_content: { message_text: '/book' }
      },
      {
        type: 'article',
        id: 'default_appointments',
        title: '📋 My Appointments',
        description: 'View and manage your appointments',
        thumb_url: 'https://via.placeholder.com/64x64/2196F3/FFFFFF?text=📋',
        input_message_content: { message_text: '/myappointments' }
      },
      {
        type: 'article',
        id: 'default_help',
        title: '❓ Help & Support',
        description: 'Get help using the bot',
        thumb_url: 'https://via.placeholder.com/64x64/FF9800/FFFFFF?text=❓',
        input_message_content: { message_text: '/help' }
      }
    ];
  }

  /**
   * Track query analytics
   */
  trackQueryAnalytics(userId, query) {
    const today = new Date().toISOString().split('T')[0];
    const key = `${today}:${userId}`;
    
    if (!this.analytics.has(key)) {
      this.analytics.set(key, { queries: [], count: 0 });
    }
    
    const userAnalytics = this.analytics.get(key);
    userAnalytics.queries.push({
      query,
      timestamp: new Date(),
      length: query.length
    });
    userAnalytics.count++;
    
    // Clean old analytics (keep only last 7 days)
    if (this.analytics.size > 1000) {
      const oldKeys = Array.from(this.analytics.keys())
        .filter(k => {
          const date = new Date(k.split(':')[0]);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return date < weekAgo;
        });
      
      oldKeys.forEach(key => this.analytics.delete(key));
    }
  }

  /**
   * Check if query looks like a date
   */
  isDateQuery(query) {
    const datePatterns = [
      /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{4}-\d{1,2}-\d{1,2}$/, // YYYY-MM-DD
      /^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i
    ];
    
    return datePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Parse date from query
   */
  parseDate(query) {
    try {
      const today = new Date();
      
      if (query.toLowerCase() === 'today') {
        return today;
      }
      
      if (query.toLowerCase() === 'tomorrow') {
        return new Date(today.getTime() + 24 * 60 * 60 * 1000);
      }
      
      // Try parsing as date
      const date = new Date(query);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get analytics summary
   */
  getAnalytics() {
    const summary = {
      totalQueries: 0,
      uniqueUsers: this.analytics.size,
      averageQueryLength: 0,
      topQueries: {},
      cacheHitRate: this.queryCache.getStats()
    };

    let totalLength = 0;
    
    for (const [key, data] of this.analytics) {
      summary.totalQueries += data.count;
      
      data.queries.forEach(q => {
        totalLength += q.length;
        summary.topQueries[q.query] = (summary.topQueries[q.query] || 0) + 1;
      });
    }
    
    summary.averageQueryLength = summary.totalQueries > 0 ? totalLength / summary.totalQueries : 0;
    
    // Sort top queries
    summary.topQueries = Object.entries(summary.topQueries)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [query, count]) => ({ ...obj, [query]: count }), {});

    return summary;
  }

  /**
   * Clear caches
   */
  clearCaches() {
    this.queryCache.flushAll();
    this.suggestionCache.flushAll();
    this.analytics.clear();
  }
}

module.exports = InlineQueryManager;