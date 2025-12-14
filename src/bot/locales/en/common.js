/**
 * English - Common translations
 * Welcome messages, language selection, commands, buttons, errors
 */

module.exports = {
  // Welcome messages
  welcome_admin: '📅 *Welcome to Lodge Scheduler!*\n\nHello {firstName}! You are logged in as an Administrator.',
  welcome_back: '📅 *Welcome to Lodge Scheduler!*\n\nHello {firstName}! Welcome back.',
  welcome_new: '📅 *Welcome to Lodge Scheduler!*\n\nHello {firstName}! Let\'s get you set up.',

  // Language selection
  language_prompt: '🌐 Please select your preferred language:\n🌐 Veuillez choisir votre langue préférée:',
  language_selected: '✅ Language set to English',
  language_changed: '✅ Language changed to English',

  // Commands
  commands_available: '*Available Commands:*',
  commands_admin: '*Admin Commands:*',
  cmd_book: '📅 /book - Book an appointment',
  cmd_appointments: '📋 /myappointments - View appointments',
  cmd_cancel: '❌ /cancel - Cancel appointment',
  cmd_help: 'ℹ️ /help - Show help',
  cmd_admin: '🔧 /admin - Admin commands',
  cmd_language: '🌐 /language - Change language',
  cmd_profiles: '💳 /profiles - Purchase profiles',
  cmd_support: '💬 /support - Live Support Chat',
  cmd_privatesupport: '🔒 /privatesupport - Private Agent Chat',
  cmd_chat: '💭 /chat - Quick Private Support',
  cmd_requests: '/requests - View pending access requests',
  cmd_approve: '/approve - Approve user access',
  cmd_createcode: '/createcode - Create referral code',

  // Buttons
  btn_yes: '✅ Yes',
  btn_no: '❌ No',
  btn_confirm: '✅ Confirm',
  btn_cancel: '❌ Cancel',
  btn_back: '⬅️ Back',
  btn_skip: '⏭️ Skip',
  btn_edit: '✏️ Edit',
  btn_continue: '➡️ Continue',
  btn_english: '🇨🇦 English',
  btn_french: '⚜️ Français',

  // Errors
  error_generic: '❌ An error occurred. Please try again.',
  error_invalid_input: '❌ Invalid input. Please try again.',
  error_invalid_date: '❌ Invalid date format. Please use MM/DD/YYYY format.',
  error_invalid_email: '❌ Invalid email address. Please enter a valid email.',
  error_booking_failed: '❌ Failed to book appointment. Please try again.',
  session_expired: '⏰ Session expired. Please use /book to start over.'
};
