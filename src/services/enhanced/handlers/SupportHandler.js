/**
 * Support Handler
 * Handles all support-related callback queries: ticket creation, viewing, replies
 */

const { escapeMarkdown, safeAnswerCbQuery } = require('../utils/CallbackUtils');

class SupportHandler {
  constructor(services = {}, bot = null) {
    this.services = services;
    this.bot = bot;
    this.pendingUserReplies = new Map();
  }

  /**
   * Set bot instance (can be called after construction)
   */
  setBot(bot) {
    this.bot = bot;
  }

  /**
   * Main handler for support callbacks
   */
  async handle(ctx, callbackData) {
    await safeAnswerCbQuery(ctx, 'Loading...');

    try {
      // Handle user reply to ticket (starts reply flow)
      if (callbackData.startsWith('user_reply_')) {
        const ticketId = callbackData.replace('user_reply_', '');
        return await this.handleUserReplyPrompt(ctx, ticketId);
      }

      // Handle user reply confirmation
      if (callbackData.startsWith('user_reply_send_')) {
        const ticketId = callbackData.replace('user_reply_send_', '');
        return await this.handleUserReplyConfirm(ctx, ticketId);
      }

      switch (callbackData) {
        case 'support_main':
          return await this.showMainMenu(ctx);

        case 'support_create_ticket':
          return await this.startTicketCreation(ctx);

        case 'support_ticket_confirm':
          return await this.handleSupportTicketConfirm(ctx);

        case 'support_ticket_edit_subject':
          return await this.editTicketSubject(ctx);

        case 'support_ticket_edit_message':
          return await this.editTicketMessage(ctx);

        case 'support_my_tickets':
          return await this.handleUserTicketsList(ctx);

        case 'support_ticket_status':
          return await this.showTicketStatusInfo(ctx);

        case 'support_faq':
          return await this.showFAQ(ctx);

        default:
          await ctx.editMessageText('Support system is available. Use /support for help or /ticket to create a support request.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📱 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          });
          return true;
      }
    } catch (error) {
      console.error('Support handler error:', error);
      await ctx.editMessageText('Support temporarily unavailable. Please use /support command.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Main Menu', callback_data: 'main_menu' }]
          ]
        }
      });
      return true;
    }
  }

  /**
   * Show main support menu
   */
  async showMainMenu(ctx) {
    const supportMessage = `
🎧 *Support Center*

How can we help you today?

Choose an option below:`;

    await ctx.editMessageText(supportMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎫 Create Ticket', callback_data: 'support_create_ticket' }],
          [{ text: '📋 My Tickets', callback_data: 'support_my_tickets' }],
          [{ text: '❓ FAQ', callback_data: 'support_faq' }],
          [{ text: '← Back to Menu', callback_data: 'main_menu' }]
        ]
      }
    });
    return true;
  }

  /**
   * Start ticket creation flow
   */
  async startTicketCreation(ctx) {
    ctx.session.support = {
      flow: 'ticket_creation',
      step: 'subject',
      data: { subject: null, message: null },
      awaitingInput: true,
      pendingInput: null
    };

    await ctx.editMessageText(
      '📝 *Create Support Ticket*\n\n' +
      'Step 1 of 2: *Subject*\n\n' +
      'What is the subject of your issue?\n\n' +
      '_Type your response below:_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'support_main' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Edit ticket subject
   */
  async editTicketSubject(ctx) {
    ctx.session.support = {
      ...ctx.session.support,
      step: 'subject',
      awaitingInput: true,
      pendingInput: null
    };
    await ctx.editMessageText(
      '📝 *Edit Subject*\n\n' +
      'What is the subject of your issue?\n\n' +
      '_Type your new subject below:_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'support_main' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Edit ticket message
   */
  async editTicketMessage(ctx) {
    ctx.session.support = {
      ...ctx.session.support,
      step: 'message',
      awaitingInput: true,
      pendingInput: null
    };
    await ctx.editMessageText(
      '📝 *Edit Message*\n\n' +
      `Subject: *${ctx.session.support?.data?.subject || 'Not set'}*\n\n` +
      'Please describe your issue in detail:\n\n' +
      '_Type your new message below:_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'support_main' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Show ticket status info
   */
  async showTicketStatusInfo(ctx) {
    await ctx.editMessageText(
      '🔍 *Check Ticket Status*\n\n' +
      'To check the status of a specific ticket, use:\n' +
      '`/ticketstatus TICKET-ID`\n\n' +
      'Or view all your tickets below:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 View All My Tickets', callback_data: 'support_my_tickets' }],
            [{ text: '← Back to Support', callback_data: 'support_main' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Show FAQ
   */
  async showFAQ(ctx) {
    const faqMessage = `
❓ *Frequently Asked Questions*

*Q: How do I book an appointment?*
A: Use the /book command and follow the steps.

*Q: How do I cancel my appointment?*
A: Use /cancel followed by your appointment ID.

*Q: How do I view my appointments?*
A: Use the /myappointments command.

*Q: How do I get support?*
A: Use /support for help or /ticket to create a support ticket.

*Q: What are your business hours?*
A: Monday-Saturday, 11 AM - 6 PM EST

Need more help? Use /ticket to create a support ticket.
    `;

    await ctx.editMessageText(faqMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '← Back to Support', callback_data: 'support_main' }]
        ]
      }
    });
    return true;
  }

  /**
   * Handle support ticket text input (subject/message)
   */
  async handleSupportInput(ctx) {
    const text = ctx.message?.text?.trim();
    if (!text) {
      return false;
    }

    // Check for pending reply (user responding to admin message without clicking button)
    const userId = ctx.from?.id?.toString();
    if (this.pendingUserReplies && this.pendingUserReplies.has(userId)) {
      const pendingReply = this.pendingUserReplies.get(userId);
      // Check if pending reply is less than 24 hours old
      const ageHours = (Date.now() - pendingReply.timestamp) / (1000 * 60 * 60);
      if (ageHours < 24) {
        console.log(`📝 Found pending reply for user ${userId}, ticket ${pendingReply.ticketId}`);
        // Set up session for reply
        ctx.session = ctx.session || {};
        ctx.session.support = {
          flow: 'ticket_reply',
          step: 'reply',
          data: { ticketId: pendingReply.ticketId },
          awaitingInput: true
        };
        ctx.session.userReplyTicket = pendingReply.ticketId;
        // Remove pending reply since we're handling it
        this.pendingUserReplies.delete(userId);
        // Process as reply
        return await this.handleUserReplyInput(ctx);
      } else {
        // Expired, remove it
        this.pendingUserReplies.delete(userId);
      }
    }

    if (!ctx.session?.support?.awaitingInput) {
      return false;
    }

    const step = ctx.session.support.step;

    try {
      if (step === 'subject') {
        // Validate subject
        if (text.length < 3) {
          await ctx.reply('❌ Subject must be at least 3 characters. Please try again:');
          return true;
        }
        if (text.length > 100) {
          await ctx.reply('❌ Subject is too long (max 100 characters). Please try again:');
          return true;
        }

        // Save subject and move to message step
        ctx.session.support.data.subject = text;
        ctx.session.support.step = 'message';
        ctx.session.support.awaitingInput = true;

        await ctx.reply(
          '📝 *Create Support Ticket*\n\n' +
          'Step 2 of 2: *Message*\n\n' +
          `Subject: *${text}*\n\n` +
          'Now please describe your issue in detail:\n\n' +
          '_Type your message below:_',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'support_main' }]
              ]
            }
          }
        );
        return true;

      } else if (step === 'message') {
        // Validate message
        if (text.length < 10) {
          await ctx.reply('❌ Please provide more detail (at least 10 characters):');
          return true;
        }

        // Save message and show confirmation
        ctx.session.support.data.message = text;
        ctx.session.support.step = 'confirm';
        ctx.session.support.awaitingInput = false;

        const subject = ctx.session.support.data.subject;

        await ctx.reply(
          '📝 *Review Your Ticket*\n\n' +
          `*Subject:*\n${subject}\n\n` +
          `*Message:*\n${text}\n\n` +
          'Please confirm to submit your ticket:',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Submit Ticket', callback_data: 'support_ticket_confirm' }],
                [
                  { text: '✏️ Edit Subject', callback_data: 'support_ticket_edit_subject' },
                  { text: '✏️ Edit Message', callback_data: 'support_ticket_edit_message' }
                ],
                [{ text: '❌ Cancel', callback_data: 'support_main' }]
              ]
            }
          }
        );
        return true;

      } else if (step === 'reply') {
        // User is replying to a ticket - delegate to handleUserReplyInput
        return await this.handleUserReplyInput(ctx);
      }

      return false;
    } catch (error) {
      console.error('Support input error:', error);
      await ctx.reply('❌ Error processing your input. Please try again or use /support');
      return true;
    }
  }

  /**
   * Handle support ticket confirmation - create the ticket
   */
  async handleSupportTicketConfirm(ctx) {
    try {
      const supportData = ctx.session?.support?.data;

      if (!supportData?.subject || !supportData?.message) {
        await ctx.editMessageText(
          '❌ Missing ticket information. Please start again.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎫 Create New Ticket', callback_data: 'support_create_ticket' }],
                [{ text: '← Back to Support', callback_data: 'support_main' }]
              ]
            }
          }
        );
        return true;
      }

      // Get user from database
      const User = require('../../../models/User');
      let user = await User.query().findOne({ telegram_id: ctx.from.id.toString() });

      if (!user) {
        // Create user if doesn't exist
        user = await User.query().insert({
          telegram_id: ctx.from.id.toString(),
          first_name: ctx.from.first_name || 'User',
          last_name: ctx.from.last_name || '',
          username: ctx.from.username || null,
          role: 'client',
          is_active: true
        });
      }

      // Create the ticket
      const SupportTicket = require('../../../models/SupportTicket');
      const { v4: uuidv4 } = require('uuid');

      const ticketId = `TKT-${uuidv4().substring(0, 8).toUpperCase()}`;

      await SupportTicket.query().insert({
        ticket_id: ticketId,
        user_id: user.id,
        subject: supportData.subject,
        message: supportData.message,
        priority: 'medium',
        status: 'open'
      });

      console.log(`✅ Support ticket created: ${ticketId} for user ${user.id}`);

      // Clear support session
      ctx.session.support = null;

      // Success message
      await ctx.editMessageText(
        '✅ *Ticket Created Successfully!*\n\n' +
        `*Ticket ID:* \`${ticketId}\`\n` +
        `*Subject:* ${supportData.subject}\n\n` +
        'Our support team will review your ticket and respond as soon as possible.\n\n' +
        'You can check your ticket status anytime from the Support menu.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View My Tickets', callback_data: 'support_my_tickets' }],
              [{ text: '← Back to Support', callback_data: 'support_main' }]
            ]
          }
        }
      );

      // Notify admin
      this.notifyAdminNewTicket(ctx, ticketId, supportData);

      return true;

    } catch (error) {
      console.error('Create ticket error:', error);
      await ctx.editMessageText(
        '❌ Failed to create ticket. Please try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'support_create_ticket' }],
              [{ text: '← Back to Support', callback_data: 'support_main' }]
            ]
          }
        }
      );
      return true;
    }
  }

  /**
   * Notify admin about new ticket
   */
  async notifyAdminNewTicket(ctx, ticketId, supportData) {
    try {
      const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
      if (ADMIN_ID && this.bot) {
        await this.bot.telegram.sendMessage(
          ADMIN_ID,
          `🎫 *New Support Ticket*\n\n` +
          `*Ticket ID:* ${ticketId}\n` +
          `*From:* ${ctx.from.first_name} ${ctx.from.last_name || ''}\n` +
          `*Subject:* ${supportData.subject}\n` +
          `*Message:* ${supportData.message}`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (notifyError) {
      console.error('Failed to notify admin of new ticket:', notifyError.message);
    }
  }

  /**
   * Handle user reply prompt - asks user to type their reply
   */
  async handleUserReplyPrompt(ctx, ticketId) {
    try {
      const SupportTicket = require('../../../models/SupportTicket');

      // Verify ticket exists and belongs to user
      const ticket = await SupportTicket.query()
        .where('ticket_id', ticketId)
        .withGraphFetched('[user]')
        .first();

      if (!ticket) {
        await ctx.editMessageText('❌ Ticket not found.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 My Tickets', callback_data: 'support_my_tickets' }]
            ]
          }
        });
        return true;
      }

      // Check if ticket is closed
      if (ticket.status === 'closed') {
        await ctx.editMessageText(
          '❌ This ticket has been closed and cannot receive new replies.\n\n' +
          'Please create a new ticket if you need further assistance.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎫 Create New Ticket', callback_data: 'support_create_ticket' }],
                [{ text: '📋 My Tickets', callback_data: 'support_my_tickets' }]
              ]
            }
          }
        );
        return true;
      }

      // Set session for user reply
      ctx.session = ctx.session || {};
      ctx.session.userReplyTicket = ticketId;
      ctx.session.support = {
        flow: 'ticket_reply',
        step: 'reply',
        data: { ticketId },
        awaitingInput: true
      };

      await ctx.editMessageText(
        `💬 *Reply to Ticket ${ticketId}*\n\n` +
        `*Subject:* ${ticket.subject || 'No subject'}\n\n` +
        `Type your reply message below.\n\n` +
        `_Your next message will be sent to support._`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel Reply', callback_data: 'support_my_tickets' }]
            ]
          }
        }
      );

      return true;

    } catch (error) {
      console.error('Error in user reply prompt:', error);
      await ctx.editMessageText('❌ Error loading ticket. Please try again.');
      return true;
    }
  }

  /**
   * Handle user reply text input
   */
  async handleUserReplyInput(ctx) {
    const ticketId = ctx.session?.userReplyTicket || ctx.session?.support?.data?.ticketId;

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
      const User = require('../../../models/User');

      // Get the ticket
      const ticket = await SupportTicket.query()
        .where('ticket_id', ticketId)
        .withGraphFetched('[user]')
        .first();

      if (!ticket) {
        await ctx.reply('❌ Ticket not found.');
        ctx.session.userReplyTicket = null;
        ctx.session.support = null;
        return true;
      }

      // Get user from database
      let user = await User.query().findOne({ telegram_id: ctx.from.id.toString() });

      // Save the user's reply as a support message
      try {
        await SupportMessage.query().insert({
          ticket_id: ticketId,
          sender_type: 'user',
          sender_id: user?.id || ctx.from.id,
          message: replyText
        });
        console.log(`✅ User reply saved to database for ticket ${ticketId}`);
      } catch (msgErr) {
        console.log('Note: Could not save message to support_messages table:', msgErr.message);
      }

      // Update ticket status back to 'open' if it was 'assigned' (needs attention again)
      if (ticket.status === 'assigned') {
        try {
          await SupportTicket.query()
            .where('ticket_id', ticketId)
            .patch({ status: 'open' });
          console.log(`✅ Ticket ${ticketId} status updated to 'open' (user replied)`);
        } catch (statusErr) {
          console.error('Failed to update ticket status:', statusErr.message);
        }
      }

      // Clear the reply session
      ctx.session.userReplyTicket = null;
      ctx.session.support = null;

      // Confirm to user
      await ctx.reply(
        `✅ *Reply Sent!*\n\n` +
        `Your reply to ticket *${ticketId}* has been submitted.\n\n` +
        `Our support team will respond as soon as possible.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View My Tickets', callback_data: 'support_my_tickets' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );

      // Notify admin about the new user reply
      this.notifyAdminUserReply(ctx, ticketId, ticket, replyText);

      return true;

    } catch (error) {
      console.error('Error processing user reply:', error);
      await ctx.reply('❌ Error sending reply. Please try again.');
      ctx.session.userReplyTicket = null;
      ctx.session.support = null;
      return true;
    }
  }

  /**
   * Notify admin about user reply
   */
  async notifyAdminUserReply(ctx, ticketId, ticket, replyText) {
    try {
      const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
      if (ADMIN_ID && this.bot) {
        await this.bot.telegram.sendMessage(
          ADMIN_ID,
          `💬 *User Reply on Ticket*\n\n` +
          `*Ticket:* ${ticketId}\n` +
          `*From:* ${ctx.from.first_name} ${ctx.from.last_name || ''}\n` +
          `*Subject:* ${ticket.subject || 'No subject'}\n\n` +
          `*Reply:*\n${replyText}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👁️ View Ticket', callback_data: `admin_ticket_view_${ticketId}` }]
              ]
            }
          }
        );
      }
    } catch (notifyError) {
      console.error('Failed to notify admin of user reply:', notifyError.message);
    }
  }

  /**
   * Handle user tickets list - shows user's own tickets with status
   */
  async handleUserTicketsList(ctx) {
    try {
      const User = require('../../../models/User');
      const SupportTicket = require('../../../models/SupportTicket');

      const user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();

      if (!user) {
        await ctx.editMessageText(
          '❌ Please register first with /start',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '← Back to Support', callback_data: 'support_main' }]
              ]
            }
          }
        );
        return true;
      }

      const tickets = await SupportTicket.query()
        .where('user_id', user.id)
        .orderBy('created_at', 'desc')
        .limit(10);

      if (tickets.length === 0) {
        await ctx.editMessageText(
          '📋 *Your Support Tickets*\n\n' +
          'You have no support tickets yet.\n\n' +
          'Need help? Create a ticket using /ticket command.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎫 Create Ticket', callback_data: 'support_create_ticket' }],
                [{ text: '← Back to Support', callback_data: 'support_main' }]
              ]
            }
          }
        );
        return true;
      }

      let message = `📋 *Your Support Tickets* (${tickets.length})\n\n`;
      const inlineKeyboard = [];

      tickets.forEach((ticket) => {
        const statusEmoji = ticket.getStatusEmoji();
        const priorityEmoji = ticket.getPriorityEmoji();
        const createdDate = new Date(ticket.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric'
        });

        message += `${statusEmoji} *${ticket.ticket_id}*\n`;
        message += `   ${priorityEmoji} Priority: ${ticket.priority}\n`;
        message += `   📅 Created: ${createdDate}\n`;
        message += `   📝 ${(ticket.subject || 'No subject').substring(0, 25)}${ticket.subject?.length > 25 ? '...' : ''}\n`;
        message += `   Status: *${ticket.status}*\n\n`;

        // Add view button for each ticket
        inlineKeyboard.push([
          { text: `👁️ View ${ticket.ticket_id}`, callback_data: `user_ticket_view_${ticket.ticket_id}` }
        ]);
      });

      message += '\n_Tap a ticket to see full details_';

      // Add navigation buttons
      inlineKeyboard.push([{ text: '🎫 Create New Ticket', callback_data: 'support_create_ticket' }]);
      inlineKeyboard.push([{ text: '← Back to Support', callback_data: 'support_main' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });

      return true;

    } catch (error) {
      console.error('Error loading user tickets:', error);
      await ctx.editMessageText('❌ Error loading your tickets. Please try /support again.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to Support', callback_data: 'support_main' }]
          ]
        }
      });
      return true;
    }
  }

  /**
   * Handle user viewing their own ticket details
   */
  async handleUserViewTicket(ctx, ticketId) {
    try {
      await safeAnswerCbQuery(ctx, 'Loading ticket...');

      const User = require('../../../models/User');
      const SupportTicket = require('../../../models/SupportTicket');
      const SupportMessage = require('../../../models/SupportMessage');

      // Verify user owns this ticket
      const user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();

      if (!user) {
        await ctx.editMessageText('❌ Please register first with /start');
        return true;
      }

      const ticket = await SupportTicket.query()
        .where('ticket_id', ticketId)
        .where('user_id', user.id) // Security: only show user's own tickets
        .first();

      if (!ticket) {
        await ctx.editMessageText('❌ Ticket not found or access denied.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Back to My Tickets', callback_data: 'support_my_tickets' }]
            ]
          }
        });
        return true;
      }

      // Get recent messages for this ticket
      const messages = await SupportMessage.findByTicketId(ticketId, 5, false);

      const statusEmoji = ticket.getStatusEmoji();
      const priorityEmoji = ticket.getPriorityEmoji();
      const createdAt = new Date(ticket.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      // Status explanations
      const statusDescriptions = {
        'open': 'Your ticket is waiting to be reviewed',
        'assigned': 'An agent is handling your ticket',
        'closed': 'This ticket has been resolved',
        'escalated': 'Your ticket has been escalated for priority handling'
      };

      let ticketMessage = `🎫 *Ticket Details*\n\n`;
      ticketMessage += `🆔 ID: \`${ticket.ticket_id}\`\n`;
      ticketMessage += `${statusEmoji} Status: *${ticket.status}*\n`;
      ticketMessage += `_${statusDescriptions[ticket.status] || ''}_\n\n`;
      ticketMessage += `${priorityEmoji} Priority: ${ticket.priority}\n`;
      ticketMessage += `📅 Created: ${createdAt}\n`;

      if (ticket.category) {
        ticketMessage += `${ticket.getCategoryEmoji()} Category: ${ticket.category}\n`;
      }

      ticketMessage += `\n📋 *Subject:*\n${ticket.subject || 'No subject'}\n`;
      ticketMessage += `\n💬 *Your Message:*\n${ticket.message || 'No message'}\n`;

      // Show recent responses if any
      if (messages.length > 0) {
        const agentMessages = messages.filter(m => m.sender_type === 'agent' || m.sender_type === 'system');
        if (agentMessages.length > 0) {
          ticketMessage += `\n📨 *Responses:*\n`;
          agentMessages.slice(0, 3).reverse().forEach(msg => {
            const senderEmoji = msg.getSenderEmoji();
            const msgTime = new Date(msg.created_at).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit'
            });
            ticketMessage += `${senderEmoji} [${msgTime}] ${msg.message_text.substring(0, 80)}${msg.message_text.length > 80 ? '...' : ''}\n`;
          });
        }
      }

      // Build action buttons
      const actionButtons = [];

      // If ticket is closed, show reopen/new ticket options
      if (ticket.status === 'closed') {
        ticketMessage += `\n✅ _This ticket has been resolved._`;
        actionButtons.push([{ text: '🎫 Create New Ticket', callback_data: 'support_create_ticket' }]);
      } else {
        ticketMessage += `\n⏳ _We will respond to your ticket soon._`;
      }

      // Navigation
      actionButtons.push([{ text: '🔄 Refresh', callback_data: `user_ticket_view_${ticketId}` }]);
      actionButtons.push([{ text: '← Back to My Tickets', callback_data: 'support_my_tickets' }]);

      await ctx.editMessageText(ticketMessage, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: actionButtons }
      });

      return true;

    } catch (error) {
      console.error('Error viewing user ticket:', error);
      await ctx.editMessageText('❌ Error loading ticket details.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to My Tickets', callback_data: 'support_my_tickets' }]
          ]
        }
      });
      return true;
    }
  }

  /**
   * Store pending reply for a user
   */
  setPendingReply(userId, ticketId, subject) {
    this.pendingUserReplies.set(userId.toString(), {
      ticketId,
      timestamp: Date.now(),
      subject
    });
  }

  /**
   * Get pending replies map (for external access)
   */
  getPendingReplies() {
    return this.pendingUserReplies;
  }
}

module.exports = SupportHandler;
