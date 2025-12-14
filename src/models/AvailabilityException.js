const { Model } = require('objection');

class AvailabilityException extends Model {
  static get tableName() {
    return 'availability_exceptions';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['provider_id', 'date', 'type'],
      properties: {
        id: { type: 'integer' },
        provider_id: { type: 'integer' },
        date: { type: 'string', format: 'date' },
        type: { type: 'string', enum: ['unavailable', 'special_hours'] },
        hours: { type: 'array' },
        reason: { type: 'string' },
        recurring: { type: 'boolean', default: false },
        recurring_end_date: { type: 'string', format: 'date' },
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
          from: 'availability_exceptions.provider_id',
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

module.exports = AvailabilityException;