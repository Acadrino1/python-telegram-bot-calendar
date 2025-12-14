# MoneroPay API Testing - Quick Start Guide

## 3 Ways to Test the API

### Method 1: Automated Jest Tests (Recommended for CI/CD)

```bash
# Run all MoneroPay tests
npm run test -- tests/integration/moneropay-api.test.js

# Run with detailed output
npm run test -- tests/integration/moneropay-api.test.js --verbose

# Run with coverage report
npm run test:coverage -- tests/integration/moneropay-api.test.js

# Watch mode (re-run on file changes)
npm run test -- --watch tests/integration/moneropay-api.test.js
```

**Test Coverage:**
- Webhook validation (missing/unknown address)
- Partial payment processing
- Payment completion
- Payment status retrieval
- Expired payment handling
- Error handling & malformed data

**Duration:** ~30 seconds
**Result Format:** Jest TAP output with pass/fail per test

---

### Method 2: Manual Test Script (For Debugging)

Start the API server first:
```bash
# Terminal 1: Start API
npm run start:api
# Should show: "Appointment Scheduler API Server Started"
```

Then run tests:
```bash
# Terminal 2: Run manual tests
node tests/moneropay-endpoints-test.js
```

**Output:**
```
═══ Database Setup ═══
✓ Created test user: ID 1
✓ Created test appointment: ID 1

▶ Test 1: Webhook - Missing Address (Should fail with 400)
  POST /api/payments/webhook
  400 Bad Request
  {"error":"Missing address"}
✓ Correctly rejected webhook with missing address

▶ Test 2: Webhook - Unknown Address (Should fail with 404)
  ...
```

**Advantages:**
- Colored output (easy to read)
- Shows request/response details
- Database cleanup after each test
- Can pause/debug individual tests

**Duration:** ~20 seconds
**Result Format:** Colored console with ✓/✗ per test

---

### Method 3: cURL Commands (For Manual API Testing)

**Start the API:**
```bash
npm run start:api
```

#### Test 1: Webhook - Missing Address ❌

```bash
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "amount_received": 0,
    "confirmations": 0
  }'
```

**Expected Response:**
```json
{
  "error": "Missing address",
  "status": 400
}
```

---

#### Test 2: Webhook - Unknown Address ❌

```bash
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "address": "unknown_address_xyz",
    "amount_received": 0,
    "confirmations": 0,
    "complete": false
  }'
```

**Expected Response:**
```json
{
  "error": "Payment not found",
  "status": 404
}
```

---

#### Test 3: Create Payment & Process Webhook ✓

First, get a payment address from your system:

```bash
# Step 1: Create a payment record (manually via SQL or API)
# For testing, insert directly:
sqlite3 database.sqlite << 'EOF'
INSERT INTO payments (
  appointment_id, user_id, moneropay_address,
  amount_cad, amount_xmr, exchange_rate, status,
  expires_at, metadata, created_at, updated_at
) VALUES (
  1, 1, '48fT5T5VEjNrK5cLPLV4agpF5x8k3CUhp2hUZjNrSWLJLaHvNzFz12fVaLxTp2bhXB6vdJvf5LhKzfysFQ6nRWvvNE8Yd6A',
  250, '1000000000000', 250.00, 'pending',
  datetime('now', '+30 minutes'), '{}', datetime('now'), datetime('now')
);
EOF

# Step 2: Send partial payment webhook
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "address": "48fT5T5VEjNrK5cLPLV4agpF5x8k3CUhp2hUZjNrSWLJLaHvNzFz12fVaLxTp2bhXB6vdJvf5LhKzfysFQ6nRWvvNE8Yd6A",
    "amount": 1000000000000,
    "amount_received": 500000000000,
    "confirmations": 1,
    "complete": false
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "status": "partial"
}
```

**Step 3: Send completion webhook**
```bash
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "address": "48fT5T5VEjNrK5cLPLV4agpF5x8k3CUhp2hUZjNrSWLJLaHvNzFz12fVaLxTp2bhXB6vdJvf5LhKzfysFQ6nRWvvNE8Yd6A",
    "amount": 1000000000000,
    "amount_received": 1000000000000,
    "confirmations": 10,
    "complete": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "status": "confirmed"
}
```

---

#### Test 4: Check Payment Status ✓

```bash
# Get payment ID from previous step (e.g., ID 1)
curl -X GET http://localhost:3000/api/payments/1/status
```

**Expected Response:**
```json
{
  "id": 1,
  "status": "confirmed",
  "amountCad": 250,
  "amountXmr": "1.000000000000",
  "amountReceived": "1.000000000000",
  "confirmations": 10,
  "complete": true,
  "expiresAt": "2025-12-14T20:30:00Z"
}
```

---

#### Test 5: Non-Existent Payment ❌

```bash
curl -X GET http://localhost:3000/api/payments/999999/status
```

**Expected Response:**
```json
{
  "error": "Payment not found",
  "status": 404
}
```

---

#### Test 6: Expire Old Payments ✓

