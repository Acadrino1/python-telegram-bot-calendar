
const EventEmitter = require('events');
const logger = require('../utils/logger');
const Appointment = require('../models/Appointment');
const cleanupManager = require('../utils/CleanupManager');

class RealTimeAppointmentEvents extends EventEmitter {
  constructor(webSocketManager, telegramBot, appointmentSyncService) {
    super();
    this.webSocketManager = webSocketManager;
    this.telegramBot = telegramBot;
    this.appointmentSyncService = appointmentSyncService;
    this.eventBuffer = new Map(); // Buffer for rapid-fire events
    this.eventHistory = []; // Track recent events for debugging
    this.maxHistorySize = 1000;
    this.processingInterval = null;
    this.cleanupInterval = null;
    
    this.setupEventListeners();
    this.startEventProcessor();
    
    // Register for cleanup
    cleanupManager.registerResource(this, 'RealTimeAppointmentEvents');
  }

  setupEventListeners() {
    // Database change events (from Objection.js hooks or triggers)
    this.on('db:appointment:insert', this.handleAppointmentCreated.bind(this));
    this.on('db:appointment:update', this.handleAppointmentUpdated.bind(this));
    this.on('db:appointment:delete', this.handleAppointmentDeleted.bind(this));
    
    // Admin interface events
    this.on('admin:appointment:create', this.handleAdminAppointmentCreate.bind(this));
    this.on('admin:appointment:edit', this.handleAdminAppointmentEdit.bind(this));
    this.on('admin:appointment:approve', this.handleAdminAppointmentApprove.bind(this));
    this.on('admin:appointment:reject', this.handleAdminAppointmentReject.bind(this));
    this.on('admin:appointment:reschedule', this.handleAdminAppointmentReschedule.bind(this));
    this.on('admin:appointment:cancel', this.handleAdminAppointmentCancel.bind(this));
    
    // Bot interaction events
    this.on('bot:appointment:request', this.handleBotAppointmentRequest.bind(this));
    this.on('bot:appointment:confirm', this.handleBotAppointmentConfirm.bind(this));
    this.on('bot:appointment:cancel', this.handleBotAppointmentCancel.bind(this));
    this.on('bot:appointment:reschedule_request', this.handleBotAppointmentRescheduleRequest.bind(this));
    
    // Status change events
    this.on('status:pending', this.handleStatusPending.bind(this));
    this.on('status:confirmed', this.handleStatusConfirmed.bind(this));
    this.on('status:cancelled', this.handleStatusCancelled.bind(this));
    this.on('status:completed', this.handleStatusCompleted.bind(this));
    this.on('status:no_show', this.handleStatusNoShow.bind(this));
    
    // Reminder events
    this.on('reminder:scheduled', this.handleReminderScheduled.bind(this));
    this.on('reminder:sent', this.handleReminderSent.bind(this));
    this.on('reminder:failed', this.handleReminderFailed.bind(this));
    
    // System events
    this.on('system:bulk_update', this.handleSystemBulkUpdate.bind(this));
    this.on('system:data_sync', this.handleSystemDataSync.bind(this));
  }

  // Core event processing
  async processEvent(eventType, eventData, options = {}) {
    const eventId = this.generateEventId();
    const timestamp = Date.now();
    
    const event = {
      id: eventId,
      type: eventType,
      data: eventData,
      options,
      timestamp,
      processed: false,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3
    };

    // Add to history
    this.addToHistory(event);

    // Handle immediate vs buffered processing
    if (options.immediate) {
      await this.processEventImmediate(event);
    } else {
      this.bufferEvent(event);
    }

    return eventId;
  }

  bufferEvent(event) {
    const key = `${event.type}:${event.data.appointmentId}`;
    
    // If similar event exists in buffer, merge or replace
    if (this.eventBuffer.has(key)) {
      const existingEvent = this.eventBuffer.get(key);
      
      // Merge strategy based on event type
      if (this.shouldMergeEvents(existingEvent, event)) {
        this.mergeEvents(existingEvent, event);
        return;
      }
    }

    this.eventBuffer.set(key, event);
  }

