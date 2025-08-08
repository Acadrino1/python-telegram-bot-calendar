-- Initial database setup
-- This file runs automatically when MySQL container starts for the first time

-- Ensure the database exists
CREATE DATABASE IF NOT EXISTS appointment_scheduler;
USE appointment_scheduler;

-- Grant all privileges to the app user
GRANT ALL PRIVILEGES ON appointment_scheduler.* TO 'appuser'@'%';
FLUSH PRIVILEGES;

-- Set timezone support
SET GLOBAL time_zone = '+00:00';
SET time_zone = '+00:00';

-- Create initial indexes for better performance
-- (These will be properly created by migrations, but we set up the database here)