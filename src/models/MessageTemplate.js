const { Model } = require('objection');

class MessageTemplate extends Model {
  static get tableName() {
    return 'message_templates';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'content', 'category'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        description: { type: 'string' },
        category: { 
          type: 'string', 
          enum: ['announcement', 'reminder', 'promotional', 'system', 'custom'] 
        },
        content: { type: 'string', minLength: 1 },
        media_attachments: { type: 'object' },
        inline_keyboard: { type: 'object' },
        variables: { type: 'object' },
        created_by: { type: 'integer' },
        usage_count: { type: 'integer', minimum: 0 },
        last_used_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  static get relationMappings() {
    const User = require('./User');

    return {
      creator: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'message_templates.created_by',
          to: 'users.id'
        }
      }
    };
  }

  // Category checks
  isAnnouncement() {
    return this.category === 'announcement';
  }

  isReminder() {
    return this.category === 'reminder';
  }

  isPromotional() {
    return this.category === 'promotional';
  }

  isSystem() {
    return this.category === 'system';
  }

  isCustom() {
    return this.category === 'custom';
  }

  // Template processing
  getVariables() {
    const variables = this.variables || {};
    const contentVariables = this.extractVariablesFromContent();
    
    // Merge defined variables with auto-detected ones
    contentVariables.forEach(variable => {
      if (!variables[variable]) {
        variables[variable] = {
          name: variable,
          type: 'string',
          required: true,
          description: `Auto-detected variable: ${variable}`
        };
      }
    });

    return variables;
  }

  extractVariablesFromContent() {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;

    while ((match = variablePattern.exec(this.content)) !== null) {
      const variable = match[1].trim();
      if (!variables.includes(variable)) {
        variables.push(variable);
      }
    }

    return variables;
  }

  processTemplate(variableValues = {}) {
    let processedContent = this.content;
    const variables = this.getVariables();

    // Replace template variables
    Object.keys(variables).forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = variableValues[key];
      
      if (value !== undefined) {
        processedContent = processedContent.replace(
          new RegExp(placeholder, 'g'), 
          value.toString()
        );
      } else if (variables[key].required) {
        // Keep placeholder for required variables that weren't provided
        console.warn(`Required variable '${key}' not provided for template '${this.name}'`);
      } else {
        // Remove placeholder for optional variables
        processedContent = processedContent.replace(
          new RegExp(placeholder, 'g'), 
          variables[key].default || ''
        );
      }
    });

    return processedContent;
  }

  validateVariables(variableValues = {}) {
    const errors = [];
    const variables = this.getVariables();

    Object.keys(variables).forEach(key => {
      const variable = variables[key];
      const value = variableValues[key];

      if (variable.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required variable '${key}' is missing`);
        return;
      }

      if (value !== undefined) {
        // Type validation
        switch (variable.type) {
          case 'number':
            if (isNaN(value)) {
              errors.push(`Variable '${key}' must be a number`);
            }
            break;
          case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              errors.push(`Variable '${key}' must be a valid email address`);
            }
            break;
          case 'url':
            try {
              new URL(value);
            } catch {
              errors.push(`Variable '${key}' must be a valid URL`);
            }
            break;
          case 'date':
            if (isNaN(Date.parse(value))) {
              errors.push(`Variable '${key}' must be a valid date`);
            }
            break;
        }

        // Length validation
        if (variable.maxLength && value.length > variable.maxLength) {
          errors.push(`Variable '${key}' exceeds maximum length of ${variable.maxLength}`);
        }

        if (variable.minLength && value.length < variable.minLength) {
          errors.push(`Variable '${key}' is shorter than minimum length of ${variable.minLength}`);
        }
      }
    });

    return errors;
  }

  // Usage tracking
  async incrementUsageCount() {
    return await this.$query().patch({
      usage_count: this.usage_count + 1,
      last_used_at: new Date().toISOString()
    });
  }

  // Clone template
  async clone(newName, createdBy) {
    const clonedData = {
      name: newName,
      description: `Clone of ${this.name}`,
      category: this.category,
      content: this.content,
      media_attachments: this.media_attachments,
      inline_keyboard: this.inline_keyboard,
      variables: this.variables,
      created_by: createdBy,
      usage_count: 0
    };

    return await this.constructor.query().insert(clonedData);
  }

  // Preview generation
  generatePreview(variableValues = {}) {
    const processedContent = this.processTemplate(variableValues);
    
    return {
      content: processedContent,
      media_attachments: this.media_attachments,
      inline_keyboard: this.inline_keyboard,
      variables_used: Object.keys(variableValues),
      missing_variables: this.extractVariablesFromContent().filter(
        variable => !variableValues.hasOwnProperty(variable)
      )
    };
  }

  // Static methods
  static async findByCategory(category) {
    return this.query()
      .where('category', category)
      .orderBy('usage_count', 'desc')
      .orderBy('name', 'asc');
  }

  static async findByCreator(userId) {
    return this.query()
      .where('created_by', userId)
      .orderBy('created_at', 'desc');
  }

  static async findPopular(limit = 10) {
    return this.query()
      .orderBy('usage_count', 'desc')
      .orderBy('name', 'asc')
      .limit(limit);
  }

  static async findRecent(limit = 10) {
    return this.query()
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  static async searchTemplates(searchTerm) {
    return this.query()
      .where('name', 'like', `%${searchTerm}%`)
      .orWhere('description', 'like', `%${searchTerm}%`)
      .orWhere('content', 'like', `%${searchTerm}%`)
      .orderBy('usage_count', 'desc');
  }

  static async getCategoryStats() {
    const result = await this.query()
      .select('category')
      .count('* as count')
      .sum('usage_count as total_usage')
      .groupBy('category');
    
    return result.reduce((acc, row) => {
      acc[row.category] = {
        count: parseInt(row.count),
        total_usage: parseInt(row.total_usage)
      };
      return acc;
    }, {});
  }

  // Create from message
  static async createFromMessage(messageData, templateData) {
    return this.query().insert({
      name: templateData.name,
      description: templateData.description,
      category: templateData.category || 'custom',
      content: messageData.content,
      media_attachments: messageData.media_attachments,
      inline_keyboard: messageData.inline_keyboard,
      variables: templateData.variables || {},
      created_by: templateData.created_by,
      usage_count: 0
    });
  }
}

module.exports = MessageTemplate;