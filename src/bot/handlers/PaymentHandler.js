/**
 * PaymentHandler
 * Handles Monero payment callbacks and status checks
 */

const { Markup } = require('telegraf');
const MoneroPayService = require('../../services/MoneroPayService');

class PaymentHandler {
  constructor(bot, services = {}) {
    this.bot = bot;
    this.services = services;
    this.moneroPayService = new MoneroPayService();
  }

  setupHandlers(bot, services = null) {
    if (bot) this.bot = bot;
    if (services) this.services = services;

    if (!this.bot) return;

    console.log('Setting up PaymentHandler...');

    // Check payment status
    this.bot.action(/^check_payment_(\d+)$/, async (ctx) => {
      await this.handleCheckPaymentStatus(ctx);
    });

    // Cancel payment and booking
    this.bot.action(/^cancel_payment_(\d+)$/, async (ctx) => {
      await this.handleCancelPayment(ctx);
    });

    console.log('PaymentHandler setup complete');
  }

  /**
   * Handle callback routing from other handlers
   */
  async handleCallback(ctx, callbackData) {
    if (callbackData.startsWith('check_payment_')) {
      return await this.handleCheckPaymentStatus(ctx);
    }
    if (callbackData.startsWith('cancel_payment_')) {
      return await this.handleCancelPayment(ctx);
    }
    return false;
  }

