# Manual Validation Checklist

This checklist provides step-by-step manual validation procedures for the Telegram appointment scheduler bot. Use this to verify system functionality before deployment.

## 🔒 Security Validation Checklist

### SV-001: Rate Limiting Verification
- [ ] **Test API Rate Limits**
  ```bash
  # Test general API limit (100 requests/15min)
  for i in {1..105}; do curl -X GET http://localhost:3000/api/test; done
  # Verify requests 101-105 return HTTP 429
  ```

- [ ] **Test Auth Rate Limits**
  ```bash
  # Test auth limit (5 requests/15min)
  for i in {1..10}; do curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'; done
  # Verify requests 6-10 return HTTP 429
  ```

- [ ] **Test Booking Rate Limits**
  ```bash
  # Test booking limit (10 requests/hour)
  for i in {1..15}; do curl -X POST http://localhost:3000/api/booking/create \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"service_id":1,"date":"2025-08-09"}'; done
  # Verify requests 11-15 return HTTP 429
  ```

### SV-002: Authentication Security
- [ ] **Test JWT Token Validation**
  ```bash
  # Test with invalid token
  curl -X GET http://localhost:3000/api/appointments \
    -H "Authorization: Bearer invalid_token"
  # Should return HTTP 401
  ```

- [ ] **Test Token Expiration**
  ```bash
  # Create expired token and test
  curl -X GET http://localhost:3000/api/appointments \
    -H "Authorization: Bearer expired_token"
  # Should return HTTP 401
  ```

- [ ] **Test Unauthorized Access**
  ```bash
  # Test client accessing admin endpoint
  curl -X GET http://localhost:3000/api/admin/users \
    -H "Authorization: Bearer client_token"
  # Should return HTTP 403
  ```

### SV-003: Input Sanitization
- [ ] **Test SQL Injection Prevention**
  ```bash
  # Test malicious SQL in booking notes
  curl -X POST http://localhost:3000/api/appointments \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"service_id":1,"notes":"'"'"'; DROP TABLE users; --"}'
  # Should be sanitized or rejected
  ```

- [ ] **Test XSS Prevention**
  ```bash
  # Test script injection in user input
  curl -X PUT http://localhost:3000/api/users/profile \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"first_name":"<script>alert(\"xss\")</script>"}'
  # Should be sanitized
  ```

---

## 🤖 Telegram Bot Validation Checklist

### TB-001: Bot Startup and Configuration
- [ ] **Verify Bot Token Security**
  ```bash
  # Check environment variables
  echo $TELEGRAM_BOT_TOKEN
  # Should NOT be the exposed token: 8124276494:AAEXy61BMBQcrz6TCCNHRI3_4d6fbXERy8M
  ```

- [ ] **Test Bot Initialization**
  ```bash
  # Start the bot
  npm run start:bot
  # Should start without errors and show "Telegram bot started successfully"
  ```

- [ ] **Verify Rate Limiting Configuration**
  - Check bot shows rate limiting config in startup logs
  - Verify 30 requests/minute limit configured
  - Confirm session cleanup interval set to 30 minutes

### TB-002: Basic Bot Commands
- [ ] **Test /start Command**
  1. Send `/start` to the bot
  2. Should receive welcome message
  3. User should be registered in database
  4. Session should be initialized

- [ ] **Test /help Command**
  1. Send `/help` to the bot
  2. Should receive comprehensive help message
  3. Should show all available commands
  4. Should include booking process steps

- [ ] **Test /book Command**
  1. Send `/book` to the bot
  2. Should show service category buttons
  3. Should initialize booking session
  4. Session state should be 'booking'

### TB-003: Booking Flow Validation
- [ ] **Category Selection**
  1. Click "🏥 Medical" button
  2. Should show available medical services
  3. Session should store selected category

- [ ] **Service Selection**
  1. Select a specific service
  2. Should show provider info and calendar
  3. Session should store service and provider IDs

