/**
 * Admin Tickets Handler
 * Handles admin-related support ticket management callbacks
 */

const { safeAnswerCbQuery, isAdmin } = require('../utils/CallbackUtils');

class AdminTicketsHandler {
  constructor(services = {}, bot = null) {
    this.services = services;
    this.bot = bot;
    this.supportHandler = null; // Will be set by main handler
  }

  /**
   * Set bot instance
   */
  setBot(bot) {
    this.bot = bot;
  }

  /**
   * Set support handler for accessing pending replies
   */
  setSupportHandler(supportHandler) {
    this.supportHandler = supportHandler;
  }

  /**
   * Check admin access
   */
  checkAdminAccess(ctx) {
    const adminIds = this.services.adminIds || [];
    return isAdmin(ctx, adminIds);
  }

  /**
   * Handle admin tickets list with pagination
   */
  async handleAdminTicketsList(ctx, page = 0) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');
      const TICKETS_PER_PAGE = 5;

      // Get total count first
      const countResult = await SupportTicket.query()
        .whereIn('status', ['open', 'assigned', 'escalated'])
        .count('* as count')
        .first();
      const totalTickets = parseInt(countResult?.count) || 0;
      const totalPages = Math.ceil(totalTickets / TICKETS_PER_PAGE);

      // Ensure page is within bounds
      if (page < 0) page = 0;
      if (page >= totalPages && totalPages > 0) page = totalPages - 1;

      // Fetch tickets for current page
      const tickets = await SupportTicket.query()
        .whereIn('status', ['open', 'assigned', 'escalated'])
        .withGraphFetched('[user]')
        .orderBy('created_at', 'desc')
        .limit(TICKETS_PER_PAGE)
        .offset(page * TICKETS_PER_PAGE);

      if (totalTickets === 0) {
        await ctx.editMessageText(
          '🎫 *Support Tickets*\n\nNo open support tickets at this time.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Refresh', callback_data: 'admin_tickets_0' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      // Build message with page info
      let message = `🎫 *Support Tickets*\n`;
      message += `📊 ${totalTickets} open ticket${totalTickets !== 1 ? 's' : ''}`;
      if (totalPages > 1) {
        message += ` • Page ${page + 1}/${totalPages}`;
      }
      message += `\n\n`;

      const inlineKeyboard = [];

      tickets.forEach((ticket) => {
        const statusEmoji = ticket.getStatusEmoji();
        const priorityEmoji = ticket.getPriorityEmoji();
        const userName = ticket.user ? `${ticket.user.first_name || ''} ${ticket.user.last_name || ''}`.trim() : 'Unknown';
        const ageHours = ticket.getAgeInHours();
        const ageDisplay = ageHours < 24 ? `${ageHours}h ago` : `${Math.floor(ageHours / 24)}d ago`;

        message += `${statusEmoji} *${ticket.ticket_id}*\n`;
        message += `   ${priorityEmoji} ${ticket.priority} | ${ageDisplay}\n`;
        message += `   👤 ${userName}\n`;
        message += `   📝 ${(ticket.subject || 'No subject').substring(0, 30)}${ticket.subject?.length > 30 ? '...' : ''}\n\n`;

        // Add view button for each ticket
        inlineKeyboard.push([
          { text: `👁️ View ${ticket.ticket_id}`, callback_data: `admin_ticket_view_${ticket.ticket_id}` }
        ]);
      });

      // Add pagination buttons if there are multiple pages
      if (totalPages > 1) {
        const paginationRow = [];

        // Previous button
        if (page > 0) {
          paginationRow.push({ text: '◀️ Prev', callback_data: `admin_tickets_${page - 1}` });
        }

        // Page indicator
        paginationRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });

        // Next button
        if (page < totalPages - 1) {
          paginationRow.push({ text: 'Next ▶️', callback_data: `admin_tickets_${page + 1}` });
        }

        inlineKeyboard.push(paginationRow);
      }