  /**
   * Check payment status
   */
  async handleCheckPaymentStatus(ctx) {
    try {
      await ctx.answerCbQuery('Checking payment status...');

      const paymentId = ctx.match ? ctx.match[1] : ctx.callbackQuery?.data?.split('_')[2];
      if (!paymentId) {
        await ctx.reply('Invalid payment reference.');
        return true;
      }

      const { Model } = require('objection');
      const knex = Model.knex();

      const payment = await knex('payments').where('id', paymentId).first();
      if (!payment) {
        await ctx.reply('Payment not found.');
        return true;
      }

      // Check status with MoneroPay
      try {
        const status = await this.moneroPayService.checkPaymentStatus(payment.moneropay_address);

        if (status.complete) {
          await this.moneroPayService.updatePaymentStatus(payment.id, 'confirmed', status.amountReceived, status.confirmations);

          // Mark payment as confirmed in session
          if (ctx.session) {
            ctx.session.paymentConfirmed = true;
            ctx.session.paymentId = payment.id;
          }
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/bot/handlers/PaymentHandler.js:76',message:'Payment confirmed - updating session',data:{paymentId:payment.id,hasSession:!!ctx.session},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'I'})}).catch(()=>{});
          // #endregion

          // Check if appointment exists - if not, show calendar
          if (!payment.appointment_id) {
            // Payment was created before appointment - now show calendar
            await ctx.editMessageText(
              `✅ *Payment Confirmed!*\n\n` +
              `Amount: ${this.moneroPayService.atomicToXmr(status.amountReceived)} XMR\n` +
              `Confirmations: ${status.confirmations}\n\n` +
              `Now you can select your appointment date and time.`,
              {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback('📅 Select Appointment Date', 'show_calendar')],
                  [Markup.button.callback('🏠 Main Menu', 'main_menu')]
                ]).reply_markup
              }
            );
          } else {
            // Payment for existing appointment
            await ctx.editMessageCaption(
              `*Payment Confirmed!*\n\n` +
              `Amount: ${this.moneroPayService.atomicToXmr(status.amountReceived)} XMR\n` +
              `Confirmations: ${status.confirmations}\n\n` +
              `Your appointment(s) are now confirmed!`,
              { parse_mode: 'Markdown' }
            );
          }
        } else if (BigInt(status.amountReceived || '0') > 0) {
          const amountXmr = this.moneroPayService.atomicToXmr(status.amountReceived);
          const expectedXmr = this.moneroPayService.atomicToXmr(payment.amount_xmr);

          await ctx.editMessageCaption(
            `*Partial Payment Received*\n\n` +
            `Received: ${amountXmr} XMR\n` +
            `Expected: ${expectedXmr} XMR\n` +
            `Confirmations: ${status.confirmations}\n\n` +
            `Please send the remaining amount to complete your booking.`,
            {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('Check Again', `check_payment_${paymentId}`)],
                [Markup.button.callback('Cancel Booking', `cancel_payment_${paymentId}`)]
              ]).reply_markup
            }
          );
        } else {
          // Check if expired
          const now = new Date();
          const expiresAt = new Date(payment.expires_at);

          if (now > expiresAt) {
            await this.moneroPayService.updatePaymentStatus(payment.id, 'expired');
            await ctx.editMessageCaption(
              `*Payment Expired*\n\n` +
              `The payment window has closed.\n\n` +
              `Please start a new booking with /book`,
              { parse_mode: 'Markdown' }
            );
          } else {
            const remainingMinutes = Math.ceil((expiresAt - now) / 60000);
            await ctx.editMessageCaption(
              `*Awaiting Payment*\n\n` +
              `No payment received yet.\n` +
              `Time remaining: ${remainingMinutes} minutes\n\n` +
              `Send payment to:\n\`${payment.moneropay_address}\``,
              {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback('Check Again', `check_payment_${paymentId}`)],
                  [Markup.button.callback('Cancel Booking', `cancel_payment_${paymentId}`)]
                ]).reply_markup
              }
            );
          }
        }
      } catch (error) {
        console.error('Error checking payment with MoneroPay:', error);
        await ctx.reply('Unable to check payment status. Please try again.');
      }

      return true;
    } catch (error) {
      console.error('handleCheckPaymentStatus error:', error);
      await ctx.answerCbQuery('Error checking status');
      return true;
    }
  }

  /**
   * Cancel payment and associated bookings
   */
  async handleCancelPayment(ctx) {
    try {
      await ctx.answerCbQuery('Cancelling...');

      const paymentId = ctx.match ? ctx.match[1] : ctx.callbackQuery?.data?.split('_')[2];
      if (!paymentId) {
        await ctx.reply('Invalid payment reference.');
        return true;
      }

      const { Model } = require('objection');
      const knex = Model.knex();

      const payment = await knex('payments').where('id', paymentId).first();
      if (!payment) {
        await ctx.reply('Payment not found.');
        return true;
      }

      // Update payment status
      await knex('payments').where('id', paymentId).update({
        status: 'expired',
        updated_at: new Date()
      });

      // Cancel associated appointments
      if (payment.appointment_id) {
        await knex('appointments').where('id', payment.appointment_id).update({
          status: 'cancelled',
          notes: knex.raw("CONCAT(IFNULL(notes, ''), ' - Cancelled: Payment not completed')"),
          updated_at: new Date()
        });
      }

      // For bulk payments, cancel all linked appointments
      if (payment.metadata) {
        try {
          const metadata = JSON.parse(payment.metadata);
          if (metadata.bulk && metadata.appointment_ids) {
            await knex('appointments')
              .whereIn('id', metadata.appointment_ids)
              .update({
                status: 'cancelled',
                notes: knex.raw("CONCAT(IFNULL(notes, ''), ' - Cancelled: Bulk payment not completed')"),
                updated_at: new Date()
              });
          }
        } catch (e) {
          console.error('Error parsing payment metadata:', e);
        }
      }

      await ctx.editMessageCaption(
        `*Booking Cancelled*\n\n` +
        `Your booking has been cancelled.\n\n` +
        `Use /book to make a new booking.`,
        { parse_mode: 'Markdown' }
      );

      return true;
    } catch (error) {
      console.error('handleCancelPayment error:', error);
      await ctx.reply('Error cancelling booking. Please contact support.');
      return true;
    }
  }

  /**
   * Create single booking payment (called after booking confirmed)
   */
  async createSinglePayment(ctx, appointmentId, userId) {
    if (!this.moneroPayService.isEnabled()) {
      return null;
    }

    try {
      const paymentData = await this.moneroPayService.createPaymentRequest(
        appointmentId,
        userId,
        'Lodge Mobile Appointment'
      );

      // Generate payment message
      const paymentMessage = this.moneroPayService.generatePaymentMessage(paymentData);

      // Generate QR code
      const qrUrl = this.moneroPayService.generateQrCodeUrl(
        paymentData.address,
        paymentData.amountXmr.replace('.', '')
      );

      // Send QR code with payment details
      await ctx.replyWithPhoto(qrUrl, {
        caption: paymentMessage,
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('Check Payment Status', `check_payment_${paymentData.id}`)],
          [Markup.button.callback('Cancel Booking', `cancel_payment_${paymentData.id}`)]
        ]).reply_markup
      });

      return paymentData;
    } catch (error) {
      console.error('Error creating single payment:', error);
      throw error;
    }
  }
}

module.exports = PaymentHandler;
