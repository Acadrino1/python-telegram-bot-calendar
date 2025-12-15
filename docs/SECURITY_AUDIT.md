# Security Audit & Bug Cleanup - Linear Issues

## Epic: Security Hardening & Bug Cleanup

**Description:** Comprehensive security audit revealed 7 critical/high severity vulnerabilities and 10 code quality issues requiring immediate attention.

**Priority:** Critical
**Labels:** [security] [bug] [technical-debt]
**Created:** 2024-12-14

---

## Sprint 1: Critical Security Fixes

### Issue 1: Add SSL/TLS Encryption to Database Connections
**Priority:** Critical
**Type:** Security Vulnerability
**Labels:** [security] [database] [encryption]

**Problem:** MySQL connections lack SSL/TLS configuration - database credentials sent in plaintext over network

**Impact:**
- Database passwords exposed during transmission
- Man-in-the-middle attack risk
- Compliance violation (PCI-DSS, GDPR)

**Files:**
- `knexfile.js:71-77`
- `.env.example` (new vars needed)

**Fix:**
Add SSL configuration to production MySQL connection:
```javascript
ssl: process.env.DB_SSL === 'true' ? {
  rejectUnauthorized: true,
  ca: process.env.DB_SSL_CA,
  cert: process.env.DB_SSL_CERT,
  key: process.env.DB_SSL_KEY
} : false
```

**Environment Variables:**
```
DB_SSL=true
DB_SSL_CA=/path/to/ca-cert.pem  # Optional
DB_SSL_CERT=/path/to/client-cert.pem  # Optional
DB_SSL_KEY=/path/to/client-key.pem  # Optional
```

**Testing:**
- [ ] Verify SSL connection with MySQL logs
- [ ] Test fallback to non-SSL in development
- [ ] Confirm encrypted transmission with Wireshark

**Estimate:** 1-2 hours

---

### Issue 2: Fix SQL Injection Regex Validation Bypass
**Priority:** High
**Type:** Security Vulnerability
**Labels:** [security] [sql-injection] [validation]

**Problem:** Regex validation in `sqlSecurity.js` has critical flaws:
1. Line 34: Missing `$` anchor allows suffix injection
2. Line 45: Malformed regex pattern (escapes `$` instead of `.`)

**Impact:**
- SQL injection via crafted preference keys
- Example: `language'; DROP TABLE users; --` passes validation

**Files:**
- `src/utils/sqlSecurity.js:34`
- `src/utils/sqlSecurity.js:45`

**Fix Line 34:**
```javascript
// BEFORE (UNSAFE):
if (!/^[a-zA-Z0-9_]+/.test(key)) {

// AFTER (SAFE):
if (!/^[a-zA-Z0-9_]+$/.test(key)) {  // Added $ anchor
```

**Fix Line 45:**
```javascript
// BEFORE (BROKEN):
if (!/^$.[a-zA-Z0-9_]+/.test(path)) {

// AFTER (FIXED):
if (!/^\$\.[a-zA-Z0-9_]+$/.test(path)) {  // Properly escape . and add $
```

**Testing:**
- [ ] Test injection attempts: `test'; DROP TABLE--`
- [ ] Verify whitelist keys pass: `language`, `timezone`
- [ ] Verify malformed paths rejected

**Estimate:** 30 minutes

---

### Issue 3: Fix Template Literal SQL Injection in WaitlistController
**Priority:** Critical
**Type:** Security Vulnerability
**Labels:** [security] [sql-injection] [critical]

**Problem:** Template literal with variable in `whereRaw()` query - direct SQL injection vector

**Files:**
- `src/controllers/WaitlistController.js:432`

**Current Code (UNSAFE):**
```javascript
.whereRaw(`JSON_EXTRACT(preferred_times, '$.${timePreference}') = true`)
```

**Fix (Parameterized):**
```javascript
.whereRaw('JSON_EXTRACT(preferred_times, ?) = true', [`$.${timePreference}`])
```

**Testing:**
- [ ] Verify query works with 'morning', 'afternoon', 'evening'
- [ ] Attempt injection via timePreference variable
- [ ] Check query execution plan

**Estimate:** 15 minutes

---

### Issue 4: Fix Template Literal SQL Injection in Appointment Model
**Priority:** Critical
**Type:** Security Vulnerability
**Labels:** [security] [sql-injection] [critical]

**Problem:** Template literal with `safeHours` variable in `whereRaw()`

**Files:**
- `src/models/Appointment.js:313`

**Current Code (UNSAFE):**
```javascript
.whereRaw(`JSON_EXTRACT(reminder_sent, '$.${safeHours}h') IS NULL`)
```

**Fix (Parameterized):**
```javascript
.whereRaw('JSON_EXTRACT(reminder_sent, ?) IS NULL', [`$.${safeHours}h`])
```

**Testing:**
- [ ] Test reminder queries with various hour values
- [ ] Verify JSON extraction still works
- [ ] Check performance impact

**Estimate:** 15 minutes

---

### Issue 5: Remove Hardcoded Database Passwords
**Priority:** High
**Type:** Security Vulnerability
**Labels:** [security] [credentials] [production]

