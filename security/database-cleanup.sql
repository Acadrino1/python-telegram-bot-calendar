-- DATABASE CLEANUP SCRIPT FOR LODGE MOBILE CONTAMINATION
-- ============================================================
-- This script removes Lodge Mobile specific contamination and restores
-- the original appointment scheduling system functionality

-- WARNING: BACKUP YOUR DATABASE BEFORE RUNNING THIS SCRIPT!

USE appointment_scheduler;

-- 1. REMOVE LODGE MOBILE SPECIFIC SERVICES
-- Remove all services that contain "Lodge Mobile" references
DELETE FROM services 
WHERE name LIKE '%Lodge Mobile%' 
   OR description LIKE '%Lodge Mobile%'
   OR name LIKE '%Mobile Activation%'
   OR description LIKE '%activation%';

-- 2. REMOVE LODGE MOBILE APPOINTMENTS
-- Cancel and remove appointments for Lodge Mobile services
UPDATE appointments 
SET status = 'cancelled', 
    cancellation_reason = 'Service discontinued - system cleanup',
    cancelled_at = NOW(),
    cancelled_by = NULL
WHERE service_id IN (
    SELECT id FROM services 
    WHERE name LIKE '%Lodge Mobile%' 
       OR description LIKE '%Lodge Mobile%'
       OR name LIKE '%Mobile Activation%'
);

-- Remove Lodge Mobile appointment history
DELETE ah FROM appointment_history ah
JOIN appointments a ON ah.appointment_id = a.id
WHERE a.service_id IN (
    SELECT id FROM services 
    WHERE name LIKE '%Lodge Mobile%' 
       OR description LIKE '%Lodge Mobile%'
       OR name LIKE '%Mobile Activation%'
);

-- 3. REMOVE LODGE MOBILE WAITLIST ENTRIES
DELETE FROM waitlist 
WHERE service_id IN (
    SELECT id FROM services 
    WHERE name LIKE '%Lodge Mobile%' 
       OR description LIKE '%Lodge Mobile%'
       OR name LIKE '%Mobile Activation%'
);

-- 4. REMOVE CONTAMINATED NOTIFICATION TEMPLATES
DELETE FROM notification_templates 
WHERE content LIKE '%Lodge Mobile%'
   OR subject LIKE '%Lodge Mobile%'
   OR content LIKE '%Mobile Activation%';

-- 5. REMOVE CONTAMINATED NOTIFICATIONS
DELETE FROM notifications 
WHERE content LIKE '%Lodge Mobile%'
   OR subject LIKE '%Lodge Mobile%'
   OR content LIKE '%Mobile Activation%';

-- 6. REMOVE UNAUTHORIZED ADMIN USER
-- Remove the hardcoded unauthorized admin ID: 7930798268
DELETE FROM users 
WHERE telegram_id = '7930798268'
   OR id IN (
       SELECT DISTINCT cancelled_by FROM appointments 
       WHERE cancelled_by IS NOT NULL
       AND cancelled_by NOT IN (
           SELECT id FROM users 
           WHERE role IN ('admin', 'provider')
           AND email NOT LIKE '%@telegram.local'
       )
   );

-- 7. RESTORE ORIGINAL SERVICE CATEGORIES
-- Insert original appointment service categories
INSERT INTO services (provider_id, name, description, duration_minutes, price, color_code, is_active, booking_rules, created_at, updated_at)
SELECT 
    u.id as provider_id,
    'General Consultation' as name,
    'General consultation and advice session' as description,
    30 as duration_minutes,
    75.00 as price,
    '#4CAF50' as color_code,
    true as is_active,
    JSON_OBJECT('advance_booking_hours', 24, 'cancellation_hours', 24, 'requires_confirmation', false) as booking_rules,
    NOW() as created_at,
    NOW() as updated_at
FROM users u 
WHERE u.role = 'provider' 
AND NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.provider_id = u.id 
    AND s.name = 'General Consultation'
)
LIMIT 1;

INSERT INTO services (provider_id, name, description, duration_minutes, price, color_code, is_active, booking_rules, created_at, updated_at)
SELECT 
    u.id as provider_id,
    'Medical Appointment' as name,
    'Medical consultation and examination' as description,
    45 as duration_minutes,
    100.00 as price,
    '#2196F3' as color_code,
    true as is_active,
    JSON_OBJECT('advance_booking_hours', 48, 'cancellation_hours', 24, 'requires_confirmation', true) as booking_rules,
    NOW() as created_at,
    NOW() as updated_at
FROM users u 
WHERE u.role = 'provider' 
AND NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.provider_id = u.id 
    AND s.name = 'Medical Appointment'
)
LIMIT 1;

INSERT INTO services (provider_id, name, description, duration_minutes, price, color_code, is_active, booking_rules, created_at, updated_at)
SELECT 
    u.id as provider_id,
    'Dental Cleaning' as name,
    'Professional dental cleaning and examination' as description,
    60 as duration_minutes,
    120.00 as price,
    '#FF9800' as color_code,
    true as is_active,
    JSON_OBJECT('advance_booking_hours', 48, 'cancellation_hours', 48, 'requires_confirmation', true) as booking_rules,
    NOW() as created_at,
    NOW() as updated_at
FROM users u 
WHERE u.role = 'provider' 
AND NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.provider_id = u.id 
    AND s.name = 'Dental Cleaning'
)
LIMIT 1;