  shouldMergeEvents(existing, incoming) {
    const mergeableTypes = [
      'db:appointment:update',
      'admin:appointment:edit',
      'status:change'
    ];
    
    return mergeableTypes.includes(existing.type) && 
           existing.type === incoming.type &&
           (incoming.timestamp - existing.timestamp) < 5000; // Within 5 seconds
  }

  mergeEvents(existing, incoming) {
    existing.data = { ...existing.data, ...incoming.data };
    existing.timestamp = incoming.timestamp;
    existing.attempts = 0; // Reset attempts for merged event
  }

  async processEventImmediate(event) {
    try {
      await this.executeEvent(event);
      event.processed = true;
      event.completed_at = Date.now();
      
      this.emit('event:processed', event);
      
    } catch (error) {
      event.attempts++;
      event.last_error = error.message;
      
      if (event.attempts >= event.maxAttempts) {
        event.failed = true;
        this.emit('event:failed', event);
        logger.error(`RealTimeAppointmentEvents: Event ${event.id} failed after ${event.attempts} attempts:`, error);
      } else {
        // Retry with exponential backoff
        const delay = Math.pow(2, event.attempts) * 1000;
        setTimeout(() => this.processEventImmediate(event), delay);
      }
    }
  }

  async executeEvent(event) {
    // Emit the specific event for handlers
    this.emit(event.type, event.data, event.options);
    
    // Broadcast to admin interface
    this.broadcastToAdmin(event);
    
    // Trigger appointment sync if needed
    if (event.type.includes('appointment') && this.appointmentSyncService) {
      await this.triggerAppointmentSync(event);
    }
    
    // Send real-time notifications
    await this.sendRealTimeNotifications(event);
  }

  // Database event handlers
  async handleAppointmentCreated(data, options) {
    const appointment = await this.loadAppointmentWithRelations(data.appointmentId);
    
    if (!appointment) return;

    // Notify admin interface
    this.broadcastToAdmin({
      type: 'appointment_created',
      appointment: this.serializeAppointment(appointment),
      source: data.source || 'system',
      timestamp: new Date().toISOString()
    });

    // Notify relevant users through bot
    if (appointment.client?.telegram_user_id) {
      await this.notifyUser(appointment.client.telegram_user_id, 'appointment_created', appointment);
    }

    if (appointment.provider?.telegram_user_id && appointment.provider.id !== appointment.client_id) {
      await this.notifyUser(appointment.provider.telegram_user_id, 'appointment_assigned', appointment);
    }
  }

  async handleAppointmentUpdated(data, options) {
    const appointment = await this.loadAppointmentWithRelations(data.appointmentId);
    
    if (!appointment) return;

    const changes = data.changes || {};
    const significantChanges = this.identifySignificantChanges(changes);

    if (significantChanges.length === 0) return;

    // Broadcast to admin
    this.broadcastToAdmin({
      type: 'appointment_updated',
      appointment: this.serializeAppointment(appointment),
      changes: significantChanges,
      source: data.source || 'system',
      timestamp: new Date().toISOString()
    });

    // Notify users of significant changes
    for (const change of significantChanges) {
      if (change.field === 'appointment_datetime') {
        await this.handleDateTimeChange(appointment, change);
      } else if (change.field === 'status') {
        await this.handleStatusChange(appointment, change);
      } else if (change.field === 'provider_id') {
        await this.handleProviderChange(appointment, change);
      }
    }
  }

