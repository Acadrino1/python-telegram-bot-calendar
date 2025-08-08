const { Model } = require('objection');

class AvailabilitySchedule extends Model {
  static get tableName() {
    return 'availability_schedules';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['providerId'],
      properties: {
        id: { type: 'integer' },
        providerId: { type: 'integer' },
        timezone: { type: 'string', default: 'America/New_York' },
        regularHours: { type: 'object' },
        slotDuration: { type: 'integer', default: 30 },
        bufferTime: { type: 'integer', default: 0 },
        isActive: { type: 'boolean', default: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');
    
    return {
      provider: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'availability_schedules.providerId',
          to: 'users.id'
        }
      }
    };
  }

  $beforeInsert() {
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updatedAt = new Date().toISOString();
  }
}

module.exports = AvailabilitySchedule;