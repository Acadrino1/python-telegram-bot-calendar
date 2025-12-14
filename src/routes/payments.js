/**
 * Payment Routes
 * Handles MoneroPay webhook callbacks
 */

const express = require('express');
const router = express.Router();
const MoneroPayService = require('../services/MoneroPayService');

const moneroPayService = new MoneroPayService();

// Telegram bot reference (set from index.js)
let telegramBot = null;

/**
 * Set the Telegram bot instance for sending notifications
 */
router.setBotInstance = (bot) => {
  telegramBot = bot;
};

/**
 * POST /api/payments/webhook
 * Webhook endpoint for MoneroPay payment notifications
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('Payment webhook received:', JSON.stringify(req.body));

    const webhookData = req.body;

    if (!webhookData.address) {
      console.warn('Webhook missing address');
      return res.status(400).json({ error: 'Missing address' });
    }

    // Process the webhook
    const result = await moneroPayService.processWebhook(webhookData);

    if (!result) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log(`Payment ${result.paymentId} updated to status: ${result.status}`);

    // Notify user if payment is confirmed
    if (result.status === 'confirmed' && telegramBot && result.userId) {
      try {
        const { Model } = require('objection');
        const knex = Model.knex();
        const User = require('../models/User');

        // Get user's telegram ID
        const user = await User.query().findById(result.userId);

        if (user && user.telegram_id) {
          // Get payment details
          const payment = await knex('payments').where('id', result.paymentId).first();

          let message = `*Payment Confirmed!*\n\n` +
            `Your payment of $${payment.amount_cad.toFixed(2)} CAD has been received.\n\n`;

          // Check if bulk payment
          if (payment.metadata) {
            try {
              const metadata = JSON.parse(payment.metadata);
              if (metadata.bulk && metadata.customer_count) {
                message += `All ${metadata.customer_count} appointments are now confirmed!\n\n`;
              }
            } catch (e) {}
          }

          message += `Thank you for using Lodge Scheduler!`;

          await telegramBot.telegram.sendMessage(user.telegram_id, message, {
            parse_mode: 'Markdown'
          });

          // Update associated appointments to confirmed
          if (result.appointmentId) {
            await knex('appointments')
              .where('id', result.appointmentId)
              .update({ status: 'confirmed', updated_at: new Date() });
          }

          // For bulk, confirm all appointments
          if (payment.metadata) {
            try {
              const metadata = JSON.parse(payment.metadata);
              if (metadata.appointment_ids) {
                await knex('appointments')
                  .whereIn('id', metadata.appointment_ids)
                  .update({ status: 'confirmed', updated_at: new Date() });
              }
            } catch (e) {}
          }
        }
      } catch (notifyError) {
        console.error('Error notifying user of payment:', notifyError);
      }
    }

    res.json({ success: true, status: result.status });
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/payments/:id/status
 * Check payment status
 */
router.get('/:id/status', async (req, res) => {
  try {
    const paymentId = req.params.id;

    const { Model } = require('objection');
    const knex = Model.knex();

    const payment = await knex('payments').where('id', paymentId).first();
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Get latest status from MoneroPay
    try {
      const status = await moneroPayService.checkPaymentStatus(payment.moneropay_address);

      res.json({
        id: payment.id,
        status: payment.status,
        amountCad: payment.amount_cad,
        amountXmr: moneroPayService.atomicToXmr(payment.amount_xmr),
        amountReceived: status.amountReceived ? moneroPayService.atomicToXmr(status.amountReceived) : '0',
        confirmations: status.confirmations || 0,
        complete: status.complete || false,
        expiresAt: payment.expires_at
      });
    } catch (error) {
      // Return local status if MoneroPay unavailable
      res.json({
        id: payment.id,
        status: payment.status,
        amountCad: payment.amount_cad,
        amountXmr: moneroPayService.atomicToXmr(payment.amount_xmr),
        expiresAt: payment.expires_at,
        error: 'Unable to fetch live status'
      });
    }
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/payments/expire-old
 * Manually trigger expiration of old pending payments
 * (Can be called by cron job)
 */
router.post('/expire-old', async (req, res) => {
  try {
    const expired = await moneroPayService.expireOldPayments();
    res.json({ expired });
  } catch (error) {
    console.error('Error expiring payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
