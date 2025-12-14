/**
 * Telegram Payment Provider - Rule 17 Compliance
 * Implements secure Telegram payment flows with transaction logging and fraud detection
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class TelegramPaymentProvider extends EventEmitter {
  constructor(bot, config = {}) {
    super();
    this.bot = bot;
    this.config = {
      providerToken: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN,
      currency: config.currency || 'USD',
      maxAmount: config.maxAmount || 10000, // $100.00 in cents
      minAmount: config.minAmount || 100, // $1.00 in cents
      enableFraudDetection: config.enableFraudDetection !== false,
      transactionTimeout: config.transactionTimeout || 600000, // 10 minutes
      webhook_secret: process.env.PAYMENT_WEBHOOK_SECRET,
      ...config
    };
    
    this.transactions = new Map();
    this.fraudScores = new Map();
    this.rateLimits = new Map();
    
    this.initializePaymentHandling();
  }

  /**
   * Initialize payment handling
   */
  initializePaymentHandling() {
    // Handle pre-checkout queries
    this.bot.on('pre_checkout_query', async (ctx) => {
      try {
        await this.handlePreCheckoutQuery(ctx);
      } catch (error) {
        console.error('Pre-checkout query error:', error);
        await ctx.answerPreCheckoutQuery(false, 'Payment processing error. Please try again.');
      }
    });

    // Handle successful payments
    this.bot.on('successful_payment', async (ctx) => {
      try {
        await this.handleSuccessfulPayment(ctx);
      } catch (error) {
        console.error('Payment success handler error:', error);
      }
    });

    console.log('💳 Telegram payment provider initialized');
  }

  /**
   * Create payment invoice
   */
  async createInvoice(ctx, productData) {
    try {
      // Validate product data
      const validatedProduct = this.validateProductData(productData);
      
      // Check rate limits
      if (!this.checkRateLimit(ctx.from.id, 'create_invoice')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      // Generate transaction ID
      const transactionId = this.generateTransactionId();
      
      // Create invoice
      const invoice = {
        title: validatedProduct.title,
        description: validatedProduct.description,
        payload: JSON.stringify({
          transactionId,
          userId: ctx.from.id,
          productId: validatedProduct.id,
          timestamp: Date.now()
        }),
        provider_token: this.config.providerToken,
        currency: this.config.currency,
        prices: validatedProduct.prices,
        start_parameter: `payment_${transactionId}`,
        photo_url: validatedProduct.photo_url,
        photo_size: validatedProduct.photo_size,
        photo_width: validatedProduct.photo_width,
        photo_height: validatedProduct.photo_height,
        need_name: validatedProduct.need_name,
        need_phone_number: validatedProduct.need_phone_number,
        need_email: validatedProduct.need_email,
        need_shipping_address: validatedProduct.need_shipping_address,
        send_phone_number_to_provider: validatedProduct.send_phone_number_to_provider,
        send_email_to_provider: validatedProduct.send_email_to_provider,
        is_flexible: validatedProduct.is_flexible
      };
      
      // Store transaction
      this.transactions.set(transactionId, {
        id: transactionId,
        userId: ctx.from.id,
        status: 'pending',
        product: validatedProduct,
        invoice,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.transactionTimeout)
      });
      
      // Send invoice
      const sentMessage = await ctx.replyWithInvoice(invoice);
      
      // Log transaction creation
      await this.logTransaction(transactionId, 'created', {
        userId: ctx.from.id,
        productId: validatedProduct.id,
        amount: this.calculateTotalAmount(validatedProduct.prices),
        messageId: sentMessage.message_id
      });
      
      // Emit event
      this.emit('invoiceCreated', { transactionId, userId: ctx.from.id, product: validatedProduct });
      
      return { transactionId, messageId: sentMessage.message_id };
      
    } catch (error) {
      console.error('Invoice creation error:', error);
      throw error;
    }
  }

  /**
   * Handle pre-checkout query
   */
  async handlePreCheckoutQuery(ctx) {
    const query = ctx.preCheckoutQuery;
    
    try {
      // Parse payload
      const payload = JSON.parse(query.invoice_payload);
      const transaction = this.transactions.get(payload.transactionId);
      
      if (!transaction) {
        await ctx.answerPreCheckoutQuery(false, 'Transaction not found or expired.');
        return;
      }
      
      // Check if transaction is expired
      if (new Date() > transaction.expiresAt) {
        await ctx.answerPreCheckoutQuery(false, 'Transaction expired. Please create a new payment.');
        this.transactions.delete(payload.transactionId);
        return;
      }
      
      // Fraud detection
      if (this.config.enableFraudDetection) {
        const fraudScore = await this.calculateFraudScore(ctx.from, query);
        
        if (fraudScore > 0.8) {
          console.warn(`High fraud score ${fraudScore} for user ${ctx.from.id}`);
          await ctx.answerPreCheckoutQuery(false, 'Payment verification failed. Please contact support.');
          
          await this.logTransaction(payload.transactionId, 'fraud_detected', {
            userId: ctx.from.id,
            fraudScore,
            reason: 'High fraud score'
          });
          
          return;
        }
        
        this.fraudScores.set(payload.transactionId, fraudScore);
      }
      
      // Validate amount
      const totalAmount = query.total_amount;
      const expectedAmount = this.calculateTotalAmount(transaction.product.prices);
      
      if (totalAmount !== expectedAmount) {
        await ctx.answerPreCheckoutQuery(false, 'Amount mismatch detected.');
        
        await this.logTransaction(payload.transactionId, 'amount_mismatch', {
          userId: ctx.from.id,
          expectedAmount,
          receivedAmount: totalAmount
        });
        
        return;
      }
      
      // Update transaction status
      transaction.status = 'pre_approved';
      transaction.preCheckoutData = {
        id: query.id,
        currency: query.currency,
        totalAmount: query.total_amount,
        orderInfo: query.order_info
      };
      
      // Approve pre-checkout
      await ctx.answerPreCheckoutQuery(true);
      
      // Log pre-checkout approval
      await this.logTransaction(payload.transactionId, 'pre_approved', {
        userId: ctx.from.id,
        amount: totalAmount,
        currency: query.currency
      });
      
      // Emit event
      this.emit('preCheckoutApproved', { 
        transactionId: payload.transactionId, 
        userId: ctx.from.id, 
        amount: totalAmount 
      });
      
    } catch (error) {
      console.error('Pre-checkout query handling error:', error);
      await ctx.answerPreCheckoutQuery(false, 'Payment processing error. Please try again.');
    }
  }

  /**
   * Handle successful payment
   */
  async handleSuccessfulPayment(ctx) {
    const payment = ctx.message.successful_payment;
    
    try {
      // Parse payload
      const payload = JSON.parse(payment.invoice_payload);
      const transaction = this.transactions.get(payload.transactionId);
      
      if (!transaction) {
        console.error('Transaction not found for successful payment:', payload.transactionId);
        return;
      }
      
      // Update transaction status
      transaction.status = 'completed';
      transaction.paymentData = {
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        providerPaymentChargeId: payment.provider_payment_charge_id,
        currency: payment.currency,
        totalAmount: payment.total_amount,
        orderInfo: payment.order_info,
        shippingOptionId: payment.shipping_option_id,
        completedAt: new Date()
      };
      
      // Log successful payment
      await this.logTransaction(payload.transactionId, 'completed', {
        userId: ctx.from.id,
        telegramChargeId: payment.telegram_payment_charge_id,
        providerChargeId: payment.provider_payment_charge_id,
        amount: payment.total_amount,
        currency: payment.currency
      });
      
      // Process the purchase (implement your business logic here)
      await this.processSuccessfulPurchase(transaction, payment);
      
      // Send confirmation to user
      await ctx.reply(
        '✅ *Payment Successful!*\n\n' +
        `Transaction ID: \`${payload.transactionId}\`\n` +
        `Amount: ${payment.total_amount / 100} ${payment.currency}\n` +
        `Product: ${transaction.product.title}\n\n` +
        'Thank you for your purchase! You will receive your order details shortly.',
        { parse_mode: 'Markdown' }
      );
      
      // Emit event
      this.emit('paymentCompleted', { 
        transaction, 
        payment, 
        userId: ctx.from.id 
      });
      
    } catch (error) {
      console.error('Successful payment handling error:', error);
      
      // Send error message to user
      await ctx.reply(
        '⚠️ Payment was processed, but there was an issue completing your order. ' +
        'Please contact support with your transaction details.'
      );
    }
  }

  /**
   * Process successful purchase (implement business logic)
   */
  async processSuccessfulPurchase(transaction, payment) {
    // This is where you'd implement your specific business logic
    // For example:
    // - Update user account
    // - Grant access to premium features
    // - Send digital products
    // - Create database records
    
    console.log(`Processing purchase for user ${transaction.userId}: ${transaction.product.title}`);
    
    // Example: Update user's purchase history
    try {
      const User = require('../../models/User');
      const user = await User.query()
        .where('telegram_id', transaction.userId.toString())
        .first();
      
      if (user) {
        // Add purchase to user's history (you'd need to create this field)
        const purchaseRecord = {
          transactionId: transaction.id,
          productId: transaction.product.id,
          productTitle: transaction.product.title,
          amount: payment.total_amount,
          currency: payment.currency,
          purchasedAt: new Date()
        };
        
        // You would save this to your database
        console.log('Purchase record created:', purchaseRecord);
      }
      
    } catch (error) {
      console.error('Error updating user purchase history:', error);
    }
  }

  /**
   * Calculate fraud score
   */
  async calculateFraudScore(user, query) {
    let score = 0;
    
    // Check user account age (newer accounts are riskier)
    const accountAge = Date.now() - user.id * 1000; // Rough estimation
    if (accountAge < 86400000) { // Less than 24 hours
      score += 0.3;
    }
    
    // Check if user has username
    if (!user.username) {
      score += 0.1;
    }
    
    // Check payment frequency for this user
    const userTransactions = Array.from(this.transactions.values())
      .filter(t => t.userId === user.id);
    
    if (userTransactions.length > 5) { // More than 5 transactions
      score += 0.2;
    }
    
    // Check for suspicious patterns in order info
    if (query.order_info) {
      const orderInfo = query.order_info;
      
      // Check for disposable email domains
      if (orderInfo.email && this.isDisposableEmail(orderInfo.email)) {
        score += 0.3;
      }
      
      // Check for suspicious names
      if (orderInfo.name && this.isSuspiciousName(orderInfo.name)) {
        score += 0.2;
      }
    }
    
    // Check rate limiting - rapid payment attempts
    const recentAttempts = this.getRateLimitCount(user.id, 'payment_attempt');
    if (recentAttempts > 3) {
      score += 0.4;
    }
    
    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Check if email is from a disposable email provider
   */
  isDisposableEmail(email) {
    const disposableDomains = [
      '10minutemail.com', 'guerrillamail.com', 'tempmail.org',
      'mailinator.com', 'yopmail.com', 'temp-mail.org'
    ];
    
    const domain = email.toLowerCase().split('@')[1];
    return disposableDomains.includes(domain);
  }

  /**
   * Check if name is suspicious
   */
  isSuspiciousName(name) {
    const suspiciousPatterns = [
      /^test/i, /^fake/i, /^spam/i, /^admin/i,
      /^\d+$/, // Only numbers
      /^[a-z]$/, // Single character
      /^(.)\1{4,}$/ // Repeated character
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Validate product data
   */
  validateProductData(productData) {
    const required = ['title', 'description', 'prices'];
    
    for (const field of required) {
      if (!productData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate prices
    if (!Array.isArray(productData.prices) || productData.prices.length === 0) {
      throw new Error('Invalid prices array');
    }
    
    const totalAmount = this.calculateTotalAmount(productData.prices);
    if (totalAmount < this.config.minAmount || totalAmount > this.config.maxAmount) {
      throw new Error(`Amount ${totalAmount} is outside allowed range`);
    }
    
    return {
      id: productData.id || this.generateProductId(),
      title: productData.title,
      description: productData.description,
      prices: productData.prices,
      photo_url: productData.photo_url,
      photo_size: productData.photo_size,
      photo_width: productData.photo_width || 512,
      photo_height: productData.photo_height || 512,
      need_name: productData.need_name || false,
      need_phone_number: productData.need_phone_number || false,
      need_email: productData.need_email || false,
      need_shipping_address: productData.need_shipping_address || false,
      send_phone_number_to_provider: productData.send_phone_number_to_provider || false,
      send_email_to_provider: productData.send_email_to_provider || false,
      is_flexible: productData.is_flexible || false
    };
  }

  /**
   * Calculate total amount from prices array
   */
  calculateTotalAmount(prices) {
    return prices.reduce((total, price) => total + price.amount, 0);
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `tx_${timestamp}_${random}`;
  }

  /**
   * Generate product ID
   */
  generateProductId() {
    return `prod_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Check rate limit for user and operation
   */
  checkRateLimit(userId, operation, limit = 5, windowMs = 3600000) {
    const key = `${userId}_${operation}`;
    const now = Date.now();
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    const rateLimitData = this.rateLimits.get(key);
    
    if (now > rateLimitData.resetTime) {
      // Reset window
      rateLimitData.count = 1;
      rateLimitData.resetTime = now + windowMs;
      return true;
    }
    
    if (rateLimitData.count >= limit) {
      return false;
    }
    
    rateLimitData.count++;
    return true;
  }

  /**
   * Get rate limit count
   */
  getRateLimitCount(userId, operation) {
    const key = `${userId}_${operation}`;
    const rateLimitData = this.rateLimits.get(key);
    
    if (!rateLimitData || Date.now() > rateLimitData.resetTime) {
      return 0;
    }
    
    return rateLimitData.count;
  }

  /**
   * Log transaction event
   */
  async logTransaction(transactionId, event, data = {}) {
    const logEntry = {
      transactionId,
      event,
      data,
      timestamp: new Date(),
      ip: data.ip || 'unknown'
    };
    
    // Log to console (in production, you'd save to database)
    console.log('💳 Transaction log:', logEntry);
    
    // You could save to database here
    // await TransactionLog.create(logEntry);
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId) {
    return this.transactions.get(transactionId);
  }

  /**
   * Get payment statistics
   */
  getPaymentStats() {
    const transactions = Array.from(this.transactions.values());
    
    const stats = {
      total: transactions.length,
      pending: transactions.filter(t => t.status === 'pending').length,
      completed: transactions.filter(t => t.status === 'completed').length,
      failed: transactions.filter(t => t.status === 'failed').length,
      revenue: transactions
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + (t.paymentData?.totalAmount || 0), 0),
      averageFraudScore: Array.from(this.fraudScores.values())
        .reduce((sum, score, _, arr) => sum + score / arr.length, 0)
    };
    
    return stats;
  }

  /**
   * Clean up expired transactions
   */
  cleanupExpiredTransactions() {
    const now = new Date();
    
    for (const [id, transaction] of this.transactions) {
      if (transaction.expiresAt < now && transaction.status === 'pending') {
        this.transactions.delete(id);
        console.log(`Cleaned up expired transaction: ${id}`);
      }
    }
  }
}

module.exports = TelegramPaymentProvider;