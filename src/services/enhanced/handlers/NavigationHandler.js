/**
 * Navigation Handler
 * Handles menu navigation, main menu, service selection, and user appointment actions
 */

const moment = require('moment-timezone');
const {
  safeEditMessage,
  safeAnswerCbQuery
} = require('../utils/CallbackUtils');

class NavigationHandler {
  constructor(services = {}, bot = null) {
    this.services = services;
    this.bot = bot;
    console.log('✅ NavigationHandler initialized');
  }

  /**
   * Main entry point for navigation callbacks
   * @param {Object} ctx - Telegram context
   * @param {string} callbackData - Callback data string
   * @returns {Promise<boolean>} - Whether callback was handled
   */
  async handle(ctx, callbackData) {
    await safeAnswerCbQuery(ctx, 'Loading...');

    if (callbackData === 'book') {
      return await this.showServiceSelection(ctx);
    }

    if (callbackData === 'main_menu' || callbackData === 'start') {
      return await this.showMainMenu(ctx);
    }

    if (callbackData === 'my_appointments') {
      return await this.handleMyAppointments(ctx);
    }

    if (callbackData === 'cancel' || callbackData === 'back') {
      return await this.showMainMenu(ctx);
    }

    return false;
  }

  /**
   * Handle user appointment actions (cancel, edit)
   * @param {Object} ctx - Telegram context
   * @param {string} callbackData - Callback data string
   * @returns {Promise<boolean>} - Whether callback was handled
   */
  async handleUserAppointmentAction(ctx, callbackData) {
    await safeAnswerCbQuery(ctx, 'Processing...');

    try {
      // Handle cancel action
      if (callbackData.startsWith('user_cancel_')) {
        const appointmentId = callbackData.replace('user_cancel_', '');
        return await this.processUserCancellation(ctx, appointmentId);
      }

      // Handle edit action - redirect to rebooking
      if (callbackData.startsWith('user_edit_')) {
        const appointmentId = callbackData.replace('user_edit_', '');

        // For now, advise user to cancel and rebook
        await safeEditMessage(ctx,
          '✏️ *Edit Appointment*\n\n' +
          'To change your appointment time, please cancel this booking and create a new one.\n\n' +
          'Would you like to cancel this appointment?',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Cancel Appointment', callback_data: `user_cancel_${appointmentId}` }],
                [{ text: '← Back to Appointments', callback_data: 'my_appointments' }]
              ]
            }
          }
        );
        return true;
      }

      return false;

    } catch (error) {
      console.error('User appointment action error:', error);
      await safeEditMessage(ctx, '❌ Error processing your request. Please try again.');
      return true;
    }
  }

  /**
   * Handle generic service selection
   */
  async handleGenericService(ctx) {
    await safeAnswerCbQuery(ctx, 'Loading...');

    // For generic service callbacks, show calendar
    if (this.services.calendarUIManager) {
      await this.services.calendarUIManager.showCalendar(ctx);
    } else {
      await safeEditMessage(ctx,
        '✅ *Service Selected*\n\nLet\'s schedule your appointment.\n\nPlease select a date:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Select Date', callback_data: 'select_date' }],
              [{ text: '← Back to Services', callback_data: 'book' }]
            ]
          }
        }
      );
    }
    return true;
  }

  /**
   * Show service selection menu
   */
  async showServiceSelection(ctx) {
    await safeEditMessage(ctx,
      '📅 *Lodge Scheduler Services*\n\nPlease select one of the following service options:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🆕 New Registration', callback_data: 'service_lodge_mobile_new_registration' }],
            [{ text: '📱 SIM Card Activation', callback_data: 'service_lodge_mobile_simcard_activation' }],
            [{ text: '🔧 Technical Support', callback_data: 'service_lodge_mobile_technical_support' }],
            [{ text: '📲 Upgrade Device', callback_data: 'service_lodge_mobile_upgrade_device' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Show main menu
   */
  async showMainMenu(ctx) {
    await safeEditMessage(ctx,
      '🏠 *Main Menu*\n\nWhat would you like to do?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📅 Book Appointment', callback_data: 'book' }],
            [{ text: '📋 My Appointments', callback_data: 'my_appointments' }],
            [{ text: '🎧 Support', callback_data: 'support_main' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Handle my_appointments callback - show user's appointments
   */
  async handleMyAppointments(ctx) {
    try {
      const User = require('../../../models/User');
      const Appointment = require('../../../models/Appointment');
      const { Model } = require('objection');
      const knex = Model.knex();

      const user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();

      if (!user) {
        await safeEditMessage(ctx,
          '❌ Please register first with /start',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      const appointments = await Appointment.query()
        .where('client_id', user.id)
        .whereIn('status', ['booked', 'scheduled', 'confirmed', 'pending_approval', 'in_progress'])
        .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
        .withGraphFetched('[service]')
        .orderBy('appointment_datetime', 'asc')
        .limit(10);

      // Fetch payment history
      const payments = await knex('payments')
        .where('user_id', user.id)
        .whereIn('status', ['confirmed', 'pending'])
        .orderBy('created_at', 'desc')
        .limit(20);

      const totalSpent = await knex('payments')
        .where('user_id', user.id)
        .where('status', 'confirmed')
        .sum('amount_cad as total')
        .first();

      if (appointments.length === 0 && payments.length === 0) {
        await safeEditMessage(ctx,
          '📋 *Your Appointments*\n\n' +
          'You have no upcoming appointments.\n\n' +
          'Use the button below to book one!',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Book Appointment', callback_data: 'book' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      let message = '';
      const inlineKeyboard = [];

      // Appointments section
      if (appointments.length > 0) {
        message += '📋 *Your Upcoming Appointments:*\n\n';

        appointments.forEach((apt, index) => {
          const dateTime = moment(apt.appointment_datetime).tz('America/New_York');
          const formattedDate = dateTime.format('MMM DD, YYYY');
          const formattedTime = dateTime.format('h:mm A');

          // Format status with icon
          let statusDisplay = apt.status;
          if (apt.status === 'pending_approval') {
            statusDisplay = '⏳ Pending Approval';
          } else if (apt.status === 'booked') {
            statusDisplay = '📋 Booked';
          } else if (apt.status === 'confirmed') {
            statusDisplay = '✅ Confirmed';
          } else if (apt.status === 'completed') {
            statusDisplay = '✔️ Completed';
          } else if (apt.status === 'scheduled') {
            statusDisplay = '📅 Scheduled';
          } else if (apt.status === 'in_progress') {
            statusDisplay = '🔄 In Progress';
          } else if (apt.status === 'cancelled') {
            statusDisplay = '❌ Cancelled';
          } else if (apt.status === 'rejected') {
            statusDisplay = '❌ Rejected';
          }

          // Get customer name from bulk upload or registration form
          const customerName = apt.customer_first_name
            ? `${apt.customer_first_name} ${apt.customer_last_name || ''}`.trim()
            : null;

          message += `${index + 1}. *${apt.service?.name || 'Lodge Scheduler Service'}*\n`;
          if (customerName) {
            message += `   👤 ${customerName}\n`;
          }
          message += `   📆 ${formattedDate}\n`;
          message += `   ⏰ ${formattedTime} EST\n`;
          message += `   🔗 Status: ${statusDisplay}\n\n`;

          // Add cancel button for each appointment
          inlineKeyboard.push([
            { text: `❌ Cancel #${index + 1}`, callback_data: `user_cancel_${apt.uuid}` }
          ]);
        });

        message += '_Tap a button below to cancel an appointment_\n\n';
      }

      // Payment history section
      if (payments.length > 0) {
        message += '━━━━━━━━━━━━━━━━━━━━\n\n';
        message += '💰 *Payment History:*\n\n';

        const total = totalSpent?.total || 0;
        message += `💵 Total Spent: *$${parseFloat(total).toFixed(2)} CAD*\n\n`;

        payments.slice(0, 5).forEach((pay, idx) => {
          const payDate = moment(pay.created_at).tz('America/New_York').format('MMM DD, YYYY');
          const statusIcon = pay.status === 'confirmed' ? '✅' : pay.status === 'pending' ? '⏳' : '❌';
          const amount = parseFloat(pay.amount_cad || 0).toFixed(2);

          message += `${idx + 1}. ${statusIcon} $${amount} CAD — ${payDate}\n`;
        });

        if (payments.length > 5) {
          message += `\n_...and ${payments.length - 5} more transaction(s)_\n`;
        }
      }

      // Add navigation buttons
      inlineKeyboard.push([{ text: '📅 Book Another', callback_data: 'book' }]);
      inlineKeyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);

      await safeEditMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });

      return true;

    } catch (error) {
      console.error('Error fetching appointments:', error);
      await safeEditMessage(ctx,
        '❌ Error loading appointments. Please try /myappointments command instead.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return true;
    }
  }

  /**
   * Process user cancellation of an appointment
   */
  async processUserCancellation(ctx, appointmentId) {
    try {
      const Appointment = require('../../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', appointmentId)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await safeEditMessage(ctx, '❌ Appointment not found.');
        return true;
      }

      // Verify ownership
      if (appointment.client?.telegram_id !== ctx.from.id.toString()) {
        await safeEditMessage(ctx, '❌ You can only cancel your own appointments.');
        return true;
      }

      // Check if already cancelled
      if (appointment.status === 'cancelled' || appointment.status === 'rejected') {
        await safeEditMessage(ctx, '❌ This appointment has already been cancelled.');
        return true;
      }

      // Cancel the appointment
      await Appointment.query()
        .where('uuid', appointmentId)
        .patch({
          status: 'cancelled',
          cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
          cancellation_reason: 'Cancelled by user'
        });

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      await safeEditMessage(ctx,
        `✅ *Appointment Cancelled*\n\n` +
        `📅 Date: ${formattedDate}\n` +
        `⏰ Time: ${formattedTime} EST\n` +
        `📱 Service: ${appointment.service?.name || 'Lodge Service'}\n\n` +
        `Your appointment has been cancelled successfully.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Book New Appointment', callback_data: 'book' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );

      // Notify admin about cancellation
      await this.notifyAdminCancellation(ctx, appointment, formattedDate, formattedTime, appointmentId);

      return true;

    } catch (error) {
      console.error('User cancellation error:', error);
      await safeEditMessage(ctx, '❌ Error cancelling appointment. Please try again.');
      return true;
    }
  }

  /**
   * Notify admin about user cancellation
   */
  async notifyAdminCancellation(ctx, appointment, formattedDate, formattedTime, appointmentId) {
    const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
    if (ADMIN_ID && this.bot) {
      try {
        await this.bot.telegram.sendMessage(
          ADMIN_ID,
          `📢 *Booking Cancelled by User*\n\n` +
          `👤 Client: ${appointment.client?.first_name || 'Unknown'} ${appointment.client?.last_name || ''}\n` +
          `📅 Date: ${formattedDate}\n` +
          `⏰ Time: ${formattedTime} EST\n` +
          `📱 Service: ${appointment.service?.name || 'Lodge Service'}\n` +
          `🆔 ID: \`${appointmentId}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (notifyError) {
        console.error('Failed to notify admin about cancellation:', notifyError);
      }
    }
  }
}

module.exports = NavigationHandler;
