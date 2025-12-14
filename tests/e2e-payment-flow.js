/**
 * E2E Test: Registration → Payment Invoice Flow
 * Automates the full booking flow to verify payment invoice generation
 */

const { Telegraf } = require('telegraf');
const session = require('telegraf/session');

// Simulated test user
const TEST_USER = {
  id: 999999,
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser'
};

// Registration data
const REGISTRATION_DATA = {
  firstName: 'John',
  middleName: 'skip',
  lastName: 'Doe',
  dateOfBirth: '01/15/1990',
  suiteUnit: 'skip',
  streetNumber: '123',
  streetAddress: 'Main Street',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M5H 2N2',
  driverLicense: 'skip',
  dlIssued: 'skip',
  dlExpiry: 'skip'
};

class E2EPaymentTest {
  constructor() {
    this.results = {
      steps: [],
      paymentInvoiceGenerated: false,
      paymentData: null,
      errors: []
    };
  }

  log(step, status, data = {}) {
    const entry = { step, status, timestamp: new Date().toISOString(), ...data };
    this.results.steps.push(entry);
    console.log(`${status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳'} ${step}`, data);
  }

  async simulateRegistrationFlow() {
    console.log('\n=== E2E Payment Flow Test ===\n');

    try {
      // Step 1: Create test user in DB
      this.log('Create test user in database', 'START');
      const User = require('../src/models/User');
      const { Model } = require('objection');
      const Knex = require('knex');
      const knexConfig = require('../knexfile')[process.env.NODE_ENV || 'development'];
      const knex = Knex(knexConfig);
      Model.knex(knex);

      // Clean up any existing test user
      await knex('users').where('telegram_id', TEST_USER.id.toString()).del();

      const testUser = await User.query().insert({
        telegram_id: TEST_USER.id.toString(),
        first_name: REGISTRATION_DATA.firstName,
        last_name: REGISTRATION_DATA.lastName,
        email: `test_${TEST_USER.id}@test.local`,
        password_hash: 'test',
        role: 'client',
        is_active: true,
        approval_status: 'approved',
        registration_source: 'telegram'
      });

      this.log('Create test user in database', 'PASS', { userId: testUser.id });

      // Step 2: Simulate registration completion
      this.log('Simulate registration data', 'START');
      const mockCtx = {
        from: TEST_USER,
        session: {
          registration: {
            data: REGISTRATION_DATA,
            step: 'confirm'
          },
          customerInfo: REGISTRATION_DATA
        },
        answerCbQuery: async () => {},
        editMessageText: async (text, opts) => {
          console.log('📝 Bot message:', text.substring(0, 100) + '...');

          // Check if payment invoice message
          if (text.includes('Payment Required') || text.includes('💰')) {
            this.results.paymentInvoiceGenerated = true;
            this.log('Payment invoice message sent', 'PASS', { message: text });
          }

          // Check for calendar (should NOT appear before payment)
          if (text.includes('Time to Book') || text.includes('Select Appointment Date')) {
            this.log('Calendar shown before payment', 'FAIL', { message: text });
            this.results.errors.push('Calendar shown before payment confirmation');
          }
        },
        replyWithPhoto: async (url, opts) => {
          console.log('📷 QR code sent:', url.substring(0, 80) + '...');
          this.log('QR code sent', 'PASS', { url });
        },
        reply: async (text, opts) => {
          console.log('💬 Reply:', text.substring(0, 100) + '...');
        }
      };

      this.log('Simulate registration data', 'PASS');

      // Step 3: Check if payment is enabled
      this.log('Check payment service enabled', 'START');
      const MoneroPayService = require('../src/services/MoneroPayService');
      const moneroPayService = new MoneroPayService();
      const isEnabled = moneroPayService.isEnabled();

      this.log('Check payment service enabled', isEnabled ? 'PASS' : 'FAIL', {
        enabled: isEnabled,
        envVar: process.env.ENABLE_PAYMENTS
      });

      if (!isEnabled) {
        this.results.errors.push('ENABLE_PAYMENTS not set to true');
        throw new Error('Payment service not enabled - cannot test flow');
      }

      // Step 4: Test payment creation directly
      this.log('Create payment request', 'START');
      try {
        const paymentData = await moneroPayService.createPaymentRequest(
          null,
          testUser.id,
          'E2E Test Payment'
        );

        this.results.paymentData = paymentData;
        this.log('Create payment request', 'PASS', {
          paymentId: paymentData.id,
          address: paymentData.address.substring(0, 20) + '...',
          amountCAD: paymentData.amountCad,
          amountXMR: paymentData.amountXmr
        });

        // Verify payment stored in DB
        const dbPayment = await knex('payments').where('id', paymentData.id).first();
        if (dbPayment) {
          this.log('Payment stored in database', 'PASS', {
            paymentStatus: dbPayment.status,
            amount_cad: dbPayment.amount_cad
          });
        } else {
          this.log('Payment stored in database', 'FAIL');
          this.results.errors.push('Payment not found in database');
        }

      } catch (error) {
        this.log('Create payment request', 'FAIL', { error: error.message });
        this.results.errors.push(`Payment creation failed: ${error.message}`);
      }

      // Step 5: Test RegistrationHandler payment logic
      this.log('Test RegistrationHandler payment flow', 'START');
      const RegistrationHandler = require('../src/services/enhanced/handlers/RegistrationHandler');
      const PaymentHandler = require('../src/bot/handlers/PaymentHandler');

      const paymentHandler = new PaymentHandler();
      paymentHandler.moneroPayService = moneroPayService;

      const services = {
        paymentHandler: paymentHandler
      };

      const registrationHandler = new RegistrationHandler(services);

      try {
        const result = await registrationHandler.handlePaymentCreation(mockCtx);
        if (result === true && this.results.paymentInvoiceGenerated) {
          this.log('Test RegistrationHandler payment flow', 'PASS');
        } else {
          this.log('Test RegistrationHandler payment flow', 'FAIL', {
            result,
            invoiceGenerated: this.results.paymentInvoiceGenerated
          });
          this.results.errors.push('RegistrationHandler returned but invoice not confirmed');
        }
      } catch (error) {
        this.log('Test RegistrationHandler payment flow', 'FAIL', { error: error.message });
        this.results.errors.push(`RegistrationHandler.handlePaymentCreation failed: ${error.message}`);
      }

      // Cleanup
      await knex('payments').where('user_id', testUser.id).del();
      await knex('users').where('id', testUser.id).del();
      await knex.destroy();

    } catch (error) {
      this.log('E2E Test', 'FAIL', { error: error.message });
      this.results.errors.push(error.message);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('E2E PAYMENT FLOW TEST SUMMARY');
    console.log('='.repeat(60));

    // Debug: show all step statuses
    console.log('\n📋 Step Status Breakdown:');
    this.results.steps.forEach((s, i) => {
      console.log(`  ${i+1}. [${s.status}] ${s.step}`);
    });

    const passed = this.results.steps.filter(s => s.status === 'PASS').length;
    const failed = this.results.steps.filter(s => s.status === 'FAIL').length;
    const total = this.results.steps.filter(s => s.status !== 'START').length;

    console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%`);

    console.log('\n📊 Key Results:');
    console.log(`  Payment Invoice Generated: ${this.results.paymentInvoiceGenerated ? '✅ YES' : '❌ NO'}`);
    console.log(`  Payment Data Received: ${this.results.paymentData ? '✅ YES' : '❌ NO'}`);

    if (this.results.paymentData) {
      console.log(`  Payment Amount: $${this.results.paymentData.amountCad} CAD = ${this.results.paymentData.amountXmr} XMR`);
      console.log(`  Payment Address: ${this.results.paymentData.address.substring(0, 30)}...`);
    }

    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.results.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    if (this.results.paymentInvoiceGenerated && this.results.errors.length === 0) {
      console.log('✅ PASS - Payment invoice flow working correctly');
      process.exit(0);
    } else {
      console.log('❌ FAIL - Payment invoice flow has issues');
      process.exit(1);
    }
  }
}

// Run test
async function main() {
  const test = new E2EPaymentTest();
  await test.simulateRegistrationFlow();
  test.printSummary();
}

main().catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});