**Problem:** Multiple files contain hardcoded fallback database passwords instead of throwing errors

**Impact:**
- Development defaults (`password`, `apppassword123`) could be deployed to production
- Security misconfiguration risk

**Files:**
- `knexfile.js:10` - Default: `'password'`
- `src/bot/bot.js:56` - Default: `'apppassword123'`
- `src/services/enhanced/EnhancedBotEngine.js:426` - Default: `'apppassword123'`

**Fix (All Files):**
```javascript
// BEFORE:
password: process.env.DB_PASSWORD || 'password',

// AFTER:
password: process.env.DB_PASSWORD || (() => {
  throw new Error('DB_PASSWORD environment variable is required');
})(),
```

**Testing:**
- [ ] Verify error thrown when DB_PASSWORD missing
- [ ] Confirm production startup fails gracefully
- [ ] Test development with proper .env

**Estimate:** 30 minutes

---

## Sprint 2: Race Conditions

### Issue 6: Fix Race Condition in Payment Handler
**Priority:** Critical
**Type:** Bug - Race Condition
**Labels:** [bug] [race-condition] [payment] [critical]

**Problem:** `setTimeout` with `handleUpdate` creates race condition - payment confirmation can fire before session updates

**Impact:**
- Duplicate booking attempts
- Payment confirmed but booking fails
- Session state corruption

**Files:**
- `src/bot/handlers/PaymentHandler.js:104-107`

**Current Code (UNSAFE):**
```javascript
setTimeout(() => {
  ctx.callbackQuery = { data: 'confirm_booking' };
  this.bot.handleUpdate({ callback_query: ctx.callbackQuery, ...ctx.update });
}, 1500);
```

**Fix:**
```javascript
setTimeout(async () => {
  try {
    await this.services.bookingHandler.handleConfirmBooking(ctx);
  } catch (error) {
    console.error('Payment confirm callback error:', error);
  }
}, 1500);
```

**Testing:**
- [ ] Rapid payment confirmation attempts
- [ ] Session state verification
- [ ] Error handling validation

**Estimate:** 1 hour

---

### Issue 7: Fix Race Condition in Slot Booking
**Priority:** High
**Type:** Bug - Race Condition
**Labels:** [bug] [race-condition] [booking] [concurrency]

**Problem:** No atomic lock between availability check and appointment insert - two users can book same slot

**Impact:**
- Double-booking of appointment slots
- Customer dissatisfaction
- Data integrity issues

**Files:**
- `src/services/enhanced/handlers/EnhancedCallbackQueryHandler.js:317-410`

**Solution:** Wrap in transaction with `FOR UPDATE` lock

**Fix (Add before line 350):**
```javascript
const trx = await Appointment.startTransaction();
try {
  const conflictCheck = await Appointment.query(trx)
    .where('appointment_datetime', appointmentDatetime)
    .where('service_id', service.id)
    .forUpdate()
    .first();

  if (conflictCheck) {
    await trx.rollback();
    await ctx.editMessageText('❌ Slot already taken. Please choose another time.');
    return true;
  }

  appointment = await Appointment.query(trx).insert(appointmentData);
  await trx.commit();
} catch (error) {
  await trx.rollback();
  throw error;
}
```

**Testing:**
- [ ] Concurrent booking test (2+ users, same slot)
- [ ] Transaction rollback verification
- [ ] Performance impact measurement

**Estimate:** 2 hours

---

### Issue 8: Fix Unhandled Promise in Bot Launch
**Priority:** High
**Type:** Bug - Error Handling
**Labels:** [bug] [promise] [startup]

**Problem:** `start()` method returns before bot actually launches - errors not propagated to caller

**Files:**
- `src/services/enhanced/EnhancedBotEngine.js:1116-1120`

**Current Code:**
```javascript
this.bot.launch().then(() => {
  console.log('📡 Telegram long polling connected');
}).catch(err => {
  console.error('❌ Bot launch error:', err);
});
```

**Fix:**
```javascript
try {
  await this.bot.launch();
  console.log('📡 Telegram long polling connected');
} catch (err) {
  console.error('❌ Bot launch error:', err);
  throw err;  // Propagate to caller
}
```

**Testing:**
- [ ] Test startup with invalid bot token
- [ ] Verify error propagation
- [ ] Confirm graceful failure

**Estimate:** 30 minutes

---

## Sprint 3: Memory & Stability

### Issue 9: Fix Memory Leak in Session Manager
**Priority:** High
**Type:** Bug - Memory Leak
**Labels:** [bug] [memory-leak] [performance]

**Problem:** `persistenceTimers` map grows unbounded - old timers never removed

**Impact:**
- Memory grows linearly with session count
- Eventual OOM crash in production
- Performance degradation

**Files:**
- `src/bot/utils/SessionManager.js:209`

**Fix:** Add cleanup method and self-cleanup

**Testing:**
- [ ] Monitor heap over 1000+ sessions
- [ ] Verify timer map size stays bounded
- [ ] Chrome DevTools memory profiling

**Estimate:** 1.5 hours

---

