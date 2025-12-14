/**
 * MoneroPay Service
 * Handles Monero payment integration via MoneroPay gateway
 *
 * Price: $250 CAD per appointment
 * Payment window: 30 minutes
 */

const { Model } = require('objection');

class MoneroPayService {
  constructor() {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:12',message:'MoneroPayService constructor entry',data:{baseUrl:process.env.MONEROPAY_URL||'http://localhost:5000',enabled:process.env.ENABLE_PAYMENTS==='true',priceCAD:process.env.APPOINTMENT_PRICE_CAD||250},timestamp:Date.now(),sessionId:'debug-session',runId:'startup',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    this.baseUrl = process.env.MONEROPAY_URL || 'http://localhost:5000';
    this.priceCAD = parseFloat(process.env.APPOINTMENT_PRICE_CAD) || 250;
    this.paymentWindowMinutes = parseInt(process.env.PAYMENT_WINDOW_MINUTES) || 30;
    this.enabled = process.env.ENABLE_PAYMENTS === 'true';
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:17',message:'MoneroPayService constructor exit',data:{baseUrl:this.baseUrl,enabled:this.enabled,priceCAD:this.priceCAD},timestamp:Date.now(),sessionId:'debug-session',runId:'startup',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  }

  /**
   * Check if payments are enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get current XMR/CAD exchange rate from CoinGecko
   */
  async getExchangeRate() {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:29',message:'getExchangeRate entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=cad'
      );
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:33',message:'CoinGecko API response received',data:{status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:35',message:'Exchange rate parsed',data:{rate:data.monero?.cad||null,hasMonero:!!data.monero},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return data.monero?.cad || null;
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:37',message:'Exchange rate fetch error',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.error('Error fetching XMR rate:', error.message);
      return null;
    }
  }

  /**
   * Convert CAD to XMR atomic units (piconero)
   * 1 XMR = 1,000,000,000,000 piconero
   */
  cadToAtomicUnits(cadAmount, xmrRate) {
    if (!xmrRate || xmrRate <= 0) return null;
    const xmrAmount = cadAmount / xmrRate;
    // Convert to piconero (atomic units) - return as number for MoneroPay API
    const atomicUnits = Math.ceil(xmrAmount * 1e12);
    return atomicUnits;
  }

  /**
   * Convert atomic units to XMR for display
   */
  atomicToXmr(atomicUnits) {
    return (BigInt(atomicUnits) / BigInt(1e12)).toString() + '.' +
      (BigInt(atomicUnits) % BigInt(1e12)).toString().padStart(12, '0');
  }

  /**
   * Create a payment request via MoneroPay
   * POST /receive
   * @param {number|null} appointmentId - Single appointment or null for bulk
   * @param {number} userId - User ID
   * @param {string} description - Payment description
   * @param {number} appointmentCount - Number of appointments (for bulk discount)
   */
  async createPaymentRequest(appointmentId, userId, description = 'Lodge Mobile Appointment', appointmentCount = 1) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:66',message:'createPaymentRequest entry',data:{appointmentId,userId,description,enabled:this.enabled,baseUrl:this.baseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!this.enabled) {
      throw new Error('Payments are not enabled');
    }

    // Get exchange rate
    const xmrRate = await this.getExchangeRate();
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:73',message:'Exchange rate fetched',data:{xmrRate,hasRate:!!xmrRate},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!xmrRate) {
      throw new Error('Could not fetch XMR exchange rate');
    }

    // Calculate price with bulk discount
    const BotSettings = require('../models/BotSettings');
    const bulkDiscount = await BotSettings.getBulkDiscountPercentage();
    let finalPriceCAD = this.priceCAD * appointmentCount;

    if (bulkDiscount > 0 && appointmentCount > 1) {
      const discountAmount = (finalPriceCAD * bulkDiscount) / 100;
      finalPriceCAD = finalPriceCAD - discountAmount;
    }

    const atomicUnits = this.cadToAtomicUnits(finalPriceCAD, xmrRate);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:78',message:'Atomic units calculated',data:{atomicUnits,priceCAD:this.priceCAD},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!atomicUnits) {
      throw new Error('Could not calculate XMR amount');
    }

    const discountMsg = bulkDiscount > 0 && appointmentCount > 1 ? ` (${bulkDiscount}% bulk discount applied)` : '';
    console.log(`Creating payment: $${finalPriceCAD.toFixed(2)} CAD = ${this.atomicToXmr(atomicUnits)} XMR (rate: ${xmrRate})${discountMsg}`);

    try {
      const requestUrl = `${this.baseUrl}/receive`;
      const requestBody = {
        amount: atomicUnits,
        description: description,
        callback_url: process.env.MONEROPAY_CALLBACK_URL || `${process.env.APP_URL}/api/payments/webhook`
      };
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:86',message:'Calling MoneroPay API',data:{url:requestUrl,amount:atomicUnits,callbackUrl:requestBody.callback_url},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      // Call MoneroPay API
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:95',message:'MoneroPay API response',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        const errorText = await response.text();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:98',message:'MoneroPay API error',data:{status:response.status,errorText},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        throw new Error(`MoneroPay error: ${response.status} - ${errorText}`);
      }

      const paymentData = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:101',message:'Payment data received',data:{hasAddress:!!paymentData.address,hasPaymentId:!!paymentData.payment_id},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      // Calculate expiry
      const expiresAt = new Date(Date.now() + this.paymentWindowMinutes * 60 * 1000);

      // Store payment record
      const knex = Model.knex();
      const [paymentId] = await knex('payments').insert({
        appointment_id: appointmentId,
        user_id: userId,
        moneropay_address: paymentData.address,
        payment_id: paymentData.payment_id || null,
        amount_cad: finalPriceCAD.toFixed(2),
        amount_xmr: String(atomicUnits),
        exchange_rate: xmrRate,
        status: 'pending',
        expires_at: expiresAt,
        metadata: JSON.stringify(paymentData),
        created_at: new Date(),
        updated_at: new Date()
      });

      return {
        id: paymentId,
        address: paymentData.address,
        amountXmr: this.atomicToXmr(atomicUnits),
        amountCad: parseFloat(finalPriceCAD.toFixed(2)),
        exchangeRate: xmrRate,
        expiresAt: expiresAt,
        expiresInMinutes: this.paymentWindowMinutes
      };
    } catch (error) {
      console.error('MoneroPay createPaymentRequest error:', error);
      throw error;
    }
  }

  /**
   * Check payment status via MoneroPay
   * GET /receive/:address
   */
  async checkPaymentStatus(address) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:183',message:'checkPaymentStatus entry',data:{address,baseUrl:this.baseUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    try {
      const statusUrl = `${this.baseUrl}/receive/${address}`;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:186',message:'Fetching payment status',data:{url:statusUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      const response = await fetch(statusUrl);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:189',message:'Status check response',data:{status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:192',message:'Status check failed',data:{status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw new Error(`MoneroPay status check failed: ${response.status}`);
      }

      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:197',message:'Status data parsed',data:{complete:data.complete,confirmations:data.confirmations||0,hasAmountReceived:!!data.amount_received},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return {
        address: data.address,
        amountExpected: data.amount,
        amountReceived: data.amount_received || '0',
        confirmations: data.confirmations || 0,
        complete: data.complete || false
      };
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:201',message:'Status check error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'payment',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.error('MoneroPay checkPaymentStatus error:', error);
      throw error;
    }
  }

  /**
   * Get payment by appointment ID
   */
  async getPaymentByAppointment(appointmentId) {
    const knex = Model.knex();
    return knex('payments')
      .where('appointment_id', appointmentId)
      .orderBy('created_at', 'desc')
      .first();
  }

  /**
   * Get payment by address
   */
  async getPaymentByAddress(address) {
    const knex = Model.knex();
    return knex('payments')
      .where('moneropay_address', address)
      .first();
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(paymentId, status, amountReceived = null, confirmations = null) {
    const knex = Model.knex();
    const update = {
      status,
      updated_at: new Date()
    };

    if (amountReceived !== null) {
      update.amount_received = amountReceived;
    }
    if (confirmations !== null) {
      update.confirmations = confirmations;
    }
    if (status === 'confirmed') {
      update.confirmed_at = new Date();
    }

    return knex('payments')
      .where('id', paymentId)
      .update(update);
  }

  /**
   * Process webhook from MoneroPay
   */
  async processWebhook(webhookData) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:254',message:'processWebhook entry',data:{hasAddress:!!webhookData.address,complete:webhookData.complete,confirmations:webhookData.confirmations},timestamp:Date.now(),sessionId:'debug-session',runId:'webhook',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    const { address, amount_received, confirmations, complete } = webhookData;

    const payment = await this.getPaymentByAddress(address);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:259',message:'Payment lookup result',data:{found:!!payment,paymentId:payment?.id,currentStatus:payment?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'webhook',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (!payment) {
      console.warn(`Webhook: Unknown payment address ${address}`);
      return null;
    }

    let newStatus = payment.status;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:265',message:'Status calculation start',data:{currentStatus:payment.status,complete,amountReceived:amount_received,expectedAmount:payment.amount_xmr},timestamp:Date.now(),sessionId:'debug-session',runId:'webhook',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    if (complete) {
      newStatus = 'confirmed';
    } else if (BigInt(amount_received || '0') > 0) {
      // Check if full amount received
      if (BigInt(amount_received) >= BigInt(payment.amount_xmr)) {
        newStatus = confirmations >= 1 ? 'confirmed' : 'partial';
      } else {
        newStatus = 'partial';
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:275',message:'Status calculated',data:{newStatus},timestamp:Date.now(),sessionId:'debug-session',runId:'webhook',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    await this.updatePaymentStatus(
      payment.id,
      newStatus,
      amount_received,
      confirmations
    );
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/MoneroPayService.js:282',message:'Payment status updated',data:{paymentId:payment.id,newStatus},timestamp:Date.now(),sessionId:'debug-session',runId:'webhook',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    return {
      paymentId: payment.id,
      appointmentId: payment.appointment_id,
      userId: payment.user_id,
      status: newStatus,
      complete
    };
  }

  /**
   * Check for expired payments and mark them
   */
  async expireOldPayments() {
    const knex = Model.knex();
    const now = new Date();

    const expired = await knex('payments')
      .where('status', 'pending')
      .where('expires_at', '<', now)
      .update({
        status: 'expired',
        updated_at: now
      });

    if (expired > 0) {
      console.log(`Expired ${expired} payment(s)`);
    }

    return expired;
  }

  /**
   * Generate payment message for Telegram
   */
  generatePaymentMessage(paymentData) {
    const { address, amountXmr, amountCad, expiresInMinutes } = paymentData;

    return `✅ *Registration Complete*\n\n` +
      `You're almost done — just one final step.\n\n` +
      `────────────────────────\n` +
      `*Payment Details*\n` +
      `────────────────────────\n\n` +
      `*Amount:*\n` +
      `${amountXmr} XMR\n` +
      `≈ $${amountCad.toFixed(2)} CAD\n\n` +
      `*Send to this Monero address:*\n` +
      `\`${address}\`\n\n` +
      `⏱ *Time Remaining:*\n` +
      `${expiresInMinutes} minutes\n\n` +
      `────────────────────────\n` +
      `*What happens next?*\n` +
      `────────────────────────\n` +
      `Once payment is confirmed, you'll be able to choose your appointment date.`;
  }

  /**
   * Generate QR code URL for payment
   * Uses monero: URI scheme
   */
  generateQrCodeUrl(address, amountAtomic) {
    const xmrAmount = this.atomicToXmr(amountAtomic);
    const uri = `monero:${address}?tx_amount=${xmrAmount}`;
    // Use QR code API
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(uri)}`;
  }

  /**
   * Create BULK payment request - one invoice for multiple appointments
   * Used after bulk upload completes - single payment for all
   */
  async createBulkPaymentRequest(appointmentIds, userId, customerCount) {
    if (!this.enabled) {
      throw new Error('Payments are not enabled');
    }

    // Calculate total: $250 * number of customers
    const totalCAD = this.priceCAD * customerCount;

    // Get exchange rate
    const xmrRate = await this.getExchangeRate();
    if (!xmrRate) {
      throw new Error('Could not fetch XMR exchange rate');
    }

    const atomicUnits = this.cadToAtomicUnits(totalCAD, xmrRate);
    if (!atomicUnits) {
      throw new Error('Could not calculate XMR amount');
    }

    console.log(`Creating BULK payment: ${customerCount} customers x $${this.priceCAD} = $${totalCAD} CAD = ${this.atomicToXmr(atomicUnits)} XMR`);

    try {
      const response = await fetch(`${this.baseUrl}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: atomicUnits,
          description: `Lodge Mobile Bulk: ${customerCount} appointments`,
          callback_url: process.env.MONEROPAY_CALLBACK_URL || `${process.env.APP_URL}/api/payments/webhook`
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MoneroPay error: ${response.status} - ${errorText}`);
      }

      const paymentData = await response.json();
      const expiresAt = new Date(Date.now() + this.paymentWindowMinutes * 60 * 1000);

      const knex = Model.knex();

      // Create single payment record linked to multiple appointments
      const [paymentId] = await knex('payments').insert({
        appointment_id: null, // Will link via metadata for bulk
        user_id: userId,
        moneropay_address: paymentData.address,
        payment_id: paymentData.payment_id || null,
        amount_cad: totalCAD,
        amount_xmr: String(atomicUnits),
        exchange_rate: xmrRate,
        status: 'pending',
        expires_at: expiresAt,
        metadata: JSON.stringify({
          ...paymentData,
          bulk: true,
          customer_count: customerCount,
          appointment_ids: appointmentIds
        }),
        created_at: new Date(),
        updated_at: new Date()
      });

      return {
        id: paymentId,
        address: paymentData.address,
        amountXmr: this.atomicToXmr(atomicUnits),
        amountCad: totalCAD,
        pricePerCustomer: this.priceCAD,
        customerCount,
        exchangeRate: xmrRate,
        expiresAt: expiresAt,
        expiresInMinutes: this.paymentWindowMinutes,
        appointmentIds
      };
    } catch (error) {
      console.error('MoneroPay createBulkPaymentRequest error:', error);
      throw error;
    }
  }

  /**
   * Generate bulk payment message for Telegram
   */
  generateBulkPaymentMessage(paymentData) {
    const { address, amountXmr, amountCad, customerCount, pricePerCustomer, expiresInMinutes } = paymentData;

    return `💰 *Bulk Payment Required*\n\n` +
      `Customers: *${customerCount}*\n` +
      `Price per customer: $${pricePerCustomer.toFixed(2)} CAD\n` +
      `*Total: ${amountXmr} XMR*\n` +
      `(~$${amountCad.toFixed(2)} CAD)\n\n` +
      `Send payment to:\n` +
      `\`${address}\`\n\n` +
      `⏱ Payment expires in ${expiresInMinutes} minutes\n\n` +
      `_All ${customerCount} appointments will be confirmed once payment is received._`;
  }
}

module.exports = MoneroPayService;
