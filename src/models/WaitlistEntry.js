const { Model } = require('objection');
const moment = require('moment-timezone');
const { WaitlistStatus } = require('../types');

class WaitlistEntry extends Model {
  static get tableName() {
    return 'waitlist';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['client_id', 'provider_id', 'service_id', 'preferred_date', 'expires_at'],
      properties: {
        id: { type: 'integer' },
        client_id: { type: 'integer' },
        provider_id: { type: 'integer' },
        service_id: { type: 'integer' },
        preferred_date: { type: 'string', format: 'date' },
        preferred_start_time: { type: 'string' },
        preferred_end_time: { type: 'string' },
        status: { type: 'string', enum: Object.values(WaitlistStatus) },
        notes: { type: 'string' },
        expires_at: { type: 'string', format: 'date-time' },
        notified_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    const Service = require('./Service');

    return {
      client: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'waitlist.client_id',
          to: 'users.id'
        }
      },

      provider: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'waitlist.provider_id',
          to: 'users.id'
        }
      },

      service: {
        relation: Model.BelongsToOneRelation,
        modelClass: Service,
        join: {
          from: 'waitlist.service_id',
          to: 'services.id'
        }
      }
    };
  }

  // Set default status before inserting
  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext);
    if (!this.status) {
      this.status = WaitlistStatus.ACTIVE;
    }
  }

  // Status check methods
  isActive() {
    return this.status === WaitlistStatus.ACTIVE;
  }

  isNotified() {
    return this.status === WaitlistStatus.NOTIFIED;
  }

  isExpired() {
    return this.status === WaitlistStatus.EXPIRED;
  }

  isFulfilled() {
    return this.status === WaitlistStatus.FULFILLED;
  }

  // Check if waitlist entry has expired
  hasExpired() {
    return moment().isAfter(moment(this.expires_at));
  }

  // Update status methods
  async markNotified() {
    await this.$query().patch({
      status: WaitlistStatus.NOTIFIED,
      notified_at: new Date().toISOString()
    });
    this.status = WaitlistStatus.NOTIFIED;
    this.notified_at = new Date().toISOString();
  }

  async markFulfilled() {
    await this.$query().patch({ status: WaitlistStatus.FULFILLED });
    this.status = WaitlistStatus.FULFILLED;
  }

  async markExpired() {
    await this.$query().patch({ status: WaitlistStatus.EXPIRED });
    this.status = WaitlistStatus.EXPIRED;
  }

  // Extend expiration
  async extendExpiration(days = 7) {
    const newExpiryDate = moment().add(days, 'days').toISOString();
    await this.$query().patch({ expires_at: newExpiryDate });
    this.expires_at = newExpiryDate;
  }

  // Get formatted preferred time
  getPreferredTimeRange() {
    if (!this.preferred_start_time && !this.preferred_end_time) {
      return 'Any time';
    }
    
    if (this.preferred_start_time && !this.preferred_end_time) {
      return `After ${this.formatTime(this.preferred_start_time)}`;
    }
    
    if (!this.preferred_start_time && this.preferred_end_time) {
      return `Before ${this.formatTime(this.preferred_end_time)}`;
    }
    
    return `${this.formatTime(this.preferred_start_time)} - ${this.formatTime(this.preferred_end_time)}`;
  }

  formatTime(timeString) {
    return moment(timeString, 'HH:mm:ss').format('h:mm A');
  }

  // Static methods
  static async findActiveEntries() {
    return this.query()
      .where('status', WaitlistStatus.ACTIVE)
      .where('expires_at', '>', new Date().toISOString())
      .withGraphFetched('[client, provider, service]')
      .orderBy('created_at');
  }

  static async findExpiredEntries() {
    return this.query()
      .where('status', WaitlistStatus.ACTIVE)
      .where('expires_at', '<=', new Date().toISOString());
  }

  static async findByClient(clientId, status = null) {
    const query = this.query()
      .where('client_id', clientId)
      .withGraphFetched('[provider, service]')
      .orderBy('created_at', 'desc');
    
    if (status) {
      query.where('status', status);
    }
    
    return query;
  }

  static async findByProvider(providerId, date = null, status = null) {
    const query = this.query()
      .where('provider_id', providerId)
      .withGraphFetched('[client, service]');
    
    if (date) {
      query.where('preferred_date', date);
    }
    
    if (status) {
      query.where('status', status);
    }
    
    return query.orderBy('created_at');
  }

  // Process expired entries
  static async processExpiredEntries() {
    const expiredEntries = await this.findExpiredEntries();
    
    for (const entry of expiredEntries) {
      await entry.markExpired();
    }
    
    return expiredEntries.length;
  }
}

module.exports = WaitlistEntry;