  // Admin action handlers
  async handleAdminAppointmentApprove(data, options) {
    const { appointmentId, adminUser, approvalNote } = data;
    
    try {
      // Update appointment status
      await Appointment.query()
        .findById(appointmentId)
        .patch({ 
          status: 'confirmed',
          admin_notes: approvalNote,
          confirmed_at: new Date(),
          confirmed_by: adminUser?.id
        });

      const appointment = await this.loadAppointmentWithRelations(appointmentId);
      
      // Broadcast to admin interface
      this.broadcastToAdmin({
        type: 'appointment_approved',
        appointment: this.serializeAppointment(appointment),
        adminUser,
        approvalNote,
        timestamp: new Date().toISOString()
      });

      // Notify client
      if (appointment.client?.telegram_user_id) {
        await this.notifyUser(appointment.client.telegram_user_id, 'appointment_approved', appointment, { approvalNote });
      }

      // Notify provider
      if (appointment.provider?.telegram_user_id) {
        await this.notifyUser(appointment.provider.telegram_user_id, 'appointment_confirmed', appointment);
      }

    } catch (error) {
      logger.error(`Failed to process appointment approval:`, error);
      throw error;
    }
  }

  async handleAdminAppointmentReschedule(data, options) {
    const { appointmentId, newDateTime, reason, adminUser } = data;
    
    try {
      const oldAppointment = await this.loadAppointmentWithRelations(appointmentId);
      const oldDateTime = oldAppointment.appointment_datetime;

      // Update appointment
      await Appointment.query()
        .findById(appointmentId)
        .patch({ 
          appointment_datetime: newDateTime,
          status: 'pending_confirmation',
          admin_notes: reason,
          rescheduled_at: new Date(),
          rescheduled_by: adminUser?.id
        });

      const updatedAppointment = await this.loadAppointmentWithRelations(appointmentId);

      // Broadcast to admin
      this.broadcastToAdmin({
        type: 'appointment_rescheduled',
        appointment: this.serializeAppointment(updatedAppointment),
        oldDateTime,
        newDateTime,
        reason,
        adminUser,
        timestamp: new Date().toISOString()
      });

      // Notify client
      if (updatedAppointment.client?.telegram_user_id) {
        await this.notifyUser(
          updatedAppointment.client.telegram_user_id, 
          'appointment_rescheduled_by_admin', 
          updatedAppointment, 
          { oldDateTime, reason }
        );
      }

      // Notify provider
      if (updatedAppointment.provider?.telegram_user_id) {
        await this.notifyUser(
          updatedAppointment.provider.telegram_user_id, 
          'appointment_rescheduled_notification', 
          updatedAppointment,
          { oldDateTime, reason }
        );
      }

    } catch (error) {
      logger.error(`Failed to process appointment reschedule:`, error);
      throw error;
    }
  }

  // Bot interaction handlers
  async handleBotAppointmentRequest(data, options) {
    const { userId, serviceId, preferredDateTime, notes } = data;
    
    try {
      // Create pending appointment
      const appointment = await Appointment.query().insert({
        client_id: userId,
        service_id: serviceId,
        appointment_datetime: preferredDateTime,
        status: 'pending_approval',
        notes,
        created_via: 'telegram_bot'
      });

      const fullAppointment = await this.loadAppointmentWithRelations(appointment.id);

      // Broadcast to admin for approval
      this.broadcastToAdmin({
        type: 'appointment_request_received',
        appointment: this.serializeAppointment(fullAppointment),
        source: 'telegram_bot',
        timestamp: new Date().toISOString()
      });

      // Confirm receipt to user
      if (fullAppointment.client?.telegram_user_id) {
        await this.notifyUser(
          fullAppointment.client.telegram_user_id,
          'appointment_request_received',
          fullAppointment
        );
      }

    } catch (error) {
      logger.error(`Failed to process bot appointment request:`, error);
      throw error;
    }
  }

