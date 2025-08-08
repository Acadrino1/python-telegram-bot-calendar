const { Telegraf, Markup, session } = require('telegraf');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Service = require('../models/Service');
const Appointment = require('../models/Appointment');
const { getText, getUserLanguage, saveUserLanguage } = require('./translations');
const LiveSupportManager = require('./LiveSupportManager');

class EnhancedTelegramBot {
  constructor(config = {}) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.reminderScheduler = null;
    this.blockedDatesFile = path.join(__dirname, '../../blocked-dates.json');
    this.referralFile = path.join(__dirname, '../../referral-codes.json');
    
    // Configuration from environment variables with fallbacks
    this.config = {
      supportGroupId: config.supportGroupId || process.env.SUPPORT_GROUP_ID,
      supportEnabled: config.supportEnabled !== undefined ? config.supportEnabled : (process.env.SUPPORT_SYSTEM_ENABLED === 'true'),
      anonymizeUserData: config.anonymizeUserData !== undefined ? config.anonymizeUserData : (process.env.SUPPORT_ANONYMIZE_DATA !== 'false'),
      maxSupportTickets: config.maxSupportTickets || parseInt(process.env.SUPPORT_MAX_TICKETS) || 50,
      ticketTimeoutMinutes: config.ticketTimeoutMinutes || parseInt(process.env.SUPPORT_TICKET_TIMEOUT) || 30,
      autoEscalateMinutes: config.autoEscalateMinutes || parseInt(process.env.SUPPORT_AUTO_ESCALATE) || 60,
      adminUserIds: config.adminUserIds || (process.env.ADMIN_USER_IDS ? 
        process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [7930798268])
    };
    
    // Convert admin IDs to strings for compatibility
    this.adminIds = this.config.adminUserIds.map(id => id.toString());
    this.pendingSessions = new Map(); // Track users entering referral codes
    
    // Initialize Live Support Manager with proper configuration
    if (this.config.supportEnabled && this.config.supportGroupId) {
      this.supportManager = new LiveSupportManager(this.bot, {
        supportGroupId: this.config.supportGroupId,
        anonymizeUserData: this.config.anonymizeUserData,
        maxSupportTickets: this.config.maxSupportTickets,
        ticketTimeoutMinutes: this.config.ticketTimeoutMinutes,
        autoEscalateMinutes: this.config.autoEscalateMinutes
      });
    } else {
      console.log('⚠️  Live Support Manager not initialized - support system disabled or not configured');
      this.supportManager = null;
    }
    
    this.awaitingSupportInput = new Map(); // Track users providing support input
    
    // Session middleware for conversation state
    this.bot.use(session());
    
    // Global error handler
    this.bot.catch((err, ctx) => {
      console.error('Bot error:', err);
      if (ctx && ctx.reply) {
        ctx.reply('An error occurred. Please try again.').catch(() => {});
      }
    });
    
