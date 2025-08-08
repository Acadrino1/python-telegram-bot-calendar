const { Model } = require('objection');

class AvailabilityException extends Model {
  static get tableName() {
    return 'availability_exceptions';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['providerId', 'date', 'type'],
      properties: {
        id: { type: 'integer' },
        providerId: { type: 'integer' },
        date: { type: 'string', format: 'date' },
        type: { type: 'string', enum: ['unavailable', 'special_hours'] },
        hours: { type: 'array' },
        reason: { type: 'string' },
        recurring: { type: 'boolean', default: false },
        recurringEndDate: { type: 'string', format: 'date' },
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
          from: 'availability_exceptions.providerId',
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

module.exports = AvailabilityException;