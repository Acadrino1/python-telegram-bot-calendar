/**
 * Admin Handler
 * Handles admin-related callback queries: booking approvals, today's bookings, bot status
 */

const moment = require('moment-timezone');
const { escapeMarkdown, escapeMarkdownFull, formatDateOnly, getRefreshTimestamp, isAdmin, safeAnswerCbQuery } = require('../utils/CallbackUtils');

class AdminHandler {
  constructor(services = {}, bot = null) {
    this.services = services;
    this.bot = bot;
    this.adminTicketsHandler = null;
  }

  /**
   * Set bot instance
   */
  setBot(bot) {
    this.bot = bot;
  }

  /**
   * Set admin tickets handler for ticket-related callbacks
   */
  setAdminTicketsHandler(handler) {
    this.adminTicketsHandler = handler;
  }

  /**
   * Check admin access
   */
  checkAdminAccess(ctx) {
    const adminIds = this.services.adminIds || [];
    return isAdmin(ctx, adminIds);
  }

  /**
   * Main handler for admin callbacks
   */
  async handle(ctx, callbackData) {
    await safeAnswerCbQuery(ctx, 'Processing...');

    // Check admin access
    if (!this.checkAdminAccess(ctx)) {
      await ctx.reply('❌ Admin access required');
      return true;
    }

    // Handle USER access approval (from access request notification)
    if (callbackData.startsWith('approve_') && !callbackData.startsWith('approve_booking')) {
      const telegramId = callbackData.replace('approve_', '');
      console.log(`[AdminHandler] USER APPROVAL: callback=${callbackData}, telegramId=${telegramId}`);
      return await this.handleApproveUserAccess(ctx, telegramId);
    }

    // Handle USER access denial (from access request notification)
    if (callbackData.startsWith('deny_')) {
      const telegramId = callbackData.replace('deny_', '');
      return await this.handleDenyUserAccess(ctx, telegramId);
    }

    // Handle booking approval
    if (callbackData.startsWith('admin_approve_booking_')) {
      const pendingId = callbackData.replace('admin_approve_booking_', '');
      console.log(`[AdminHandler] BOOKING APPROVAL: callback=${callbackData}, pendingId=${pendingId}`);
      return await this.processAdminApproval(ctx, pendingId, true);
    }

    // Handle booking rejection
    if (callbackData.startsWith('admin_reject_booking_')) {
      const pendingId = callbackData.replace('admin_reject_booking_', '');
      return await this.processAdminApproval(ctx, pendingId, false);
    }

    // Handle admin pending list (bookings)
    if (callbackData === 'admin_pending_list' || callbackData === 'admin_refresh_pending') {
      return await this.handleAdminPendingList(ctx, true);
    }

    // Handle admin pending users list
    if (callbackData === 'admin_pending_users' || callbackData === 'admin_refresh_pending_users') {
      return await this.handlePendingUsersList(ctx);
    }

    // Handle approve/deny user from pending list
    if (callbackData.startsWith('admin_approve_user_')) {
      const pendingUserId = callbackData.replace('admin_approve_user_', '');
      return await this.handleUserApproval(ctx, pendingUserId, true);
    }
    if (callbackData.startsWith('admin_deny_user_')) {
      const pendingUserId = callbackData.replace('admin_deny_user_', '');
      return await this.handleUserApproval(ctx, pendingUserId, false);
    }

    // Handle admin today's bookings
    if (callbackData === 'admin_today_bookings') {
      return await this.handleAdminTodayBookings(ctx);
    }

    // Handle admin bot status
    if (callbackData === 'admin_bot_status') {
      return await this.handleAdminBotStatus(ctx);
    }

    // Handle admin coupons
    if (callbackData === 'admin_coupons') {
      return await this.handleCouponsPanel(ctx);
    }

    // Handle coupon actions
    if (callbackData.startsWith('admin_coupon_')) {
      return await this.handleCouponAction(ctx, callbackData);
    }

    // Handle admin settings panel
    if (callbackData === 'admin_settings') {
      return await this.handleSettingsPanel(ctx);
    }

    // Handle settings category views
    if (callbackData.startsWith('admin_settings_')) {
      const category = callbackData.replace('admin_settings_', '');
      return await this.handleSettingsCategory(ctx, category);
    }

    // Handle toggle settings
    if (callbackData.startsWith('toggle_setting_')) {
      const key = callbackData.replace('toggle_setting_', '');
      return await this.handleToggleSetting(ctx, key);
    }

    // Handle edit settings (prompts for value)
    if (callbackData.startsWith('edit_setting_')) {
      const key = callbackData.replace('edit_setting_', '');
      return await this.handleEditSettingPrompt(ctx, key);
    }

    // Handle view booking details
    if (callbackData.startsWith('admin_view_booking_')) {
      const bookingUuid = callbackData.replace('admin_view_booking_', '');
      return await this.handleViewBookingDetails(ctx, bookingUuid);
    }

    // Handle admin panel
    if (callbackData === 'admin_panel') {
      return await this.showAdminPanel(ctx);
    }

    // Handle cancel all bookings confirmation
    if (callbackData === 'admin_cancel_all_bookings') {
      return await this.handleCancelAllBookingsConfirm(ctx);
    }

    // Handle cancel all bookings execute
    if (callbackData === 'admin_cancel_all_confirm') {
      return await this.handleCancelAllBookingsExecute(ctx);
    }

    // Handle user management - list with pagination
    if (callbackData === 'admin_users' || /^admin_users_\d+$/.test(callbackData)) {
      const page = callbackData === 'admin_users' ? 0 : parseInt(callbackData.replace('admin_users_', '')) || 0;
      return await this.handleUsersList(ctx, page);
    }

    // Handle view user details
    if (callbackData.startsWith('admin_user_view_')) {
      const telegramId = callbackData.replace('admin_user_view_', '');
      return await this.handleViewUserDetails(ctx, telegramId);
    }

    // Handle ban user confirmation
    if (callbackData.startsWith('admin_user_ban_') && !callbackData.startsWith('admin_user_ban_confirm_')) {
      const telegramId = callbackData.replace('admin_user_ban_', '');
      return await this.handleBanUserConfirm(ctx, telegramId);
    }

    // Handle ban user execute
    if (callbackData.startsWith('admin_user_ban_confirm_')) {
      const telegramId = callbackData.replace('admin_user_ban_confirm_', '');
      return await this.handleBanUserExecute(ctx, telegramId);
    }

    // Handle unban user
    if (callbackData.startsWith('admin_user_unban_')) {
      const telegramId = callbackData.replace('admin_user_unban_', '');
      return await this.handleUnbanUser(ctx, telegramId);
    }

    // Handle broadcast message
    if (callbackData === 'admin_broadcast') {
      return await this.handleBroadcastStart(ctx);
    }
    if (callbackData === 'admin_broadcast_to_users') {
      return await this.handleBroadcastTargetSelect(ctx, 'users');
    }
    if (callbackData === 'admin_broadcast_to_channels') {
      return await this.handleBroadcastTargetSelect(ctx, 'channels');
    }
    if (callbackData === 'admin_broadcast_to_all') {
      return await this.handleBroadcastTargetSelect(ctx, 'all');
    }
    if (callbackData === 'admin_broadcast_confirm') {
      return await this.handleBroadcastExecute(ctx);
    }
    if (callbackData === 'admin_broadcast_cancel') {
      return await this.showAdminPanel(ctx);
    }

    // Handle individual booking cancellation (confirmation dialog)
    if (callbackData.startsWith('adm_cxl_') && !callbackData.startsWith('adm_cxl_ok_')) {
      const bookingUuid = callbackData.replace('adm_cxl_', '');
      return await this.handleAdminCancelBooking(ctx, bookingUuid);
    }

    // Handle individual booking cancellation (execute)
    if (callbackData.startsWith('adm_cxl_ok_')) {
      const bookingUuid = callbackData.replace('adm_cxl_ok_', '');
      return await this.handleAdminCancelBookingExecute(ctx, bookingUuid);
    }

    // Handle send completion request to user
    if (callbackData.startsWith('admin_send_completion_')) {
      const appointmentUuid = callbackData.replace('admin_send_completion_', '');
      return await this.handleSendCompletionRequest(ctx, appointmentUuid);
    }

    // Handle view proof photo
    if (callbackData.startsWith('admin_view_proof_')) {
      const appointmentUuid = callbackData.replace('admin_view_proof_', '');
      return await this.handleViewProof(ctx, appointmentUuid);
    }

    // Delegate ticket-related callbacks to AdminTicketsHandler
    if (this.adminTicketsHandler) {
      // Admin tickets list (with pagination)
      if (callbackData === 'admin_tickets') {
        return await this.adminTicketsHandler.handleAdminTicketsList(ctx, 0);
      }

      // Admin tickets pagination
      if (callbackData.startsWith('admin_tickets_') && /^admin_tickets_\d+$/.test(callbackData)) {
        const page = parseInt(callbackData.replace('admin_tickets_', '')) || 0;
        return await this.adminTicketsHandler.handleAdminTicketsList(ctx, page);
      }

      // Admin view single ticket
      if (callbackData.startsWith('admin_ticket_view_')) {
        const ticketId = callbackData.replace('admin_ticket_view_', '');
        return await this.adminTicketsHandler.handleAdminViewTicket(ctx, ticketId);
      }

      // Admin ticket status change
      if (callbackData.startsWith('admin_ticket_status_')) {
        const parts = callbackData.replace('admin_ticket_status_', '').split('_');
        const ticketId = parts.slice(0, -1).join('_');
        const newStatus = parts[parts.length - 1];
        return await this.adminTicketsHandler.handleAdminTicketStatusChange(ctx, ticketId, newStatus);
      }

      // Admin reply to ticket
      if (callbackData.startsWith('admin_ticket_reply_')) {
        const ticketId = callbackData.replace('admin_ticket_reply_', '');
        return await this.adminTicketsHandler.handleAdminTicketReplyPrompt(ctx, ticketId);
      }

      // Refresh tickets list
      if (callbackData === 'admin_tickets_refresh') {
        return await this.adminTicketsHandler.handleAdminTicketsList(ctx, 0);
      }

      // Close all tickets (confirmation)
      if (callbackData === 'admin_close_all_tickets') {
        return await this.adminTicketsHandler.handleCloseAllTicketsConfirm(ctx);
      }

      // Close all tickets (execute)
      if (callbackData === 'admin_close_all_tickets_yes') {
        return await this.adminTicketsHandler.handleCloseAllTicketsExecute(ctx);
      }
    }

    return false;
  }

