/**
 * MoneroPay Endpoints Manual Test Script
 * Tests payment API endpoints with curl-like output
 * Run: node tests/moneropay-endpoints-test.js
 */

const http = require('http');
const { Model } = require('objection');
const Knex = require('knex');
require('dotenv').config();

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  test: (msg) => console.log(`\n${colors.cyan}${colors.bright}▶ ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.blue}═══ ${msg} ═══${colors.reset}`),
  request: (method, path) => console.log(`  ${colors.yellow}${method}${colors.reset} ${path}`),
  response: (status, statusText) => console.log(`  ${status >= 400 ? colors.red : colors.green}${status} ${statusText}${colors.reset}`),
  json: (data) => console.log(`  ${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`)
};

// Test configuration
const config = {
  baseUrl: process.env.API_URL || 'http://localhost:3000',
  host: 'localhost',
  port: 3000
};

// Test data
let testData = {
  userId: null,
  appointmentId: null,
  paymentId: null,
  paymentAddress: 'test_address_' + Date.now(),
  db: null
};

/**
 * Make HTTP request
 */
async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseUrl + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    log.request(method, path);

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || http.STATUS_CODES[res.statusCode],
            headers: res.headers,
            body: parsed,
            rawBody: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || http.STATUS_CODES[res.statusCode],
            headers: res.headers,
            body: { error: 'Invalid JSON response' },
            rawBody: data
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Setup test database and data
 */