    this.setupCommands();
    this.setupHandlers();
  }

  setupCommands() {
    // Start command - now with invite-only system and language selection
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      const firstName = ctx.from.first_name || 'User';
      const referralData = this.getReferralData();
      
      // Check if user has language preference, if not, ask for it
      if (!referralData.userPreferences?.[userId]?.language) {
        const languageKeyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🇨🇦 English', 'lang_en')],
          [Markup.button.callback('⚜️ Français', 'lang_fr')]
        ]);
        
        await ctx.reply(
          '🌐 Please select your preferred language:\n🌐 Veuillez choisir votre langue préférée:',
          languageKeyboard
        );
        return;
      }
      
      const lang = getUserLanguage(userId, referralData);
      
      // Check if user is admin
      if (this.isAdmin(userId)) {
        const welcomeMessage = getText(lang, 'welcome_admin', { firstName }) + '\n\n' +
          getText(lang, 'commands_available') + '\n' +
          getText(lang, 'cmd_book') + '\n' +
          getText(lang, 'cmd_appointments') + '\n' +
          getText(lang, 'cmd_cancel') + '\n' +
          getText(lang, 'cmd_profiles') + '\n' +
          getText(lang, 'cmd_support') + '\n' +
          getText(lang, 'cmd_help') + '\n' +
          getText(lang, 'cmd_language') + '\n\n' +
          getText(lang, 'commands_admin') + '\n' +
          getText(lang, 'cmd_admin') + '\n' +
          getText(lang, 'cmd_requests') + '\n' +
          getText(lang, 'cmd_approve') + '\n' +
          getText(lang, 'cmd_createcode');
        await ctx.replyWithMarkdown(welcomeMessage);
        await this.registerUser(ctx);
        return;
      }
      
      // Check if user is already approved
      if (this.isUserApproved(userId)) {
        const welcomeMessage = getText(lang, 'welcome_back', { firstName }) + '\n\n' +
          getText(lang, 'commands_available') + '\n' +
          getText(lang, 'cmd_book') + '\n' +
          getText(lang, 'cmd_appointments') + '\n' +
          getText(lang, 'cmd_cancel') + '\n' +
          getText(lang, 'cmd_profiles') + '\n' +
          getText(lang, 'cmd_support') + '\n' +
          getText(lang, 'cmd_help') + '\n' +
          getText(lang, 'cmd_language');
        await ctx.replyWithMarkdown(welcomeMessage);
        await this.registerUser(ctx);
        return;
      }
      
      // New user - require invite
      const inviteMessage = getText(lang, 'access_required') + '\n\n' +
        getText(lang, 'enter_referral') + '\n\n' +
        getText(lang, 'request_access') + '\n\n' +
        getText(lang, 'access_note');
      
      await ctx.replyWithMarkdown(inviteMessage);
      
      // Set up session to wait for referral code
      this.pendingSessions.set(userId, {
        action: 'awaiting_code',
        timestamp: Date.now()
      });
    });

    // Request access command
    this.bot.command('request', async (ctx) => {
      const userId = ctx.from.id.toString();
      
      if (this.isUserApproved(userId)) {
        return ctx.reply('You already have access to the bot. Use /book to schedule appointments.');
      }
      
      // Save request
      const referralData = this.getReferralData();
      referralData.pendingRequests[userId] = {
        username: ctx.from.username || 'no_username',
        firstName: ctx.from.first_name || 'Unknown',
        lastName: ctx.from.last_name || '',
        requestedAt: new Date().toISOString()
      };
      this.saveReferralData(referralData);
      
      // Notify admins
      for (const adminId of this.adminIds) {
        try {
          await this.bot.telegram.sendMessage(adminId,
            `🔔 *New Access Request*\n\n` +
            `User: ${ctx.from.first_name} ${ctx.from.last_name || ''}\n` +
            `Username: @${ctx.from.username || 'none'}\n` +
            `ID: ${userId}\n\n` +
            `To approve: /approve ${userId}\n` +
            `To deny: /deny ${userId}`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.error('Error notifying admin:', err);
        }
      }
      
      await ctx.reply('✅ Your access request has been sent to the administrator.\n\nYou will be notified once your request is reviewed.');
    });
    
    // Book appointment command - now checks access
    this.bot.command('book', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      // Check access
      if (!this.isAdmin(userId) && !this.isUserApproved(userId)) {
        return ctx.reply(getText(lang, 'access_required') + ' ' + getText(lang, 'request_access'));
      }
      
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      ctx.session.booking.category = 'lodge_mobile';
      
      // Skip category selection and go straight to service selection
      try {
        // Get services for Lodge Mobile Activations
        const services = await Service.query()
          .where('is_active', true)
          .orderBy('name', 'asc')
          .limit(10);

        if (services.length === 0) {
          return ctx.reply(getText(lang, 'no_dates_available'));
        }

        const buttons = services.map(service => [
          Markup.button.callback(
            `${service.name}`, 
            `service_${service.id}`
          )
        ]);

        await ctx.reply(getText(lang, 'book_start'), {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
      } catch (error) {
        console.error('Error loading services:', error);
        ctx.reply('Sorry, something went wrong. Please try again.');
      }
    });

    // My appointments command
    this.bot.command('myappointments', async (ctx) => {
      try {
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          return ctx.reply('Please start the bot first with /start');
        }

        const appointments = await Appointment.query()
          .where('client_id', user.id)
          .whereIn('status', ['scheduled', 'confirmed'])
          .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
          .withGraphFetched('[provider, service]')
          .orderBy('appointment_datetime', 'asc')
          .limit(10);

        if (appointments.length === 0) {
          return ctx.reply('You have no upcoming appointments. Use /book to schedule one!');
        }

        let message = '*📅 Your Upcoming Appointments:*\n\n';
        appointments.forEach((apt, index) => {
          const date = moment(apt.appointment_datetime).format('MMM DD, YYYY');
          const time = moment(apt.appointment_datetime).format('h:mm A');  // 12-hour format with AM/PM
          
          message += `${index + 1}. *${apt.service ? apt.service.name : 'Service'}*\n`;
          message += `   📆 ${date} at ${time}\n`;
          message += `   🆔 ID: \`${apt.uuid}\`\n`;
          message += `   ❌ Cancel: /cancel ${apt.uuid}\n\n`;
        });
        
        message += `\n*You have ${appointments.length}/2 appointments booked*\n`;
        if (appointments.length >= 2) {
          message += `⚠️ *Booking limit reached - Cancel an appointment to book another*\n`;
        }
        message += `\n🗑️ *To cancel all appointments:* /cancelall`;

        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error('Error fetching appointments:', error);
        ctx.reply('Sorry, I couldn\'t fetch your appointments. Please try again later.');
      }
    });

    // Cancel all appointments command
    this.bot.command('cancelall', async (ctx) => {
      try {
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          return ctx.reply('Please start the bot first with /start');
        }

        // Get all upcoming appointments
        const appointments = await Appointment.query()
          .where('client_id', user.id)
          .whereIn('status', ['scheduled', 'confirmed'])
          .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'));

        if (appointments.length === 0) {
          return ctx.reply('You have no upcoming appointments to cancel.');
        }

        // Cancel all appointments and track affected dates
        let cancelledCount = 0;
        const affectedDates = new Set();
        
        for (const appointment of appointments) {
          await appointment.$query().patch({
            status: 'cancelled',
            cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            cancelled_by: user.id,
            cancellation_reason: 'All appointments cancelled via Telegram bot'
          });
          cancelledCount++;
          
          // Track affected dates for notifications
          const appointmentDate = moment(appointment.appointment_datetime).format('YYYY-MM-DD');
          affectedDates.add(appointmentDate);
        }

        await ctx.reply(
          `✅ Successfully cancelled ${cancelledCount} appointment${cancelledCount > 1 ? 's' : ''}.\n\n` +
          `Use /book to schedule new appointments when needed.`
        );
        
        // Broadcast slot availability for each affected date
        for (const date of affectedDates) {
          const remainingSlots = await this.getDateSlotCount(date);
          await this.broadcastSlotUpdate(date, remainingSlots, true);
        }
      } catch (error) {
        console.error('Error cancelling all appointments:', error);
        ctx.reply('Sorry, I couldn\'t cancel your appointments. Please try again.');
      }
    });

    // Cancel appointment command
    this.bot.command('cancel', async (ctx) => {
      const args = ctx.message.text.split(' ');
      
      if (args.length < 2) {
        return ctx.reply('Please provide the appointment ID. Example: /cancel ABC123');
      }

      try {
        const appointmentId = args[1];
        const user = await this.getUser(ctx.from.id);
        
        const appointment = await Appointment.query()
          .where('uuid', appointmentId)
          .where('client_id', user.id)
          .withGraphFetched('[service, provider]')
          .first();

        if (!appointment) {
          return ctx.reply('Appointment not found or you don\'t have permission to cancel it.');
        }

        await appointment.$query().patch({
          status: 'cancelled',
          cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
          cancelled_by: user.id,
          cancellation_reason: 'Cancelled via Telegram bot'
        });
        
        ctx.reply(`✅ Appointment ${appointmentId} has been cancelled successfully.`);
        
        // Broadcast that a slot is now available
        const appointmentDate = moment(appointment.appointment_datetime).format('YYYY-MM-DD');
        const remainingSlots = await this.getDateSlotCount(appointmentDate);
        await this.broadcastSlotUpdate(appointmentDate, remainingSlots, true);
        
        // Notify provider about cancellation
        await this.sendProviderNotification(
          appointment.provider,
          `❌ Appointment cancelled:\n` +
          `Service: ${appointment.service.name}\n` +
          `Client: ${user.first_name} ${user.last_name}\n` +
          `Date: ${moment(appointment.appointment_datetime).format('MMM DD, YYYY HH:mm')}`
        );
      } catch (error) {
        console.error('Error cancelling appointment:', error);
        ctx.reply('Sorry, I couldn\'t cancel the appointment. Please try again.');
      }
    });

    // Admin: Approve user command
    this.bot.command('approve', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        return ctx.reply('Please provide a user ID. Example: /approve 123456789');
      }

      const userIdToApprove = args[1];
      const referralData = this.getReferralData();
      
      // Add to approved users
      if (!referralData.approvedUsers.includes(userIdToApprove)) {
        referralData.approvedUsers.push(userIdToApprove);
      }
      
      // Remove from pending if exists
      delete referralData.pendingRequests[userIdToApprove];
      
      this.saveReferralData(referralData);
      
      // Notify the user
      try {
        await this.bot.telegram.sendMessage(userIdToApprove,
          '✅ *Access Granted!*\n\n' +
          'Your request has been approved. You now have full access to the Lodge Mobile Activations Bot.\n\n' +
          'Use /book to schedule your first appointment.',
          { parse_mode: 'Markdown' }
        );
        ctx.reply(`✅ User ${userIdToApprove} has been approved.`);
      } catch (err) {
        ctx.reply(`✅ User ${userIdToApprove} has been approved (could not send notification).`);
      }
    });

    // Admin: View requests command
    this.bot.command('requests', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const referralData = this.getReferralData();
      const pending = Object.entries(referralData.pendingRequests || {});
      
      if (pending.length === 0) {
        return ctx.reply('No pending access requests.');
      }
      
      let message = '*📋 Pending Access Requests:*\n\n';
      pending.forEach(([userId, data], index) => {
        message += `${index + 1}. ${data.firstName} ${data.lastName}\n`;
        message += `   Username: @${data.username}\n`;
        message += `   ID: \`${userId}\`\n`;
        message += `   Requested: ${new Date(data.requestedAt).toLocaleString()}\n`;
        message += `   Commands: /approve ${userId} or /deny ${userId}\n\n`;
      });
      
      await ctx.replyWithMarkdown(message);
    });

    // Admin: Deny user access command
    this.bot.command('deny', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        return ctx.reply('Please provide a user ID. Example: /deny 123456789');
      }

      const userIdToDeny = args[1];
      const referralData = this.getReferralData();
      
      // Remove from pending
      const requestData = referralData.pendingRequests[userIdToDeny];
      delete referralData.pendingRequests[userIdToDeny];
      
      this.saveReferralData(referralData);
      
      if (requestData) {
        // Notify the user
        try {
          await this.bot.telegram.sendMessage(userIdToDeny,
            '❌ *Access Request Denied*\n\n' +
            'Your request for access to the Lodge Mobile Activations Bot has been denied.\n\n' +
            'If you believe this is a mistake, please contact support.',
            { parse_mode: 'Markdown' }
          );
          ctx.reply(`✅ User ${userIdToDeny} has been denied access.`);
        } catch (err) {
          ctx.reply(`✅ User ${userIdToDeny} has been denied access (could not send notification).`);
        }
      } else {
        ctx.reply(`No pending request found for user ${userIdToDeny}.`);
      }
    });

    // Admin: Create referral code command
    this.bot.command('createcode', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 3) {
        return ctx.reply('Usage: /createcode CODE MAX_USES\nExample: /createcode SUMMER2025 100');
      }

      const code = args[1].toUpperCase();
      const maxUses = parseInt(args[2]);
      
      if (isNaN(maxUses) || maxUses < 1) {
        return ctx.reply('Invalid number of uses. Please provide a positive number.');
      }

      const referralData = this.getReferralData();
      referralData.codes[code] = {
        uses: 0,
        maxUses: maxUses,
        active: true,
        createdBy: ctx.from.id.toString(),
        createdAt: new Date().toISOString()
      };
      
      this.saveReferralData(referralData);
      
      await ctx.reply(`✅ Referral code created!\n\nCode: \`${code}\`\nMax uses: ${maxUses}\n\nShare this code with users to grant them access.`, 
        { parse_mode: 'Markdown' });
    });

    // Admin: View all users command
    this.bot.command('users', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      try {
        const User = require('../models/User');
        
        // Get all users from database
        const users = await User.query()
          .orderBy('created_at', 'desc');
        
        if (users.length === 0) {
          return ctx.reply('No registered users found.');
        }

        // Get referral data to check approved status
        const referralData = this.getReferralData();
        
        let message = '👥 REGISTERED USERS\n';
        message += '═══════════════════\n\n';
        let clientCount = 0;
        let providerCount = 0;
        
        users.forEach((user, index) => {
          const isApproved = user.telegram_id && (referralData.approvedUsers.includes(user.telegram_id) || this.isAdmin(user.telegram_id));
          const accessStatus = isApproved ? '✅' : '🔒';
          
          message += `${index + 1}. ${user.first_name} ${user.last_name}\n`;
          message += `   📱 Telegram ID: ${user.telegram_id || 'Not Available'}\n`;
          message += `   📧 Email: ${user.email}\n`;
          message += `   🔑 Role: ${user.role}\n`;
          message += `   ${accessStatus} Access: ${isApproved ? 'Approved' : 'Not Approved'}\n`;
          message += `   📅 Joined: ${moment(user.created_at).format('MMM DD, YYYY')}\n`;
          message += `   ─────────────────\n`;
          
          if (user.role === 'client') clientCount++;
          if (user.role === 'provider') providerCount++;
        });
        
        message += `\n📊 SUMMARY\n`;
        message += `═══════════════════\n`;
        message += `Total Users: ${users.length}\n`;
        message += `Clients: ${clientCount}\n`;
        message += `Providers: ${providerCount}\n`;
        message += `Approved: ${referralData.approvedUsers.length}`;
        
        // Split message if too long
        if (message.length > 4000) {
          const chunks = message.match(/.{1,4000}/g);
          for (const chunk of chunks) {
            await ctx.reply(chunk);
          }
        } else {
          await ctx.reply(message);
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        ctx.reply('Sorry, an error occurred while fetching users.');
      }
    });

    // Admin: Block date command
    this.bot.command('blockdate', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        return ctx.reply('Please provide a date to block. Example: /blockdate 2025-08-15');
      }

      const dateStr = args[1];
      const date = moment(dateStr, 'YYYY-MM-DD', true);
      
      if (!date.isValid()) {
        return ctx.reply('Invalid date format. Please use YYYY-MM-DD format. Example: /blockdate 2025-08-15');
      }

      if (date.isBefore(moment().startOf('day'))) {
        return ctx.reply('Cannot block past dates.');
      }

      try {
        const blockedDates = this.getBlockedDates();
        const dateFormatted = date.format('YYYY-MM-DD');
        
        if (blockedDates.includes(dateFormatted)) {
          return ctx.reply(`Date ${dateFormatted} is already blocked.`);
        }

        blockedDates.push(dateFormatted);
        this.saveBlockedDates(blockedDates);

        // Cancel any existing appointments on this date
        const appointments = await Appointment.query()
          .where('appointment_datetime', '>=', `${dateFormatted} 00:00:00`)
          .where('appointment_datetime', '<=', `${dateFormatted} 23:59:59`)
          .whereIn('status', ['scheduled', 'confirmed']);

        let cancelledCount = 0;
        for (const apt of appointments) {
          await apt.$query().patch({
            status: 'cancelled',
            cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            cancellation_reason: 'Date blocked by administrator'
          });
          cancelledCount++;

          // Notify client
          const client = await User.query().findById(apt.client_id);
          if (client && client.telegram_id) {
            try {
              await this.bot.telegram.sendMessage(
                client.telegram_id,
                `⚠️ *Important Notice*\n\nYour appointment on ${dateFormatted} has been cancelled due to scheduling conflicts.\n\nPlease use /book to select a different date.\n\nWe apologize for any inconvenience.`,
                { parse_mode: 'Markdown' }
              );
            } catch (err) {
              console.error('Error notifying client:', err);
            }
          }
        }

        let message = `✅ Date ${dateFormatted} has been blocked.`;
        if (cancelledCount > 0) {
          message += `\n\n${cancelledCount} appointment(s) were cancelled and clients have been notified.`;
        }
        
        ctx.reply(message);
      } catch (error) {
        console.error('Error blocking date:', error);
        ctx.reply('Sorry, an error occurred while blocking the date.');
      }
    });

    // Admin: Unblock date command
    this.bot.command('unblockdate', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        return ctx.reply('Please provide a date to unblock. Example: /unblockdate 2025-08-15');
      }

      const dateStr = args[1];
      const date = moment(dateStr, 'YYYY-MM-DD', true);
      
      if (!date.isValid()) {
        return ctx.reply('Invalid date format. Please use YYYY-MM-DD format.');
      }

      try {
        const blockedDates = this.getBlockedDates();
        const dateFormatted = date.format('YYYY-MM-DD');
        const index = blockedDates.indexOf(dateFormatted);
        
        if (index === -1) {
          return ctx.reply(`Date ${dateFormatted} is not blocked.`);
        }

        blockedDates.splice(index, 1);
        this.saveBlockedDates(blockedDates);
        
        ctx.reply(`✅ Date ${dateFormatted} has been unblocked. Customers can now book appointments on this date.`);
      } catch (error) {
        console.error('Error unblocking date:', error);
        ctx.reply('Sorry, an error occurred while unblocking the date.');
      }
    });

    // Admin: View blocked dates command
    this.bot.command('blockeddays', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      try {
        const blockedDates = this.getBlockedDates();
        
        if (blockedDates.length === 0) {
          return ctx.reply('No dates are currently blocked.');
        }

        const sortedDates = blockedDates.sort();
        let message = '*🚫 Blocked Dates:*\n\n';
        
        sortedDates.forEach((date, index) => {
          const dateObj = moment(date);
          const dayName = dateObj.format('dddd');
          message += `${index + 1}. ${date} (${dayName})\n`;
        });
        
        message += '\n*To unblock a date:* /unblockdate YYYY-MM-DD';
        
        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error('Error fetching blocked dates:', error);
        ctx.reply('Sorry, an error occurred while fetching blocked dates.');
      }
    });

    // Admin: View booked slots command
    this.bot.command('viewslots', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      try {
        const commandParts = ctx.message.text.split(' ');
        let targetDate = null;
        
        // Check if specific date was provided
        if (commandParts.length > 1) {
          targetDate = commandParts[1];
          // Validate date format
          if (!moment(targetDate, 'YYYY-MM-DD', true).isValid()) {
            return ctx.reply('Invalid date format. Please use YYYY-MM-DD (e.g., /viewslots 2025-08-20)');
          }
        }

        // Get provider
        const provider = await User.query()
          .where('role', 'provider')
          .where('is_active', true)
          .first();
        
        if (!provider) {
          return ctx.reply('No active provider found.');
        }

        // Build query for appointments
        let appointmentsQuery = Appointment.query()
          .where('provider_id', provider.id)
          .whereIn('status', ['scheduled', 'confirmed'])
          .withGraphFetched('[client]')
          .orderBy('appointment_datetime', 'asc');

        // Filter by specific date if provided
        if (targetDate) {
          appointmentsQuery = appointmentsQuery
            .where('appointment_datetime', '>=', `${targetDate} 00:00:00`)
            .where('appointment_datetime', '<=', `${targetDate} 23:59:59`);
        } else {
          // Show next 14 days by default
          const startDate = moment().format('YYYY-MM-DD 00:00:00');
          const endDate = moment().add(14, 'days').format('YYYY-MM-DD 23:59:59');
          appointmentsQuery = appointmentsQuery
            .where('appointment_datetime', '>=', startDate)
            .where('appointment_datetime', '<=', endDate);
        }

        const appointments = await appointmentsQuery;

        if (appointments.length === 0) {
          if (targetDate) {
            return ctx.reply(`No appointments found for ${targetDate}`);
          } else {
            return ctx.reply('No appointments found for the next 14 days.');
          }
        }

        // Group appointments by date
        const appointmentsByDate = {};
        appointments.forEach(apt => {
          const date = moment(apt.appointment_datetime).format('YYYY-MM-DD');
          if (!appointmentsByDate[date]) {
            appointmentsByDate[date] = [];
          }
          appointmentsByDate[date].push(apt);
        });

        // Build message
        let message = targetDate 
          ? `*📅 Appointments for ${targetDate}:*\n\n`
          : '*📅 Booked Appointments (Next 14 Days):*\n\n';

        Object.keys(appointmentsByDate).sort().forEach(date => {
          const dateObj = moment(date);
          const dayName = dateObj.format('dddd');
          const apts = appointmentsByDate[date];
          
          message += `*${date} (${dayName})* - ${apts.length}/5 slots booked\n`;
          
          apts.forEach(apt => {
            const time = moment(apt.appointment_datetime).format('HH:mm');
            const customerName = `${apt.customer_first_name || 'Unknown'} ${apt.customer_last_name || ''}`.trim();
            const username = apt.client ? 
              (apt.client.username ? `@${apt.client.username}` : `User ID: ${apt.client.telegram_id}`) : 
              'Unknown User';
            
            message += `  • ${time} - ${customerName}\n`;
            message += `    └─ Booked by: ${username}\n`;
            if (apt.customer_email) {
              message += `    └─ Email: ${apt.customer_email}\n`;
            }
          });
          
          message += '\n';
        });

        // Add summary
        const totalAppointments = appointments.length;
        const uniqueDates = Object.keys(appointmentsByDate).length;
        message += `\n*Summary:*\n`;
        message += `• Total appointments: ${totalAppointments}\n`;
        message += `• Days with bookings: ${uniqueDates}\n`;
        message += `• Average per day: ${(totalAppointments / uniqueDates).toFixed(1)}\n`;

        if (!targetDate) {
          message += '\n*Tip:* Use /viewslots YYYY-MM-DD to view a specific date.';
        }

        // Split message if too long
        if (message.length > 4000) {
          const chunks = message.match(/.{1,4000}/g);
          for (const chunk of chunks) {
            await ctx.replyWithMarkdown(chunk);
          }
        } else {
          await ctx.replyWithMarkdown(message);
        }

      } catch (error) {
        console.error('Error fetching appointments:', error);
        ctx.reply('An error occurred while fetching appointments.');
      }
    });

    // View profile referrals command (admin only)
    this.bot.command('viewprofiles', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }
      
      const referralData = this.getReferralData();
      const profileReferrals = referralData.profileReferrals || {};
      const referralEntries = Object.entries(profileReferrals);
      
      if (referralEntries.length === 0) {
        return ctx.reply('No profile referrals found.');
      }
      
      let message = '*📋 Profile Referrals:*\n\n';
      
      // Sort by timestamp (newest first)
      referralEntries.sort((a, b) => {
        return new Date(b[1].timestamp) - new Date(a[1].timestamp);
      });
      
      // Display last 10 referrals
      const recentReferrals = referralEntries.slice(0, 10);
      
      recentReferrals.forEach(([orderId, data]) => {
        const date = new Date(data.timestamp).toLocaleString();
        message += `📱 Order: \`${orderId}\`\n`;
        message += `👤 Customer: ${data.firstName} ${data.lastName}\n`;
        message += `🆔 Username: @${data.username}\n`;
        message += `📅 Time: ${date}\n`;
        message += `📍 Status: ${data.status || 'pending'}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      });
      
      if (referralEntries.length > 10) {
        message += `\n\nShowing last 10 of ${referralEntries.length} total referrals`;
      }
      
      await ctx.replyWithMarkdown(message);
    });
    
    // Profile referral statistics command (admin only)
    this.bot.command('profilestats', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }
      
      const referralData = this.getReferralData();
      const profileReferrals = referralData.profileReferrals || {};
      const referralEntries = Object.entries(profileReferrals);
      
      // Calculate statistics
      const totalReferrals = referralEntries.length;
      
      if (totalReferrals === 0) {
        return ctx.replyWithMarkdown('*📊 Profile Referral Statistics:*\n\nNo referrals sent to vendor yet.');
      }
      
      // Get date-based statistics
      const now = new Date();
      const today = now.toDateString();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      
      let todayCount = 0;
      let monthCount = 0;
      let yearCount = 0;
      let uniqueUsers = new Set();
      let statusCounts = { pending: 0, completed: 0, cancelled: 0 };
      
      referralEntries.forEach(([orderId, data]) => {
        const referralDate = new Date(data.timestamp);
        uniqueUsers.add(data.userId);
        
        // Status tracking
        const status = data.status || 'pending';
        if (statusCounts[status] !== undefined) {
          statusCounts[status]++;
        } else {
          statusCounts[status] = 1;
        }
        
        // Date tracking
        if (referralDate.toDateString() === today) {
          todayCount++;
        }
        if (referralDate.getMonth() === thisMonth && referralDate.getFullYear() === thisYear) {
          monthCount++;
        }
        if (referralDate.getFullYear() === thisYear) {
          yearCount++;
        }
      });
      
      // Get most recent referral
      const mostRecent = referralEntries[0];
      const lastReferralDate = mostRecent ? new Date(mostRecent[1].timestamp).toLocaleString() : 'N/A';
      
      // Build statistics message
      const statsMessage = `*📊 Profile Referral Statistics*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*📈 Total Overview:*
• Total Referrals Sent: *${totalReferrals}*
• Unique Customers: *${uniqueUsers.size}*
• Average per Customer: *${(totalReferrals / uniqueUsers.size).toFixed(1)}*

*📅 Time-Based Stats:*
• Today: *${todayCount}* referrals
• This Month: *${monthCount}* referrals
• This Year: *${yearCount}* referrals

*📍 Status Breakdown:*
• Pending: *${statusCounts.pending}*
• Completed: *${statusCounts.completed || 0}*
• Cancelled: *${statusCounts.cancelled || 0}*

*⏰ Last Referral:*
${lastReferralDate}

*💼 Vendor Information:*
• Vendor: @bands2zoro
• Handler ID: ${referralData.profileHandlerId || 'Not configured'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use /viewprofiles to see recent referrals`;
      
      await ctx.replyWithMarkdown(statsMessage);
    });
    
    // Set bands2zoro ID command (admin only)
    this.bot.command('setprofilehandler', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }
      
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length !== 1) {
        return ctx.reply('Usage: /setprofilehandler USER_ID\n\nExample: /setprofilehandler 123456789\n\nNote: The user must have started a chat with the bot first.');
      }
      
      const handlerId = args[0];
      
      // Save the handler ID in referral data
      const referralData = this.getReferralData();
      referralData.profileHandlerId = handlerId;
      this.saveReferralData(referralData);
      
      await ctx.reply(`✅ Profile handler ID set to: ${handlerId}\n\nProfile referrals will now be sent directly to this user.`);
    });
    
    // Admin help command
    this.bot.command('admin', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const adminHelp = `
*🔧 Admin Commands:*

*User Management:*
• /users - View all registered users
• /requests - View pending access requests
• /approve ID - Approve user access
• /deny ID - Deny user access
• /createcode CODE MAXUSES - Create referral code

*Profile Management:*
• /profilestats - View vendor referral statistics
• /viewprofiles - View profile referral history
• /setprofilehandler ID - Set profile handler user ID

*Date Management:*
• /blockdate YYYY-MM-DD - Block a date
• /unblockdate YYYY-MM-DD - Unblock a date
• /blockeddays - View all blocked dates

*Appointment Management:*
• /viewslots - View all booked slots by date
• /viewslots YYYY-MM-DD - View slots for specific date

*Support Management:*
• /setsupportgroup GROUP_ID - Configure support group
• /addsupportagent USER_ID NAME - Add support agent
• /removesupportagent USER_ID - Remove support agent
• /supportstats - View support statistics
• /viewtickets - View open tickets
• /blocksupportuser USER_ID - Block user from support
• /unblocksupportuser USER_ID - Unblock user from support

*Examples:*
• /approve 123456789
• /createcode SUMMER2025 100
• /blockdate 2025-08-20
• /setprofilehandler 987654321
• /setsupportgroup -1001234567890
• /addsupportagent 123456789 John Doe
• /blocksupportuser 987654321

*Notes:*
- New users require referral code or approval
- Blocking dates cancels all appointments
- Clients are notified automatically
- Profile handler must start chat with bot first
- Support group ID is negative number from group settings
      `;
      
      await ctx.replyWithMarkdown(adminHelp);
    });

    // Admin: Set support group command
    this.bot.command('setsupportgroup', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        return ctx.reply('Usage: /setsupportgroup GROUP_ID\n\nExample: /setsupportgroup -1001234567890');
      }

      const groupId = args[1];
      if (!groupId.startsWith('-100')) {
        return ctx.reply('❌ Invalid group ID format. Group IDs should start with -100...');
      }

      try {
        // Update the live support manager config
        if (this.liveSupport) {
          this.liveSupport.supportGroupId = groupId;
        }

        await ctx.reply(`✅ Support group configured successfully!\n\nGroup ID: ${groupId}\n\nSupport messages will now be forwarded to this group.`);
      } catch (error) {
        console.error('Error setting support group:', error);
        await ctx.reply('❌ Error configuring support group. Please try again.');
      }
    });

    // Admin: Add support agent command
    this.bot.command('addsupportagent', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length < 3) {
        return ctx.reply('Usage: /addsupportagent USER_ID NAME\n\nExample: /addsupportagent 123456789 John Doe');
      }

      const userId = args[1];
      const userName = args.slice(2).join(' ');

      if (!/^\d+$/.test(userId)) {
        return ctx.reply('❌ Invalid user ID. Must be numeric.');
      }

      try {
        if (this.liveSupport) {
          const success = this.liveSupport.addSupportAgent(userId, userName);
          if (success) {
            await ctx.reply(`✅ Support agent added successfully!\n\n👤 Name: ${userName}\n🆔 ID: ${userId}\n📊 Status: Available`);
          } else {
            await ctx.reply('❌ Agent already exists or error occurred.');
          }
        } else {
          await ctx.reply('❌ Support system not initialized.');
        }
      } catch (error) {
        console.error('Error adding support agent:', error);
        await ctx.reply('❌ Error adding support agent. Please try again.');
      }
    });

    // Admin: Remove support agent command
    this.bot.command('removesupportagent', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        return ctx.reply('Usage: /removesupportagent USER_ID\n\nExample: /removesupportagent 123456789');
      }

      const userId = args[1];

      if (!/^\d+$/.test(userId)) {
        return ctx.reply('❌ Invalid user ID. Must be numeric.');
      }

      try {
        if (this.liveSupport) {
          const success = this.liveSupport.removeSupportAgent(userId);
          if (success) {
            await ctx.reply(`✅ Support agent removed successfully!\n\n🆔 User ID: ${userId}`);
          } else {
            await ctx.reply('❌ Agent not found or error occurred.');
          }
        } else {
          await ctx.reply('❌ Support system not initialized.');
        }
      } catch (error) {
        console.error('Error removing support agent:', error);
        await ctx.reply('❌ Error removing support agent. Please try again.');
      }
    });

    // Admin: View support statistics command
    this.bot.command('supportstats', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      try {
        if (this.liveSupport) {
          const stats = this.liveSupport.getStatistics();
          const agents = this.liveSupport.getAgents();

          const statsMessage = `📊 *Support System Statistics*

🎫 *Tickets:*
• Total: ${stats.totalTickets}
• Open: ${stats.openTickets}
• Closed: ${stats.closedTickets}
• Today: ${stats.todayTickets}

👥 *Agents:*
• Total: ${stats.totalAgents}
• Available: ${stats.availableAgents}
• Busy: ${stats.totalAgents - stats.availableAgents}

🏢 *System:*
• Support Group: ${this.liveSupport.supportGroupId || 'Not configured'}
• Rate Limit: ${this.liveSupport.maxTicketsPerDay} tickets/day
• Message Limit: ${this.liveSupport.maxMessagesPerHour} messages/hour`;

          await ctx.replyWithMarkdown(statsMessage);
        } else {
          await ctx.reply('❌ Support system not initialized.');
        }
      } catch (error) {
        console.error('Error getting support stats:', error);
        await ctx.reply('❌ Error retrieving support statistics.');
      }
    });

    // Admin: View open tickets command
    this.bot.command('viewtickets', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      try {
        if (this.liveSupport) {
          const tickets = this.liveSupport.getTickets();
          const openTickets = Object.values(tickets.tickets).filter(t => t.status === 'open');

          if (openTickets.length === 0) {
            await ctx.reply('✅ No open support tickets.');
            return;
          }

          let message = `🎫 *Open Support Tickets (${openTickets.length})*\n\n`;

          openTickets.forEach((ticket, index) => {
            const createdAt = new Date(ticket.createdAt).toLocaleString();
            const lastActivity = new Date(ticket.lastActivity).toLocaleString();
            const agentInfo = ticket.assignedAgent ? `👤 Agent: ${ticket.assignedAgent}` : '👤 Unassigned';
            
            message += `${index + 1}. *${ticket.ticketId}*\n`;
            message += `   📅 Created: ${createdAt}\n`;
            message += `   ⏰ Last Activity: ${lastActivity}\n`;
            message += `   ${agentInfo}\n`;
            message += `   🔹 Priority: ${ticket.priority}\n\n`;
          });

          // Split message if too long
          if (message.length > 4000) {
            const chunks = message.match(/.{1,4000}/g);
            for (const chunk of chunks) {
              await ctx.replyWithMarkdown(chunk);
            }
          } else {
            await ctx.replyWithMarkdown(message);
          }
        } else {
          await ctx.reply('❌ Support system not initialized.');
        }
      } catch (error) {
        console.error('Error getting tickets:', error);
        await ctx.reply('❌ Error retrieving tickets.');
      }
    });

    // Admin: Block user from support command
    this.bot.command('blocksupportuser', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        return ctx.reply('Usage: /blocksupportuser USER_ID\n\nExample: /blocksupportuser 123456789');
      }

      const userId = args[1];

      if (!/^\d+$/.test(userId)) {
        return ctx.reply('❌ Invalid user ID. Must be numeric.');
      }

      try {
        if (this.liveSupport) {
          const rateLimits = this.liveSupport.getRateLimits();
          
          if (!rateLimits.blockedUsers.includes(userId)) {
            rateLimits.blockedUsers.push(userId);
            this.liveSupport.saveRateLimits(rateLimits);
            
            await ctx.reply(`🚫 User blocked from support successfully!\n\n🆔 User ID: ${userId}\n\nThe user will not be able to create new support tickets.`);
          } else {
            await ctx.reply('ℹ️ User is already blocked from support.');
          }
        } else {
          await ctx.reply('❌ Support system not initialized.');
        }
      } catch (error) {
        console.error('Error blocking user:', error);
        await ctx.reply('❌ Error blocking user from support.');
      }
    });

    // Admin: Unblock user from support command
    this.bot.command('unblocksupportuser', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('This command is for administrators only.');
      }

      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        return ctx.reply('Usage: /unblocksupportuser USER_ID\n\nExample: /unblocksupportuser 123456789');
      }

      const userId = args[1];

      if (!/^\d+$/.test(userId)) {
        return ctx.reply('❌ Invalid user ID. Must be numeric.');
      }

      try {
        if (this.liveSupport) {
          const rateLimits = this.liveSupport.getRateLimits();
          
          const index = rateLimits.blockedUsers.indexOf(userId);
          if (index > -1) {
            rateLimits.blockedUsers.splice(index, 1);
            this.liveSupport.saveRateLimits(rateLimits);
            
            await ctx.reply(`✅ User unblocked from support successfully!\n\n🆔 User ID: ${userId}\n\nThe user can now create support tickets again.`);
          } else {
            await ctx.reply('ℹ️ User was not blocked from support.');
          }
        } else {
          await ctx.reply('❌ Support system not initialized.');
        }
      } catch (error) {
        console.error('Error unblocking user:', error);
        await ctx.reply('❌ Error unblocking user from support.');
      }
    });

    // Language command - allows users to change language preference
    this.bot.command('language', async (ctx) => {
      const languageKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇨🇦 English', 'lang_change_en')],
        [Markup.button.callback('⚜️ Français', 'lang_change_fr')]
      ]);
      
      await ctx.reply(
        '🌐 Please select your preferred language:\n🌐 Veuillez choisir votre langue préférée:',
        languageKeyboard
      );
    });
    
    // Support command - opens live support chat
    this.bot.command('support', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      if (!this.liveSupport) {
        await ctx.reply(getText(lang, 'supportNotAvailable'));
        return;
      }
      
      try {
        // Check for existing active ticket
        const activeTicket = this.liveSupport.getActiveTicket(userId);
        
        if (activeTicket) {
          await ctx.replyWithMarkdown(
            getText(lang, 'support_continue_prompt'),
            Markup.inlineKeyboard([
              [Markup.button.callback('💬 Continue Chat', 'support_continue')],
              [Markup.button.callback('✅ Close Ticket', 'support_end')]
            ])
          );
          return;
        }
        
        // Check rate limits
        const rateCheck = await this.liveSupport.checkRateLimit(userId);
        
        if (!rateCheck.allowed) {
          if (rateCheck.reason === 'daily_limit') {
            await ctx.reply(getText(lang, 'support_rate_limit_daily', { limit: this.liveSupport.maxTicketsPerDay }));
          } else if (rateCheck.reason === 'hourly_limit') {
            await ctx.reply(getText(lang, 'support_rate_limit_hourly'));
          } else if (rateCheck.reason === 'blocked') {
            await ctx.reply(getText(lang, 'support_error'));
          }
          return;
        }
        
        // Show welcome message with prompt
        await ctx.replyWithMarkdown(
          getText(lang, 'support_welcome'),
          Markup.forceReply()
        );
        
        // Set session state to await support message
        this.pendingSessions.set(userId, {
          action: 'awaiting_support_message',
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.error('Error in support command:', error);
        await ctx.reply(getText(lang, 'support_error'));
      }
    });
    
    // Profiles command - requests profile setup assistance
    this.bot.command('profiles', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      // Generate unique order ID with letters only
      const generateLetterCode = (length) => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < length; i++) {
          result += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        return result;
      };
      
      // Create unique ID: PROF-XXXX-XXXX (8 random letters)
      const orderId = `PROF-${generateLetterCode(4)}-${generateLetterCode(4)}`;
      
      // Store profile referral in data
      if (!referralData.profileReferrals) {
        referralData.profileReferrals = {};
      }
      
      referralData.profileReferrals[orderId] = {
        userId: userId,
        username: ctx.from.username || 'no_username',
        firstName: ctx.from.first_name || 'Unknown',
        lastName: ctx.from.last_name || '',
        timestamp: new Date().toISOString(),
        status: 'pending'
      };
      
      this.saveReferralData(referralData);
      
      // Send notification to @bands2zoro
      const usernameText = ctx.from.username ? `@${ctx.from.username}` : 'No username';
      const referralMessage = `💳 *New Profile Purchase Inquiry*\n\n` +
        `📱 Order ID: \`${orderId}\`\n` +
        `👤 Customer: ${ctx.from.first_name} ${ctx.from.last_name || ''}\n` +
        `🆔 Username: ${usernameText}\n` +
        `🔢 User ID: ${userId}\n` +
        `📅 Time: ${new Date().toLocaleString()}\n\n` +
        `This customer wants to purchase profiles. Please contact them with available options and pricing.\n\n` +
        `Referred by Lodge Mobile Activations Bot`;
      
      // Get the profile handler ID from saved data or use hardcoded ID for @bands2zoro
      const bands2zoroId = referralData.profileHandlerId || '6792901572';
      
      let messageSent = false;
      
      // Try to send to @bands2zoro if ID is configured
      if (bands2zoroId) {
        try {
          await this.bot.telegram.sendMessage(bands2zoroId, referralMessage, {
            parse_mode: 'Markdown'
          });
          messageSent = true;
        } catch (error) {
          console.error('Error sending to @bands2zoro:', error);
        }
      }
      
      // If not sent to @bands2zoro, notify admins
      if (!messageSent) {
        for (const adminId of this.adminIds) {
          try {
            await this.bot.telegram.sendMessage(adminId,
              `💳 *Profile Purchase Referral*\n\n` +
              `Please forward to @bands2zoro:\n\n` +
              referralMessage,
              { parse_mode: 'Markdown' }
            );
            messageSent = true;
          } catch (adminErr) {
            console.error('Error notifying admin:', adminErr);
          }
        }
      }
      
      // Send confirmation to user
      await ctx.replyWithMarkdown(
        getText(lang, 'profile_referral_sent', { orderId })
      );
    });
    
    // Help command
    this.bot.command('help', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      let helpMessage = getText(lang, 'commands_available') + '\n' +
        getText(lang, 'cmd_book') + '\n' +
        getText(lang, 'cmd_appointments') + '\n' +
        getText(lang, 'cmd_cancel') + '\n' +
        getText(lang, 'cmd_profiles') + '\n' +
        getText(lang, 'cmd_support') + '\n' +
        getText(lang, 'cmd_help') + '\n' +
        getText(lang, 'cmd_language');

      // Add admin section if user is admin
      if (this.isAdmin(ctx.from.id)) {
        helpMessage += '\n\n' +
          getText(lang, 'commands_admin') + '\n' +
          getText(lang, 'cmd_admin') + '\n' +
          '/viewslots - View all booked appointment slots\n' +
          '/blockdate YYYY-MM-DD - Block a specific date\n' +
          '/unblockdate YYYY-MM-DD - Unblock a date\n' +
          '/blockeddays - View all blocked dates\n\n' +
          '🎧 *Support Management:*\n' +
          '/supportstats - View support statistics\n' +
          '/viewtickets - View open tickets\n' +
          '/setsupportgroup GROUP_ID - Configure support group';
      }
      
      await ctx.replyWithMarkdown(helpMessage);
    });
  }

  setupHandlers() {
    // Handle language selection
    this.bot.action('lang_en', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      saveUserLanguage(userId, 'en', referralData);
      this.saveReferralData(referralData);
      
      await ctx.answerCbQuery();
      await ctx.reply(getText('en', 'language_selected'));
      
      // Continue with start flow
      const startCommand = { from: ctx.from, message: { text: '/start' } };
      return this.bot.handleUpdate({ message: startCommand });
    });
    
    this.bot.action('lang_fr', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      saveUserLanguage(userId, 'fr', referralData);
      this.saveReferralData(referralData);
      
      await ctx.answerCbQuery();
      await ctx.reply(getText('fr', 'language_selected'));
      
      // Continue with start flow
      const startCommand = { from: ctx.from, message: { text: '/start' } };
      return this.bot.handleUpdate({ message: startCommand });
    });
    
    // Handle language change (when user already has a preference)
    this.bot.action('lang_change_en', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      saveUserLanguage(userId, 'en', referralData);
      this.saveReferralData(referralData);
      
      await ctx.answerCbQuery();
      await ctx.reply(getText('en', 'language_changed'));
    });
    
    this.bot.action('lang_change_fr', async (ctx) => {
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      saveUserLanguage(userId, 'fr', referralData);
      this.saveReferralData(referralData);
      
      await ctx.answerCbQuery();
      await ctx.reply(getText('fr', 'language_changed'));
    });
    
    // Handle continue for new registration
    this.bot.action('continue_new_registration', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      if (!ctx.session.booking) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Start info collection with combined message and ForceReply
      await ctx.editMessageText('✅ Let\'s collect your information for the new registration.');
      await ctx.reply(getText(lang, 'info_collection_start'), {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'John'
        }
      });
    });
    
    // Handle info confirmation
    this.bot.action('info_confirm', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      if (!ctx.session.booking || !ctx.session.booking.customerInfo) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Info confirmed, proceed to date selection
      ctx.session.booking.infoStep = null; // Clear info step
      await ctx.reply(getText(lang, 'info_saved'));
      await this.proceedToDateSelection(ctx);
    });
    
    // Handle info edit request
    this.bot.action('info_edit', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      if (!ctx.session.booking) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Start over with info collection
      ctx.session.booking.customerInfo = {};
      ctx.session.booking.infoStep = 'first_name';
      await ctx.reply(getText(lang, 'enter_first_name'), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'John'
        }
      });
    });
    
    // Handle province selection
    this.bot.action(/select_province_(.+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const provinceCode = ctx.match[1];
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking;
      if (!booking) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Save province and move to postal code
      booking.customerInfo.province = provinceCode;
      booking.infoStep = 'postal_code';
      
      await ctx.editMessageText(`✅ *Province:* ${provinceCode}\nSaved successfully`, { parse_mode: 'Markdown' });
      await ctx.reply(getText(lang, 'enter_postal_code'), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'M5V 3A8'
        }
      });
    });
    
    // Handle field confirmation
    this.bot.action(/confirm_field_(.+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const field = ctx.match[1];
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking;
      if (!booking || !booking.tempValue) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Save the confirmed value
      switch (field) {
        case 'first_name':
          booking.customerInfo.firstName = booking.tempValue;
          booking.infoStep = 'middle_name';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *First Name:* ${booking.customerInfo.firstName}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_middle_name'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'Middle name or type "skip"'
            }
          });
          break;
        case 'middle_name':
          booking.customerInfo.middleName = booking.tempValue;
          booking.infoStep = 'last_name';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Middle Name:* ${booking.customerInfo.middleName}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_last_name'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'Smith'
            }
          });
          break;
        case 'last_name':
          booking.customerInfo.lastName = booking.tempValue;
          booking.infoStep = 'dob';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Last Name:* ${booking.customerInfo.lastName}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_dob'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'MM/DD/YYYY'
            }
          });
          break;
        case 'dob':
          booking.customerInfo.dob = booking.tempValue;
          booking.infoStep = 'street_number';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Date of Birth:* ${booking.customerInfo.dob}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_street_number'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: '123'
            }
          });
          break;
        case 'street_number':
          booking.customerInfo.streetNumber = booking.tempValue;
          booking.infoStep = 'street_address';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Street Number:* ${booking.customerInfo.streetNumber}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_street_address'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'Main Street'
            }
          });
          break;
        case 'street_address':
          booking.customerInfo.streetAddress = booking.tempValue;
          booking.infoStep = 'city';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Street Address:* ${booking.customerInfo.streetAddress}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_city'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'Toronto'
            }
          });
          break;
        case 'city':
          booking.customerInfo.city = booking.tempValue;
          booking.infoStep = 'province';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *City:* ${booking.customerInfo.city}\nSaved successfully`, { parse_mode: 'Markdown' });
          
          // Show province selection buttons
          const provinces = [
            ['AB - Alberta', 'BC - British Columbia'],
            ['MB - Manitoba', 'NB - New Brunswick'],
            ['NL - Newfoundland', 'NT - Northwest Territories'],
            ['NS - Nova Scotia', 'NU - Nunavut'],
            ['ON - Ontario', 'PE - Prince Edward Island'],
            ['QC - Quebec', 'SK - Saskatchewan'],
            ['YT - Yukon']
          ];
          
          const provinceButtons = provinces.map(row => 
            row.map(prov => {
              const code = prov.split(' - ')[0];
              return Markup.button.callback(prov, `select_province_${code}`);
            })
          );
          
          await ctx.reply(getText(lang, 'select_province'), {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(provinceButtons).reply_markup
          });
          break;
        case 'postal_code':
          booking.customerInfo.postalCode = booking.tempValue;
          booking.infoStep = 'email';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Postal Code:* ${booking.customerInfo.postalCode}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_email_required'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'email@example.com'
            }
          });
          break;
        case 'email':
          booking.customerInfo.email = booking.tempValue;
          booking.infoStep = 'drivers_license';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Email:* ${booking.customerInfo.email}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_drivers_license'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'DL# or type "skip"'
            }
          });
          break;
        case 'drivers_license':
          booking.customerInfo.driversLicense = booking.tempValue;
          booking.infoStep = 'dl_issued';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *Driver's License:* ${booking.customerInfo.driversLicense}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_dl_issued'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'MM/DD/YYYY or "skip"'
            }
          });
          break;
        case 'dl_issued':
          booking.customerInfo.dlIssued = booking.tempValue;
          booking.infoStep = 'dl_expiry';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *DL Issue Date:* ${booking.customerInfo.dlIssued}\nSaved successfully`, { parse_mode: 'Markdown' });
          await ctx.reply(getText(lang, 'enter_dl_expiry'), {
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'MM/DD/YYYY or "skip"'
            }
          });
          break;
        case 'dl_expiry':
          booking.customerInfo.dlExpiry = booking.tempValue;
          booking.infoStep = 'review';
          booking.tempValue = null;
          await ctx.editMessageText(`✅ *DL Expiry Date:* ${booking.customerInfo.dlExpiry}\nSaved successfully`, { parse_mode: 'Markdown' });
          await this.showInfoReview(ctx, booking.customerInfo, lang);
          break;
      }
    });
    
    // Handle re-enter request
    this.bot.action(/reenter_field_(.+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const field = ctx.match[1];
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking;
      if (!booking) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Clear temp value and ask again
      booking.tempValue = null;
      await ctx.editMessageText('🔄 Please re-enter the information.');
      
      // Re-prompt based on field with ForceReply
      const placeholders = {
        'first_name': 'John',
        'middle_name': 'Middle name or "skip"',
        'last_name': 'Smith',
        'dob': 'MM/DD/YYYY',
        'street_number': '123',
        'street_address': 'Main Street',
        'city': 'Toronto',
        'postal_code': 'M5V 3A8',
        'email': 'email@example.com',
        'drivers_license': 'DL# or "skip"',
        'dl_issued': 'MM/DD/YYYY or "skip"',
        'dl_expiry': 'MM/DD/YYYY or "skip"'
      };
      
      switch (field) {
        case 'first_name':
          await ctx.reply(getText(lang, 'enter_first_name'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'middle_name':
          await ctx.reply(getText(lang, 'enter_middle_name'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'last_name':
          await ctx.reply(getText(lang, 'enter_last_name'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'dob':
          await ctx.reply(getText(lang, 'enter_dob'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'street_number':
          await ctx.reply(getText(lang, 'enter_street_number'), {
            reply_markup: { 
              force_reply: true, 
              input_field_placeholder: placeholders[field] 
            }
          });
          break;
        case 'street_address':
          await ctx.reply(getText(lang, 'enter_street_address'), {
            reply_markup: { 
              force_reply: true, 
              input_field_placeholder: placeholders[field] 
            }
          });
          break;
        case 'city':
          await ctx.reply(getText(lang, 'enter_city'), {
            reply_markup: { 
              force_reply: true, 
              input_field_placeholder: placeholders[field] 
            }
          });
          break;
        case 'postal_code':
          await ctx.reply(getText(lang, 'enter_postal_code'), {
            reply_markup: { 
              force_reply: true, 
              input_field_placeholder: placeholders[field] 
            }
          });
          break;
        case 'email':
          await ctx.reply(getText(lang, 'enter_email_required'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'drivers_license':
          await ctx.reply(getText(lang, 'enter_drivers_license'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'dl_issued':
          await ctx.reply(getText(lang, 'enter_dl_issued'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
        case 'dl_expiry':
          await ctx.reply(getText(lang, 'enter_dl_expiry'), {
            reply_markup: { force_reply: true, input_field_placeholder: placeholders[field] }
          });
          break;
      }
    });
    
    // Handle back navigation
    this.bot.action(/back_field_(.+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const currentField = ctx.match[1];
      const userId = ctx.from.id.toString();
      const referralData = this.getReferralData();
      const lang = getUserLanguage(userId, referralData);
      
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking;
      if (!booking) {
        await ctx.reply(getText(lang, 'session_expired'));
        return;
      }
      
      // Determine previous field and go back
      const fieldOrder = ['first_name', 'middle_name', 'last_name', 'dob', 'billing_address', 'email', 'drivers_license', 'dl_issued', 'dl_expiry'];
      const currentIndex = fieldOrder.indexOf(currentField);
      
      if (currentIndex > 0) {
        const previousField = fieldOrder[currentIndex - 1];
        booking.infoStep = previousField;
        booking.tempValue = null;
        
        await ctx.editMessageText('⬅️ Going back to previous field.');
        
        // Show prompt for previous field with ForceReply
        const placeholders = {
          'first_name': 'John',
          'middle_name': 'Middle name or "skip"',
          'last_name': 'Smith',
          'dob': 'MM/DD/YYYY',
          'street_number': '123',
          'street_address': 'Main Street',
          'city': 'Toronto',
          'postal_code': 'M5V 3A8',
          'email': 'email@example.com',
          'drivers_license': 'DL# or "skip"',
          'dl_issued': 'MM/DD/YYYY or "skip"'
        };
        
        switch (previousField) {
          case 'first_name':
            await ctx.reply(getText(lang, 'enter_first_name'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
          case 'middle_name':
            await ctx.reply(getText(lang, 'enter_middle_name'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
          case 'last_name':
            await ctx.reply(getText(lang, 'enter_last_name'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
          case 'dob':
            await ctx.reply(getText(lang, 'enter_dob'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
          case 'street_number':
            await ctx.reply(getText(lang, 'enter_street_number'), {
              reply_markup: { 
                force_reply: true, 
                input_field_placeholder: placeholders[previousField] 
              }
            });
            break;
          case 'street_address':
            await ctx.reply(getText(lang, 'enter_street_address'), {
              reply_markup: { 
                force_reply: true, 
                input_field_placeholder: placeholders[previousField] 
              }
            });
            break;
          case 'city':
            await ctx.reply(getText(lang, 'enter_city'), {
              reply_markup: { 
                force_reply: true, 
                input_field_placeholder: placeholders[previousField] 
              }
            });
            break;
          case 'postal_code':
            await ctx.reply(getText(lang, 'enter_postal_code'), {
              reply_markup: { 
                force_reply: true, 
                input_field_placeholder: placeholders[previousField] 
              }
            });
            break;
          case 'email':
            await ctx.reply(getText(lang, 'enter_email_required'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
          case 'drivers_license':
            await ctx.reply(getText(lang, 'enter_drivers_license'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
          case 'dl_issued':
            await ctx.reply(getText(lang, 'enter_dl_issued'), {
              reply_markup: { force_reply: true, input_field_placeholder: placeholders[previousField] }
            });
            break;
        }
      } else {
        await ctx.reply('You are at the first field. Cannot go back further.');
      }
    });
    
    // Handle text messages for referral codes
    this.bot.on('text', async (ctx, next) => {
      const userId = ctx.from.id.toString();
      const text = ctx.message.text;
      
      // Check if user is waiting to enter a referral code
      if (this.pendingSessions.has(userId)) {
        const session = this.pendingSessions.get(userId);
        
        if (session.action === 'awaiting_code') {
          // Check if it's a command
          if (text.startsWith('/')) {
            this.pendingSessions.delete(userId);
            return next();
          }
          
          // Validate referral code
          const code = text.toUpperCase().trim();
          const referralData = this.getReferralData();
          const codeData = referralData.codes[code];
          
          if (codeData && codeData.active && codeData.uses < codeData.maxUses) {
            // Valid code - approve user
            if (!referralData.approvedUsers.includes(userId)) {
              referralData.approvedUsers.push(userId);
            }
            codeData.uses++;
            this.saveReferralData(referralData);
            
            await ctx.reply(
              '✅ *Access Granted!*\n\n' +
              'Your referral code is valid. You now have full access to the Lodge Mobile Activations Bot.\n\n' +
              'Use /book to schedule your first appointment.',
              { parse_mode: 'Markdown' }
            );
            
            // Register the user
            await this.registerUser(ctx);
            
            // Clear session
            this.pendingSessions.delete(userId);
          } else {
            await ctx.reply(
              '❌ Invalid or expired referral code.\n\n' +
              'Please try again or use /request to request access from an administrator.'
            );
          }
          return;
        }
      }

      // ============== LIVE SUPPORT MESSAGE HANDLING ==============
      
      // Check if user is providing support input
      if (this.awaitingSupportInput.has(userId)) {
        const supportSession = this.awaitingSupportInput.get(userId);
        
        // Skip if it's a command (let other handlers process it)
        if (text.startsWith('/')) {
          this.awaitingSupportInput.delete(userId);
          return next();
        }

        try {
          // Check if support system is available
          if (!this.supportManager) {
            const language = getUserLanguage(userId);
            await ctx.reply(getText('supportNotAvailable', language));
            this.awaitingSupportInput.delete(userId);
            return;
          }

          switch (supportSession.action) {
            case 'awaiting_initial_message':
              // User is starting a new support ticket
              const ticket = await this.supportManager.createTicket(userId, ctx.from.first_name, text);
              
              // Add message to history
              this.supportManager.addMessage(ticket.ticketId, 'user', text);
              
              // Forward to support group anonymously
              await this.supportManager.forwardToSupport(ctx, ticket, text);
              
              // Update rate limit
              this.supportManager.updateRateLimit(userId, 'message');
              
              // Send confirmation to user
              const responseKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💬 Continue', 'support_continue')],
                [Markup.button.callback('✅ Close Ticket', 'support_end')]
              ]);

              await ctx.reply(
                `✅ *Support ticket created successfully!*\n\n` +
                `🎫 Ticket ID: ${ticket.ticketId}\n` +
                `📝 Your message has been forwarded to our support team anonymously.\n\n` +
                `🔔 You will receive a response shortly. Your conversation is completely private.`,
                { parse_mode: 'Markdown', ...responseKeyboard }
              );
              
              this.awaitingSupportInput.delete(userId);
              return;

            case 'awaiting_message':
              // User is continuing an existing support conversation
              const activeTicket = this.supportManager.getActiveTicket(userId);
              if (!activeTicket) {
                this.awaitingSupportInput.delete(userId);
                return await ctx.reply('❌ No active support ticket found. Please start a new support session.');
              }

              // Add message to history
              this.supportManager.addMessage(activeTicket.ticketId, 'user', text);
              
              // Forward to support group
              await this.supportManager.forwardToSupport(ctx, activeTicket, text);
              
              // Update rate limit
              this.supportManager.updateRateLimit(userId, 'message');

              // Send confirmation
              const continueKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💬 Continue', 'support_continue')],
                [Markup.button.callback('✅ Close Ticket', 'support_end')]
              ]);

              await ctx.reply(
                `📤 *Message sent to support team*\n\n` +
                `🎫 Ticket: ${activeTicket.ticketId}\n` +
                `📝 Your message has been forwarded anonymously.\n\n` +
                `⏱️ Please wait for a response from our team.`,
                { parse_mode: 'Markdown', ...continueKeyboard }
              );
              
              this.awaitingSupportInput.delete(userId);
              return;

            case 'agent_replying': {
              // Support agent is replying to a ticket
              const ticketId = supportSession.ticketId;
              const tickets = this.supportManager.getTickets();
              const replyTicket = tickets.tickets[ticketId];

              if (!replyTicket || replyTicket.status !== 'open') {
                this.awaitingSupportInput.delete(userId);
                return await ctx.reply('❌ Ticket not found or already closed.');
              }

              // Add agent's message to history
              this.supportManager.addMessage(ticketId, 'agent', text);

              // Send response to user (anonymized)
              await this.supportManager.sendResponseToUser(replyTicket.userId, text);

              // Confirm to agent
              await ctx.reply(
                `✅ *Response sent successfully*\n\n` +
                `🎫 Ticket: ${ticketId}\n` +
                `📤 Your response has been sent to the user anonymously.\n\n` +
                `👤 They will see it as coming from "Live Support".`
              );

              this.awaitingSupportInput.delete(userId);
              return;
            }
          }
        } catch (error) {
          console.error('Error handling support message:', error);
          await ctx.reply('❌ An error occurred while processing your message. Please try again.');
          this.awaitingSupportInput.delete(userId);
        }
        return;
      }
      
      // Check if user is in the middle of booking info collection
      if (ctx.session?.booking?.infoStep) {
        const booking = ctx.session.booking;
        const text = ctx.message.text.trim();
        const referralData = this.getReferralData();
        const lang = getUserLanguage(userId, referralData);
        
        // Store temp value for confirmation
        if (!booking.tempValue) {
          booking.tempValue = text;
          
          // Show confirmation for current step
          let confirmMessage = '';
          let fieldName = '';
          
          switch (booking.infoStep) {
            case 'first_name':
              fieldName = 'First Name';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*First Name:* ${text}\n\nIs this correct?`;
              break;
            
            case 'middle_name':
              if (text.toLowerCase() === 'skip' || text.toLowerCase() === 'passer') {
                booking.customerInfo.middleName = null;
                booking.tempValue = null;
                booking.infoStep = 'last_name';
                await ctx.reply(getText(lang, 'enter_last_name'), {
                  reply_markup: {
                    force_reply: true,
                    input_field_placeholder: 'Smith'
                  }
                });
                return;
              }
              fieldName = 'Middle Name';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Middle Name:* ${text}\n\nIs this correct?`;
              break;
            
            case 'last_name':
              fieldName = 'Last Name';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Last Name:* ${text}\n\nIs this correct?`;
              break;
            
            case 'dob':
              // Validate date format MM/DD/YYYY
              const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/;
              if (!dateRegex.test(text)) {
                booking.tempValue = null;
                await ctx.reply(getText(lang, 'error_invalid_date'));
                return;
              }
              fieldName = 'Date of Birth';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Date of Birth:* ${text}\n\nIs this correct?`;
              break;
            
            case 'street_number':
              fieldName = 'Street Number';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Street Number:* ${text}\n\nIs this correct?`;
              break;
            
            case 'street_address':
              fieldName = 'Street Address';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Street Address:* ${text}\n\nIs this correct?`;
              break;
            
            case 'city':
              fieldName = 'City';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*City:* ${text}\n\nIs this correct?`;
              break;
            
            case 'postal_code':
              // Validate Canadian postal code format (with or without space)
              const postalRegex = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
              if (!postalRegex.test(text.trim())) {
                booking.tempValue = null;
                await ctx.reply('❌ Invalid postal code format. Please enter a valid Canadian postal code (e.g., M5V 3A8 or M5V3A8).');
                return;
              }
              fieldName = 'Postal Code';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Postal Code:* ${text}\n\nIs this correct?`;
              break;
            
            case 'email':
              // Validate email format
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(text)) {
                booking.tempValue = null;
                await ctx.reply(getText(lang, 'error_invalid_email'));
                return;
              }
              fieldName = 'Email Address';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Email:* ${text}\n\nIs this correct?`;
              break;
            
            case 'drivers_license':
              if (text.toLowerCase() === 'skip' || text.toLowerCase() === 'passer') {
                booking.customerInfo.driversLicense = null;
                booking.tempValue = null;
                booking.infoStep = 'review';
                await ctx.reply('👍 _Driver\'s license will be provided for you_');
                await this.showInfoReview(ctx, booking.customerInfo, lang);
                return;
              }
              fieldName = 'Driver\'s License Number';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*Driver\'s License:* ${text}\n\nIs this correct?`;
              break;
            
            case 'dl_issued':
              if (text.toLowerCase() === 'skip' || text.toLowerCase() === 'passer') {
                booking.customerInfo.dlIssued = null;
                booking.tempValue = null;
                booking.infoStep = 'dl_expiry';
                await ctx.reply(getText(lang, 'enter_dl_expiry'), {
                  reply_markup: {
                    force_reply: true,
                    input_field_placeholder: 'MM/DD/YYYY or "skip"'
                  }
                });
                return;
              }
              const dlIssuedRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/;
              if (!dlIssuedRegex.test(text)) {
                booking.tempValue = null;
                await ctx.reply(getText(lang, 'error_invalid_date'));
                return;
              }
              fieldName = 'DL Issue Date';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*DL Issue Date:* ${text}\n\nIs this correct?`;
              break;
            
            case 'dl_expiry':
              if (text.toLowerCase() === 'skip' || text.toLowerCase() === 'passer') {
                booking.customerInfo.dlExpiry = null;
                booking.tempValue = null;
                booking.infoStep = 'review';
                await ctx.reply('👍 _DL expiry date skipped_');
                await this.showInfoReview(ctx, booking.customerInfo, lang);
                return;
              }
              const dlExpiryRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/;
              if (!dlExpiryRegex.test(text)) {
                booking.tempValue = null;
                await ctx.reply(getText(lang, 'error_invalid_date'));
                return;
              }
              fieldName = 'DL Expiry Date';
              confirmMessage = `🔍 *Confirm Your Entry*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n*DL Expiry Date:* ${text}\n\nIs this correct?`;
              break;
          }
          
          // Show confirmation buttons for the entered value
          if (booking.tempValue) {
            await ctx.reply(confirmMessage, {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([
                [
                  Markup.button.callback('✅ Confirm', `confirm_field_${booking.infoStep}`),
                  Markup.button.callback('🔄 Re-enter', `reenter_field_${booking.infoStep}`)
                ],
                [Markup.button.callback('⬅️ Back', `back_field_${booking.infoStep}`)]
              ]).reply_markup
            });
          }
        }
        return;
      }
      
      return next();
    });
    
    // Category handler removed - we only have Lodge Mobile Activations now

    // Handle service selection
    this.bot.action(/service_(\d+)/, async (ctx) => {
      try {
        // answerCbQuery already handled by middleware above
        
        const serviceId = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.serviceId = serviceId;
        
        // Get service details
        const service = await Service.query().findById(serviceId);
        // Set duration to 90 minutes (1.5 hours) for all bookings
        ctx.session.booking.serviceDuration = 90;
        
        // Initialize customer info collection
        ctx.session.booking.customerInfo = {};
        ctx.session.booking.infoStep = 'first_name';
        
        const userId = ctx.from.id.toString();
        const referralData = this.getReferralData();
        const lang = getUserLanguage(userId, referralData);
        
        // Check if this is a "New Registration" service and show notice
        if (service && service.name && service.name.toLowerCase().includes('new registration')) {
          await ctx.editMessageText(
            '📋 *New Registration Selected*\n\n' +
            '⚠️ *Important Notice:*\n' +
            'New registration appointments must be booked at least 24 hours in advance.\n' +
            'You will only be able to select dates starting from tomorrow.\n\n' +
            'Press continue to proceed with your registration information.',
            {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([[
                Markup.button.callback('Continue →', 'continue_new_registration')
              ]]).reply_markup
            }
          );
        } else {
          // Start info collection with combined message and ForceReply
          await ctx.editMessageText('✅ Service selected successfully!');
          await ctx.reply(getText(lang, 'info_collection_start'), {
            parse_mode: 'Markdown',
            reply_markup: {
              force_reply: true,
              input_field_placeholder: 'John'
            }
          });
        }
        return;
      } catch (error) {
        console.error('Service handler error:', error);
        const userId = ctx.from?.id?.toString();
        const referralData = this.getReferralData();
        const lang = getUserLanguage(userId, referralData);
        ctx.reply(getText(lang, 'error_generic'));
      }
    });

    // Handle date selection
    this.bot.action(/date_(.+)/, async (ctx) => {
      try {
        // answerCbQuery already handled by middleware above
        
        const date = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        
        // Check if this is a "New Registration" service and validate dynamic restrictions
        if (ctx.session.booking.serviceId) {
          const service = await Service.query().findById(ctx.session.booking.serviceId);
          if (service && service.name && service.name.toLowerCase().includes('new registration')) {
            // Get provider for counting new registrations
            const provider = await User.query()
              .where('role', 'provider')
              .where('is_active', true)
              .first();
            
            let minDaysAhead = 1; // Default: Must book at least 24 hours ahead
            
            if (provider) {
              // Count new registration appointments for tomorrow
              const tomorrow = moment().tz('America/New_York').add(1, 'day').format('YYYY-MM-DD');
              const tomorrowNewRegs = await Appointment.query()
                .where('provider_id', provider.id)
                .where('appointment_datetime', '>=', `${tomorrow} 00:00:00`)
                .where('appointment_datetime', '<=', `${tomorrow} 23:59:59`)
                .whereIn('status', ['scheduled', 'confirmed'])
                .withGraphFetched('[service]')
                .modifyGraph('service', builder => {
                  builder.whereRaw('LOWER(name) LIKE ?', ['%new registration%']);
                });
              
              // Filter to only count actual new registration appointments
              const newRegCount = tomorrowNewRegs.filter(apt => 
                apt.service && apt.service.name.toLowerCase().includes('new registration')
              ).length;
              
              // If 5 or more new registrations tomorrow, push to 2 days ahead
              if (newRegCount >= 5) {
                minDaysAhead = 2;
              }
            }
            
            // Check if the selected date meets the minimum days ahead requirement
            const today = moment().tz('America/New_York').format('YYYY-MM-DD');
            const minDate = moment().tz('America/New_York').add(minDaysAhead, 'days').format('YYYY-MM-DD');
            
            if (date < minDate) {
              let errorMessage;
              if (minDaysAhead === 2) {
                errorMessage = 
                  '❌ *Invalid Date Selection*\n\n' +
                  'Due to high demand, new registration appointments must be booked at least 2 days in advance.\n' +
                  'Tomorrow is fully booked with new registrations.\n\n' +
                  `Earliest available date: ${moment(minDate).format('MMMM DD, YYYY')}`;
              } else {
                errorMessage = 
                  '❌ *Invalid Date Selection*\n\n' +
                  'New registrations must be booked at least 24 hours in advance.\n' +
                  'Please select a date starting from tomorrow.\n\n' +
                  `Earliest available date: ${moment(minDate).format('MMMM DD, YYYY')}`;
              }
              
              await ctx.editMessageText(errorMessage, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([[
                  Markup.button.callback('🔄 Select Another Date', 'restart_booking')
                ]]).reply_markup
              });
              return;
            }
          }
        }
        
        ctx.session.booking.date = date;
        
        // Get booked appointments for this date
        const provider = await User.query()
          .where('role', 'provider')
          .where('is_active', true)
          .first();
        
        const existingAppointments = await Appointment.query()
          .where('provider_id', provider.id)
          .where('appointment_datetime', '>=', `${date} 00:00:00`)
          .where('appointment_datetime', '<=', `${date} 23:59:59`)
          .whereIn('status', ['scheduled', 'confirmed'])
          .select('appointment_datetime', 'duration_minutes');
        
        // Check if we've reached the daily limit of 5 appointments
        if (existingAppointments.length >= 5) {
          await ctx.editMessageText(
            `❌ *Fully Booked*\n\n` +
            `Sorry, ${moment(date).format('MMMM DD, YYYY')} is fully booked.\n` +
            `Maximum of 5 appointments per day has been reached.\n\n` +
            `Please select another date.`,
            {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([[
                Markup.button.callback('🔄 Select Another Date', 'restart_booking')
              ]]).reply_markup
            }
          );
          return;
        }
        
        // Mark booked slots - block 90 minutes (1.5 hours) for each appointment
        const bookedSlots = new Set();
        existingAppointments.forEach(apt => {
          const startTime = moment(apt.appointment_datetime);
          // Always block 90 minutes regardless of stored duration
          const endTime = moment(apt.appointment_datetime).add(90, 'minutes');
          
          // Block all 30-minute slots that overlap with this appointment
          let current = moment(startTime).startOf('hour');
          if (current.minutes() === 30) current.subtract(30, 'minutes');
          
          while (current.isBefore(endTime)) {
            const slotTime = current.format('H:mm');
            bookedSlots.add(slotTime);
            current.add(30, 'minutes');
          }
        });
        
        // Generate time slots from 11am to 6:30pm Eastern (last slot at 6:30pm ends at 8pm with 90-min duration)
        const slots = [];
        for (let hour = 11; hour <= 18; hour++) { // 11am to 6:30pm (90 minutes from 6:30pm = 8:00pm)
          // Only show slots within business hours (11am-8pm with 90-min appointments)
          // Last appointment at 6:30pm ends at 8:00pm
          
          // Hour slot (e.g., 11:00, 12:00, etc.)
          if (hour <= 18) { // Up to 6:00 PM
            const displayHour1 = hour > 12 ? hour - 12 : hour;
            const period1 = hour >= 12 ? 'PM' : 'AM';
            const displayTime1 = `${displayHour1}:00 ${period1}`;
            const slot1 = `${hour}:00`;
            
            if (!bookedSlots.has(slot1)) {
              slots.push(Markup.button.callback(`✅ ${displayTime1}`, `time_${slot1}`));
            } else {
              slots.push(Markup.button.callback(`❌ ${displayTime1}`, `booked_${slot1}`));
            }
          }
          
          // Half-hour slot (e.g., 11:30, 12:30, etc.)
          // Only add 6:30 PM as the absolute last slot (hour 18)
          if (hour < 18 || hour === 18) { // Include 6:30 PM as last possible slot
            const displayHour2 = hour > 12 ? hour - 12 : hour;
            const period2 = hour >= 12 ? 'PM' : 'AM';
            const displayTime2 = `${displayHour2}:30 ${period2}`;
            const slot2 = `${hour}:30`;
            
            if (!bookedSlots.has(slot2)) {
              slots.push(Markup.button.callback(`✅ ${displayTime2}`, `time_${slot2}`));
            } else {
              slots.push(Markup.button.callback(`❌ ${displayTime2}`, `booked_${slot2}`));
            }
          }
        }

        // Create rows of 2 buttons each
        const rows = [];
        for (let i = 0; i < slots.length; i += 2) {
          rows.push(slots.slice(i, i + 2));
        }
        
        const remainingSlots = 5 - existingAppointments.length;

        await ctx.editMessageText(
          `Please select an available time slot for ${moment(date).format('MMMM DD, YYYY')}:\n\n` +
          `⏰ Business Hours: 11:00 AM - 8:00 PM Eastern\n` +
          `⏱️ Each appointment blocks 90 minutes (1.5 hours)\n` +
          `📊 Slots remaining today: ${remainingSlots}/5\n\n` +
          `✅ Available slots\n❌ Blocked (90-min window)`,
          Markup.inlineKeyboard(rows)
        );
      } catch (error) {
        console.error('Date handler error:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle booked slot click
    this.bot.action(/booked_(.+)/, async (ctx) => {
      // Override the default answerCbQuery to show an alert
      await ctx.answerCbQuery('This time slot is already booked. Please select another.', { show_alert: true }).catch(() => {});
      return; // Don't continue to other handlers
    });

    // Handle time selection
    this.bot.action(/time_(.+)/, async (ctx) => {
      try {
        // answerCbQuery already handled by middleware above
        
        const time = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.time = time;
        
        // Double-check availability before showing confirmation
        const provider = await User.query()
          .where('role', 'provider')
          .where('is_active', true)
          .first();
        
        const dateTime = moment(`${ctx.session.booking.date} ${time}`, 'YYYY-MM-DD HH:mm');
        // Always use 90 minutes for conflict checking
        const endTime = dateTime.clone().add(90, 'minutes');
        
        // Check for conflicts
        const conflicts = await Appointment.query()
          .where('provider_id', provider.id)
          .whereIn('status', ['scheduled', 'confirmed'])
          .where(function() {
            this.where(function() {
              // New appointment starts during existing appointment
              this.where('appointment_datetime', '<=', dateTime.format('YYYY-MM-DD HH:mm:ss'))
                  .whereRaw('DATE_ADD(appointment_datetime, INTERVAL duration_minutes MINUTE) > ?', 
                           [dateTime.format('YYYY-MM-DD HH:mm:ss')]);
            }).orWhere(function() {
              // Existing appointment starts during new appointment
              this.where('appointment_datetime', '<', endTime.format('YYYY-MM-DD HH:mm:ss'))
                  .where('appointment_datetime', '>=', dateTime.format('YYYY-MM-DD HH:mm:ss'));
            });
          });
        
        if (conflicts.length > 0) {
          await ctx.editMessageText(
            '❌ Sorry, this time slot was just booked by another user. Please try again.',
            Markup.inlineKeyboard([[
              Markup.button.callback('🔄 Try Again', 'restart_booking')
            ]])
          );
          return;
        }
        
        const booking = ctx.session.booking;
        const service = await Service.query().findById(booking.serviceId);
        
        // Convert time to 12-hour format for display
        const [hour, minute] = booking.time.split(':');
        const hourNum = parseInt(hour);
        const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
        const period = hourNum >= 12 ? 'PM' : 'AM';
        const displayTime = `${displayHour}:${minute} ${period}`;
        
        // Get customer information
        const customerInfo = booking.customerInfo || {};
        const fullName = `${customerInfo.firstName || ''} ${customerInfo.middleName || ''} ${customerInfo.lastName || ''}`.trim().replace(/\s+/g, ' ');
        
        // Format billing address
        let billingAddress = 'Not provided';
        if (customerInfo.streetNumber && customerInfo.streetAddress) {
          billingAddress = `${customerInfo.streetNumber} ${customerInfo.streetAddress}\n   ${customerInfo.city}, ${customerInfo.province} ${customerInfo.postalCode}`;
        }
        
        // Format driver's license info
        let dlInfo = customerInfo.driversLicense || 'Not provided';
        if (customerInfo.driversLicense && customerInfo.driversLicense !== 'skip') {
          if (customerInfo.dlIssued && customerInfo.dlIssued !== 'skip') {
            dlInfo += `\n   Issued: ${customerInfo.dlIssued}`;
          }
          if (customerInfo.dlExpiry && customerInfo.dlExpiry !== 'skip') {
            dlInfo += `\n   Expires: ${customerInfo.dlExpiry}`;
          }
        }
        
        const summary = `
*📋 Final Booking Review*

Please review all your information before confirming:

*📅 Appointment Details:*
• Date: ${booking.date}
• Time: ${displayTime}
• Service: ${service.name}
• Duration: 90 minutes (1.5 hours)

*👤 Customer Information:*
• First Name: ${customerInfo.firstName}${customerInfo.middleName && customerInfo.middleName !== 'skip' ? `\n• Middle Name: ${customerInfo.middleName}` : ''}
• Last Name: ${customerInfo.lastName}
• Date of Birth: ${customerInfo.dob || 'Not provided'}
• Email: ${customerInfo.email || 'Not provided'}

*📍 Billing Address:*
• ${billingAddress}

*🪪 Driver's License:*
• ${dlInfo}

⚠️ *Please ensure all information is correct before confirming.*

Would you like to confirm this appointment?
        `;

        await ctx.editMessageText(summary, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Confirm Booking', 'confirm_booking')
            ],
            [
              Markup.button.callback('✏️ Edit Information', 'info_edit'),
              Markup.button.callback('❌ Cancel', 'cancel_booking')
            ]
          ]).reply_markup
        });
      } catch (error) {
        console.error('Time handler error:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle restart booking
    this.bot.action('restart_booking', async (ctx) => {
      // answerCbQuery already handled by middleware above
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      ctx.session.booking.category = 'lodge_mobile';
      
      try {
        // Get services for Lodge Mobile Activations
        const services = await Service.query()
          .where('is_active', true)
          .orderBy('name', 'asc')
          .limit(10);

        if (services.length === 0) {
          return ctx.editMessageText('No services available at the moment. Please try again later.');
        }

        const buttons = services.map(service => [
          Markup.button.callback(
            `${service.name}`, 
            `service_${service.id}`
          )
        ]);

        await ctx.editMessageText('📱 *Lodge Mobile Activations*\n\nPlease select one of the following service options below to proceed with your booking:', {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
      } catch (error) {
        console.error('Error restarting booking:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle booking confirmation
    this.bot.action('confirm_booking', async (ctx) => {
      try {
        // answerCbQuery already handled by middleware above
        
        console.log('Starting booking confirmation...');
        
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          console.error('User not found for Telegram ID:', ctx.from.id);
          return ctx.reply('Please use /start first to register.');
        }
        
        ctx.session = ctx.session || {};
        const booking = ctx.session.booking || {};
        
        console.log('Booking data:', booking);
        console.log('User ID:', user.id);
        
        // Validate booking data
        if (!booking.date || !booking.time) {
          console.error('Missing booking data:', { date: booking.date, time: booking.time });
          return ctx.reply('Session expired. Please start booking again with /book');
        }
        
        // Check if user already has 2 appointments
        const userAppointments = await Appointment.query()
          .where('client_id', user.id)
          .whereIn('status', ['scheduled', 'confirmed'])
          .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'));
        
        if (userAppointments.length >= 2) {
          await ctx.editMessageText(
            '❌ *Booking Limit Reached*\n\n' +
            'You already have 2 appointments booked.\n' +
            'Maximum of 2 appointments allowed per user at any time.\n\n' +
            'Please cancel an existing appointment before booking a new one.\n\n' +
            'Use /myappointments to view your current bookings.',
            {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([[
                Markup.button.callback('📋 View My Appointments', 'view_appointments'),
                Markup.button.callback('🔄 Back', 'cancel_booking')
              ]]).reply_markup
            }
          );
          return;
        }
        
        // Create appointment with conflict check
        const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm');
        
        console.log('Creating appointment with datetime:', dateTime.format());
        
        // Get provider
        const provider = await User.query()
          .where('role', 'provider')
          .where('is_active', true)
          .first();
        
        if (!provider) {
          console.error('No active provider found');
          return ctx.reply('Sorry, no providers are available. Please try again later.');
        }
        
        // Get service details
        const service = await Service.query().findById(booking.serviceId);
        
        // Final conflict check with transaction
        const appointment = await Appointment.transaction(async trx => {
          // Check daily appointment limit
          const dailyAppointments = await Appointment.query(trx)
            .where('provider_id', provider.id)
            .where('appointment_datetime', '>=', `${booking.date} 00:00:00`)
            .where('appointment_datetime', '<=', `${booking.date} 23:59:59`)
            .whereIn('status', ['scheduled', 'confirmed']);
          
          if (dailyAppointments.length >= 5) {
            throw new Error('Daily appointment limit reached');
          }
          
          // Check for conflicts one more time inside transaction
          const conflicts = await Appointment.query(trx)
            .where('provider_id', provider.id)
            .whereIn('status', ['scheduled', 'confirmed'])
            .where(function() {
              this.where(function() {
                this.where('appointment_datetime', '<=', dateTime.format('YYYY-MM-DD HH:mm:ss'))
                    .whereRaw('DATE_ADD(appointment_datetime, INTERVAL duration_minutes MINUTE) > ?', 
                             [dateTime.format('YYYY-MM-DD HH:mm:ss')]);
              }).orWhere(function() {
                // Always use 90 minutes for conflict checking
                const endTime = dateTime.clone().add(90, 'minutes');
                this.where('appointment_datetime', '<', endTime.format('YYYY-MM-DD HH:mm:ss'))
                    .where('appointment_datetime', '>=', dateTime.format('YYYY-MM-DD HH:mm:ss'));
              });
            });
          
          if (conflicts.length > 0) {
            throw new Error('Time slot conflict detected');
          }
          
          // Create the appointment with customer info
          const customerInfo = booking.customerInfo || {};
          const appointmentData = {
            uuid: require('uuid').v4(),
            client_id: user.id,
            provider_id: provider.id,
            service_id: parseInt(booking.serviceId),
            appointment_datetime: dateTime.format('YYYY-MM-DD HH:mm:ss'),
            duration_minutes: 90, // Always 90 minutes (1.5 hours)
            status: 'scheduled',
            notes: 'Booked via Telegram',
            price: 0,  // No pricing during development
            // Customer information fields
            customer_first_name: customerInfo.firstName || user.first_name,
            customer_middle_name: customerInfo.middleName || null,
            customer_last_name: customerInfo.lastName || user.last_name,
            customer_dob: customerInfo.dob ? moment(customerInfo.dob, 'MM/DD/YYYY').format('YYYY-MM-DD') : null,
            billing_address: customerInfo.streetNumber && customerInfo.streetAddress ? 
              `${customerInfo.streetNumber} ${customerInfo.streetAddress}, ${customerInfo.city}, ${customerInfo.province} ${customerInfo.postalCode}` : null,
            customer_email: customerInfo.email || user.email,
            drivers_license_number: customerInfo.driversLicense || null,
            dl_issued_date: customerInfo.dlIssued ? moment(customerInfo.dlIssued, 'MM/DD/YYYY').format('YYYY-MM-DD') : null,
            dl_expiry_date: customerInfo.dlExpiry ? moment(customerInfo.dlExpiry, 'MM/DD/YYYY').format('YYYY-MM-DD') : null
          };
          
          console.log('Appointment data to insert:', appointmentData);
          
          return await Appointment.query(trx).insert(appointmentData);
        });
        
        console.log('Appointment created successfully:', appointment.uuid);

        // Send confirmation to client
        // Convert time to 12-hour format for display
        const [confHour, confMinute] = booking.time.split(':');
        const confHourNum = parseInt(confHour);
        const confDisplayHour = confHourNum > 12 ? confHourNum - 12 : (confHourNum === 0 ? 12 : confHourNum);
        const confPeriod = confHourNum >= 12 ? 'PM' : 'AM';
        const confDisplayTime = `${confDisplayHour}:${confMinute} ${confPeriod}`;
        
        const confirmUserId = ctx.from.id.toString();
        const confirmReferralData = this.getReferralData();
        const confirmLang = getUserLanguage(confirmUserId, confirmReferralData);
        const customerInfo = booking.customerInfo || {};
        
        // Format customer name
        const fullName = `${customerInfo.firstName || ''} ${customerInfo.middleName || ''} ${customerInfo.lastName || ''}`.trim();
        
        // Format DL info
        let dlInfo = customerInfo.driversLicense || 'Will be provided';
        if (customerInfo.driversLicense && customerInfo.dlExpiry) {
          dlInfo += ` (Exp: ${customerInfo.dlExpiry})`;
        }
        
        const confirmMessage = getText(confirmLang, 'booking_confirmed', {
          date: booking.date,
          time: confDisplayTime,
          refId: appointment.uuid.substring(0, 8).toUpperCase()
        });
        
        await ctx.editMessageText(
          `✅ *Your Appointment Has Been Successfully Booked*\n\n` +
          `*Confirmation Number:* \`${appointment.uuid.substring(0, 8).toUpperCase()}\`\n\n` +
          `*Appointment Details:*\n` +
          `• Service: ${service.name}\n` +
          `• Date: ${booking.date}\n` +
          `• Time: ${confDisplayTime}\n` +
          `• Duration: 90 minutes\n\n` +
          `*Customer Information:*\n` +
          `• First Name: ${customerInfo.firstName}\n` +
          (customerInfo.middleName && customerInfo.middleName !== 'skip' ? `• Middle Name: ${customerInfo.middleName}\n` : '') +
          `• Last Name: ${customerInfo.lastName}\n` +
          `• DOB: ${customerInfo.dob || 'Not provided'}\n` +
          `• Email: ${customerInfo.email}\n` +
          `• Address: ${customerInfo.streetNumber} ${customerInfo.streetAddress}, ${customerInfo.city}, ${customerInfo.province} ${customerInfo.postalCode}\n` +
          `• DL: ${dlInfo}\n\n` +
          `You may view all your appointments at any time by using the /myappointments command.\n\n` +
          `Thank you for choosing Lodge Mobile Activations.`,
          { parse_mode: 'Markdown' }
        );
        
        // Send notification to provider
        await this.sendProviderNotification(
          provider,
          `📱 *New Lodge Mobile Activation Booked!*\n\n` +
          `Client: ${user.first_name} ${user.last_name || ''}\n` +
          `Service: ${service.name}\n` +
          `Date: ${booking.date}\n` +
          `Time: ${confDisplayTime}\n` +
          `Duration: 90 minutes (1.5 hours)\n` +
          `ID: \`${appointment.uuid}\``
        );
        
        // Broadcast slot update to all users
        const remainingSlots = await this.getDateSlotCount(booking.date);
        await this.broadcastSlotUpdate(booking.date, remainingSlots, false);
        
        // Clear session
        ctx.session.booking = {};
      } catch (error) {
        console.error('Booking confirmation error:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        
        if (error.message === 'Time slot conflict detected') {
          await ctx.editMessageText(
            '❌ Sorry, this time slot was just booked. Please try again.',
            Markup.inlineKeyboard([[
              Markup.button.callback('🔄 Try Again', 'restart_booking')
            ]])
          );
        } else if (error.message === 'Daily appointment limit reached') {
          await ctx.editMessageText(
            '❌ *Daily Limit Reached*\n\n' +
            'Sorry, the maximum number of appointments (5) for this day has been reached.\n\n' +
            'Please select a different date.',
            {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([[
                Markup.button.callback('🔄 Select Another Date', 'restart_booking')
              ]]).reply_markup
            }
          );
        } else {
          await ctx.reply('Sorry, booking failed. Please try again.\n\nError: ' + error.message);
        }
      }
    });

    // Handle booking cancellation
    this.bot.action('cancel_booking', async (ctx) => {
      try {
        // answerCbQuery already handled by middleware above
        ctx.session = ctx.session || {};
        ctx.session.booking = {};
        await ctx.editMessageText('Booking cancelled. Use /book to start over.');
      } catch (error) {
        console.error('Cancel booking error:', error);
        ctx.reply('Cancelled.');
      }
    });

    // Handle view appointments from booking limit message
    this.bot.action('view_appointments', async (ctx) => {
      try {
        // answerCbQuery already handled by middleware above
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          return ctx.reply('Please start the bot first with /start');
        }

        const appointments = await Appointment.query()
          .where('client_id', user.id)
          .whereIn('status', ['scheduled', 'confirmed'])
          .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
          .withGraphFetched('[provider, service]')
          .orderBy('appointment_datetime', 'asc')
          .limit(10);

        if (appointments.length === 0) {
          await ctx.editMessageText('You have no upcoming appointments. Use /book to schedule one!');
          return;
        }

        let message = '*📅 Your Upcoming Appointments:*\n\n';
        appointments.forEach((apt, index) => {
          const date = moment(apt.appointment_datetime).format('MMM DD, YYYY');
          const time = moment(apt.appointment_datetime).format('h:mm A');
          
          message += `${index + 1}. *${apt.service ? apt.service.name : 'Service'}*\n`;
          message += `   📆 ${date} at ${time}\n`;
          message += `   🆔 ID: \`${apt.uuid}\`\n`;
          message += `   ❌ Cancel: /cancel ${apt.uuid}\n\n`;
        });
        
        message += `\n*You have ${appointments.length}/2 appointments booked*\n`;
        message += `\n🗑️ *To cancel all appointments:* /cancelall`;

        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error fetching appointments:', error);
        ctx.reply('Sorry, I couldn\'t fetch your appointments. Please try /myappointments');
      }
    });

    // Handle appointment confirmation (from 30-minute reminder)
    this.bot.action(/confirm_apt_(.+)/, async (ctx) => {
      try {
        const appointmentUuid = ctx.match[1];
        
        // Find the appointment
        const appointment = await Appointment.query()
          .where('uuid', appointmentUuid)
          .withGraphFetched('[service, client]')
          .first();
        
        if (!appointment) {
          await ctx.editMessageText('❌ Appointment not found.');
          return;
        }
        
        // Check if already confirmed
        if (appointment.confirmed) {
          await ctx.editMessageText('✅ This appointment has already been confirmed.');
          return;
        }
        
        // Confirm the appointment
        await Appointment.query()
          .patch({
            confirmed: true,
            confirmed_at: moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss'),
            status: 'confirmed'
          })
          .where('id', appointment.id);
        
        const appointmentTime = moment(appointment.appointment_datetime);
        const displayTime = appointmentTime.format('h:mm A');
        const displayDate = appointmentTime.format('MMM DD, YYYY');
        
        await ctx.editMessageText(
          `✅ *Appointment Confirmed!*

Thank you for confirming your attendance.

📅 Date: ${displayDate}
⏰ Time: ${displayTime}
📱 Service: ${appointment.service.name}
⏱️ Duration: 90 minutes

🔔 We'll see you soon! Please arrive 5 minutes early.

🆔 Confirmation: \`${appointment.uuid.substring(0, 8).toUpperCase()}\``,
          { parse_mode: 'Markdown' }
        );
        
        // Notify admins that customer confirmed
        await this.notifyAdminsOfConfirmation(appointment, displayDate, displayTime);
        
        console.log(`✅ Appointment ${appointmentUuid} confirmed by user`);
      } catch (error) {
        console.error('Error confirming appointment:', error);
        await ctx.reply('❌ An error occurred while confirming your appointment. Please try again.');
      }
    });

    // Handle appointment cancellation from confirmation reminder
    this.bot.action(/cancel_apt_(.+)/, async (ctx) => {
      try {
        const appointmentUuid = ctx.match[1];
        const userId = ctx.from.id.toString();
        
        // Find the appointment
        const appointment = await Appointment.query()
          .where('uuid', appointmentUuid)
          .withGraphFetched('[service, client]')
          .first();
        
        if (!appointment) {
          await ctx.editMessageText('❌ Appointment not found.');
          return;
        }
        
        // Verify the user owns this appointment
        const user = await this.getUser(userId);
        if (!user || appointment.client_id !== user.id) {
          await ctx.editMessageText('❌ You can only cancel your own appointments.');
          return;
        }
        
        // Cancel the appointment
        await Appointment.query()
          .patch({
            status: 'cancelled',
            cancellation_reason: 'Cancelled by client from reminder',
            cancelled_at: moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss'),
            cancelled_by: user.id
          })
          .where('id', appointment.id);
        
        const appointmentTime = moment(appointment.appointment_datetime);
        const displayTime = appointmentTime.format('h:mm A');
        const displayDate = appointmentTime.format('MMM DD, YYYY');
        
        await ctx.editMessageText(
          `✅ *Appointment Cancelled*

Your appointment has been cancelled successfully.

📅 Cancelled Date: ${displayDate}
⏰ Cancelled Time: ${displayTime}
📱 Service: ${appointment.service.name}

The time slot is now available for others to book.

To book a new appointment, please use /book`,
          { parse_mode: 'Markdown' }
        );
        
        // Broadcast slot availability
        const remainingSlots = await this.getDateSlotCount(moment(appointment.appointment_datetime).format('YYYY-MM-DD'));
        await this.broadcastSlotUpdate(
          moment(appointment.appointment_datetime).format('YYYY-MM-DD'),
          remainingSlots + 1,
          true
        );
        
        console.log(`❌ Appointment ${appointmentUuid} cancelled by user from reminder`);
      } catch (error) {
        console.error('Error cancelling appointment from reminder:', error);
        await ctx.reply('❌ An error occurred while cancelling your appointment. Please try again.');
      }
    });

    // ============== LIVE SUPPORT HANDLERS ==============

    // Handle request support button
    this.bot.action('request_support', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const userId = ctx.from.id.toString();
        const userName = ctx.from.first_name || 'User';
        const language = getUserLanguage(userId);

        // Check if support system is available
        if (!this.supportManager) {
          return await ctx.reply(getText('supportNotAvailable', language));
        }

        // Check rate limits
        const rateLimitResult = await this.supportManager.checkRateLimit(userId);
        if (!rateLimitResult.allowed) {
          let message = '';
          switch (rateLimitResult.reason) {
            case 'blocked':
              message = '🚫 You have been temporarily blocked from support. Please contact an administrator.';
              break;
            case 'daily_limit':
              message = '⏰ You have reached your daily limit of support tickets (5). Please try again tomorrow.';
              break;
            case 'hourly_limit':
              message = '⏰ You are sending messages too frequently. Please wait before contacting support again.';
              break;
            default:
              message = '⚠️ Rate limit exceeded. Please try again later.';
          }
          return await ctx.reply(message);
        }

        // Check if user already has an active ticket
        const existingTicket = this.supportManager.getActiveTicket(userId);
        if (existingTicket) {
          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💬 Continue', 'support_continue')],
            [Markup.button.callback('✅ Close Ticket', 'support_end')]
          ]);

          return await ctx.reply(
            `🎫 You already have an active support ticket: *${existingTicket.ticketId}*\n\n` +
            `Created: ${new Date(existingTicket.createdAt).toLocaleString()}\n\n` +
            `You can continue the conversation or close the ticket.`,
            { parse_mode: 'Markdown', ...keyboard }
          );
        }

        // Request initial message
        await ctx.reply(
          '🎫 *Starting Live Support Session*\n\n' +
          '📝 Please describe your issue or question in detail. Our support team will respond as soon as possible.\n\n' +
          '⚠️ *Important:* Your messages will be forwarded anonymously to our support team.',
          { parse_mode: 'Markdown' }
        );

        // Mark user as awaiting support input
        this.awaitingSupportInput.set(userId, {
          action: 'awaiting_initial_message',
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('Error handling support request:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });

    // Handle continue support conversation
    this.bot.action('support_continue', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const userId = ctx.from.id.toString();
        const language = getUserLanguage(userId);

        // Check if support system is available
        if (!this.supportManager) {
          return await ctx.reply(getText('supportNotAvailable', language));
        }

        const activeTicket = this.supportManager.getActiveTicket(userId);
        if (!activeTicket) {
          return await ctx.reply('❌ No active support ticket found. Please start a new support session.');
        }

        // Check rate limits
        const rateLimitResult = await this.supportManager.checkRateLimit(userId);
        if (!rateLimitResult.allowed) {
          return await ctx.reply('⏰ Please wait before sending another message.');
        }

        await ctx.reply(
          `💬 *Continue Support - Ticket: ${activeTicket.ticketId}*\n\n` +
          '📝 Send your message and our support team will respond.\n\n' +
          '⚠️ Your message will be forwarded anonymously to support.',
          { parse_mode: 'Markdown' }
        );

        // Mark user as awaiting support input
        this.awaitingSupportInput.set(userId, {
          action: 'awaiting_message',
          ticketId: activeTicket.ticketId,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('Error continuing support:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });

    // Handle end support session
    this.bot.action('support_end', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const userId = ctx.from.id.toString();
        const language = getUserLanguage(userId);

        // Check if support system is available
        if (!this.supportManager) {
          return await ctx.reply(getText('supportNotAvailable', language));
        }

        const activeTicket = this.supportManager.getActiveTicket(userId);
        if (!activeTicket) {
          return await ctx.reply('❌ No active support ticket found.');
        }

        // Close the ticket
        const closed = this.supportManager.closeTicket(activeTicket.ticketId);
        if (closed) {
          // Notify support group
          if (this.supportManager.supportGroupId) {
            try {
              await this.bot.telegram.sendMessage(
                this.supportManager.supportGroupId,
                `🎫 *Ticket Closed by User*\n\n` +
                `Ticket: ${activeTicket.ticketId}\n` +
                `Closed: ${new Date().toLocaleString()}\n` +
                `Duration: ${Math.round((Date.now() - new Date(activeTicket.createdAt)) / (1000 * 60))} minutes`,
                { parse_mode: 'Markdown' }
              );
            } catch (err) {
              console.error('Error notifying support group of closure:', err);
            }
          }

          await ctx.reply(
            '✅ *Support ticket closed successfully*\n\n' +
            `Ticket ID: ${activeTicket.ticketId}\n` +
            '🙏 Thank you for using our support system!'
          );
        } else {
          await ctx.reply('❌ Could not close the ticket. Please try again.');
        }

      } catch (error) {
        console.error('Error ending support session:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });

    // ============== SUPPORT AGENT HANDLERS ==============

    // Handle support agent reply
    this.bot.action(/support_reply_(.+)/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const ticketId = ctx.match[1];
        const agentId = ctx.from.id.toString();

        const tickets = this.supportManager.getTickets();
        const ticket = tickets.tickets[ticketId];

        if (!ticket || ticket.status !== 'open') {
          return await ctx.reply('❌ Ticket not found or already closed.');
        }

        // Assign agent to ticket if not assigned
        if (!ticket.assignedAgent) {
          this.supportManager.assignTicket(ticketId, agentId);
          ticket.assignedAgent = agentId;
        }

        await ctx.reply(
          `💬 *Reply to Ticket: ${ticketId}*\n\n` +
          '📝 Send your response to the user. They will see it as coming from "Live Support".\n\n' +
          '⚠️ Your identity will remain anonymous.',
          { parse_mode: 'Markdown' }
        );

        // Mark agent as replying to ticket
        this.awaitingSupportInput.set(agentId, {
          action: 'agent_replying',
          ticketId: ticketId,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('Error handling agent reply:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });

    // Handle support agent close ticket
    this.bot.action(/support_close_(.+)/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const ticketId = ctx.match[1];

        const tickets = this.supportManager.getTickets();
        const ticket = tickets.tickets[ticketId];

        if (!ticket) {
          return await ctx.reply('❌ Ticket not found.');
        }

        if (ticket.status === 'closed') {
          return await ctx.reply('✅ This ticket is already closed.');
        }

        // Close the ticket
        const closed = this.supportManager.closeTicket(ticketId);
        if (closed) {
          // Notify the user
          try {
            await this.supportManager.sendResponseToUser(
              ticket.userId,
              'Your support ticket has been closed by our team. Thank you for contacting us!'
            );
          } catch (err) {
            console.error('Error notifying user of closure:', err);
          }

          await ctx.reply(
            `✅ *Ticket Closed*\n\n` +
            `Ticket: ${ticketId}\n` +
            `User has been notified.`
          );
        } else {
          await ctx.reply('❌ Could not close the ticket. Please try again.');
        }

      } catch (error) {
        console.error('Error closing ticket:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });

    // Handle support agent view history
    this.bot.action(/support_history_(.+)/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const ticketId = ctx.match[1];

        const tickets = this.supportManager.getTickets();
        const ticket = tickets.tickets[ticketId];
        const history = tickets.messageHistory[ticketId] || [];

        if (!ticket) {
          return await ctx.reply('❌ Ticket not found.');
        }

        let message = `📊 *Ticket History: ${ticketId}*\n\n`;
        message += `👤 User: Anonymous (${ticket.userId.substring(0, 6)}...)\n`;
        message += `📅 Created: ${new Date(ticket.createdAt).toLocaleString()}\n`;
        message += `📈 Status: ${ticket.status}\n`;
        message += `👨‍💼 Assigned: ${ticket.assignedAgent ? 'Yes' : 'No'}\n\n`;

        if (history.length === 0) {
          message += '📝 No messages yet.';
        } else {
          message += `📝 *Messages (${history.length}):*\n`;
          const recentMessages = history.slice(-5); // Show last 5 messages

          recentMessages.forEach((msg, index) => {
            const time = new Date(msg.timestamp).toLocaleString();
            const senderIcon = msg.sender === 'user' ? '👤' : '👨‍💼';
            const senderName = msg.sender === 'user' ? 'User' : 'Agent';
            
            message += `\n${senderIcon} *${senderName}* (${time})\n`;
            message += `${msg.message.substring(0, 100)}${msg.message.length > 100 ? '...' : ''}\n`;
          });

          if (history.length > 5) {
            message += `\n... and ${history.length - 5} more messages`;
          }
        }

        // Split message if too long
        if (message.length > 4000) {
          const chunks = message.match(/.{1,4000}/g);
          for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: 'Markdown' });
          }
        } else {
          await ctx.reply(message, { parse_mode: 'Markdown' });
        }

      } catch (error) {
        console.error('Error viewing ticket history:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });

    // Handle support agent escalate ticket
    this.bot.action(/support_escalate_(.+)/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const ticketId = ctx.match[1];

        const tickets = this.supportManager.getTickets();
        const ticket = tickets.tickets[ticketId];

        if (!ticket) {
          return await ctx.reply('❌ Ticket not found.');
        }

        // Update ticket priority
        ticket.priority = 'high';
        tickets.tickets[ticketId] = ticket;
        this.supportManager.saveTickets(tickets);

        // Notify support group about escalation
        const escalationMessage = `🚨 *TICKET ESCALATED*\n\n` +
          `🎫 Ticket: ${ticketId}\n` +
          `⚠️ Priority: HIGH\n` +
          `👤 User: Anonymous (${ticket.userId.substring(0, 6)}...)\n` +
          `📅 Created: ${new Date(ticket.createdAt).toLocaleString()}\n\n` +
          `🔔 This ticket requires immediate attention!`;

        if (this.supportManager.supportGroupId) {
          await this.bot.telegram.sendMessage(
            this.supportManager.supportGroupId,
            escalationMessage,
            { parse_mode: 'Markdown' }
          );
        }

        await ctx.reply(
          `🚨 *Ticket Escalated*\n\n` +
          `Ticket: ${ticketId}\n` +
          `Priority: HIGH\n` +
          `All agents have been notified.`
        );

      } catch (error) {
        console.error('Error escalating ticket:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
      }
    });
    
    // Add catch-all for callback queries to prevent hanging
    // IMPORTANT: This must be the LAST handler to avoid intercepting specific callbacks
    this.bot.on('callback_query', async (ctx, next) => {
      // This will catch any callback query that wasn't handled above
      // and answer it to prevent the loading animation
      try {
        await ctx.answerCbQuery().catch(() => {});
      } catch (error) {
        console.error('Error answering callback query:', error);
      }
      return next();
    });
  }

  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first();

      if (!user) {
        user = await User.query().insert({
          telegram_id: telegramUser.id.toString(),
          email: `telegram_${telegramUser.id}@telegram.local`,
          password_hash: 'telegram_auth',
          first_name: telegramUser.first_name || 'User',
          last_name: telegramUser.last_name || 'User',  // Fixed: Can't be empty string
          phone: '',
          role: 'client',
          timezone: 'America/New_York',
          preferences: {
            notificationTelegram: true
          },
          is_active: true
        });
      }

      return user;
    } catch (error) {
      console.error('Error registering user:', error);
      return null;
    }
  }

  async getUser(telegramId) {
    try {
      return await User.query()
        .where('telegram_id', telegramId.toString())
        .first();
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async notifyAdminsOfConfirmation(appointment, displayDate, displayTime) {
    try {
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
      
      const adminMessage = `✅ *CUSTOMER CONFIRMED - Appointment Ready*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Date:* ${displayDate}
⏰ *Time:* ${displayTime}
👤 *Customer:* ${customerName}
📱 *Service:* ${appointment.service.name}

✅ *Status:* Customer has confirmed attendance
🔔 *Alert:* Appointment starts in less than 30 minutes

🆔 *ID:* \`${appointment.uuid.substring(0, 8).toUpperCase()}\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      
      // Send to all admins
      for (const admin of admins) {
        if (admin.telegram_id) {
          try {
            await this.bot.telegram.sendMessage(admin.telegram_id, adminMessage, {
              parse_mode: 'Markdown'
            });
          } catch (error) {
            console.error(`Failed to notify admin ${admin.email}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error notifying admins of confirmation:', error);
    }
  }

  async notifyAdminsOfAutoCancellation(appointment, displayDate, displayTime) {
    try {
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
          } catch (error) {
            console.error(`Failed to notify admin ${admin.email}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error notifying admins of auto-cancellation:', error);
    }
  }

  isAdmin(telegramId) {
    // Check if the telegram ID is in the admin list
    // You can also check against the database if you have an admin flag
    if (!telegramId) return false;
    return this.adminIds.includes(telegramId.toString());
  }

  // Referral system helper methods
  getReferralData() {
    try {
      if (fs.existsSync(this.referralFile)) {
        const data = fs.readFileSync(this.referralFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading referral data:', error);
    }
    
    // Return default structure if file doesn't exist
    return {
      codes: {
        "LODGE2024": {
          uses: 0,
          maxUses: 50,
          active: true,
          createdBy: "admin"
        }
      },
      pendingRequests: {},
      approvedUsers: this.adminIds.slice() // Include admins in approved users
    };
  }

  saveReferralData(data) {
    try {
      fs.writeFileSync(this.referralFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving referral data:', error);
    }
  }

  isUserApproved(userId) {
    if (!userId) return false;
    const referralData = this.getReferralData();
    return referralData.approvedUsers.includes(userId.toString()) || this.isAdmin(userId);
  }

  getBlockedDates() {
    try {
      if (fs.existsSync(this.blockedDatesFile)) {
        const data = fs.readFileSync(this.blockedDatesFile, 'utf8');
        const json = JSON.parse(data);
        return json.blockedDates || [];
      }
      return [];
    } catch (error) {
      console.error('Error reading blocked dates:', error);
      return [];
    }
  }

  saveBlockedDates(dates) {
    try {
      const data = {
        blockedDates: dates,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.blockedDatesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving blocked dates:', error);
    }
  }

  isDateBlocked(date) {
    const blockedDates = this.getBlockedDates();
    const dateStr = moment(date).format('YYYY-MM-DD');
    return blockedDates.includes(dateStr);
  }

  async sendProviderNotification(provider, message) {
    try {
      // If provider has Telegram ID, send notification
      if (provider.telegram_id) {
        await this.bot.telegram.sendMessage(provider.telegram_id, message, {
          parse_mode: 'Markdown'
        });
        console.log('Notification sent to provider:', provider.id);
      } else {
        console.log('Provider does not have Telegram ID, notification not sent');
      }
    } catch (error) {
      console.error('Error sending provider notification:', error);
    }
  }

  async broadcastSlotUpdate(date, remainingSlots, isNewSlot = false) {
    try {
      // Get all users with telegram IDs
      const users = await User.query()
        .whereNotNull('telegram_id')
        .where('is_active', true);

      const dateFormatted = moment(date).format('MMMM DD, YYYY');
      const dayName = moment(date).format('dddd');
      
      let message;
      if (isNewSlot) {
        // Slot became available (cancellation)
        message = `🟢 *Slot Available!*\n\n` +
                 `A time slot has become available on:\n` +
                 `📅 ${dateFormatted} (${dayName})\n\n` +
                 `Remaining slots: ${remainingSlots}/5\n\n` +
                 `Book now: /book`;
      } else {
        // Slot was booked
        if (remainingSlots === 0) {
          message = `🔴 *Fully Booked*\n\n` +
                   `${dateFormatted} (${dayName}) is now fully booked.\n\n` +
                   `No slots remaining for this date.`;
        } else if (remainingSlots === 1) {
          message = `🟡 *Last Slot Available!*\n\n` +
                   `Only 1 slot remaining on:\n` +
                   `📅 ${dateFormatted} (${dayName})\n\n` +
                   `Book now before it's gone: /book`;
        } else {
          message = `🟠 *Slot Update*\n\n` +
                   `A slot was just booked on:\n` +
                   `📅 ${dateFormatted} (${dayName})\n\n` +
                   `Remaining slots: ${remainingSlots}/5\n\n` +
                   `Book your slot: /book`;
        }
      }

      // Send to all users
      let sentCount = 0;
      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegram_id, message, {
            parse_mode: 'Markdown'
          });
          sentCount++;
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          console.error(`Failed to send notification to user ${user.id}:`, err.message);
        }
      }

      console.log(`Slot update broadcast sent to ${sentCount} users`);
    } catch (error) {
      console.error('Error broadcasting slot update:', error);
    }
  }

  async getDateSlotCount(date) {
    try {
      const provider = await User.query()
        .where('role', 'provider')
        .where('is_active', true)
        .first();
      
      if (!provider) return 5;

      const appointments = await Appointment.query()
        .where('provider_id', provider.id)
        .where('appointment_datetime', '>=', `${date} 00:00:00`)
        .where('appointment_datetime', '<=', `${date} 23:59:59`)
        .whereIn('status', ['scheduled', 'confirmed']);

      return 5 - appointments.length;
    } catch (error) {
      console.error('Error getting slot count:', error);
      return 5;
    }
  }


  start() {
    this.bot.launch();
    
    // Start the reminder scheduler
    const ReminderScheduler = require('../services/ReminderScheduler');
    this.reminderScheduler = new ReminderScheduler(this.bot);
    this.reminderScheduler.start();
    
    console.log('📱 Lodge Mobile Activations Bot started successfully!');
    console.log('✨ Features: 90-minute appointment blocks, conflict prevention');
    console.log('🔔 Reminders: 12hr, 3hr, 1hr, 30min before appointments');
    console.log('🏢 Service Category: Lodge Mobile Activations only');
    
    process.once('SIGINT', () => {
      if (this.reminderScheduler) this.reminderScheduler.stop();
      this.bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      if (this.reminderScheduler) this.reminderScheduler.stop();
      this.bot.stop('SIGTERM');
    });
  }
  
  async showInfoReview(ctx, customerInfo, lang) {
    // Format the info for review with professional layout
    let infoText = '*Personal Information*\n';
    infoText += `• First Name: ${customerInfo.firstName}\n`;
    if (customerInfo.middleName && customerInfo.middleName !== 'skip') {
      infoText += `• Middle Name: ${customerInfo.middleName}\n`;
    }
    infoText += `• Last Name: ${customerInfo.lastName}\n`;
    infoText += `• Date of Birth: ${customerInfo.dob}\n`;
    infoText += `\n*Contact Information*\n`;
    infoText += `• Email: ${customerInfo.email}\n`;
    infoText += `\n*Billing Address*\n`;
    infoText += `• Street: ${customerInfo.streetNumber} ${customerInfo.streetAddress}\n`;
    infoText += `• City: ${customerInfo.city}\n`;
    infoText += `• Province: ${customerInfo.province}\n`;
    infoText += `• Postal Code: ${customerInfo.postalCode}\n`;
    
    infoText += `\n*Identification*\n`;
    if (customerInfo.driversLicense) {
      infoText += `• License #: ${customerInfo.driversLicense}\n`;
      if (customerInfo.dlIssued) infoText += `• Issued: ${customerInfo.dlIssued}\n`;
      if (customerInfo.dlExpiry) infoText += `• Expires: ${customerInfo.dlExpiry}\n`;
    } else {
      infoText += `• Driver's License will be provided\n`;
    }
    
    const reviewMessage = getText(lang, 'info_review', { info: infoText });
    
    await ctx.reply(reviewMessage, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(getText(lang, 'btn_confirm'), 'info_confirm'),
          Markup.button.callback(getText(lang, 'btn_edit'), 'info_edit')
        ]
      ]).reply_markup
    });
  }
  
  async proceedToDateSelection(ctx) {
    const booking = ctx.session.booking;
    const userId = ctx.from.id.toString();
    const referralData = this.getReferralData();
    const lang = getUserLanguage(userId, referralData);
    
    // Check if this is a "New Registration" service
    let isNewRegistration = false;
    let minDaysAhead = 0; // Default: can book today
    
    if (booking.serviceId) {
      const service = await Service.query().findById(booking.serviceId);
      if (service && service.name && service.name.toLowerCase().includes('new registration')) {
        isNewRegistration = true;
        minDaysAhead = 1; // Default: Must book at least 24 hours ahead (next day)
        
        // Check how many new registrations are already booked for tomorrow
        const tomorrow = moment().tz('America/New_York').add(1, 'day').format('YYYY-MM-DD');
        
        // Get provider
        const provider = await User.query()
          .where('role', 'provider')
          .where('is_active', true)
          .first();
        
        if (provider) {
          // Count new registration appointments for tomorrow
          const tomorrowNewRegs = await Appointment.query()
            .where('provider_id', provider.id)
            .where('appointment_datetime', '>=', `${tomorrow} 00:00:00`)
            .where('appointment_datetime', '<=', `${tomorrow} 23:59:59`)
            .whereIn('status', ['scheduled', 'confirmed'])
            .withGraphFetched('[service]')
            .modifyGraph('service', builder => {
              builder.whereRaw('LOWER(name) LIKE ?', ['%new registration%']);
            });
          
          // Filter to only count actual new registration appointments
          const newRegCount = tomorrowNewRegs.filter(apt => 
            apt.service && apt.service.name.toLowerCase().includes('new registration')
          ).length;
          
          // If 5 or more new registrations tomorrow, push to 2 days ahead
          if (newRegCount >= 5) {
            minDaysAhead = 2; // Must book 2 days ahead
          }
        }
      }
    }
    
    // Show appropriate message based on restriction
    if (isNewRegistration) {
      if (minDaysAhead === 2) {
        await ctx.reply(
          '⚠️ *New Registration Notice*\n\n' +
          'Due to high demand, new registration appointments must be booked at least 2 days in advance.\n' +
          'Tomorrow is fully booked with new registrations.\n\n' +
          'You can only select dates starting from ' + 
          moment().tz('America/New_York').add(2, 'days').format('MMMM DD, YYYY') + '.',
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          '⚠️ *New Registration Notice*\n\n' +
          'As a new registration, appointments must be booked at least 24 hours in advance.\n' +
          'You can only select dates starting from tomorrow.',
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    // Date selection - only show Monday to Saturday and exclude blocked dates
    const dates = [];
    const blockedDates = this.getBlockedDates();
    
    for (let i = minDaysAhead; i <= 21; i++) {
      const date = moment().tz('America/New_York').add(i, 'days');
      const dayOfWeek = date.day();
      const dateStr = date.format('YYYY-MM-DD');
      
      // Skip Sundays (day 0)
      if (dayOfWeek === 0) continue;
      
      // Skip blocked dates
      if (blockedDates.includes(dateStr)) continue;
      
      dates.push([
        Markup.button.callback(
          date.format('MMM DD (ddd)'),
          `date_${dateStr}`
        )
      ]);
      
      // Limit to 7 dates shown
      if (dates.length >= 7) break;
    }
    
    await ctx.reply(
      getText(lang, 'select_date'),
      Markup.inlineKeyboard(dates)
    );
  }
}

module.exports = EnhancedTelegramBot;