```bash
curl -X POST http://localhost:3000/api/payments/expire-old \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "expired": 0
}
```

(0 if no expired payments exist, > 0 if some were expired)

---

## Test Environment Configuration

### Before Running Tests

Create/update `.env`:

```bash
# Required for API
NODE_ENV=development
PORT=3000
DATABASE_URL=sqlite:./database.sqlite
ENABLE_PAYMENTS=true

# MoneroPay (optional, test will work without it)
MONEROPAY_URL=http://localhost:5000
APPOINTMENT_PRICE_CAD=250
PAYMENT_WINDOW_MINUTES=30

# For Telegram notifications (optional)
TELEGRAM_BOT_TOKEN=your-token-here
```

### Database Setup

```bash
# Run migrations to create payments table
npm run migrate

# Verify payments table exists
sqlite3 database.sqlite ".schema payments"
```

---

## Interpreting Test Results

### Jest Test Output

```
PASS tests/integration/moneropay-api.test.js
  MoneroPay API Endpoints
    POST /api/payments/webhook - Webhook Handling
      ✓ should reject webhook with missing address (45 ms)
      ✓ should return 404 for unknown payment address (32 ms)
      ✓ should process valid webhook for partial payment (78 ms)
      ✓ should process valid webhook for complete payment (51 ms)
    GET /api/payments/:id/status - Status Checking
      ✓ should return 404 for non-existent payment (28 ms)
      ✓ should return payment status (35 ms)
    ✓ All tests passed

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

**Green ✓ = All Good**
**Red ✗ = Failed - See error message**

### Manual Test Script Output

```
✓ Test 1: Webhook - Missing Address: PASS
✗ Test 2: Webhook - Unknown Address: FAIL
  Expected status 404, got 500
  Check: logs for errors

Total: 7/8 tests passed
1 test(s) failed
```

---

## Troubleshooting

### API Not Starting

```bash
# Check port is available
lsof -i :3000
# Kill if needed
kill -9 <PID>

# Check database
npm run migrate
```

### Tests Timeout

```bash
# Increase timeout in jest.config.js
testTimeout: 30000  // 30 seconds
```

### Database Locked

```bash
# Reset database
rm database.sqlite
npm run migrate
```

### Webhook Not Processing

```bash
# Check logs
tail -f logs/app.log

# Verify address format (should be 106 chars for Monero)
# Should match: [48][a-zA-Z0-9]{104}
```

---

## Test Results Summary

### Coverage Matrix

| Endpoint | Method | Error Case | Success Case | Status |
|----------|--------|-----------|--------------|--------|
| /api/payments/webhook | POST | Missing address | Partial/Complete | ✓ |
| /api/payments/:id/status | GET | Non-existent | Valid payment | ✓ |
| /api/payments/expire-old | POST | N/A | Count expired | ✓ |

### Error Handling

| Scenario | HTTP Code | Tested |
|----------|-----------|--------|
| Missing address | 400 | ✓ |
| Unknown payment | 404 | ✓ |
| Server error | 500 | ✓ |
| Malformed JSON | 400/500 | ✓ |

### Status Transitions

| From | To | Triggered By | Tested |
|------|----|--------------|----|
| pending | partial | Partial webhook | ✓ |
| pending | confirmed | Complete webhook | ✓ |
| pending | expired | Expire cron | ✓ |
| partial | confirmed | Complete webhook | ✓ |

---

## Next Steps

After successful testing:

1. **Integration**: Connect to real MoneroPay instance
   - Update MONEROPAY_URL in .env
   - Verify webhook delivery

2. **Load Testing**: Test high volume
   ```bash
   # Load test framework
   npm install --save-dev autocannon
   npx autocannon http://localhost:3000/api/payments/1/status
   ```

3. **Security Review**:
   - [ ] Webhook signature verification
   - [ ] Rate limiting on payment endpoints
   - [ ] SQL injection prevention (uses ORM ✓)
   - [ ] CORS configuration

4. **Production Deployment**:
   - [ ] Enable audit logging
   - [ ] Setup error alerts
   - [ ] Configure backup strategy
   - [ ] Document runbooks

---

## File References

| File | Purpose |
|------|---------|
| `tests/integration/moneropay-api.test.js` | Automated Jest tests |
| `tests/moneropay-endpoints-test.js` | Manual test script |
| `src/routes/payments.js` | API endpoints |
| `src/services/MoneroPayService.js` | Business logic |
| `MONEROPAY_API_TEST_REPORT.md` | Detailed test report |

---

**Quick Commands Cheat Sheet:**

```bash
# Run tests (pick one)
npm run test -- tests/integration/moneropay-api.test.js      # Jest
node tests/moneropay-endpoints-test.js                        # Manual
curl http://localhost:3000/api/payments/1/status              # cURL

# Start API
npm run start:api

# Check status
curl http://localhost:3000/health

# View database
sqlite3 database.sqlite "SELECT * FROM payments;"

# Clean up
rm database.sqlite && npm run migrate
```

**Happy Testing!** 🚀
