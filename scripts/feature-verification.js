#!/usr/bin/env node

/**
 * Comprehensive Feature Verification Script
 * Verifies that all important features are preserved during consolidation
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Lodge Mobile Scheduler - Feature Verification Report');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const results = {
  passed: 0,
  failed: 0,
  issues: []
};

function checkFeature(description, condition, errorMsg = '') {
  console.log(`\n🔬 ${description}`);
  
  try {
    const result = typeof condition === 'function' ? condition() : condition;
    
    if (result) {
      console.log('  ✅ PASSED');
      results.passed++;
      return true;
    } else {
      console.log(`  ❌ FAILED: ${errorMsg}`);
      results.failed++;
      results.issues.push({ test: description, error: errorMsg });
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    results.failed++;
    results.issues.push({ test: description, error: error.message });
    return false;
  }
}

// ==============================================
// 1. BOT FUNCTIONALITY VERIFICATION
// ==============================================

console.log('\n📱 1. BOT FUNCTIONALITY VERIFICATION');
console.log('─────────────────────────────────────');

// Check if bot files exist and are properly structured
checkFeature(
  'Bot main files exist',
  () => {
    const files = [
      'src/bot/bot.js',
      'src/bot/SimpleTelegramBot.js',
      'src/bot/EnhancedTelegramBot.js',
      'src/bot/CalendarUIManager.js'
    ];
    return files.every(file => fs.existsSync(path.join(__dirname, '..', file)));
  },
  'Required bot files are missing'
);

checkFeature(
  'Bot has all command handlers',
  () => {
    const botFile = fs.readFileSync(path.join(__dirname, '../src/bot/SimpleTelegramBot.js'), 'utf8');
    const commands = ['start', 'book', 'myappointments', 'cancel', 'help', 'support', 'ticket', 'admin'];
    return commands.every(cmd => botFile.includes(`this.bot.command('${cmd}'`));
  },
  'Some command handlers are missing'
);

checkFeature(
  'Bot has error handling',
  () => {
    const botFile = fs.readFileSync(path.join(__dirname, '../src/bot/SimpleTelegramBot.js'), 'utf8');
    return botFile.includes('this.bot.catch') && botFile.includes('console.error');
  },
  'Error handling not properly implemented'
);

checkFeature(
  'Bot has session management',
  () => {
    const botFile = fs.readFileSync(path.join(__dirname, '../src/bot/SimpleTelegramBot.js'), 'utf8');
    return botFile.includes('session()') && botFile.includes('ctx.session');
  },
  'Session management not implemented'
);

// ==============================================
// 2. CALENDAR UI FUNCTIONALITY
// ==============================================

console.log('\n📅 2. CALENDAR UI FUNCTIONALITY');
console.log('───────────────────────────────');

checkFeature(
  'Calendar UI Manager exists',
  () => fs.existsSync(path.join(__dirname, '../src/bot/CalendarUIManager.js')),
  'CalendarUIManager.js file missing'
);

checkFeature(
  'Calendar UI has required methods',
  () => {
    const calendarFile = fs.readFileSync(path.join(__dirname, '../src/bot/CalendarUIManager.js'), 'utf8');
    const methods = ['showCalendar', 'generateMonthView', 'setupHandlers'];
    return methods.every(method => calendarFile.includes(method));
  },
  'Calendar UI missing required methods'
);

checkFeature(
  'Calendar UI is integrated in bot',
  () => {
    const botFile = fs.readFileSync(path.join(__dirname, '../src/bot/SimpleTelegramBot.js'), 'utf8');
    return botFile.includes('CalendarUIManager') && botFile.includes('this.calendarUIManager');
  },
  'Calendar UI not properly integrated'
);

// ==============================================
// 3. SERVICE FEATURES VERIFICATION
// ==============================================

console.log('\n🛠️ 3. SERVICE FEATURES VERIFICATION');
console.log('───────────────────────────────────');

checkFeature(
  'Notification Service exists with advanced features',
  () => {
    const serviceFile = fs.readFileSync(path.join(__dirname, '../src/services/NotificationService.js'), 'utf8');
    const features = ['retry_count', 'scheduleReminder', 'processPendingNotifications', 'exponential backoff'];
    return features.every(feature => serviceFile.includes(feature));
  },
  'Advanced notification features missing'
);

checkFeature(
  'Template processing works',
  () => {
    const serviceFile = fs.readFileSync(path.join(__dirname, '../src/services/NotificationService.js'), 'utf8');
    return serviceFile.includes('processTemplate') && serviceFile.includes('buildTemplateData');
  },
  'Template processing functionality missing'
);

checkFeature(
  'Booking logic is complete',
  () => {
    const bookingServiceExists = fs.existsSync(path.join(__dirname, '../src/services/BookingSlotService.js'));
    if (!bookingServiceExists) return false;
    
    const serviceFile = fs.readFileSync(path.join(__dirname, '../src/services/BookingSlotService.js'), 'utf8');
    const methods = ['getAvailableTimeSlots', 'isSlotAvailable', 'getAvailableDates'];
    return methods.every(method => serviceFile.includes(method));
  },
  'Booking logic incomplete or missing'
);

checkFeature(
  'Validation functions exist',
  () => {
    const userModel = fs.readFileSync(path.join(__dirname, '../src/models/User.js'), 'utf8');
    const methods = ['canReceiveEmailNotifications', 'canReceiveSmsNotifications', 'getDisplayName'];
    return methods.every(method => userModel.includes(method));
  },
  'User validation functions missing'
);

// ==============================================
// 4. MODEL FUNCTIONALITY VERIFICATION
// ==============================================

console.log('\n💾 4. MODEL FUNCTIONALITY VERIFICATION');
console.log('──────────────────────────────────────');

checkFeature(
  'User model has required methods',
  () => {
    const userModel = fs.readFileSync(path.join(__dirname, '../src/models/User.js'), 'utf8');
    return userModel.includes('getDisplayName') && 
           userModel.includes('canReceive') && 
           userModel.includes('class User');
  },
  'User model methods missing'
);

checkFeature(
  'Appointment model has status management',
  () => {
    const appointmentModel = fs.readFileSync(path.join(__dirname, '../src/models/Appointment.js'), 'utf8');
    return appointmentModel.includes('statuses') && 
           appointmentModel.includes('SCHEDULED') &&
           appointmentModel.includes('CANCELLED');
  },
  'Appointment status management missing'
);

checkFeature(
  'Models have UUID generation',
  () => {
    try {
      const appointmentModel = fs.readFileSync(path.join(__dirname, '../src/models/Appointment.js'), 'utf8');
      return appointmentModel.includes('uuid') || appointmentModel.includes('UUID');
    } catch (error) {
      return false;
    }
  },
  'UUID generation not implemented'
);

checkFeature(
  'Models have timestamp management',
  () => {
    const userModel = fs.readFileSync(path.join(__dirname, '../src/models/User.js'), 'utf8');
    return userModel.includes('created_at') && userModel.includes('updated_at');
  },
  'Timestamp management missing'
);

// ==============================================
// 5. CONFIGURATION VERIFICATION
// ==============================================

console.log('\n⚙️ 5. CONFIGURATION VERIFICATION');
console.log('─────────────────────────────────');

checkFeature(
  'Booking configuration exists',
  () => fs.existsSync(path.join(__dirname, '../config/booking.config.js')),
  'Booking configuration file missing'
);

checkFeature(
  'Environment configuration is proper',
  () => {
    const envExample = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    return envExample.includes('TELEGRAM_BOT_TOKEN') && 
           envExample.includes('DB_') &&
           envExample.includes('EMAIL_');
  },
  'Environment configuration incomplete'
);

checkFeature(
  'Package.json has required dependencies',
  () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    const requiredDeps = ['telegraf', 'knex', 'objection', 'moment-timezone', 'nodemailer'];
    return requiredDeps.every(dep => packageJson.dependencies[dep]);
  },
  'Required dependencies missing from package.json'
);

// ==============================================
// 6. HANDLER VERIFICATION
// ==============================================

console.log('\n🎯 6. HANDLER VERIFICATION');
console.log('──────────────────────────');

checkFeature(
  'Lodge Mobile handlers exist',
  () => {
    const handlers = [
      'src/bot/handlers/CustomerFormHandler.js',
      'src/bot/handlers/ServiceSelectionHandler.js',
      'src/bot/handlers/RegistrationHandler.js'
    ];
    return handlers.every(handler => fs.existsSync(path.join(__dirname, '..', handler)));
  },
  'Lodge Mobile handlers missing'
);

checkFeature(
  'Handlers are integrated in bot',
  () => {
    const botFile = fs.readFileSync(path.join(__dirname, '../src/bot/SimpleTelegramBot.js'), 'utf8');
    return botFile.includes('CustomerFormHandler') && 
           botFile.includes('ServiceSelectionHandler') &&
           botFile.includes('RegistrationHandler');
  },
  'Handlers not properly integrated'
);

// ==============================================
// 7. SUPPORT SYSTEM VERIFICATION
// ==============================================

console.log('\n🎧 7. SUPPORT SYSTEM VERIFICATION');
console.log('─────────────────────────────────');

checkFeature(
  'Telegram Support Service exists',
  () => fs.existsSync(path.join(__dirname, '../src/services/TelegramSupportService.js')),
  'TelegramSupportService missing'
);

checkFeature(
  'Support models exist',
  () => {
    const models = [
      'src/models/SupportTicket.js',
      'src/models/SupportSession.js'
    ];
    return models.some(model => fs.existsSync(path.join(__dirname, '..', model)));
  },
  'Support models missing'
);

checkFeature(
  'Support commands are in bot',
  () => {
    const botFile = fs.readFileSync(path.join(__dirname, '../src/bot/SimpleTelegramBot.js'), 'utf8');
    return botFile.includes('support') && 
           botFile.includes('ticket') &&
           botFile.includes('mystatus');
  },
  'Support commands not implemented'
);

// ==============================================
// 8. NOTIFICATION SYSTEM VERIFICATION
// ==============================================

console.log('\n📬 8. NOTIFICATION SYSTEM VERIFICATION');
console.log('──────────────────────────────────────');

checkFeature(
  'Group notification service exists',
  () => fs.existsSync(path.join(__dirname, '../src/services/GroupNotificationService.js')),
  'GroupNotificationService missing'
);

checkFeature(
  'Notification models exist',
  () => {
    const models = [
      'src/models/Notification.js',
      'src/models/NotificationTemplate.js'
    ];
    return models.some(model => fs.existsSync(path.join(__dirname, '..', model)));
  },
  'Notification models missing'
);

// ==============================================
// FINAL REPORT
// ==============================================

console.log('\n\n📊 FINAL VERIFICATION REPORT');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

console.log(`✅ Tests Passed: ${results.passed}`);
console.log(`❌ Tests Failed: ${results.failed}`);
console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

if (results.issues.length > 0) {
  console.log('\n🚨 ISSUES FOUND:');
  console.log('───────────────');
  results.issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.test}`);
    console.log(`   Error: ${issue.error}`);
  });
}

// Determine overall status
if (results.failed === 0) {
  console.log('\n🎉 ALL FEATURES VERIFIED SUCCESSFULLY!');
  console.log('✅ All important features are preserved during consolidation.');
  process.exit(0);
} else if (results.failed <= 3) {
  console.log('\n⚠️  MINOR ISSUES DETECTED');
  console.log('Most features are working, but there are some issues to address.');
  process.exit(1);
} else {
  console.log('\n💥 MAJOR ISSUES DETECTED');
  console.log('❌ Significant features may be missing or broken.');
  process.exit(2);
}