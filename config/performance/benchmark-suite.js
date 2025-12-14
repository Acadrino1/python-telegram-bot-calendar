const { performance, PerformanceObserver } = require('perf_hooks');
const EventEmitter = require('events');
const logger = require('../../src/utils/logger');
const prometheus = require('../monitoring/prometheus');

class PerformanceBenchmarkSuite extends EventEmitter {
  constructor() {
    super();
    this.benchmarks = new Map();
    this.results = new Map();
    this.observers = new Map();
    this.isRunning = false;
    
    this.thresholds = {
      // Telegram Bot Performance Thresholds
      callbackQueryResponse: { target: 100, warning: 150, critical: 300 }, // ms
      messageProcessing: { target: 200, warning: 500, critical: 1000 },
      botStartup: { target: 5000, warning: 10000, critical: 15000 },
      
      // Database Performance Thresholds
      simpleQuery: { target: 10, warning: 50, critical: 200 },
      complexQuery: { target: 100, warning: 500, critical: 1000 },
      bulkInsert: { target: 500, warning: 1000, critical: 2000 },
      
      // Redis Performance Thresholds
      cacheGet: { target: 1, warning: 5, critical: 20 },
      cacheSet: { target: 2, warning: 10, critical: 50 },
      sessionLookup: { target: 5, warning: 20, critical: 100 },
      
      // API Performance Thresholds
      httpResponse: { target: 100, warning: 500, critical: 2000 },
      appointmentBooking: { target: 1000, warning: 3000, critical: 5000 },
      userRegistration: { target: 500, warning: 1500, critical: 3000 },
      
      // System Resource Thresholds
      memoryUsage: { target: 100, warning: 300, critical: 500 }, // MB
      cpuUsage: { target: 50, warning: 75, critical: 90 }, // %
      concurrentUsers: { target: 100, warning: 500, critical: 1000 }
    };

    this.setupPerformanceObservers();
  }

