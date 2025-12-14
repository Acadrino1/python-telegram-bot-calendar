const { Model } = require('objection');

class AvailabilitySchedule extends Model {
  static get tableName() {
    return 'availability_schedules';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['provider_id'],
      properties: {
        id: { type: 'integer' },
        provider_id: { type: 'integer' },
        timezone: { type: 'string', default: 'America/New_York' },
        regular_hours: { type: 'object' },
        slot_duration: { type: 'integer', default: 30 },
        buffer_time: { type: 'integer', default: 0 },
        is_active: { type: 'boolean', default: true },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' }
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
          from: 'availability_schedules.provider_id',
          to: 'users.id'
        }
      }
    };
  }

  $beforeInsert() {
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }
}

module.exports = AvailabilitySchedule;