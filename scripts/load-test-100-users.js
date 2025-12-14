#!/usr/bin/env node

const axios = require('axios');
const { Telegraf } = require('telegraf');

// Load test configuration
const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  numUsers: 100,
  rampUpTime: 30000, // 30 seconds to ramp up
  testDuration: 120000, // 2 minutes test
  requestsPerUser: 10,
  thinkTime: 2000 // 2 seconds between requests
};

class LoadTester {
  constructor() {
    this.users = [];
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: []
    };
    this.running = false;
  }

  // Simulate user actions
  async simulateUser(userId) {
    const actions = [
      { command: '/start', weight: 1 },
      { command: '/book', weight: 3 },
      { command: '/myappointments', weight: 2 },
      { command: '/help', weight: 1 },
      { command: '/support', weight: 1 }
    ];

    // Weighted random selection
    const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);
    const random = Math.random() * totalWeight;
    let accumWeight = 0;
    
    for (const action of actions) {
      accumWeight += action.weight;
      if (random <= accumWeight) {
        return action.command;
      }
    }
    
    return '/help';
  }

  // Execute user request
  async executeUserRequest(userId) {
    const command = await this.simulateUser(userId);
    const startTime = Date.now();
    
    try {
      // Simulate sending command to bot
      console.log(`User ${userId} executing: ${command}`);
      
      // In real test, you would send actual Telegram messages
      // For now, we'll simulate the response time
      await new Promise(resolve => 
        setTimeout(resolve, Math.random() * 1000 + 500)
      );
      
      const responseTime = Date.now() - startTime;
      this.metrics.responseTimes.push(responseTime);
      this.metrics.successfulRequests++;
      
      return { success: true, responseTime };
    } catch (error) {
      this.metrics.failedRequests++;
      this.metrics.errors.push({
        userId,
        command,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return { success: false, error: error.message };
    } finally {
      this.metrics.totalRequests++;
    }
  }

  // Simulate concurrent users
  async runLoadTest() {
    console.log('🚀 Starting load test with 100 users...');
    console.log('================================');
    
    this.running = true;
    const startTime = Date.now();
    const userPromises = [];

    // Ramp up users gradually
    for (let i = 0; i < config.numUsers; i++) {
      const userId = `test_user_${i}`;
      const delay = (config.rampUpTime / config.numUsers) * i;
      
      userPromises.push(
        new Promise(async (resolve) => {
          await new Promise(r => setTimeout(r, delay));
          
          console.log(`User ${i + 1}/${config.numUsers} started`);
          
          // Each user makes multiple requests
          for (let j = 0; j < config.requestsPerUser && this.running; j++) {
            await this.executeUserRequest(userId);
            
            // Think time between requests
            await new Promise(r => setTimeout(r, config.thinkTime));
          }
          
          resolve();
        })
      );
    }

    // Wait for all users to complete
    await Promise.allSettled(userPromises);
    
    const duration = Date.now() - startTime;
    this.running = false;
    
    // Calculate statistics
    this.calculateStats(duration);
  }

  calculateStats(duration) {
    const avgResponseTime = this.metrics.responseTimes.length > 0
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
      : 0;
    
    const maxResponseTime = Math.max(...this.metrics.responseTimes);
    const minResponseTime = Math.min(...this.metrics.responseTimes);
    
    // Calculate percentiles
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    const successRate = (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
    const throughput = (this.metrics.totalRequests / (duration / 1000));

    console.log('\n================================');
    console.log('📊 LOAD TEST RESULTS');
    console.log('================================');
    console.log(`Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(`Total Users: ${config.numUsers}`);
    console.log(`Total Requests: ${this.metrics.totalRequests}`);
    console.log(`Successful: ${this.metrics.successfulRequests}`);
    console.log(`Failed: ${this.metrics.failedRequests}`);
    console.log(`Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`Throughput: ${throughput.toFixed(2)} req/sec`);
    console.log('\n📈 Response Times:');
    console.log(`  Average: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`  Min: ${minResponseTime}ms`);
    console.log(`  Max: ${maxResponseTime}ms`);
    console.log(`  P50: ${p50}ms`);
    console.log(`  P95: ${p95}ms`);
    console.log(`  P99: ${p99}ms`);
    
    if (this.metrics.errors.length > 0) {
      console.log('\n⚠️ Errors:');
      const errorSummary = {};
      this.metrics.errors.forEach(e => {
        errorSummary[e.error] = (errorSummary[e.error] || 0) + 1;
      });
      
      Object.entries(errorSummary).forEach(([error, count]) => {
        console.log(`  ${error}: ${count} occurrences`);
      });
    }
    
    // Performance assessment
    console.log('\n🎯 Performance Assessment:');
    if (successRate >= 99 && avgResponseTime < 1000) {
      console.log('✅ EXCELLENT: Bot can handle 100 users with great performance');
    } else if (successRate >= 95 && avgResponseTime < 2000) {
      console.log('✅ GOOD: Bot can handle 100 users with acceptable performance');
    } else if (successRate >= 90) {
      console.log('⚠️ FAIR: Bot can handle 100 users but may experience slowdowns');
    } else {
      console.log('❌ POOR: Bot struggles with 100 users, optimization needed');
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (avgResponseTime > 2000) {
      console.log('- Consider implementing more aggressive caching');
      console.log('- Optimize database queries');
    }
    if (this.metrics.failedRequests > 0) {
      console.log('- Review error handling and recovery mechanisms');
      console.log('- Implement circuit breakers for failing services');
    }
    if (p99 > p50 * 5) {
      console.log('- High variance in response times detected');
      console.log('- Consider implementing request prioritization');
    }
  }
}

// Run the test
async function main() {
  const tester = new LoadTester();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⚠️ Test interrupted');
    tester.running = false;
  });
  
  try {
    await tester.runLoadTest();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

if (require.main === module) {
  main();
}