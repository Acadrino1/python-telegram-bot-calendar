# Example: Completed Hypothesis Debug Issue

This is a reference example showing the workflow applied to a real bug.

---

## Issue: [BUG-HYP] API Server: Webhook endpoint unreachable on port 3000

### 🐛 Observed Behavior

**Symptom:**
```
curl: (7) Failed to connect to localhost port 3000 after 2256 ms: Could not connect to server
```

**Reproduction Steps:**
1. Set `FEATURE_PRESET=basic` in .env
2. Run `npm run start:api`
3. Attempt `curl http://localhost:3000/health`
4. Connection refused

**Environment:**
- Node.js version: 20.x
- OS: Windows 11
- Branch: main

---

### 🎯 Expected Behavior
API server should start and respond to health check requests.

---

### 📊 Initial Diagnostics

#### System State Capture
```powershell
# Feature system reports enabled
node -e "require('dotenv').config(); const {features} = require('./config/features'); console.log('isApiServerEnabled:', features.isApiServerEnabled());"
# Output: isApiServerEnabled: true

# Port available
netstat -ano | findstr :3000
# Output: (empty - port is free)
```

#### Relevant Logs
```
✅ Feature toggles loaded (v1.0.0)
🔍 Validating feature configuration...
✅ Applied feature preset: basic
🚀 Ready to start: YES
# Server never shows "Started" message
```

---

## 🔬 HYPOTHESIS TRACKING

### Hypothesis Round 1

| # | Hypothesis | Confidence | Test Method | Result |
|---|------------|------------|-------------|--------|
| H1.1 | Stale node process holding port | High | `netstat` + `Get-Process` | ❌ Ruled Out |
| H1.2 | FEATURE_PRESET not being read | Medium | Diagnostic script | ❌ Ruled Out |
| H1.3 | Feature toggle system bug | Medium | Check isApiServerEnabled() | ❌ Ruled Out |
| H1.4 | Environment variable caching | Low | Add dotenv override | ❌ Ruled Out |

#### H1.1: Stale Process
**Theory:** Previous node process still running with old config
**Test:** `Get-Process -Name "node"` and `netstat -ano | findstr :3000`
**Result:** ❌ Ruled Out - No node processes, port 3000 available
**Notes:** This was the initial assumption based on the user's description

#### H1.2: FEATURE_PRESET Not Read
**Theory:** .env file not being loaded, defaulting to wrong preset
**Test:** Created `diagnose-api.js` script to check env values
**Result:** ❌ Ruled Out - FEATURE_PRESET correctly shows "basic"

#### H1.3: Feature Toggle Bug
**Theory:** isApiServerEnabled() returning false despite config
**Test:** Direct call to features.isApiServerEnabled()
**Result:** ❌ Ruled Out - Returns TRUE, all dependencies met

#### H1.4: dotenv Caching
**Theory:** Multiple dotenv.config() calls without override flag
**Test:** Add `{ override: true }` to dotenv.config()
**Result:** ❌ Ruled Out - Same behavior after fix

---

### Hypothesis Round 2

**Ruled Out From Round 1:**
- [x] H1.1: No stale processes
- [x] H1.2: Env vars loading correctly
- [x] H1.3: Feature system working
- [x] H1.4: dotenv override not the issue

**New Information Gained:**
- Server validation passes but never prints "Started" message
- Process must be failing silently between validation and listen()

| # | Hypothesis | Confidence | Test Method | Result |
|---|------------|------------|-------------|--------|
| H2.1 | Race condition in async init | High | Add await to startup | ✅ Partially |
| H2.2 | Express app not initialized | Medium | Log this.app value | ⏳ Subsumed |
| H2.3 | Unhandled promise rejection | High | Add error handlers | ✅ Revealed cause |
| H2.4 | Database init failing | Medium | Check DB connection | ⏳ Subsumed |

#### H2.1: Race Condition
**Theory:** `app.start()` called before `initializeAsync()` completes
**Evidence:** Constructor calls async method without await, start() called immediately
**Fix Applied:**
```javascript
this.initPromise = this.initializeAsync();
// In start():
await this.initPromise;
```
**Result:** ✅ Partially fixed - Server still fails but now we can catch the error