      // Add action buttons
      inlineKeyboard.push([{ text: '🔄 Refresh', callback_data: `admin_tickets_${page}` }]);
      if (totalTickets > 0) {
        inlineKeyboard.push([{ text: '🗑️ Close All Tickets', callback_data: 'admin_close_all_tickets' }]);
      }
      inlineKeyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });

      return true;

    } catch (error) {
      console.error('Error loading support tickets:', error);
      await ctx.editMessageText('❌ Error loading support tickets. Please try again.');
      return true;
    }
  }

  /**
   * Handle close all tickets confirmation
   */
  async handleCloseAllTicketsConfirm(ctx) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');

      // Count open tickets
      const openTickets = await SupportTicket.query()
        .whereIn('status', ['open', 'assigned', 'escalated'])
        .count('* as count')
        .first();

      const count = parseInt(openTickets.count) || 0;

      if (count === 0) {
        await ctx.editMessageText(
          '✅ No open tickets to close.\n\nAll tickets are already closed.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      await ctx.editMessageText(
        `⚠️ *Close All Tickets*\n\n` +
        `Are you sure you want to close *${count}* open ticket(s)?\n\n` +
        `This action cannot be undone.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, Close All', callback_data: 'admin_close_all_tickets_yes' }],
              [{ text: '❌ Cancel', callback_data: 'admin_tickets' }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error in close all tickets confirmation:', error);
      await ctx.editMessageText('❌ Error. Please try again.');
      return true;
    }
  }

  /**
   * Execute close all tickets
   */
  async handleCloseAllTicketsExecute(ctx) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');

      // Close all open tickets
      const result = await SupportTicket.query()
        .whereIn('status', ['open', 'assigned', 'escalated'])
        .patch({
          status: 'closed'
        });

      const closedCount = result || 0;

      console.log(`✅ Admin closed ${closedCount} tickets`);

      await ctx.editMessageText(
        `✅ *Tickets Closed*\n\n` +
        `Successfully closed ${closedCount} ticket(s).`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎫 View Tickets', callback_data: 'admin_tickets' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return true;

    } catch (error) {
      console.error('Error closing all tickets:', error);
      await ctx.editMessageText(
        '❌ Error closing tickets. Please try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
            ]
          }
        }
      );
      return true;
    }
  }

  /**
   * Handle admin view single ticket
   */
  async handleAdminViewTicket(ctx, ticketId) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');
      const SupportMessage = require('../../../models/SupportMessage');

      const ticket = await SupportTicket.findByTicketId(ticketId);

      if (!ticket) {
        await ctx.editMessageText('❌ Ticket not found.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
            ]
          }
        });
        return true;
      }

      // Get recent messages
      const messages = await SupportMessage.findByTicketId(ticketId, 5, true);

      const statusEmoji = ticket.getStatusEmoji();
      const priorityEmoji = ticket.getPriorityEmoji();
      const userName = ticket.user ? `${ticket.user.first_name || ''} ${ticket.user.last_name || ''}`.trim() : 'Unknown';
      const createdAt = new Date(ticket.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      let ticketMessage = `🎫 *Ticket: ${ticket.ticket_id}*\n\n`;
      ticketMessage += `${statusEmoji} Status: *${ticket.status}*\n`;
      ticketMessage += `${priorityEmoji} Priority: *${ticket.priority}*\n`;
      ticketMessage += `👤 User: ${userName}\n`;
      ticketMessage += `📅 Created: ${createdAt}\n`;

      if (ticket.category) {
        ticketMessage += `${ticket.getCategoryEmoji()} Category: ${ticket.category}\n`;
      }

      ticketMessage += `\n📋 *Subject:*\n${ticket.subject || 'No subject'}\n`;
      ticketMessage += `\n💬 *Message:*\n${ticket.message || 'No message content'}\n`;

      // Show recent messages if any
      if (messages.length > 0) {
        ticketMessage += `\n📨 *Recent Messages:*\n`;
        messages.slice(0, 3).reverse().forEach(msg => {
          const senderEmoji = msg.getSenderEmoji();
          const msgTime = new Date(msg.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit'
          });
          ticketMessage += `${senderEmoji} [${msgTime}] ${msg.message_text.substring(0, 50)}${msg.message_text.length > 50 ? '...' : ''}\n`;
        });
      }

      // Build action buttons based on ticket status
      const actionButtons = [];

      // Status change buttons
      if (ticket.status !== 'closed') {
        const statusButtons = [];
        if (ticket.status === 'open') {
          statusButtons.push({ text: '🔵 Assign', callback_data: `admin_ticket_status_${ticketId}_assigned` });
        }
        statusButtons.push({ text: '🟢 Close', callback_data: `admin_ticket_status_${ticketId}_closed` });
        if (ticket.status !== 'escalated') {
          statusButtons.push({ text: '🔴 Escalate', callback_data: `admin_ticket_status_${ticketId}_escalated` });
        }
        actionButtons.push(statusButtons);
      } else {
        actionButtons.push([{ text: '🔄 Reopen', callback_data: `admin_ticket_status_${ticketId}_open` }]);
      }

      // Reply button
      actionButtons.push([{ text: '💬 Reply to User', callback_data: `admin_ticket_reply_${ticketId}` }]);

      // Navigation
      actionButtons.push([{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]);

      await ctx.editMessageText(ticketMessage, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: actionButtons }
      });

      return true;

    } catch (error) {
      console.error('Error viewing ticket:', error);
      await ctx.editMessageText('❌ Error loading ticket details.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
          ]
        }
      });
      return true;
    }
  }

  /**
   * Handle admin ticket status change
   */
  async handleAdminTicketStatusChange(ctx, ticketId, newStatus) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');
      const SupportMessage = require('../../../models/SupportMessage');
      const User = require('../../../models/User');

      const ticket = await SupportTicket.query()
        .where('ticket_id', ticketId)
        .withGraphFetched('[user]')
        .first();

      if (!ticket) {
        await ctx.editMessageText('❌ Ticket not found.');
        return true;
      }

      const oldStatus = ticket.status;

      // Update ticket status
      const updateData = {
        status: newStatus
      };

      if (newStatus === 'assigned') {
        // Look up admin user's database ID from their Telegram ID
        const adminUser = await User.query()
          .where('telegram_id', ctx.from.id)
          .first();

        if (adminUser) {
          updateData.agent_id = adminUser.id;
        }
      }

      await SupportTicket.query()
        .where('ticket_id', ticketId)
        .patch(updateData);

      // Log system message about status change
      try {
        await SupportMessage.createSystemMessage(
          ticketId,
          `Ticket status changed from ${oldStatus} to ${newStatus} by admin`,
          ctx.from.id
        );
      } catch (msgError) {
        console.error('Error creating system message:', msgError);
      }

      // Notify user about status change
      if (ticket.user?.telegram_id && this.bot) {
        const statusMessages = {
          'assigned': '👋 Your support ticket has been assigned to an agent. We\'ll respond soon!',
          'closed': '✅ Your support ticket has been resolved and closed. If you need further help, please create a new ticket.',
          'escalated': '🔴 Your ticket has been escalated for priority handling.',
          'open': '🔄 Your ticket has been reopened. We\'ll continue assisting you.'
        };

        try {
          await this.bot.telegram.sendMessage(
            ticket.user.telegram_id,
            `📢 *Ticket Update: ${ticket.ticket_id}*\n\n${statusMessages[newStatus] || `Status changed to: ${newStatus}`}`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.error('Failed to notify user about ticket status change:', notifyError);
        }
      }

      const statusEmoji = {
        'open': '🟠',
        'assigned': '🔵',
        'closed': '🟢',
        'escalated': '🔴'
      };

      await ctx.editMessageText(
        `${statusEmoji[newStatus] || '⚪'} *Ticket Status Updated*\n\n` +
        `🎫 Ticket: ${ticketId}\n` +
        `📊 Status: ${oldStatus} → ${newStatus}\n` +
        `👤 User notified: ${ticket.user?.telegram_id ? 'Yes' : 'No'}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👁️ View Ticket', callback_data: `admin_ticket_view_${ticketId}` }],
              [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error changing ticket status:', error);
      await ctx.editMessageText('❌ Error changing ticket status.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
          ]
        }
      });
      return true;
    }
  }

  /**
   * Handle admin reply prompt for ticket
   */
  async handleAdminTicketReplyPrompt(ctx, ticketId) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');

      const ticket = await SupportTicket.query()
        .where('ticket_id', ticketId)
        .withGraphFetched('[user]')
        .first();

      if (!ticket) {
        await ctx.editMessageText('❌ Ticket not found.');
        return true;
      }

      // Store ticket ID in session for reply handling
      ctx.session = ctx.session || {};
      ctx.session.adminReplyTicket = ticketId;
      ctx.session.adminReplyUserId = ticket.user?.telegram_id;

      await ctx.editMessageText(
        `💬 *Reply to Ticket ${ticketId}*\n\n` +
        `👤 User: ${ticket.user?.first_name || 'Unknown'} ${ticket.user?.last_name || ''}\n\n` +
        `Please type your reply message. The next text message you send will be forwarded to the user.\n\n` +
        `_Send /cancel to cancel the reply_`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel Reply', callback_data: `admin_ticket_view_${ticketId}` }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error preparing ticket reply:', error);
      await ctx.editMessageText('❌ Error preparing reply.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
          ]
        }
      });
      return true;
    }
  }

  /**
   * Handle admin ticket reply text input
   */
  async handleAdminTicketReply(ctx) {
    const ticketId = ctx.session?.adminReplyTicket;
    const replyToUserId = ctx.session?.adminReplyUserId;

    if (!ticketId) {
      return false;
    }

    const replyText = ctx.message?.text?.trim();
    if (!replyText) {
      return false;
    }

    try {
      const SupportTicket = require('../../../models/SupportTicket');
      const SupportMessage = require('../../../models/SupportMessage');

      // Get the ticket with user relation
      const ticket = await SupportTicket.query()
        .where('ticket_id', ticketId)
        .withGraphFetched('[user]')
        .first();

      if (!ticket) {
        await ctx.reply('❌ Ticket not found.');
        ctx.session.adminReplyTicket = null;
        ctx.session.adminReplyUserId = null;
        return true;
      }

      // Save the reply as a support message
      try {
        await SupportMessage.query().insert({
          ticket_id: ticketId,
          sender_type: 'agent',
          sender_id: ctx.from.id,
          message: replyText
        });
        console.log(`✅ Reply message saved to database for ticket ${ticketId}`);
      } catch (msgErr) {
        console.log('Note: Could not save message to support_messages table:', msgErr.message);
      }

      // Update ticket status to 'assigned' if it's currently 'open'
      if (ticket.status === 'open') {
        try {
          await SupportTicket.query()
            .where('ticket_id', ticketId)
            .patch({
              status: 'assigned',
              agent_id: ctx.from.id
            });
          console.log(`✅ Ticket ${ticketId} status updated to 'assigned'`);
        } catch (statusErr) {
          console.error('Failed to update ticket status:', statusErr.message);
        }
      }

      // Get the user's telegram_id for notification
      const userTelegramId = ticket.user?.telegram_id || replyToUserId;

      // Send the reply to the user with a reply button
      if (userTelegramId && this.bot) {
        try {
          await this.bot.telegram.sendMessage(
            userTelegramId,
            `📬 *Reply to Your Support Ticket*\n\n` +
            `*Ticket:* ${ticketId}\n` +
            `*Subject:* ${ticket.subject || 'No subject'}\n\n` +
            `*Response from Support:*\n${replyText}\n\n` +
            `👇 *To reply, click the button below:*`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💬 Reply to Ticket', callback_data: `user_reply_${ticketId}` }],
                  [{ text: '📋 View My Tickets', callback_data: 'support_my_tickets' }]
                ]
              }
            }
          );
          console.log(`✅ Admin reply sent to user ${userTelegramId} for ticket ${ticketId}`);

          // Store pending reply state for this user
          if (this.supportHandler) {
            this.supportHandler.setPendingReply(userTelegramId, ticketId, ticket.subject);
            console.log(`📝 Stored pending reply state for user ${userTelegramId}, ticket ${ticketId}`);
          }
        } catch (sendErr) {
          console.error('Failed to send reply to user:', sendErr.message);
          await ctx.reply(`⚠️ Reply saved but could not notify user: ${sendErr.message}`);
        }
      } else {
        console.log(`⚠️ Could not notify user - no telegram_id found. replyToUserId=${replyToUserId}, ticket.user=${JSON.stringify(ticket.user)}`);
        await ctx.reply(`⚠️ Reply saved but user could not be notified (no Telegram ID on record).`);
      }

      // Clear the reply session
      ctx.session.adminReplyTicket = null;
      ctx.session.adminReplyUserId = null;

      // Confirm to admin
      await ctx.reply(
        `✅ *Reply Sent!*\n\n` +
        `Your reply to ticket ${ticketId} has been sent to the user.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View Ticket', callback_data: `admin_ticket_view_${ticketId}` }],
              [{ text: '← Back to Tickets', callback_data: 'admin_tickets' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error processing admin reply:', error);
      await ctx.reply('❌ Error sending reply. Please try again.');
      ctx.session.adminReplyTicket = null;
      ctx.session.adminReplyUserId = null;
      return true;
    }
  }
}

module.exports = AdminTicketsHandler;
