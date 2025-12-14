# MoneroPay API Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       LODGE SCHEDULER SYSTEM                        │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐        ┌──────────────────┐        ┌──────────────┐
│  Frontend/Bot    │        │   Lodge API      │        │    Database  │
│  (Telegram)      │◄──────►│  (Node.js/Expr) │◄──────►│  (MySQL/Lite)│
└──────────────────┘        └──────────────────┘        └──────────────┘
                                    ▲
                                    │
                            ┌───────┴───────┐
                            │               │
                    ┌───────▼──────┐  ┌────▼─────────┐
                    │ MoneroPay    │  │ CoinGecko    │
                    │ Service      │  │ Exchange Rate│
                    └──────────────┘  └──────────────┘
```

---

## Single Appointment Payment Flow

```
USER                TELEGRAM BOT         LODGE API            DATABASE          MONEROPAY
 │                      │                    │                   │                  │
 │ Book Appointment      │                    │                   │                  │
 ├─────────────────────►│                    │                   │                  │
 │                      │ Create Payment Req  │                   │                  │
 │                      ├───────────────────►│ Fetch Exchange Rate│                  │
 │                      │                    ├──────────────────────────────────────►│
 │                      │                    │◄──────────────────────────────────────┤
 │                      │                    │ CAD $250 ≈ 1.38 XMR (rate: 180.50)   │
 │                      │                    │                   │                  │
 │                      │                    │ POST /receive      │                  │
 │                      │                    ├──────────────────────────────────────►│
 │                      │                    │                   │                  │
 │                      │                    │                   │ Response:        │
 │                      │                    │◄──────────────────────────────────────┤
 │                      │                    │ {address, payment_id}                │
 │                      │                    │                   │                  │
 │                      │                    │ INSERT into payments │                  │
 │                      │                    ├──────────────────►│                  │
 │                      │                    │                   │                  │
 │ "Send 1.38 XMR to    │                    │                   │                  │
 │  48fT5T5VEj..."      │                    │                   │                  │
 │◄─────────────────────┤                    │                   │                  │
 │                      │                    │                   │                  │
 │ [User sends payment]  │                   │                   │                  │
 │                      │                    │                   │                  │
 │                      │                    │                   │                  │
 ├ 0.5 XMR (partial)    │                    │                   │                  │
 │                      │                    │                   │ Receive          │
 │                      │                    │ POST /webhook     ├─────────────────►│
 │                      │                    │ {address, 0.5 xmr}│                  │
 │                      │                    │◄─────────────────────────────────────┤
 │                      │                    │ {confirmations: 1}                   │
 │                      │                    │                   │                  │
 │                      │                    │ UPDATE: status='partial'             │
 │                      │                    ├──────────────────►│                  │
 │                      │                    │                   │                  │
 │ "Awaiting full       │                    │                   │                  │
 │  payment..."         │                    │                   │                  │
 │◄─────────────────────┤                    │                   │                  │
 │                      │                    │                   │                  │
 ├ 0.88 XMR (remaining) │                   │                   │                  │
 │                      │                    │                   │ Receive          │
 │                      │                    │ POST /webhook     ├─────────────────►│
 │                      │                    │ {address, 1.38}   │                  │
 │                      │                    │◄─────────────────────────────────────┤
 │                      │                    │ {confirmations: 10, complete: true}  │
 │                      │                    │                   │                  │
 │                      │                    │ UPDATE: status='confirmed'           │
 │                      │                    ├──────────────────►│                  │
 │                      │                    │                   │                  │
 │                      │                    │ UPDATE: appointm.status='confirmed'  │
 │                      │                    ├──────────────────►│                  │
 │                      │                    │                   │                  │
 │ "✓ Payment Received! │                    │                   │                  │
 │  Appointment Conf."  │                    │                   │                  │
 │◄─────────────────────┤                    │                   │                  │
 │                      │                    │                   │                  │