#### H2.3: Unhandled Promise Rejection
**Theory:** Errors being swallowed, need global handler
**Fix Applied:**
```javascript
process.on('unhandledRejection', (reason) => console.error('❌', reason));
async function main() {
  try { ... } catch (error) { console.error('FATAL:', error); }
}
```
**Result:** ✅ REVEALED ROOT CAUSE:
```
Error: Cannot find module '../database/knexfile'
```

---

### Hypothesis Round 3

**Pattern Recognition:**
All Round 1 hypotheses focused on the feature toggle system and process management. The actual failure was downstream in database initialization - a simple path error that was masked by silent failure.

| # | Hypothesis | Confidence | Test Method | Result |
|---|------------|------------|-------------|--------|
| H3.1 | knexfile.js path incorrect | High | `search_files knexfile` | ✅ Confirmed |

#### H3.1: Knexfile Path
**Theory:** Code expects `../database/knexfile` but file is at project root
**Test:** `Filesystem:search_files pattern=knexfile`
**Result:** ✅ CONFIRMED - File at `/knexfile.js`, not `/database/knexfile.js`
**Fix:**
```javascript
// Change:
const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
// To:
const knexConfig = require('../knexfile')[process.env.NODE_ENV || 'development'];
```

---

## 🔧 ROOT CAUSE ANALYSIS

### Confirmed Root Cause
**Category:** [x] Code Logic (incorrect path)

**Description:**
`src/index.js` line 179 referenced `../database/knexfile` but the actual file location is `../knexfile` (project root). This was a typo or incorrect assumption about project structure.

**Why Initial Hypotheses Missed It:**
1. Error was being silently swallowed - no console output
2. Async initialization without proper error propagation
3. Feature toggle system was a red herring based on user's initial description
4. Compound issue: race condition + missing error handling + path error

### Contributing Factors
1. No error handling wrapper around `main()` startup
2. Constructor starts async work without tracking completion
3. `app.start()` not awaiting initialization
4. No global unhandledRejection handler

---

## ✅ RESOLUTION

### Fixes Applied

**Fix 1: Async initialization tracking**
```javascript
constructor() {
  this.initialized = false;
  this.initPromise = this.initializeAsync();
}
```

**Fix 2: Proper startup sequence**
```javascript
async function main() {
  try {
    app = new AppointmentSchedulerApp();
    await app.initPromise;
    await app.start();
  } catch (error) {
    console.error('❌ FATAL:', error);
    process.exit(1);
  }
}
```

**Fix 3: Knexfile path correction**
```javascript
const knexConfig = require('../knexfile')[...];
```

### Files Modified
- [x] `src/index.js` - Fixed knexfile path, added error handling, fixed async startup

### Verification Steps
```powershell
npm run start:api
# Should show: 🚀 Appointment Scheduler API Server Started

curl http://localhost:3000/health
# Should return: {"status":"healthy",...}
```

### Regression Prevention
- [x] Add error handling: Global unhandledRejection handler added
- [ ] Add test case: Startup integration test
- [ ] Add pre-commit hook: Validate all require() paths exist

---

## 📚 KNOWLEDGE CAPTURE

### Debugging Techniques That Worked
1. **Diagnostic script isolation** - Running feature checks outside the app revealed the feature system was fine
2. **Error surfacing** - Adding try/catch and global handlers revealed the hidden error
3. **Progressive investigation** - Each round built on previous findings

### Red Herrings Encountered
1. **Feature toggle system** - User description focused on FEATURE_PRESET but that was working correctly
2. **Stale processes** - Common Windows issue but not the cause here
3. **dotenv caching** - Valid concern but not the culprit

### Key Lesson
**Silent failures are debugging poison.** Always add:
- `process.on('unhandledRejection', ...)`
- `process.on('uncaughtException', ...)`
- try/catch around async startup
- Explicit logging at each initialization step

---

## ⏱️ TIME TRACKING

| Phase | Duration |
|-------|----------|
| Initial Triage | 5 min |
| Hypothesis Round 1 | 15 min |
| Hypothesis Round 2 | 10 min |
| Root Cause Confirmed | 2 min |
| Fix Implementation | 5 min |
| **Total** | ~37 min |

---

## Labels
`bug` `hypothesis-debug` `api-server` `critical` `resolved`
