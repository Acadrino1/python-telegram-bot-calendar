const EventEmitter = require('events');
const logger = require('../utils/logger');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { getText } = require('../bot/translations');
const cleanupManager = require('../utils/CleanupManager');

class AppointmentSyncService extends EventEmitter {
  constructor(telegramBot, webSocketManager, broadcastService) {
    super();
    this.bot = telegramBot;
    this.wsManager = webSocketManager;
    this.broadcastService = broadcastService;
    this.isInitialized = false;
    this.eventQueue = [];
    this.retryAttempts = new Map();
    this.queueProcessingInterval = null;
    this.retryInterval = null;
    
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      batchSize: 10,
      enableBroadcast: true,
      notificationTypes: {
        appointment_created: true,
        appointment_updated: true,
        appointment_cancelled: true,
        appointment_confirmed: true,
        appointment_rescheduled: true
      }
    };
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Set up event listeners for appointment changes
      this.setupAppointmentEventHandlers();
      
      // Set up WebSocket event handlers
      this.setupWebSocketEventHandlers();
      
      // Start processing queue
      this.startEventProcessor();
      
      this.isInitialized = true;
      logger.info('AppointmentSyncService initialized successfully');
      
      // Register for cleanup
      cleanupManager.registerResource(this, 'AppointmentSyncService');
      
