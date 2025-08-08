const cron = require('node-cron');
const moment = require('moment-timezone');
const Appointment = require('../models/Appointment');

class ReminderScheduler {
  constructor(bot) {
    this.bot = bot;
    this.scheduledReminders = new Map(); // Track scheduled reminders
    this.sentReminders = new Map(); // Track sent reminders to avoid duplicates
  }

  start() {
    console.log('🔔 Reminder Scheduler started');
    
    // Check for upcoming appointments every minute
    cron.schedule('* * * * *', async () => {
      await this.checkAndScheduleReminders();
    });

    // Clean up old sent reminders daily
    cron.schedule('0 0 * * *', () => {
      this.cleanupOldReminders();
    });

    // Initial check on startup
    this.checkAndScheduleReminders();
  }

  async checkAndScheduleReminders() {
    try {
      // Get all upcoming appointments in the next 24 hours
      const now = moment().tz('America/New_York');
      const tomorrow = moment().tz('America/New_York').add(24, 'hours');
      
      const appointments = await Appointment.query()
        .where('appointment_datetime', '>', now.format('YYYY-MM-DD HH:mm:ss'))
        .where('appointment_datetime', '<', tomorrow.format('YYYY-MM-DD HH:mm:ss'))
        .whereIn('status', ['scheduled', 'confirmed'])
        .withGraphFetched('[client, service, provider]');

      for (const appointment of appointments) {
        await this.scheduleRemindersForAppointment(appointment);
      }
    } catch (error) {
      console.error('Error checking appointments for reminders:', error);
    }
  }

  async scheduleRemindersForAppointment(appointment) {
    const appointmentTime = moment(appointment.appointment_datetime).tz('America/New_York');
    const now = moment().tz('America/New_York');
    
    // Define reminder intervals (in minutes before appointment)
    const reminderIntervals = [
      { minutes: 720, label: '12 hours' },  // 12 hours
      { minutes: 180, label: '3 hours' },   // 3 hours
      { minutes: 60, label: '1 hour' },     // 1 hour
      { minutes: 30, label: '30 minutes' }  // 30 minutes
    ];

    for (const interval of reminderIntervals) {
      const reminderTime = appointmentTime.clone().subtract(interval.minutes, 'minutes');
      const reminderKey = `${appointment.uuid}_${interval.minutes}`;
      
      // Check if this reminder was already sent
      if (this.sentReminders.has(reminderKey)) {
        continue;
      }

      // If reminder time is in the future and within the next minute
      if (reminderTime.isAfter(now) && reminderTime.isBefore(now.clone().add(1, 'minute'))) {
        // Send reminder immediately (will be sent in the next minute)
        const secondsUntilReminder = reminderTime.diff(now, 'seconds');
        
        if (secondsUntilReminder > 0 && secondsUntilReminder <= 60) {
          setTimeout(() => {
            this.sendReminder(appointment, interval.label);
          }, secondsUntilReminder * 1000);
        }
      }
      // If reminder time is exactly now or just passed (within last minute)
      else if (reminderTime.isSameOrBefore(now) && reminderTime.isAfter(now.clone().subtract(1, 'minute'))) {
        // Send immediately if we haven't sent it yet
        await this.sendReminder(appointment, interval.label);
      }
    }
  }

