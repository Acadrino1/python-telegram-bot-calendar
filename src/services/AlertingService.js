const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Real-time alerting service for Lodge Scheduler
 * Handles alert processing, notification routing, and escalation
 */
class AlertingService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      // Alert channels
      enableConsole: options.enableConsole !== false,
      enableFile: options.enableFile || true,
      enableWebhook: options.enableWebhook || false,
      enableEmail: options.enableEmail || false,
      
      // Alert settings
      escalationTimeout: options.escalationTimeout || 15 * 60 * 1000, // 15 minutes
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000, // 5 seconds
      
      // File settings
      alertLogPath: options.alertLogPath || path.join(process.cwd(), 'logs', 'alerts.log'),
      maxLogSize: options.maxLogSize || 10 * 1024 * 1024, // 10MB
      maxLogFiles: options.maxLogFiles || 5,
      
      // Webhook settings
      webhookUrl: options.webhookUrl,
      webhookTimeout: options.webhookTimeout || 10000,
      
      // Email settings
      emailSettings: options.emailSettings || {}
    };

    // Alert state tracking
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.suppressedAlerts = new Set();
    this.escalationTimers = new Map();
    
    // Statistics
    this.stats = {
      totalAlerts: 0,
      alertsByType: {},
      alertsBySeverity: {},
      resolvedAlerts: 0,
      escalatedAlerts: 0
    };

    this.isInitialized = false;
  }

  /**
   * Initialize the alerting service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('🚨 Initializing Alerting Service...');

    // Ensure log directory exists
    if (this.config.enableFile) {
      const logDir = path.dirname(this.config.alertLogPath);
      await fs.mkdir(logDir, { recursive: true });
    }

    // Initialize notification channels
    await this.initializeChannels();

    this.isInitialized = true;
    console.log('✅ Alerting Service initialized');
  }

  /**
   * Process incoming alert
   */
  async processAlert(alert) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate alert
    if (!this.validateAlert(alert)) {
      console.error('Invalid alert format:', alert);
      return;
    }

    // Check if alert should be suppressed
    if (this.isAlertSuppressed(alert)) {
      return;
    }

    // Enrich alert with additional data
    const enrichedAlert = this.enrichAlert(alert);

    // Update statistics
    this.updateStatistics(enrichedAlert);

    // Store active alert
    this.activeAlerts.set(enrichedAlert.id, {
      ...enrichedAlert,
      status: 'active',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      notificationsSent: 0,
      escalated: false
    });

    // Add to history
    this.alertHistory.push(enrichedAlert);

    // Send notifications
    await this.sendNotifications(enrichedAlert);

    // Set up escalation if needed
    this.scheduleEscalation(enrichedAlert);

    // Emit alert event
    this.emit('alert_processed', enrichedAlert);

    return enrichedAlert.id;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, resolution = {}) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      console.warn(`Alert ${alertId} not found or already resolved`);
      return false;
    }

    // Update alert status
    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;
    alert.lastUpdated = Date.now();

    // Clear escalation timer
    if (this.escalationTimers.has(alertId)) {
      clearTimeout(this.escalationTimers.get(alertId));
      this.escalationTimers.delete(alertId);
    }

    // Send resolution notification
    await this.sendNotifications({
      ...alert,
      type: `${alert.type}_resolved`,
      message: `Alert resolved: ${alert.message}`
    });

    // Update statistics
    this.stats.resolvedAlerts++;

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    // Emit resolution event
    this.emit('alert_resolved', { alertId, alert });

    console.log(`✅ Alert ${alertId} resolved`);
    return true;
  }

  /**
   * Suppress alerts of specific type
   */
  suppressAlerts(alertType, duration = 3600000) { // 1 hour default
    const suppressionKey = `${alertType}:${Date.now() + duration}`;
    this.suppressedAlerts.add(suppressionKey);

    console.log(`🔇 Suppressing alerts of type '${alertType}' for ${duration/1000/60} minutes`);

    // Auto-remove suppression after duration
    setTimeout(() => {
      this.suppressedAlerts.delete(suppressionKey);
    }, duration);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeAlerts: this.activeAlerts.size,
      suppressedTypes: this.suppressedAlerts.size,
      uptime: process.uptime()
    };
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // Private methods

  validateAlert(alert) {
    const required = ['type', 'message', 'timestamp', 'severity'];
    return required.every(field => alert.hasOwnProperty(field));
  }

  isAlertSuppressed(alert) {
    const now = Date.now();
    
    for (const suppressionKey of this.suppressedAlerts) {
      const [type, expiryStr] = suppressionKey.split(':');
      const expiry = parseInt(expiryStr);
      
      if (alert.type === type && now < expiry) {
        return true;
      }
      
      // Clean up expired suppressions
      if (now >= expiry) {
        this.suppressedAlerts.delete(suppressionKey);
      }
    }
    
    return false;
  }

  enrichAlert(alert) {
    return {
      ...alert,
      id: alert.id || this.generateAlertId(),
      hostname: require('os').hostname(),
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development',
      tags: alert.tags || [],
      context: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        ...alert.context
      }
    };
  }

  updateStatistics(alert) {
    this.stats.totalAlerts++;
    
    // By type
    if (!this.stats.alertsByType[alert.type]) {
      this.stats.alertsByType[alert.type] = 0;
    }
    this.stats.alertsByType[alert.type]++;
    
    // By severity
    if (!this.stats.alertsBySeverity[alert.severity]) {
      this.stats.alertsBySeverity[alert.severity] = 0;
    }
    this.stats.alertsBySeverity[alert.severity]++;
  }

  async sendNotifications(alert) {
    const promises = [];

    // Console notification
    if (this.config.enableConsole) {
      promises.push(this.sendConsoleNotification(alert));
    }

    // File notification
    if (this.config.enableFile) {
      promises.push(this.sendFileNotification(alert));
    }

    // Webhook notification
    if (this.config.enableWebhook && this.config.webhookUrl) {
      promises.push(this.sendWebhookNotification(alert));
    }

    // Email notification
    if (this.config.enableEmail && this.config.emailSettings.enabled) {
      promises.push(this.sendEmailNotification(alert));
    }

    // Wait for all notifications with error handling
    const results = await Promise.allSettled(promises);
    
    // Log any notification failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Notification channel ${index} failed:`, result.reason);
      }
    });

    // Update notification count
    if (this.activeAlerts.has(alert.id)) {
      this.activeAlerts.get(alert.id).notificationsSent++;
    }
  }

  async sendConsoleNotification(alert) {
    const severityColors = {
      critical: '\x1b[31m', // Red
      warning: '\x1b[33m',  // Yellow
      info: '\x1b[34m',     // Blue
      success: '\x1b[32m'   // Green
    };

    const color = severityColors[alert.severity] || '\x1b[0m';
    const reset = '\x1b[0m';
    const timestamp = new Date(alert.timestamp).toISOString();
    
    console.log(`${color}🚨 [${alert.severity.toUpperCase()}] ${timestamp}${reset}`);
    console.log(`   Type: ${alert.type}`);
    console.log(`   Message: ${alert.message}`);
    if (alert.details) {
      console.log(`   Details: ${JSON.stringify(alert.details, null, 2)}`);
    }
    console.log('');
  }

  async sendFileNotification(alert) {
    const logEntry = {
      timestamp: new Date(alert.timestamp).toISOString(),
      severity: alert.severity,
      type: alert.type,
      message: alert.message,
      details: alert.details,
      hostname: alert.hostname,
      pid: alert.pid,
      environment: alert.environment
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      await fs.appendFile(this.config.alertLogPath, logLine);
      
      // Check file size and rotate if needed
      await this.rotateLogIfNeeded();
    } catch (error) {
      console.error('Failed to write alert to file:', error);
    }
  }

  async sendWebhookNotification(alert) {
    try {
      const fetch = require('node-fetch');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.webhookTimeout);

      const payload = {
        alert_type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: new Date(alert.timestamp).toISOString(),
        details: alert.details,
        hostname: alert.hostname,
        environment: alert.environment
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Lodge-Scheduler-Alerting/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
      }

    } catch (error) {
      console.error('Webhook notification failed:', error.message);
      throw error;
    }
  }

  async sendEmailNotification(alert) {
    // Email implementation would go here
    // This is a placeholder for email notifications
    console.log('📧 Email notification (not implemented):', alert.type);
  }

  scheduleEscalation(alert) {
    if (alert.severity === 'critical') {
      const timer = setTimeout(async () => {
        await this.escalateAlert(alert);
      }, this.config.escalationTimeout);

      this.escalationTimers.set(alert.id, timer);
    }
  }

  async escalateAlert(alert) {
    if (!this.activeAlerts.has(alert.id)) {
      return; // Alert already resolved
    }

    const activeAlert = this.activeAlerts.get(alert.id);
    activeAlert.escalated = true;
    activeAlert.escalatedAt = Date.now();
    this.stats.escalatedAlerts++;

    const escalatedAlert = {
      ...alert,
      type: `${alert.type}_escalated`,
      severity: 'critical',
      message: `ESCALATED: ${alert.message}`,
      escalated: true
    };

    await this.sendNotifications(escalatedAlert);
    this.emit('alert_escalated', { alertId: alert.id, alert: escalatedAlert });

    console.log(`🔺 Alert ${alert.id} escalated`);
  }

  async rotateLogIfNeeded() {
    try {
      const stats = await fs.stat(this.config.alertLogPath);
      
      if (stats.size > this.config.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${this.config.alertLogPath}.${timestamp}`;
        
        await fs.rename(this.config.alertLogPath, rotatedPath);
        
        console.log(`📋 Alert log rotated to ${rotatedPath}`);
      }
    } catch (error) {
      // File doesn't exist yet, that's ok
      if (error.code !== 'ENOENT') {
        console.error('Failed to rotate alert log:', error);
      }
    }
  }

  async initializeChannels() {
    console.log('🔧 Initializing alert channels...');
    
    const channels = [];
    if (this.config.enableConsole) channels.push('Console');
    if (this.config.enableFile) channels.push('File');
    if (this.config.enableWebhook) channels.push('Webhook');
    if (this.config.enableEmail) channels.push('Email');
    
    console.log(`📡 Alert channels: ${channels.join(', ')}`);
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Test alert system
   */
  async testAlerts() {
    console.log('🧪 Testing alert system...');

    const testAlerts = [
      {
        type: 'test_info',
        severity: 'info',
        message: 'Test info alert',
        timestamp: Date.now()
      },
      {
        type: 'test_warning',
        severity: 'warning',
        message: 'Test warning alert',
        timestamp: Date.now(),
        details: { test: true }
      },
      {
        type: 'test_critical',
        severity: 'critical',
        message: 'Test critical alert',
        timestamp: Date.now(),
        details: { test: true, critical: true }
      }
    ];

    for (const alert of testAlerts) {
      const alertId = await this.processAlert(alert);
      console.log(`✅ Test alert sent: ${alertId}`);
      
      // Wait a bit between alerts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('🧪 Alert test completed');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🚨 Shutting down Alerting Service...');
    
    // Clear all escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    // Send final alert about shutdown
    await this.processAlert({
      type: 'service_shutdown',
      severity: 'info',
      message: 'Alerting service shutting down',
      timestamp: Date.now()
    });

    this.removeAllListeners();
    console.log('✅ Alerting Service shut down');
  }
}

module.exports = AlertingService;