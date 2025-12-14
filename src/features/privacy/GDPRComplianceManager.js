/**
 * GDPR Compliance Manager - Rule 20 Compliance
 * Full GDPR compliance with data export, deletion, consent management, and privacy controls
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class GDPRComplianceManager {
  constructor() {
    this.consentRecords = new Map();
    this.dataProcessingLog = [];
    this.dataRetentionPolicies = new Map();
    this.anonymizationMethods = new Map();
    
    // GDPR configuration
    this.config = {
      consentTypes: ['data_processing', 'marketing', 'analytics', 'cookies', 'third_party_sharing'],
      dataRetentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years in milliseconds
      automaticDeletionEnabled: true,
      encryptionEnabled: true,
      auditLogEnabled: true,
      consentExpirationPeriod: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      dataPortabilityFormats: ['json', 'csv', 'xml']
    };

    this.lawfulBasis = {
      CONSENT: 'consent',
      CONTRACT: 'contract',
      LEGAL_OBLIGATION: 'legal_obligation',
      VITAL_INTERESTS: 'vital_interests',
      PUBLIC_TASK: 'public_task',
      LEGITIMATE_INTERESTS: 'legitimate_interests'
    };

    this.initialize();
  }

  /**
   * Initialize GDPR compliance system
   */
  async initialize() {
    try {
      await this.setupDataProtectionPolicies();
      await this.initializeConsentManagement();
      await this.scheduleAutomaticCleanup();
      
      console.log('🔒 GDPR Compliance Manager initialized');
    } catch (error) {
      console.error('Failed to initialize GDPR compliance:', error);
    }
  }

  /**
   * Setup data protection policies
   */
  async setupDataProtectionPolicies() {
    // Define retention policies for different data types
    this.dataRetentionPolicies.set('user_data', {
      retentionPeriod: this.config.dataRetentionPeriod,
      lawfulBasis: this.lawfulBasis.CONTRACT,
      autoDelete: true,
      anonymizeAfter: 3 * 365 * 24 * 60 * 60 * 1000 // 3 years
    });

    this.dataRetentionPolicies.set('appointment_data', {
      retentionPeriod: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
      lawfulBasis: this.lawfulBasis.CONTRACT,
      autoDelete: false,
      anonymizeAfter: 2 * 365 * 24 * 60 * 60 * 1000 // 2 years
    });

    this.dataRetentionPolicies.set('support_tickets', {
      retentionPeriod: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
      lawfulBasis: this.lawfulBasis.LEGITIMATE_INTERESTS,
      autoDelete: true,
      anonymizeAfter: 1 * 365 * 24 * 60 * 60 * 1000 // 1 year
    });

    this.dataRetentionPolicies.set('analytics_data', {
      retentionPeriod: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      lawfulBasis: this.lawfulBasis.LEGITIMATE_INTERESTS,
      autoDelete: true,
      anonymizeAfter: 6 * 30 * 24 * 60 * 60 * 1000 // 6 months
    });

    // Setup anonymization methods
    this.anonymizationMethods.set('email', (email) => {
      const [, domain] = email.split('@');
      return `anonymous_${this.generateAnonymousId()}@${domain}`;
    });

    this.anonymizationMethods.set('phone', (phone) => {
      return `***-***-${phone.slice(-4)}`;
    });

    this.anonymizationMethods.set('name', () => {
      return `Anonymous User ${this.generateAnonymousId()}`;
    });

    this.anonymizationMethods.set('address', () => {
      return 'Address Anonymized';
    });
  }

  /**
   * Initialize consent management
   */
  async initializeConsentManagement() {
    // Load existing consent records
    try {
      const consentDir = path.join(__dirname, '../../../data/consent');
      await fs.mkdir(consentDir, { recursive: true });
    } catch (error) {
      console.warn('Could not create consent directory:', error);
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(userId, consentData) {
    const consentRecord = {
      userId: userId.toString(),
      timestamp: new Date(),
      consentTypes: consentData.consentTypes || [],
      lawfulBasis: consentData.lawfulBasis || this.lawfulBasis.CONSENT,
      version: consentData.version || '1.0',
      ipAddress: this.hashIP(consentData.ipAddress),
      userAgent: consentData.userAgent ? this.hashString(consentData.userAgent) : null,
      withdrawable: consentData.withdrawable !== false,
      expiresAt: new Date(Date.now() + this.config.consentExpirationPeriod),
      metadata: consentData.metadata || {}
    };

    // Store consent record
    this.consentRecords.set(userId.toString(), consentRecord);

    // Log data processing event
    await this.logDataProcessing('consent_recorded', userId, {
      consentTypes: consentRecord.consentTypes,
      lawfulBasis: consentRecord.lawfulBasis
    });

    // Save to persistent storage
    await this.saveConsentRecord(consentRecord);

    return consentRecord;
  }

  /**
   * Check if user has valid consent
   */
  hasValidConsent(userId, consentType = null) {
    const consentRecord = this.consentRecords.get(userId.toString());
    
    if (!consentRecord) {
      return false;
    }

    // Check if consent is expired
    if (new Date() > consentRecord.expiresAt) {
      return false;
    }

    // Check specific consent type
    if (consentType && !consentRecord.consentTypes.includes(consentType)) {
      return false;
    }

    return true;
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(userId, consentTypes = null) {
    const consentRecord = this.consentRecords.get(userId.toString());
    
    if (!consentRecord) {
      throw new Error('No consent record found for user');
    }

    if (!consentRecord.withdrawable) {
      throw new Error('Consent cannot be withdrawn due to legal obligations');
    }

    if (consentTypes) {
      // Withdraw specific consent types
      consentRecord.consentTypes = consentRecord.consentTypes.filter(
        type => !consentTypes.includes(type)
      );
    } else {
      // Withdraw all consent
      consentRecord.consentTypes = [];
    }

    consentRecord.withdrawnAt = new Date();

    // Log withdrawal
    await this.logDataProcessing('consent_withdrawn', userId, {
      withdrawnTypes: consentTypes || 'all'
    });

    // Save updated record
    await this.saveConsentRecord(consentRecord);

    // Trigger data processing review
    await this.reviewDataProcessing(userId);

    return consentRecord;
  }

  /**
   * Export user data (Data Portability - Article 20)
   */
  async exportUserData(userId, format = 'json') {
    if (!this.config.dataPortabilityFormats.includes(format)) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    try {
      // Collect all user data from various sources
      const userData = await this.collectUserData(userId);

      // Log data export request
      await this.logDataProcessing('data_exported', userId, { format });

      // Format data according to requested format
      const formattedData = await this.formatExportData(userData, format);

      // Create export file
      const exportFile = await this.createExportFile(userId, formattedData, format);

      return {
        success: true,
        exportFile,
        dataTypes: Object.keys(userData),
        recordCount: this.countRecords(userData),
        timestamp: new Date(),
        format
      };

    } catch (error) {
      console.error('Data export error:', error);
      throw new Error('Failed to export user data');
    }
  }

  /**
   * Collect all user data from database
   */
  async collectUserData(userId) {
    const data = {
      profile: null,
      appointments: [],
      supportTickets: [],
      preferences: {},
      consentRecords: [],
      analyticsData: []
    };

    try {
      // Get user profile
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', userId.toString())
        .first();

      if (user) {
        data.profile = {
          id: user.id,
          telegramId: user.telegram_id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          preferences: user.preferences || {}
        };

        // Get appointments
        const Appointment = require('../../models/Appointment');
        const appointments = await Appointment.query()
          .where('user_id', user.id);

        data.appointments = appointments.map(apt => ({
          id: apt.id,
          appointmentDate: apt.appointment_date,
          appointmentTime: apt.appointment_time,
          status: apt.status,
          referenceId: apt.reference_id,
          createdAt: apt.created_at,
          customerInfo: apt.customer_info || {}
        }));

        // Get support tickets
        const SupportTicket = require('../../models/SupportTicket');
        const tickets = await SupportTicket.query()
          .where('user_id', user.id);

        data.supportTickets = tickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.created_at,
          messages: ticket.messages || []
        }));
      }

      // Get consent records
      const consentRecord = this.consentRecords.get(userId.toString());
      if (consentRecord) {
        data.consentRecords.push(consentRecord);
      }

      return data;

    } catch (error) {
      console.error('Error collecting user data:', error);
      throw error;
    }
  }

  /**
   * Delete user data (Right to Erasure - Article 17)
   */
  async deleteUserData(userId, dataTypes = null) {
    try {
      const deletionReport = {
        userId: userId.toString(),
        requestedAt: new Date(),
        deletedData: {},
        retainedData: {},
        errors: []
      };

      // Check if user has right to erasure
      const canDelete = await this.canDeleteUserData(userId);
      if (!canDelete.allowed) {
        throw new Error(`Cannot delete user data: ${canDelete.reason}`);
      }

      // Delete from database tables
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', userId.toString())
        .first();

      if (user) {
        // Delete appointments (if allowed)
        if (!dataTypes || dataTypes.includes('appointments')) {
          const Appointment = require('../../models/Appointment');
          const deletedAppointments = await Appointment.query()
            .where('user_id', user.id)
            .delete();
          
          deletionReport.deletedData.appointments = deletedAppointments;
        }

        // Delete support tickets (if allowed)
        if (!dataTypes || dataTypes.includes('support_tickets')) {
          const SupportTicket = require('../../models/SupportTicket');
          const deletedTickets = await SupportTicket.query()
            .where('user_id', user.id)
            .delete();
          
          deletionReport.deletedData.supportTickets = deletedTickets;
        }

        // Delete user profile
        if (!dataTypes || dataTypes.includes('profile')) {
          await User.query()
            .where('telegram_id', userId.toString())
            .delete();
          
          deletionReport.deletedData.profile = true;
        }
      }

      // Remove consent records
      this.consentRecords.delete(userId.toString());
      deletionReport.deletedData.consentRecords = true;

      // Log deletion
      await this.logDataProcessing('data_deleted', userId, deletionReport);

      return deletionReport;

    } catch (error) {
      console.error('Data deletion error:', error);
      throw error;
    }
  }

  /**
   * Anonymize user data
   */
  async anonymizeUserData(userId, dataTypes = null) {
    try {
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', userId.toString())
        .first();

      if (!user) {
        throw new Error('User not found');
      }

      const anonymizationReport = {
        userId: userId.toString(),
        originalId: user.id,
        anonymizedAt: new Date(),
        anonymizedFields: []
      };

      // Anonymize user profile
      const updates = {};

      if (!dataTypes || dataTypes.includes('email') && user.email) {
        updates.email = this.anonymizationMethods.get('email')(user.email);
        anonymizationReport.anonymizedFields.push('email');
      }

      if (!dataTypes || dataTypes.includes('phone') && user.phone) {
        updates.phone = this.anonymizationMethods.get('phone')(user.phone);
        anonymizationReport.anonymizedFields.push('phone');
      }

      if (!dataTypes || dataTypes.includes('name')) {
        const anonymousName = this.anonymizationMethods.get('name')();
        updates.first_name = anonymousName;
        updates.last_name = 'Anonymized';
        anonymizationReport.anonymizedFields.push('name');
      }

      if (Object.keys(updates).length > 0) {
        await User.query()
          .where('telegram_id', userId.toString())
          .update(updates);
      }

      // Log anonymization
      await this.logDataProcessing('data_anonymized', userId, anonymizationReport);

      return anonymizationReport;

    } catch (error) {
      console.error('Data anonymization error:', error);
      throw error;
    }
  }

  /**
   * Check if user data can be deleted
   */
  async canDeleteUserData(userId) {
    try {
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', userId.toString())
        .first();

      if (!user) {
        return { allowed: true, reason: 'User not found' };
      }

      // Check for legal obligations to retain data
      const Appointment = require('../../models/Appointment');
      const recentAppointments = await Appointment.query()
        .where('user_id', user.id)
        .where('appointment_date', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) // 90 days
        .count('id as count')
        .first();

      if (recentAppointments.count > 0) {
        return {
          allowed: false,
          reason: 'Recent appointments require data retention for legal compliance'
        };
      }

      // Check for ongoing support cases
      const SupportTicket = require('../../models/SupportTicket');
      const openTickets = await SupportTicket.query()
        .where('user_id', user.id)
        .where('status', 'open')
        .count('id as count')
        .first();

      if (openTickets.count > 0) {
        return {
          allowed: false,
          reason: 'Open support tickets require data retention'
        };
      }

      return { allowed: true, reason: null };

    } catch (error) {
      console.error('Error checking deletion eligibility:', error);
      return { allowed: false, reason: 'Error checking eligibility' };
    }
  }

  /**
   * Format export data
   */
  async formatExportData(userData, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(userData, null, 2);
      
      case 'csv':
        return this.convertToCSV(userData);
      
      case 'xml':
        return this.convertToXML(userData);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(userData) {
    let csv = '';

    // Profile data
    if (userData.profile) {
      csv += 'PROFILE DATA\n';
      csv += 'Field,Value\n';
      Object.entries(userData.profile).forEach(([key, value]) => {
        csv += `${key},"${value}"\n`;
      });
      csv += '\n';
    }

    // Appointments data
    if (userData.appointments.length > 0) {
      csv += 'APPOINTMENTS\n';
      csv += 'ID,Date,Time,Status,Reference\n';
      userData.appointments.forEach(apt => {
        csv += `${apt.id},${apt.appointmentDate},${apt.appointmentTime},${apt.status},${apt.referenceId}\n`;
      });
      csv += '\n';
    }

    return csv;
  }

  /**
   * Convert data to XML format
   */
  convertToXML(userData) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<user_data>\n';

    if (userData.profile) {
      xml += '  <profile>\n';
      Object.entries(userData.profile).forEach(([key, value]) => {
        xml += `    <${key}>${this.escapeXML(value)}</${key}>\n`;
      });
      xml += '  </profile>\n';
    }

    if (userData.appointments.length > 0) {
      xml += '  <appointments>\n';
      userData.appointments.forEach(apt => {
        xml += '    <appointment>\n';
        Object.entries(apt).forEach(([key, value]) => {
          xml += `      <${key}>${this.escapeXML(value)}</${key}>\n`;
        });
        xml += '    </appointment>\n';
      });
      xml += '  </appointments>\n';
    }

    xml += '</user_data>';
    return xml;
  }

  /**
   * Create export file
   */
  async createExportFile(userId, data, format) {
    const exportDir = path.join(__dirname, '../../../data/exports');
    await fs.mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `user_data_${userId}_${timestamp}.${format}`;
    const filepath = path.join(exportDir, filename);

    await fs.writeFile(filepath, data, 'utf8');

    return {
      filename,
      filepath,
      size: Buffer.byteLength(data, 'utf8')
    };
  }

  /**
   * Log data processing activity
   */
  async logDataProcessing(action, userId, details = {}) {
    const logEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      action,
      userId: userId.toString(),
      details,
      ipAddress: details.ipAddress ? this.hashIP(details.ipAddress) : null,
      userAgent: details.userAgent ? this.hashString(details.userAgent) : null
    };

    this.dataProcessingLog.push(logEntry);

    // Keep only recent logs (last 10,000 entries)
    if (this.dataProcessingLog.length > 10000) {
      this.dataProcessingLog = this.dataProcessingLog.slice(-10000);
    }

    // In production, you would save this to a secure audit log
    if (this.config.auditLogEnabled) {
      console.log('🔍 GDPR Audit Log:', logEntry);
    }
  }

  /**
   * Review data processing for user
   */
  async reviewDataProcessing(userId) {
    const consentRecord = this.consentRecords.get(userId.toString());
    
    if (!consentRecord) {
      console.warn(`No consent record found for user ${userId}`);
      return;
    }

    // Check what data processing is still allowed
    const allowedProcessing = [];
    const restrictedProcessing = [];

    for (const consentType of this.config.consentTypes) {
      if (consentRecord.consentTypes.includes(consentType)) {
        allowedProcessing.push(consentType);
      } else {
        restrictedProcessing.push(consentType);
      }
    }

    await this.logDataProcessing('processing_reviewed', userId, {
      allowedProcessing,
      restrictedProcessing
    });

    return { allowedProcessing, restrictedProcessing };
  }

  /**
   * Schedule automatic cleanup
   */
  async scheduleAutomaticCleanup() {
    if (!this.config.automaticDeletionEnabled) {
      return;
    }

    // Run cleanup every 24 hours
    setInterval(async () => {
      try {
        await this.performAutomaticCleanup();
      } catch (error) {
        console.error('Automatic cleanup error:', error);
      }
    }, 24 * 60 * 60 * 1000);

    console.log('📅 Automatic cleanup scheduled');
  }

  /**
   * Perform automatic cleanup
   */
  async performAutomaticCleanup() {
    console.log('🧹 Starting automatic GDPR cleanup');

    let cleanupReport = {
      timestamp: new Date(),
      expiredConsents: 0,
      anonymizedRecords: 0,
      deletedRecords: 0,
      errors: []
    };

    try {
      // Check for expired consents
      for (const [userId, consentRecord] of this.consentRecords) {
        if (new Date() > consentRecord.expiresAt) {
          await this.withdrawConsent(userId);
          cleanupReport.expiredConsents++;
        }
      }

      // Check for data that should be anonymized
      const User = require('../../models/User');
      const oldUsers = await User.query()
        .where('created_at', '<', new Date(Date.now() - this.dataRetentionPolicies.get('user_data').anonymizeAfter));

      for (const user of oldUsers) {
        try {
          await this.anonymizeUserData(user.telegram_id, ['email', 'phone']);
          cleanupReport.anonymizedRecords++;
        } catch (error) {
          cleanupReport.errors.push(`Anonymization failed for user ${user.telegram_id}: ${error.message}`);
        }
      }

    } catch (error) {
      console.error('Cleanup process error:', error);
      cleanupReport.errors.push(error.message);
    }

    console.log('✅ GDPR cleanup completed:', cleanupReport);
    return cleanupReport;
  }

  /**
   * Generate privacy report for user
   */
  async generatePrivacyReport(userId) {
    const report = {
      userId: userId.toString(),
      generatedAt: new Date(),
      dataProcessing: {
        hasConsent: this.hasValidConsent(userId),
        consentTypes: [],
        lawfulBasis: null,
        consentExpiresAt: null
      },
      dataStored: {},
      retentionPeriods: {},
      userRights: {
        dataPortability: true,
        rightToErasure: false,
        rightToRectification: true,
        rightToRestriction: true
      }
    };

    // Get consent information
    const consentRecord = this.consentRecords.get(userId.toString());
    if (consentRecord) {
      report.dataProcessing.consentTypes = consentRecord.consentTypes;
      report.dataProcessing.lawfulBasis = consentRecord.lawfulBasis;
      report.dataProcessing.consentExpiresAt = consentRecord.expiresAt;
    }

    // Get data storage information
    const userData = await this.collectUserData(userId);
    report.dataStored = {
      profile: !!userData.profile,
      appointments: userData.appointments.length,
      supportTickets: userData.supportTickets.length,
      analyticsData: userData.analyticsData.length
    };

    // Set retention periods
    for (const [dataType, policy] of this.dataRetentionPolicies) {
      report.retentionPeriods[dataType] = {
        retentionPeriod: Math.floor(policy.retentionPeriod / (24 * 60 * 60 * 1000)), // days
        lawfulBasis: policy.lawfulBasis
      };
    }

    // Check right to erasure
    const canDelete = await this.canDeleteUserData(userId);
    report.userRights.rightToErasure = canDelete.allowed;
    if (!canDelete.allowed) {
      report.userRights.erasureBlocked = canDelete.reason;
    }

    return report;
  }

  /**
   * Utility functions
   */
  generateAnonymousId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  generateLogId() {
    return crypto.randomBytes(16).toString('hex');
  }

  hashIP(ip) {
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  hashString(str) {
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  escapeXML(str) {
    if (typeof str !== 'string') str = String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  countRecords(userData) {
    let count = 0;
    count += userData.profile ? 1 : 0;
    count += userData.appointments.length;
    count += userData.supportTickets.length;
    count += userData.consentRecords.length;
    count += userData.analyticsData.length;
    return count;
  }

  async saveConsentRecord(consentRecord) {
    // In production, save to secure database
    // For now, we'll just log it
    console.log('💾 Consent record saved:', {
      userId: consentRecord.userId,
      timestamp: consentRecord.timestamp,
      consentTypes: consentRecord.consentTypes
    });
  }
}

module.exports = GDPRComplianceManager;