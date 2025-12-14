# Example: [BUG-HYP] API Server Silent Startup Failure

Reference implementation of hypothesis debug workflow.

---

## PHASE 1: TRIAGE

```
SYMPTOM: curl localhost:3000 → "Could not connect"
SCOPE: src/index.js, Express startup
BLOCKING: MoneroPay webhooks cant reach API
```

### State
- FEATURE_PRESET=basic ✓
- No node processes running ✓
- Port 3000 available ✓
- Validation passes but server never shows "Started"

---

## PHASE 2-3: HYPOTHESIS ROUNDS

### Round 1 — All ❌
| # | Hyp | Confidence | Result |
|---|-----|------------|--------|
| H1 | Stale process | H | ❌ None found |
| H2 | Preset not read | M | ❌ Shows "basic" |
| H3 | Feature toggle false | M | ❌ Returns TRUE |
| H4 | dotenv caching | L | ❌ Same w/ override |

### Round 2 — Root Cause Found
```
RULED OUT: Process mgmt, feature system, env loading
NEW INFO: Server validates OK but never prints "Started"
PATTERN: Failure between validation and listen()
```

| # | Hyp | Confidence | Result |
|---|-----|------------|--------|
| H1 | Async race condition | H | ✅ Partial |
| H2 | Unhandled rejection | H | ✅ REVEALED ERROR |

**Error surfaced:**
```
Cannot find module '../database/knexfile'
```

### Round 3 — Confirmed
| # | Hyp | Confidence | Result |
|---|-----|------------|--------|
| H1 | knexfile path wrong | H | ✅ ROOT CAUSE |

---

## PHASE 5: ROOT CAUSE

```
ROOT CAUSE: Wrong require path '../database/knexfile' → should be '../knexfile'
CATEGORY: [x]Code
WHY MISSED: Error silently swallowed, no global handlers
CONTRIBUTING:
1. Async constructor w/o error handling
2. app.start() not awaiting init
3. No unhandledRejection handler
```

---

## PHASE 6: FIX

### Changes
```
FILE: src/index.js
CHANGE: Fix knexfile path
DIFF: -require('../database/knexfile') +require('../knexfile')

FILE: src/index.js  
CHANGE: Add error handling
DIFF: +process.on('unhandledRejection'...) +async main() w/ try/catch
```

---

## PHASE 7: VERIFICATION

```
[x] Stop all node processes
[x] Port 3000 clear
[x] npm run start:api → shows "Started"
[x] curl /health → {"status":"healthy"}
[x] curl POST /api/payments/webhook → {"error":"Missing address"}
```

---

## PHASE 8: KNOWLEDGE

```
RED HERRINGS: Feature toggles, stale processes, dotenv
TECHNIQUE: Added global error handlers → revealed hidden error
TIME: ~37min (wouldve been 10 w/ proper error handling)
PREVENTION: Always add unhandledRejection handler to async startup
```

---

## Summary

| Phase | Time |
|-------|------|
| Triage | 5m |
| Round 1 | 15m |
| Round 2 | 10m |
| Round 3 | 2m |
| Fix | 5m |
| **Total** | 37m |

**Key lesson:** Silent failures = debugging poison. Surface errors early.
