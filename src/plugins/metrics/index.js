const BasePlugin = require('../../core/BasePlugin');
const { EventEmitter } = require('events');

/**
 * MetricsPlugin - Advanced metrics collection and aggregation
 */
class MetricsPlugin extends BasePlugin {
  constructor(bot, config = {}) {
    super(bot, config);
    
    this.name = 'metrics';
    this.version = '1.0.0';
    this.description = 'Advanced metrics collection and aggregation';
    
    // Metrics storage
    this.metrics = {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      timers: new Map()
    };
    
    // Aggregation intervals
    this.intervals = {
      minute: [],
      hour: [],
      day: []
    };
    
    // Configuration
    this.retentionPeriod = config.retentionPeriod || {
      minute: 60,  // Keep 60 minutes of minute-level data
      hour: 24,    // Keep 24 hours of hour-level data
      day: 30      // Keep 30 days of day-level data
    };
    
    this.aggregationInterval = null;
    this.cleanupInterval = null;
  }
  
  async initialize() {
    try {
      // Setup metric collectors
      this.setupCollectors();
      
      // Start aggregation
      this.startAggregation();
      
      // Start cleanup process
      this.startCleanup();
      
      // Make metrics available to other plugins
      this.bot.metrics = this;
      
      this.logger.info('Metrics plugin initialized');
    } catch (error) {
      this.logger.error('Metrics plugin initialization error:', error);
      throw error;
    }
  }
  
  setupCollectors() {
    // Message metrics
    this.telegram.use(async (ctx, next) => {
      const start = Date.now();
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      
      try {
        // Increment counters
        this.increment('messages.total');
        
        if (ctx.message?.text?.startsWith('/')) {
          const command = ctx.message.text.split(' ')[0].slice(1);
          this.increment('commands.total');
          this.increment(`commands.${command}`);
        }
        
        if (ctx.callbackQuery) {
          this.increment('callbacks.total');
        }
        
        // Track unique users
        if (userId) {
          this.gauge('users.active', userId);
        }
        
        // Track chat types
        if (ctx.chat?.type) {
          this.increment(`chats.${ctx.chat.type}`);
        }
        
        await next();
        
        // Record processing time
        const duration = Date.now() - start;
        this.timing('processing.duration', duration);
        
      } catch (error) {
        this.increment('errors.total');
        this.increment(`errors.${error.constructor.name}`);
        throw error;
      }
    });
  }
  
  // Counter - incremental values
  increment(name, value = 1, tags = {}) {
    const key = this.getKey(name, tags);
    const current = this.metrics.counters.get(key) || 0;
    this.metrics.counters.set(key, current + value);
    
    // Record for aggregation
    this.recordMetric('counter', name, current + value, tags);
  }
  
  decrement(name, value = 1, tags = {}) {
    this.increment(name, -value, tags);
  }
  
  // Gauge - point-in-time values
  gauge(name, value, tags = {}) {
    const key = this.getKey(name, tags);
    
    if (typeof value === 'string' || typeof value === 'number') {
      // Track unique values
      let values = this.metrics.gauges.get(key);
      if (!values) {
        values = new Set();
        this.metrics.gauges.set(key, values);
      }
      values.add(value);
    } else {
      // Direct value
      this.metrics.gauges.set(key, value);
    }
    
    // Record for aggregation
    this.recordMetric('gauge', name, value, tags);
  }
  
  // Histogram - distribution of values
  histogram(name, value, tags = {}) {
    const key = this.getKey(name, tags);
    let values = this.metrics.histograms.get(key);
    
    if (!values) {
      values = [];
      this.metrics.histograms.set(key, values);
    }
    
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    // Record for aggregation
    this.recordMetric('histogram', name, value, tags);
  }
  
  // Timer - track durations
  timing(name, duration, tags = {}) {
    this.histogram(name, duration, tags);
  }
  
