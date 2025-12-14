/**
 * Enhanced Session Manager for Telegram Bot
 * Provides persistent, scalable session management with automatic cleanup
 */

const MemoryManager = require('./MemoryManager');
const fs = require('fs').promises;
const path = require('path');

// Try to import LRU cache with fallback
let LRU;
try {
  LRU = require('lru-cache');
} catch (error) {
  console.warn('⚠️ LRU-cache not available, will use Map fallback');
  LRU = null;
}

class EnhancedSessionManager extends MemoryManager {
  constructor(options = {}) {
    super(options);
    
    this.config = {
      maxSessions: options.maxSessions || 1000,
      sessionTTL: options.sessionTTL || 30 * 60 * 1000, // 30 minutes
      persistentStorage: options.persistentStorage !== false,
      storageDir: options.storageDir || path.join(process.cwd(), 'data', 'sessions'),
      autoSave: options.autoSave !== false,
      saveInterval: options.saveInterval || 5 * 60 * 1000, // 5 minutes
      compressionEnabled: options.compressionEnabled !== false,
      ...this.config
    };
    
    // Initialize session cache with LRU or fallback to Map
    if (LRU && typeof LRU === 'function') {
      try {
        this.sessionCache = new LRU({
          max: this.config.maxSessions,
          ttl: this.config.sessionTTL,
          dispose: (value, key) => {
            console.log(`🗑️ Session disposed: ${key}`);
            this.emit('session-disposed', key, value);
          }
        });
        this.sessionCacheFallback = false;
      } catch (error) {
        console.warn('⚠️ LRU cache initialization failed, using Map fallback');
        this.sessionCache = new Map();
        this.sessionCacheFallback = true;
      }
    } else {
      console.warn('⚠️ LRU cache not available, using Map fallback');
      this.sessionCache = new Map();
      this.sessionCacheFallback = true;
    }
    
    // Session metadata
    this.sessionMetadata = new Map();
    
    // Initialize persistent storage
    if (this.config.persistentStorage) {
      this.initializePersistentStorage();
    }
    
    // Start auto-save if enabled
    if (this.config.autoSave) {
      this.startAutoSave();
    }
    
    console.log('✅ EnhancedSessionManager initialized');
  }

  /**
   * Initialize persistent storage directory
   */
  async initializePersistentStorage() {
    try {
      await fs.mkdir(this.config.storageDir, { recursive: true });
      console.log(`✅ Session storage initialized: ${this.config.storageDir}`);
      
      // Load existing sessions
      await this.loadPersistedSessions();
    } catch (error) {
      console.error('Failed to initialize persistent storage:', error);
      this.config.persistentStorage = false;
    }
  }

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    const autoSaveTimer = setInterval(async () => {
      await this.saveSessionsToDisk();
    }, this.config.saveInterval);
    
