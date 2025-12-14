const BasePlugin = require('../../core/BasePlugin');
const { Markup } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../../models/User');
const Service = require('../../models/Service');
const Appointment = require('../../models/Appointment');
const SupportTicket = require('../../models/SupportTicket');

/**
 * Admin Plugin - Handles administrative commands and management functions
 */
class AdminPlugin extends BasePlugin {
  get name() {
    return 'admin';
  }

  get version() {
    return '1.0.0';
  }

  get description() {
    return 'Administrative commands and management system';
  }

  get dependencies() {
    return ['auth'];
  }

  get priority() {
    return 13; // Load after core functionality
  }

  async onInitialize() {
    // Define admin commands
    this.commands = [
      {
        name: 'admin',
        handler: this.handleAdminCommand.bind(this),
        description: 'Show admin help menu'
      },
      {
        name: 'requests',
        handler: this.handleRequestsCommand.bind(this),
        description: 'View pending access requests'
      },
      {
        name: 'approve',
        handler: this.handleApproveCommand.bind(this),
        description: 'Approve user access'
      },
      {
        name: 'deny',
        handler: this.handleDenyCommand.bind(this),
        description: 'Deny user access'
      },
      {
        name: 'createcode',
        handler: this.handleCreateCodeCommand.bind(this),
        description: 'Create referral code'
      },
      {
        name: 'codes',
        handler: this.handleCodesCommand.bind(this),
        description: 'List referral codes'
      },
      {
        name: 'setgroup',
        handler: this.handleSetGroupCommand.bind(this),
        description: 'Set notification group'
      },
      {
        name: 'testnotify',
        handler: this.handleTestNotifyCommand.bind(this),
        description: 'Test notifications'
      },
      {
        name: 'dailysummary',
        handler: this.handleDailySummaryCommand.bind(this),
        description: 'Get daily booking summary'
      },
      {
        name: 'businesshours',
        handler: this.handleBusinessHoursCommand.bind(this),
        description: 'Show business hours'
      }
    ];

    // Define action handlers for quick approve/deny buttons
    this.handlers = [
      {
        pattern: /approve_(.+)/,
        handler: this.handleQuickApprove.bind(this)
      },
      {
        pattern: /deny_(.+)/,
        handler: this.handleQuickDeny.bind(this)
      }
    ];
  }