  setupPerformanceObservers() {
    // Observe HTTP requests
    const httpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('http_request', entry.duration, {
          name: entry.name,
          method: entry.detail?.method || 'unknown'
        });
      }
    });
    httpObserver.observe({ entryTypes: ['measure'] });
    this.observers.set('http', httpObserver);

    // Observe database operations
    const dbObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('database_operation', entry.duration, {
          operation: entry.detail?.operation || 'query',
          table: entry.detail?.table || 'unknown'
        });
      }
    });
    dbObserver.observe({ entryTypes: ['measure'] });
    this.observers.set('database', dbObserver);
  }

  // Core benchmark registration and execution
  registerBenchmark(name, benchmarkFn, options = {}) {
    this.benchmarks.set(name, {
      name,
      fn: benchmarkFn,
      iterations: options.iterations || 10,
      warmup: options.warmup || 3,
      timeout: options.timeout || 30000,
      tags: options.tags || [],
      threshold: options.threshold || this.thresholds[name] || { target: 1000, warning: 2000, critical: 5000 }
    });
    
    logger.debug(`Registered benchmark: ${name}`);
  }

  async runBenchmark(name) {
    const benchmark = this.benchmarks.get(name);
    if (!benchmark) {
      throw new Error(`Benchmark '${name}' not found`);
    }

    logger.info(`Starting benchmark: ${name}`);
    const results = {
      name,
      iterations: [],
      warmup: [],
      stats: {},
      status: 'running',
      startTime: Date.now()
    };

    try {
      // Warmup phase
      logger.debug(`Warming up benchmark: ${name} (${benchmark.warmup} iterations)`);
      for (let i = 0; i < benchmark.warmup; i++) {
        const start = performance.now();
        await Promise.race([
          benchmark.fn(),
          this.timeoutPromise(benchmark.timeout)
        ]);
        const duration = performance.now() - start;
        results.warmup.push(duration);
      }

      // Main benchmark phase
      logger.debug(`Running benchmark: ${name} (${benchmark.iterations} iterations)`);
      for (let i = 0; i < benchmark.iterations; i++) {
        const start = performance.now();
        performance.mark(`${name}-start-${i}`);
        
        await Promise.race([
          benchmark.fn(),
          this.timeoutPromise(benchmark.timeout)
        ]);
        
        performance.mark(`${name}-end-${i}`);
        const duration = performance.now() - start;
        results.iterations.push(duration);
        
        // Emit progress event
        this.emit('progress', {
          benchmark: name,
          iteration: i + 1,
          total: benchmark.iterations,
          duration
        });

        // Small delay between iterations to avoid overwhelming the system
        await this.delay(10);
      }

      // Calculate statistics
      results.stats = this.calculateStats(results.iterations);
      results.warmupStats = this.calculateStats(results.warmup);
      results.status = this.evaluatePerformance(results.stats, benchmark.threshold);
      results.endTime = Date.now();
      results.totalDuration = results.endTime - results.startTime;

      this.results.set(name, results);
      
      // Record metrics for monitoring
      this.recordBenchmarkMetrics(name, results);
      
      logger.info(`Completed benchmark: ${name}`, {
        mean: results.stats.mean.toFixed(2),
        status: results.status
      });

      this.emit('completed', { name, results });
      return results;

    } catch (error) {
      results.status = 'error';
      results.error = error.message;
      results.endTime = Date.now();
      
      logger.error(`Benchmark failed: ${name}`, error);
      this.emit('error', { name, error });
      
      return results;
    }
  }

  async runAllBenchmarks(tags = []) {
    if (this.isRunning) {
      throw new Error('Benchmark suite is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results = new Map();

    try {
      logger.info('Starting performance benchmark suite');
      this.emit('suiteStart');

      // Filter benchmarks by tags if specified
      const benchmarksToRun = Array.from(this.benchmarks.values()).filter(b => 
        tags.length === 0 || tags.some(tag => b.tags.includes(tag))
      );

      logger.info(`Running ${benchmarksToRun.length} benchmarks`);

      // Run benchmarks sequentially to avoid interference
      for (const benchmark of benchmarksToRun) {
        const result = await this.runBenchmark(benchmark.name);
        results.set(benchmark.name, result);

        // Delay between benchmarks
        await this.delay(1000);
      }

      const suiteResults = {
        totalBenchmarks: benchmarksToRun.length,
        passed: Array.from(results.values()).filter(r => r.status === 'passed').length,
        warnings: Array.from(results.values()).filter(r => r.status === 'warning').length,
        failed: Array.from(results.values()).filter(r => r.status === 'failed' || r.status === 'error').length,
        duration: Date.now() - startTime,
        results: Object.fromEntries(results)
      };

      logger.info('Benchmark suite completed', suiteResults);
      this.emit('suiteComplete', suiteResults);
      
      return suiteResults;

    } finally {
      this.isRunning = false;
    }
  }

  // Specific benchmark implementations
  registerDefaultBenchmarks() {
    // Telegram Bot benchmarks
    this.registerBenchmark('callback_query_processing', async () => {
      const mockCallbackQuery = {
        id: 'test_callback',
        from: { id: 12345, username: 'testuser' },
        message: { message_id: 1, chat: { id: 12345 } },
        data: 'select_service_1'
      };
      
      // Simulate callback query processing
      const start = performance.now();
      await this.simulateCallbackProcessing(mockCallbackQuery);
      return performance.now() - start;
    }, { 
      iterations: 50, 
      tags: ['telegram', 'bot', 'callback'],
      threshold: this.thresholds.callbackQueryResponse 
    });

    // Database benchmarks
    this.registerBenchmark('database_user_lookup', async () => {
      // Simulate database user lookup
      const start = performance.now();
      await this.simulateUserLookup(12345);
      return performance.now() - start;
    }, { 
      iterations: 100, 
      tags: ['database', 'query'],
      threshold: this.thresholds.simpleQuery 
    });

    // Redis benchmarks
    this.registerBenchmark('redis_session_get', async () => {
      const start = performance.now();
      await this.simulateRedisGet('session:12345');
      return performance.now() - start;
    }, { 
      iterations: 200, 
      tags: ['redis', 'cache'],
      threshold: this.thresholds.cacheGet 
    });

    // Appointment booking benchmark
    this.registerBenchmark('appointment_booking_flow', async () => {
      const mockBookingData = {
        userId: 12345,
        serviceId: 1,
        date: '2025-01-15',
        time: '10:00'
      };
      
      const start = performance.now();
      await this.simulateBookingFlow(mockBookingData);
      return performance.now() - start;
    }, { 
      iterations: 20, 
      tags: ['booking', 'flow', 'integration'],
      threshold: this.thresholds.appointmentBooking 
    });

    // Memory usage benchmark
    this.registerBenchmark('memory_usage_simulation', async () => {
      const before = process.memoryUsage();
      
      // Simulate memory-intensive operation
      await this.simulateMemoryIntensiveOperation();
      
      const after = process.memoryUsage();
      return (after.heapUsed - before.heapUsed) / 1024 / 1024; // MB
    }, { 
      iterations: 10, 
      tags: ['memory', 'system'],
      threshold: this.thresholds.memoryUsage 
    });
  }

  // Simulation methods for benchmarks
  async simulateCallbackProcessing(callbackQuery) {
    // Simulate callback query processing time
    await this.delay(Math.random() * 50 + 25); // 25-75ms
    
    // Simulate database lookup
    await this.delay(Math.random() * 20 + 5); // 5-25ms
    
    // Simulate response preparation
    await this.delay(Math.random() * 30 + 10); // 10-40ms
  }

  async simulateUserLookup(userId) {
    // Simulate database query time
    await this.delay(Math.random() * 15 + 5); // 5-20ms
  }

  async simulateRedisGet(key) {
    // Simulate Redis get operation
    await this.delay(Math.random() * 3 + 1); // 1-4ms
  }

  async simulateBookingFlow(bookingData) {
    // Simulate complete booking flow
    await this.delay(50); // User validation
    await this.delay(100); // Availability check
    await this.delay(200); // Database insert
    await this.delay(150); // Notification sending
    await this.delay(75); // Cache update
  }

  async simulateMemoryIntensiveOperation() {
    // Create and manipulate large arrays to test memory usage
    const largeArray = new Array(100000).fill(0).map((_, i) => ({
      id: i,
      data: Math.random().toString(36),
      timestamp: Date.now()
    }));
    
    // Process the array
    const processed = largeArray
      .filter(item => item.id % 2 === 0)
      .map(item => ({ ...item, processed: true }));
    
    await this.delay(100);
    
    // Cleanup to help GC
    largeArray.length = 0;
    processed.length = 0;
  }

  // Statistics calculation
  calculateStats(values) {
    if (values.length === 0) return {};

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stdDev: this.calculateStdDev(values, sum / values.length)
    };
  }

  calculateStdDev(values, mean) {
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  evaluatePerformance(stats, threshold) {
    if (stats.mean <= threshold.target) return 'passed';
    if (stats.mean <= threshold.warning) return 'warning';
    if (stats.mean <= threshold.critical) return 'failed';
    return 'critical';
  }

  recordMetric(name, duration, tags = {}) {
    // Record to Prometheus if available
    if (prometheus.track.databaseQuery) {
      prometheus.track.databaseQuery(
        tags.operation || 'benchmark',
        tags.table || 'test',
        'success',
        duration / 1000 // Convert to seconds
      );
    }
  }

  recordBenchmarkMetrics(name, results) {
    // Record benchmark results to monitoring system
    if (prometheus.metrics.systemHealth) {
      const score = results.status === 'passed' ? 1 : 
                   results.status === 'warning' ? 0.7 : 
                   results.status === 'failed' ? 0.3 : 0;
      
      prometheus.update.systemHealth(`benchmark_${name}`, score);
    }
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  timeoutPromise(ms) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Benchmark timeout')), ms)
    );
  }

  // Report generation
  generateReport(format = 'json') {
    const results = Array.from(this.results.values());
    
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }
    
    if (format === 'markdown') {
      return this.generateMarkdownReport(results);
    }
    
    return results;
  }

  generateMarkdownReport(results) {
    let markdown = '# Performance Benchmark Report\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n\n`;
    
    markdown += '## Summary\n\n';
    markdown += '| Benchmark | Status | Mean (ms) | P95 (ms) | P99 (ms) |\n';
    markdown += '|-----------|--------|-----------|----------|----------|\n';
    
    results.forEach(result => {
      const statusIcon = result.status === 'passed' ? '✅' : 
                        result.status === 'warning' ? '⚠️' : 
                        result.status === 'failed' ? '❌' : '💥';
      
      markdown += `| ${result.name} | ${statusIcon} ${result.status} | ${result.stats.mean?.toFixed(2) || 'N/A'} | ${result.stats.p95?.toFixed(2) || 'N/A'} | ${result.stats.p99?.toFixed(2) || 'N/A'} |\n`;
    });
    
    markdown += '\n## Detailed Results\n\n';
    
    results.forEach(result => {
      markdown += `### ${result.name}\n\n`;
      markdown += `- **Status**: ${result.status}\n`;
      markdown += `- **Iterations**: ${result.iterations?.length || 0}\n`;
      if (result.stats.mean) {
        markdown += `- **Mean**: ${result.stats.mean.toFixed(2)}ms\n`;
        markdown += `- **Median**: ${result.stats.median.toFixed(2)}ms\n`;
        markdown += `- **Min/Max**: ${result.stats.min.toFixed(2)}ms / ${result.stats.max.toFixed(2)}ms\n`;
        markdown += `- **95th Percentile**: ${result.stats.p95.toFixed(2)}ms\n`;
        markdown += `- **Standard Deviation**: ${result.stats.stdDev.toFixed(2)}ms\n`;
      }
      markdown += '\n';
    });
    
    return markdown;
  }

  // Health check
  getStatus() {
    return {
      isRunning: this.isRunning,
      registeredBenchmarks: this.benchmarks.size,
      completedBenchmarks: this.results.size,
      lastRun: this.results.size > 0 ? Math.max(...Array.from(this.results.values()).map(r => r.endTime || 0)) : null
    };
  }

  // Cleanup
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.removeAllListeners();
  }
}

module.exports = PerformanceBenchmarkSuite;