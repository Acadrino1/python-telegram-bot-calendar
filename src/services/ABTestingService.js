const BroadcastCampaign = require('../models/BroadcastCampaign');
const BroadcastMessage = require('../models/BroadcastMessage');
const BroadcastRecipient = require('../models/BroadcastRecipient');
const BroadcastAnalytics = require('../models/BroadcastAnalytics');
const logger = require('../utils/logger');

class ABTestingService {

  static async createABTest(campaignData, messageA, messageB, testConfig = {}) {
    try {
      const {
        split_ratio = 0.5,
        confidence_threshold = 0.95,
        minimum_sample_size = 100,
        test_duration_hours = 24,
        primary_metric = 'delivery_rate',
        secondary_metrics = ['click_rate', 'reply_rate']
      } = testConfig;

      // Create campaign with A/B test configuration
      const campaign = await BroadcastCampaign.query().insert({
        ...campaignData,
        type: 'ab_test',
        ab_test_config: {
          split_ratio,
          confidence_threshold,
          minimum_sample_size,
          test_duration_hours,
          primary_metric,
          secondary_metrics,
          started_at: null,
          winner_declared_at: null,
          winner_variant: null,
          statistical_significance: false
        }
      });

      // Create variant A message
      const variantA = await BroadcastMessage.query().insert({
        campaign_id: campaign.id,
        variant: 'A',
        ...messageA
      });

      // Create variant B message
      const variantB = await BroadcastMessage.query().insert({
        campaign_id: campaign.id,
        variant: 'B',
        ...messageB
      });

      logger.info(`A/B test campaign created: ${campaign.name} (ID: ${campaign.id})`);
      return { campaign, variantA, variantB };
    } catch (error) {
      logger.error('Error creating A/B test:', error);
      throw error;
    }
  }

  static async analyzeABTest(campaignId) {
    try {
      const campaign = await BroadcastCampaign.query()
        .findById(campaignId)
        .withGraphFetched('[messages, recipients]');

      if (!campaign || !campaign.isABTest()) {
        throw new Error('Campaign is not an A/B test');
      }

      const variantA = campaign.messages.find(m => m.variant === 'A');
      const variantB = campaign.messages.find(m => m.variant === 'B');

      if (!variantA || !variantB) {
        throw new Error('Both variants are required for A/B test analysis');
      }

      // Get recipients for each variant
      const recipientsA = campaign.recipients.filter(r => r.message_id === variantA.id);
      const recipientsB = campaign.recipients.filter(r => r.message_id === variantB.id);

      // Calculate basic metrics for each variant
      const metricsA = this.calculateVariantMetrics(recipientsA);
      const metricsB = this.calculateVariantMetrics(recipientsB);

      // Perform statistical significance test
      const primaryMetric = campaign.ab_test_config.primary_metric;
      const significance = this.calculateStatisticalSignificance(
        metricsA[primaryMetric],
        metricsB[primaryMetric],
        recipientsA.length,
        recipientsB.length
      );

      // Determine winner
      const winner = this.determineWinner(metricsA, metricsB, primaryMetric, significance);

      const results = {
        campaign_id: campaignId,
        variant_a: {
          recipients: recipientsA.length,
          metrics: metricsA
        },
        variant_b: {
          recipients: recipientsB.length,
          metrics: metricsB
        },
        statistical_significance: significance,
        winner: winner.variant,
        winner_confidence: winner.confidence,
        improvement: winner.improvement,
        primary_metric: primaryMetric,
        test_complete: significance.significant && 
                      (recipientsA.length + recipientsB.length) >= campaign.ab_test_config.minimum_sample_size
      };

      // Record A/B test analytics
      await BroadcastAnalytics.recordABTestMetrics(campaignId, results);

      // Update campaign if test is complete
      if (results.test_complete) {
        await this.updateCampaignWithWinner(campaign, results);
      }

      return results;
    } catch (error) {
      logger.error(`Error analyzing A/B test ${campaignId}:`, error);
      throw error;
    }
  }

  static calculateVariantMetrics(recipients) {
    const total = recipients.length;
    if (total === 0) {
      return {
        delivery_rate: 0,
        failure_rate: 0,
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0
      };
    }

    const sent = recipients.filter(r => ['sent', 'delivered'].includes(r.status)).length;
    const delivered = recipients.filter(r => r.status === 'delivered').length;
    const failed = recipients.filter(r => r.status === 'failed').length;

    return {
      delivery_rate: total > 0 ? (delivered / total) * 100 : 0,
      failure_rate: total > 0 ? (failed / total) * 100 : 0,
      sent_count: sent,
      delivered_count: delivered,
      failed_count: failed,
      total_recipients: total
    };
  }

  static calculateStatisticalSignificance(metricA, metricB, sampleA, sampleB) {
    if (sampleA < 30 || sampleB < 30) {
      return {
        significant: false,
        p_value: null,
        z_score: null,
        confidence_level: 0,
        message: 'Insufficient sample size for statistical analysis (minimum 30 per variant)'
      };
    }

    // Convert percentages to proportions
    const p1 = metricA / 100;
    const p2 = metricB / 100;
    
    // Calculate pooled proportion
    const pooled_p = (p1 * sampleA + p2 * sampleB) / (sampleA + sampleB);
    
    // Calculate standard error
    const se = Math.sqrt(pooled_p * (1 - pooled_p) * (1/sampleA + 1/sampleB));
    
    // Calculate z-score
    const z_score = (p1 - p2) / se;
    
    // Calculate two-tailed p-value
    const p_value = 2 * (1 - this.normalCDF(Math.abs(z_score)));
    
    // Determine significance levels
    const significant_95 = p_value < 0.05;
    const significant_99 = p_value < 0.01;
    
    let confidence_level = 0;
    if (significant_99) confidence_level = 0.99;
    else if (significant_95) confidence_level = 0.95;
    
    return {
      significant: significant_95,
      p_value,
      z_score,
      confidence_level,
      message: significant_95 
        ? `Statistically significant at ${confidence_level * 100}% confidence`
        : 'No statistically significant difference detected'
    };
  }

