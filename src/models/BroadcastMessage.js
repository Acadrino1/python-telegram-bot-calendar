const { Model } = require('objection');

class BroadcastMessage extends Model {
  static get tableName() {
    return 'broadcast_messages';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['campaign_id', 'content'],
      properties: {
        id: { type: 'integer' },
        campaign_id: { type: 'integer' },
        variant: { type: 'string', maxLength: 50 },
        content: { type: 'string', minLength: 1 },
        media_attachments: { type: 'object' },
        inline_keyboard: { type: 'object' },
        parse_mode: { 
          type: 'string', 
          enum: ['HTML', 'Markdown', 'MarkdownV2'] 
        },
        disable_web_page_preview: { type: 'boolean' },
        disable_notification: { type: 'boolean' },
        reply_to_message_id: { type: 'integer' }
      }
    };
  }

  static get relationMappings() {
    const BroadcastCampaign = require('./BroadcastCampaign');
    const BroadcastRecipient = require('./BroadcastRecipient');

    return {
      campaign: {
        relation: Model.BelongsToOneRelation,
        modelClass: BroadcastCampaign,
        join: {
          from: 'broadcast_messages.campaign_id',
          to: 'broadcast_campaigns.id'
        }
      },

      recipients: {
        relation: Model.HasManyRelation,
        modelClass: BroadcastRecipient,
        join: {
          from: 'broadcast_messages.id',
          to: 'broadcast_recipients.message_id'
        }
      }
    };
  }

  // Message type checks
  hasMedia() {
    return this.media_attachments && Object.keys(this.media_attachments).length > 0;
  }

  hasInlineKeyboard() {
    return this.inline_keyboard && this.inline_keyboard.length > 0;
  }

  isVariantA() {
    return this.variant === 'A';
  }

  isVariantB() {
    return this.variant === 'B';
  }

  // Message formatting
  getTelegramMessage() {
    const message = {
      text: this.content,
      parse_mode: this.parse_mode
    };

    if (this.disable_web_page_preview) {
      message.disable_web_page_preview = true;
    }

    if (this.disable_notification) {
      message.disable_notification = true;
    }

    if (this.hasInlineKeyboard()) {
      message.reply_markup = {
        inline_keyboard: this.inline_keyboard
      };
    }

    if (this.reply_to_message_id) {
      message.reply_to_message_id = this.reply_to_message_id;
    }

    return message;
  }

  // Media handling
  getMediaGroup() {
    if (!this.hasMedia()) return null;

    const mediaGroup = [];
    const attachments = this.media_attachments;

    if (attachments.photos) {
      attachments.photos.forEach((photo, index) => {
        mediaGroup.push({
          type: 'photo',
          media: photo.file_id || photo.url,
          caption: index === 0 ? this.content : undefined,
          parse_mode: index === 0 ? this.parse_mode : undefined
        });
      });
    }

    if (attachments.videos) {
      attachments.videos.forEach((video, index) => {
        mediaGroup.push({
          type: 'video',
          media: video.file_id || video.url,
          caption: index === 0 && mediaGroup.length === 0 ? this.content : undefined,
          parse_mode: index === 0 && mediaGroup.length === 0 ? this.parse_mode : undefined
        });
      });
    }

    if (attachments.documents) {
      attachments.documents.forEach((doc, index) => {
        mediaGroup.push({
          type: 'document',
          media: doc.file_id || doc.url,
          caption: index === 0 && mediaGroup.length === 0 ? this.content : undefined,
          parse_mode: index === 0 && mediaGroup.length === 0 ? this.parse_mode : undefined
        });
      });
    }

    return mediaGroup.length > 0 ? mediaGroup : null;
  }

  // Content processing
  processTemplate(variables = {}) {
    let processedContent = this.content;

    // Replace template variables
    Object.keys(variables).forEach(key => {
      const placeholder = `{{${key}}}`;
      processedContent = processedContent.replace(
        new RegExp(placeholder, 'g'), 
        variables[key] || ''
      );
    });

    return processedContent;
  }

  // Validation
  async validateContent() {
    const errors = [];

    // Check content length (Telegram limit: 4096 characters)
    if (this.content.length > 4096) {
      errors.push('Message content exceeds 4096 characters limit');
    }

    // Validate parse mode
    if (this.parse_mode === 'HTML') {
      // Basic HTML validation
      const htmlTags = this.content.match(/<[^>]*>/g) || [];
      const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'a'];
      
      for (const tag of htmlTags) {
        const tagName = tag.replace(/<\/?([^>]+)>/g, '$1').split(' ')[0];
        if (!allowedTags.includes(tagName.toLowerCase())) {
          errors.push(`Invalid HTML tag: ${tag}`);
        }
      }
    }

    // Validate inline keyboard
    if (this.hasInlineKeyboard()) {
      this.inline_keyboard.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) {
          errors.push(`Inline keyboard row ${rowIndex} must be an array`);
          return;
        }

        row.forEach((button, buttonIndex) => {
          if (!button.text) {
            errors.push(`Button at row ${rowIndex}, position ${buttonIndex} missing text`);
          }

          const hasUrl = !!button.url;
          const hasCallbackData = !!button.callback_data;
          const hasInlineQuery = !!button.switch_inline_query;

          if (![hasUrl, hasCallbackData, hasInlineQuery].filter(Boolean).length === 1) {
            errors.push(`Button at row ${rowIndex}, position ${buttonIndex} must have exactly one action`);
          }
        });
      });
    }

    return errors;
  }

  // Static methods
  static async findByCampaign(campaignId) {
    return this.query()
      .where('campaign_id', campaignId)
      .orderBy('variant', 'asc');
  }

  static async findByVariant(campaignId, variant) {
    return this.query()
      .where('campaign_id', campaignId)
      .where('variant', variant)
      .first();
  }

  static async createFromTemplate(templateData, campaignId, variant = 'A') {
    return this.query().insert({
      campaign_id: campaignId,
      variant,
      content: templateData.content,
      media_attachments: templateData.media_attachments,
      inline_keyboard: templateData.inline_keyboard,
      parse_mode: templateData.parse_mode || 'HTML',
      disable_web_page_preview: templateData.disable_web_page_preview || false,
      disable_notification: templateData.disable_notification || false
    });
  }
}

module.exports = BroadcastMessage;