      this.emit('service_ready');
    } catch (error) {
      logger.error('Failed to initialize AppointmentSyncService:', error);
      throw error;
    }
  }

  setupAppointmentEventHandlers() {
    // Listen for appointment model events
    Appointment.query().context({ syncService: this });
    
    // Hook into appointment lifecycle events
    this.on('appointment_created', this.handleAppointmentCreated.bind(this));
    this.on('appointment_updated', this.handleAppointmentUpdated.bind(this));
    this.on('appointment_cancelled', this.handleAppointmentCancelled.bind(this));
    this.on('appointment_confirmed', this.handleAppointmentConfirmed.bind(this));
    this.on('appointment_rescheduled', this.handleAppointmentRescheduled.bind(this));
  }

  setupWebSocketEventHandlers() {
    if (!this.wsManager) return;
    
    // Listen for admin actions from WebSocket
    this.wsManager.on('admin_action', (eventData) => {
      this.processAdminAction(eventData);
    });
  }

  startEventProcessor() {
    // Process event queue every 500ms
    this.queueProcessingInterval = cleanupManager.setInterval(() => {
      this.processEventQueue();
    }, 500, 'SyncQueueProcessing');
    
    // Retry failed events every 5 seconds
    this.retryInterval = cleanupManager.setInterval(() => {
      this.retryFailedEvents();
    }, 5000, 'SyncRetryProcessing');
  }

  // Main appointment event handlers
  async handleAppointmentCreated(appointmentData) {
    const { appointment, adminUser } = appointmentData;
    
    try {
      await appointment.$loadRelated('[client, provider, service]');
      
      // Notify client via Telegram
      if (appointment.client?.telegram_user_id) {
        await this.notifyClientAppointmentCreated(appointment, adminUser);
      }
      
      // Notify provider via Telegram
      if (appointment.provider?.telegram_user_id) {
        await this.notifyProviderAppointmentCreated(appointment, adminUser);
      }
      
      // Broadcast to admin dashboard
      this.broadcastToAdminDashboard('appointment_created', {
        appointment: this.serializeAppointment(appointment),
        adminUser: adminUser?.id,
        timestamp: new Date().toISOString()
      });
      
      // Update statistics
      this.updateAppointmentStats('created');
      
    } catch (error) {
      logger.error('Error handling appointment created:', error);
      this.scheduleRetry('appointment_created', appointmentData);
    }
  }

  async handleAppointmentUpdated(appointmentData) {
    const { appointment, changes, adminUser } = appointmentData;
    
    try {
      await appointment.$loadRelated('[client, provider, service]');
      
      // Determine what changed
      const significantChanges = this.analyzeChanges(changes);
      
      if (significantChanges.length === 0) return;
      
      // Notify affected users
      if (appointment.client?.telegram_user_id) {
        await this.notifyClientAppointmentUpdated(appointment, significantChanges, adminUser);
      }
      
      if (appointment.provider?.telegram_user_id) {
        await this.notifyProviderAppointmentUpdated(appointment, significantChanges, adminUser);
      }
      
      // Broadcast to admin dashboard
      this.broadcastToAdminDashboard('appointment_updated', {
        appointment: this.serializeAppointment(appointment),
        changes: significantChanges,
        adminUser: adminUser?.id,
        timestamp: new Date().toISOString()
      });
      
      // Handle special cases
      if (significantChanges.includes('appointment_datetime')) {
        this.emit('appointment_rescheduled', appointmentData);
      }
      
    } catch (error) {
      logger.error('Error handling appointment updated:', error);
      this.scheduleRetry('appointment_updated', appointmentData);
    }
  }

  async handleAppointmentCancelled(appointmentData) {
    const { appointment, reason, adminUser } = appointmentData;
    
    try {
      await appointment.$loadRelated('[client, provider, service]');
      
      // Notify client
      if (appointment.client?.telegram_user_id) {
        await this.notifyClientAppointmentCancelled(appointment, reason, adminUser);
      }
      
      // Notify provider
      if (appointment.provider?.telegram_user_id) {
        await this.notifyProviderAppointmentCancelled(appointment, reason, adminUser);
      }
      
      // Broadcast to admin dashboard
      this.broadcastToAdminDashboard('appointment_cancelled', {
        appointment: this.serializeAppointment(appointment),
        reason,
        adminUser: adminUser?.id,
        timestamp: new Date().toISOString()
      });
      
      // Update statistics
      this.updateAppointmentStats('cancelled');
      
    } catch (error) {
      logger.error('Error handling appointment cancelled:', error);
      this.scheduleRetry('appointment_cancelled', appointmentData);
    }
  }

  async handleAppointmentConfirmed(appointmentData) {
    const { appointment, adminUser } = appointmentData;
    
    try {
      await appointment.$loadRelated('[client, provider, service]');
      
      // Notify client of confirmation
      if (appointment.client?.telegram_user_id) {
        await this.notifyClientAppointmentConfirmed(appointment, adminUser);
      }
      
      // Notify provider
      if (appointment.provider?.telegram_user_id) {
        await this.notifyProviderAppointmentConfirmed(appointment, adminUser);
      }
      
      // Broadcast to admin dashboard
      this.broadcastToAdminDashboard('appointment_confirmed', {
        appointment: this.serializeAppointment(appointment),
        adminUser: adminUser?.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error handling appointment confirmed:', error);
      this.scheduleRetry('appointment_confirmed', appointmentData);
    }
  }

  // Telegram notification methods
  async notifyClientAppointmentCreated(appointment, adminUser) {
    const userLang = await this.getUserLanguage(appointment.client.telegram_user_id);
    
    const message = getText(userLang, 'appointment_created_notification', {
      service: appointment.service.name,
      date: this.formatAppointmentDate(appointment.appointment_datetime),
      time: this.formatAppointmentTime(appointment.appointment_datetime),
      provider: appointment.provider.getFullName(),
      duration: appointment.duration_minutes
    });
    
    await this.sendTelegramMessage(appointment.client.telegram_user_id, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: getText(userLang, 'confirm_appointment'), callback_data: `confirm_${appointment.id}` },
          { text: getText(userLang, 'reschedule_appointment'), callback_data: `reschedule_${appointment.id}` }
        ]]
      }
    });
  }

  async notifyClientAppointmentUpdated(appointment, changes, adminUser) {
    const userLang = await this.getUserLanguage(appointment.client.telegram_user_id);
    
    let message = getText(userLang, 'appointment_updated_notification', {
      service: appointment.service.name
    });
    
    // Add specific change details
    if (changes.includes('appointment_datetime')) {
      message += '\n\n📅 ' + getText(userLang, 'new_date_time', {
        date: this.formatAppointmentDate(appointment.appointment_datetime),
        time: this.formatAppointmentTime(appointment.appointment_datetime)
      });
    }
    
    if (changes.includes('provider_id')) {
      message += '\n\n👨‍⚕️ ' + getText(userLang, 'new_provider', {
        provider: appointment.provider.getFullName()
      });
    }
    
    await this.sendTelegramMessage(appointment.client.telegram_user_id, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: getText(userLang, 'view_appointment'), callback_data: `view_${appointment.id}` }
        ]]
      }
    });
  }

  async notifyClientAppointmentCancelled(appointment, reason, adminUser) {
    const userLang = await this.getUserLanguage(appointment.client.telegram_user_id);
    
    const message = getText(userLang, 'appointment_cancelled_notification', {
      service: appointment.service.name,
      date: this.formatAppointmentDate(appointment.appointment_datetime),
      time: this.formatAppointmentTime(appointment.appointment_datetime),
      reason: reason || getText(userLang, 'no_reason_provided')
    });
    
    await this.sendTelegramMessage(appointment.client.telegram_user_id, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: getText(userLang, 'book_new_appointment'), callback_data: 'book_appointment' },
          { text: getText(userLang, 'contact_support'), callback_data: 'contact_support' }
        ]]
      }
    });
  }

  async notifyClientAppointmentConfirmed(appointment, adminUser) {
    const userLang = await this.getUserLanguage(appointment.client.telegram_user_id);
    
    const message = getText(userLang, 'appointment_confirmed_notification', {
      service: appointment.service.name,
      date: this.formatAppointmentDate(appointment.appointment_datetime),
      time: this.formatAppointmentTime(appointment.appointment_datetime),
      provider: appointment.provider.getFullName()
    });
    
    await this.sendTelegramMessage(appointment.client.telegram_user_id, message, {
      parse_mode: 'HTML'
    });
  }

  async notifyProviderAppointmentCreated(appointment, adminUser) {
    const userLang = await this.getUserLanguage(appointment.provider.telegram_user_id);
    
    const message = getText(userLang, 'provider_appointment_created', {
      client: appointment.client.getFullName(),
      service: appointment.service.name,
      date: this.formatAppointmentDate(appointment.appointment_datetime),
      time: this.formatAppointmentTime(appointment.appointment_datetime)
    });
    
    await this.sendTelegramMessage(appointment.provider.telegram_user_id, message, {
      parse_mode: 'HTML'
    });
  }

  async notifyProviderAppointmentUpdated(appointment, changes, adminUser) {
    const userLang = await this.getUserLanguage(appointment.provider.telegram_user_id);
    
    const message = getText(userLang, 'provider_appointment_updated', {
      client: appointment.client.getFullName(),
      service: appointment.service.name
    });
    
    await this.sendTelegramMessage(appointment.provider.telegram_user_id, message, {
      parse_mode: 'HTML'
    });
  }

  async notifyProviderAppointmentCancelled(appointment, reason, adminUser) {
    const userLang = await this.getUserLanguage(appointment.provider.telegram_user_id);
    
    const message = getText(userLang, 'provider_appointment_cancelled', {
      client: appointment.client.getFullName(),
      service: appointment.service.name,
      date: this.formatAppointmentDate(appointment.appointment_datetime),
      time: this.formatAppointmentTime(appointment.appointment_datetime),
      reason: reason || getText(userLang, 'no_reason_provided')
    });
    
    await this.sendTelegramMessage(appointment.provider.telegram_user_id, message, {
      parse_mode: 'HTML'
    });
  }

  async notifyProviderAppointmentConfirmed(appointment, adminUser) {
    const userLang = await this.getUserLanguage(appointment.provider.telegram_user_id);
    
    const message = getText(userLang, 'provider_appointment_confirmed', {
      client: appointment.client.getFullName(),
      service: appointment.service.name,
      date: this.formatAppointmentDate(appointment.appointment_datetime),
      time: this.formatAppointmentTime(appointment.appointment_datetime)
    });
    
    await this.sendTelegramMessage(appointment.provider.telegram_user_id, message, {
      parse_mode: 'HTML'
    });
  }

  // Utility methods
  async sendTelegramMessage(chatId, text, options = {}) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }
    
    try {
      return await this.bot.telegram.sendMessage(chatId, text, options);
    } catch (error) {
      logger.error(`Failed to send Telegram message to ${chatId}:`, error);
      throw error;
    }
  }

  async getUserLanguage(telegramUserId) {
    try {
      const user = await User.query().findOne({ telegram_user_id: telegramUserId });
      return user?.language || 'en';
    } catch (error) {
      logger.error('Error getting user language:', error);
      return 'en';
    }
  }

  analyzeChanges(changes) {
    const significantFields = [
      'appointment_datetime',
      'provider_id',
      'service_id',
      'status',
      'duration_minutes',
      'price'
    ];
    
    return Object.keys(changes).filter(field => significantFields.includes(field));
  }

  formatAppointmentDate(datetime) {
    return new Date(datetime).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatAppointmentTime(datetime) {
    return new Date(datetime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  serializeAppointment(appointment) {
    return {
      id: appointment.id,
      uuid: appointment.uuid,
      client: appointment.client ? {
        id: appointment.client.id,
        name: appointment.client.getFullName(),
        email: appointment.client.email
      } : null,
      provider: appointment.provider ? {
        id: appointment.provider.id,
        name: appointment.provider.getFullName()
      } : null,
      service: appointment.service ? {
        id: appointment.service.id,
        name: appointment.service.name
      } : null,
      appointment_datetime: appointment.appointment_datetime,
      duration_minutes: appointment.duration_minutes,
      status: appointment.status,
      price: appointment.price
    };
  }

  broadcastToAdminDashboard(eventType, data) {
    if (!this.wsManager) return;
    
    this.wsManager.broadcastToSubscribers('appointment_sync', {
      event: eventType,
      ...data
    });
  }

  updateAppointmentStats(action) {
    // Update internal statistics
    this.emit('stats_update', { action, timestamp: new Date().toISOString() });
  }

  scheduleRetry(eventType, eventData) {
    const retryKey = `${eventType}_${Date.now()}`;
    const currentAttempts = this.retryAttempts.get(retryKey) || 0;
    
    if (currentAttempts < this.config.maxRetries) {
      this.retryAttempts.set(retryKey, currentAttempts + 1);
      this.eventQueue.push({
        type: eventType,
        data: eventData,
        retryKey,
        scheduledAt: Date.now() + (this.config.retryDelay * Math.pow(2, currentAttempts))
      });
    } else {
      logger.error(`Max retries exceeded for ${eventType}`);
      this.retryAttempts.delete(retryKey);
    }
  }

  processEventQueue() {
    const now = Date.now();
    const readyEvents = this.eventQueue.filter(event => event.scheduledAt <= now);
    
    readyEvents.forEach(event => {
      this.emit(event.type, event.data);
      this.eventQueue = this.eventQueue.filter(e => e !== event);
    });
  }

  retryFailedEvents() {
    // Clean up old retry attempts
    const cutoff = Date.now() - (this.config.maxRetries * this.config.retryDelay * 4);
    
    for (const [key, attempts] of this.retryAttempts.entries()) {
      if (key.split('_').pop() < cutoff) {
        this.retryAttempts.delete(key);
      }
    }
  }

  processAdminAction(eventData) {
    const { action, appointmentId, adminUserId, data } = eventData;
    
    switch (action) {
      case 'create_appointment':
        this.emit('appointment_created', {
          appointment: data.appointment,
          adminUser: { id: adminUserId }
        });
        break;
      case 'update_appointment':
        this.emit('appointment_updated', {
          appointment: data.appointment,
          changes: data.changes,
          adminUser: { id: adminUserId }
        });
        break;
      case 'cancel_appointment':
        this.emit('appointment_cancelled', {
          appointment: data.appointment,
          reason: data.reason,
          adminUser: { id: adminUserId }
        });
        break;
      case 'confirm_appointment':
        this.emit('appointment_confirmed', {
          appointment: data.appointment,
          adminUser: { id: adminUserId }
        });
        break;
    }
  }

  // Public API methods
  async triggerAppointmentSync(appointmentId, action, adminUserId, data = {}) {
    try {
      const appointment = await Appointment.query()
        .findById(appointmentId)
        .withGraphFetched('[client, provider, service]');
      
      if (!appointment) {
        throw new Error(`Appointment ${appointmentId} not found`);
      }
      
      const eventData = {
        appointment,
        adminUser: { id: adminUserId },
        ...data
      };
      
      this.emit(`appointment_${action}`, eventData);
      
      return { success: true, message: 'Sync triggered successfully' };
    } catch (error) {
      logger.error('Error triggering appointment sync:', error);
      throw error;
    }
  }

  getServiceStats() {
    return {
      initialized: this.isInitialized,
      queueSize: this.eventQueue.length,
      retryAttempts: this.retryAttempts.size,
      config: this.config
    };
  }
  
  /**
   * Cleanup method for CleanupManager
   */
  cleanup() {
    logger.info('🧹 AppointmentSyncService cleanup initiated');
    
    if (this.queueProcessingInterval) {
      cleanupManager.clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = null;
    }
    
    if (this.retryInterval) {
      cleanupManager.clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    
    // Clear event queue and retry attempts
    this.eventQueue = [];
    this.retryAttempts.clear();
    this.isInitialized = false;
    
    logger.info('✅ AppointmentSyncService cleanup completed');
  }
}

module.exports = AppointmentSyncService;