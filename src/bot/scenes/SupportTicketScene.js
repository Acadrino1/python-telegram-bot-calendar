/**
 * Support Ticket Scene
 * 3-step wizard for creating support tickets
 *
 * Flow:
 * 1. Enter subject
 * 2. Enter message/description
 * 3. Confirm and submit
 */

const { Scenes, Markup } = require('telegraf');
const SupportTicket = require('../../models/SupportTicket');
const User = require('../../models/User');

// Scene ID
const SCENE_ID = 'support_ticket';

// Create the wizard scene
const supportTicketScene = new Scenes.WizardScene(
  SCENE_ID,

  // Step 0: Ask for subject
  async (ctx) => {
    ctx.wizard.state.data = {};

    await ctx.reply(
      '📝 *Create Support Ticket*\n\n' +
      '*Step 1 of 3: Subject*\n\n' +
      'What is the subject of your issue?\n\n' +
      '_Type your response below:_',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'cancel_ticket_wizard')]
        ])
      }
    );
    return ctx.wizard.next();
  },

  // Step 1: Process subject, ask for message
  async (ctx) => {
    const subject = ctx.message?.text?.trim();

    if (!subject) {
      await ctx.reply('Please enter a subject for your ticket.');
      return; // Stay on this step
    }

    if (subject.length < 3) {
      await ctx.reply('❌ Subject must be at least 3 characters. Please try again.');
      return; // Stay on this step
    }

    if (subject.length > 200) {
      await ctx.reply('❌ Subject is too long. Please keep it under 200 characters.');
      return;
    }

    ctx.wizard.state.data.subject = subject;

    await ctx.reply(
      '📝 *Create Support Ticket*\n\n' +
      '*Step 2 of 3: Description*\n\n' +
      'Please describe your issue in detail:\n\n' +
      '_Type your response below:_',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back', 'back_to_subject')],
          [Markup.button.callback('❌ Cancel', 'cancel_ticket_wizard')]
        ])
      }
    );
    return ctx.wizard.next();
  },

  // Step 2: Process message, show confirmation
  async (ctx) => {
    const message = ctx.message?.text?.trim();

    if (!message) {
      await ctx.reply('Please enter a description for your ticket.');
      return; // Stay on this step
    }

    if (message.length < 10) {
      await ctx.reply('❌ Please provide more detail (at least 10 characters).');
      return;
    }

    if (message.length > 2000) {
      await ctx.reply('❌ Message is too long. Please keep it under 2000 characters.');
      return;
    }

    ctx.wizard.state.data.message = message;

    // Escape markdown special characters for display
    const escapedSubject = ctx.wizard.state.data.subject.replace(/([*_`\[\]])/g, '\\$1');
    const escapedMessage = message.replace(/([*_`\[\]])/g, '\\$1');

    await ctx.reply(
      '📝 *Review Your Ticket*\n\n' +
      '*Step 3 of 3: Confirmation*\n\n' +
      `*Subject:* ${escapedSubject}\n\n` +
      `*Message:* ${escapedMessage}\n\n` +
      'Is this correct?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Submit Ticket', 'confirm_ticket_submit')],
          [Markup.button.callback('⬅️ Edit Message', 'back_to_message')],
          [Markup.button.callback('❌ Cancel', 'cancel_ticket_wizard')]
        ])
      }
    );
    return ctx.wizard.next();
  },

  // Step 3: Wait for confirmation button (handled by actions below)
  async (ctx) => {
    // This step just waits for button press
    await ctx.reply('Please use the buttons above to submit or cancel your ticket.');
  }
);

