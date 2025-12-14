/**
 * Agent 1: Infrastructure Verification Smoke Test
 * Validates MoneroPay wallet initialization and service health
 */

const fetch = require('node-fetch');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TESTS = {
  walletFile: 'Wallet file exists',
  moneroPayAPI: 'MoneroPay API /receive responds',
  coinGecko: 'CoinGecko XMR/CAD rate available',
  noWalletErrors: 'No "No wallet file" errors in logs'
};

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('=== Agent 1: Infrastructure Verification ===\n');

  const results = {};

  // Test 1: Wallet file exists
  results.walletFile = await runTest(TESTS.walletFile, async () => {
    const { stdout } = await execPromise('docker exec lodge-monero-wallet-rpc ls -la /home/monero/wallet/lodge_primary');
    if (!stdout.includes('lodge_primary')) {
      throw new Error('Wallet file not found');
    }
  });

  // Test 2: MoneroPay API responds
  results.moneroPayAPI = await runTest(TESTS.moneroPayAPI, async () => {
    const response = await fetch('http://localhost:5000/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1000000000000,
        description: 'smoke-test'
      })
    });

    // Accept any response (200 or 400) as long as API is responding
    // 400 is ok - might be duplicate subaddress from previous tests
    if (!response.ok && response.status !== 400) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }
  });

  // Test 3: CoinGecko exchange rate
  results.coinGecko = await runTest(TESTS.coinGecko, async () => {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=cad');
    if (!response.ok) {
      throw new Error(`CoinGecko API failed: ${response.status}`);
    }
    const data = await response.json();
    if (!data.monero || !data.monero.cad) {
      throw new Error('No XMR/CAD rate in response');
    }
    console.log(`  Rate: 1 XMR = $${data.monero.cad} CAD`);
  });

  // Test 4: No wallet errors in logs
  results.noWalletErrors = await runTest(TESTS.noWalletErrors, async () => {
    const { stdout } = await execPromise('docker logs lodge-moneropay --since 5m 2>&1');
    if (stdout.includes('No wallet file')) {
      throw new Error('Found "No wallet file" errors in recent logs');
    }
  });

  // Summary
  console.log('\n=== Summary ===');
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  console.log(`Passed: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n✓ PASS - All infrastructure checks passed');
    process.exit(0);
  } else {
    console.log('\n✗ FAIL - Some checks failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
