/**
 * Enhanced Session Management
 * Ensures compliance with Telegram Global Rule 11
 */

const fs = require('fs').promises;
const path = require('path');

class SessionManager {
  constructor(options = {}) {
    this.options = {
      sessionTimeout: options.sessionTimeout || 1800000, // 30 minutes
      persistencePath: options.persistencePath || path.join(process.cwd(), 'data', 'sessions'),
      cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
      maxSessions: options.maxSessions || 10000,
      ...options
    };
    
    this.sessions = new Map();
    this.sessionTimestamps = new Map();
    this.cleanupTimer = null;
    
    this.initialize();
  }

  async initialize() {
    // Ensure persistence directory exists
    try {
      await fs.mkdir(path.dirname(this.options.persistencePath), { recursive: true });
    } catch (error) {
      console.warn('Failed to create session persistence directory:', error);
    }
    
    // Load persisted sessions
    await this.loadSessions();
    
    // Start cleanup timer
    this.startCleanupTimer();
    
    console.log(`SessionManager initialized with ${this.sessions.size} sessions`);
  }

  /**
   * Get or create session for user
   * @param {string} userId - User identifier
   * @returns {Object} - Session object
   */
  getSession(userId) {
    const sessionKey = userId.toString();
    
    // Check if session exists and is not expired
    if (this.sessions.has(sessionKey)) {
      const lastAccess = this.sessionTimestamps.get(sessionKey);
      if (Date.now() - lastAccess > this.options.sessionTimeout) {
        console.log(`Session expired for user ${userId}`);
        this.deleteSession(sessionKey);
      } else {
        // Update timestamp
        this.sessionTimestamps.set(sessionKey, Date.now());
        return this.sessions.get(sessionKey);
      }
    }
    
    // Create new session
    const newSession = this.createNewSession(sessionKey);
    return newSession;
  }

  /**
   * Create new session with default structure
   * @param {string} sessionKey - Session key
   * @returns {Object} - New session object
   */
  createNewSession(sessionKey) {
    const session = {
      // User state
      user: null,
      
      // Conversation state
      conversation: {
        step: null,
        flow: null,
        data: {},
        history: []
      },
      
      // Booking state
      booking: {
        serviceId: null,
        date: null,
        time: null,
        service: null,
        data: {}
      },
      
      // Registration state
      registration: {
        step: null,
        data: {},
        pendingInput: null,
        awaitingInput: false
      },
      
      // Customer info
      customerInfo: {},
      
      // Metadata
      _metadata: {
        created: Date.now(),
        lastAccess: Date.now(),
        version: '1.0.0'
      }
    };
    
    this.sessions.set(sessionKey, session);
    this.sessionTimestamps.set(sessionKey, Date.now());
    
    // Schedule persistence
    this.schedulePersistence(sessionKey);
    
    return session;
  }

  /**
   * Update session data
   * @param {string} userId - User identifier
   * @param {Object} updates - Partial session updates
   */
  updateSession(userId, updates) {
    const sessionKey = userId.toString();
    const session = this.getSession(sessionKey);
    
    // Deep merge updates
    this.deepMerge(session, updates);
    
    // Update metadata
    session._metadata.lastAccess = Date.now();
    
    // Schedule persistence
    this.schedulePersistence(sessionKey);
  }

  /**
   * Delete session
   * @param {string} sessionKey - Session key
   */
  deleteSession(sessionKey) {
    this.sessions.delete(sessionKey);
    this.sessionTimestamps.delete(sessionKey);
    
    // Remove persistence file
    this.removePersistentSession(sessionKey);
  }

  /**
   * Clear session state but keep basic structure
   * @param {string} userId - User identifier
   * @param {Array} preserveKeys - Keys to preserve
   */
  clearSessionState(userId, preserveKeys = ['user']) {
    const sessionKey = userId.toString();
    const session = this.getSession(sessionKey);
    
    // Create new session but preserve specified keys
    const preserved = {};
    preserveKeys.forEach(key => {
      if (session[key]) {
        preserved[key] = JSON.parse(JSON.stringify(session[key]));
      }
    });
    
    // Reset session
    const newSession = this.createNewSession(sessionKey);
    
    // Restore preserved data
    Object.assign(newSession, preserved);
    
    console.log(`Cleared session state for user ${userId}, preserved: ${preserveKeys.join(', ')}`);
  }