```

---

## Webhook Status Transition Diagram

```
                          CREATE PAYMENT
                                │
                                ▼
                    ┌─────────────────────┐
                    │     PENDING         │ (No funds received yet)
                    └────────┬────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
        [PARTIAL]    [EXPIRES]    [CONFIRMED]
           │            │              │
           ▼            ▼              │
    (Some $ recv)  (Time expired)      │
           │            │              │
           └─────────────────────┐     │
                                 ▼     ▼
                            ┌────────────────┐
                            │ PARTIAL/EXPIRED/│
                            │  CONFIRMED     │
                            └────────────────┘


DETAILED STATUS LOGIC:

┌──────────────────────────────────────────────────────────────┐
│           WEBHOOK PROCESSING LOGIC                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Input: {complete, amount_received, confirmations}          │
│                                                              │
│  ┌─── Is complete=true?                                    │
│  │                                                          │
│  ├─YES─► status = 'confirmed'  ──┐                        │
│  │                               │                        │
│  └─NO──► Is amount_received > 0? │                        │
│          │                       │                        │
│          ├─YES─► Is amount ≥ expected? │                  │
│          │       │                     │                  │
│          │       ├─YES─► confirmations ≥ 1?              │
│          │       │       │                                │
│          │       │       ├─YES─► 'confirmed'  ┐         │
│          │       │       └─NO──► 'partial'    │         │
│          │       │                            ├──────┐   │
│          │       └─NO──► 'partial'  ────────┘     │   │
│          │                                        │   │
│          └─NO──► status unchanged                 │   │
│                                                    │   │
│  ┌──────────────────────────────────────────────┘   │
│  │                                                   │
│  ▼                                                   ▼
│ [Status Updated]                              [Appointments Updated]
│                                                 [Telegram Notified]
│
└──────────────────────────────────────────────────────────────┘
```

---

## Bulk Payment Flow

```
USER                TELEGRAM BOT         LODGE API            DATABASE
 │                      │                    │                   │
 │ Upload CSV (3 cust)  │                    │                   │
 ├─────────────────────►│                    │                   │
 │                      │ Create Bulk Payment│                   │
 │                      ├───────────────────►│                   │
 │                      │                    │ Calc: 3 × $250    │
 │                      │                    │       = $750       │
 │                      │                    │       ≈ 4.15 XMR   │
 │                      │                    │                   │
 │                      │                    │ POST /receive      │
 │                      │                    ├──► MoneroPay      │
 │                      │                    │ {amount: 4.15 XMR}│
 │                      │                    │                   │
 │                      │ "Send 4.15 XMR     │ INSERT payments   │
 │                      │  for 3 appts..."   ├──────────────────►│
 │                      │                    │                   │
 │ "Awaiting Payment"   │                    │ metadata:         │
 │◄─────────────────────┤                    │ { bulk: true,     │
 │                      │                    │   appointment_ids: │
 │                      │                    │     [1, 2, 3] }   │
 │                      │                    │                   │
 ├ Send 4.15 XMR        │                   │                   │
 │                      │                    │ POST /webhook      │
 │                      │                    │ {complete: true}   │
 │                      │                    │                   │
 │                      │ "Payment Confirm!" │ UPDATE appts 1-3   │
 │                      │ "All 3 Confirmed!"  ├──────────────────►│
 │ "✓ All confirmed!"   │                    │                   │
 │◄─────────────────────┤                    │                   │
 │                      │                    │                   │
```

---

## API Endpoint Request/Response Flow

```
╔════════════════════════════════════════════════════════════════╗
║         POST /api/payments/webhook                             ║
╚════════════════════════════════════════════════════════════════╝

REQUEST:
┌─────────────────────────────────────────┐
│ POST /api/payments/webhook              │
│ Content-Type: application/json          │
│                                         │
│ {                                       │
│   "address": "48fT5T5VEj...",          │
│   "amount": 1000000000000,             │ ◄─ piconero
│   "amount_received": 500000000000,     │
│   "confirmations": 3,                   │
│   "complete": false                     │
│ }                                       │
└─────────────────────────────────────────┘