  // Notification methods
  async notifyUser(telegramUserId, notificationType, appointment, extra = {}) {
    if (!this.telegramBot || !telegramUserId) return;

    const message = this.buildNotificationMessage(notificationType, appointment, extra);
    const options = this.buildNotificationOptions(notificationType, appointment, extra);

    try {
      await this.telegramBot.sendMessage(telegramUserId, message, options);
      
      this.emit('notification:sent', {
        telegramUserId,
        notificationType,
        appointmentId: appointment.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`Failed to send notification to user ${telegramUserId}:`, error);
      
      this.emit('notification:failed', {
        telegramUserId,
        notificationType,
        appointmentId: appointment.id,
        error: error.message
      });
    }
  }

  buildNotificationMessage(type, appointment, extra = {}) {
    const date = new Date(appointment.appointment_datetime).toLocaleString();
    const serviceName = appointment.service?.name || 'Service';
    const providerName = appointment.provider?.name || 'Provider';

    const messages = {
      appointment_created: `✅ Your appointment has been scheduled!\n\n📅 ${date}\n🔧 ${serviceName}\n👤 ${providerName}\n\nWaiting for confirmation...`,
      
      appointment_approved: `🎉 Your appointment has been approved!\n\n📅 ${date}\n🔧 ${serviceName}\n👤 ${providerName}\n\n${extra.approvalNote ? `📝 ${extra.approvalNote}\n\n` : ''}Looking forward to seeing you!`,
      
      appointment_rescheduled_by_admin: `🔄 Your appointment has been rescheduled.\n\n📅 New Date: ${date}\n🔧 ${serviceName}\n\n${extra.reason ? `Reason: ${extra.reason}\n\n` : ''}Please confirm if this works for you.`,
      
      appointment_assigned: `📋 New appointment assigned to you!\n\n📅 ${date}\n🔧 ${serviceName}\n👤 Client: ${appointment.client?.name || 'Client'}\n\nPlease review and confirm your availability.`,
      
      appointment_request_received: `✅ Your appointment request has been received!\n\n📅 Requested: ${date}\n🔧 ${serviceName}\n\nWe'll review and get back to you shortly.`
    };

    return messages[type] || `Appointment notification: ${type}`;
  }

  buildNotificationOptions(type, appointment, extra = {}) {
    const options = { parse_mode: 'HTML' };

    const buttonConfigs = {
      appointment_approved: [
        [
          { text: '📅 Add to Calendar', callback_data: `add_calendar:${appointment.id}` },
          { text: '📍 Get Directions', callback_data: `directions:${appointment.id}` }
        ],
        [
          { text: '🔄 Reschedule', callback_data: `reschedule:${appointment.id}` },
          { text: '❌ Cancel', callback_data: `cancel:${appointment.id}` }
        ]
      ],
      
      appointment_rescheduled_by_admin: [
        [
          { text: '✅ Accept', callback_data: `accept_reschedule:${appointment.id}` },
          { text: '❌ Decline', callback_data: `decline_reschedule:${appointment.id}` }
        ],
        [
          { text: '💬 Discuss', callback_data: `discuss_reschedule:${appointment.id}` }
        ]
      ],
      
      appointment_assigned: [
        [
          { text: '✅ Accept', callback_data: `accept_assignment:${appointment.id}` },
          { text: '❌ Decline', callback_data: `decline_assignment:${appointment.id}` }
        ],
        [
          { text: '📋 View Details', callback_data: `view_appointment:${appointment.id}` }
        ]
      ]
    };

    if (buttonConfigs[type]) {
      options.reply_markup = { inline_keyboard: buttonConfigs[type] };
    }

    return options;
  }

  // Admin broadcasting
  broadcastToAdmin(data) {
    if (this.webSocketManager) {
      this.webSocketManager.broadcastToSubscribers('appointment_event', data);
      this.webSocketManager.broadcastToSubscribers('dashboard_update', {
        type: 'appointment_change',
        ...data
      });
    }
  }

  // Sync triggers
  async triggerAppointmentSync(event) {
    if (!this.appointmentSyncService) return;

    const syncData = {
      appointmentId: event.data.appointmentId,
      changeType: this.mapEventToSyncType(event.type),
      changeData: event.data,
      source: event.data.source || 'system'
    };

    this.appointmentSyncService.emit('sync:trigger', syncData);
  }

  mapEventToSyncType(eventType) {
    const mapping = {
      'db:appointment:insert': 'created',
      'db:appointment:update': 'updated',
      'admin:appointment:approve': 'approved',
      'admin:appointment:reject': 'rejected',
      'admin:appointment:reschedule': 'rescheduled',
      'admin:appointment:cancel': 'cancelled',
      'bot:appointment:confirm': 'confirmed',
      'bot:appointment:cancel': 'cancelled'
    };

    return mapping[eventType] || 'updated';
  }

  // Utility methods
  async loadAppointmentWithRelations(appointmentId) {
    return await Appointment.query()
      .findById(appointmentId)
      .withGraphFetched('[client, provider, service]');
  }

  serializeAppointment(appointment) {
    return {
      id: appointment.id,
      client_name: appointment.client?.name || 'Unknown',
      provider_name: appointment.provider?.name || 'Unassigned',
      service_name: appointment.service?.name || 'Service',
      appointment_datetime: appointment.appointment_datetime,
      status: appointment.status,
      duration_minutes: appointment.duration_minutes,
      price: appointment.price,
      notes: appointment.notes,
      created_at: appointment.created_at
    };
  }

  identifySignificantChanges(changes) {
    const significantFields = [
      'appointment_datetime',
      'status',
      'provider_id',
      'service_id',
      'price'
    ];

    return Object.entries(changes)
      .filter(([field]) => significantFields.includes(field))
      .map(([field, { old, new: newValue }]) => ({
        field,
        oldValue: old,
        newValue,
        isSignificant: true
      }));
  }

  addToHistory(event) {
    this.eventHistory.unshift(event);
    
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.splice(this.maxHistorySize);
    }
  }