  async handleAdminCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for Lodge Mobile administrators only.');
    }

    const adminHelp = `
🔧 *Lodge Mobile Admin Commands:*

*🎧 Support Management:*
• /tickets - View all support tickets
• /closeticket TICKET_ID - Close a support ticket
• /assignticket TICKET_ID AGENT_ID - Assign ticket to agent
• /supportstats - View support statistics

*📋 Booking Management:*
• /viewbookings - View all Lodge Mobile bookings
• /viewbookings YYYY-MM-DD - View bookings for date
• /cancelbooking BOOKING_ID - Cancel any booking
• /reschedule BOOKING_ID YYYY-MM-DD HH:MM - Reschedule appointment

*👥 User Management:*
• /requests - View pending access requests
• /approve USER_ID - Approve user access
• /deny USER_ID - Deny user access
• /users - View all registered users
• /userinfo USER_ID - Get detailed user information

*🎫 Referral Code Management:*
• /createcode CODE MAX_USES - Create referral code
• /codes - List all referral codes

*🔔 Notification Management:*
• /setgroup - Set current group for notifications
• /testnotify - Send test notification to group
• /dailysummary - Get daily booking summary
• /businesshours - Show business hours configuration

*📊 System Management:*
• /stats - Lodge Mobile system statistics
• /broadcast MESSAGE - Send message to all users
• /maintenance on/off - Toggle maintenance mode

*Examples:*
• /approve 123456789
• /createcode WINTER2025 100
• /viewbookings 2025-08-09
• /broadcast System maintenance tonight at 11 PM

Use these commands to manage the Lodge Mobile activation system.
    `;
    
    await ctx.replyWithMarkdown(adminHelp);
  }

  async handleRequestsCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
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
        
        // Add approve/deny buttons (2 per row)
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
      this.logger.error('Requests command error:', error);
      await ctx.reply('❌ Error fetching pending requests. Please try again.');
    }
  }

  async handleApproveCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
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
      
      const authPlugin = this.getOtherPlugin('auth');
      if (authPlugin && authPlugin.isUserApproved(user)) {
        return ctx.reply(`✅ User ${telegramId} is already approved.`);
      }
      
      await user.approve(ctx.from.id.toString());
      
      // Get referral service from auth plugin
      if (authPlugin && authPlugin.referralCodeService) {
        await authPlugin.referralCodeService.approveUser(telegramId);
      }
      
      await ctx.reply(
        `✅ *User Approved Successfully!*\n\n` +
        `User ID: \`${telegramId}\`\n` +
        `Name: ${user.first_name} ${user.last_name}\n` +
        `Username: @${user.telegram_username || 'N/A'}\n\n` +
        `The user will be notified and can now use the bot.`,
        { parse_mode: 'Markdown' }
      );
      
      // Emit approval event
      this.eventBus.emit('admin:user-approved', {
        user: user,
        approvedBy: ctx.from.id
      });
      
      // Notify the user
      await this.notifyUserApproval(user);
      
    } catch (error) {
      this.logger.error('Approve command error:', error);
      await ctx.reply('❌ Error approving user. Please try again.');
    }
  }

  async handleDenyCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      return ctx.reply('Please provide the user ID.\nExample: /deny 123456789');
    }
    
    try {
      const telegramId = args[1];
      const user = await User.findByTelegramId(telegramId);
      
      if (!user) {
        return ctx.reply(`❌ User with ID ${telegramId} not found.`);
      }
      
      if (user.isDenied()) {
        return ctx.reply(`❌ User ${telegramId} is already denied.`);
      }
      
      await user.deny(ctx.from.id.toString());
      
      // Get referral service from auth plugin
      const authPlugin = this.getOtherPlugin('auth');
      if (authPlugin && authPlugin.referralCodeService) {
        await authPlugin.referralCodeService.denyUser(telegramId);
      }
      
      await ctx.reply(
        `❌ *User Denied*\n\n` +
        `User ID: \`${telegramId}\`\n` +
        `Name: ${user.first_name} ${user.last_name}\n` +
        `Username: @${user.telegram_username || 'N/A'}\n\n` +
        `The user has been denied access to the bot.`,
        { parse_mode: 'Markdown' }
      );
      
      // Emit denial event
      this.eventBus.emit('admin:user-denied', {
        user: user,
        deniedBy: ctx.from.id
      });
      
      // Notify the user
      await this.notifyUserDenial(user);
      
    } catch (error) {
      this.logger.error('Deny command error:', error);
      await ctx.reply('❌ Error denying user. Please try again.');
    }
  }

  async handleCreateCodeCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
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
      
      // Get referral service from auth plugin
      const authPlugin = this.getOtherPlugin('auth');
      if (!authPlugin || !authPlugin.referralCodeService) {
        return ctx.reply('❌ Referral code service not available.');
      }
      
      await authPlugin.referralCodeService.createCode(code, maxUses, ctx.from.id.toString());
      
      await ctx.reply(
        `✅ *Referral Code Created Successfully!*\n\n` +
        `Code: \`${code}\`\n` +
        `Max Uses: ${maxUses}\n` +
        `Current Uses: 0\n\n` +
        `Users can now use /invite ${code} to get instant access.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      this.logger.error('Create code error:', error);
      if (error.message.includes('already exists')) {
        await ctx.reply(`❌ Code already exists. Please choose a different code.`);
      } else {
        await ctx.reply('❌ Error creating referral code. Please try again.');
      }
    }
  }

  async handleCodesCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    try {
      // Get referral service from auth plugin
      const authPlugin = this.getOtherPlugin('auth');
      if (!authPlugin || !authPlugin.referralCodeService) {
        return ctx.reply('❌ Referral code service not available.');
      }
      
      const codes = await authPlugin.referralCodeService.getAllCodes();
      const codeList = Object.entries(codes);
      
      if (codeList.length === 0) {
        return ctx.reply('📭 No referral codes found.\n\nUse /createcode to create one.');
      }
      
      let message = `🎫 *Active Referral Codes (${codeList.length})*\n\n`;
      
      codeList.forEach(([code, data], index) => {
        const status = data.active ? '✅ Active' : '❌ Inactive';
        const usage = `${data.uses}/${data.maxUses}`;
        const createdDate = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Unknown';
        
        message += `${index + 1}. *${code}*\n`;
        message += `   • Status: ${status}\n`;
        message += `   • Usage: ${usage}\n`;
        message += `   • Created: ${createdDate}\n`;
        message += `   • Created by: ${data.createdBy || 'Unknown'}\n\n`;
      });
      
      message += `*Commands:*\n`;
      message += `• /createcode CODE MAX_USES - Create new code\n`;
      message += `• Codes are shared with users via /invite CODE`;
      
      await ctx.replyWithMarkdown(message);
      
    } catch (error) {
      this.logger.error('Codes command error:', error);
      await ctx.reply('❌ Error fetching referral codes. Please try again.');
    }
  }

  async handleSetGroupCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    
    if (chatType === 'private') {
      return ctx.reply('❌ This command must be used in a group chat.');
    }
    
    // Emit group set event for notification plugin
    this.eventBus.emit('admin:notification-group-set', {
      groupId: chatId,
      groupTitle: ctx.chat.title,
      setBy: ctx.from.id
    });
    
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

  async handleTestNotifyCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    // Emit test notification event
    this.eventBus.emit('admin:test-notification-requested', {
      requestedBy: ctx.from.id,
      chatId: ctx.chat.id
    });
    
    ctx.reply('🔔 Test notification request sent. Check the notification group.');
  }

  async handleDailySummaryCommand(ctx) {
    if (!this.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ This command is for administrators only.');
    }
    
    try {
      const bookingPlugin = this.getOtherPlugin('booking');
      if (!bookingPlugin || !bookingPlugin.bookingSlotService) {
        return ctx.reply('❌ Booking service not available.');
      }
      
      const today = moment().tz('America/New_York').format('YYYY-MM-DD');
      const todayBookings = await bookingPlugin.bookingSlotService.getBookingsForDate(today);
      const maxSlotsPerDay = bookingPlugin.getConfig('maxSlotsPerDay', 8);
      const availableSlots = maxSlotsPerDay - todayBookings.length;
      
      let message = `📊 *Daily Booking Summary*\n\n`;
      message += `📅 Date: ${moment(today).format('MMM DD, YYYY')}\n`;
      message += `⏰ Business Hours: ${bookingPlugin.bookingSlotService.getBusinessHoursDisplay().hours}\n\n`;
      
      message += `*Slot Status:*\n`;
      message += `• Total Slots: ${maxSlotsPerDay}\n`;
      message += `• Booked: ${todayBookings.length}\n`;
      message += `• Available: ${availableSlots}\n\n`;
      
      if (todayBookings.length > 0) {
        message += `*Today's Appointments:*\n`;
        for (const booking of todayBookings) {
          const time = bookingPlugin.bookingSlotService.formatDateTime(booking.appointment_datetime);
          const service = await Service.query().findById(booking.service_id);
          const client = await User.query().findById(booking.client_id);
          
          message += `• ${time.time} - ${service?.name || 'Service'} (${client?.first_name} ${client?.last_name})\n`;
        }
      } else {
        message += `*No bookings for today yet.*`;
      }
      
      await ctx.replyWithMarkdown(message);
      
    } catch (error) {
      this.logger.error('Daily summary error:', error);
      ctx.reply('❌ Failed to generate daily summary.');
    }
  }

  async handleBusinessHoursCommand(ctx) {
    try {
      const bookingPlugin = this.getOtherPlugin('booking');
      if (!bookingPlugin || !bookingPlugin.bookingSlotService) {
        return ctx.reply('❌ Booking service not available.');
      }
      
      const hours = bookingPlugin.bookingSlotService.getBusinessHoursDisplay();
      const isOpen = bookingPlugin.bookingSlotService.isWithinBusinessHours();
      const nextDay = bookingPlugin.bookingSlotService.getNextBusinessDay();
      
      let message = `🕐 *Business Hours Configuration*\n\n`;
      message += `📍 Timezone: Eastern Time (EST/EDT)\n`;
      message += `⏰ Hours: ${hours.hours}\n`;
      message += `📅 Days: ${hours.days}\n\n`;
      
      message += `*Current Status:*\n`;
      if (isOpen) {
        message += `✅ Currently OPEN for bookings\n`;
      } else {
        message += `❌ Currently CLOSED\n`;
        message += `Next opening: ${nextDay.display} at ${nextDay.openingTime}\n`;
      }
      
      const config = bookingPlugin.config;
      message += `\n*Booking Rules:*\n`;
      message += `• Maximum ${config.maxSlotsPerDay || 8} appointments per day\n`;
      message += `• Book up to ${config.advanceBookingDays || 14} days in advance\n`;
      message += `• Minimum ${config.minAdvanceHours || 2} hours advance notice\n`;
      
      await ctx.replyWithMarkdown(message);
      
    } catch (error) {
      this.logger.error('Business hours error:', error);
      ctx.reply('❌ Error retrieving business hours.');
    }
  }

  async handleQuickApprove(ctx) {
    try {
      await ctx.answerCbQuery();
      
      if (!this.isAdmin(ctx.from.id)) {
        return;
      }
      
      const telegramId = ctx.match[1];
      const user = await User.findByTelegramId(telegramId);
      
      if (!user) {
        return ctx.reply(`❌ User ${telegramId} not found.`);
      }
      
      const authPlugin = this.getOtherPlugin('auth');
      if (authPlugin && authPlugin.isUserApproved(user)) {
        return ctx.reply(`✅ User ${telegramId} is already approved.`);
      }
      
      await user.approve(ctx.from.id.toString());
      
      if (authPlugin && authPlugin.referralCodeService) {
        await authPlugin.referralCodeService.approveUser(telegramId);
      }
      
      await ctx.reply(
        `✅ *Quick Approval Successful!*\n\n` +
        `User: ${user.first_name} ${user.last_name} (@${user.telegram_username || 'N/A'})\n` +
        `ID: \`${telegramId}\`\n\n` +
        `User has been notified and can now use the bot.`,
        { parse_mode: 'Markdown' }
      );
      
      // Notify the user
      await this.notifyUserApproval(user);
      
    } catch (error) {
      this.logger.error('Quick approve error:', error);
      await ctx.reply('❌ Error approving user.');
    }
  }

  async handleQuickDeny(ctx) {
    try {
      await ctx.answerCbQuery();
      
      if (!this.isAdmin(ctx.from.id)) {
        return;
      }
      
      const telegramId = ctx.match[1];
      const user = await User.findByTelegramId(telegramId);
      
      if (!user) {
        return ctx.reply(`❌ User ${telegramId} not found.`);
      }
      
      if (user.isDenied()) {
        return ctx.reply(`❌ User ${telegramId} is already denied.`);
      }
      
      await user.deny(ctx.from.id.toString());
      
      const authPlugin = this.getOtherPlugin('auth');
      if (authPlugin && authPlugin.referralCodeService) {
        await authPlugin.referralCodeService.denyUser(telegramId);
      }
      
      await ctx.reply(
        `❌ *User Denied*\n\n` +
        `User: ${user.first_name} ${user.last_name} (@${user.telegram_username || 'N/A'})\n` +
        `ID: \`${telegramId}\`\n\n` +
        `User has been denied access.`,
        { parse_mode: 'Markdown' }
      );
      
      // Notify the user
      await this.notifyUserDenial(user);
      
    } catch (error) {
      this.logger.error('Quick deny error:', error);
      await ctx.reply('❌ Error denying user.');
    }
  }

  isAdmin(telegramId) {
    const authPlugin = this.getOtherPlugin('auth');
    return authPlugin ? authPlugin.isAdmin(telegramId) : false;
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
      this.logger.error('Error notifying user about approval:', error);
    }
  }

  async notifyUserDenial(user) {
    try {
      if (!user.telegram_id) return;
      
      const message = `
❌ *Access Request Denied*

We're sorry, but your access request to Lodge Mobile Activations Bot has been denied.

If you believe this is an error or have questions, please contact support.
      `;
      
      await this.bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      this.logger.error('Error notifying user about denial:', error);
    }
  }

  async onHealthCheck() {
    try {
      // Test admin functionality by querying pending users
      await User.findPendingRequests(1);
      
      // Check if auth plugin is available
      const authPlugin = this.getOtherPlugin('auth');
      return !!authPlugin;
      
    } catch (error) {
      this.logger.error('Admin plugin health check failed:', error);
      return false;
    }
  }

  getMetrics() {
    const baseMetrics = super.getMetrics();
    
    return {
      ...baseMetrics,
      adminSpecific: {
        authPluginAvailable: !!this.getOtherPlugin('auth'),
        bookingPluginAvailable: !!this.getOtherPlugin('booking')
      }
    };
  }
}

module.exports = AdminPlugin;