  async sendReminder(appointment, intervalLabel) {
    const reminderKey = `${appointment.uuid}_${intervalLabel.replace(/\s+/g, '_')}`;
    
    // Prevent duplicate sends
    if (this.sentReminders.has(reminderKey)) {
      return;
    }

    try {
      const client = appointment.client;
      if (!client || !client.telegram_id) {
        return;
      }

      const appointmentTime = moment(appointment.appointment_datetime);
      const displayTime = appointmentTime.format('h:mm A'); // 12-hour format
      const displayDate = appointmentTime.format('MMM DD, YYYY');
      
      // Special handling for 30-minute reminder - requires confirmation
      if (intervalLabel === '30 minutes') {
        // Generate a unique confirmation token
        const confirmToken = appointment.uuid.substring(0, 8).toUpperCase();
        
        // Update appointment to require confirmation
        await Appointment.query()
          .patch({
            confirmation_required: true,
            confirmation_sent_at: moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss'),
            confirmation_token: confirmToken
          })
          .where('id', appointment.id);
        
        const message = `⚠️ *CONFIRMATION REQUIRED - Lodge Mobile Activation*

🔴 *Your appointment starts in 30 minutes!*

📅 Date: ${displayDate}
⏰ Time: ${displayTime}
📱 Service: ${appointment.service.name}
⏱️ Duration: 90 minutes

🚨 *IMPORTANT: You must confirm your attendance!*

Please confirm that you will be available for your appointment. 

⚠️ *Warning: If you do not confirm within 10 minutes, your appointment will be automatically cancelled and the slot will become available for others.*

🆔 Confirmation Code: \`${confirmToken}\``;

        // Send message with confirmation buttons
        const Markup = require('telegraf/markup');
        await this.bot.telegram.sendMessage(client.telegram_id, message, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Confirm - I Will Attend', `confirm_apt_${appointment.uuid}`),
            ],
            [
              Markup.button.callback('❌ Cancel Appointment', `cancel_apt_${appointment.uuid}`)
            ]
          ]).reply_markup
        });
        
        // Schedule automatic cancellation in 10 minutes if not confirmed
        setTimeout(async () => {
          await this.checkAndCancelUnconfirmed(appointment);
        }, 10 * 60 * 1000); // 10 minutes
        
        // Send notification to administrators
        await this.notifyAdminsOfUpcomingAppointment(appointment, displayTime, displayDate);
        
      } else {
        // Regular reminder without confirmation requirement
        const message = `🔔 *Lodge Mobile Activation Reminder*

⏰ *${intervalLabel} until your appointment*

📅 Date: ${displayDate}
⏰ Time: ${displayTime}
📱 Service: ${appointment.service.name}
⏱️ Duration: 90 minutes (1.5 hours)

📍 Location: Lodge Mobile
🆔 Confirmation: \`${appointment.uuid}\`

To cancel, use: /cancel ${appointment.uuid}`;

        await this.bot.telegram.sendMessage(client.telegram_id, message, {
          parse_mode: 'Markdown'
        });
      }

      // Mark this reminder as sent
      this.sentReminders.set(reminderKey, Date.now());
      
      console.log(`✅ Sent ${intervalLabel} reminder for appointment ${appointment.uuid}`);
    } catch (error) {
      console.error(`Error sending ${intervalLabel} reminder:`, error);
    }
  }

  async notifyAdminsOfUpcomingAppointment(appointment, displayTime, displayDate) {
    try {
      const User = require('../models/User');
      
      // Get all admin users
      const admins = await User.query()
        .where('role', 'admin')
        .where('is_active', true);
      
      if (!admins || admins.length === 0) {
        console.log('No active admins found for notification');
        return;
      }
      
      // Prepare customer information
      const customerInfo = [];
      if (appointment.customer_first_name) {
        customerInfo.push(`👤 *Customer:* ${appointment.customer_first_name} ${appointment.customer_middle_name || ''} ${appointment.customer_last_name}`.trim());
      }
      if (appointment.customer_email) {
        customerInfo.push(`📧 *Email:* ${appointment.customer_email}`);
      }
      if (appointment.customer_dob) {
        customerInfo.push(`🎂 *DOB:* ${moment(appointment.customer_dob).format('MM/DD/YYYY')}`);
      }
      if (appointment.billing_address) {
        customerInfo.push(`🏠 *Address:* ${appointment.billing_address}`);
      }
      if (appointment.drivers_license_number) {
        customerInfo.push(`🪪 *DL:* ${appointment.drivers_license_number}`);
      }
      
      // Get client's Telegram username if available
      let clientContact = '';
      if (appointment.client && appointment.client.telegram_id) {
        clientContact = `\n💬 *Telegram ID:* ${appointment.client.telegram_id}`;
        if (appointment.client.first_name || appointment.client.last_name) {
          clientContact += `\n👤 *Telegram Name:* ${appointment.client.first_name || ''} ${appointment.client.last_name || ''}`.trim();
        }
      }
      
      const adminMessage = `🔔 *ADMIN ALERT - Appointment in 30 Minutes*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Date:* ${displayDate}
⏰ *Time:* ${displayTime}
📱 *Service:* ${appointment.service.name}
⏱️ *Duration:* 90 minutes

📋 *Customer Information:*
${customerInfo.join('\n')}

📞 *Contact Details:*${clientContact}

🆔 *Appointment ID:* \`${appointment.uuid.substring(0, 8).toUpperCase()}\`
✅ *Confirmation Status:* ${appointment.confirmation_required ? '⏳ Awaiting confirmation' : '✅ Ready'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Customer has been sent confirmation request.
If not confirmed within 10 minutes, appointment will auto-cancel.`;
      
      // Send notification to each admin
      for (const admin of admins) {
        if (admin.telegram_id) {
          try {
            await this.bot.telegram.sendMessage(admin.telegram_id, adminMessage, {
              parse_mode: 'Markdown'
            });
            console.log(`📱 Sent 30-min admin notification to ${admin.first_name} ${admin.last_name}`);
          } catch (error) {
            console.error(`Failed to send admin notification to ${admin.email}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error sending admin notifications:', error);
    }
  }

  async notifyAdminsOfCancellation(appointment, displayDate, displayTime) {
    try {
      const User = require('../models/User');
      
      // Get all admin users
      const admins = await User.query()
        .where('role', 'admin')
        .where('is_active', true);
      
      if (!admins || admins.length === 0) {
        return;
      }
      
      const customerName = appointment.customer_first_name ? 
        `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim() : 
        'Unknown Customer';
      
      const adminMessage = `🚫 *AUTO-CANCELLED - No Confirmation*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Date:* ${displayDate}
⏰ *Time:* ${displayTime}
👤 *Customer:* ${customerName}
📱 *Service:* ${appointment.service.name}

❌ *Reason:* Customer did not confirm within 10 minutes
📭 *Result:* Slot is now available for rebooking

🆔 *Cancelled ID:* \`${appointment.uuid.substring(0, 8).toUpperCase()}\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      
      // Send to all admins
      for (const admin of admins) {
        if (admin.telegram_id) {
          try {
            await this.bot.telegram.sendMessage(admin.telegram_id, adminMessage, {
              parse_mode: 'Markdown'
            });
            console.log(`📱 Notified admin ${admin.first_name} of auto-cancellation`);
          } catch (error) {
            console.error(`Failed to notify admin ${admin.email}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error notifying admins of cancellation:', error);
    }
  }

  async checkAndCancelUnconfirmed(appointment) {
    try {
      // Fetch the latest appointment status
      const currentAppointment = await Appointment.query()
        .findById(appointment.id)
        .withGraphFetched('[client, service]');
      
      // If appointment requires confirmation but hasn't been confirmed
      if (currentAppointment && 
          currentAppointment.confirmation_required && 
          !currentAppointment.confirmed &&
          currentAppointment.status === 'scheduled') {
        
        // Cancel the appointment
        await Appointment.query()
          .patch({
            status: 'cancelled',
            cancellation_reason: 'Not confirmed within 15 minutes of reminder',
            cancelled_at: moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss')
          })
          .where('id', appointment.id);
        
        // Notify the client
        const appointmentTime = moment(currentAppointment.appointment_datetime);
        const displayTime = appointmentTime.format('h:mm A');
        const displayDate = appointmentTime.format('MMM DD, YYYY');
        
        if (currentAppointment.client && currentAppointment.client.telegram_id) {
          await this.bot.telegram.sendMessage(currentAppointment.client.telegram_id, 
            `❌ *Appointment Automatically Cancelled*

Your appointment has been cancelled because you did not confirm your attendance within 10 minutes of the reminder.

📅 Cancelled Date: ${displayDate}
⏰ Cancelled Time: ${displayTime}
📱 Service: ${currentAppointment.service.name}

The time slot is now available for others to book.

To book a new appointment, please use /book

Thank you for your understanding.`,
            { parse_mode: 'Markdown' }
          );
        }
        
        // Notify administrators about the auto-cancellation
        await this.notifyAdminsOfCancellation(currentAppointment, displayDate, displayTime);
        
        console.log(`🚫 Auto-cancelled unconfirmed appointment ${appointment.uuid}`);
      }
    } catch (error) {
      console.error('Error checking/cancelling unconfirmed appointment:', error);
    }
  }

  cleanupOldReminders() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // Remove reminders older than 24 hours
    for (const [key, timestamp] of this.sentReminders.entries()) {
      if (timestamp < oneDayAgo) {
        this.sentReminders.delete(key);
      }
    }
    
    console.log('🧹 Cleaned up old reminder records');
  }

  stop() {
    // Destroy all cron jobs
    cron.getTasks().forEach(task => task.stop());
    console.log('🔔 Reminder Scheduler stopped');
  }
}

module.exports = ReminderScheduler;