INSERT INTO services (provider_id, name, description, duration_minutes, price, color_code, is_active, booking_rules, created_at, updated_at)
SELECT 
    u.id as provider_id,
    'Beauty Treatment' as name,
    'Professional beauty and wellness treatment' as description,
    90 as duration_minutes,
    85.00 as price,
    '#E91E63' as color_code,
    true as is_active,
    JSON_OBJECT('advance_booking_hours', 24, 'cancellation_hours', 12, 'requires_confirmation', false) as booking_rules,
    NOW() as created_at,
    NOW() as updated_at
FROM users u 
WHERE u.role = 'provider' 
AND NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.provider_id = u.id 
    AND s.name = 'Beauty Treatment'
)
LIMIT 1;

INSERT INTO services (provider_id, name, description, duration_minutes, price, color_code, is_active, booking_rules, created_at, updated_at)
SELECT 
    u.id as provider_id,
    'Fitness Training' as name,
    'Personal fitness training session' as description,
    60 as duration_minutes,
    60.00 as price,
    '#9C27B0' as color_code,
    true as is_active,
    JSON_OBJECT('advance_booking_hours', 12, 'cancellation_hours', 6, 'requires_confirmation', false) as booking_rules,
    NOW() as created_at,
    NOW() as updated_at
FROM users u 
WHERE u.role = 'provider' 
AND NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.provider_id = u.id 
    AND s.name = 'Fitness Training'
)
LIMIT 1;

-- 8. ADD ORIGINAL NOTIFICATION TEMPLATES
INSERT INTO notification_templates (name, type, subject, content, is_active, created_at, updated_at)
VALUES 
('appointment_confirmation', 'email', 'Appointment Confirmed', 
'Dear {client_name},\n\nYour appointment has been confirmed:\n\nService: {service_name}\nProvider: {provider_name}\nDate: {appointment_date}\nTime: {appointment_time}\nDuration: {duration} minutes\n\nPlease arrive 5 minutes early.\n\nThank you!', 
true, NOW(), NOW()),

('appointment_reminder_24h', 'email', 'Appointment Reminder - Tomorrow', 
'Dear {client_name},\n\nThis is a reminder that you have an appointment tomorrow:\n\nService: {service_name}\nProvider: {provider_name}\nDate: {appointment_date}\nTime: {appointment_time}\n\nSee you tomorrow!', 
true, NOW(), NOW()),

('appointment_reminder_2h', 'email', 'Appointment Reminder - 2 Hours', 
'Dear {client_name},\n\nYour appointment is in 2 hours:\n\nService: {service_name}\nProvider: {provider_name}\nTime: {appointment_time}\n\nPlease prepare for your visit.', 
true, NOW(), NOW()),

('appointment_cancellation', 'email', 'Appointment Cancelled', 
'Dear {client_name},\n\nYour appointment has been cancelled:\n\nService: {service_name}\nOriginal Date: {appointment_date}\nOriginal Time: {appointment_time}\n\nReason: {cancellation_reason}\n\nPlease contact us to reschedule.', 
true, NOW(), NOW()),

('appointment_rescheduled', 'email', 'Appointment Rescheduled', 
'Dear {client_name},\n\nYour appointment has been rescheduled:\n\nService: {service_name}\nNew Date: {new_appointment_date}\nNew Time: {new_appointment_time}\nPrevious Date: {old_appointment_date}\nPrevious Time: {old_appointment_time}\n\nSee you at the new time!', 
true, NOW(), NOW())

ON DUPLICATE KEY UPDATE
content = VALUES(content),
updated_at = NOW();

-- 9. CLEAN UP CONTAMINATED USER DATA
-- Reset any users with Lodge Mobile specific data
UPDATE users 
SET preferences = JSON_OBJECT(
    'notificationEmail', true,
    'notificationSms', false,
    'notificationTelegram', true,
    'reminderHours', JSON_ARRAY(24, 2),
    'language', 'en'
)
WHERE preferences LIKE '%lodge%' 
   OR preferences LIKE '%Lodge%'
   OR preferences LIKE '%mobile%';

-- 10. VERIFY CLEANUP
-- These queries should return 0 or empty results after cleanup
SELECT 'Remaining Lodge Mobile services:' as check_type, COUNT(*) as count 
FROM services 
WHERE name LIKE '%Lodge Mobile%' 
   OR description LIKE '%Lodge Mobile%';

SELECT 'Remaining Lodge Mobile appointments:' as check_type, COUNT(*) as count 
FROM appointments a
JOIN services s ON a.service_id = s.id
WHERE s.name LIKE '%Lodge Mobile%';

SELECT 'Remaining unauthorized admin users:' as check_type, COUNT(*) as count 
FROM users 
WHERE telegram_id = '7930798268';

-- 11. OPTIMIZE TABLES AFTER CLEANUP
OPTIMIZE TABLE services;
OPTIMIZE TABLE appointments;
OPTIMIZE TABLE appointment_history;
OPTIMIZE TABLE waitlist;
OPTIMIZE TABLE notifications;
OPTIMIZE TABLE notification_templates;
OPTIMIZE TABLE users;

-- CLEANUP COMPLETE
SELECT 'Database cleanup completed successfully!' as status,
       NOW() as completed_at;