PROCESSING:
┌─────────────────────────────────────────┐
│ 1. Validate: address exists?             │
│    └─ No  ──► 400 "Missing address"    │
│    └─ Yes ──► Continue                 │
│                                         │
│ 2. Find: Payment.where({address})       │
│    └─ Not found ──► 404 "Not found"    │
│    └─ Found     ──► Continue            │
│                                         │
│ 3. Calculate: New status                │
│    └─ Logic: (see diagram above)       │
│                                         │
│ 4. Update: Database                     │
│    └─ SET status='partial'             │
│    └─ SET amount_received=500...       │
│    └─ SET confirmations=3              │
│    └─ SET updated_at=NOW()             │
│                                         │
│ 5. Notify: Telegram (if confirmed)      │
│    └─ SendMessage if status='confirm'  │
│    └─ Ignore if partial                │
└─────────────────────────────────────────┘

RESPONSE:
┌─────────────────────────────────────────┐
│ HTTP 200                                │
│                                         │
│ {                                       │
│   "success": true,                      │
│   "status": "partial"                   │
│ }                                       │
└─────────────────────────────────────────┘


╔════════════════════════════════════════════════════════════════╗
║         GET /api/payments/:id/status                           ║
╚════════════════════════════════════════════════════════════════╝

REQUEST:
┌─────────────────────────────────────────┐
│ GET /api/payments/123/status            │
└─────────────────────────────────────────┘

PROCESSING:
┌─────────────────────────────────────────┐
│ 1. Find: Payment.where({id})            │
│    └─ Not found ──► 404 "Not found"    │
│    └─ Found     ──► Continue            │
│                                         │
│ 2. Try: Call MoneroPay API              │
│    ┌─ Success ──► Update from live API │
│    └─ Fail    ──► Use DB values only   │
│                                         │
│ 3. Format: Response                     │
│    └─ Convert atomicToXmr               │
│    └─ Format decimals (12 places)       │
└─────────────────────────────────────────┘

RESPONSE (Success):
┌─────────────────────────────────────────┐
│ HTTP 200                                │
│                                         │
│ {                                       │
│   "id": 123,                            │
│   "status": "partial",                  │
│   "amountCad": 250,                     │
│   "amountXmr": "1.383948302840",       │
│   "amountReceived": "0.691974151420",  │
│   "confirmations": 3,                   │
│   "complete": false,                    │
│   "expiresAt": "2025-12-14T20:30:00Z"  │
│ }                                       │
└─────────────────────────────────────────┘

RESPONSE (Fallback - MoneroPay unavailable):
┌─────────────────────────────────────────┐
│ HTTP 200 (still succeeds!)              │
│                                         │
│ {                                       │
│   "id": 123,                            │
│   "status": "partial",                  │
│   "amountCad": 250,                     │
│   "amountXmr": "1.383948302840",       │
│   "expiresAt": "2025-12-14T20:30:00Z", │
│   "error": "Unable to fetch live status"│
│ }                                       │
└─────────────────────────────────────────┘


╔════════════════════════════════════════════════════════════════╗
║         POST /api/payments/expire-old                          ║
╚════════════════════════════════════════════════════════════════╝

REQUEST:
┌─────────────────────────────────────────┐
│ POST /api/payments/expire-old           │
│ Content-Type: application/json          │
│                                         │
│ {} (no body)                            │
└─────────────────────────────────────────┘

PROCESSING:
┌─────────────────────────────────────────┐
│ 1. Query: Find all expired               │
│    WHERE status='pending'               │
│    AND expires_at < NOW()               │
│                                         │
│ 2. Update: Mark as expired              │
│    SET status='expired'                 │
│    SET updated_at=NOW()                 │
│                                         │
│ 3. Count: Results                       │
│    └─ Return count of updated rows      │
└─────────────────────────────────────────┘

