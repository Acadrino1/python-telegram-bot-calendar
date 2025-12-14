const BroadcastService = require('../services/BroadcastService');
const BroadcastCampaign = require('../models/BroadcastCampaign');
const BroadcastMessage = require('../models/BroadcastMessage');
const BroadcastRecipient = require('../models/BroadcastRecipient');
const MessageTemplate = require('../models/MessageTemplate');
const BroadcastAnalytics = require('../models/BroadcastAnalytics');
const logger = require('../utils/logger');
const { ValidationError } = require('objection');

class BroadcastController {
  constructor() {
    this.broadcastService = new BroadcastService();
    this.init();
  }

  async init() {
    await this.broadcastService.initialize();
  }

  // Campaign Management

  async getCampaigns(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        type, 
        creator, 
        search 
      } = req.query;
      
      let query = BroadcastCampaign.query()
        .withGraphFetched('[creator, messages, recipients(selectStatus)]')
        .modifiers({
          selectStatus: (builder) => builder.select('status').count('* as count').groupBy('status')
        });

      // Apply filters
      if (status) {
        query = query.where('status', status);
      }
      
      if (type) {
        query = query.where('type', type);
      }
      
      if (creator) {
        query = query.where('created_by', creator);
      }
      
      if (search) {
        query = query.where((builder) => {
          builder.where('name', 'like', `%${search}%`)
                 .orWhere('description', 'like', `%${search}%`);
        });
      }

      const campaigns = await query
        .page(parseInt(page) - 1, parseInt(limit))
        .orderBy('created_at', 'desc');

