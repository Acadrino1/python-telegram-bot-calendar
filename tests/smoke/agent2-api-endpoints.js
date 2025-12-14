/**
 * Agent 2: API Endpoint Integration Tests
 * Tests payment API endpoints with REAL HTTP calls
 *
 * Prerequisites:
 * - Agent 1 infrastructure tests PASS
 * - API server running on localhost:3000
 * - Set API_KEY in .env (or set API_KEY_REQUIRED=false)
 *
 * Usage:
 *   API_KEY=your-secret-api-key-here node tests/smoke/agent2-api-endpoints.js
 *   OR
 *   Set API_KEY in .env file
 *
 * Test Scenarios:
 * 1. POST /api/payments/webhook - all error cases + payment states
 * 2. GET /api/payments/:id/status - valid/invalid IDs
 * 3. POST /api/payments/expire-old - expiry logic
 */

require('dotenv').config();
const http = require('http');
const { Model } = require('objection');

// Test configuration
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 5000; // 5s for response time validation
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

class Agent2ApiTests {
  constructor() {
    this.results = [];
    this.knex = null;
  }

  async init() {
    console.log('Agent 2: API Endpoint Integration Tests\n');
    console.log('Prerequisites: Waiting for Agent 1 infrastructure validation...\n');

    // Check for API key
    if (!process.env.API_KEY) {
      console.warn('⚠️  WARNING: API_KEY not set in environment');
      console.warn('   Either:');
      console.warn('   1. Run: API_KEY=your-secret-api-key-here node tests/smoke/agent2-api-endpoints.js');
      console.warn('   2. Add API_KEY to .env file');
      console.warn('   3. Set API_KEY_REQUIRED=false in .env for testing\n');
    } else {
      console.log(`✓ API key configured: ${process.env.API_KEY.substring(0, 8)}...\n`);
    }

    // Initialize database connection
    const knexConfig = require('../../knexfile.js');
    const knexInstance = require('knex')(knexConfig.development);
    Model.knex(knexInstance);
    this.knex = knexInstance;

    // Verify tables exist
    const hasPayments = await this.knex.schema.hasTable('payments');
    if (!hasPayments) {
      throw new Error('PREREQUISITE FAILED: payments table does not exist. Run migrations first.');
    }
    console.log('✓ Database connection established\n');
  }

  async cleanup() {
    if (this.knex) {
      await this.knex.destroy();
    }
  }

  // HTTP helper with timeout and metrics
  async httpRequest(method, path, body = null) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const url = new URL(path, API_BASE);
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add API key if available
      if (process.env.API_KEY) {
        headers['X-API-Key'] = process.env.API_KEY;
      }

