const { Model } = require('objection');

class BroadcastAnalytics extends Model {
  static get tableName() {
    return 'broadcast_analytics';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['campaign_id', 'metric_name', 'metric_value'],
      properties: {
        id: { type: 'integer' },
        campaign_id: { type: 'integer' },
        metric_name: { type: 'string', maxLength: 100 },
        metric_value: { type: 'string', maxLength: 255 },
        metadata: { type: 'object' },
        recorded_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  static get relationMappings() {
    const BroadcastCampaign = require('./BroadcastCampaign');

    return {
      campaign: {
        relation: Model.BelongsToOneRelation,
        modelClass: BroadcastCampaign,
        join: {
          from: 'broadcast_analytics.campaign_id',
          to: 'broadcast_campaigns.id'
        }
      }
    };
  }

  // Value getters with type conversion
  getNumericValue() {
    const value = parseFloat(this.metric_value);
    return isNaN(value) ? 0 : value;
  }

  getIntegerValue() {
    const value = parseInt(this.metric_value);
    return isNaN(value) ? 0 : value;
  }

  getBooleanValue() {
    return this.metric_value === 'true' || this.metric_value === '1';
  }

  getDateValue() {
    return new Date(this.metric_value);
  }

  // Metric type checks
  isDeliveryMetric() {
    const deliveryMetrics = [
      'total_sent', 'total_delivered', 'total_failed', 
      'delivery_rate', 'failure_rate', 'avg_delivery_time'
    ];
    return deliveryMetrics.includes(this.metric_name);
  }

  isEngagementMetric() {
    const engagementMetrics = [
      'total_clicks', 'unique_clicks', 'click_rate',
      'total_replies', 'unique_replies', 'reply_rate'
    ];
    return engagementMetrics.includes(this.metric_name);
  }

  isPerformanceMetric() {
    const performanceMetrics = [
      'send_rate', 'queue_processing_time', 'avg_send_time',
      'rate_limit_hits', 'api_errors'
    ];
    return performanceMetrics.includes(this.metric_name);
  }

  isABTestMetric() {
    const abTestMetrics = [
      'variant_a_rate', 'variant_b_rate', 'winner_variant',
      'confidence_level', 'statistical_significance'
    ];
    return abTestMetrics.includes(this.metric_name);
  }

  // Static methods for recording metrics
  static async recordMetric(campaignId, metricName, metricValue, metadata = {}) {
    return this.query().insert({
      campaign_id: campaignId,
      metric_name: metricName,
      metric_value: metricValue.toString(),
      metadata,
      recorded_at: new Date().toISOString()
    });
  }

  static async recordBulkMetrics(campaignId, metrics) {
    const records = Object.entries(metrics).map(([name, value]) => ({
      campaign_id: campaignId,
      metric_name: name,
      metric_value: value.toString(),
      metadata: {},
      recorded_at: new Date().toISOString()
    }));

    return this.query().insert(records);
  }

  // Delivery metrics
  static async recordDeliveryMetrics(campaignId, stats) {
    const metrics = {
      total_sent: stats.sent_count || 0,
      total_delivered: stats.delivered_count || 0,
      total_failed: stats.failed_count || 0,
      delivery_rate: stats.delivery_rate || 0,
      failure_rate: stats.failure_rate || 0
    };

    if (stats.avg_delivery_time) {
      metrics.avg_delivery_time = stats.avg_delivery_time;
    }

    return this.recordBulkMetrics(campaignId, metrics);
  }

  // Engagement metrics
  static async recordEngagementMetrics(campaignId, stats) {
    const metrics = {
      total_clicks: stats.total_clicks || 0,
      unique_clicks: stats.unique_clicks || 0,
      click_rate: stats.click_rate || 0
    };

    if (stats.total_replies) {
      metrics.total_replies = stats.total_replies;
      metrics.unique_replies = stats.unique_replies || 0;
      metrics.reply_rate = stats.reply_rate || 0;
    }

    return this.recordBulkMetrics(campaignId, metrics);
  }

  // Performance metrics
  static async recordPerformanceMetrics(campaignId, stats) {
    const metrics = {
      send_rate: stats.messages_per_second || 0,
      queue_processing_time: stats.queue_processing_time || 0,
      avg_send_time: stats.avg_send_time || 0,
      rate_limit_hits: stats.rate_limit_hits || 0,
      api_errors: stats.api_errors || 0
    };

    return this.recordBulkMetrics(campaignId, metrics);
  }

  // A/B testing metrics
  static async recordABTestMetrics(campaignId, results) {
    const metrics = {
      variant_a_rate: results.variant_a_rate || 0,
      variant_b_rate: results.variant_b_rate || 0,
      winner_variant: results.winner || 'none',
      confidence_level: results.confidence_level || 0,
      statistical_significance: results.significant ? 'true' : 'false'
    };

    return this.recordBulkMetrics(campaignId, metrics);
  }

  // Query methods
  static async getCampaignMetrics(campaignId) {
    const result = await this.query()
      .where('campaign_id', campaignId)
      .orderBy('recorded_at', 'desc');

    return result.reduce((acc, record) => {
      if (!acc[record.metric_name]) {
        acc[record.metric_name] = [];
      }
      acc[record.metric_name].push({
        value: record.metric_value,
        metadata: record.metadata,
        recorded_at: record.recorded_at
      });
      return acc;
    }, {});
  }

  static async getLatestMetrics(campaignId) {
    const subquery = this.query()
      .where('campaign_id', campaignId)
      .select('metric_name')
      .max('recorded_at as latest_recorded_at')
      .groupBy('metric_name');

    const result = await this.query()
      .where('campaign_id', campaignId)
      .joinRaw(`
        INNER JOIN (${subquery.toKnexQuery()}) latest 
        ON broadcast_analytics.metric_name = latest.metric_name 
        AND broadcast_analytics.recorded_at = latest.latest_recorded_at
      `);

    return result.reduce((acc, record) => {
      acc[record.metric_name] = {
        value: record.metric_value,
        metadata: record.metadata,
        recorded_at: record.recorded_at
      };
      return acc;
    }, {});
  }

  static async getMetricHistory(campaignId, metricName, timeframe = '24h') {
    let since = new Date();
    
    switch (timeframe) {
      case '1h':
        since.setHours(since.getHours() - 1);
        break;
      case '24h':
        since.setDate(since.getDate() - 1);
        break;
      case '7d':
        since.setDate(since.getDate() - 7);
        break;
      case '30d':
        since.setDate(since.getDate() - 30);
        break;
    }

    return this.query()
      .where('campaign_id', campaignId)
      .where('metric_name', metricName)
      .where('recorded_at', '>=', since.toISOString())
      .orderBy('recorded_at', 'asc');
  }

  static async getMetricsSummary(campaignIds = []) {
    let query = this.query()
      .select('metric_name')
      .count('* as record_count')
      .min('recorded_at as first_recorded')
      .max('recorded_at as last_recorded');

    if (campaignIds.length > 0) {
      query = query.whereIn('campaign_id', campaignIds);
    }

    const result = await query.groupBy('metric_name');

    return result.reduce((acc, record) => {
      acc[record.metric_name] = {
        record_count: parseInt(record.record_count),
        first_recorded: record.first_recorded,
        last_recorded: record.last_recorded
      };
      return acc;
    }, {});
  }

  // Aggregation methods
  static async getAverageMetric(campaignId, metricName) {
    const result = await this.query()
      .where('campaign_id', campaignId)
      .where('metric_name', metricName)
      .avg('metric_value as avg_value')
      .first();

    return result ? parseFloat(result.avg_value) : 0;
  }

  static async getTotalMetric(campaignId, metricName) {
    const result = await this.query()
      .where('campaign_id', campaignId)
      .where('metric_name', metricName)
      .sum('metric_value as total_value')
      .first();

    return result ? parseFloat(result.total_value) : 0;
  }

  static async getMetricTrend(campaignId, metricName, periods = 10) {
    return this.query()
      .where('campaign_id', campaignId)
      .where('metric_name', metricName)
      .orderBy('recorded_at', 'desc')
      .limit(periods);
  }
}

module.exports = BroadcastAnalytics;