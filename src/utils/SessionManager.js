const NodeCache = require('node-cache');

class SessionManager {
  constructor() {
    // In-memory session cache with TTL
    this.sessions = new NodeCache({
      stdTTL: 3600, // 1 hour default
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false // Better performance
    });
    
    this.defaultTTL = 3600; // 1 hour
    this.maxSessions = 10000; // Prevent memory overload
    
    console.log('✅ SessionManager initialized with memory optimization');
  }

  // Save session data with automatic TTL
  async saveSession(userId, sessionData, ttl = this.defaultTTL) {
    try {
      // Prevent memory overload
      if (this.sessions.keys().length >= this.maxSessions) {
        this.cleanup();
      }

      const key = `session:${userId}`;
      const data = {
        ...sessionData,
        lastActivity: Date.now(),
        userId: userId
      };
      
      const success = this.sessions.set(key, data, ttl);
      
      if (success) {
        console.log(`Session saved for user ${userId}, TTL: ${ttl}s`);
      }
      
      return success;
    } catch (error) {
      console.error('Error saving session:', error);
      return false;
    }
  }

  // Get session data
  async getSession(userId) {
    try {
      const key = `session:${userId}`;
      const data = this.sessions.get(key);
      
      if (data) {
        // Update last activity and extend TTL
        data.lastActivity = Date.now();
        this.sessions.set(key, data, this.defaultTTL);
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  // Extend session TTL
  async extendSession(userId, ttl = this.defaultTTL) {
    try {
      const key = `session:${userId}`;
      const data = this.sessions.get(key);
      
      if (data) {
        data.lastActivity = Date.now();
        return this.sessions.set(key, data, ttl);
      }
      
      return false;
    } catch (error) {
      console.error('Error extending session:', error);
      return false;
    }
  }

  // Delete session
  async deleteSession(userId) {
    try {
      const key = `session:${userId}`;
      const deleted = this.sessions.del(key);
      
      if (deleted) {
        console.log(`Session deleted for user ${userId}`);
      }
      
      return deleted > 0;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  // Get all active sessions
  getActiveSessions() {
    try {
      const keys = this.sessions.keys();
      return keys.map(key => {
        const data = this.sessions.get(key);
        return {
          key,
          userId: data?.userId,
          lastActivity: data?.lastActivity ? new Date(data.lastActivity).toISOString() : null,
          ttl: this.sessions.getTtl(key)
        };
      });
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  // Cleanup old sessions and prevent memory overload
  cleanup() {
    try {
      const beforeCount = this.sessions.keys().length;
      
      // Force garbage collection of expired keys
      this.sessions.flushAll();
      
      const afterCount = this.sessions.keys().length;
      console.log(`Session cleanup: ${beforeCount} -> ${afterCount} sessions`);
      
      return beforeCount - afterCount;
    } catch (error) {
      console.error('Error during session cleanup:', error);
      return 0;
    }
  }

  // Get session statistics
  getStats() {
    try {
      const keys = this.sessions.keys();
      const stats = this.sessions.getStats();
      
      return {
        activeSessions: keys.length,
        maxSessions: this.maxSessions,
        memoryUsage: process.memoryUsage(),
        cacheStats: stats,
        oldestSession: keys.length > 0 ? Math.min(...keys.map(key => {
          const data = this.sessions.get(key);
          return data?.lastActivity || Date.now();
        })) : null
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return { error: error.message };
    }
  }

  // Clear all sessions (emergency use)
  async clearAllSessions() {
    try {
      this.sessions.flushAll();
      console.log('All sessions cleared');
      return true;
    } catch (error) {
      console.error('Error clearing sessions:', error);
      return false;
    }
  }

  // Memory-safe session data update
  async updateSession(userId, updateData) {
    try {
      const current = await this.getSession(userId);
      
      if (!current) {
        return false;
      }
      
      const updated = {
        ...current,
        ...updateData,
        lastActivity: Date.now()
      };
      
      return await this.saveSession(userId, updated);
    } catch (error) {
      console.error('Error updating session:', error);
      return false;
    }
  }
}

module.exports = SessionManager;