      const options = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers,
        timeout: TEST_TIMEOUT
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({
              status: res.statusCode,
              body: parsed,
              responseTime,
              headers: res.headers
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              body: data,
              responseTime,
              headers: res.headers
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout (>${TEST_TIMEOUT}ms)`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  log(testName, passed, details = '') {
    const status = passed ? PASS : FAIL;
    console.log(`${status} ${testName}`);
    if (details) {
      console.log(`    ${details}`);
    }
    this.results.push({ testName, passed, details });
  }

  // TEST 1: POST /api/payments/webhook - Missing address
  async testWebhookMissingAddress() {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit spacing

      const res = await this.httpRequest('POST', '/api/payments/webhook', {});

      // Handle rate limiting
      if (res.status === 429) {
        this.log(
          'Webhook: Missing address → 400',
          false,
          'Rate limited (429) - API rate limits too aggressive for testing'
        );
        return false;
      }

      const passed = res.status === 400 &&
                     res.body.error &&
                     res.body.error.includes('address');

      this.log(
        'Webhook: Missing address → 400',
        passed,
        passed ? `${res.responseTime}ms` : `Expected 400, got ${res.status}`
      );
      return passed;
    } catch (err) {
      this.log('Webhook: Missing address → 400', false, err.message);
      return false;
    }
  }

  // TEST 2: POST /api/payments/webhook - Unknown address
  async testWebhookUnknownAddress() {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit spacing

      const res = await this.httpRequest('POST', '/api/payments/webhook', {
        address: 'UNKNOWN_XMR_ADDRESS_9999999',
        amount_received: '1000000000000',
        confirmations: 1,
        complete: false
      });

      // Handle rate limiting
      if (res.status === 429) {
        this.log(
          'Webhook: Unknown address → 404',
          false,
          'Rate limited (429) - API rate limits too aggressive for testing'
        );
        return false;
      }

      const passed = res.status === 404 &&
                     res.body.error &&
                     res.body.error.toLowerCase().includes('not found');

      this.log(
        'Webhook: Unknown address → 404',
        passed,
        passed ? `${res.responseTime}ms` : `Expected 404, got ${res.status}`
      );
      return passed;
    } catch (err) {
      this.log('Webhook: Unknown address → 404', false, err.message);
      return false;
    }
  }

  // TEST 3: POST /api/payments/webhook - Partial payment
  async testWebhookPartialPayment() {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit spacing

      // Create test payment
      const testAddress = `TEST_PARTIAL_${Date.now()}`;
      const [paymentId] = await this.knex('payments').insert({
        moneropay_address: testAddress,
        amount_cad: 250.00,
        amount_xmr: '5000000000000', // 0.005 XMR expected
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date()
      });

      // Send partial payment webhook
      const res = await this.httpRequest('POST', '/api/payments/webhook', {
        address: testAddress,
        amount_received: '2500000000000', // 0.0025 XMR (50% of expected)
        confirmations: 0,
        complete: false
      });

      // Handle rate limiting
      if (res.status === 429) {
        this.log(
          'Webhook: Partial payment → 200, status=partial',
          false,
          'Rate limited (429) - API rate limits too aggressive for testing'
        );
        await this.knex('payments').where('id', paymentId).delete();
        return false;
      }

      // Verify response
      const responseOk = res.status === 200 &&
                         res.body.success === true &&
                         res.body.status === 'partial';

      // Verify database update
      const updated = await this.knex('payments').where('id', paymentId).first();
      const dbOk = updated.status === 'partial' &&
                   updated.amount_received === '2500000000000';

      const passed = responseOk && dbOk && res.responseTime < 1000;

      this.log(
        'Webhook: Partial payment → 200, status=partial',
        passed,
        passed
          ? `${res.responseTime}ms, DB updated correctly`
          : `Response: ${res.status}, Status: ${res.body.status}, DB: ${updated.status}`
      );

      // Cleanup
      await this.knex('payments').where('id', paymentId).delete();
      return passed;
    } catch (err) {
      this.log('Webhook: Partial payment → 200, status=partial', false, err.message);
      return false;
    }
  }

  // TEST 4: POST /api/payments/webhook - Complete payment
  async testWebhookCompletePayment() {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit spacing

      // Create test payment
      const testAddress = `TEST_COMPLETE_${Date.now()}`;
      const [paymentId] = await this.knex('payments').insert({
        moneropay_address: testAddress,
        amount_cad: 250.00,
        amount_xmr: '5000000000000', // 0.005 XMR expected
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date()
      });

      // Send complete payment webhook
      const res = await this.httpRequest('POST', '/api/payments/webhook', {
        address: testAddress,
        amount_received: '5000000000000', // Full amount
        confirmations: 1,
        complete: true
      });

      // Handle rate limiting
      if (res.status === 429) {
        this.log(
          'Webhook: Complete payment → 200, status=confirmed',
          false,
          'Rate limited (429) - API rate limits too aggressive for testing'
        );
        await this.knex('payments').where('id', paymentId).delete();
        return false;
      }

      // Verify response
      const responseOk = res.status === 200 &&
                         res.body.success === true &&
                         res.body.status === 'confirmed';

      // Verify database update
      const updated = await this.knex('payments').where('id', paymentId).first();
      const dbOk = updated.status === 'confirmed' &&
                   updated.amount_received === '5000000000000' &&
                   updated.confirmations === 1 &&
                   updated.confirmed_at !== null;

      const passed = responseOk && dbOk && res.responseTime < 1000;

      this.log(
        'Webhook: Complete payment → 200, status=confirmed',
        passed,
        passed
          ? `${res.responseTime}ms, DB updated with confirmed_at`
          : `Response: ${res.status}, Status: ${res.body.status}, DB: ${updated.status}`
      );

      // Cleanup
      await this.knex('payments').where('id', paymentId).delete();
      return passed;
    } catch (err) {
      this.log('Webhook: Complete payment → 200, status=confirmed', false, err.message);
      return false;
    }
  }

  // TEST 5: GET /api/payments/:id/status - Valid payment ID
  async testStatusValid() {
    try {
      // Create test payment
      const [paymentId] = await this.knex('payments').insert({
        moneropay_address: `TEST_STATUS_${Date.now()}`,
        amount_cad: 250.00,
        amount_xmr: '5000000000000',
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date()
      });

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

      const res = await this.httpRequest('GET', `/api/payments/${paymentId}/status`);

      // Handle rate limiting gracefully
      if (res.status === 429) {
        this.log(
          'Status: Valid payment ID → 200 with data',
          false,
          'Rate limited (429) - increase delay between tests'
        );
        await this.knex('payments').where('id', paymentId).delete();
        return false;
      }

      const passed = res.status === 200 &&
                     res.body.id === paymentId &&
                     res.body.status === 'pending' &&
                     res.body.amountCad === 250 &&
                     typeof res.body.amountXmr !== 'undefined' &&
                     res.responseTime < 1000;

      this.log(
        'Status: Valid payment ID → 200 with data',
        passed,
        passed
          ? `${res.responseTime}ms, id=${res.body.id}, status=${res.body.status}`
          : `Status ${res.status}, ID match: ${res.body.id === paymentId}, has data: ${!!res.body.status}`
      );

      // Cleanup
      await this.knex('payments').where('id', paymentId).delete();
      return passed;
    } catch (err) {
      this.log('Status: Valid payment ID → 200 with data', false, err.message);
      return false;
    }
  }

  // TEST 6: GET /api/payments/:id/status - Non-existent ID
  async testStatusNotFound() {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

      const nonExistentId = 999999;
      const res = await this.httpRequest('GET', `/api/payments/${nonExistentId}/status`);

      // Handle rate limiting
      if (res.status === 429) {
        this.log(
          'Status: Non-existent ID → 404',
          false,
          'Rate limited (429) - increase delay between tests'
        );
        return false;
      }

      const passed = res.status === 404 &&
                     res.body.error &&
                     res.body.error.toLowerCase().includes('not found');

      this.log(
        'Status: Non-existent ID → 404',
        passed,
        passed
          ? `${res.responseTime}ms`
          : `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`
      );
      return passed;
    } catch (err) {
      this.log('Status: Non-existent ID → 404', false, err.message);
      return false;
    }
  }

  // TEST 7: POST /api/payments/expire-old
  async testExpireOld() {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create payment with past expiry
      const [paymentId] = await this.knex('payments').insert({
        moneropay_address: `TEST_EXPIRED_${Date.now()}`,
        amount_cad: 250.00,
        amount_xmr: '5000000000000',
        status: 'pending',
        expires_at: new Date(Date.now() - 60 * 1000), // 1 minute in past
        created_at: new Date(),
        updated_at: new Date()
      });

      // Call expire endpoint
      const res = await this.httpRequest('POST', '/api/payments/expire-old');

      // Handle rate limiting
      if (res.status === 429) {
        this.log(
          'Expire: Old pending payment → status=expired',
          false,
          'Rate limited (429) - increase delay between tests'
        );
        await this.knex('payments').where('id', paymentId).delete();
        return false;
      }

      const responseOk = res.status === 200 &&
                         typeof res.body.expired === 'number' &&
                         res.body.expired >= 1;

      // Verify database update
      const updated = await this.knex('payments').where('id', paymentId).first();
      const dbOk = updated.status === 'expired';

      const passed = responseOk && dbOk && res.responseTime < 1000;

      this.log(
        'Expire: Old pending payment → status=expired',
        passed,
        passed
          ? `${res.responseTime}ms, ${res.body.expired} payment(s) expired`
          : `Response: ${res.status} ${JSON.stringify(res.body)}, DB status: ${updated.status}`
      );

      // Cleanup
      await this.knex('payments').where('id', paymentId).delete();
      return passed;
    } catch (err) {
      this.log('Expire: Old pending payment → status=expired', false, err.message);
      return false;
    }
  }

  // TEST 8: Response time validation
  async testResponseTimes() {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit spacing

      const [paymentId] = await this.knex('payments').insert({
        moneropay_address: `TEST_PERF_${Date.now()}`,
        amount_cad: 250.00,
        amount_xmr: '5000000000000',
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date()
      });

      const res = await this.httpRequest('GET', `/api/payments/${paymentId}/status`);

      if (res.status === 429) {
        this.log(
          'Performance: Response time <1s',
          false,
          'Rate limited (429)'
        );
        await this.knex('payments').where('id', paymentId).delete();
        return false;
      }

      const passed = res.responseTime < 1000 && res.status === 200;

      this.log(
        'Performance: Response time <1s',
        passed,
        `${res.responseTime}ms (status: ${res.status})`
      );

      await this.knex('payments').where('id', paymentId).delete();
      return passed;
    } catch (err) {
      this.log('Performance: Response time <1s', false, err.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Starting API Endpoint Tests');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const tests = [
      { name: 'Scenario 1: Webhook Validation', fn: () => this.runWebhookTests() },
      { name: 'Scenario 2: Status Endpoint', fn: () => this.runStatusTests() },
      { name: 'Scenario 3: Expiry Logic', fn: () => this.testExpireOld() },
      { name: 'Scenario 4: Performance', fn: () => this.testResponseTimes() }
    ];

    for (const test of tests) {
      console.log(`\n─── ${test.name} ───`);
      await test.fn();
    }

    this.printSummary();
  }

  async runWebhookTests() {
    await this.testWebhookMissingAddress();
    await this.testWebhookUnknownAddress();
    await this.testWebhookPartialPayment();
    await this.testWebhookCompletePayment();
  }

  async runStatusTests() {
    await this.testStatusValid();
    await this.testStatusNotFound();
  }

  printSummary() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('AGENT 2 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const allPassed = passed === total;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%\n`);

    if (!allPassed) {
      console.log('Failed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.testName}`);
        if (r.details) console.log(`    ${r.details}`);
      });
      console.log();
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`FINAL RESULT: ${allPassed ? PASS : FAIL}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (allPassed) {
      console.log('✓ All API endpoints functioning correctly');
      console.log('✓ Webhook updates database correctly');
      console.log('✓ Status endpoint returns accurate data');
      console.log('✓ Response times <1s');
      console.log('✓ Proper error codes');
    }

    process.exit(allPassed ? 0 : 1);
  }
}

// Run tests
(async () => {
  const agent2 = new Agent2ApiTests();
  try {
    await agent2.init();
    await agent2.runAllTests();
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await agent2.cleanup();
  }
})();
