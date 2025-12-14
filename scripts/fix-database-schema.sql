-- COMPREHENSIVE DATABASE SCHEMA FIX
-- This script fixes all identified schema mismatches between Objection.js models and SQLite database

-- =============================================================================
-- 1. FIX APPOINTMENTS TABLE - CRITICAL FIXES FOR BOOKING SYSTEM
-- =============================================================================

-- Step 1: Add missing auto-increment ID column and make it primary key
-- SQLite doesn't support adding primary key to existing table, so we need to recreate

-- Create new appointments table with correct structure
CREATE TABLE appointments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(255) UNIQUE NOT NULL,
    client_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    appointment_datetime DATETIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status VARCHAR(255) DEFAULT 'scheduled',
    notes TEXT,
    provider_notes TEXT, -- ADDED: Missing field for internal notes
    price DECIMAL(10,2), -- FIXED: Changed from FLOAT to DECIMAL
    cancellation_reason TEXT,
    cancelled_at DATETIME,
    cancelled_by INTEGER,
    reminder_sent TEXT DEFAULT '{}', -- Keep as TEXT for SQLite JSON compatibility
    deposit_paid BOOLEAN DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (provider_id) REFERENCES users(id),
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (cancelled_by) REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX idx_appointments_client_status ON appointments_new(client_id, status);
CREATE INDEX idx_appointments_provider_datetime ON appointments_new(provider_id, appointment_datetime, status);
CREATE INDEX idx_appointments_datetime_status ON appointments_new(appointment_datetime, status);
CREATE INDEX idx_appointments_uuid ON appointments_new(uuid);

-- Copy existing data to new table
INSERT INTO appointments_new (
    uuid, client_id, provider_id, service_id, appointment_datetime, duration_minutes,
    status, notes, price, cancellation_reason, cancelled_at, cancelled_by,
    reminder_sent, deposit_paid, created_at, updated_at
)
SELECT 
    uuid, client_id, provider_id, service_id, appointment_datetime, duration_minutes,
    status, notes, price, cancellation_reason, cancelled_at, cancelled_by,
    reminder_sent, deposit_paid, created_at, updated_at
FROM appointments;

-- Drop old table and rename new one
DROP TABLE appointments;
ALTER TABLE appointments_new RENAME TO appointments;

-- =============================================================================
-- 2. FIX SERVICES TABLE - CRITICAL COLUMN NAME MISMATCHES
-- =============================================================================

-- Add missing columns and fix naming issues
ALTER TABLE services ADD COLUMN provider_id INTEGER REFERENCES users(id);
ALTER TABLE services ADD COLUMN duration_minutes INTEGER;
ALTER TABLE services ADD COLUMN is_active BOOLEAN;
ALTER TABLE services ADD COLUMN color_code VARCHAR(7);
ALTER TABLE services ADD COLUMN booking_rules TEXT; -- JSON as TEXT for SQLite

-- Copy duration to duration_minutes and set proper is_active values
UPDATE services SET duration_minutes = duration WHERE duration_minutes IS NULL;
UPDATE services SET is_active = active WHERE is_active IS NULL;

-- Set default values for new columns
UPDATE services SET color_code = '#2196F3' WHERE color_code IS NULL;
UPDATE services SET booking_rules = '{"advance_booking_days":30,"cancellation_hours":24,"same_day_booking":false,"max_advance_days":90,"require_confirmation":false,"allow_waitlist":true}' WHERE booking_rules IS NULL;

-- Create index for provider_id
CREATE INDEX idx_services_provider_active ON services(provider_id, is_active);

-- =============================================================================
-- 3. FIX USERS TABLE - ROLE VALUE MISMATCH
-- =============================================================================

-- Update 'customer' role values to 'client' to match model expectations
UPDATE users SET role = 'client' WHERE role = 'customer';

-- Add missing columns that model might expect
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT 1;
ALTER TABLE users ADD COLUMN sms_notifications BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN preferences TEXT; -- JSON as TEXT for SQLite

-- =============================================================================
-- 4. CREATE MISSING TABLES REFERENCED BY MODELS
-- =============================================================================