// Handle confirmation button
supportTicketScene.action('confirm_ticket_submit', async (ctx) => {
  await ctx.answerCbQuery('Creating ticket...');

  try {
    const { subject, message } = ctx.wizard.state.data;

    // Get or create user
    let user = await User.query()
      .where('telegram_id', ctx.from.id.toString())
      .first();

    if (!user) {
      // Create basic user record
      const uniqueEmail = `telegram_${ctx.from.id}@placeholder.local`;
      user = await User.query().insert({
        telegram_id: ctx.from.id.toString(),
        first_name: ctx.from.first_name || 'User',
        last_name: ctx.from.last_name || '',
        telegram_username: ctx.from.username || null,
        telegram_first_name: ctx.from.first_name || null,
        email: uniqueEmail,
        password_hash: 'telegram_user_no_password',
        role: 'client',
        is_active: true,
        registration_source: 'telegram',
        approval_status: 'approved'
      });
    }

    // Create the support ticket
    const ticket = await SupportTicket.query().insert({
      user_id: user.id,
      telegram_user_id: ctx.from.id.toString(),
      subject: subject,
      description: message,
      status: 'open',
      priority: 'medium',
      channel: 'telegram'
    });

    await ctx.editMessageText(
      '✅ *Support Ticket Created!*\n\n' +
      `🎫 Ticket ID: \`#${ticket.id}\`\n\n` +
      `*Subject:* ${subject.replace(/([*_`\[\]])/g, '\\$1')}\n\n` +
      'A support agent will respond to you shortly.\n' +
      'You will receive the response here in this chat.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 My Tickets', 'support_my_tickets')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );

    // Notify admin about new ticket
    const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
    if (ADMIN_ID && ctx.telegram) {
      try {
        await ctx.telegram.sendMessage(
          ADMIN_ID,
          `🎫 *New Support Ticket*\n\n` +
          `*Ticket ID:* #${ticket.id}\n` +
          `*From:* ${ctx.from.first_name || 'User'} (@${ctx.from.username || 'N/A'})\n` +
          `*Subject:* ${subject.replace(/([*_`\[\]])/g, '\\$1')}\n\n` +
          `*Message:*\n${message.replace(/([*_`\[\]])/g, '\\$1')}`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(`📝 View Ticket`, `admin_ticket_${ticket.id}`)]
            ])
          }
        );
      } catch (notifyError) {
        console.error('Failed to notify admin about new ticket:', notifyError.message);
      }
    }

    return ctx.scene.leave();

  } catch (error) {
    console.error('Error creating support ticket:', error);
    await ctx.editMessageText(
      '❌ *Error Creating Ticket*\n\n' +
      'An error occurred while creating your ticket.\n' +
      'Please try again later or contact support directly.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', 'support_create_ticket')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );
    return ctx.scene.leave();
  }
});

// Handle back buttons
supportTicketScene.action('back_to_subject', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.selectStep(0);
  await ctx.editMessageText(
    '📝 *Create Support Ticket*\n\n' +
    '*Step 1 of 3: Subject*\n\n' +
    'What is the subject of your issue?\n\n' +
    '_Type your response below:_',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'cancel_ticket_wizard')]
      ])
    }
  );
  return ctx.wizard.next();
});

supportTicketScene.action('back_to_message', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.selectStep(1);
  await ctx.editMessageText(
    '📝 *Create Support Ticket*\n\n' +
    '*Step 2 of 3: Description*\n\n' +
    `*Subject:* ${ctx.wizard.state.data.subject.replace(/([*_`\[\]])/g, '\\$1')}\n\n` +
    'Please describe your issue in detail:\n\n' +
    '_Type your response below:_',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', 'back_to_subject')],
        [Markup.button.callback('❌ Cancel', 'cancel_ticket_wizard')]
      ])
    }
  );
  return ctx.wizard.next();
});

// Handle cancel button
supportTicketScene.action('cancel_ticket_wizard', async (ctx) => {
  await ctx.answerCbQuery('Ticket cancelled');
  await ctx.editMessageText(
    '❌ *Ticket Creation Cancelled*\n\n' +
    'Your support ticket was not created.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🎫 Create New Ticket', 'support_create_ticket')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    }
  );
  return ctx.scene.leave();
});

// Handle leaving scene unexpectedly
supportTicketScene.leave((ctx) => {
  // Clean up wizard state if needed
  if (ctx.wizard?.state) {
    ctx.wizard.state = {};
  }
});

module.exports = supportTicketScene;
