const { Markup } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../../models/User');
const Service = require('../../models/Service');
const SupportTicket = require('../../models/SupportTicket');
const bookingConfig = require('../../../config/booking.config');

class AdminCommand {
  constructor(bot, services) {
    this.bot = bot;
    this.supportService = services.supportService;
    this.bookingSlotService = services.bookingSlotService;
    this.groupNotificationService = services.groupNotificationService;
    this.referralCodeService = services.referralCodeService;
    this.adminIds = services.adminIds || [];
    this.ADMIN_ID = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
  }

  getName() {
    return 'admin';
  }

  getDescription() {
    return 'Lodge Mobile admin commands (administrators only)';
  }

  async execute(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for Lodge Mobile administrators only.');
    }

    // Show interactive admin panel with buttons
    // This matches the showAdminPanel method in AdminHandler.js for consistency
    try {
      const Appointment = require('../../models/Appointment');

      let pendingBookings = 0;
      let todayBookings = 0;
      let openTickets = 0;
      let pendingUsers = 0;

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
      const todayStart = moment().tz('America/New_York').startOf('day').toISOString();
      const todayEnd = moment().tz('America/New_York').endOf('day').toISOString();
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

      // Build dashboard message
      let dashboardMsg = '🔧 *Admin Panel*\n\n';
      dashboardMsg += '📊 *Quick Stats:*\n';
      dashboardMsg += `├ 👤 Pending Users: *${pendingUsers}*${pendingUsers > 0 ? ' 🔴' : ''}\n`;
      dashboardMsg += `├ ⏳ Pending Bookings: *${pendingBookings}*${pendingBookings > 0 ? ' ⚠️' : ''}\n`;
      dashboardMsg += `├ 📅 Today's Bookings: *${todayBookings}*\n`;
      dashboardMsg += `└ 🎫 Open Tickets: *${openTickets}*${openTickets > 0 ? ' ⚠️' : ''}\n`;
      dashboardMsg += '\n_Select an option below:_';

      // Build keyboard with 2-column layout
      const keyboard = [];

      // Row 1: Pending items (most urgent) - only show if there are pending items
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

      // Row 5: Bot Status
      keyboard.push([
        { text: '📊 Status', callback_data: 'admin_bot_status' }
      ]);

      // Row 6: Danger zone
      keyboard.push([
        { text: '🗑️ Cancel All', callback_data: 'admin_cancel_all_bookings' }
      ]);

      await ctx.reply(dashboardMsg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      console.error('Admin panel error:', error);
      await ctx.reply('❌ Error loading admin panel. Please try again.');
    }
  }

  // Support Management Commands
  async handleViewTickets(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }

