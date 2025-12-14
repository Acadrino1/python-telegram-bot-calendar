# Payment API Smoke Tests

API endpoint integration tests for MoneroPay payment system.

## Test Files

### Agent 2: API Endpoint Integration Tests
**File:** `agent2-api-endpoints.js`

Tests payment API endpoints with real HTTP calls:
- POST /api/payments/webhook (missing address, unknown address, partial/complete payments)
- GET /api/payments/:id/status (valid/invalid IDs)
- POST /api/payments/expire-old (expiry logic)

## Prerequisites

1. **Database Setup:**
   ```bash
   npm run migrate
   ```

2. **API Server Running:**
   ```bash
   npm run start:api
   ```
   Server must be running on `http://localhost:3000`

3. **API Key Configuration:**

   Option A: Set in `.env` file:
   ```bash
   API_KEY=your-secret-api-key-here
   ```

   Option B: Disable API key for testing:
   ```bash
   API_KEY_REQUIRED=false
   ```

   Option C: Pass via command line:
   ```bash
   API_KEY=your-key node tests/smoke/agent2-api-endpoints.js
   ```

## Running Tests

```bash
# Standard run (reads API_KEY from .env)
node tests/smoke/agent2-api-endpoints.js

# With API key inline
API_KEY=your-secret-api-key-here node tests/smoke/agent2-api-endpoints.js

# Custom API base URL
API_BASE_URL=http://localhost:8080 node tests/smoke/agent2-api-endpoints.js
```

## Test Scenarios

### 1. Webhook Validation
- ✓ Missing address → 400
- ✓ Unknown address → 404
- ✓ Partial payment (amount < expected) → 200, status='partial'
- ✓ Complete payment (amount >= expected) → 200, status='confirmed'

### 2. Status Endpoint
- ✓ Valid payment ID → 200 with payment data
- ✓ Non-existent ID → 404

### 3. Expiry Logic
- ✓ Create payment with past expires_at
- ✓ Call /expire-old endpoint
- ✓ Verify status='expired' in database

### 4. Performance
- ✓ All response times <1s
- ✓ Proper error codes

## Expected Output

```
═══════════════════════════════════════════════════════════════
Starting API Endpoint Tests
═══════════════════════════════════════════════════════════════

─── Scenario 1: Webhook Validation ───
PASS Webhook: Missing address → 400 (15ms)
PASS Webhook: Unknown address → 404 (12ms)
PASS Webhook: Partial payment → 200, status=partial (8ms, DB updated correctly)
PASS Webhook: Complete payment → 200, status=confirmed (7ms, DB updated with confirmed_at)

─── Scenario 2: Status Endpoint ───
PASS Status: Valid payment ID → 200 with data (6ms)
PASS Status: Non-existent ID → 404 (5ms)

─── Scenario 3: Expiry Logic ───
PASS Expire: Old pending payment → status=expired (9ms, 1 payment(s) expired)

─── Scenario 4: Performance ───
PASS Performance: Response time <1s (4ms)

═══════════════════════════════════════════════════════════════
FINAL RESULT: PASS
═══════════════════════════════════════════════════════════════
```

## Troubleshooting

### Rate Limiting (429 errors)
If tests fail with 429 errors:
1. Check `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` in `.env`
2. Increase delays in test file
3. Or disable rate limiting for testing:
   ```bash
   # In config/features.js or .env
   FEATURE_SECURITY_RATE_LIMITING=false
   ```

### API Key Issues (401 errors)
- Ensure API_KEY is set in `.env`
- Or set `API_KEY_REQUIRED=false`
- Check that key matches between test and server

### Database Issues
- Run migrations: `npm run migrate`
- Verify `payments` table exists
- Check database connection in `knexfile.js`

## Integration with CI/CD

```yaml
# .github/workflows/test.yml
- name: Run Payment API Tests
  env:
    API_KEY: ${{ secrets.API_KEY }}
    API_KEY_REQUIRED: false
  run: |
    npm run start:api &
    sleep 5
    node tests/smoke/agent2-api-endpoints.js
```