- [ ] **Date Selection**
  1. Select a date from calendar
  2. Should show available time slots
  3. Should exclude weekends (no slots)
  4. Should show only business hours (9 AM - 5 PM)

- [ ] **Time Slot Selection**
  1. Select an available time slot
  2. Should show booking summary
  3. Should include all selected details
  4. Should show confirm/cancel buttons

- [ ] **Booking Confirmation**
  1. Click "✅ Confirm" button
  2. Should create appointment in database
  3. Should show confirmation with appointment ID
  4. Should clear session booking data

### TB-004: Error Handling
- [ ] **Test Rate Limiting**
  1. Send 35+ messages quickly to bot
  2. Should start blocking after 30 messages
  3. Should show rate limit message

- [ ] **Test Session Corruption**
  1. Corrupt session data (if possible)
  2. Bot should reset session gracefully
  3. Should show session reset message

- [ ] **Test Database Connection Error**
  1. Temporarily disable database
  2. Bot should show user-friendly error
  3. Should log error properly

---

## 💾 Database Validation Checklist

### DB-001: Cleanup Verification
- [ ] **Verify Lodge Mobile Removal**
  ```sql
  -- Should return 0 rows
  SELECT * FROM services WHERE name LIKE '%Lodge Mobile%';
  SELECT * FROM services WHERE description LIKE '%Lodge Mobile%';
  ```

- [ ] **Verify Unauthorized Admin Removal**
  ```sql
  -- Should return 0 rows
  SELECT * FROM users WHERE telegram_id = '7930798268';
  ```

- [ ] **Verify Original Services Restored**
  ```sql
  -- Should return multiple rows
  SELECT * FROM services WHERE name IN (
    'General Consultation',
    'Medical Appointment',
    'Dental Cleaning',
    'Beauty Treatment',
    'Fitness Training'
  );
  ```

### DB-002: Data Integrity
- [ ] **Test Foreign Key Constraints**
  ```sql
  -- This should fail (referential integrity)
  INSERT INTO appointments (client_id, provider_id, service_id) 
  VALUES (99999, 99999, 99999);
  ```

- [ ] **Test Required Fields**
  ```sql
  -- This should fail (NOT NULL constraints)
  INSERT INTO users (email) VALUES (NULL);
  ```

- [ ] **Test Data Validation**
  ```sql
  -- Test email format validation
  INSERT INTO users (email, password_hash, first_name, last_name)
  VALUES ('invalid-email', 'hash', 'Test', 'User');
  ```

---

## 🌐 API Validation Checklist

### API-001: Authentication Endpoints
- [ ] **Test User Registration**
  ```bash
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "password123",
      "first_name": "Test",
      "last_name": "User"
    }'
  # Should return 201 with user data and token
  ```

- [ ] **Test User Login**
  ```bash
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "password123"
    }'
  # Should return 200 with token
  ```

- [ ] **Test Invalid Login**
  ```bash
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "wrongpassword"
    }'
  # Should return 401
  ```

### API-002: Appointment Endpoints
- [ ] **Test Appointment Creation**
  ```bash
  curl -X POST http://localhost:3000/api/appointments \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "provider_id": 1,
      "service_id": 1,
      "appointment_datetime": "2025-08-09T10:00:00.000Z",
      "notes": "Test appointment"
    }'
  # Should return 201 with appointment data
  ```

- [ ] **Test Appointment Retrieval**
  ```bash
  curl -X GET http://localhost:3000/api/appointments \
    -H "Authorization: Bearer YOUR_TOKEN"
  # Should return 200 with appointments list
  ```

- [ ] **Test Appointment Update**
  ```bash
  curl -X PUT http://localhost:3000/api/appointments/APPOINTMENT_UUID \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "notes": "Updated notes"
    }'
  # Should return 200 with updated appointment
  ```

### API-003: Service Endpoints
- [ ] **Test Service Listing**
  ```bash
  curl -X GET http://localhost:3000/api/services \
    -H "Authorization: Bearer YOUR_TOKEN"
  # Should return 200 with services list
  ```

