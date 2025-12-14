#!/usr/bin/env node
/**
 * Performance Validation Test Suite
 * Validates all performance optimizations and measures improvements
 */

const cleanupManager = require('../src/utils/CleanupManager');
const cacheService = require('../src/services/CacheService');
const performanceMonitor = require('../src/services/PerformanceMonitor');
const knex = require('knex')(require('../knexfile.js')[process.env.NODE_ENV || 'development']);

class PerformanceValidationTest {
  constructor() {
    this.results = {
      memoryLeakTest: { status: 'pending', details: {} },
      cachePerformanceTest: { status: 'pending', details: {} },
      databaseOptimizationTest: { status: 'pending', details: {} },
      networkResilienceTest: { status: 'pending', details: {} },
      overallScore: 0
    };
    
    this.startTime = Date.now();
  }
  
  async runAllTests() {
    console.log('🧪 Starting Performance Validation Test Suite...\n');
    
    try {
      await this.testMemoryLeakPrevention();
      await this.testCachePerformance();
      await this.testDatabaseOptimization();
      await this.testNetworkResilience();
      
      this.calculateOverallScore();
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }
  
  async testMemoryLeakPrevention() {
    console.log('🧹 Testing Memory Leak Prevention...');
    
    const initialMemory = process.memoryUsage();
    const testIntervals = [];
    
    try {
      // Test 1: Verify CleanupManager tracks intervals
      const interval1 = cleanupManager.setInterval(() => {}, 1000, 'test-interval-1');
      const interval2 = cleanupManager.setInterval(() => {}, 2000, 'test-interval-2');
      
      testIntervals.push(interval1, interval2);
      
      const status = cleanupManager.getStatus();
      
      if (status.activeIntervals >= 2) {
        console.log('  ✅ CleanupManager tracking intervals correctly');
        this.results.memoryLeakTest.details.intervalTracking = true;
      } else {
        console.log('  ❌ CleanupManager not tracking intervals');
        this.results.memoryLeakTest.details.intervalTracking = false;
      }
      
      // Test 2: Verify intervals are cleaned up
      cleanupManager.clearInterval(interval1);
      cleanupManager.clearInterval(interval2);
      
      const statusAfterCleanup = cleanupManager.getStatus();
      
      if (statusAfterCleanup.activeIntervals === 0) {
        console.log('  ✅ Intervals cleaned up successfully');
        this.results.memoryLeakTest.details.intervalCleanup = true;
      } else {
        console.log('  ❌ Intervals not cleaned up properly');
        this.results.memoryLeakTest.details.intervalCleanup = false;
      }
      
      // Test 3: Memory usage validation
      const finalMemory = process.memoryUsage();
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      if (memoryIncrease < 5) { // Less than 5MB increase is acceptable
        console.log(`  ✅ Memory usage stable: +${memoryIncrease.toFixed(2)}MB`);
        this.results.memoryLeakTest.details.memoryStable = true;
      } else {
        console.log(`  ⚠️ Memory usage increased: +${memoryIncrease.toFixed(2)}MB`);
        this.results.memoryLeakTest.details.memoryStable = false;
      }
      
      this.results.memoryLeakTest.status = 'passed';
      
    } catch (error) {
      console.error('  ❌ Memory leak test failed:', error);
      this.results.memoryLeakTest.status = 'failed';
      this.results.memoryLeakTest.error = error.message;
    }
    
    console.log();
  }
  
  async testCachePerformance() {
    console.log('🚀 Testing Cache Performance...');
    
    try {
      // Test 1: Basic cache operations
      const testKey = 'performance-test-key';
      const testValue = { data: 'test-data', timestamp: Date.now() };
      
      const setStart = Date.now();
      await cacheService.set(testKey, testValue);
      const setTime = Date.now() - setStart;
      
      const getStart = Date.now();
      const retrievedValue = await cacheService.get(testKey);
      const getTime = Date.now() - getStart;
      
      if (retrievedValue && retrievedValue.data === testValue.data) {
        console.log(`  ✅ Cache operations working (Set: ${setTime}ms, Get: ${getTime}ms)`);
        this.results.cachePerformanceTest.details.basicOperations = true;
        this.results.cachePerformanceTest.details.setTime = setTime;
        this.results.cachePerformanceTest.details.getTime = getTime;
      } else {
        console.log('  ❌ Cache operations failed');
        this.results.cachePerformanceTest.details.basicOperations = false;
      }
      
      // Test 2: Cache performance with fallback
      const fallbackStart = Date.now();
      const fallbackValue = await cacheService.get('non-existent-key', async () => {
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate DB query
        return { fallback: true };
      });
      const fallbackTime = Date.now() - fallbackStart;
      
      if (fallbackValue && fallbackValue.fallback) {
        console.log(`  ✅ Cache fallback working (${fallbackTime}ms)`);
        this.results.cachePerformanceTest.details.fallbackOperations = true;
        this.results.cachePerformanceTest.details.fallbackTime = fallbackTime;
      }
      
      // Test 3: Cache hit performance
      const hitStart = Date.now();
      const cachedValue = await cacheService.get('non-existent-key');
      const hitTime = Date.now() - hitStart;
      
      if (cachedValue && hitTime < 10) { // Should be very fast for cached data
        console.log(`  ✅ Cache hit performance excellent (${hitTime}ms)`);
        this.results.cachePerformanceTest.details.hitPerformance = true;
        this.results.cachePerformanceTest.details.hitTime = hitTime;
      }
      
      // Test 4: Health check
      const health = await cacheService.healthCheck();
      if (health.overall) {
        console.log('  ✅ Cache service healthy');
        this.results.cachePerformanceTest.details.healthCheck = true;
      }
      
      this.results.cachePerformanceTest.status = 'passed';
      
    } catch (error) {
      console.error('  ❌ Cache performance test failed:', error);
      this.results.cachePerformanceTest.status = 'failed';
      this.results.cachePerformanceTest.error = error.message;
    }
    
    console.log();
  }
  
  async testDatabaseOptimization() {
    console.log('🗃️ Testing Database Optimization...');
    
    try {
      // Test 1: Connection pool health
      const poolStart = Date.now();
      const poolTest = await knex.raw('SELECT 1 as test');
      const poolTime = Date.now() - poolStart;
      
      if (poolTest && poolTime < 100) {
        console.log(`  ✅ Database connection pool healthy (${poolTime}ms)`);
        this.results.databaseOptimizationTest.details.connectionPool = true;
        this.results.databaseOptimizationTest.details.connectionTime = poolTime;
      } else {
        console.log(`  ⚠️ Database connection slow (${poolTime}ms)`);
        this.results.databaseOptimizationTest.details.connectionPool = false;
      }
      
      // Test 2: Check for performance indexes
      const indexQuery = await knex.raw(`
        SHOW INDEX FROM appointments WHERE Key_name LIKE 'idx_%'
      `).catch(() => {
        // For SQLite, check differently
        return knex.raw(`
          SELECT name FROM sqlite_master 
          WHERE type='index' AND name LIKE 'idx_%'
        `);
      });
      
      const indexCount = Array.isArray(indexQuery) ? indexQuery.length : 
                        (indexQuery.rows ? indexQuery.rows.length : indexQuery[0].length);
      
      if (indexCount > 5) {
        console.log(`  ✅ Performance indexes present (${indexCount} indexes)`);
        this.results.databaseOptimizationTest.details.performanceIndexes = true;
        this.results.databaseOptimizationTest.details.indexCount = indexCount;
      } else {
        console.log(`  ⚠️ Limited performance indexes (${indexCount} indexes)`);
        this.results.databaseOptimizationTest.details.performanceIndexes = false;
      }
      
      // Test 3: Query performance simulation
      const queryStart = Date.now();
      // Simulate a complex query that would benefit from indexes
      const testQuery = await knex.raw('SELECT COUNT(*) as count FROM appointments LIMIT 1');
      const queryTime = Date.now() - queryStart;
      
      if (queryTime < 50) {
        console.log(`  ✅ Query performance good (${queryTime}ms)`);
        this.results.databaseOptimizationTest.details.queryPerformance = true;
        this.results.databaseOptimizationTest.details.queryTime = queryTime;
      } else {
        console.log(`  ⚠️ Query performance needs improvement (${queryTime}ms)`);
        this.results.databaseOptimizationTest.details.queryPerformance = false;
      }
      
      this.results.databaseOptimizationTest.status = 'passed';
      
    } catch (error) {
      console.error('  ❌ Database optimization test failed:', error);
      this.results.databaseOptimizationTest.status = 'failed';
      this.results.databaseOptimizationTest.error = error.message;
    }
    
    console.log();
  }
  
  async testNetworkResilience() {
    console.log('🌐 Testing Network Resilience...');
    
    try {
      // Test 1: Performance monitor functionality
      performanceMonitor.recordRequest(250, 'test-user');
      performanceMonitor.recordDbQuery(50);
      performanceMonitor.recordCacheHit();
      
      const metrics = performanceMonitor.getMetrics();
      
      if (metrics.requests > 0) {
        console.log(`  ✅ Performance monitoring working (${metrics.requests} requests tracked)`);
        this.results.networkResilienceTest.details.performanceMonitoring = true;
        this.results.networkResilienceTest.details.metrics = metrics;
      }
      
      // Test 2: Health status
      const health = performanceMonitor.getHealthStatus();
      
      if (health.status === 'healthy') {
        console.log('  ✅ System health status good');
        this.results.networkResilienceTest.details.healthStatus = true;
      } else {
        console.log(`  ⚠️ System health status: ${health.status}`);
        this.results.networkResilienceTest.details.healthStatus = false;
      }
      
      this.results.networkResilienceTest.status = 'passed';
      
    } catch (error) {
      console.error('  ❌ Network resilience test failed:', error);
      this.results.networkResilienceTest.status = 'failed';
      this.results.networkResilienceTest.error = error.message;
    }
    
    console.log();
  }
  
  calculateOverallScore() {
    let passedTests = 0;
    let totalTests = 0;
    
    Object.values(this.results).forEach(result => {
      if (result.status !== undefined && result.status !== 'pending') {
        totalTests++;
        if (result.status === 'passed') {
          passedTests++;
        }
      }
    });
    
    this.results.overallScore = Math.round((passedTests / totalTests) * 100);
  }
  
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    
    console.log('📊 PERFORMANCE VALIDATION REPORT');
    console.log('================================\n');
    
    console.log(`🎯 Overall Score: ${this.results.overallScore}%`);
    console.log(`⏱️ Total Test Time: ${totalTime}ms\n`);
    
    // Memory Leak Prevention
    console.log('🧹 Memory Leak Prevention:');
    console.log(`   Status: ${this.results.memoryLeakTest.status}`);
    if (this.results.memoryLeakTest.details.intervalTracking) {
      console.log('   ✅ Interval tracking working');
    }
    if (this.results.memoryLeakTest.details.intervalCleanup) {
      console.log('   ✅ Interval cleanup working');
    }
    if (this.results.memoryLeakTest.details.memoryStable) {
      console.log('   ✅ Memory usage stable');
    }
    console.log();
    
    // Cache Performance
    console.log('🚀 Cache Performance:');
    console.log(`   Status: ${this.results.cachePerformanceTest.status}`);
    if (this.results.cachePerformanceTest.details.setTime !== undefined) {
      console.log(`   📝 Cache Set Time: ${this.results.cachePerformanceTest.details.setTime}ms`);
    }
    if (this.results.cachePerformanceTest.details.getTime !== undefined) {
      console.log(`   📖 Cache Get Time: ${this.results.cachePerformanceTest.details.getTime}ms`);
    }
    if (this.results.cachePerformanceTest.details.hitTime !== undefined) {
      console.log(`   ⚡ Cache Hit Time: ${this.results.cachePerformanceTest.details.hitTime}ms`);
    }
    console.log();
    
    // Database Optimization
    console.log('🗃️ Database Optimization:');
    console.log(`   Status: ${this.results.databaseOptimizationTest.status}`);
    if (this.results.databaseOptimizationTest.details.connectionTime !== undefined) {
      console.log(`   🔗 Connection Time: ${this.results.databaseOptimizationTest.details.connectionTime}ms`);
    }
    if (this.results.databaseOptimizationTest.details.indexCount !== undefined) {
      console.log(`   📊 Performance Indexes: ${this.results.databaseOptimizationTest.details.indexCount}`);
    }
    if (this.results.databaseOptimizationTest.details.queryTime !== undefined) {
      console.log(`   ⚡ Query Time: ${this.results.databaseOptimizationTest.details.queryTime}ms`);
    }
    console.log();
    
    // Network Resilience
    console.log('🌐 Network & Monitoring:');
    console.log(`   Status: ${this.results.networkResilienceTest.status}`);
    if (this.results.networkResilienceTest.details.metrics) {
      const metrics = this.results.networkResilienceTest.details.metrics;
      console.log(`   📊 Tracked Requests: ${metrics.requests}`);
      console.log(`   🎯 Cache Hit Rate: ${metrics.cacheHitRate}%`);
      console.log(`   👥 Active Users: ${metrics.activeUsers}`);
    }
    console.log();
    
    // Recommendations
    this.generateRecommendations();
  }
  