    try {
      const tickets = await this.supportService.getAllTickets(null, 10);

      if (tickets.length === 0) {
        return ctx.reply('📭 No support tickets found.');
      }

      let message = `📋 *All Support Tickets (Last 10):*\n\n`;
      
      tickets.forEach((ticket, index) => {
        message += this.supportService.formatTicketForDisplay(ticket);
        if (index < tickets.length - 1) message += '\n---\n';
      });

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Admin tickets error:', error);
      ctx.reply('Sorry, I couldn\'t fetch support tickets. Please try again.');
    }
  }

  async handleCloseTicket(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }

    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      return ctx.reply('Please provide the ticket ID.\nExample: /closeticket TKT-123456');
    }

    try {
      const ticketId = args[1];
      const reason = args.slice(2).join(' ') || 'Closed by admin';
      
      const user = await User.query().where('telegram_id', ctx.from.id.toString()).first();
      const ticket = await this.supportService.closeTicket(ticketId, user.id, reason);

      await ctx.reply(
        `✅ *Ticket Closed Successfully!*\n\n` +
        `Ticket ID: \`${ticket.ticket_id}\`\n` +
        `Reason: ${reason}`,
        { parse_mode: 'Markdown' }
      );

      await this.notifyUserTicketClosed(ticket, reason);
    } catch (error) {
      console.error('Close ticket error:', error);
      ctx.reply('Sorry, I couldn\'t close the ticket. Please check the ticket ID and try again.');
    }
  }

  async handleSupportStats(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }

    try {
      const stats = await this.supportService.getSupportStats();

      const message = `
📊 *Support Statistics*

*Overview:*
• Total Tickets: ${stats.total}
• Today's Tickets: ${stats.today}
• Avg Resolution: ${stats.avgResolutionTimeMinutes} minutes
• Old Open Tickets: ${stats.oldOpenTickets} (>24h)

*By Status:*
• Open: ${stats.byStatus.open || 0}
• In Progress: ${stats.byStatus.in_progress || 0}
• Waiting for User: ${stats.byStatus.waiting_for_user || 0}
• Resolved: ${stats.byStatus.resolved || 0}
• Closed: ${stats.byStatus.closed || 0}

*By Priority:*
• Urgent: ${stats.byPriority.urgent || 0} 🚨
• High: ${stats.byPriority.high || 0} 🔴
• Medium: ${stats.byPriority.medium || 0} 🟡
• Low: ${stats.byPriority.low || 0} 🟢
      `;

      await ctx.replyWithMarkdown(message.trim());
    } catch (error) {
      console.error('Support stats error:', error);
      ctx.reply('Sorry, I couldn\'t fetch support statistics. Please try again.');
    }
  }

  // User Management Commands
  async handleViewRequests(ctx) {
    if (ctx.from.id.toString() !== this.ADMIN_ID) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    try {
      const pendingUsers = await User.findPendingRequests(20);
      
      if (pendingUsers.length === 0) {
        return ctx.reply('✅ No pending access requests.');
      }
      
      let message = `📋 *Pending Access Requests (${pendingUsers.length})*\n\n`;
      
      const buttons = [];
      
      pendingUsers.forEach((user, index) => {
        const registrationDate = new Date(user.created_at).toLocaleDateString();
        message += `${index + 1}. *${user.first_name} ${user.last_name}*\n`;
        message += `   • User ID: \`${user.telegram_id}\`\n`;
        message += `   • Username: @${user.telegram_username || 'N/A'}\n`;
        message += `   • Registered: ${registrationDate}\n\n`;
        
        if (index % 2 === 0) {
          buttons.push([
            Markup.button.callback(`✅ Approve ${user.telegram_id}`, `approve_${user.telegram_id}`),
            pendingUsers[index + 1] ? Markup.button.callback(`✅ Approve ${pendingUsers[index + 1].telegram_id}`, `approve_${pendingUsers[index + 1].telegram_id}`) : null
          ].filter(Boolean));
          
          buttons.push([
            Markup.button.callback(`❌ Deny ${user.telegram_id}`, `deny_${user.telegram_id}`),
            pendingUsers[index + 1] ? Markup.button.callback(`❌ Deny ${pendingUsers[index + 1].telegram_id}`, `deny_${pendingUsers[index + 1].telegram_id}`) : null
          ].filter(Boolean));
        }
      });
      
      message += `*Quick Actions:*\n`;
      message += `• Use buttons below for quick approve/deny\n`;
      message += `• Use /approve [user_id] for individual approval\n`;
      message += `• Use /deny [user_id] for individual denial`;
      
      await ctx.replyWithMarkdown(message, {
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
      });
      
    } catch (error) {
      console.error('Requests command error:', error);
      await ctx.reply('❌ Error fetching pending requests. Please try again.');
    }
  }

  async handleApproveUser(ctx) {
    if (ctx.from.id.toString() !== this.ADMIN_ID) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      return ctx.reply('Please provide the user ID.\nExample: /approve 123456789');
    }
    
    try {
      const telegramId = args[1];
      const user = await User.findByTelegramId(telegramId);
      
      if (!user) {
        return ctx.reply(`❌ User with ID ${telegramId} not found.`);
      }
      
      if (user.isApproved()) {
        return ctx.reply(`✅ User ${telegramId} is already approved.`);
      }
      
      await user.approve(this.ADMIN_ID);
      await this.referralCodeService.approveUser(telegramId);
      
      await ctx.reply(
        `✅ *User Approved Successfully!*\n\n` +
        `User ID: \`${telegramId}\`\n` +
        `Name: ${user.first_name} ${user.last_name}\n` +
        `Username: @${user.telegram_username || 'N/A'}\n\n` +
        `The user will be notified and can now use the bot.`,
        { parse_mode: 'Markdown' }
      );
      
      await this.notifyUserApproval(user);
      
    } catch (error) {
      console.error('Approve command error:', error);
      await ctx.reply('❌ Error approving user. Please try again.');
    }
  }

  // Notification Management Commands
  async handleSetGroup(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    
    if (chatType === 'private') {
      return ctx.reply('❌ This command must be used in a group chat.');
    }
    
    this.groupNotificationService.setGroupChatId(chatId);
    
    ctx.reply(
      `✅ *Group Notification Setup Complete!*\n\n` +
      `Group ID: \`${chatId}\`\n` +
      `Group Name: ${ctx.chat.title || 'Unknown'}\n\n` +
      `This group will now receive:\n` +
      `• New booking notifications\n` +
      `• Cancellation alerts\n` +
      `• Daily limit warnings\n\n` +
      `Use /testnotify to test notifications.`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleDailySummary(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    try {
      const today = moment().tz(bookingConfig.timezone).format('YYYY-MM-DD');
      const todayBookings = await this.bookingSlotService.getBookingsForDate(today);
      const availableSlots = bookingConfig.bookingLimits.maxSlotsPerDay - todayBookings.length;
      
      let message = `📊 *Daily Booking Summary*\n\n`;
      message += `📅 Date: ${moment(today).format('MMM DD, YYYY')}\n`;
      message += `⏰ Business Hours: ${this.bookingSlotService.getBusinessHoursDisplay().hours}\n\n`;
      
      message += `*Slot Status:*\n`;
      message += `• Total Slots: ${bookingConfig.bookingLimits.maxSlotsPerDay}\n`;
      message += `• Booked: ${todayBookings.length}\n`;
      message += `• Available: ${availableSlots}\n\n`;
      
      if (todayBookings.length > 0) {
        message += `*Today's Appointments:*\n`;
        for (const booking of todayBookings) {
          const time = this.bookingSlotService.formatDateTime(booking.appointment_datetime);
          const service = await Service.query().findById(booking.service_id);
          const client = await User.query().findById(booking.client_id);
          
          message += `• ${time.time} - ${service?.name || 'Service'} (${client?.first_name} ${client?.last_name})\n`;
        }
      } else {
        message += `*No bookings for today yet.*`;
      }
      
      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Daily summary error:', error);
      ctx.reply('❌ Failed to generate daily summary.');
    }
  }

  // Referral Code Management Commands
  async handleCreateCode(ctx) {
    if (ctx.from.id.toString() !== this.ADMIN_ID) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length < 3) {
      return ctx.reply(
        'Please provide code and max uses.\n\n' +
        'Format: /createcode CODE MAX_USES\n' +
        'Example: /createcode WINTER2025 100'
      );
    }
    
    try {
      const code = args[1].toUpperCase();
      const maxUses = parseInt(args[2]);
      
      if (isNaN(maxUses) || maxUses <= 0) {
        return ctx.reply('❌ Max uses must be a positive number.');
      }
      
      await this.referralCodeService.createCode(code, maxUses, ctx.from.id.toString());
      
      await ctx.reply(
        `✅ *Referral Code Created Successfully!*\n\n` +
        `Code: \`${code}\`\n` +
        `Max Uses: ${maxUses}\n` +
        `Current Uses: 0\n\n` +
        `Users can now use /invite ${code} to get instant access.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Create code error:', error);
      if (error.message.includes('already exists')) {
        await ctx.reply(`❌ Code already exists. Please choose a different code.`);
      } else {
        await ctx.reply('❌ Error creating referral code. Please try again.');
      }
    }
  }

  // Helper methods
  isAdmin(telegramId) {
    if (!telegramId) return false;
    return this.adminIds.includes(telegramId.toString()) || telegramId.toString() === this.ADMIN_ID;
  }

  async notifyUserTicketClosed(ticket, reason) {
    try {
      const user = await User.query().where('id', ticket.user_id).first();
      if (!user || !user.telegram_id) return;

      const message = `
✅ *Your Support Ticket Has Been Closed*

Ticket ID: \`${ticket.ticket_id}\`
Subject: ${ticket.subject}
Reason: ${reason}

If you need further assistance, please create a new ticket with /ticket.
      `;

      await this.bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user about ticket closure:', error);
    }
  }

  async notifyUserApproval(user) {
    try {
      if (!user.telegram_id) return;
      
      const message = `
🎉 *Access Approved!*

Great news! Your access to Lodge Mobile Activations Bot has been approved.

*You can now:*
📅 /book - Book new appointments
📋 /myappointments - View your appointments
❌ /cancel - Cancel appointments
🎧 /support - Get support help
ℹ️ /help - Show all commands

Welcome to Lodge Mobile! Use /book to get started.
      `;
      
      await this.bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying user about approval:', error);
    }
  }
}

module.exports = AdminCommand;