- [ ] **Test Service Filtering**
  ```bash
  curl -X GET "http://localhost:3000/api/services?category=medical" \
    -H "Authorization: Bearer YOUR_TOKEN"
  # Should return only medical services
  ```

---

## 🚀 Performance Validation Checklist

### PF-001: Response Time Testing
- [ ] **Test API Response Times**
  ```bash
  # Test with curl timing
  curl -w "@curl-format.txt" -o /dev/null -s \
    http://localhost:3000/api/services \
    -H "Authorization: Bearer YOUR_TOKEN"
  # Should be < 2 seconds
  ```

- [ ] **Test Database Query Performance**
  ```sql
  -- Time complex queries
  EXPLAIN ANALYZE SELECT * FROM appointments 
  JOIN users ON appointments.client_id = users.id 
  JOIN services ON appointments.service_id = services.id 
  WHERE appointments.scheduled_start > NOW();
  ```

### PF-002: Memory Usage
- [ ] **Monitor Memory Usage**
  ```bash
  # Monitor Node.js process memory
  ps aux | grep node
  # Check RSS memory usage over time
  ```

- [ ] **Test Memory Leaks**
  1. Run bot for extended period
  2. Send continuous requests
  3. Monitor memory growth
  4. Memory should stabilize, not continuously grow

---

## 🔄 Integration Validation Checklist

### INT-001: End-to-End Booking Flow
- [ ] **Complete Booking via Telegram**
  1. Start with `/start` command
  2. Use `/book` to begin booking
  3. Select category → service → date → time
  4. Confirm booking
  5. Verify appointment created in database
  6. Check notification sent (if configured)

- [ ] **Complete Booking via API**
  1. Authenticate via API
  2. Get available services
  3. Check availability
  4. Create appointment
  5. Verify in database

### INT-002: Cross-System Validation
- [ ] **Telegram ↔ Database**
  1. Book appointment via Telegram
  2. Verify appears in API endpoints
  3. Update via API
  4. Verify updates via Telegram `/myappointments`

- [ ] **API ↔ Notifications**
  1. Create appointment via API
  2. Verify notifications triggered
  3. Cancel appointment
  4. Verify cancellation notifications

---

## 📊 System Monitoring Checklist

### MON-001: Log Validation
- [ ] **Check Application Logs**
  ```bash
  tail -f logs/combined.log
  # Should show structured logs
  # Should include user actions, errors, performance metrics
  ```

- [ ] **Check Error Logs**
  ```bash
  tail -f logs/error.log
  # Should be minimal in normal operation
  # Any errors should be handled gracefully
  ```

### MON-002: Health Checks
- [ ] **Database Connection**
  ```bash
  curl http://localhost:3000/api/health
  # Should return 200 with system status
  ```

- [ ] **Bot Status**
  ```bash
  node check-bot-status.js
  # Should confirm bot is running and responsive
  ```

---

## 🚨 Pre-Deployment Final Checklist

- [ ] All security tests passed
- [ ] All functionality tests passed
- [ ] Database cleanup completed
- [ ] No Lodge Mobile contamination remaining
- [ ] Unauthorized admin removed
- [ ] Original services restored and functional
- [ ] Rate limiting working correctly
- [ ] Authentication secure
- [ ] Input sanitization effective
- [ ] Error handling graceful
- [ ] Performance acceptable (< 2s response times)
- [ ] Memory usage stable
- [ ] Logs properly configured
- [ ] Environment variables secure
- [ ] Documentation updated

## ✅ Deployment Approval

**System is ready for deployment when:**
- [ ] ALL items in this checklist are completed
- [ ] 95%+ of automated tests pass
- [ ] No critical security issues remain
- [ ] Performance meets requirements
- [ ] All stakeholders approve

**Deployment approved by:**
- [ ] Testing Lead: ________________ Date: ________
- [ ] Security Officer: _____________ Date: ________
- [ ] System Administrator: ________ Date: ________
- [ ] Product Owner: ______________ Date: ________

---

*Manual validation completed successfully indicates system readiness for production deployment.*