const { Markup } = require('telegraf');
const User = require('../../models/User');
const SupportTicket = require('../../models/SupportTicket');

class SupportCommand {
  constructor(bot, services) {
    this.bot = bot;
    this.supportService = services.supportService;
    this.adminIds = services.adminIds || [];
  }

  getName() {
    return 'support';
  }

  getDescription() {
    return 'Get support help and create tickets';
  }

  async execute(ctx) {
    try {
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
        if (!user) {
          return ctx.reply('Sorry, unable to access support. Please try /start first.');
        }
      }

      const supportMessage = `
🎧 *Support Center*

Hello ${user.first_name}! How can we help you today?

Choose an option below or use these commands:
• /ticket [subject] - Create a new support ticket
• /mystatus - Check your ticket status
      `;

      await ctx.replyWithMarkdown(supportMessage, this.supportService.generateUserSupportKeyboard());
    } catch (error) {
      console.error('Support command error:', error);
      ctx.reply('Sorry, support is temporarily unavailable. Please try again later.');
    }
  }

  async handleCreateTicket(ctx) {
    try {
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
        if (!user) {
          return ctx.reply('Sorry, unable to create ticket. Please try /start first.');
        }
      }

      const args = ctx.message.text.split(' ');
      
      if (args.length < 3) {
        return ctx.reply(
          'Please provide a subject and message for your ticket.\n\n' +
          'Format: /ticket [subject] [message]\n' +
          'Example: /ticket "Booking Issue" "I cannot see my appointment"'
        );
      }

      const fullText = ctx.message.text.substring(8); // Remove '/ticket '
      const parts = fullText.match(/^"([^"]+)"\s+(.+)$/) || fullText.match(/^(\S+)\s+(.+)$/);
      
      if (!parts) {
        return ctx.reply('Please use the correct format: /ticket [subject] [message]');
      }

      const subject = parts[1];
      const message = parts[2];

      const ticket = await this.supportService.createTicket(user.id, subject, message, 'medium');

      await ctx.reply(
        `✅ *Support Ticket Created Successfully!*\n\n` +
        `Ticket ID: \`${ticket.ticket_id}\`\n` +
        `Subject: ${subject}\n` +
        `Priority: Medium\n\n` +
        `Our support team will respond soon. Use /mystatus to check updates.`,
        { parse_mode: 'Markdown' }
      );

      await this.notifyAdminsNewTicket(ticket);
    } catch (error) {
      console.error('Create ticket error:', error);
      ctx.reply('Sorry, I couldn\'t create your support ticket. Please try again.');
    }
  }

  async handleTicketStatus(ctx) {
    try {
      const user = await this.getUser(ctx.from.id);
      if (!user) {
        return ctx.reply('Please start the bot first with /start');
      }

      const tickets = await this.supportService.getUserTickets(user.id, null, 5);

      if (tickets.length === 0) {
        return ctx.reply('You have no support tickets. Use /ticket to create one if you need help.');
      }

      let message = `📊 *Your Support Tickets:*\n\n`;
      
      tickets.forEach((ticket, index) => {
        message += this.supportService.formatTicketForDisplay(ticket);
        if (index < tickets.length - 1) message += '\n---\n';
      });

      message += `\n\n💡 Use /ticket to create a new support request.`;

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('My status error:', error);
      ctx.reply('Sorry, I couldn\'t fetch your ticket status. Please try again.');
    }
  }

  // Support button handlers
  async handleSupportCreateTicket(ctx) {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'To create a support ticket, use the command:\n\n' +
        '/ticket "Your Subject" Your detailed message here\n\n' +
        'Example:\n/ticket "Booking Problem" "I cannot see my appointment for tomorrow"'
      );
    } catch (error) {
      console.error('Support create ticket action error:', error);
    }
  }

  async handleSupportMyTickets(ctx) {
    try {
      await ctx.answerCbQuery();
      const user = await this.getUser(ctx.from.id);
      const tickets = await this.supportService.getUserTickets(user.id, null, 3);

      if (tickets.length === 0) {
        await ctx.editMessageText('You have no support tickets. Use /ticket to create one.');
        return;
      }

      let message = `📊 *Your Recent Tickets:*\n\n`;
      tickets.forEach(ticket => {
        message += this.supportService.formatTicketForDisplay(ticket) + '\n';
      });

      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Support my tickets action error:', error);
    }
  }

  async handleSupportFAQ(ctx) {
    try {
      await ctx.answerCbQuery();
      const faqMessage = `
❓ *Frequently Asked Questions*

*Q: How do I book an appointment?*
A: Use the /book command and follow the steps.

*Q: How do I cancel my appointment?*
A: Use /cancel followed by your appointment ID.

*Q: How do I view my appointments?*
A: Use the /myappointments command.

*Q: How do I get support?*
A: Use /ticket to create a support ticket or /support for help.

*Q: How long does support take?*
A: We typically respond within 24 hours during business hours.

Need more help? Use /ticket to create a support ticket.
      `;

      await ctx.editMessageText(faqMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Support FAQ action error:', error);
    }
  }

  // Helper methods
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

  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first()
        .catch(() => null);

      if (!user) {
        user = await User.createTelegramUser(telegramUser, 'pending');
      }
      return user;
    } catch (error) {
      console.error('Error in registerUser:', error);
      return null;
    }
  }

  async notifyAdminsNewTicket(ticket) {
    try {
      // Collect all admin IDs (from env and adminIds array)
      const allAdminIds = new Set(this.adminIds);
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
      if (ADMIN_TELEGRAM_ID) {
        allAdminIds.add(ADMIN_TELEGRAM_ID);
      }

      if (allAdminIds.size === 0) {
        console.warn('⚠️ No admin IDs configured for ticket notifications');
        return;
      }

      const priorityEmoji = {
        low: '🟢',
        medium: '🟡',
        high: '🔴',
        critical: '🚨'
      };

      const message = `🎫 *New Support Ticket*\n\n` +
        `🆔 Ticket ID: \`${ticket.ticket_id}\`\n` +
        `📋 Subject: ${ticket.subject || 'No subject'}\n` +
        `${priorityEmoji[ticket.priority] || '🟡'} Priority: ${(ticket.priority || 'medium').toUpperCase()}\n` +
        `📝 Message: ${(ticket.message || 'No message').substring(0, 100)}${ticket.message?.length > 100 ? '...' : ''}\n\n` +
        `⏰ Please respond within 6 hours.`;

      for (const adminId of allAdminIds) {
        try {
          await this.bot.telegram.sendMessage(adminId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👁️ View Ticket', callback_data: `admin_ticket_view_${ticket.ticket_id}` }],
                [{ text: '🎫 All Tickets', callback_data: 'admin_tickets' }]
              ]
            }
          });
          console.log(`✅ Ticket notification sent to admin ${adminId}`);
        } catch (error) {
          console.error(`Failed to notify admin ${adminId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error notifying admins about new ticket:', error);
    }
  }
}

module.exports = SupportCommand;