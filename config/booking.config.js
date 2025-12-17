/**
 * Lodge Mobile Booking Configuration
 * Business rules and constraints for appointment booking
 */

module.exports = {
  // Timezone configuration
  timezone: 'America/New_York', // Eastern Time
  
  // Business hours (EST/EDT) - 8am-5pm PST = 11am-8pm EST
  businessHours: {
    start: 11, // 11:00 AM EST (8:00 AM PST)
    end: 20,   // 8:00 PM EST (5:00 PM PST) - 20:00 in 24h format
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] // Closed Sundays
  },
  
  // Booking constraints
  bookingLimits: {
    maxSlotsPerDay: 6,           // Maximum 6 bookings per day (9 hours / 1.5 hours)
    slotDurationMinutes: 90,     // Each slot is 90 minutes (1.5 hours)
    bufferBetweenSlots: 0,        // No buffer between slots
    advanceBookingDays: 7,        // Can book up to 7 days in advance
    minAdvanceHours: 2            // Must book at least 2 hours in advance
  },
  
  // Notification settings
  notifications: {
    // Telegram group ID for notifications (needs to be set)
    groupChatId: process.env.TELEGRAM_GROUP_ID || null,
    // Topic ID for forum groups (messages only go to this topic)
    topicId: process.env.TELEGRAM_GROUP_TOPIC_ID ? parseInt(process.env.TELEGRAM_GROUP_TOPIC_ID) : null,
    
    // Notification templates
    templates: {
      newBooking: '🎉 *New Booking Alert!*\n\n' +
                  '👤 Customer: {customerName}\n' +
                  '📱 Service: {serviceName}\n' +
                  '📅 Date: {date}\n' +
                  '⏰ Time: {time}\n' +
                  '📍 Slot #{slotNumber} of {maxSlots} for the day',
                  
      cancellation: '❌ *Booking Cancelled*\n\n' +
                    '👤 Customer: {customerName}\n' +
                    '📱 Service: {serviceName}\n' +
                    '📅 Date: {date}\n' +
                    '⏰ Time: {time}\n' +
                    '🔓 Slot is now available',
                    
      dailyLimit: '⚠️ *Daily Booking Limit Reached*\n\n' +
                  '📅 Date: {date}\n' +
                  '🔒 All 5 slots are now booked\n' +
                  'No more bookings available for this day'
    }
  },
  
  // Service durations (in minutes)
  serviceDurations: {
    'New Customer Registration': 30,
    'SIM Card Activation': 15,
    'Technical Support': 20,
    'Device Upgrade Consultation': 45
  }
};