    this.registerTimer(autoSaveTimer, 'session-auto-save');
  }

  /**
   * Create or update a session
   */
  async createSession(userId, initialData = {}) {
    const sessionId = `session_${userId}_${Date.now()}`;
    
    const sessionData = {
      id: sessionId,
      userId: userId.toString(),
      data: { ...initialData },
      created: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      persistent: true
    };
    
    // Store in cache (with fallback support)
    try {
      this.sessionCache.set(sessionId, sessionData);
    } catch (error) {
      console.warn('⚠️ Session cache error, using basic storage');
      if (!this.sessionCache) {
        this.sessionCache = new Map();
      }
      this.sessionCache.set(sessionId, sessionData);
    }
    
    // Update metadata
    this.sessionMetadata.set(sessionId, {
      userId: userId.toString(),
      created: sessionData.created,
      size: this.calculateSessionSize(sessionData)
    });
    
    // Emit event
    this.emit('session-created', sessionId, sessionData);
    
    console.log(`📝 Session created: ${sessionId} for user ${userId}`);
    return sessionId;
  }

  /**
   * Get session data
   */
  async getSession(sessionId) {
    let session = this.sessionCache.get(sessionId);
    
    // If not in cache and persistent storage enabled, try loading from disk
    if (!session && this.config.persistentStorage) {
      session = await this.loadSessionFromDisk(sessionId);
      if (session) {
        this.sessionCache.set(sessionId, session);
      }
    }
    
    if (session) {
      // Update access information
      session.lastAccessed = Date.now();
      session.accessCount = (session.accessCount || 0) + 1;
      
      this.emit('session-accessed', sessionId, session);
    }
    
    return session;
  }

  /**
   * Update session data
   */
  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.warn(`⚠️ Cannot update non-existent session: ${sessionId}`);
      return false;
    }

    // Deep merge updates to preserve nested objects like registration
    session.data = this.deepMerge(session.data || {}, updates || {});
    session.lastAccessed = Date.now();

    // Update cache
    this.sessionCache.set(sessionId, session);

    // Update metadata
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.size = this.calculateSessionSize(session);
    }

    this.emit('session-updated', sessionId, session);
    return true;
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    return result;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    const session = this.sessionCache.get(sessionId);
    
    // Remove from cache
    this.sessionCache.delete(sessionId);
    
    // Remove metadata
    this.sessionMetadata.delete(sessionId);
    
    // Remove from disk if persistent
    if (this.config.persistentStorage) {
      await this.deleteSessionFromDisk(sessionId);
    }
    
    this.emit('session-deleted', sessionId, session);
    console.log(`🗑️ Session deleted: ${sessionId}`);
    
    return true;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId) {
    const userSessions = [];
    const userIdStr = userId.toString();
    
    // Check cache
    for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
      if (metadata.userId === userIdStr) {
        const session = await this.getSession(sessionId);
        if (session) {
          userSessions.push(session);
        }
      }
    }
    
    return userSessions;
  }

  /**
   * Get the latest active session for a user (session deduplication)
   */
  async getUserLatestSession(userId) {
    const userSessions = await this.getUserSessions(userId);
    
    if (userSessions.length === 0) {
      return null;
    }
    
    // If multiple sessions exist, clean up old ones and return the most recent
    if (userSessions.length > 1) {
      console.warn(`⚠️ Found ${userSessions.length} sessions for user ${userId}, cleaning up duplicates`);
      
      // Sort by last accessed time (most recent first)
      userSessions.sort((a, b) => b.lastAccessed - a.lastAccessed);
      
      // Keep the most recent session
      const latestSession = userSessions[0];
      
      // Delete older sessions
      for (let i = 1; i < userSessions.length; i++) {
        await this.deleteSession(userSessions[i].id);
        console.log(`🗑️ Cleaned up duplicate session: ${userSessions[i].id}`);
      }
      
      return latestSession;
    }
    
    return userSessions[0];
  }

  /**
   * Clean expired sessions - but NEVER delete sessions with active registration/booking
   */
  async cleanExpiredSessions(force = false) {
    const now = Date.now();
    let cleanedCount = 0;
    const expiredSessions = [];

    // Find expired sessions
    for (const [sessionId, session] of this.sessionCache.entries()) {
      const age = now - session.lastAccessed;
      const sessionData = session.data || {};

      // NEVER delete sessions that have active registration or booking data
      const hasActiveRegistration = sessionData.registration && sessionData.registration.step;
      const hasActiveBooking = sessionData.booking && (sessionData.booking.service || sessionData.booking.date);

      if (hasActiveRegistration || hasActiveBooking) {
        // Skip - this session has active form data, don't delete it
        continue;
      }

      // Only delete truly expired sessions (use configured TTL or 30 min minimum)
      if (force || age > this.config.sessionTTL) {
        expiredSessions.push(sessionId);
      }
    }

    // Clean expired sessions
    for (const sessionId of expiredSessions) {
      await this.deleteSession(sessionId);
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired sessions (skipped active registrations)`);
    }

    return cleanedCount;
  }

  /**
   * Save sessions to disk
   */
  async saveSessionsToDisk() {
    if (!this.config.persistentStorage) return;
    
    try {
      let savedCount = 0;
      
      for (const [sessionId, session] of this.sessionCache.entries()) {
        if (session.persistent) {
          await this.saveSessionToDisk(sessionId, session);
          savedCount++;
        }
      }
      
      if (savedCount > 0) {
        console.log(`💾 Saved ${savedCount} sessions to disk`);
      }
    } catch (error) {
      console.error('Failed to save sessions to disk:', error);
    }
  }

  /**
   * Save individual session to disk
   */
  async saveSessionToDisk(sessionId, session) {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    
    try {
      const sessionData = {
        ...session,
        savedAt: Date.now()
      };
      
      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
    } catch (error) {
      console.error(`Failed to save session ${sessionId}:`, error);
    }
  }

  /**
   * Load session from disk
   */
  async loadSessionFromDisk(sessionId) {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(data);
      
      // Check if session has expired
      const age = Date.now() - session.lastAccessed;
      if (age > this.config.sessionTTL) {
        await this.deleteSessionFromDisk(sessionId);
        return null;
      }
      
      return session;
    } catch (error) {
      // File doesn't exist or is corrupted
      return null;
    }
  }

  /**
   * Delete session from disk
   */
  async deleteSessionFromDisk(sessionId) {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File doesn't exist, ignore error
    }
  }

  /**
   * Load all persisted sessions on startup
   */
  async loadPersistedSessions() {
    try {
      const files = await fs.readdir(this.config.storageDir);
      let loadedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const session = await this.loadSessionFromDisk(sessionId);
          
          if (session) {
            this.sessionCache.set(sessionId, session);
            this.sessionMetadata.set(sessionId, {
              userId: session.userId,
              created: session.created,
              size: this.calculateSessionSize(session)
            });
            loadedCount++;
          }
        }
      }
      
      if (loadedCount > 0) {
        console.log(`📂 Loaded ${loadedCount} persisted sessions`);
      }
    } catch (error) {
      console.error('Failed to load persisted sessions:', error);
    }
  }

  /**
   * Calculate session data size
   */
  calculateSessionSize(session) {
    return JSON.stringify(session).length;
  }

  /**
   * Override clearCaches from MemoryManager
   */
  clearCaches() {
    super.clearCaches();
    
    // Clear session caches
    const cacheSize = this.sessionCache.size;
    this.sessionCache.clear();
    this.sessionMetadata.clear();
    
    console.log(`🧹 Cleared ${cacheSize} cached sessions`);
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    const stats = this.getStats();
    
    // Calculate session statistics
    const sessions = Array.from(this.sessionCache.values());
    const now = Date.now();
    
    const sessionStats = {
      total: sessions.length,
      active: sessions.filter(s => now - s.lastAccessed < 60000).length, // Active in last minute
      expired: sessions.filter(s => now - s.lastAccessed > this.config.sessionTTL).length,
      averageAge: sessions.length > 0 ? 
        sessions.reduce((sum, s) => sum + (now - s.created), 0) / sessions.length : 0,
      totalSize: Array.from(this.sessionMetadata.values())
        .reduce((sum, m) => sum + (m.size || 0), 0)
    };
    
    return {
      ...stats,
      sessions: sessionStats,
      storage: {
        persistent: this.config.persistentStorage,
        directory: this.config.storageDir,
        autoSave: this.config.autoSave
      }
    };
  }

  /**
   * Shutdown with session persistence
   */
  async shutdown() {
    console.log('🔄 EnhancedSessionManager shutting down...');
    
    // Save sessions to disk
    if (this.config.persistentStorage) {
      await this.saveSessionsToDisk();
    }
    
    // Call parent shutdown
    super.shutdown();
    
    console.log('✅ EnhancedSessionManager shutdown complete');
  }
}

module.exports = EnhancedSessionManager;