RESPONSE:
┌─────────────────────────────────────────┐
│ HTTP 200                                │
│                                         │
│ {                                       │
│   "expired": 2                          │
│ }                                       │
└─────────────────────────────────────────┘
```

---

## Currency Conversion Flow

```
USER PAYS WITH XMR:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  User needs: $250 CAD                                      │
│       ↓                                                    │
│  Get XMR Rate: CoinGecko API                              │
│       ↓                                                    │
│  Rate: 1 XMR = $180.50 CAD                                │
│       ↓                                                    │
│  Calculate: 250 ÷ 180.50 = 1.3848... XMR                 │
│       ↓                                                    │
│  Convert to Piconero: 1.3848 × 10¹² = 1,384,849,316,240  │
│       (using Math.ceil for rounding up)                   │
│       ↓                                                    │
│  Display to User: "Send 1.384849316240 XMR"               │
│                   └─ 12 decimal places                    │
│                                                            │
│  User Sends: 1.384849316240 XMR                           │
│       ↓                                                    │
│  Amount Received (piconero): 1,384,849,316,240            │
│       ↓                                                    │
│  Convert Back: 1,384,849,316,240 ÷ 10¹² = 1.384849316240 │
│                                                            │
│  Status: CONFIRMED ✓                                      │
│                                                            │
└────────────────────────────────────────────────────────────┘

PRECISION HANDLING:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  CAD to Atomic Units:                                      │
│  ├─ Input: CAD amount (250)                              │
│  ├─ Get: XMR rate (180.50)                               │
│  ├─ Calculate: (250 ÷ 180.50) × 10¹²                     │
│  ├─ Round Up: Math.ceil() to avoid underpaying           │
│  └─ Return: String (to preserve precision in DB)          │
│                                                            │
│  Atomic Units to XMR:                                      │
│  ├─ Input: Piconero string                               │
│  ├─ Use BigInt: Handle large numbers exactly             │
│  ├─ Format: Integer part / 10¹², remainder × 10⁻¹²       │
│  ├─ Pad: 12 decimal places with zeros                    │
│  └─ Return: "1.000000000000" format                       │
│                                                            │
│  Why String Storage:                                       │
│  ├─ JavaScript floats lose precision > 15 digits         │
│  ├─ XMR amounts need 12 decimals × large numbers         │
│  └─ String + BigInt = Exact calculations                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Error Handling Decision Tree

```
                         ┌─── Webhook Received
                         │
                         ▼
                   ┌─────────────┐
                   │ Has Address?│
                   └──┬──────┬──┘
                      │      │
                   NO │      │ YES
                      ▼      ▼
                   400   ┌──────────────┐
                        │ In Database? │
                        └──┬────────┬──┘
                           │        │
                        NO │        │ YES
                           ▼        ▼
                         404    Process Webhook
                              ┌─────────────────┐
                              │ Valid JSON?     │
                              └──┬──────────┬──┘
                                 │         │
                              NO │         │ YES
                                 ▼         ▼
                                500   Update Status
                                    ┌───────────────┐
                                    │ DB Error?     │
                                    └──┬────────┬──┘
                                       │        │
                                    YES│        │ NO
                                       ▼        ▼
                                      500     200 ✓
                                           + Notify


                    Status Check Endpoint

                         ┌─── GET /:id
                         │
                         ▼
                   ┌─────────────┐
                   │ In Database?│
                   └──┬──────┬──┘
                      │      │
                   NO │      │ YES
                      ▼      ▼
                     404   Try MoneroPay API
                         ┌──────────────────┐
                         │ API Available?   │
                         └──┬────────┬─────┘
                            │        │
                         NO │        │ YES
                            ▼        ▼
                       Use DB    Use Live Data
                       + Error   Return 200
                       Flag      ✓


              Payment Expiration Job

                    ┌─── Run Cron
                    │
                    ▼
                ┌──────────────┐
                │ Find Expired │
                └──┬────────┬──┘
                   │        │
                NO │        │ YES
                   ▼        ▼
                 Exit    Update Status
                       Return Count
                         200 ✓
```

---

## Database Transaction Flow