  generateEventId() {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  startEventProcessor() {
    // Process buffered events every 2 seconds
    this.processingInterval = cleanupManager.setInterval(() => {
      this.processBufferedEvents();
    }, 2000, 'EventProcessing');

    // Cleanup old events every 5 minutes
    this.cleanupInterval = cleanupManager.setInterval(() => {
      this.cleanupOldEvents();
    }, 300000, 'EventCleanup');
  }

  async processBufferedEvents() {
    if (this.eventBuffer.size === 0) return;

    const eventsToProcess = Array.from(this.eventBuffer.values());
    this.eventBuffer.clear();

    for (const event of eventsToProcess) {
      try {
        await this.processEventImmediate(event);
      } catch (error) {
        logger.error(`Failed to process buffered event ${event.id}:`, error);
      }
    }
  }

  cleanupOldEvents() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    this.eventHistory = this.eventHistory.filter(
      event => (now - event.timestamp) < maxAge
    );
  }

  // Public API methods
  getStats() {
    return {
      bufferedEvents: this.eventBuffer.size,
      eventHistory: this.eventHistory.length,
      recentEvents: this.eventHistory.slice(0, 10).map(e => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        processed: e.processed
      }))
    };
  }

  async testEvent(eventType, testData = {}) {
    const appointmentId = testData.appointmentId || 1;
    
    const mockData = {
      appointmentId,
      source: 'test',
      ...testData
    };

    try {
      await this.processEvent(eventType, mockData, { immediate: true });
      return { success: true, message: `Test event ${eventType} processed successfully` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Cleanup method for CleanupManager
   */
  cleanup() {
    logger.info('🧹 RealTimeAppointmentEvents cleanup initiated');
    
    if (this.processingInterval) {
      cleanupManager.clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.cleanupInterval) {
      cleanupManager.clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear event buffers
    this.eventBuffer.clear();
    this.eventHistory = [];
    
    logger.info('✅ RealTimeAppointmentEvents cleanup completed');
  }
}

module.exports = RealTimeAppointmentEvents;