  /**
   * Show admin panel with stats
   */
  async showAdminPanel(ctx) {
    const Appointment = require('../../../models/Appointment');
    const SupportTicket = require('../../../models/SupportTicket');
    const User = require('../../../models/User');

    let pendingBookings = 0;
    let todayBookings = 0;
    let openTickets = 0;
    let pendingUsers = 0;

    try {
      // Count pending bookings
      const pendingResult = await Appointment.query()
        .where('status', 'pending_approval')
        .count('* as count')
        .first();
      pendingBookings = parseInt(pendingResult?.count) || 0;

      // Count pending user approvals
      const pendingUsersResult = await User.query()
        .where('approval_status', 'pending')
        .count('* as count')
        .first();
      pendingUsers = parseInt(pendingUsersResult?.count) || 0;

      // Count today's bookings
      const todayStart = moment().startOf('day').toISOString();
      const todayEnd = moment().endOf('day').toISOString();
      const todayResult = await Appointment.query()
        .where('appointment_datetime', '>=', todayStart)
        .where('appointment_datetime', '<=', todayEnd)
        .whereNotIn('status', ['cancelled', 'rejected'])
        .count('* as count')
        .first();
      todayBookings = parseInt(todayResult?.count) || 0;

      // Count open support tickets
      const ticketResult = await SupportTicket.query()
        .whereIn('status', ['open', 'assigned', 'escalated'])
        .count('* as count')
        .first();
      openTickets = parseInt(ticketResult?.count) || 0;
    } catch (err) {
      console.error('Error fetching admin stats:', err.message);
    }

    // Build the dashboard message
    let dashboardMsg = '🔧 *Admin Panel*\n\n';
    dashboardMsg += '📊 *Quick Stats:*\n';
    dashboardMsg += `├ 👤 Pending Users: *${pendingUsers}*${pendingUsers > 0 ? ' 🔴' : ''}\n`;
    dashboardMsg += `├ ⏳ Pending Bookings: *${pendingBookings}*${pendingBookings > 0 ? ' ⚠️' : ''}\n`;
    dashboardMsg += `├ 📅 Today's Bookings: *${todayBookings}*\n`;
    dashboardMsg += `└ 🎫 Open Tickets: *${openTickets}*${openTickets > 0 ? ' ⚠️' : ''}\n`;
    dashboardMsg += '\n_Select an option below:_';

    // Build keyboard with cleaner 2-column layout
    const keyboard = [];

    // Row 1: Pending items (most urgent)
    if (pendingUsers > 0 || pendingBookings > 0) {
      const urgentRow = [];
      if (pendingUsers > 0) {
        urgentRow.push({ text: `👤 Users (${pendingUsers}) 🔴`, callback_data: 'admin_pending_users' });
      }
      if (pendingBookings > 0) {
        urgentRow.push({ text: `⏳ Bookings (${pendingBookings}) ⚠️`, callback_data: 'admin_pending_list' });
      }
      if (urgentRow.length > 0) keyboard.push(urgentRow);
    }

    // Row 2: Today's activity
    keyboard.push([
      { text: `📅 Today (${todayBookings})`, callback_data: 'admin_today_bookings' },
      { text: `🎫 Tickets (${openTickets})${openTickets > 0 ? ' ⚠️' : ''}`, callback_data: 'admin_tickets' }
    ]);

    // Row 3: Management
    keyboard.push([
      { text: '👥 Users', callback_data: 'admin_users' },
      { text: '📢 Broadcast', callback_data: 'admin_broadcast' }
    ]);

    // Row 4: Coupons & Settings
    keyboard.push([
      { text: '🎟️ Coupons', callback_data: 'admin_coupons' },
      { text: '⚙️ Settings', callback_data: 'admin_settings' }
    ]);

    // Row 5: Status
    keyboard.push([
      { text: '📊 Status', callback_data: 'admin_bot_status' }
    ]);

    // Row 5: Danger zone (less prominent)
    keyboard.push([
      { text: '🗑️ Cancel All', callback_data: 'admin_cancel_all_bookings' }
    ]);

    await ctx.editMessageText(dashboardMsg, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
    return true;
  }

  /**
   * Process admin approval or rejection of a pending booking
   */
  async processAdminApproval(ctx, pendingId, approved) {
    try {
      const Appointment = require('../../../models/Appointment');
      const User = require('../../../models/User');

      // Find the pending appointment
      const appointment = await Appointment.query()
        .where('uuid', pendingId)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText('❌ Booking not found. It may have been cancelled.');
        return true;
      }

      if (appointment.status !== 'pending_approval') {
        const statusDisplay = appointment.status === 'confirmed' ? 'APPROVED' :
                              appointment.status === 'rejected' ? 'REJECTED' :
                              appointment.status.toUpperCase();
        await ctx.editMessageText(`⚠️ This booking has already been ${statusDisplay}.`);
        return true;
      }

      // Use optimistic locking: only update if status is still pending_approval
      const newStatus = approved ? 'confirmed' : 'rejected';
      const updateData = { status: newStatus };

      if (!approved) {
        updateData.cancelled_at = moment().format('YYYY-MM-DD HH:mm:ss');
        updateData.cancellation_reason = 'Rejected by admin';
      }

      const updateResult = await Appointment.query()
        .where('uuid', pendingId)
        .where('status', 'pending_approval')
        .patch(updateData);

      // If no rows updated, another admin already processed this
      if (updateResult === 0) {
        const updatedAppointment = await Appointment.query().where('uuid', pendingId).first();
        const statusDisplay = updatedAppointment?.status === 'confirmed' ? 'APPROVED' :
                              updatedAppointment?.status === 'rejected' ? 'REJECTED' :
                              (updatedAppointment?.status || 'PROCESSED').toUpperCase();
        await ctx.editMessageText(`⚠️ This booking was already ${statusDisplay} by another admin.`);
        return true;
      }

      const client = appointment.client;
      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      let clientNotified = false;
      let notificationError = null;

      if (approved) {
        // Update admin message
        await ctx.editMessageText(
          `✅ *Booking APPROVED*\n\n` +
          `🆔 ID: \`${appointment.uuid}\`\n` +
          `👤 Client: ${client?.first_name || 'Unknown'} ${client?.last_name || ''}\n` +
          `📅 Date: ${formattedDate}\n` +
          `⏰ Time: ${formattedTime} EST\n` +
          `📱 Service: ${appointment.service?.name || 'Lodge Scheduler Service'}\n\n` +
          `✅ Approved by: ${ctx.from.first_name}`,
          { parse_mode: 'Markdown' }
        );

        // Send confirmation to user with retry logic
        if (client?.telegram_id) {
          clientNotified = await this.notifyClientApproval(client, appointment, formattedDate, formattedTime);
          if (!clientNotified) notificationError = new Error('Failed after 3 attempts');
        }

        console.log(`✅ Booking ${pendingId} approved by admin ${ctx.from.id}`);

        // Broadcast remaining slots to channels for urgency/marketing
        await this.broadcastRemainingSlots(appointment, formattedDate);

      } else {
        // Update admin message
        await ctx.editMessageText(
          `❌ *Booking REJECTED*\n\n` +
          `🆔 ID: \`${appointment.uuid}\`\n` +
          `👤 Client: ${client?.first_name || 'Unknown'} ${client?.last_name || ''}\n` +
          `📅 Date: ${formattedDate}\n` +
          `⏰ Time: ${formattedTime} EST\n` +
          `📱 Service: ${appointment.service?.name || 'Lodge Scheduler Service'}\n\n` +
          `❌ Rejected by: ${ctx.from.first_name}`,
          { parse_mode: 'Markdown' }
        );

        // Send rejection notification to user with retry logic
        if (client?.telegram_id) {
          clientNotified = await this.notifyClientRejection(client, formattedDate, formattedTime);
          if (!clientNotified) notificationError = new Error('Failed after 3 attempts');
        }

        console.log(`❌ Booking ${pendingId} rejected by admin ${ctx.from.id}`);
      }

      // Notify admin if client notification failed
      if (client?.telegram_id && !clientNotified) {
        console.error(`CRITICAL: Failed to notify client ${client.telegram_id} about booking ${pendingId} after 3 attempts`);
        try {
          await ctx.reply(
            `⚠️ *Warning*: Could not notify the client about this ${approved ? 'approval' : 'rejection'}.\n` +
            `The booking status has been updated, but you may need to contact the client directly.\n` +
            `Error: ${notificationError?.message || 'Unknown error'}`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          console.error('Failed to send notification failure warning to admin:', e);
        }
      }

      return true;

    } catch (error) {
      console.error('Admin approval error:', error);
      try {
        await ctx.editMessageText('❌ Error processing approval. Please try again.');
      } catch (e) {
        await ctx.reply('❌ Error processing approval. Please try again.');
      }
      return true;
    }
  }

  /**
   * Notify client of approval with retry logic
   */
  async notifyClientApproval(client, appointment, formattedDate, formattedTime) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.bot.telegram.sendMessage(
          client.telegram_id,
          `✅ *Your Booking Has Been Confirmed!*\n\n` +
          `🆔 Booking ID: \`${appointment.uuid}\`\n` +
          `📅 Date: ${formattedDate}\n` +
          `⏰ Time: ${formattedTime} EST\n` +
          `📱 Service: ${appointment.service?.name || 'Lodge Scheduler Service'}\n` +
          `⏱️ Duration: ${appointment.duration_minutes || 60} minutes\n\n` +
          `Please arrive 5-10 minutes before your appointment.\n\n` +
          `Use /myappointments to view your bookings.`,
          { parse_mode: 'Markdown' }
        );
        console.log(`✅ Confirmation sent to client ${client.telegram_id}`);
        return true;
      } catch (sendError) {
        console.error(`Failed to send confirmation (attempt ${attempt}/3):`, sendError.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
    return false;
  }

  /**
   * Notify client of rejection with retry logic
   */
  async notifyClientRejection(client, formattedDate, formattedTime) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.bot.telegram.sendMessage(
          client.telegram_id,
          `❌ *Booking Request Not Approved*\n\n` +
          `Your booking request for ${formattedDate} at ${formattedTime} EST was not approved.\n\n` +
          `This could be due to scheduling conflicts or availability issues.\n\n` +
          `Please use /book to select a different time slot, or contact /support if you need assistance.`,
          { parse_mode: 'Markdown' }
        );
        console.log(`❌ Rejection sent to client ${client.telegram_id}`);
        return true;
      } catch (sendError) {
        console.error(`Failed to send rejection (attempt ${attempt}/3):`, sendError.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
    return false;
  }

  /**
   * Handle admin pending list
   */
  async handleAdminPendingList(ctx, isCallback = true) {
    try {
      const Appointment = require('../../../models/Appointment');

      // Fetch all pending appointments
      const pendingAppointments = await Appointment.query()
        .where('status', 'pending_approval')
        .withGraphFetched('[client, service]')
        .orderBy('appointment_datetime', 'asc')
        .limit(20);

      const refreshTime = getRefreshTimestamp();

      if (pendingAppointments.length === 0) {
        const noBookingsMessage = `⏳ *Pending Bookings*\n\nNo pending bookings at this time.\n\n_Updated: ${refreshTime}_`;
        const keyboard = {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'admin_refresh_pending' }],
            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
          ]
        };

        if (isCallback) {
          await ctx.editMessageText(noBookingsMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
        } else {
          await ctx.reply(noBookingsMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
        }
        return true;
      }

      // Build message with list of pending bookings
      let message = `⏳ *Pending Bookings* (${pendingAppointments.length})\n\n`;

      const inlineKeyboard = [];

      pendingAppointments.forEach((apt, index) => {
        const dateTime = moment(apt.appointment_datetime).tz('America/New_York');
        const formattedDate = dateTime.format('MMM DD');
        const formattedTime = dateTime.format('h:mm A');

        const customerName = apt.customer_first_name
          ? `${apt.customer_first_name} ${apt.customer_last_name || ''}`.trim()
          : (apt.client ? `${apt.client.first_name || ''} ${apt.client.last_name || ''}`.trim() : 'Unknown');
        const serviceName = apt.service?.name || 'Lodge Service';
        const isBulkUpload = apt.notes && apt.notes.includes('Bulk Upload: Yes');

        message += `*${index + 1}. ${customerName}*${isBulkUpload ? ' 📦' : ''}\n`;
        message += `   📅 ${formattedDate} at ${formattedTime}\n`;
        message += `   📱 ${serviceName}\n`;
        message += `   🆔 \`${apt.uuid}\`\n\n`;

        // Add view details, approve and reject buttons for each booking
        inlineKeyboard.push([
          { text: `📋 Details #${index + 1}`, callback_data: `admin_view_booking_${apt.uuid}` }
        ]);
        inlineKeyboard.push([
          { text: `✅ Approve`, callback_data: `admin_approve_booking_${apt.uuid}` },
          { text: `❌ Reject`, callback_data: `admin_reject_booking_${apt.uuid}` }
        ]);
      });

      // Add refresh and back buttons
      inlineKeyboard.push([{ text: '🔄 Refresh', callback_data: 'admin_refresh_pending' }]);

      if (isCallback) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      }

      return true;

    } catch (error) {
      console.error('Error loading pending bookings:', error);
      const errorMessage = '❌ Error loading pending bookings. Please try again.';
      if (isCallback) {
        await ctx.editMessageText(errorMessage);
      } else {
        await ctx.reply(errorMessage);
      }
      return true;
    }
  }

  /**
   * Handle pending users list (users awaiting approval)
   */
  async handlePendingUsersList(ctx) {
    try {
      const User = require('../../../models/User');

      const pendingUsers = await User.query()
        .where('approval_status', 'pending')
        .orderBy('created_at', 'desc')
        .limit(20);

      if (pendingUsers.length === 0) {
        await ctx.editMessageText(
          '👤 *Pending User Approvals*\n\n' +
          '✅ No pending user approvals at this time.\n\n' +
          '_All users have been processed._',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Refresh', callback_data: 'admin_refresh_pending_users' }],
                [{ text: '← Back to Admin', callback_data: 'admin_panel' }]
              ]
            }
          }
        );
        return true;
      }

      let message = `👤 *Pending User Approvals* (${pendingUsers.length})\n\n`;
      const inlineKeyboard = [];

      pendingUsers.forEach((user, index) => {
        // Sanitize names - remove markdown special chars to prevent parse errors
        const sanitize = (str) => str ? str.replace(/[_*`[\]]/g, '') : '';
        const displayName = sanitize(user.telegram_first_name || user.first_name || 'Unknown');
        const lastName = sanitize(user.telegram_last_name || user.last_name || '');
        const username = user.telegram_username || '';
        const telegramId = user.telegram_id || 'N/A';
        const createdAt = moment(user.created_at).format('MMM DD, h:mm A');

        message += `*${index + 1}. ${displayName} ${lastName}*\n`;
        message += `   🆔 \`${telegramId}\`\n`;
        if (username) message += `   👤 @${sanitize(username)}\n`;
        message += `   📅 ${createdAt}\n\n`;

        inlineKeyboard.push([
          { text: `✅ Approve #${index + 1}`, callback_data: `admin_approve_user_${telegramId}` },
          { text: `❌ Deny #${index + 1}`, callback_data: `admin_deny_user_${telegramId}` }
        ]);
      });

      inlineKeyboard.push([{ text: '🔄 Refresh', callback_data: 'admin_refresh_pending_users' }]);
      inlineKeyboard.push([{ text: '← Back to Admin', callback_data: 'admin_panel' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });

      return true;
    } catch (error) {
      // Handle "message not modified" gracefully - happens when list hasn't changed
      if (error.message?.includes('message is not modified')) {
        await ctx.answerCbQuery('✅ List is up to date');
        return true;
      }
      console.error('Error loading pending users:', error);
      await ctx.editMessageText('❌ Error loading pending users. Please try again.', {
        reply_markup: {
          inline_keyboard: [[{ text: '← Back', callback_data: 'admin_panel' }]]
        }
      });
      return true;
    }
  }

  /**
   * Handle user approval or denial
   */
  async handleUserApproval(ctx, telegramId, approved) {
    try {
      const User = require('../../../models/User');

      const user = await User.query()
        .where('telegram_id', telegramId)
        .first();

      if (!user) {
        await ctx.answerCbQuery('User not found', { show_alert: true });
        return await this.handlePendingUsersList(ctx);
      }

      if (user.approval_status !== 'pending') {
        await ctx.answerCbQuery('User already processed', { show_alert: true });
        return await this.handlePendingUsersList(ctx);
      }

      const adminId = ctx.from.id.toString();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      if (approved) {
        await User.query()
          .where('telegram_id', telegramId)
          .patch({
            approval_status: 'approved',
            approved_by: adminId,
            approved_at: now
          });

        // Notify user they've been approved
        try {
          await this.bot.telegram.sendMessage(
            telegramId,
            '✅ *Access Approved!*\n\n' +
            'Your access request has been approved.\n\n' +
            'You can now use /book to schedule appointments.',
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          console.warn('Could not notify approved user:', e.message);
        }

        await ctx.answerCbQuery('✅ User approved!');
      } else {
        await User.query()
          .where('telegram_id', telegramId)
          .patch({
            approval_status: 'denied',
            rejected_by: adminId,
            rejected_at: now
          });

        // Notify user they've been denied
        try {
          await this.bot.telegram.sendMessage(
            telegramId,
            '❌ *Access Denied*\n\n' +
            'Your access request has been denied.\n\n' +
            'Please contact support if you believe this is an error.',
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          console.warn('Could not notify denied user:', e.message);
        }

        await ctx.answerCbQuery('❌ User denied');
      }

      // Refresh the pending list
      return await this.handlePendingUsersList(ctx);

    } catch (error) {
      console.error('Error processing user approval:', error);
      await ctx.answerCbQuery('Error processing. Try again.', { show_alert: true });
      return true;
    }
  }

  /**
   * Handle viewing full booking details
   */
  async handleViewBookingDetails(ctx, bookingUuid) {
    try {
      const Appointment = require('../../../models/Appointment');

      const apt = await Appointment.query()
        .where('uuid', bookingUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!apt) {
        await ctx.editMessageText('❌ Booking not found.');
        return true;
      }

      const dateTime = moment(apt.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      let message = `📋 *Booking Details*\n\n`;
      message += `🆔 ID: \`${apt.uuid}\`\n`;
      message += `📅 Date: ${formattedDate}\n`;
      message += `⏰ Time: ${formattedTime} EST\n`;
      message += `📱 Service: ${escapeMarkdownFull(apt.service?.name || 'Lodge Service')}\n`;
      message += `⏱️ Duration: ${apt.duration_minutes} minutes\n`;
      message += `📊 Status: ${escapeMarkdown(apt.status)}\n`;

      // Check if bulk upload
      if (apt.notes && apt.notes.includes('Bulk Upload: Yes')) {
        message += `📦 *Bulk Upload Booking*\n`;
      }
      message += '\n';

      // Customer registration data from appointment record
      message += `👤 *Customer Registration Info:*\n`;
      message += `• First Name: ${escapeMarkdownFull(apt.customer_first_name)}\n`;
      if (apt.customer_middle_name) {
        message += `• Middle Name: ${escapeMarkdownFull(apt.customer_middle_name)}\n`;
      }
      message += `• Last Name: ${escapeMarkdownFull(apt.customer_last_name)}\n`;
      message += `• Date of Birth: ${formatDateOnly(apt.customer_dob)}\n`;
      message += `• Address: ${escapeMarkdownFull(apt.billing_address)}\n`;

      if (apt.drivers_license_number) {
        message += `\n🪪 *Driver's License:*\n`;
        message += `• Number: ${escapeMarkdownFull(apt.drivers_license_number)}\n`;
        if (apt.dl_issued_date) message += `• Issued: ${formatDateOnly(apt.dl_issued_date)}\n`;
        if (apt.dl_expiry_date) message += `• Expiry: ${formatDateOnly(apt.dl_expiry_date)}\n`;
      }

      // Telegram info from client relation
      if (apt.client) {
        message += `\n📱 *Telegram Info:*\n`;
        message += `• Username: @${escapeMarkdownFull(apt.client.telegram_username || 'N/A')}\n`;
        message += `• Telegram ID: ${apt.client.telegram_id}\n`;
      }

      // Completion status
      if (apt.user_confirmed_completion || apt.completion_proof_file_id || apt.awaiting_proof) {
        message += `\n📸 *Completion Status:*\n`;
        if (apt.user_completion_response) {
          const responseIcon = apt.user_completion_response === 'yes' ? '✅' : '❌';
          message += `• User Response: ${responseIcon} ${apt.user_completion_response.toUpperCase()}\n`;
        }
        if (apt.completion_proof_file_id) {
          message += `• Photo Proof: ✅ Uploaded\n`;
        } else if (apt.awaiting_proof) {
          message += `• Photo Proof: ⏳ Awaiting upload\n`;
        }
      }

      // Build keyboard based on booking status
      const keyboardButtons = [];

      if (apt.status === 'pending_approval') {
        keyboardButtons.push([
          { text: '✅ Approve', callback_data: `admin_approve_booking_${apt.uuid}` },
          { text: '❌ Reject', callback_data: `admin_reject_booking_${apt.uuid}` }
        ]);
        keyboardButtons.push([{ text: '← Back to Pending', callback_data: 'admin_pending_list' }]);
      } else if (apt.status === 'cancelled' || apt.status === 'rejected') {
        keyboardButtons.push([{ text: '← Back', callback_data: 'admin_today_bookings' }]);
      } else {
        // Add completion/proof buttons for confirmed/completed appointments
        if (apt.status === 'confirmed' && !apt.user_confirmed_completion) {
          keyboardButtons.push([
            { text: '📧 Send Completion Request', callback_data: `admin_send_completion_${apt.uuid}` }
          ]);
        }
        if (apt.completion_proof_file_id) {
          keyboardButtons.push([
            { text: '📷 View Proof Photo', callback_data: `admin_view_proof_${apt.uuid}` }
          ]);
        } else if (apt.awaiting_proof) {
          keyboardButtons.push([
            { text: '📷 Upload Proof', callback_data: `admin_proof_ack_${apt.uuid}` }
          ]);
        }
        keyboardButtons.push([
          { text: '❌ Cancel Booking', callback_data: `adm_cxl_${apt.uuid}` }
        ]);
        keyboardButtons.push([
          { text: '📅 Today\'s Bookings', callback_data: 'admin_today_bookings' },
          { text: '🏠 Main Menu', callback_data: 'main_menu' }
        ]);
      }

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboardButtons }
      });

      return true;
    } catch (error) {
      console.error('Error viewing booking details:', error);
      await ctx.editMessageText('❌ Error loading booking details.');
      return true;
    }
  }

  /**
   * Handle admin today's bookings
   */
  async handleAdminTodayBookings(ctx) {
    try {
      const Appointment = require('../../../models/Appointment');

      const todayStart = moment().tz('America/New_York').startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const todayEnd = moment().tz('America/New_York').endOf('day').format('YYYY-MM-DD HH:mm:ss');

      const todayAppointments = await Appointment.query()
        .where('appointment_datetime', '>=', todayStart)
        .where('appointment_datetime', '<=', todayEnd)
        .whereNotIn('status', ['cancelled', 'rejected'])
        .withGraphFetched('[client, service]')
        .orderBy('appointment_datetime', 'asc');

      const refreshTime = getRefreshTimestamp();

      if (todayAppointments.length === 0) {
        await ctx.editMessageText(
          `📅 *Today's Bookings*\n\nNo bookings scheduled for today.\n\n_Updated: ${refreshTime}_`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Refresh', callback_data: 'admin_today_bookings' }],
                [{ text: '🏠 Main Menu', callback_data: 'admin_panel' }]
              ]
            }
          }
        );
        return true;
      }

      let message = `📅 *Today's Bookings* (${todayAppointments.length})\n_Updated: ${refreshTime}_\n\n`;

      // Build booking list with numbers for reference
      todayAppointments.forEach((apt, index) => {
        const dateTime = moment(apt.appointment_datetime).tz('America/New_York');
        const formattedTime = dateTime.format('h:mm A');
        // Prioritize customer_first_name/last_name (from bulk upload or registration form) over client name
        const customerName = apt.customer_first_name
          ? `${apt.customer_first_name} ${apt.customer_last_name || ''}`.trim()
          : apt.client
            ? `${apt.client.first_name || ''} ${apt.client.last_name || ''}`.trim()
            : 'Unknown';
        // Get Telegram username of who made the booking
        const bookedBy = apt.client?.telegram_username
          ? `@${apt.client.telegram_username}`
          : apt.client?.telegram_id || 'N/A';
        const serviceName = apt.service?.name || 'Lodge Service';

        let statusIcon = '📅';
        if (apt.status === 'booked') statusIcon = '📋';
        else if (apt.status === 'confirmed') statusIcon = '✅';
        else if (apt.status === 'pending_approval') statusIcon = '⏳';
        else if (apt.status === 'in_progress') statusIcon = '🔄';
        else if (apt.status === 'completed') statusIcon = '✔️';
        else if (apt.status === 'cancelled') statusIcon = '❌';
        else if (apt.status === 'rejected') statusIcon = '❌';

        const isBulkUpload = apt.notes && apt.notes.includes('Bulk Upload: Yes');
        message += `*#${index + 1}* ${statusIcon} *${formattedTime}*${isBulkUpload ? ' 📦' : ''}\n`;
        message += `👤 ${escapeMarkdown(customerName)}\n`;
        message += `📲 Booked by: ${escapeMarkdown(bookedBy)}\n`;
        message += `📱 ${escapeMarkdown(serviceName)} | ${escapeMarkdown(apt.status)}\n\n`;
      });

      // Build inline keyboard with action buttons for each booking
      const bookingButtons = todayAppointments.map((apt, index) => {
        return [
          { text: `📋 #${index + 1} Details`, callback_data: `admin_view_booking_${apt.uuid}` },
          { text: `❌ #${index + 1} Cancel`, callback_data: `adm_cxl_${apt.uuid}` }
        ];
      });

      // Add navigation buttons at the end
      bookingButtons.push([{ text: '🔄 Refresh', callback_data: 'admin_today_bookings' }]);
      bookingButtons.push([
        { text: '⏳ View Pending', callback_data: 'admin_pending_list' },
        { text: '🏠 Main Menu', callback_data: 'main_menu' }
      ]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: bookingButtons
        }
      });

      return true;

    } catch (error) {
      console.error('Error loading today\'s bookings:', error);
      await ctx.editMessageText('❌ Error loading today\'s bookings.');
      return true;
    }
  }

  /**
   * Handle admin bot status
   */
  async handleAdminBotStatus(ctx) {
    try {
      const Appointment = require('../../../models/Appointment');
      const User = require('../../../models/User');

      // Get counts
      const totalUsers = await User.query().count('id as count').first();
      const pendingCount = await Appointment.query().where('status', 'pending_approval').count('id as count').first();
      const todayCount = await Appointment.query()
        .where('appointment_datetime', '>=', moment().tz('America/New_York').startOf('day').format('YYYY-MM-DD HH:mm:ss'))
        .where('appointment_datetime', '<=', moment().tz('America/New_York').endOf('day').format('YYYY-MM-DD HH:mm:ss'))
        .whereNotIn('status', ['cancelled', 'rejected'])
        .count('id as count')
        .first();

      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);

      const message = `📊 *Bot Status*\n\n` +
        `👥 Total Users: ${totalUsers?.count || 0}\n` +
        `⏳ Pending Bookings: ${pendingCount?.count || 0}\n` +
        `📅 Today's Bookings: ${todayCount?.count || 0}\n\n` +
        `*System Info:*\n` +
        `⏱️ Uptime: ${uptimeHours}h ${uptimeMinutes}m\n` +
        `💾 Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB\n` +
        `🕐 Server Time: ${moment().tz('America/New_York').format('h:mm A')} EST`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'admin_bot_status' }],
            [{ text: '⏳ View Pending', callback_data: 'admin_pending_list' }],
            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
          ]
        }
      });

      return true;

    } catch (error) {
      console.error('Error loading bot status:', error);
      await ctx.editMessageText('❌ Error loading bot status.');
      return true;
    }
  }

  /**
   * Handle cancel all bookings - show confirmation with count
   */
  async handleCancelAllBookingsConfirm(ctx) {
    try {
      const Appointment = require('../../../models/Appointment');

      // Count active bookings (pending, scheduled, confirmed)
      const activeStatuses = ['pending_approval', 'scheduled', 'confirmed'];
      const activeBookings = await Appointment.query()
        .whereIn('status', activeStatuses)
        .count('id as count')
        .first();

      const count = activeBookings?.count || 0;

      if (count === 0) {
        await ctx.editMessageText(
          '✅ *No Active Bookings*\n\n' +
          'There are no active bookings to cancel.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      await ctx.editMessageText(
        `⚠️ *Cancel All Bookings*\n\n` +
        `You are about to cancel *${count} active booking(s)*.\n\n` +
        `This includes:\n` +
        `• Pending approval\n` +
        `• Scheduled\n` +
        `• Confirmed\n\n` +
        `❗ *This action cannot be undone.*\n\n` +
        `Are you sure you want to cancel all bookings?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🗑️ Yes, Cancel All', callback_data: 'admin_cancel_all_confirm' }],
              [{ text: '← No, Go Back', callback_data: 'admin_panel' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error in cancel all confirmation:', error);
      await ctx.editMessageText('❌ Error loading booking count.');
      return true;
    }
  }

  /**
   * Execute cancel all bookings
   */
  async handleCancelAllBookingsExecute(ctx) {
    try {
      const Appointment = require('../../../models/Appointment');

      const activeStatuses = ['pending_approval', 'scheduled', 'confirmed'];
      const now = moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');

      // Cancel all active bookings
      const cancelledCount = await Appointment.query()
        .whereIn('status', activeStatuses)
        .patch({
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: 'Bulk cancelled by admin'
        });

      console.log(`🗑️ Admin cancelled ${cancelledCount} bookings`);

      await ctx.editMessageText(
        `✅ *All Bookings Cancelled*\n\n` +
        `Successfully cancelled *${cancelledCount}* booking(s).\n\n` +
        `🕐 Cancelled at: ${moment().tz('America/New_York').format('MMM D, YYYY h:mm A')} EST`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 View Today\'s Bookings', callback_data: 'admin_today_bookings' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error cancelling all bookings:', error);
      await ctx.editMessageText(
        '❌ *Error*\n\nFailed to cancel bookings. Please try again.',
        {
          parse_mode: 'Markdown',
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
   * Handle individual booking cancellation - show confirmation dialog
   */
  async handleAdminCancelBooking(ctx, bookingUuid) {
    try {
      const Appointment = require('../../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', bookingUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText(
          '❌ *Booking Not Found*\n\nThis booking may have already been cancelled or deleted.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Today\'s Bookings', callback_data: 'admin_today_bookings' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      if (appointment.status === 'cancelled' || appointment.status === 'rejected') {
        await ctx.editMessageText(
          '❌ *Already Cancelled*\n\nThis booking has already been cancelled.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Today\'s Bookings', callback_data: 'admin_today_bookings' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const clientName = appointment.client
        ? `${appointment.client.first_name || ''} ${appointment.client.last_name || ''}`.trim() || 'Unknown'
        : appointment.customer_first_name
          ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
          : 'Unknown';
      const serviceName = appointment.service?.name || 'Lodge Scheduler Service';

      await ctx.editMessageText(
        `⚠️ *Cancel Booking?*\n\n` +
        `👤 *Customer:* ${escapeMarkdown(clientName)}\n` +
        `📅 *Date:* ${dateTime.format('MMM D, YYYY')}\n` +
        `⏰ *Time:* ${dateTime.format('h:mm A')} EST\n` +
        `📱 *Service:* ${escapeMarkdown(serviceName)}\n` +
        `📊 *Status:* ${escapeMarkdown(appointment.status)}\n\n` +
        `Are you sure you want to cancel this booking?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Yes, Cancel Booking', callback_data: `adm_cxl_ok_${bookingUuid}` }],
              [{ text: '← No, Go Back', callback_data: 'admin_today_bookings' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error in admin cancel booking:', error);
      await ctx.editMessageText('❌ Error loading booking details.');
      return true;
    }
  }

  /**
   * Execute individual booking cancellation
   */
  async handleAdminCancelBookingExecute(ctx, bookingUuid) {
    try {
      const Appointment = require('../../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', bookingUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText('❌ Booking not found.');
        return true;
      }

      if (appointment.status === 'cancelled' || appointment.status === 'rejected') {
        await ctx.editMessageText('❌ This booking has already been cancelled.');
        return true;
      }

      const now = moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');

      // Cancel the booking
      await Appointment.query()
        .where('uuid', bookingUuid)
        .patch({
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: 'Cancelled by admin'
        });

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const clientName = appointment.client
        ? `${appointment.client.first_name || ''} ${appointment.client.last_name || ''}`.trim() || 'Unknown'
        : appointment.customer_first_name
          ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
          : 'Unknown';

      console.log(`🗑️ Admin cancelled booking ${bookingUuid} for ${clientName}`);

      // Notify the customer if they have a telegram_id
      if (appointment.client?.telegram_id) {
        try {
          await ctx.telegram.sendMessage(
            appointment.client.telegram_id,
            `❌ *Booking Cancelled*\n\n` +
            `Your booking for ${dateTime.format('MMM D, YYYY')} at ${dateTime.format('h:mm A')} EST has been cancelled by the administrator.\n\n` +
            `Please use /book to schedule a new appointment if needed.`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.warn('Failed to notify customer of cancellation:', notifyError.message);
        }
      }

      await ctx.editMessageText(
        `✅ *Booking Cancelled*\n\n` +
        `👤 *Customer:* ${clientName}\n` +
        `📅 *Date:* ${dateTime.format('MMM D, YYYY')}\n` +
        `⏰ *Time:* ${dateTime.format('h:mm A')} EST\n\n` +
        `The booking has been cancelled successfully.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Today\'s Bookings', callback_data: 'admin_today_bookings' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error cancelling booking:', error);
      await ctx.editMessageText(
        '❌ *Error*\n\nFailed to cancel booking. Please try again.',
        {
          parse_mode: 'Markdown',
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

  // ========================================
  // USER MANAGEMENT HANDLERS
  // ========================================

  /**
   * Handle users list with pagination (5 per page)
   */
  async handleUsersList(ctx, page = 0) {
    try {
      const User = require('../../../models/User');
      const USERS_PER_PAGE = 5;

      // Get total count
      const countResult = await User.query()
        .whereNotNull('telegram_id')
        .count('* as count')
        .first();
      const totalUsers = parseInt(countResult?.count) || 0;
      const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));

      // Get users for this page
      const users = await User.query()
        .whereNotNull('telegram_id')
        .orderBy('created_at', 'desc')
        .offset(page * USERS_PER_PAGE)
        .limit(USERS_PER_PAGE);

      // Build message
      let message = `👥 *User Management*\n\n`;
      message += `📊 Total Users: ${totalUsers}\n`;
      message += `📄 Page ${page + 1} of ${totalPages}\n\n`;

      if (users.length === 0) {
        message += `_No users found._`;
      }

      const keyboard = [];

      users.forEach((user, index) => {
        const status = user.is_active ? '✅' : '🚫';
        // Primary identifier: @username or telegram_id
        const displayName = user.telegram_username
          ? `@${user.telegram_username}`
          : `ID: ${user.telegram_id}`;
        const escapedDisplayName = escapeMarkdown(displayName);

        message += `${index + 1}. ${status} *${escapedDisplayName}*\n`;
        message += `   ID: \`${user.telegram_id}\`\n\n`;

        // Button shows @username or ID
        const buttonLabel = user.telegram_username
          ? `@${user.telegram_username}`.substring(0, 15)
          : `${user.telegram_id}`.substring(0, 15);
        keyboard.push([
          { text: `👤 ${buttonLabel}`, callback_data: `admin_user_view_${user.telegram_id}` },
          user.is_active
            ? { text: '🚫 Ban', callback_data: `admin_user_ban_${user.telegram_id}` }
            : { text: '✅ Unban', callback_data: `admin_user_unban_${user.telegram_id}` }
        ]);
      });

      // Navigation row - always show with page indicator
      const navRow = [];

      // Previous button
      if (page > 0) {
        navRow.push({ text: '« Prev', callback_data: `admin_users_${page - 1}` });
      }

      // Page indicator (always show)
      navRow.push({ text: `📄 ${page + 1}/${totalPages}`, callback_data: 'admin_users' });

      // Next button
      if (page < totalPages - 1) {
        navRow.push({ text: 'Next »', callback_data: `admin_users_${page + 1}` });
      }

      keyboard.push(navRow);
      keyboard.push([
        { text: '🔄 Refresh', callback_data: 'admin_users' },
        { text: '🏠 Admin Panel', callback_data: 'admin_panel' }
      ]);

      // Try to edit message, fall back to reply if can't edit
      try {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (editError) {
        // Can't edit (e.g., called from command), use reply instead
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      }
      return true;

    } catch (error) {
      console.error('Error loading users list:', error);
      try {
        await ctx.editMessageText('❌ Error loading users list. Please try again.');
      } catch (e) {
        await ctx.reply('❌ Error loading users list. Please try again.');
      }
      return true;
    }
  }

  /**
   * Handle view user details
   */
  async handleViewUserDetails(ctx, telegramId) {
    try {
      const User = require('../../../models/User');
      const Appointment = require('../../../models/Appointment');

      const user = await User.query().where('telegram_id', telegramId).first();
      if (!user) {
        await ctx.editMessageText('❌ User not found.');
        return true;
      }

      // Count user's appointments
      const appointmentCount = await Appointment.query()
        .where('client_id', user.id)
        .count('* as count')
        .first();

      const status = user.is_active ? '✅ Active' : '🚫 Banned';
      const registered = user.created_at ? moment(user.created_at).format('MMM D, YYYY') : 'N/A';

      let message = `👤 *User Details*\n\n`;
      message += `*Name:* ${escapeMarkdown(user.first_name || '')} ${escapeMarkdown(user.last_name || '')}\n`;
      message += `*Username:* ${user.telegram_username ? '@' + escapeMarkdown(user.telegram_username) : 'N/A'}\n`;
      message += `*Telegram ID:* \`${user.telegram_id}\`\n`;
      message += `*Email:* ${escapeMarkdown(user.email || 'N/A')}\n`;
      message += `*Phone:* ${escapeMarkdown(user.phone || 'N/A')}\n`;
      message += `*Status:* ${status}\n`;
      message += `*Role:* ${user.role || 'client'}\n`;
      message += `*Registered:* ${registered}\n`;
      message += `*Appointments:* ${appointmentCount?.count || 0}\n`;

      const keyboard = [
        [
          user.is_active
            ? { text: '🚫 Ban User', callback_data: `admin_user_ban_${telegramId}` }
            : { text: '✅ Unban User', callback_data: `admin_user_unban_${telegramId}` }
        ],
        [{ text: '← Back to Users', callback_data: 'admin_users' }]
      ];

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
      return true;

    } catch (error) {
      console.error('Error loading user details:', error);
      await ctx.editMessageText('❌ Error loading user details.');
      return true;
    }
  }

  /**
   * Handle ban user confirmation
   */
  async handleBanUserConfirm(ctx, telegramId) {
    try {
      const User = require('../../../models/User');
      const user = await User.query().where('telegram_id', telegramId).first();

      if (!user) {
        await ctx.editMessageText('❌ User not found.');
        return true;
      }

      const rawName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
      const name = escapeMarkdown(rawName);
      const username = user.telegram_username ? '@' + escapeMarkdown(user.telegram_username) : 'N/A';

      await ctx.editMessageText(
        `⚠️ *Ban User?*\n\n` +
        `You are about to ban:\n` +
        `👤 *${name}*\n` +
        `📱 ${username}\n` +
        `🆔 \`${telegramId}\`\n\n` +
        `Banned users cannot use the bot until unbanned.\n\n` +
        `Are you sure?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚫 Yes, Ban User', callback_data: `admin_user_ban_confirm_${telegramId}` }],
              [{ text: '← Cancel', callback_data: `admin_user_view_${telegramId}` }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error in ban user confirm:', error);
      await ctx.editMessageText('❌ Error processing request.');
      return true;
    }
  }

  /**
   * Handle ban user execute
   */
  async handleBanUserExecute(ctx, telegramId) {
    try {
      const User = require('../../../models/User');

      await User.query()
        .where('telegram_id', telegramId)
        .patch({ is_active: false, updated_at: new Date() });

      const user = await User.query().where('telegram_id', telegramId).first();
      const rawName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unknown';
      const name = escapeMarkdown(rawName);

      console.log(`🚫 Admin banned user ${telegramId} (${rawName})`);

      // Notify the banned user
      try {
        await this.bot.telegram.sendMessage(
          telegramId,
          '🚫 Your access to this bot has been suspended. Please contact support if you believe this is an error.'
        );
      } catch (e) {
        console.warn('Could not notify banned user:', e.message);
      }

      await ctx.editMessageText(
        `✅ *User Banned*\n\n` +
        `👤 ${name} has been banned.\n` +
        `They will not be able to use the bot until unbanned.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Unban User', callback_data: `admin_user_unban_${telegramId}` }],
              [{ text: '← Back to Users', callback_data: 'admin_users' }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error banning user:', error);
      await ctx.editMessageText('❌ Error banning user. Please try again.');
      return true;
    }
  }

  /**
   * Handle unban user
   */
  async handleUnbanUser(ctx, telegramId) {
    try {
      const User = require('../../../models/User');

      await User.query()
        .where('telegram_id', telegramId)
        .patch({ is_active: true, updated_at: new Date() });

      const user = await User.query().where('telegram_id', telegramId).first();
      const rawName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unknown';
      const name = escapeMarkdown(rawName);

      console.log(`✅ Admin unbanned user ${telegramId} (${rawName})`);

      // Notify the unbanned user
      try {
        await this.bot.telegram.sendMessage(
          telegramId,
          '✅ Your access has been restored! You can now use the bot again.'
        );
      } catch (e) {
        console.warn('Could not notify unbanned user:', e.message);
      }

      await ctx.editMessageText(
        `✅ *User Unbanned*\n\n` +
        `👤 ${name} has been unbanned.\n` +
        `They can now use the bot again.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚫 Ban User', callback_data: `admin_user_ban_${telegramId}` }],
              [{ text: '← Back to Users', callback_data: 'admin_users' }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error unbanning user:', error);
      await ctx.editMessageText('❌ Error unbanning user. Please try again.');
      return true;
    }
  }

  // ========================================
  // USER ACCESS APPROVAL HANDLERS
  // ========================================

  /**
   * Approve user access request
   */
  async handleApproveUserAccess(ctx, telegramId) {
    try {
      const User = require('../../../models/User');

      const user = await User.query().where('telegram_id', telegramId).first();
      if (!user) {
        await ctx.editMessageText(
          `❌ User with ID ${telegramId} not found.`,
          { reply_markup: { inline_keyboard: [[{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]] } }
        );
        return true;
      }

      if (user.approval_status === 'approved') {
        await ctx.editMessageText(
          `✅ User ${telegramId} is already approved.`,
          { reply_markup: { inline_keyboard: [[{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]] } }
        );
        return true;
      }

      // Approve the user
      await User.query()
        .where('telegram_id', telegramId)
        .patch({
          approval_status: 'approved',
          is_active: true,
          approved_at: new Date(),
          approved_by: ctx.from.id.toString()
        });

      const rawName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
      const name = escapeMarkdown(rawName);
      const username = user.telegram_username ? `@${escapeMarkdown(user.telegram_username)}` : 'N/A';

      console.log(`✅ Admin ${ctx.from.id} approved user ${telegramId} (${rawName})`);

      // Notify the user
      try {
        await this.bot.telegram.sendMessage(
          telegramId,
          `🎉 *Access Approved!*\n\n` +
          `Great news! Your access to Lodge Mobile Activations Bot has been approved.\n\n` +
          `*You can now:*\n` +
          `📅 /book - Book new appointments\n` +
          `📋 /myappointments - View your appointments\n` +
          `❌ /cancel - Cancel appointments\n` +
          `🎧 /support - Get support help\n` +
          `ℹ️ /help - Show all commands\n\n` +
          `Welcome to Lodge Mobile! Use /book to get started.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.warn('Could not notify approved user:', e.message);
      }

      await ctx.editMessageText(
        `✅ *User Approved Successfully!*\n\n` +
        `👤 *Name:* ${name}\n` +
        `📱 *Username:* ${username}\n` +
        `🆔 *User ID:* \`${telegramId}\`\n\n` +
        `The user has been notified and can now use the bot.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Manage Users', callback_data: 'admin_users' }],
              [{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error approving user:', error);
      await ctx.editMessageText('❌ Error approving user. Please try again.');
      return true;
    }
  }

  /**
   * Deny user access request
   */
  async handleDenyUserAccess(ctx, telegramId) {
    try {
      const User = require('../../../models/User');

      const user = await User.query().where('telegram_id', telegramId).first();
      if (!user) {
        await ctx.editMessageText(
          `❌ User with ID ${telegramId} not found.`,
          { reply_markup: { inline_keyboard: [[{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]] } }
        );
        return true;
      }

      if (user.approval_status === 'rejected') {
        await ctx.editMessageText(
          `❌ User ${telegramId} was already denied.`,
          { reply_markup: { inline_keyboard: [[{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]] } }
        );
        return true;
      }

      // Deny the user
      await User.query()
        .where('telegram_id', telegramId)
        .patch({
          approval_status: 'rejected',
          is_active: false,
          rejected_at: new Date(),
          rejected_by: ctx.from.id.toString()
        });

      const rawName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
      const name = escapeMarkdown(rawName);
      const username = user.telegram_username ? `@${escapeMarkdown(user.telegram_username)}` : 'N/A';

      console.log(`❌ Admin ${ctx.from.id} denied user ${telegramId} (${rawName})`);

      // Notify the user
      try {
        await this.bot.telegram.sendMessage(
          telegramId,
          `❌ *Access Request Denied*\n\n` +
          `Your access request to Lodge Mobile Activations Bot was not approved at this time.\n\n` +
          `If you believe this was a mistake, please contact support.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.warn('Could not notify denied user:', e.message);
      }

      await ctx.editMessageText(
        `❌ *User Access Denied*\n\n` +
        `👤 *Name:* ${name}\n` +
        `📱 *Username:* ${username}\n` +
        `🆔 *User ID:* \`${telegramId}\`\n\n` +
        `The user has been notified.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve Instead', callback_data: `approve_${telegramId}` }],
              [{ text: '👥 Manage Users', callback_data: 'admin_users' }],
              [{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error denying user:', error);
      await ctx.editMessageText('❌ Error denying user. Please try again.');
      return true;
    }
  }

  // ========================================
  // BROADCAST MESSAGE HANDLERS
  // ========================================

  /**
   * Start broadcast - show target selection
   */
  async handleBroadcastStart(ctx) {
    try {
      const User = require('../../../models/User');
      const BotChannel = require('../../../models/BotChannel');

      // Get counts
      const userCount = await User.query()
        .where('is_active', true)
        .whereNotNull('telegram_id')
        .count('* as count')
        .first();
      const channelCount = await BotChannel.getActiveCount();

      const message = `📢 *Broadcast Message*\n\n` +
        `Choose where to send your announcement:\n\n` +
        `👥 *Users:* ${userCount?.count || 0} active\n` +
        `📣 *Groups/Channels:* ${channelCount} active\n\n` +
        `_Select a target audience below:_`;

      const keyboard = [
        [{ text: `👥 Users Only (${userCount?.count || 0})`, callback_data: 'admin_broadcast_to_users' }],
        [{ text: `📣 Groups/Channels Only (${channelCount})`, callback_data: 'admin_broadcast_to_channels' }],
        [{ text: `🌐 Everyone (Users + Groups)`, callback_data: 'admin_broadcast_to_all' }],
        [{ text: '❌ Cancel', callback_data: 'admin_panel' }]
      ];

      try {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (editError) {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      }
      return true;

    } catch (error) {
      console.error('Error starting broadcast:', error);
      await ctx.reply('❌ Error starting broadcast. Please try again.');
      return true;
    }
  }

  /**
   * Handle broadcast target selection
   */
  async handleBroadcastTargetSelect(ctx, target) {
    try {
      ctx.session = ctx.session || {};
      ctx.session.adminBroadcast = {
        awaiting: true,
        target: target // 'users', 'channels', or 'all'
      };

      const targetLabel = target === 'users' ? 'users' :
                          target === 'channels' ? 'groups/channels' : 'everyone';

      const message = `📢 *Broadcast to ${targetLabel}*\n\n` +
        `Type the message you want to send.\n\n` +
        `You can use *bold*, _italic_, and \`code\` formatting.`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back', callback_data: 'admin_broadcast' }],
            [{ text: '❌ Cancel', callback_data: 'admin_panel' }]
          ]
        }
      });
      return true;

    } catch (error) {
      console.error('Error in broadcast target select:', error);
      await ctx.reply('❌ Error. Please try again.');
      return true;
    }
  }

  /**
   * Execute broadcast to selected targets
   */
  async handleBroadcastExecute(ctx) {
    try {
      const User = require('../../../models/User');
      const BotChannel = require('../../../models/BotChannel');

      const broadcastData = ctx.session?.adminBroadcast;
      if (!broadcastData?.message) {
        await ctx.editMessageText('❌ No message to broadcast. Please try again.');
        return true;
      }

      const target = broadcastData.target || 'users';
      let usersSent = 0, usersFailed = 0;
      let channelsSent = 0, channelsFailed = 0;

      // Update message to show progress
      await ctx.editMessageText(
        `📢 *Broadcasting...*\n\nPreparing to send...`,
        { parse_mode: 'Markdown' }
      );

      // Send to users if target includes them
      if (target === 'users' || target === 'all') {
        const users = await User.query()
          .where('is_active', true)
          .whereNotNull('telegram_id')
          .select('telegram_id');

        for (const user of users) {
          try {
            await this.bot.telegram.sendMessage(
              user.telegram_id,
              `📢 *Announcement*\n\n${broadcastData.message}`,
              { parse_mode: 'Markdown' }
            );
            usersSent++;
          } catch (e) {
            usersFailed++;
          }
          await new Promise(r => setTimeout(r, 50));
        }
      }

      // Send to channels/groups if target includes them
      if (target === 'channels' || target === 'all') {
        const channels = await BotChannel.getActiveBroadcastChannels();

        for (const channel of channels) {
          try {
            await this.bot.telegram.sendMessage(
              channel.chat_id,
              `📢 *Announcement*\n\n${broadcastData.message}`,
              { parse_mode: 'Markdown' }
            );
            channelsSent++;
          } catch (e) {
            channelsFailed++;
            // Mark channel as unable to post if permission error
            if (e.code === 403 || e.description?.includes('bot was kicked') ||
                e.description?.includes('not enough rights')) {
              await BotChannel.updateCanPost(channel.chat_id, false);
            }
          }
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Clear session
      if (ctx.session) {
        delete ctx.session.adminBroadcast;
      }

      const totalSent = usersSent + channelsSent;
      const totalFailed = usersFailed + channelsFailed;

      console.log(`📢 Broadcast: Users ${usersSent}/${usersSent + usersFailed}, Channels ${channelsSent}/${channelsSent + channelsFailed}`);

      let resultMsg = `✅ *Broadcast Complete*\n\n`;
      if (target === 'users' || target === 'all') {
        resultMsg += `👥 *Users:* ${usersSent} sent, ${usersFailed} failed\n`;
      }
      if (target === 'channels' || target === 'all') {
        resultMsg += `📣 *Groups/Channels:* ${channelsSent} sent, ${channelsFailed} failed\n`;
      }
      resultMsg += `\n📊 *Total:* ${totalSent} delivered`;

      await ctx.editMessageText(resultMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📢 Send Another', callback_data: 'admin_broadcast' }],
            [{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]
          ]
        }
      });
      return true;

    } catch (error) {
      console.error('Error executing broadcast:', error);
      await ctx.editMessageText('❌ Error sending broadcast. Please try again.');
      return true;
    }
  }

  // ========================================
  // COMPLETION PROOF HANDLERS
  // ========================================

  /**
   * Send completion confirmation request to user
   */
  async handleSendCompletionRequest(ctx, appointmentUuid) {
    try {
      const Appointment = require('../../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', appointmentUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText('❌ Appointment not found.');
        return true;
      }

      if (!appointment.client?.telegram_id) {
        await ctx.editMessageText('❌ Client has no Telegram ID. Cannot send completion request.');
        return true;
      }

      // Get completion handler from services
      const completionHandler = this.services?.completionHandler;
      if (!completionHandler) {
        await ctx.editMessageText('❌ Completion handler not available.');
        return true;
      }

      // Send completion request to user
      await completionHandler.sendCompletionRequest(appointment, appointment.client.telegram_id);

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const customerName = appointment.customer_first_name
        ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
        : 'Unknown';

      await ctx.editMessageText(
        `✅ *Completion Request Sent*\n\n` +
        `A completion confirmation request has been sent to the customer.\n\n` +
        `👤 Customer: ${escapeMarkdown(customerName)}\n` +
        `📅 Date: ${dateTime.format('MMM D, YYYY')}\n` +
        `⏰ Time: ${dateTime.format('h:mm A')} EST\n\n` +
        `You will receive a notification when they respond.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View Details', callback_data: `admin_view_booking_${appointmentUuid}` }],
              [{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]
            ]
          }
        }
      );

      console.log(`Admin sent completion request for appointment ${appointmentUuid}`);
      return true;

    } catch (error) {
      console.error('Error sending completion request:', error);
      await ctx.editMessageText('❌ Error sending completion request. Please try again.');
      return true;
    }
  }

  /**
   * View proof photo for an appointment
   */
  async handleViewProof(ctx, appointmentUuid) {
    try {
      const Appointment = require('../../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', appointmentUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText('❌ Appointment not found.');
        return true;
      }

      if (!appointment.completion_proof_file_id) {
        await ctx.editMessageText(
          '❌ No proof photo has been uploaded for this appointment.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 View Details', callback_data: `admin_view_booking_${appointmentUuid}` }],
                [{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]
              ]
            }
          }
        );
        return true;
      }

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const customerName = appointment.customer_first_name
        ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
        : 'Unknown';

      const uploadedAt = appointment.completion_proof_uploaded_at
        ? moment(appointment.completion_proof_uploaded_at).tz('America/New_York').format('MMM D, YYYY h:mm A')
        : 'Unknown';

      // Send the photo with caption
      await ctx.replyWithPhoto(appointment.completion_proof_file_id, {
        caption: `📸 *Proof Photo*\n\n` +
          `👤 Customer: ${escapeMarkdown(customerName)}\n` +
          `📅 Date: ${dateTime.format('MMM D, YYYY')}\n` +
          `⏰ Time: ${dateTime.format('h:mm A')} EST\n` +
          `📤 Uploaded: ${uploadedAt}\n` +
          `🆔 ID: \`${appointmentUuid}\``,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 View Details', callback_data: `admin_view_booking_${appointmentUuid}` }],
            [{ text: '🏠 Admin Panel', callback_data: 'admin_panel' }]
          ]
        }
      });

      // Answer the callback query
      await ctx.answerCbQuery('Photo displayed');

      return true;

    } catch (error) {
      console.error('Error viewing proof photo:', error);
      await ctx.reply('❌ Error loading proof photo. Please try again.');
      return true;
    }
  }

  // ========================================
  // REMAINING SLOTS BROADCAST
  // ========================================

  /**
   * Broadcast remaining slots to channels for urgency/marketing
   */
  async broadcastRemainingSlots(appointment, formattedDate) {
    if (!this.bot) return;

    try {
      const BotChannel = require('../../../models/BotChannel');
      const Appointment = require('../../../models/Appointment');

      const channels = await BotChannel.getActiveBroadcastChannels();
      if (channels.length === 0) {
        console.log('No active broadcast channels for remaining slots');
        return;
      }

      // Get the date of the booked appointment
      const appointmentDate = moment(appointment.appointment_datetime).format('YYYY-MM-DD');

      // Count remaining available slots for that day
      // Assuming business hours 9 AM - 6 PM with 90-minute slots = ~6 slots per day
      const bookedCount = await Appointment.query()
        .whereRaw("DATE(appointment_datetime) = ?", [appointmentDate])
        .whereIn('status', ['confirmed', 'pending_approval'])
        .count('* as count')
        .first();

      const totalSlots = 6; // Configurable: total slots per day
      const booked = parseInt(bookedCount?.count) || 0;
      const remaining = Math.max(0, totalSlots - booked);

      const serviceName = appointment.service?.name || 'Lodge Service';

      // Create message based on remaining slots - always broadcast
      let urgencyEmoji = '📢';
      let urgencyText = '';

      if (remaining === 0) {
        urgencyEmoji = '🚫';
        urgencyText = `*FULLY BOOKED* for ${formattedDate}!`;
      } else if (remaining === 1) {
        urgencyEmoji = '⚡';
        urgencyText = `*LAST SLOT AVAILABLE* for ${formattedDate}!`;
      } else if (remaining === 2) {
        urgencyEmoji = '🔥';
        urgencyText = `Only *2 slots left* for ${formattedDate}!`;
      } else if (remaining === 3) {
        urgencyEmoji = '🔥';
        urgencyText = `Only *3 slots left* for ${formattedDate}!`;
      } else {
        urgencyEmoji = '📊';
        urgencyText = `*${remaining} of ${totalSlots} slots available* for ${formattedDate}`;
      }

      const message =
        `${urgencyEmoji} *Booking Update*\n\n` +
        `${urgencyText}\n\n` +
        `📱 Service: ${serviceName}\n` +
        `📅 Date: ${formattedDate}\n\n` +
        `_Don't miss out! Book your slot now._`;

      let sent = 0;
      let failed = 0;

      for (const channel of channels) {
        try {
          const options = {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Join Lodge Client Scheduler', url: 'https://t.me/Lodge_client_scheduler_bot' }]
              ]
            }
          };
          if (channel.topic_id) {
            options.message_thread_id = channel.topic_id;
          }
          await this.bot.telegram.sendMessage(channel.chat_id, message, options);
          sent++;
        } catch (error) {
          failed++;
          console.warn(`Failed to broadcast remaining slots to ${channel.chat_id}:`, error.message);
          if (error.code === 403 || error.description?.includes('bot was kicked') ||
              error.description?.includes('not enough rights')) {
            await BotChannel.updateCanPost(channel.chat_id, false);
          }
        }
        await new Promise(r => setTimeout(r, 100));
      }

      console.log(`📢 Remaining slots broadcast: ${sent} channels, ${remaining} slots left for ${formattedDate}`);

    } catch (error) {
      console.error('Error broadcasting remaining slots:', error);
    }
  }

  // ========================================
  // SETTINGS PANEL HANDLERS
  // ========================================

  /**
   * Show main settings panel
   */
  async handleSettingsPanel(ctx) {
    try {
      const BotSettings = require('../../../models/BotSettings');

      // Get summary of settings
      const notificationsEnabled = await BotSettings.get('notifications_enabled', true);
      const couponDropsEnabled = await BotSettings.get('coupon_drops_enabled', true);
      const slotThreshold = await BotSettings.get('slot_warning_threshold', 2);
      const couponFrequency = await BotSettings.get('coupon_drop_frequency', 1);

      let message = '⚙️ *Settings Panel*\n\n';
      message += '*Quick Overview:*\n';
      message += `├ 🔔 Notifications: ${notificationsEnabled ? '✅ ON' : '❌ OFF'}\n`;
      message += `├ 🎁 Coupon Drops: ${couponDropsEnabled ? '✅ ON' : '❌ OFF'}\n`;
      message += `├ ⚠️ Slot Warning: ${slotThreshold} remaining\n`;
      message += `└ 📅 Drops/Day: ${couponFrequency}\n`;
      message += '\n_Select a category to configure:_';

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔔 Notification Settings', callback_data: 'admin_settings_notifications' }],
            [{ text: '🎁 Coupon Settings', callback_data: 'admin_settings_coupons' }],
            [{ text: '📅 Booking Settings', callback_data: 'admin_settings_booking' }],
            [{ text: '🔧 General Settings', callback_data: 'admin_settings_general' }],
            [{ text: '← Back to Admin', callback_data: 'admin_panel' }]
          ]
        }
      });
      return true;
    } catch (error) {
      console.error('Error showing settings panel:', error);
      await ctx.editMessageText('❌ Error loading settings. Please try again.', {
        reply_markup: {
          inline_keyboard: [[{ text: '← Back', callback_data: 'admin_panel' }]]
        }
      });
      return true;
    }
  }

  /**
   * Show settings for a specific category
   */
  async handleSettingsCategory(ctx, category) {
    try {
      const BotSettings = require('../../../models/BotSettings');
      const settings = await BotSettings.getByCategory(category);

      const categoryTitles = {
        notifications: '🔔 Notification Settings',
        coupons: '🎁 Coupon Settings',
        booking: '📅 Booking Settings',
        general: '🔧 General Settings'
      };

      let message = `*${categoryTitles[category] || category}*\n\n`;
      const keyboard = [];

      const settingsOrder = Object.keys(settings);

      for (const key of settingsOrder) {
        const setting = settings[key];
        const displayName = this.formatSettingName(key);

        if (setting.type === 'boolean') {
          const status = setting.value ? '✅' : '❌';
          message += `${status} *${displayName}*\n`;
          message += `   _${setting.description || ''}_\n\n`;
          keyboard.push([{
            text: `${status} ${displayName}`,
            callback_data: `toggle_setting_${key}`
          }]);
        } else {
          message += `📊 *${displayName}:* \`${setting.value}\`\n`;
          message += `   _${setting.description || ''}_\n\n`;
          keyboard.push([{
            text: `✏️ ${displayName}: ${setting.value}`,
            callback_data: `edit_setting_${key}`
          }]);
        }
      }

      keyboard.push([{ text: '🔄 Refresh', callback_data: `admin_settings_${category}` }]);
      keyboard.push([{ text: '← Back to Settings', callback_data: 'admin_settings' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
      return true;
    } catch (error) {
      // Ignore "message is not modified" error (happens on refresh with no changes)
      if (error.message?.includes('message is not modified')) {
        await ctx.answerCbQuery('Settings are up to date');
        return true;
      }
      console.error(`Error showing ${category} settings:`, error);
      await ctx.editMessageText('❌ Error loading settings.', {
        reply_markup: {
          inline_keyboard: [[{ text: '← Back', callback_data: 'admin_settings' }]]
        }
      });
      return true;
    }
  }

  /**
   * Toggle a boolean setting
   */
  async handleToggleSetting(ctx, key) {
    try {
      const BotSettings = require('../../../models/BotSettings');

      const current = await BotSettings.get(key, false);
      const newValue = !current;

      await BotSettings.set(key, newValue);
      BotSettings.clearCache();

      const displayName = this.formatSettingName(key);
      await ctx.answerCbQuery(`${displayName}: ${newValue ? 'ON' : 'OFF'}`);

      // Get the category for this setting
      const setting = await BotSettings.query().where('setting_key', key).first();
      const category = setting?.category || 'general';

      return await this.handleSettingsCategory(ctx, category);
    } catch (error) {
      console.error(`Error toggling ${key}:`, error);
      await ctx.answerCbQuery('Error updating setting', { show_alert: true });
      return true;
    }
  }

  /**
   * Prompt admin to edit a numeric/string setting
   */
  async handleEditSettingPrompt(ctx, key) {
    try {
      const BotSettings = require('../../../models/BotSettings');
      const setting = await BotSettings.query().where('setting_key', key).first();

      if (!setting) {
        await ctx.answerCbQuery('Setting not found', { show_alert: true });
        return true;
      }

      const displayName = this.formatSettingName(key);
      const currentValue = BotSettings.parseValue(setting.setting_value, setting.setting_type);

      // Store in session for handling the response
      ctx.session = ctx.session || {};
      ctx.session.editingSetting = {
        key: key,
        type: setting.setting_type,
        category: setting.category
      };

      await ctx.editMessageText(
        `✏️ *Edit ${displayName}*\n\n` +
        `Current value: \`${currentValue}\`\n` +
        `Type: ${setting.setting_type}\n\n` +
        `${setting.description || ''}\n\n` +
        `_Reply with the new value:_`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: `admin_settings_${setting.category}` }]
            ]
          }
        }
      );

      await ctx.answerCbQuery('Enter new value');
      return true;
    } catch (error) {
      console.error(`Error prompting edit for ${key}:`, error);
      await ctx.answerCbQuery('Error', { show_alert: true });
      return true;
    }
  }

  /**
   * Handle setting value input from admin
   */
  async handleSettingValueInput(ctx) {
    try {
      if (!ctx.session?.editingSetting) {
        return false;
      }

      const { key, type, category } = ctx.session.editingSetting;
      const input = ctx.message?.text?.trim();

      if (!input) {
        return false;
      }

      const BotSettings = require('../../../models/BotSettings');

      // Validate input based on type
      let value;
      if (type === 'number') {
        value = parseFloat(input);
        if (isNaN(value)) {
          await ctx.reply('❌ Please enter a valid number.');
          return true;
        }
      } else {
        value = input;
      }

      await BotSettings.set(key, value);
      BotSettings.clearCache();

      delete ctx.session.editingSetting;

      const displayName = this.formatSettingName(key);
      await ctx.reply(
        `✅ *${displayName}* updated to \`${value}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Back to Settings', callback_data: `admin_settings_${category}` }]
            ]
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Error saving setting value:', error);
      await ctx.reply('❌ Error saving setting.');
      return true;
    }
  }

  /**
   * Format setting key to display name
   */
  formatSettingName(key) {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace('Enabled', '')
      .replace('Notification', 'Notify')
      .trim();
  }

  /**
   * Show coupons management panel
   */
  async handleCouponsPanel(ctx) {
    try {
      const Coupon = require('../../../models/Coupon');
      const CouponBudget = require('../../../models/CouponBudget');
      const BotSettings = require('../../../models/BotSettings');

      const activeCoupons = await Coupon.getActiveCount();
      const budget = await CouponBudget.getRemainingBudget();
      const dropFrequency = await BotSettings.getCouponDropFrequency();

      let message = '*🎟️ Coupon Management*\n\n';
      message += `*Active Coupons:* ${activeCoupons}\n`;
      message += `*Weekly Budget Remaining:* $${budget}\n`;
      message += `*Auto-Drop Frequency:* ${dropFrequency}/day\n\n`;
      message += '_Create and manage discount coupons_';

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Create Coupon', callback_data: 'admin_coupon_create' }],
            [{ text: '📢 Broadcast Coupon', callback_data: 'admin_coupon_broadcast' }],
            [{ text: '📋 List Active', callback_data: 'admin_coupon_list' }],
            [{ text: '← Back to Admin', callback_data: 'admin_panel' }]
          ]
        }
      });

      return true;
    } catch (error) {
      console.error('Error showing coupons panel:', error);
      await ctx.editMessageText('❌ Error loading coupons panel.');
      return true;
    }
  }

  /**
   * Handle coupon actions
   */
  async handleCouponAction(ctx, callbackData) {
    if (callbackData === 'admin_coupon_create') {
      return await this.handleCreateCoupon(ctx);
    }
    if (callbackData === 'admin_coupon_broadcast') {
      return await this.handleBroadcastCoupon(ctx);
    }
    if (callbackData === 'admin_coupon_list') {
      return await this.handleListCoupons(ctx);
    }
    return false;
  }

  /**
   * Create a new coupon
   */
  async handleCreateCoupon(ctx) {
    try {
      await ctx.answerCbQuery();
      ctx.session.creatingCoupon = true;

      await ctx.reply(
        '*Create New Coupon*\n\n' +
        'Enter discount amount in CAD (e.g., 25)\n\n' +
        '_Send the amount as your next message._',
        { parse_mode: 'Markdown' }
      );

      return true;
    } catch (error) {
      console.error('Error creating coupon:', error);
      await ctx.answerCbQuery('Error');
      return true;
    }
  }

  /**
   * Broadcast a coupon to public group
   */
  async handleBroadcastCoupon(ctx) {
    try {
      await ctx.answerCbQuery();
      ctx.session.broadcastingCoupon = true;

      await ctx.reply(
        '*Broadcast Coupon*\n\n' +
        'Enter discount amount in CAD (e.g., 25)\n\n' +
        'This will create a coupon and send it to the public Telegram group.\n\n' +
        '_Send the amount as your next message._',
        { parse_mode: 'Markdown' }
      );

      return true;
    } catch (error) {
      console.error('Error broadcasting coupon:', error);
      await ctx.answerCbQuery('Error');
      return true;
    }
  }

  /**
   * List active coupons
   */
  async handleListCoupons(ctx) {
    try {
      const Coupon = require('../../../models/Coupon');
      const { Model } = require('objection');

      const coupons = await Model.knex()('coupons')
        .where('status', 'active')
        .orderBy('created_at', 'desc')
        .limit(10);

      let message = '*🎟️ Active Coupons*\n\n';

      if (coupons.length === 0) {
        message += '_No active coupons_';
      } else {
        for (const coupon of coupons) {
          message += `Code: \`${coupon.code}\`\n`;
          message += `Amount: $${coupon.amount}\n`;
          message += `Expires: ${new Date(coupon.expires_at).toLocaleDateString()}\n\n`;
        }
      }

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to Coupons', callback_data: 'admin_coupons' }]
          ]
        }
      });

      return true;
    } catch (error) {
      console.error('Error listing coupons:', error);
      await ctx.editMessageText('❌ Error loading coupons.');
      return true;
    }
  }

  /**
   * Process coupon amount input
   */
  async processCouponAmount(ctx, amount) {
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return true;
    }

    try {
      const Coupon = require('../../../models/Coupon');

      if (ctx.session.creatingCoupon) {
        delete ctx.session.creatingCoupon;

        const coupon = await Coupon.createCoupon(parsedAmount, 7);

        await ctx.reply(
          `✅ *Coupon Created!*\n\n` +
          `Code: \`${coupon.code}\`\n` +
          `Amount: $${parsedAmount}\n` +
          `Expires: 7 days\n\n` +
          `_Share this code with customers manually._`,
          { parse_mode: 'Markdown' }
        );

        return true;
      }

      if (ctx.session.broadcastingCoupon) {
        delete ctx.session.broadcastingCoupon;

        const coupon = await Coupon.createCoupon(parsedAmount, 7);
        const BotChannel = require('../../../models/BotChannel');

        const channels = await BotChannel.getActiveBroadcastChannels();

        if (channels.length === 0) {
          await ctx.reply('❌ No active broadcast channels configured.');
          return true;
        }

        let sent = 0;
        let failed = 0;

        const message =
          `🎁 *Limited Time Offer!*\n\n` +
          `Get $${parsedAmount} OFF your next appointment!\n\n` +
          `Use code: \`${coupon.code}\`\n\n` +
          `Valid for 7 days. First come, first served! 🏃`;

        for (const channel of channels) {
          try {
            const options = { parse_mode: 'Markdown' };
            if (channel.topic_id) {
              options.message_thread_id = channel.topic_id;
            }

            await this.bot.telegram.sendMessage(channel.chat_id, message, options);
            await Coupon.markBroadcast(coupon.id, channel.chat_id);
            sent++;
          } catch (error) {
            failed++;
            console.error(`Failed to broadcast coupon to ${channel.chat_id}:`, error.message);
            console.error('Stack:', error.stack);
          }
          await new Promise(r => setTimeout(r, 100));
        }

        await ctx.reply(
          `✅ *Coupon Broadcast Complete!*\n\n` +
          `Code: \`${coupon.code}\`\n` +
          `Amount: $${parsedAmount}\n` +
          `Sent to: ${sent} channel(s)\n` +
          `Failed: ${failed}`,
          { parse_mode: 'Markdown' }
        );

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error processing coupon amount:', error);
      await ctx.reply('❌ Error creating coupon.');
      delete ctx.session.creatingCoupon;
      delete ctx.session.broadcastingCoupon;
      return true;
    }
  }
}

module.exports = AdminHandler;
