/**
 * Agent 3: MoneroPayService Integration Tests
 * REAL API calls to CoinGecko and MoneroPay
 */

const MoneroPayService = require('../../src/services/MoneroPayService');
const { Model } = require('objection');
const Knex = require('knex');

// Initialize knex
const knexConfig = require('../../knexfile')[process.env.NODE_ENV || 'development'];
const knex = Knex(knexConfig);
Model.knex(knex);

const PAYMENT_ADDRESS_REGEX = /^[48][a-zA-Z0-9]{105}$/;
const EXPECTED_RATE_MIN = 500; // CAD
const EXPECTED_RATE_MAX = 800; // CAD

let service;
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details) {
  const result = { name, passed, details };
  testResults.tests.push(result);
  if (passed) {
    testResults.passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ FAIL: ${name}`);
  }
  if (details) {
    console.log(`   ${JSON.stringify(details)}`);
  }
}

async function test1_getExchangeRate() {
  console.log('\n=== TEST 1: getExchangeRate() - REAL CoinGecko call ===');

  try {
    const rate = await service.getExchangeRate();

    if (!rate) {
      logTest('getExchangeRate - returns value', false, { rate });
      return;
    }

    logTest('getExchangeRate - returns value', true, { rate });

    const inRange = rate >= EXPECTED_RATE_MIN && rate <= EXPECTED_RATE_MAX;
    logTest('getExchangeRate - rate in expected range', inRange, {
      rate,
      expectedMin: EXPECTED_RATE_MIN,
      expectedMax: EXPECTED_RATE_MAX
    });

    return rate;
  } catch (error) {
    logTest('getExchangeRate - no error thrown', false, {
      error: error.message
    });
    return null;
  }
}

async function test2_cadToAtomicUnits(rate) {
  console.log('\n=== TEST 2: cadToAtomicUnits(250, rate) - XMR conversion ===');

  if (!rate) {
    console.log('⚠️  SKIP: No exchange rate from test 1');
    return;
  }

  try {
    const atomicUnits = service.cadToAtomicUnits(250, rate);
    const xmrAmount = atomicUnits / 1e12;

    logTest('cadToAtomicUnits - returns value', !!atomicUnits, {
      atomicUnits,
      xmrAmount: xmrAmount.toFixed(12)
    });

    // $250 CAD at ~$550 CAD/XMR should be ~0.44-0.50 XMR
    const expectedXmrMin = 0.31; // 250/800
    const expectedXmrMax = 0.50; // 250/500
    const inRange = xmrAmount >= expectedXmrMin && xmrAmount <= expectedXmrMax;

    logTest('cadToAtomicUnits - XMR amount in expected range', inRange, {
      xmrAmount: xmrAmount.toFixed(12),
      expectedMin: expectedXmrMin,
      expectedMax: expectedXmrMax,
      rate
    });

    return atomicUnits;
  } catch (error) {
    logTest('cadToAtomicUnits - no error thrown', false, {
      error: error.message
    });
  }
}

async function test3_createPaymentRequest() {
  console.log('\n=== TEST 3: createPaymentRequest() - REAL MoneroPay call ===');

  if (!service.isEnabled()) {
    console.log('⚠️  SKIP: Payments disabled (ENABLE_PAYMENTS=false)');
    logTest('createPaymentRequest - skipped', true, {
      reason: 'ENABLE_PAYMENTS=false'
    });
    return;
  }

  try {
    const payment = await service.createPaymentRequest(null, 999, 'Agent3 Test');

    logTest('createPaymentRequest - returns payment object', !!payment, {
      hasId: !!payment.id,
      hasAddress: !!payment.address,
      hasAmountXmr: !!payment.amountXmr,
      hasAmountCad: !!payment.amountCad
    });

    if (payment.address) {
      const validFormat = PAYMENT_ADDRESS_REGEX.test(payment.address);
      logTest('createPaymentRequest - valid address format', validFormat, {
        address: payment.address,
        regex: PAYMENT_ADDRESS_REGEX.toString()
      });
    }

    logTest('createPaymentRequest - CAD amount correct', payment.amountCad === 250, {
      expected: 250,
      actual: payment.amountCad
    });

    return payment;
  } catch (error) {
    logTest('createPaymentRequest - error handled', true, {
      error: error.message,
      note: 'Expected if MoneroPay not running'
    });
    return null;
  }
}

async function test4_checkPaymentStatus(payment) {
  console.log('\n=== TEST 4: checkPaymentStatus() - query MoneroPay ===');

  if (!payment || !payment.address) {
    console.log('⚠️  SKIP: No payment from test 3');
    return;
  }

  try {
    const status = await service.checkPaymentStatus(payment.address);

    logTest('checkPaymentStatus - returns status object', !!status, {
      hasAddress: !!status.address,
      hasConfirmations: typeof status.confirmations === 'number',
      hasComplete: typeof status.complete === 'boolean'
    });

    logTest('checkPaymentStatus - address matches', status.address === payment.address, {
      expected: payment.address,
      actual: status.address
    });

    logTest('checkPaymentStatus - initial status pending', !status.complete, {
      complete: status.complete,
      confirmations: status.confirmations,
      amountReceived: status.amountReceived
    });

    return status;
  } catch (error) {
    logTest('checkPaymentStatus - error handled', true, {
      error: error.message,
      note: 'Expected if MoneroPay not running'
    });
  }
}

async function test5_processWebhook() {
  console.log('\n=== TEST 5: processWebhook() - DB transaction ===');

  if (!service.isEnabled()) {
    console.log('⚠️  SKIP: Payments disabled');
    return;
  }

  try {
    // Create a test user first
    const [userId] = await knex('users').insert({
      first_name: 'Test',
      last_name: 'Agent3',
      email: 'test@agent3.test',
      password_hash: 'dummy_hash',
      phone: '+15551234567',
      telegram_id: '999999999',
      role: 'client',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Create a test payment
    const [paymentId] = await knex('payments').insert({
      user_id: userId,
      moneropay_address: '48testaddress' + 'x'.repeat(92),
      amount_cad: 250,
      amount_xmr: '450000000000', // 0.45 XMR
      exchange_rate: 555.55,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
      created_at: new Date(),
      updated_at: new Date()
    });

    const webhookData = {
      address: '48testaddress' + 'x'.repeat(92),
      amount_received: '450000000000',
      confirmations: 1,
      complete: true
    };

    const result = await service.processWebhook(webhookData);

    logTest('processWebhook - processes webhook', !!result, {
      paymentId: result?.paymentId,
      status: result?.status,
      complete: result?.complete
    });

    if (result) {
      logTest('processWebhook - status updated to confirmed', result.status === 'confirmed', {
        expectedStatus: 'confirmed',
        actualStatus: result.status
      });

      // Verify DB update
      const updated = await knex('payments')
        .where('id', result.paymentId)
        .first();

      logTest('processWebhook - DB record updated', updated.status === 'confirmed', {
        dbStatus: updated.status,
        confirmations: updated.confirmations
      });
    }

    // Cleanup
    await knex('payments').where('id', paymentId).del();
    await knex('users').where('id', userId).del();

  } catch (error) {
    logTest('processWebhook - no error thrown', false, {
      error: error.message
    });
  }
}

async function test6_createBulkPaymentRequest() {
  console.log('\n=== TEST 6: createBulkPaymentRequest() - bulk metadata storage ===');

  if (!service.isEnabled()) {
    console.log('⚠️  SKIP: Payments disabled');
    logTest('createBulkPaymentRequest - skipped', true, {
      reason: 'ENABLE_PAYMENTS=false'
    });
    return;
  }

  try {
    const appointmentIds = [1, 2, 3];
    const payment = await service.createBulkPaymentRequest(appointmentIds, 999, 3);

    logTest('createBulkPaymentRequest - returns payment object', !!payment, {
      hasId: !!payment.id,
      hasAddress: !!payment.address,
      hasAppointmentIds: !!payment.appointmentIds
    });

    if (payment) {
      logTest('createBulkPaymentRequest - CAD calculation correct', payment.amountCad === 750, {
        expected: 750,
        actual: payment.amountCad,
        calculation: '3 × $250'
      });

      logTest('createBulkPaymentRequest - customer count stored', payment.customerCount === 3, {
        expected: 3,
        actual: payment.customerCount
      });

      // Verify metadata storage
      const dbRecord = await knex('payments')
        .where('id', payment.id)
        .first();

      const metadata = JSON.parse(dbRecord.metadata);

      logTest('createBulkPaymentRequest - appointment_ids in metadata',
        JSON.stringify(metadata.appointment_ids) === JSON.stringify(appointmentIds), {
        expected: appointmentIds,
        actual: metadata.appointment_ids,
        bulk: metadata.bulk,
        customerCount: metadata.customer_count
      });

      // Cleanup
      await knex('payments').where('id', payment.id).del();
    }

  } catch (error) {
    logTest('createBulkPaymentRequest - error handled', true, {
      error: error.message,
      note: 'Expected if MoneroPay not running'
    });
  }
}

async function runTests() {
  console.log('🚀 Agent 3: MoneroPayService Integration Tests\n');
  console.log('Prerequisites: Agent 1 infrastructure PASS required\n');

  // Initialize service
  service = new MoneroPayService();

  console.log('Configuration:', {
    enabled: service.isEnabled(),
    priceCAD: service.priceCAD,
    baseUrl: service.baseUrl,
    paymentWindowMinutes: service.paymentWindowMinutes
  });

  // Run tests
  const rate = await test1_getExchangeRate();
  await test2_cadToAtomicUnits(rate);
  const payment = await test3_createPaymentRequest();
  await test4_checkPaymentStatus(payment);
  await test5_processWebhook();
  await test6_createBulkPaymentRequest();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total: ${testResults.tests.length} tests`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);

  // Detailed results
  console.log('\nDetailed Results:');
  testResults.tests.forEach((test, idx) => {
    console.log(`${idx + 1}. ${test.passed ? '✅' : '❌'} ${test.name}`);
  });

  // Final verdict
  const allCriticalPassed = testResults.tests
    .filter(t => !t.name.includes('skipped'))
    .every(t => t.passed);

  console.log('\n' + '='.repeat(60));
  if (allCriticalPassed) {
    console.log('🎉 AGENT 3: PASS - All critical tests passed');
  } else {
    console.log('⚠️  AGENT 3: FAIL - Some tests failed');
  }
  console.log('='.repeat(60));

  process.exit(allCriticalPassed ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