### Issue 10: Add Error Boundary to Ticket Reminder Scheduler
**Priority:** High
**Type:** Bug - Error Handling
**Labels:** [bug] [scheduler] [error-handling]

**Problem:** Unhandled promise rejection in `setInterval` callback can silently stop entire scheduler

**Files:**
- `src/services/enhanced/EnhancedBotEngine.js:1146`

**Fix:**
```javascript
this.ticketReminderInterval = setInterval(() => {
  this.checkUnansweredTickets(UNANSWERED_THRESHOLD_HOURS)
    .catch(error => {
      console.error('❌ Ticket reminder scheduler error:', error);
    });
}, REMINDER_INTERVAL);
```

**Testing:**
- [ ] Force error in checkUnansweredTickets
- [ ] Verify scheduler continues running
- [ ] Check error logging

**Estimate:** 30 minutes

---

### Issue 11: Add Cleanup to Callback Manager Interval
**Priority:** Medium
**Type:** Bug - Memory Leak
**Labels:** [bug] [memory-leak] [cleanup]

**Problem:** `setInterval` started but no guaranteed cleanup - memory leak if handler not destroyed

**Files:**
- `src/bot/handlers/EnhancedCallbackQueryHandler.js:28-30`

**Fix:** Store interval ID and add stop() method

**Testing:**
- [ ] Verify interval cleared on stop()
- [ ] Test multiple start/stop cycles
- [ ] Check no lingering timers

**Estimate:** 30 minutes

---

## Sprint 4: Input Sanitization

### Issue 12: Apply Markdown Escaping to Bulk Upload Handler
**Priority:** Medium
**Type:** Security - XSS/Markdown Injection
**Labels:** [security] [xss] [markdown-injection]

**Problem:** User data (names, addresses) interpolated directly into Markdown without escaping

**Impact:**
- Broken message formatting
- Information masking via markdown manipulation
- UX degradation

**Files:**
- `src/bot/handlers/BulkUploadHandler.js:404-406`
- `src/bot/handlers/BulkUploadHandler.js:474-475`

**Fix:**
```javascript
const { escapeMarkdown } = require('../utils/CallbackUtils');

const message = `*Customer:* ${escapeMarkdown(current.displayName)}${dobDisplay}\n`;
message += `${i + 1}. ${escapeMarkdown(booking.name)}\n`;
```

**Testing:**
- [ ] Test names with `*`, `_`, `[`, `]`
- [ ] Verify visual rendering correct
- [ ] Performance impact check

**Estimate:** 45 minutes

---

### Issue 13: Fix Markdown Escaping in Confirmation Prompts
**Priority:** Medium
**Type:** Security - Markdown Injection
**Labels:** [security] [markdown-injection] [forms]

**Problem:** User input displayed in confirmation prompts without escaping

**Files:**
- `src/bot/handlers/EnhancedCustomerFormHandler.js:60-87`

**Fix:**
```javascript
firstName: `✨ Nice to meet you, *${escapeMarkdown(value)}*!\n\nIs this your first name?`,
```

**Testing:**
- [ ] Test special characters in names
- [ ] Verify formatting preserved
- [ ] Check all form fields

**Estimate:** 30 minutes

---

### Issue 14: Escape Error Report Names
**Priority:** Medium
**Type:** Security - Markdown Injection
**Labels:** [security] [markdown-injection] [error-handling]

**Problem:** Error reports display user-supplied names and error messages without escaping

**Files:**
- `src/services/BulkUploadService.js:234`

**Fix:**
```javascript
report += `Line ${row} (${escapeMarkdown(name || 'Unknown')}):\n`;
report += `  • ${escapeMarkdown(err)}\n`;
```

**Testing:**
- [ ] Generate validation errors with special chars
- [ ] Verify error report formatting
- [ ] Test edge cases

**Estimate:** 20 minutes

---

### Issue 15: Fix Unvalidated Fetch Response
**Priority:** Medium
**Type:** Bug - Error Handling
**Labels:** [bug] [error-handling] [file-upload]

**Problem:** Fetch response not validated before processing - non-200 responses fail silently

**Files:**
- `src/bot/handlers/BulkUploadHandler.js:290`

**Fix:**
```javascript
const response = await fetch(fileLink.href);
if (!response.ok) {
  throw new Error(`File download failed: ${response.status} ${response.statusText}`);
}
```

**Testing:**
- [ ] Test with invalid file URL
- [ ] Verify error message shown to user
- [ ] Check various HTTP error codes

**Estimate:** 20 minutes

---

## Summary Statistics

**Total Issues:** 15
**Critical:** 5
**High:** 6
**Medium:** 4

**Total Estimated Time:** ~12-14 hours (1.5-2 days)

**Sprints:**
- Sprint 1 (Security): 5 issues, ~3-4 hours
- Sprint 2 (Race Conditions): 3 issues, ~3.5-4 hours
- Sprint 3 (Memory): 3 issues, ~2.5-3 hours
- Sprint 4 (Input): 4 issues, ~2-2.5 hours

**Files Modified:** 15 files
**Test Coverage:** 45+ test cases across all issues
