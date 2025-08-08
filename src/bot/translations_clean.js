const translations = {
  en: {
    // Welcome messages - RESTORED GENERIC BRANDING
    welcome: '🏥 *Welcome to Appointment Scheduler Bot!*\n\nHello {firstName}! I\'m here to help you book and manage appointments.',
    welcome_back: '🏥 *Welcome back to Appointment Scheduler Bot!*\n\nHello {firstName}! Welcome back.',
    
    // Commands - RESTORED ORIGINAL FUNCTIONALITY
    commands_available: '*Available Commands:*',
    cmd_book: '📅 /book - Book a new appointment',
    cmd_appointments: '📋 /myappointments - View your appointments', 
    cmd_cancel: '❌ /cancel - Cancel an appointment',
    cmd_help: 'ℹ️ /help - Show help message',
    cmd_profile: '👤 /profile - View/update your profile',
    
    // Booking flow - RESTORED CATEGORY SELECTION
    book_start: '📅 *Book an Appointment*\n\nLet\'s schedule your appointment! First, select a service category:',
    select_category: 'Please select a service category:',
    select_service: 'Please select a service:',
    select_provider: 'Please select a provider:',
    select_date: '📅 Please select a date for your appointment:',
    select_time: '🕐 Select an appointment time for {date}:',
    
    // Customer information - SIMPLIFIED DATA COLLECTION
    enter_name: '👤 Please enter your full name:',
    enter_phone: '📱 Please enter your phone number:',
    enter_email: '📧 Please enter your email address (optional - type "skip" to skip):',
    
    // Confirmation - GENERIC APPOINTMENT CONFIRMATION  
    confirm_booking: '*📋 Confirm Your Appointment*\n\n📅 Date: {date}\n🕐 Time: {time}\n👤 Name: {name}\n📱 Phone: {phone}\n📧 Email: {email}\n🏢 Service: {serviceName}\n👨‍⚕️ Provider: {providerName}\n\nIs this information correct?',
    booking_confirmed: '✅ *Appointment Confirmed!*\n\nYour appointment has been booked successfully.\n\n📅 Date: {date}\n🕐 Time: {time}\n🏢 Service: {serviceName}\n👨‍⚕️ Provider: {providerName}\n\n📱 Reference ID: {refId}\n\nTo view or manage: /myappointments',
    
    // Appointments view - GENERIC APPOINTMENT DISPLAY
    my_appointments: '*📋 Your Appointments:*',
    no_appointments: 'You have no appointments scheduled.\n\nUse /book to schedule a new appointment.',
    appointment_item: '{index}. *{serviceName}*\n   📅 {date}\n   🕐 {time}\n   👨‍⚕️ {providerName}\n   📱 Reference: {refId}\n   📍 Status: {status}',
    
    // Cancellation
    cancel_select: '❌ *Cancel Appointment*\n\nSelect the appointment you want to cancel:',
    cancel_confirm: '⚠️ *Confirm Cancellation*\n\nAre you sure you want to cancel this appointment?\n\n📅 Date: {date}\n🕐 Time: {time}\n\nThis action cannot be undone.',
    cancel_success: '✅ Your appointment has been cancelled successfully.',
    cancel_failed: '❌ Failed to cancel appointment. Please try again.',
    
    // Categories - RESTORED ALL SERVICE CATEGORIES
    category_medical: '🏥 Medical',
    category_beauty: '💅 Beauty',
    category_dental: '🦷 Dental', 
    category_wellness: '💆 Wellness',
    category_fitness: '🏋️ Fitness',
    category_consultation: '📚 Consultation',
    
    // Errors
    error_generic: '❌ An error occurred. Please try again.',
    error_invalid_input: '❌ Invalid input. Please try again.',
    error_booking_failed: '❌ Failed to book appointment. Please try again.',
    session_expired: '⏰ Session expired. Please use /book to start over.',
    
    // Reminders - GENERIC SERVICE REFERENCES
    reminder_24hr: '🔔 *Appointment Reminder*\n\nYou have an appointment tomorrow:\n📅 {date}\n🕐 {time}\n🏢 {serviceName}\n👨‍⚕️ {providerName}\n\nSee you tomorrow!',
    reminder_2hr: '🔔 *Appointment Reminder*\n\nYour appointment is in 2 hours:\n📅 {date}\n🕐 {time}\n🏢 {serviceName}\n👨‍⚕️ {providerName}\n\nPlease prepare for your appointment.',
    
    // Buttons
    btn_yes: '✅ Yes',
    btn_no: '❌ No', 
    btn_confirm: '✅ Confirm',
    btn_cancel: '❌ Cancel',
    btn_back: '⬅️ Back',
    btn_skip: '⏭️ Skip',
    btn_edit: '✏️ Edit'
  }
};

// Helper function to get translated text
function getText(lang, key, params = {}) {
  const text = translations[lang]?.[key] || translations['en'][key] || key;
  
  // Replace placeholders with actual values
  return text.replace(/{(\w+)}/g, (match, param) => params[param] || match);
}

module.exports = {
  translations,
  getText
};