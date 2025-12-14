/**
 * English - Booking translations
 * Booking flow, date/time selection, confirmation, appointments view
 */

module.exports = {
  // Booking flow
  book_start: '📅 *Book Your Appointment*\n\nLet\'s schedule your appointment!',
  select_date: '📅 Please select a date for your appointment:',
  select_time: '🕐 Select an appointment time for {date}:',
  no_dates_available: 'No available dates found. Please try again later.',
  no_times_available: 'No available times for this date. Please select another date.',

  // Appointment details (legacy - kept for compatibility)
  enter_name: '👤 Please enter your full name:',
  enter_phone: '📱 Please enter your phone number:',
  enter_email: '📧 Please enter your email address (or type "skip" to skip):',

  // Confirmation
  confirm_booking: '*📋 Confirm Your Appointment*\n\n📅 Date: {date}\n🕐 Time: {time}\n⏱️ Duration: 90 minutes\n\n*Customer Information:*\n👤 Name: {fullName}\n🎂 DOB: {dob}\n🏠 Address: {address}\n📧 Email: {email}\n📱 Phone: {phone}\n🪪 DL: {dlInfo}\n\n🏢 Service: Lodge Scheduler\n\nIs this information correct?',
  booking_confirmed: '✅ *Appointment Confirmed!*\n\nYour appointment has been booked.\n\n📅 Date: {date}\n🕐 Time: {time}\n⏱️ Duration: 90 minutes\n🏢 Service: Lodge Scheduler\n\n📱 Reference ID: {refId}\n\n*Important:*\n• Please arrive 5 minutes early\n• Bring valid ID and account information\n• You\'ll receive reminders before your appointment\n\nTo view or cancel: /myappointments',

  // Appointments view
  my_appointments: '*📋 Your Appointments:*',
  no_appointments: 'You have no appointments scheduled.\n\nUse /book to schedule a new appointment.',
  appointment_item: '{index}. *Appointment*\n   📅 {date}\n   🕐 {time}\n   ⏱️ Duration: 90 minutes\n   📱 Reference: {refId}\n   📍 Status: {status}',

  // Cancellation
  cancel_select: '❌ *Cancel Appointment*\n\nSelect the appointment you want to cancel:',
  cancel_confirm: '⚠️ *Confirm Cancellation*\n\nAre you sure you want to cancel this appointment?\n\n📅 Date: {date}\n🕐 Time: {time}\n\nThis action cannot be undone.',
  cancel_success: '✅ Your appointment has been cancelled successfully.',
  cancel_failed: '❌ Failed to cancel appointment. Please try again.',

  // Reminders
  reminder_12hr: '🔔 *Appointment Reminder*\n\nYou have an appointment tomorrow:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nSee you tomorrow!',
  reminder_3hr: '🔔 *Appointment Reminder*\n\nYour appointment is in 3 hours:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nPlease prepare your documents.',
  reminder_1hr: '⏰ *Appointment Starting Soon*\n\nYour appointment is in 1 hour:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nPlease start making your way to the location.',
  reminder_30min: '🚨 *Final Reminder*\n\nYour appointment is in 30 minutes:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nPlease arrive 5 minutes early.'
};