  /**
   * Deep merge objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   */
  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * Schedule session persistence
   * @param {string} sessionKey - Session key
   */
  schedulePersistence(sessionKey) {
    // Debounced persistence to avoid too frequent writes
    if (this.persistenceTimers) {
      clearTimeout(this.persistenceTimers.get(sessionKey));
    } else {
      this.persistenceTimers = new Map();
    }
    
    this.persistenceTimers.set(sessionKey, setTimeout(() => {
      this.persistSession(sessionKey);
      this.persistenceTimers.delete(sessionKey);
    }, 5000)); // 5 second delay
  }

  /**
   * Persist single session to disk
   * @param {string} sessionKey - Session key
   */
  async persistSession(sessionKey) {
    try {
      const session = this.sessions.get(sessionKey);
      if (!session) return;
      
      const filePath = path.join(this.options.persistencePath, `${sessionKey}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error(`Failed to persist session ${sessionKey}:`, error);
    }
  }

  /**
   * Load all sessions from disk
   */
  async loadSessions() {
    try {
      const files = await fs.readdir(this.options.persistencePath);
      const sessionFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of sessionFiles) {
        try {
          const sessionKey = path.basename(file, '.json');
          const filePath = path.join(this.options.persistencePath, file);
          const data = await fs.readFile(filePath, 'utf8');
          const session = JSON.parse(data);
          
          // Validate session structure and expiry
          if (this.isValidSession(session)) {
            this.sessions.set(sessionKey, session);
            this.sessionTimestamps.set(sessionKey, session._metadata?.lastAccess || Date.now());
          } else {
            console.warn(`Invalid or expired session file: ${file}`);
            await fs.unlink(filePath); // Remove invalid session
          }
        } catch (error) {
          console.error(`Failed to load session from ${file}:`, error);
        }
      }
      
      console.log(`Loaded ${this.sessions.size} sessions from persistence`);
    } catch (error) {
      console.warn('Failed to load sessions:', error);
    }
  }

  /**
   * Validate session structure and expiry
   * @param {Object} session - Session to validate
   * @returns {boolean} - True if valid
   */
  isValidSession(session) {
    if (!session || typeof session !== 'object') return false;
    
    // Check expiry
    const lastAccess = session._metadata?.lastAccess || 0;
    if (Date.now() - lastAccess > this.options.sessionTimeout) {
      return false;
    }
    
    // Check required structure
    const requiredKeys = ['conversation', 'booking', 'registration', '_metadata'];
    return requiredKeys.every(key => key in session);
  }

  /**
   * Remove persistent session file
   * @param {string} sessionKey - Session key
   */
  async removePersistentSession(sessionKey) {
    try {
      const filePath = path.join(this.options.persistencePath, `${sessionKey}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore file not found errors
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove persistent session ${sessionKey}:`, error);
      }
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Cleanup expired sessions
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionKey, timestamp] of this.sessionTimestamps.entries()) {
      if (now - timestamp > this.options.sessionTimeout) {
        this.deleteSession(sessionKey);
        cleanedCount++;
      }
    }
    
    // If we have too many sessions, clean up oldest ones
    if (this.sessions.size > this.options.maxSessions) {
      const sorted = Array.from(this.sessionTimestamps.entries())
        .sort((a, b) => a[1] - b[1]);
      
      const toRemove = sorted.slice(0, this.sessions.size - this.options.maxSessions);
      toRemove.forEach(([sessionKey]) => {
        this.deleteSession(sessionKey);
        cleanedCount++;
      });
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} sessions. Active sessions: ${this.sessions.size}`);
    }
  }

  /**
   * Get session statistics
   */
  getStats() {
    const now = Date.now();
    const ages = Array.from(this.sessionTimestamps.values()).map(ts => now - ts);
    
    return {
      totalSessions: this.sessions.size,
      averageAge: ages.length ? Math.round(ages.reduce((a, b) => a + b) / ages.length) : 0,
      oldestAge: ages.length ? Math.max(...ages) : 0,
      newestAge: ages.length ? Math.min(...ages) : 0
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Persist all sessions
    const persistPromises = Array.from(this.sessions.keys()).map(key => this.persistSession(key));
    await Promise.allSettled(persistPromises);
    
    console.log('SessionManager shutdown complete');
  }
}

module.exports = SessionManager;