```
WEBHOOK PROCESSING TRANSACTION:

BEGIN TRANSACTION
    │
    ├─ LOCK: payments table (for ID)
    │
    ├─ SELECT: Find payment by address
    │   └─ If not found: ROLLBACK → 404
    │
    ├─ CALCULATE: New status based on webhook data
    │
    ├─ UPDATE: payments table
    │   ├─ status = calculated
    │   ├─ amount_received = webhook amount
    │   ├─ confirmations = webhook confirmations
    │   └─ updated_at = NOW()
    │
    ├─ IF status='confirmed':
    │   │
    │   ├─ UPDATE: appointments table
    │   │   ├─ WHERE id = payment.appointment_id
    │   │   ├─ SET status = 'confirmed'
    │   │   └─ SET updated_at = NOW()
    │   │
    │   └─ FOR BULK PAYMENTS:
    │       ├─ PARSE: metadata.appointment_ids
    │       ├─ UPDATE: appointments (bulk)
    │       │   └─ WHERE id IN (list)
    │       └─ SET status = 'confirmed'
    │
    └─ COMMIT TRANSACTION

ERROR HANDLING:
├─ Unique constraint violation → 409 Conflict
├─ Foreign key violation → 500 Server Error
├─ Deadlock → Retry logic
└─ Connection lost → 500 Server Error
```

---

## Payment Lifecycle Timeline

```
TIME    ACTION                          STATUS           DB State
────────────────────────────────────────────────────────────────────
T+0     Create Payment Request          pending          INSERT
        - Exchange rate fetched
        - Amount calculated: $250 ≈ 1.38 XMR
        - Monero address generated
        - Expiry set: T+30min

T+2     Partial Payment Webhook         partial          amount_received=0.5,
        - User sends 0.5 XMR                            confirmations=1
        - System processes webhook
        - Notifies: "Awaiting remainder"

T+5     Additional Payment              partial          amount_received=0.88,
        - User sends 0.88 XMR                           confirmations=3
        - Amount received ≥ expected
        - Still waiting for confirmation

T+8     Confirmation                    confirmed        confirmations=10,
        - 10 blocks confirmed                           confirmed_at=NOW()
        - Complete flag set
        - Telegram notification sent
        - Appointment updated
        - Appointment status='confirmed'

T+30    [No action needed]              confirmed        Unchanged
        - Expiry time reached
        - But already confirmed
        - No action taken

T+45    [If not paid]                   expired          status='expired'
        - Pending payment expires
        - Cron job marks as expired
        - User can retry or request refund

────────────────────────────────────────────────────────────────────
```

---

## Test Scenario Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                   PAYMENT TEST SCENARIOS                        │
└─────────────────────────────────────────────────────────────────┘

SCENARIO 1: Error Handling
  Input:  Webhook with no address
  Flow:   Webhook → Validate → Error
  Result: 400 Bad Request ✓

SCENARIO 2: Unknown Payment
  Input:  Webhook for non-existent address
  Flow:   Webhook → Validate → Find → Not Found
  Result: 404 Not Found ✓

SCENARIO 3: Partial Payment
  Input:  Webhook with 50% of expected amount
  Flow:   Webhook → Find → Calc Status → Update (partial) → Return
  Result: 200 OK, status='partial' ✓

SCENARIO 4: Complete Payment
  Input:  Webhook with 100% amount, confirmations=10, complete=true
  Flow:   Webhook → Find → Calc Status → Update (confirmed)
           → Update Appointments → Send Telegram → Return
  Result: 200 OK, status='confirmed', User Notified ✓

SCENARIO 5: Status Check
  Input:  GET /api/payments/123/status
  Flow:   Find Payment → Call MoneroPay (optional) → Format → Return
  Result: 200 OK with full status ✓

SCENARIO 6: Expiration
  Input:  Cron: POST /api/payments/expire-old
  Flow:   Find Pending/Expired → Update → Count → Return
  Result: 200 OK with count of expired ✓

SCENARIO 7: Bulk Payment
  Input:  Create payment for 3 appointments
  Flow:   Calc Total ($750) → Create Invoice → Store Metadata
           → When Complete: Update 3 Appointments → Notify
  Result: Single payment, multiple confirmations ✓

SCENARIO 8: Network Failure
  Input:  MoneroPay API down
  Flow:   Try MoneroPay → Fail → Fallback to DB → Return with Error Flag
  Result: 200 OK with local data + error notice ✓
```

---

**Key Takeaway:** This system implements a robust, fault-tolerant payment processing pipeline with graceful degradation and comprehensive error handling.
