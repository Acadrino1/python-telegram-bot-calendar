/**
 * Completion Handler
 * Manages booking completion confirmation flow:
 * 1. Sends completion confirmation request to user after appointment time
 * 2. User confirms yes/no
 * 3. Admin receives notification to upload photo proof
 * 4. Admin uploads photo, stored with appointment
 */

const { Markup } = require('telegraf');
const moment = require('moment-timezone');

class CompletionHandler {
  constructor(bot, services = {}) {
    this.bot = bot;
    this.services = services;
  }

  setupHandlers(bot, services = null) {
    if (bot) this.bot = bot;
    if (services) this.services = services;

    if (!this.bot) return;

    console.log('Setting up CompletionHandler...');

    // User confirms appointment was completed
    this.bot.action(/^completion_confirm_yes_(.+)$/, async (ctx) => {
      const appointmentUuid = ctx.match[1];
      await this.handleUserConfirmation(ctx, appointmentUuid, 'yes');
    });

    // User says appointment was NOT completed
    this.bot.action(/^completion_confirm_no_(.+)$/, async (ctx) => {
      const appointmentUuid = ctx.match[1];
      await this.handleUserConfirmation(ctx, appointmentUuid, 'no');
    });

    // Admin acknowledges proof request
    this.bot.action(/^admin_proof_ack_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery('Upload a photo to provide proof');
      const appointmentUuid = ctx.match[1];

      // Set session to await photo for this appointment
      ctx.session = ctx.session || {};
      ctx.session.awaitingProof = {
        appointmentUuid,
        timestamp: Date.now()
      };

      await ctx.editMessageText(
        ctx.callbackQuery.message.text + '\n\n_Please upload a photo now..._',
        { parse_mode: 'Markdown' }
      );
    });