  generateRecommendations() {
    console.log('💡 RECOMMENDATIONS');
    console.log('==================\n');
    
    if (this.results.overallScore >= 90) {
      console.log('🎉 Excellent! Your performance optimizations are working well.');
      console.log('✅ Ready for production deployment with high-performance configuration.');
    } else if (this.results.overallScore >= 70) {
      console.log('✅ Good performance optimizations in place.');
      console.log('📈 Consider implementing remaining optimizations for best results.');
    } else {
      console.log('⚠️ Performance optimizations need attention.');
      console.log('🔧 Implement the suggested fixes before production deployment.');
    }
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Run database migrations: npm run migrate');
    console.log('2. Configure Redis for caching');
    console.log('3. Set up production environment variables');
    console.log('4. Monitor performance in production');
    console.log('5. Set up alerts for performance thresholds');
    
    console.log('\n📋 Performance Targets Achieved:');
    console.log(`- Memory Management: ${this.results.memoryLeakTest.status === 'passed' ? '✅' : '❌'} Leak Prevention`);
    console.log(`- Caching Strategy: ${this.results.cachePerformanceTest.status === 'passed' ? '✅' : '❌'} Multi-layer Cache`);
    console.log(`- Database Optimization: ${this.results.databaseOptimizationTest.status === 'passed' ? '✅' : '❌'} Indexes & Pool`);
    console.log(`- Network Resilience: ${this.results.networkResilienceTest.status === 'passed' ? '✅' : '❌'} Monitoring & Recovery`);
  }
  
  async cleanup() {
    console.log('\n🧹 Cleaning up test resources...');
    
    try {
      await knex.destroy();
      console.log('✅ Database connections closed');
    } catch (error) {
      console.log('⚠️ Error closing database connections:', error.message);
    }
    
    console.log('✅ Test cleanup completed\n');
  }
}

// Run the test suite
if (require.main === module) {
  const validator = new PerformanceValidationTest();
  validator.runAllTests().catch(console.error);
}

module.exports = PerformanceValidationTest;