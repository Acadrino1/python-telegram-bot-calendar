const EventEmitter = require('events');

/**
 * Bot-specific monitoring service for Lodge Scheduler
 * Tracks bot performance, user interactions, and command analytics
 */
class BotMonitoringService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      // Monitoring intervals
      metricsInterval: options.metricsInterval || 60000, // 1 minute
      sessionTimeout: options.sessionTimeout || 30 * 60 * 1000, // 30 minutes
      
      // Thresholds
      slowCommandThreshold: options.slowCommandThreshold || 3000, // 3 seconds
      highErrorRateThreshold: options.highErrorRateThreshold || 0.1, // 10%
      maxConcurrentSessions: options.maxConcurrentSessions || 500,
      
      // Features
      trackUserSessions: options.trackUserSessions !== false,
      trackCommandPerformance: options.trackCommandPerformance !== false,
      trackUserEngagement: options.trackUserEngagement !== false,
      trackConversationFlow: options.trackConversationFlow !== false
    };

    // Metrics storage
    this.metrics = {
      commands: new Map(), // Command usage statistics
      sessions: new Map(), // Active user sessions
      users: new Map(), // User interaction data
      performance: new Map(), // Performance metrics
      errors: new Map(), // Error tracking
      engagement: new Map() // User engagement metrics
    };

    // Real-time counters
    this.counters = {
      totalCommands: 0,
      successfulCommands: 0,
      failedCommands: 0,
      activeSessions: 0,
      uniqueUsers: new Set(),
      totalMessages: 0
    };

    // Session tracking
    this.activeSessions = new Map();
    
    // Performance tracking
    this.commandTimings = new Map();
    
    // User journey tracking
    this.userJourneys = new Map();

    this.isInitialized = false;
  }

  /**
   * Initialize the bot monitoring service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('🤖 Initializing Bot Monitoring Service...');

    // Start periodic metrics collection
    this.startMetricsCollection();

    // Start session cleanup
    this.startSessionCleanup();

    this.isInitialized = true;
    console.log('✅ Bot Monitoring Service initialized');
  }

  /**
   * Track bot command execution
   */
  trackCommand(userId, command, startTime = Date.now()) {
    const sessionId = this.getOrCreateSession(userId);
    
    // Store command start for performance tracking
    const commandId = `${userId}_${command}_${startTime}`;
    this.commandTimings.set(commandId, {
      userId,
      command,
      startTime,
      sessionId
    });

    // Update counters
    this.counters.totalCommands++;
    this.counters.uniqueUsers.add(userId);

    // Track command usage
    const commandKey = command.toLowerCase();
    const commandStats = this.metrics.commands.get(commandKey) || {
      name: command,
      count: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      slowResponses: 0,
      lastUsed: null,
      users: new Set()
    };

    commandStats.count++;
    commandStats.lastUsed = startTime;
    commandStats.users.add(userId);
    this.metrics.commands.set(commandKey, commandStats);

    // Update session activity
    if (this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      session.commandCount++;
      session.lastActivity = startTime;
      session.commands.push({
        command,
        timestamp: startTime,
        status: 'started'
      });
    }

    return commandId;
  }

  /**
   * Complete command tracking
   */
  completeCommand(commandId, success = true, error = null, metadata = {}) {
    const commandData = this.commandTimings.get(commandId);
    if (!commandData) return;

    const endTime = Date.now();
    const responseTime = endTime - commandData.startTime;
    const { userId, command, sessionId } = commandData;

    // Update counters
    if (success) {
      this.counters.successfulCommands++;
    } else {
      this.counters.failedCommands++;
    }

    // Update command statistics
    const commandKey = command.toLowerCase();
    const commandStats = this.metrics.commands.get(commandKey);
    if (commandStats) {
      commandStats.totalResponseTime += responseTime;
      commandStats.averageResponseTime = commandStats.totalResponseTime / commandStats.count;
      
      if (success) {
        commandStats.successCount++;
      } else {
        commandStats.errorCount++;
      }

      if (responseTime > this.config.slowCommandThreshold) {
        commandStats.slowResponses++;
        
        // Emit slow command alert
        this.emit('slow_command', {
          command,
          responseTime,
          threshold: this.config.slowCommandThreshold,
          userId,
          sessionId
        });
      }
    }

    // Track errors
    if (!success && error) {
      this.trackError(command, error, userId, responseTime);
    }

    // Update session
    if (this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      const commandIndex = session.commands.findIndex(
        cmd => cmd.command === command && cmd.status === 'started'
      );
      
      if (commandIndex >= 0) {
        session.commands[commandIndex] = {
          command,
          timestamp: commandData.startTime,
          responseTime,
          status: success ? 'completed' : 'failed',
          error: error?.message
        };
      }
    }

    // Track performance
    this.trackPerformance(command, responseTime, success);

    // Update user engagement
    this.updateUserEngagement(userId, command, success, responseTime);

    // Cleanup
    this.commandTimings.delete(commandId);

    // Emit command completed event
    this.emit('command_completed', {
      command,
      userId,
      sessionId,
      responseTime,
      success,
      error: error?.message
    });
  }

  /**
   * Track user session
   */
  trackSession(userId, action, metadata = {}) {
    const sessionId = this.getOrCreateSession(userId);
    const now = Date.now();

    if (action === 'start') {
      // Session already created in getOrCreateSession
      this.counters.activeSessions = this.activeSessions.size;
    } else if (action === 'end') {
      if (this.activeSessions.has(sessionId)) {
        const session = this.activeSessions.get(sessionId);
        session.endTime = now;
        session.duration = now - session.startTime;
        session.status = 'ended';

        // Update engagement metrics
        this.updateSessionEngagement(userId, session);

        // Store session history
        this.storeSessionHistory(session);

        // Remove active session
        this.activeSessions.delete(sessionId);
        this.counters.activeSessions = this.activeSessions.size;

        // Emit session ended event
        this.emit('session_ended', {
          sessionId,
          userId,
          duration: session.duration,
          commandCount: session.commandCount,
          messageCount: session.messageCount
        });
      }
    }

    return sessionId;
  }

  /**
   * Track user message
   */
  trackMessage(userId, messageType, content = '', metadata = {}) {
    const sessionId = this.getOrCreateSession(userId);
    this.counters.totalMessages++;

    // Update session
    if (this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      session.messageCount++;
      session.lastActivity = Date.now();
    }

    // Track message type statistics
    const messageKey = `messages:${messageType}`;
    const messageCount = this.metrics.engagement.get(messageKey) || 0;
    this.metrics.engagement.set(messageKey, messageCount + 1);

    // Track conversation flow
    if (this.config.trackConversationFlow) {
      this.trackConversationFlow(userId, messageType, content, metadata);
    }

    // Emit message event
    this.emit('message_tracked', {
      userId,
      sessionId,
      messageType,
      timestamp: Date.now()
    });
  }

  /**
   * Track bot errors
   */
  trackError(command, error, userId, responseTime = 0) {
    const errorKey = `${command}:${error.name || 'UnknownError'}`;
    const errorData = this.metrics.errors.get(errorKey) || {
      command,
      errorType: error.name || 'UnknownError',
      message: error.message,
      count: 0,
      users: new Set(),
      firstOccurred: Date.now(),
      lastOccurred: null,
      averageResponseTime: 0,
      totalResponseTime: 0
    };

    errorData.count++;
    errorData.users.add(userId);
    errorData.lastOccurred = Date.now();
    errorData.totalResponseTime += responseTime;
    errorData.averageResponseTime = errorData.totalResponseTime / errorData.count;

    this.metrics.errors.set(errorKey, errorData);

    // Check error rate threshold
    const commandStats = this.metrics.commands.get(command.toLowerCase());
    if (commandStats) {
      const errorRate = commandStats.errorCount / commandStats.count;
      if (errorRate > this.config.highErrorRateThreshold) {
        this.emit('high_error_rate', {
          command,
          errorRate,
          threshold: this.config.highErrorRateThreshold,
          errorCount: commandStats.errorCount,
          totalCount: commandStats.count
        });
      }
    }

    // Emit error event
    this.emit('bot_error', {
      command,
      error: error.message,
      userId,
      responseTime,
      errorType: error.name
    });
  }

  /**
   * Get comprehensive bot metrics
   */
  getBotMetrics() {
    const now = Date.now();
    
    return {
      timestamp: now,
      overview: {
        totalCommands: this.counters.totalCommands,
        successfulCommands: this.counters.successfulCommands,
        failedCommands: this.counters.failedCommands,
        successRate: this.counters.totalCommands > 0 
          ? this.counters.successfulCommands / this.counters.totalCommands 
          : 0,
        activeSessions: this.counters.activeSessions,
        uniqueUsers: this.counters.uniqueUsers.size,
        totalMessages: this.counters.totalMessages,
        uptime: process.uptime()
      },
      commands: this.getCommandStatistics(),
      performance: this.getPerformanceMetrics(),
      sessions: this.getSessionStatistics(),
      engagement: this.getEngagementMetrics(),
      errors: this.getErrorStatistics()
    };
  }

  /**
   * Get real-time bot status
   */
  getBotStatus() {
    return {
      status: this.counters.activeSessions < this.config.maxConcurrentSessions ? 'healthy' : 'overloaded',
      activeSessions: this.counters.activeSessions,
      maxSessions: this.config.maxConcurrentSessions,
      commandsPerMinute: this.getCommandsPerMinute(),
      averageResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
      topCommands: this.getTopCommands(5),
      lastActivity: this.getLastActivity()
    };
  }

  /**
   * Get user analytics
   */
  getUserAnalytics(timeRange = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - timeRange;
    
    return {
      activeUsers: this.getActiveUsersCount(cutoff),
      newUsers: this.getNewUsersCount(cutoff),
      returningUsers: this.getReturningUsersCount(cutoff),
      userEngagement: this.getUserEngagementMetrics(cutoff),
      topUsers: this.getTopUsers(10, cutoff),
      userJourneys: this.getUserJourneyAnalytics(cutoff)
    };
  }

  // Private helper methods

  getOrCreateSession(userId) {
    const sessionId = `session_${userId}_${Date.now()}`;
    
    // Check if user has active session
    for (const [id, session] of this.activeSessions.entries()) {
      if (session.userId === userId && session.status === 'active') {
        return id;
      }
    }

    // Create new session
    const session = {
      id: sessionId,
      userId,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      status: 'active',
      commandCount: 0,
      messageCount: 0,
      commands: [],
      lastActivity: Date.now(),
      metadata: {}
    };

    this.activeSessions.set(sessionId, session);
    return sessionId;
  }

  trackPerformance(command, responseTime, success) {
    const performanceKey = `performance:${command}`;
    const perfData = this.metrics.performance.get(performanceKey) || {
      command,
      totalTime: 0,
      count: 0,
      successCount: 0,
      averageTime: 0,
      minTime: Infinity,
      maxTime: 0,
      p95Time: 0,
      times: []
    };

    perfData.totalTime += responseTime;
    perfData.count++;
    if (success) perfData.successCount++;
    
    perfData.averageTime = perfData.totalTime / perfData.count;
    perfData.minTime = Math.min(perfData.minTime, responseTime);
    perfData.maxTime = Math.max(perfData.maxTime, responseTime);
    
    perfData.times.push(responseTime);
    if (perfData.times.length > 100) {
      perfData.times.shift(); // Keep only last 100 measurements
    }
    
    // Calculate P95
    const sorted = [...perfData.times].sort((a, b) => a - b);
    perfData.p95Time = sorted[Math.floor(sorted.length * 0.95)] || 0;

    this.metrics.performance.set(performanceKey, perfData);
  }

  updateUserEngagement(userId, command, success, responseTime) {
    const userKey = `user:${userId}`;
    const userData = this.metrics.users.get(userKey) || {
      userId,
      firstSeen: Date.now(),
      lastSeen: null,
      totalCommands: 0,
      successfulCommands: 0,
      favoriteCommands: new Map(),
      averageResponseTime: 0,
      totalResponseTime: 0,
      sessions: 0
    };

    userData.lastSeen = Date.now();
    userData.totalCommands++;
    if (success) userData.successfulCommands++;
    
    userData.totalResponseTime += responseTime;
    userData.averageResponseTime = userData.totalResponseTime / userData.totalCommands;

    const commandCount = userData.favoriteCommands.get(command) || 0;
    userData.favoriteCommands.set(command, commandCount + 1);

    this.metrics.users.set(userKey, userData);
  }

  updateUserEngagement(userId, command, success, responseTime) {
    if (!this.config.trackUserEngagement) return;
    
    const engagementKey = `engagement:${userId}`;
    const engagement = this.metrics.engagement.get(engagementKey) || {
      userId,
      score: 0,
      commandsUsed: new Set(),
      sessionsCompleted: 0,
      averageSessionDuration: 0,
      totalSessionTime: 0,
      lastInteraction: null
    };

    engagement.commandsUsed.add(command);
    engagement.lastInteraction = Date.now();
    
    // Simple engagement scoring
    if (success) {
      engagement.score += 1;
    } else {
      engagement.score -= 0.5;
    }

    this.metrics.engagement.set(engagementKey, engagement);
  }

  updateSessionEngagement(userId, session) {
    const engagementKey = `engagement:${userId}`;
    const engagement = this.metrics.engagement.get(engagementKey);
    
    if (engagement) {
      engagement.sessionsCompleted++;
      engagement.totalSessionTime += session.duration;
      engagement.averageSessionDuration = engagement.totalSessionTime / engagement.sessionsCompleted;
    }
  }

  trackConversationFlow(userId, messageType, content, metadata) {
    const flowKey = `flow:${userId}`;
    let userFlow = this.userJourneys.get(flowKey) || [];
    
    userFlow.push({
      messageType,
      content: content.substring(0, 100), // Limit content length
      timestamp: Date.now(),
      metadata
    });

    // Keep only last 50 interactions per user
    if (userFlow.length > 50) {
      userFlow = userFlow.slice(-50);
    }

    this.userJourneys.set(flowKey, userFlow);
  }

  storeSessionHistory(session) {
    // In production, this would typically go to a database
    const historyKey = `session_history:${session.userId}`;
    let userHistory = this.metrics.sessions.get(historyKey) || [];
    
    userHistory.push({
      sessionId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      commandCount: session.commandCount,
      messageCount: session.messageCount
    });

    // Keep only last 10 sessions per user
    if (userHistory.length > 10) {
      userHistory = userHistory.slice(-10);
    }

    this.metrics.sessions.set(historyKey, userHistory);
  }

  startMetricsCollection() {
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
  }

  startSessionCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  collectMetrics() {
    const metrics = this.getBotMetrics();
    this.emit('metrics_collected', metrics);
  }

  cleanupInactiveSessions() {
    const now = Date.now();
    const timeoutThreshold = now - this.config.sessionTimeout;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.lastActivity < timeoutThreshold) {
        session.endTime = now;
        session.duration = now - session.startTime;
        session.status = 'timeout';

        this.updateSessionEngagement(session.userId, session);
        this.storeSessionHistory(session);
        this.activeSessions.delete(sessionId);

        this.emit('session_timeout', {
          sessionId,
          userId: session.userId,
          duration: session.duration
        });
      }
    }

    this.counters.activeSessions = this.activeSessions.size;
  }

  // Metrics calculation methods
  getCommandStatistics() {
    const commands = {};
    for (const [key, stats] of this.metrics.commands.entries()) {
      commands[key] = {
        ...stats,
        users: stats.users.size,
        errorRate: stats.count > 0 ? stats.errorCount / stats.count : 0,
        successRate: stats.count > 0 ? stats.successCount / stats.count : 0
      };
    }
    return commands;
  }

  getPerformanceMetrics() {
    const performance = {};
    for (const [key, perf] of this.metrics.performance.entries()) {
      performance[key] = perf;
    }
    return performance;
  }

  getSessionStatistics() {
    return {
      active: this.activeSessions.size,
      total: this.metrics.sessions.size,
      averageDuration: this.getAverageSessionDuration(),
      longestSession: this.getLongestSessionDuration()
    };
  }

  getEngagementMetrics() {
    const engagement = {};
    for (const [key, value] of this.metrics.engagement.entries()) {
      if (key.startsWith('engagement:')) {
        const userId = key.replace('engagement:', '');
        engagement[userId] = value;
      }
    }
    return engagement;
  }

  getErrorStatistics() {
    const errors = {};
    for (const [key, error] of this.metrics.errors.entries()) {
      errors[key] = {
        ...error,
        users: error.users.size
      };
    }
    return errors;
  }

  // Utility calculation methods
  getCommandsPerMinute() {
    // Simplified calculation - in production, use sliding window
    return Math.round(this.counters.totalCommands / (process.uptime() / 60));
  }

  getAverageResponseTime() {
    let totalTime = 0;
    let count = 0;
    
    for (const perf of this.metrics.performance.values()) {
      totalTime += perf.totalTime;
      count += perf.count;
    }
    
    return count > 0 ? totalTime / count : 0;
  }

  getErrorRate() {
    return this.counters.totalCommands > 0 
      ? this.counters.failedCommands / this.counters.totalCommands 
      : 0;
  }

  getTopCommands(limit = 10) {
    return Array.from(this.metrics.commands.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(cmd => ({
        name: cmd.name,
        count: cmd.count,
        successRate: cmd.successRate
      }));
  }

  getLastActivity() {
    let lastActivity = 0;
    for (const session of this.activeSessions.values()) {
      if (session.lastActivity > lastActivity) {
        lastActivity = session.lastActivity;
      }
    }
    return lastActivity;
  }

  getActiveUsersCount(cutoff) {
    let count = 0;
    for (const userData of this.metrics.users.values()) {
      if (userData.lastSeen >= cutoff) {
        count++;
      }
    }
    return count;
  }

  getNewUsersCount(cutoff) {
    let count = 0;
    for (const userData of this.metrics.users.values()) {
      if (userData.firstSeen >= cutoff) {
        count++;
      }
    }
    return count;
  }

  getReturningUsersCount(cutoff) {
    let count = 0;
    for (const userData of this.metrics.users.values()) {
      if (userData.firstSeen < cutoff && userData.lastSeen >= cutoff) {
        count++;
      }
    }
    return count;
  }

  getUserEngagementMetrics(cutoff) {
    let totalScore = 0;
    let userCount = 0;
    
    for (const engagement of this.metrics.engagement.values()) {
      if (engagement.lastInteraction && engagement.lastInteraction >= cutoff) {
        totalScore += engagement.score;
        userCount++;
      }
    }
    
    return {
      averageScore: userCount > 0 ? totalScore / userCount : 0,
      activeUsers: userCount
    };
  }

  getTopUsers(limit, cutoff) {
    return Array.from(this.metrics.users.values())
      .filter(user => user.lastSeen >= cutoff)
      .sort((a, b) => b.totalCommands - a.totalCommands)
      .slice(0, limit)
      .map(user => ({
        userId: user.userId,
        commandCount: user.totalCommands,
        successRate: user.totalCommands > 0 ? user.successfulCommands / user.totalCommands : 0,
        averageResponseTime: user.averageResponseTime
      }));
  }

  getUserJourneyAnalytics(cutoff) {
    const journeys = [];
    for (const [userId, flow] of this.userJourneys.entries()) {
      const recentFlow = flow.filter(step => step.timestamp >= cutoff);
      if (recentFlow.length > 0) {
        journeys.push({
          userId: userId.replace('flow:', ''),
          steps: recentFlow.length,
          flow: recentFlow
        });
      }
    }
    return journeys;
  }

  getAverageSessionDuration() {
    let totalDuration = 0;
    let sessionCount = 0;
    
    for (const sessions of this.metrics.sessions.values()) {
      for (const session of sessions) {
        totalDuration += session.duration;
        sessionCount++;
      }
    }
    
    return sessionCount > 0 ? totalDuration / sessionCount : 0;
  }

  getLongestSessionDuration() {
    let longest = 0;
    
    for (const sessions of this.metrics.sessions.values()) {
      for (const session of sessions) {
        if (session.duration > longest) {
          longest = session.duration;
        }
      }
    }
    
    return longest;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🤖 Shutting down Bot Monitoring Service...');
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // End all active sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      this.trackSession(session.userId, 'end');
    }

    this.removeAllListeners();
    console.log('✅ Bot Monitoring Service shut down');
  }
}

module.exports = BotMonitoringService;