    console.log('CompletionHandler setup complete');
  }

  /**
   * Send completion confirmation request to user
   * Called after appointment time has passed
   */
  async sendCompletionRequest(appointment, userTelegramId) {
    if (!this.bot || !userTelegramId) return;

    try {
      const Appointment = require('../../models/Appointment');

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      const customerName = appointment.customer_first_name
        ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
        : 'your appointment';

      const message =
        `*Appointment Completion Confirmation*\n\n` +
        `Your appointment on *${formattedDate}* at *${formattedTime}* has ended.\n\n` +
        `Customer: ${customerName}\n` +
        `Service: ${appointment.service?.name || 'Lodge Service'}\n\n` +
        `Was this appointment completed successfully?`;

      await this.bot.telegram.sendMessage(userTelegramId, message, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('Yes, Completed', `completion_confirm_yes_${appointment.uuid}`),
            Markup.button.callback('No, Not Completed', `completion_confirm_no_${appointment.uuid}`)
          ]
        ]).reply_markup
      });

      console.log(`Completion request sent to user ${userTelegramId} for appointment ${appointment.uuid}`);
    } catch (error) {
      console.error('Error sending completion request:', error);
    }
  }

  /**
   * Handle user's confirmation response
   */
  async handleUserConfirmation(ctx, appointmentUuid, response) {
    try {
      await ctx.answerCbQuery();

      const Appointment = require('../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', appointmentUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText('Appointment not found.');
        return;
      }

      // Update appointment with user's response
      await Appointment.query()
        .where('uuid', appointmentUuid)
        .patch({
          user_confirmed_completion: true,
          user_completion_response: response,
          awaiting_proof: true,
          status: response === 'yes' ? 'completed' : appointment.status
        });

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      if (response === 'yes') {
        await ctx.editMessageText(
          `*Thank you for confirming!*\n\n` +
          `Your appointment on ${formattedDate} at ${formattedTime} has been marked as completed.\n\n` +
          `We appreciate your business!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.editMessageText(
          `*Thank you for your response.*\n\n` +
          `We've noted that your appointment on ${formattedDate} at ${formattedTime} was not completed as expected.\n\n` +
          `Our team will review this and follow up if needed.`,
          { parse_mode: 'Markdown' }
        );
      }

      // Notify admin to upload proof
      await this.notifyAdminForProof(appointment, response);

    } catch (error) {
      console.error('Error handling user confirmation:', error);
      await ctx.editMessageText('An error occurred. Please try again later.');
    }
  }

  /**
   * Send notification to admin requiring photo proof upload
   */
  async notifyAdminForProof(appointment, userResponse) {
    const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
    if (!ADMIN_TELEGRAM_ID || !this.bot) return;

    try {
      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      const customerName = appointment.customer_first_name
        ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
        : 'Unknown';

      const responseIcon = userResponse === 'yes' ? '✅' : '❌';
      const responseText = userResponse === 'yes' ? 'COMPLETED' : 'NOT COMPLETED';

      const message =
        `*📸 Photo Proof Required*\n\n` +
        `Customer has responded to completion confirmation:\n\n` +
        `${responseIcon} *Response: ${responseText}*\n\n` +
        `👤 Customer: ${customerName}\n` +
        `📅 Date: ${formattedDate}\n` +
        `⏰ Time: ${formattedTime}\n` +
        `📱 Service: ${appointment.service?.name || 'Lodge Service'}\n` +
        `🆔 ID: \`${appointment.uuid}\`\n\n` +
        `*Please upload photo proof of this appointment.*`;

      await this.bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, message, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📷 Upload Photo Proof', `admin_proof_ack_${appointment.uuid}`)],
          [Markup.button.callback('📋 View Details', `admin_view_booking_${appointment.uuid}`)]
        ]).reply_markup
      });

      console.log(`Admin notified for proof upload: appointment ${appointment.uuid}`);
    } catch (error) {
      console.error('Error notifying admin for proof:', error);
    }
  }

  /**
   * Handle admin photo upload
   * Called from document/photo handler when admin uploads proof
   */
  async handleProofUpload(ctx, fileId, appointmentUuid) {
    try {
      const Appointment = require('../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', appointmentUuid)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.reply('Appointment not found.');
        return false;
      }

      // Store the file ID
      await Appointment.query()
        .where('uuid', appointmentUuid)
        .patch({
          completion_proof_file_id: fileId,
          completion_proof_uploaded_at: new Date(),
          awaiting_proof: false
        });

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');

      const customerName = appointment.customer_first_name
        ? `${appointment.customer_first_name} ${appointment.customer_last_name || ''}`.trim()
        : 'Unknown';

      await ctx.reply(
        `*Photo Proof Uploaded Successfully!*\n\n` +
        `📋 Appointment: ${customerName}\n` +
        `📅 Date: ${formattedDate}\n` +
        `🆔 ID: \`${appointment.uuid}\`\n\n` +
        `The proof has been saved.`,
        { parse_mode: 'Markdown' }
      );

      // Clear the awaiting proof session
      if (ctx.session?.awaitingProof) {
        ctx.session.awaitingProof = null;
      }

      // Broadcast to channels as advertisement
      await this.broadcastProofToChannels(fileId, appointment, customerName, formattedDate);

      return true;
    } catch (error) {
      console.error('Error handling proof upload:', error);
      await ctx.reply('Error saving photo proof. Please try again.');
      return false;
    }
  }

  /**
   * Check if admin is awaiting proof upload
   */
  isAwaitingProof(ctx) {
    if (!ctx.session?.awaitingProof) return false;

    // Timeout after 5 minutes
    const elapsed = Date.now() - ctx.session.awaitingProof.timestamp;
    if (elapsed > 5 * 60 * 1000) {
      ctx.session.awaitingProof = null;
      return false;
    }

    return true;
  }

  /**
   * Get the appointment UUID we're awaiting proof for
   */
  getAwaitingProofUuid(ctx) {
    return ctx.session?.awaitingProof?.appointmentUuid;
  }

  /**
   * Broadcast proof photo to all active channels as advertisement
   */
  async broadcastProofToChannels(fileId, appointment, customerName, formattedDate) {
    if (!this.bot) return;

    try {
      const BotChannel = require('../../models/BotChannel');
      const channels = await BotChannel.getActiveBroadcastChannels();

      if (channels.length === 0) {
        console.log('No active broadcast channels for proof advertisement');
        return;
      }

      const serviceName = appointment.service?.name || 'Lodge Service';

      // Create advertisement caption (anonymized - no customer name in public broadcast)
      const caption =
        `✅ *Another Successful Appointment!*\n\n` +
        `📱 Service: ${serviceName}\n` +
        `📅 Date: ${formattedDate}\n\n` +
        `_Book your appointment today!_\n` +
        `Use /start to get started 🚀`;

      let sent = 0;
      let failed = 0;

      for (const channel of channels) {
        try {
          const options = {
            caption,
            parse_mode: 'Markdown'
          };
          // Support forum topics (supergroups with topics)
          if (channel.topic_id) {
            options.message_thread_id = channel.topic_id;
          }
          await this.bot.telegram.sendPhoto(channel.chat_id, fileId, options);
          sent++;
        } catch (error) {
          failed++;
          console.warn(`Failed to broadcast to channel ${channel.chat_id}:`, error.message);

          // Mark channel as unable to post if permission error
          if (error.code === 403 || error.description?.includes('bot was kicked') ||
              error.description?.includes('not enough rights') ||
              error.description?.includes('chat not found')) {
            await BotChannel.updateCanPost(channel.chat_id, false);
          }
        }
        // Rate limit
        await new Promise(r => setTimeout(r, 100));
      }

      console.log(`📢 Proof broadcast: ${sent} channels sent, ${failed} failed`);
    } catch (error) {
      console.error('Error broadcasting proof to channels:', error);
    }
  }
}

module.exports = CompletionHandler;