      res.json({
        success: true,
        data: campaigns.results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: campaigns.total
        }
      });
    } catch (error) {
      logger.error('Error fetching campaigns:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch campaigns'
      });
    }
  }

  async getCampaign(req, res) {
    try {
      const { id } = req.params;
      
      const campaign = await BroadcastCampaign.query()
        .findById(id)
        .withGraphFetched('[creator, messages, recipients]');

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const stats = await this.broadcastService.getCampaignStats(id);
      
      res.json({
        success: true,
        data: {
          ...campaign,
          stats
        }
      });
    } catch (error) {
      logger.error('Error fetching campaign:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch campaign'
      });
    }
  }

  async createCampaign(req, res) {
    try {
      const campaignData = {
        ...req.body,
        created_by: req.user.id
      };

      const campaign = await this.broadcastService.createCampaign(campaignData);
      
      res.status(201).json({
        success: true,
        data: campaign
      });
    } catch (error) {
      logger.error('Error creating campaign:', error);
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.data
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create campaign'
      });
    }
  }

  async updateCampaign(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const campaign = await BroadcastCampaign.query().findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      // Only allow updates if campaign is in draft status
      if (campaign.status !== 'draft') {
        return res.status(400).json({
          success: false,
          error: 'Only draft campaigns can be updated'
        });
      }

      const updatedCampaign = await BroadcastCampaign.query()
        .patchAndFetchById(id, updateData);

      res.json({
        success: true,
        data: updatedCampaign
      });
    } catch (error) {
      logger.error('Error updating campaign:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update campaign'
      });
    }
  }

  async deleteCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BroadcastCampaign.query().findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      // Only allow deletion of draft or cancelled campaigns
      if (!['draft', 'cancelled'].includes(campaign.status)) {
        return res.status(400).json({
          success: false,
          error: 'Only draft or cancelled campaigns can be deleted'
        });
      }

      await BroadcastCampaign.query().deleteById(id);

      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting campaign:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete campaign'
      });
    }
  }

  async scheduleCampaign(req, res) {
    try {
      const { id } = req.params;
      const { scheduled_at } = req.body;

      const result = await this.broadcastService.scheduleCampaign(id, scheduled_at);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error scheduling campaign:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async pauseCampaign(req, res) {
    try {
      const { id } = req.params;
      
      const campaign = await this.broadcastService.pauseCampaign(id);
      
      res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      logger.error('Error pausing campaign:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async resumeCampaign(req, res) {
    try {
      const { id } = req.params;
      
      const campaign = await this.broadcastService.resumeCampaign(id);
      
      res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      logger.error('Error resuming campaign:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async cancelCampaign(req, res) {
    try {
      const { id } = req.params;
      
      const campaign = await this.broadcastService.cancelCampaign(id);
      
      res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      logger.error('Error cancelling campaign:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  // Message Management

  async addMessage(req, res) {
    try {
      const { campaignId } = req.params;
      const messageData = req.body;

      const message = await this.broadcastService.addMessageToCampaign(campaignId, messageData);
      
      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error) {
      logger.error('Error adding message to campaign:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async createMessageFromTemplate(req, res) {
    try {
      const { campaignId, templateId } = req.params;
      const { variable_values, variant } = req.body;

      const message = await this.broadcastService.createMessageFromTemplate(
        campaignId, 
        templateId, 
        variable_values, 
        variant
      );
      
      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error) {
      logger.error('Error creating message from template:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async previewMessage(req, res) {
    try {
      const { id } = req.params;
      
      const message = await BroadcastMessage.query().findById(id);
      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'Message not found'
        });
      }

      const preview = {
        telegram_message: message.getTelegramMessage(),
        media_group: message.getMediaGroup(),
        validation_errors: await message.validateContent()
      };

      res.json({
        success: true,
        data: preview
      });
    } catch (error) {
      logger.error('Error previewing message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to preview message'
      });
    }
  }

  // Template Management

  async getTemplates(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        category, 
        search,
        creator 
      } = req.query;
      
      let query = MessageTemplate.query()
        .withGraphFetched('creator');

      if (category) {
        query = query.where('category', category);
      }
      
      if (creator) {
        query = query.where('created_by', creator);
      }
      
      if (search) {
        query = query.where((builder) => {
          builder.where('name', 'like', `%${search}%`)
                 .orWhere('description', 'like', `%${search}%`)
                 .orWhere('content', 'like', `%${search}%`);
        });
      }

      const templates = await query
        .page(parseInt(page) - 1, parseInt(limit))
        .orderBy('usage_count', 'desc');

      res.json({
        success: true,
        data: templates.results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: templates.total
        }
      });
    } catch (error) {
      logger.error('Error fetching templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch templates'
      });
    }
  }

  async createTemplate(req, res) {
    try {
      const templateData = {
        ...req.body,
        created_by: req.user.id
      };

      const template = await MessageTemplate.query().insert(templateData);
      
      res.status(201).json({
        success: true,
        data: template
      });
    } catch (error) {
      logger.error('Error creating template:', error);
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.data
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create template'
      });
    }
  }

  async previewTemplate(req, res) {
    try {
      const { id } = req.params;
      const { variable_values = {} } = req.body;
      
      const template = await MessageTemplate.query().findById(id);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      const preview = template.generatePreview(variable_values);
      const variables = template.getVariables();

      res.json({
        success: true,
        data: {
          preview,
          variables
        }
      });
    } catch (error) {
      logger.error('Error previewing template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to preview template'
      });
    }
  }

  // Analytics

  async getCampaignAnalytics(req, res) {
    try {
      const { id } = req.params;
      const { timeframe = '24h', metrics } = req.query;
      
      const analytics = await BroadcastAnalytics.getCampaignMetrics(id);
      
      if (metrics) {
        const requestedMetrics = metrics.split(',');
        const filteredAnalytics = {};
        requestedMetrics.forEach(metric => {
          if (analytics[metric]) {
            filteredAnalytics[metric] = analytics[metric];
          }
        });
        
        return res.json({
          success: true,
          data: filteredAnalytics
        });
      }
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error('Error fetching campaign analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics'
      });
    }
  }

  async getDeliveryStats(req, res) {
    try {
      const { id } = req.params;
      
      const stats = await BroadcastRecipient.getDeliveryStats(id);
      const statusCounts = await BroadcastRecipient.getStatusCounts(id);
      
      res.json({
        success: true,
        data: {
          delivery_stats: stats,
          status_counts: statusCounts
        }
      });
    } catch (error) {
      logger.error('Error fetching delivery stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch delivery stats'
      });
    }
  }

  async getFailedRecipients(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const failedRecipients = await BroadcastRecipient.query()
        .where('campaign_id', id)
        .where('status', 'failed')
        .withGraphFetched('[user, message]')
        .page(parseInt(page) - 1, parseInt(limit))
        .orderBy('sent_at', 'desc');
      
      res.json({
        success: true,
        data: failedRecipients.results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: failedRecipients.total
        }
      });
    } catch (error) {
      logger.error('Error fetching failed recipients:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch failed recipients'
      });
    }
  }

  async retryFailedMessages(req, res) {
    try {
      const { id } = req.params;
      const { recipient_ids } = req.body;
      
      let query = BroadcastRecipient.query()
        .where('campaign_id', id)
        .where('status', 'failed');
      
      if (recipient_ids && recipient_ids.length > 0) {
        query = query.whereIn('id', recipient_ids);
      }
      
      const failedRecipients = await query;
      let retriedCount = 0;
      
      for (const recipient of failedRecipients) {
        if (recipient.canRetry()) {
          await recipient.scheduleRetry();
          retriedCount++;
        }
      }
      
      res.json({
        success: true,
        data: {
          total_failed: failedRecipients.length,
          retried_count: retriedCount
        }
      });
    } catch (error) {
      logger.error('Error retrying failed messages:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry messages'
      });
    }
  }

  async getHealthStatus(req, res) {
    try {
      const status = this.broadcastService.getHealthStatus();
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error fetching health status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch health status'
      });
    }
  }
}

module.exports = BroadcastController;