-- Create availability_schedules table
CREATE TABLE IF NOT EXISTS availability_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL CHECK(day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    effective_from DATE,
    effective_until DATE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_availability_schedules ON availability_schedules(provider_id, day_of_week, is_active);

-- Create availability_exceptions table
CREATE TABLE IF NOT EXISTS availability_exceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    type VARCHAR(20) NOT NULL CHECK(type IN ('unavailable','special_hours','holiday')),
    reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_availability_exceptions ON availability_exceptions(provider_id, date, type);

-- Create waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    preferred_date DATE NOT NULL,
    preferred_start_time TIME,
    preferred_end_time TIME,
    status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active','notified','expired','fulfilled')),
    notes TEXT,
    expires_at DATETIME NOT NULL,
    notified_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_waitlist_provider_date ON waitlist(provider_id, preferred_date, status);
CREATE INDEX idx_waitlist_client_status ON waitlist(client_id, status);

-- Create appointment_history table
CREATE TABLE IF NOT EXISTS appointment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    changes TEXT, -- JSON as TEXT
    changed_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_appointment_history ON appointment_history(appointment_id, created_at);

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(10) NOT NULL CHECK(type IN ('email','sms')),
    subject VARCHAR(500),
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notification_templates ON notification_templates(name, type, is_active);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK(type IN ('email','sms')),
    template_name VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
    scheduled_for DATETIME NOT NULL,
    sent_at DATETIME,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_status ON notifications(status, scheduled_for);
CREATE INDEX idx_notifications_appointment ON notifications(appointment_id, type);

-- =============================================================================
-- 5. INSERT DEFAULT DATA FOR TESTING
-- =============================================================================

-- Insert default notification templates
INSERT OR IGNORE INTO notification_templates (name, type, subject, content) VALUES
('appointment_confirmation', 'email', 'Appointment Confirmation', 'Your appointment has been confirmed for {{appointment_datetime}}.'),
('appointment_reminder_24h', 'email', 'Appointment Reminder', 'This is a reminder of your appointment tomorrow at {{appointment_datetime}}.'),
('appointment_cancelled', 'email', 'Appointment Cancelled', 'Your appointment for {{appointment_datetime}} has been cancelled.');

-- Create a default service if none exist
INSERT OR IGNORE INTO services (id, name, duration_minutes, price, description, is_active, provider_id, color_code, booking_rules)
SELECT 1, 'General Consultation', 60, 100.00, 'Standard consultation service', 1, NULL, '#2196F3',
'{"advance_booking_days":30,"cancellation_hours":24,"same_day_booking":false,"max_advance_days":90,"require_confirmation":false,"allow_waitlist":true}'
WHERE NOT EXISTS (SELECT 1 FROM services);

-- =============================================================================
-- 6. DATA CONSISTENCY CHECKS AND FIXES
-- =============================================================================

-- Ensure all appointments have valid UUIDs
UPDATE appointments SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('AB89',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) 
WHERE uuid IS NULL OR uuid = '';

-- Ensure all appointments have valid duration_minutes
UPDATE appointments SET duration_minutes = 60 WHERE duration_minutes IS NULL OR duration_minutes <= 0;

-- Ensure all appointments have valid status
UPDATE appointments SET status = 'scheduled' WHERE status IS NULL OR status = '';

-- Ensure reminder_sent is valid JSON
UPDATE appointments SET reminder_sent = '{}' WHERE reminder_sent IS NULL OR reminder_sent = '';

-- =============================================================================
-- VERIFICATION QUERIES (Run these to verify fixes)
-- =============================================================================

-- Verify appointments table structure
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='appointments';

-- Verify services table has required columns  
-- PRAGMA table_info(services);

-- Verify users table role values
-- SELECT DISTINCT role FROM users;

-- Verify appointments have required fields populated
-- SELECT COUNT(*) as total_appointments, 
--        COUNT(uuid) as have_uuid,
--        COUNT(duration_minutes) as have_duration,
--        COUNT(CASE WHEN reminder_sent != '' THEN 1 END) as have_reminder_sent
-- FROM appointments;