  static normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
    if (x > 0) prob = 1 - prob;
    return prob;
  }

  static determineWinner(metricsA, metricsB, primaryMetric, significance) {
    const valueA = metricsA[primaryMetric];
    const valueB = metricsB[primaryMetric];
    
    let winner, improvement;
    
    if (valueA > valueB) {
      winner = 'A';
      improvement = valueB > 0 ? ((valueA - valueB) / valueB) * 100 : 0;
    } else if (valueB > valueA) {
      winner = 'B';
      improvement = valueA > 0 ? ((valueB - valueA) / valueA) * 100 : 0;
    } else {
      winner = 'tie';
      improvement = 0;
    }
    
    return {
      variant: winner,
      confidence: significance.confidence_level,
      improvement: improvement
    };
  }

  static async updateCampaignWithWinner(campaign, results) {
    try {
      const updatedConfig = {
        ...campaign.ab_test_config,
        winner_declared_at: new Date().toISOString(),
        winner_variant: results.winner,
        statistical_significance: results.statistical_significance.significant,
        final_results: results
      };

      await campaign.$query().patch({
        ab_test_config: updatedConfig
      });

      logger.info(`A/B test winner declared for campaign ${campaign.id}: Variant ${results.winner}`);
    } catch (error) {
      logger.error(`Error updating campaign with A/B test winner:`, error);
      throw error;
    }
  }

  static async getRecommendations(campaignId) {
    try {
      const results = await this.analyzeABTest(campaignId);
      const recommendations = [];

      if (!results.test_complete) {
        const totalRecipients = results.variant_a.recipients + results.variant_b.recipients;
        const campaign = await BroadcastCampaign.query().findById(campaignId);
        const remainingSamples = campaign.ab_test_config.minimum_sample_size - totalRecipients;
        
        if (remainingSamples > 0) {
          recommendations.push({
            type: 'sample_size',
            priority: 'high',
            message: `Need ${remainingSamples} more recipients to reach minimum sample size`,
            action: 'increase_audience'
          });
        }
        
        if (!results.statistical_significance.significant) {
          recommendations.push({
            type: 'significance',
            priority: 'medium',
            message: 'No statistically significant difference detected yet',
            action: 'continue_test'
          });
        }
      } else {
        if (results.winner !== 'tie') {
          const winnerVariant = results.winner;
          const improvement = results.improvement.toFixed(1);
          
          recommendations.push({
            type: 'winner',
            priority: 'high',
            message: `Variant ${winnerVariant} is the winner with ${improvement}% improvement`,
            action: 'use_winning_variant'
          });
        } else {
          recommendations.push({
            type: 'tie',
            priority: 'medium',
            message: 'Both variants performed similarly',
            action: 'choose_based_on_cost_or_preference'
          });
        }
      }

      // Performance recommendations
      if (results.variant_a.metrics.failure_rate > 10 || results.variant_b.metrics.failure_rate > 10) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: 'High failure rate detected. Check message content and targeting',
          action: 'review_message_content'
        });
      }

      return {
        campaign_id: campaignId,
        test_results: results,
        recommendations
      };
    } catch (error) {
      logger.error(`Error generating A/B test recommendations:`, error);
      throw error;
    }
  }

  static async exportResults(campaignId, format = 'json') {
    try {
      const results = await this.analyzeABTest(campaignId);
      const campaign = await BroadcastCampaign.query().findById(campaignId);
      
      const exportData = {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          created_at: campaign.created_at
        },
        test_configuration: campaign.ab_test_config,
        results,
        export_date: new Date().toISOString()
      };

      switch (format) {
        case 'csv':
          return this.convertToCSV(exportData);
        case 'json':
        default:
          return JSON.stringify(exportData, null, 2);
      }
    } catch (error) {
      logger.error(`Error exporting A/B test results:`, error);
      throw error;
    }
  }

  static convertToCSV(data) {
    const headers = [
      'Campaign ID', 'Campaign Name', 'Variant', 'Recipients', 
      'Delivery Rate', 'Failure Rate', 'Winner', 'Improvement', 'Significant'
    ];
    
    const rows = [
      [
        data.campaign.id,
        data.campaign.name,
        'A',
        data.results.variant_a.recipients,
        data.results.variant_a.metrics.delivery_rate,
        data.results.variant_a.metrics.failure_rate,
        data.results.winner === 'A' ? 'Yes' : 'No',
        data.results.winner === 'A' ? data.results.improvement : 0,
        data.results.statistical_significance.significant ? 'Yes' : 'No'
      ],
      [
        data.campaign.id,
        data.campaign.name,
        'B',
        data.results.variant_b.recipients,
        data.results.variant_b.metrics.delivery_rate,
        data.results.variant_b.metrics.failure_rate,
        data.results.winner === 'B' ? 'Yes' : 'No',
        data.results.winner === 'B' ? data.results.improvement : 0,
        data.results.statistical_significance.significant ? 'Yes' : 'No'
      ]
    ];
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

module.exports = ABTestingService;