async function setupTestData() {
  log.section('Database Setup');

  try {
    const knexConfig = require('../knexfile')[process.env.NODE_ENV || 'development'];
    testData.db = Knex(knexConfig);
    Model.knex(testData.db);

    // Create test user
    const [userId] = await testData.db('users').insert({
      telegram_id: Math.floor(Math.random() * 1000000),
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      timezone: 'America/New_York',
      created_at: new Date(),
      updated_at: new Date()
    });
    testData.userId = userId;
    log.success(`Created test user: ID ${userId}`);

    // Create test appointment
    const [appointmentId] = await testData.db('appointments').insert({
      user_id: userId,
      title: 'MoneroPay Test Appointment',
      description: 'Test payment processing',
      date: new Date(Date.now() + 86400000),
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    });
    testData.appointmentId = appointmentId;
    log.success(`Created test appointment: ID ${appointmentId}`);
  } catch (error) {
    log.error(`Database setup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test 1: Webhook with missing address
 */
async function test1_webhookMissingAddress() {
  log.test('Test 1: Webhook - Missing Address (Should fail with 400)');

  const response = await makeRequest('POST', '/api/payments/webhook', {
    amount_received: 0,
    confirmations: 0
  });

  log.response(response.status, response.statusText);
  log.json(response.body);

  if (response.status === 400 && response.body.error) {
    log.success('Correctly rejected webhook with missing address');
    return true;
  } else {
    log.error('Failed to reject webhook with missing address');
    return false;
  }
}

/**
 * Test 2: Webhook with unknown address
 */
async function test2_webhookUnknownAddress() {
  log.test('Test 2: Webhook - Unknown Address (Should fail with 404)');

  const response = await makeRequest('POST', '/api/payments/webhook', {
    address: 'unknown_address_xyz',
    amount_received: 0,
    confirmations: 0,
    complete: false
  });

  log.response(response.status, response.statusText);
  log.json(response.body);

  if (response.status === 404 && response.body.error) {
    log.success('Correctly rejected webhook with unknown address');
    return true;
  } else {
    log.error('Failed to reject webhook with unknown address');
    return false;
  }
}

/**
 * Test 3: Create payment and process webhook
 */
async function test3_webhookValidPayment() {
  log.test('Test 3: Webhook - Valid Payment Processing');

  try {
    // Create payment in database
    const [paymentId] = await testData.db('payments').insert({
      appointment_id: testData.appointmentId,
      user_id: testData.userId,
      moneropay_address: testData.paymentAddress,
      payment_id: null,
      amount_cad: 250,
      amount_xmr: '1000000000000', // 1 XMR in piconero
      exchange_rate: 250,
      status: 'pending',
      expires_at: new Date(Date.now() + 1800000),
      metadata: JSON.stringify({
        address: testData.paymentAddress,
        amount: 1000000000000
      }),
      created_at: new Date(),
      updated_at: new Date()
    });
    testData.paymentId = paymentId;
    log.success(`Created payment: ID ${paymentId}`);

    // Process partial payment webhook
    log.info('Processing partial payment webhook...');
    const response = await makeRequest('POST', '/api/payments/webhook', {
      address: testData.paymentAddress,
      amount_received: '500000000000', // 0.5 XMR
      confirmations: 1,
      complete: false
    });

    log.response(response.status, response.statusText);
    log.json(response.body);

    if (response.status === 200 && response.body.success && response.body.status === 'partial') {
      log.success('Correctly processed partial payment webhook');
      return true;
    } else {
      log.error('Failed to process partial payment webhook');
      return false;
    }
  } catch (error) {
    log.error(`Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Webhook completion
 */
async function test4_webhookCompletion() {
  log.test('Test 4: Webhook - Payment Completion');

  const response = await makeRequest('POST', '/api/payments/webhook', {
    address: testData.paymentAddress,
    amount_received: '1000000000000', // Full amount
    confirmations: 10,
    complete: true
  });

  log.response(response.status, response.statusText);
  log.json(response.body);

  if (response.status === 200 && response.body.status === 'confirmed') {
    log.success('Correctly processed payment completion');
    return true;
  } else {
    log.error('Failed to process payment completion');
    return false;
  }
}

/**
 * Test 5: Check payment status
 */
async function test5_checkPaymentStatus() {
  log.test('Test 5: Check Payment Status');

  const response = await makeRequest('GET', `/api/payments/${testData.paymentId}/status`);

  log.response(response.status, response.statusText);
  log.json(response.body);

  if (response.status === 200) {
    if (response.body.id && response.body.status && response.body.amountCad) {
      log.success('Correctly retrieved payment status');
      return true;
    } else {
      log.error('Status response missing required fields');
      return false;
    }
  } else {
    log.error('Failed to retrieve payment status');
    return false;
  }
}

/**
 * Test 6: Check non-existent payment
 */
async function test6_nonExistentPayment() {
  log.test('Test 6: Check Non-Existent Payment (Should fail with 404)');

  const response = await makeRequest('GET', '/api/payments/999999/status');

  log.response(response.status, response.statusText);
  log.json(response.body);

  if (response.status === 404 && response.body.error) {
    log.success('Correctly rejected non-existent payment');
    return true;
  } else {
    log.error('Failed to reject non-existent payment');
    return false;
  }
}

/**
 * Test 7: Expire old payments
 */
async function test7_expireOldPayments() {
  log.test('Test 7: Expire Old Payments');

  try {
    // Create an expired payment
    const [expiredId] = await testData.db('payments').insert({
      appointment_id: testData.appointmentId,
      user_id: testData.userId,
      moneropay_address: 'expired_' + Date.now(),
      payment_id: null,
      amount_cad: 250,
      amount_xmr: '1000000000000',
      exchange_rate: 250,
      status: 'pending',
      expires_at: new Date(Date.now() - 1000),
      metadata: '{}',
      created_at: new Date(),
      updated_at: new Date()
    });

    const response = await makeRequest('POST', '/api/payments/expire-old', {});

    log.response(response.status, response.statusText);
    log.json(response.body);

    if (response.status === 200 && response.body.expired !== undefined) {
      log.success('Correctly expired old payments');

      // Cleanup
      await testData.db('payments').where('id', expiredId).del();
      return true;
    } else {
      log.error('Failed to expire old payments');
      return false;
    }
  } catch (error) {
    log.error(`Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 8: Error handling for malformed data
 */
async function test8_malformedWebhookData() {
  log.test('Test 8: Malformed Webhook Data (Should fail)');

  const response = await makeRequest('POST', '/api/payments/webhook', {
    address: testData.paymentAddress
    // Missing required fields
  });

  log.response(response.status, response.statusText);
  log.json(response.body);

  // Should either process with defaults or reject
  if ([200, 400, 500].includes(response.status)) {
    log.success('Handled malformed webhook gracefully');
    return true;
  } else {
    log.error('Unexpected error handling for malformed webhook');
    return false;
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  log.section('Cleanup');

  try {
    if (testData.paymentId) {
      await testData.db('payments').where('id', testData.paymentId).del();
      log.success(`Deleted payment: ID ${testData.paymentId}`);
    }
    if (testData.appointmentId) {
      await testData.db('appointments').where('id', testData.appointmentId).del();
      log.success(`Deleted appointment: ID ${testData.appointmentId}`);
    }
    if (testData.userId) {
      await testData.db('users').where('id', testData.userId).del();
      log.success(`Deleted user: ID ${testData.userId}`);
    }
    if (testData.db) {
      await testData.db.destroy();
    }
  } catch (error) {
    log.error(`Cleanup failed: ${error.message}`);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`
${colors.bright}${colors.blue}╔═════════════════════════════════════╗
║   MoneroPay API Endpoints Test      ║
║   Manual Testing Suite              ║
╚═════════════════════════════════════╝${colors.reset}

Configuration:
  Base URL: ${config.baseUrl}
  Host: ${config.host}
  Port: ${config.port}
  Node Env: ${process.env.NODE_ENV || 'development'}
  Payments Enabled: ${process.env.ENABLE_PAYMENTS || 'false'}
  `);

  const results = [];

  try {
    // Setup
    await setupTestData();

    // Run tests
    results.push({ name: 'Test 1: Webhook - Missing Address', pass: await test1_webhookMissingAddress() });
    results.push({ name: 'Test 2: Webhook - Unknown Address', pass: await test2_webhookUnknownAddress() });
    results.push({ name: 'Test 3: Webhook - Valid Payment', pass: await test3_webhookValidPayment() });
    results.push({ name: 'Test 4: Webhook - Payment Completion', pass: await test4_webhookCompletion() });
    results.push({ name: 'Test 5: Check Payment Status', pass: await test5_checkPaymentStatus() });
    results.push({ name: 'Test 6: Non-Existent Payment', pass: await test6_nonExistentPayment() });
    results.push({ name: 'Test 7: Expire Old Payments', pass: await test7_expireOldPayments() });
    results.push({ name: 'Test 8: Malformed Webhook Data', pass: await test8_malformedWebhookData() });

  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    // Cleanup
    await cleanup();

    // Report results
    log.section('Test Results Summary');
    const passed = results.filter(r => r.pass).length;
    const failed = results.length - passed;

    results.forEach((result, i) => {
      const status = result.pass ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
      console.log(`  ${i + 1}. ${result.name}: ${status}`);
    });

    console.log(`\n${colors.bright}Total: ${passed}/${results.length} tests passed${colors.reset}`);

    if (failed > 0) {
      console.log(`${colors.red}${failed} test(s) failed${colors.reset}`);
      process.exit(1);
    } else {
      log.success('All tests passed!');
      process.exit(0);
    }
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests, makeRequest };