  startTimer(name, tags = {}) {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.timing(name, duration, tags);
      return duration;
    };
  }
  
  // Get metric key
  getKey(name, tags = {}) {
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return tagStr ? `${name}{${tagStr}}` : name;
  }
  
  // Record metric for aggregation
  recordMetric(type, name, value, tags = {}) {
    const timestamp = Date.now();
    const minute = Math.floor(timestamp / 60000) * 60000;
    
    this.intervals.minute.push({
      type,
      name,
      value,
      tags,
      timestamp,
      minute
    });
  }
  
  // Start aggregation process
  startAggregation() {
    // Aggregate every minute
    this.aggregationInterval = setInterval(() => {
      this.aggregateMinute();
    }, 60000);
  }
  
  aggregateMinute() {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000;
    const lastMinute = currentMinute - 60000;
    
    // Get metrics from last minute
    const minuteMetrics = this.intervals.minute.filter(m => 
      m.minute === lastMinute
    );
    
    if (minuteMetrics.length === 0) return;
    
    // Aggregate by metric name
    const aggregated = new Map();
    
    minuteMetrics.forEach(metric => {
      const key = this.getKey(metric.name, metric.tags);
      
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          type: metric.type,
          name: metric.name,
          tags: metric.tags,
          values: []
        });
      }
      
      aggregated.get(key).values.push(metric.value);
    });
    
    // Calculate aggregations
    const hourData = {
      timestamp: lastMinute,
      metrics: []
    };
    
    aggregated.forEach((data, key) => {
      const stats = this.calculateStats(data.values);
      
      hourData.metrics.push({
        key,
        type: data.type,
        name: data.name,
        tags: data.tags,
        ...stats
      });
    });
    
    this.intervals.hour.push(hourData);
    
    // Aggregate to day every hour
    if (this.intervals.hour.length >= 60) {
      this.aggregateHour();
    }
  }
  
  aggregateHour() {
    // Similar aggregation logic for hour -> day
    // Implementation omitted for brevity
  }
  
  // Calculate statistics
  calculateStats(values) {
    if (values.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }
    
    const numbers = values.filter(v => typeof v === 'number');
    
    if (numbers.length === 0) {
      // For non-numeric values, just count unique
      const unique = new Set(values);
      return { 
        count: values.length, 
        unique: unique.size,
        values: Array.from(unique).slice(0, 10) // Top 10
      };
    }
    
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = sum / numbers.length;
    const sorted = numbers.sort((a, b) => a - b);
    
    return {
      count: numbers.length,
      sum: sum,
      avg: Math.round(avg * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  
  // Start cleanup process
  startCleanup() {
    // Clean up old data every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 3600000);
  }
  
  cleanupOldData() {
    const now = Date.now();
    
    // Clean minute data
    const minuteCutoff = now - (this.retentionPeriod.minute * 60000);
    this.intervals.minute = this.intervals.minute.filter(m => 
      m.timestamp > minuteCutoff
    );
    
    // Clean hour data
    const hourCutoff = now - (this.retentionPeriod.hour * 3600000);
    this.intervals.hour = this.intervals.hour.filter(h => 
      h.timestamp > hourCutoff
    );
    
    // Clean day data
    const dayCutoff = now - (this.retentionPeriod.day * 86400000);
    this.intervals.day = this.intervals.day.filter(d => 
      d.timestamp > dayCutoff
    );
  }
  
  // Get current metrics
  getCurrentMetrics() {
    const result = {
      counters: {},
      gauges: {},
      histograms: {},
      summary: {}
    };
    
    // Process counters
    this.metrics.counters.forEach((value, key) => {
      result.counters[key] = value;
    });
    
    // Process gauges
    this.metrics.gauges.forEach((value, key) => {
      if (value instanceof Set) {
        result.gauges[key] = {
          unique: value.size,
          values: Array.from(value).slice(0, 10)
        };
      } else {
        result.gauges[key] = value;
      }
    });
    
    // Process histograms
    this.metrics.histograms.forEach((values, key) => {
      result.histograms[key] = this.calculateStats(values);
    });
    
    // Add summary
    result.summary = {
      totalMetrics: this.metrics.counters.size + 
                   this.metrics.gauges.size + 
                   this.metrics.histograms.size,
      dataPoints: this.intervals.minute.length,
      oldestData: this.intervals.minute[0]?.timestamp 
        ? new Date(this.intervals.minute[0].timestamp).toISOString()
        : null
    };
    
    return result;
  }
  
  // Get historical metrics
  getHistoricalMetrics(period = 'hour', duration = 24) {
    let data;
    
    switch (period) {
      case 'minute':
        data = this.intervals.minute.slice(-duration);
        break;
      case 'hour':
        data = this.intervals.hour.slice(-duration);
        break;
      case 'day':
        data = this.intervals.day.slice(-duration);
        break;
      default:
        data = [];
    }
    
    return data;
  }
  
  // Export metrics (Prometheus format)
  exportPrometheus() {
    const lines = [];
    
    // Counters
    this.metrics.counters.forEach((value, key) => {
      lines.push(`# TYPE ${key} counter`);
      lines.push(`${key} ${value}`);
    });
    
    // Gauges
    this.metrics.gauges.forEach((value, key) => {
      lines.push(`# TYPE ${key} gauge`);
      if (value instanceof Set) {
        lines.push(`${key} ${value.size}`);
      } else {
        lines.push(`${key} ${value}`);
      }
    });
    
    // Histograms
    this.metrics.histograms.forEach((values, key) => {
      const stats = this.calculateStats(values);
      lines.push(`# TYPE ${key} histogram`);
      lines.push(`${key}_count ${stats.count}`);
      lines.push(`${key}_sum ${stats.sum}`);
      lines.push(`${key}_min ${stats.min}`);
      lines.push(`${key}_max ${stats.max}`);
    });
    
    return lines.join('\n');
  }
  
  async cleanup() {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
  
  getHealth() {
    const dataPoints = this.intervals.minute.length;
    if (dataPoints === 0) return 'degraded';
    return 'healthy';
  }
  
  async getMetrics() {
    const baseMetrics = super.getMetrics();
    const current = this.getCurrentMetrics();
    
    return {
      ...baseMetrics,
      ...current.summary,
      topCounters: Object.entries(current.counters)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => ({ metric: k, value: v }))
    };
  }
}

module.exports = MetricsPlugin;