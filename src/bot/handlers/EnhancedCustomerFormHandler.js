
const CustomerRegistrationService = require('../../services/CustomerRegistrationService');
const { Markup } = require('telegraf');

class EnhancedCustomerFormHandler {
  constructor(bot, services = {}) {
    this.bot = bot;
    this.services = services;
    this.registrationService = new CustomerRegistrationService();
    this.validationCache = new Map(); // Cache validation results
    
    // Form step configuration - MUST be defined before setupCallbacks
    // 14 steps total (13 if DL skipped, which also skips dlIssued and dlExpiry)
    // Suite/Unit comes before Street Number for better address flow
    this.formSteps = [
      'firstName', 'middleName', 'lastName', 'dateOfBirth',
      'suiteUnit', 'streetNumber', 'streetAddress', 'city', 'province',
      'postalCode', 'driverLicense', 'dlIssued', 'dlExpiry'
    ];

    this.stepTitles = {
      firstName: 'First Name',
      middleName: 'Middle Name (Optional)',
      lastName: 'Last Name',
      dateOfBirth: 'Date of Birth',
      streetNumber: 'Street Number',
      suiteUnit: 'Suite/Unit # (Optional)',
      streetAddress: 'Street Name',
      city: 'City',
      province: 'Province/Territory',
      postalCode: 'Postal Code',
      driverLicense: "Driver's License # (Optional)",
      dlIssued: 'DL Issue Date (Optional)',
      dlExpiry: 'DL Expiry Date (Optional)'
    };
    
    // Handlers will be set up when setupHandlers is called with bot instance
    // Removed automatic setup from constructor to prevent initialization errors
  }

  getStepNumber(step) {
    return this.formSteps.indexOf(step) + 1;
  }
  
  createConfirmationMessage(step, value) {
    const stepNum = this.getStepNumber(step);
    const title = this.stepTitles[step];
    
    let message = `*Registration - Step ${stepNum} of 13*\n`;
    message += `*${title}*\n\n`;
    
    // Add contextual confirmation message with the value
    message += this.getConfirmationPrompt(step, value);
    
    return message;
  }
  
  // Removed formatConfirmationValue - no longer needed
  
  getConfirmationPrompt(step, value) {
    const prompts = {
      firstName: `✨ Nice to meet you, *${value}*!\n\nIs this your first name?`,
      middleName: value.toLowerCase() === 'skip'
        ? `✅ Skipping middle name.\n\nContinue to next step?`
        : `✅ Got it! Your middle name is *${value}*.\n\nIs this correct?`,
      lastName: `👤 Your full name will be displayed as:\n*${value}*\n\nIs this correct?`,
      dateOfBirth: `🎂 You were born on *${value}*\n(${this.registrationService.calculateAge(value)} years old)\n\nIs this correct?`,
      streetNumber: `🏠 Your street number is *${value}*.\n\nIs this correct?`,
      suiteUnit: value.toLowerCase() === 'skip'
        ? `✅ No suite/unit number.\n\nContinue to next step?`
        : `🏢 Your suite/unit is *${value}*.\n\nIs this correct?`,
      streetAddress: `📍 Your street is *${value}*.\n\nIs this correct?`,
      city: `🏙️ You live in *${value}*.\n\nIs this correct?`,
      postalCode: `📮 Your postal code is *${value.toUpperCase()}*.\n\nIs this correct?`,
      driverLicense: value.toLowerCase() === 'skip'
        ? `✅ Skipping driver's license.\n\nContinue to next step?`
        : `🆔 Your license number is *${value}*.\n\nIs this correct?`,
      dlIssued: value.toLowerCase() === 'skip'
        ? `✅ Skipping issue date.\n\nContinue to next step?`
        : `📅 License issued on *${value}*.\n\nIs this correct?`,
      dlExpiry: value.toLowerCase() === 'skip'
        ? `✅ Skipping expiry date.\n\nContinue to final review?`
        : `📅 License expires on *${value}*.\n\nIs this correct?`
    };

    return prompts[step] || `✅ You entered: *${value}*\n\nIs this correct?`;
  }
  
  // Removed getFullNamePreview - needs ctx parameter which isn't available in this context

  getPreviousStep(currentStep) {
    const index = this.formSteps.indexOf(currentStep);
    return index > 0 ? this.formSteps[index - 1] : null;
  }

  getNextStep(currentStep) {
    const index = this.formSteps.indexOf(currentStep);
    
    // If we've reached the end of the form
    if (index >= this.formSteps.length - 1) {
      return null;
    }
    
    // Normal progression
    return this.formSteps[index + 1];
  }

  formatStepValue(step, value) {
    if (!value) return '(not provided)';
    
    // Special formatting for certain fields
    if (step === 'province') {
      return this.registrationService.getProvinceName(value) || value;
    }
    
    return value;
  }

  async showFormStep(ctx, step, isEdit = false) {
    const stepNum = this.getStepNumber(step);
    const title = this.stepTitles[step];
    const currentValue = ctx.session.registration.data[step];
    
    // Adjust total steps if driver's license was/will be skipped
    let totalSteps = this.formSteps.length;
    const dlValue = ctx.session.registration.data?.driverLicense;
    if (dlValue === null || dlValue === undefined || 
        (typeof dlValue === 'string' && dlValue.toLowerCase() === 'skip')) {
      // If DL is skipped, we skip 2 additional fields (dlIssued, dlExpiry)
      totalSteps = totalSteps - 2;
    }
    
    let message = `*Lodge Scheduler Registration*\n`;
    message += `Step ${stepNum} of ${totalSteps}\n\n`;
    
    // Field title
    message += `*${title}*\n\n`;
    
    // Show current value if editing
    if (isEdit && currentValue) {
      message += `📝 Current: _${this.formatStepValue(step, currentValue)}_\n`;
      message += `✏️ Enter new value below:\n\n`;
    }
    
    // Add step-specific instructions
    message += this.getStepInstructions(step);
    
    // Add helpful tips based on step
    const tip = this.getStepTip(step);
    if (tip) {
      message += `\n\n💡 _${tip}_`;
    }
    
    // Store pending input state - CRITICAL for text handler to process input
    ctx.session.registration.pendingInput = null;
    ctx.session.registration.awaitingInput = true;
    ctx.session.registration.step = step;

    console.log(`📝 Form step ${step} shown, awaitingInput = true`);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { force_reply: true }
    });
  }
  
  // Removed createProgressBar - no longer needed
  
  getStepTip(step) {
    const tips = {
      firstName: 'Use your legal first name as it appears on your ID',
      middleName: 'Type "skip" if you don\'t have a middle name',
      dateOfBirth: 'Must be 18 or older to register. Use 2-digit month and day',
      suiteUnit: 'Type "skip" if you don\'t live in an apartment or condo',
      postalCode: 'Canadian format: A1B 2C3',
      driverLicense: 'Optional - helps verify your identity',
      dlIssued: 'Found on your driver\'s license',
      dlExpiry: 'Make sure your license is valid'
    };

    return tips[step] || null;
  }

  getStepInstructions(step) {
    const instructions = {
      firstName: 'Please enter your first name:',
      middleName: 'Enter your middle name or type "skip" to continue:',
      lastName: 'Please enter your last name:',
      dateOfBirth: '📅 Please enter your date of birth:\n\n' +
                   '✅ *Accepted formats:*\n' +
                   '• MM/DD/YYYY (e.g., 03/15/1990)\n' +
                   '• MM-DD-YYYY (e.g., 03-15-1990)\n\n' +
                   '*Example:* 01/25/1985',
      streetNumber: 'Please enter your street number:',
      suiteUnit: 'Enter your apartment/suite/unit number or type "skip":',
      streetAddress: 'Please enter your street name (e.g., Main Street):',
      city: 'Please enter your city:',
      province: 'Select your province/territory from the buttons below:',
      postalCode: 'Please enter your postal code:',
      driverLicense: 'Enter your driver\'s license number or type "skip":\n\n' +
                      '💡 _If you skip this, we won\'t ask for issue/expiry dates_',
      dlIssued: '📅 Enter DL issue date:\n\n' +
                 '✅ *Accepted formats:*\n' +
                 '• MM/DD/YYYY or MM-DD-YYYY\n\n' +
                 '*Example:* 06/10/2020\n' +
                 'Or type "skip" if not applicable',
      dlExpiry: '📅 Enter DL expiry date:\n\n' +
                '✅ *Accepted formats:*\n' +
                '• MM/DD/YYYY or MM-DD-YYYY\n\n' +
                '*Example:* 06/10/2025\n' +
                'Or type "skip" if not applicable'
    };

    return instructions[step] || 'Please enter your information:';
  }

  createNavigationButtons(step, hasInput = false) {
    const buttons = [];
    const stepNum = this.getStepNumber(step);
    const totalSteps = this.formSteps.length;

    // First row - Confirm and Edit buttons side by side (only if there's input)
    if (hasInput) {
      buttons.push([
        Markup.button.callback('✅ Confirm', `reg_confirm_${step}`),
        Markup.button.callback('✏️ Edit', `reg_edit_${step}`)
      ]);
    }

    // Second row - Navigation
    const navRow = [];
    if (stepNum > 1) {
      navRow.push(Markup.button.callback('Back', `reg_back_${step}`));
    }

    // Add step indicator in middle
    navRow.push(Markup.button.callback(`${stepNum}/${totalSteps}`, 'reg_progress'));

    navRow.push(Markup.button.callback('Cancel', 'reg_cancel'));
    buttons.push(navRow);

    return Markup.inlineKeyboard(buttons);
  }

  setupHandlers(bot, services = null) {
    this.bot = bot;
    if (services) {
      this.services = services;
    }
    this.setupTextHandler();
    // NOTE: setupCallbacks() is DISABLED - all callbacks are now handled by FixedCallbackQueryHandler
    // to prevent duplicate handlers which cause bugs like showing firstName after reg_confirm_final
    // this.setupCallbacks();
  }

  setupTextHandler() {
    if (!this.bot) return;
    console.log('📝 Setting up registration form text handler');

    this.bot.on('text', async (ctx, next) => {
      // Skip command messages
      if (ctx.message?.text?.startsWith('/')) {
        return next();
      }

      // Log for debugging
      console.log('📨 Text received:', ctx.message?.text?.substring(0, 50));
      console.log('📋 Session state:', JSON.stringify({
        hasSession: !!ctx.session,
        hasRegistration: !!ctx.session?.registration,
        hasSupport: !!ctx.session?.support,
        supportStep: ctx.session?.support?.step,
        supportAwaiting: ctx.session?.support?.awaitingInput
      }));

      // Check for support ticket creation flow FIRST
      if (ctx.session?.support?.awaitingInput) {
        console.log('🎫 Processing support ticket input for step:', ctx.session.support.step);
        const callbackHandler = this.services?.callbackHandler;
        if (callbackHandler && typeof callbackHandler.handleSupportInput === 'function') {
          const handled = await callbackHandler.handleSupportInput(ctx);
          if (handled) {
            console.log('✅ Support input handled successfully');
            return;
          }
        }
      }

      // Check for admin ticket reply flow
      if (ctx.session?.adminReplyTicket) {
        console.log('💬 Processing admin reply to ticket:', ctx.session.adminReplyTicket);
        const callbackHandler = this.services?.callbackHandler;
        if (callbackHandler && typeof callbackHandler.handleAdminTicketReply === 'function') {
          const handled = await callbackHandler.handleAdminTicketReply(ctx);
          if (handled) {
            console.log('✅ Admin reply handled successfully');
            return;
          }
        }
      }

      // Check for admin broadcast message composition flow
      if (ctx.session?.adminBroadcast?.awaiting) {
        console.log('📢 Processing admin broadcast message input');
        const message = ctx.message.text.trim();

        // Store the message and clear awaiting flag
        ctx.session.adminBroadcast = { awaiting: false, message };

        // Show preview with confirm/cancel buttons
        const { Markup } = require('telegraf');
        await ctx.reply(
          `📢 *Broadcast Preview*\n\n` +
          `${message}\n\n` +
          `─────────────────\n` +
          `Ready to send to all active users?`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('✅ Send to All', 'admin_broadcast_confirm')],
              [Markup.button.callback('✏️ Edit Message', 'admin_broadcast')],
              [Markup.button.callback('❌ Cancel', 'admin_broadcast_cancel')]
            ]).reply_markup
          }
        );
        console.log('✅ Broadcast preview shown');
        return;
      }

      if (!ctx.session?.registration?.step || !ctx.session?.registration?.awaitingInput) {
        console.log('📋 Not in registration flow, passing to next handler');
        return next();
      }

      console.log('✅ Processing registration text input for step:', ctx.session.registration.step);

      const step = ctx.session.registration.step;
      const text = ctx.message.text.trim();
      
      // Store the pending input
      ctx.session.registration.pendingInput = text;
      ctx.session.registration.awaitingInput = false;
      
      // Validate input based on step
      const validationResult = await this.validateInput(ctx, step, text);
      
      if (!validationResult.valid) {
        await ctx.reply(
          `❌ ${validationResult.message}\n\nPlease try again:`,
          { reply_markup: { force_reply: true } }
        );
        ctx.session.registration.awaitingInput = true;
        return;
      }
      
      // Show beautifully formatted confirmation
      const confirmMessage = this.createConfirmationMessage(step, text);
      
      await ctx.reply(confirmMessage, {
        parse_mode: 'Markdown',
        reply_markup: this.createNavigationButtons(step, true).reply_markup
      });
    });
  }

  async validateInput(ctx, step, text) {
    switch (step) {
      case 'firstName':
      case 'lastName':
        if (text.length < 2) {
          return { valid: false, message: 'Name must be at least 2 characters long' };
        }
        break;
        
      case 'dateOfBirth':
        if (!this.registrationService.validateDate(text)) {
          return { valid: false, message: 'Invalid date format. Please use MM/DD/YYYY or MM-DD-YYYY' };
        }
        const age = this.registrationService.calculateAge(text);
        if (age < 18) {
          return { valid: false, message: 'You must be 18 or older to register' };
        }
        break;
        
      case 'postalCode':
        if (!this.registrationService.validatePostalCode(text)) {
          return { valid: false, message: 'Invalid postal code format (e.g., A1B 2C3)' };
        }
        break;
        
  
      case 'dlIssued':
      case 'dlExpiry':
        if (text.toLowerCase() !== 'skip' && !this.registrationService.validateDate(text)) {
          return { valid: false, message: 'Invalid date format. Use MM/DD/YYYY or MM-DD-YYYY, or type "skip"' };
        }
        break;
    }
    
    return { valid: true };
  }

  setupCallbacks() {
    if (!this.bot) return;
    // Handle registration start button
    this.bot.action('reg_start', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText('📝 Starting registration...');
      await this.showFormStep(ctx, 'firstName');
    });
    
    // Handle confirm button for each step
    this.formSteps.forEach(step => {
      this.bot.action(`reg_confirm_${step}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        const pendingInput = ctx.session.registration.pendingInput;
        
        // Save the confirmed input
        if (step === 'middleName' || step === 'driverLicense' || 
            step === 'dlIssued' || step === 'dlExpiry') {
          if (pendingInput.toLowerCase() !== 'skip') {
            ctx.session.registration.data[step] = pendingInput;
          } else if (step === 'driverLicense') {
            // If driver's license is skipped, mark it and also skip the related dates
            ctx.session.registration.data[step] = null;
            ctx.session.registration.data.dlIssued = null;
            ctx.session.registration.data.dlExpiry = null;
          }
        } else {
          ctx.session.registration.data[step] = pendingInput;
        }
        
        // Determine the next step
        let nextStep = this.getNextStep(step);
        
        // Special handling: Skip DL dates if driver's license was skipped
        if (step === 'driverLicense' && 
            (!pendingInput || pendingInput.toLowerCase() === 'skip')) {
          // Jump directly to completion (skip dlIssued and dlExpiry)
          nextStep = null;
        }
        
        if (nextStep) {
          ctx.session.registration.step = nextStep;
          
          // Special handling for province selection
          if (nextStep === 'province') {
            await this.showProvinceSelection(ctx);
          } else {
            await ctx.editMessageText('✅ Information saved!');
            await this.showFormStep(ctx, nextStep);
          }
        } else {
          // Last step completed - show final summary
          console.log('Last step completed, showing registration summary');
          await ctx.editMessageText('✅ Information saved!');
          await this.showRegistrationSummary(ctx);
        }
      });
      
      // Handle edit button for each step
      this.bot.action(`reg_edit_${step}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        // Clear pending input and allow re-entry
        ctx.session.registration.pendingInput = null;
        ctx.session.registration.awaitingInput = true;
        
        await ctx.editMessageText('✏️ Please enter the correct value:');
        await this.showFormStep(ctx, step, true);
      });
      
      // Handle back button for each step
      this.bot.action(`reg_back_${step}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        const previousStep = this.getPreviousStep(step);
        if (previousStep) {
          ctx.session.registration.step = previousStep;
          await ctx.editMessageText('⬅️ Going back...');
          
          if (previousStep === 'province') {
            await this.showProvinceSelection(ctx);
          } else {
            await this.showFormStep(ctx, previousStep, true);
          }
        }
      });
    });
    
    // Handle progress indicator button (just shows progress, no action)
    this.bot.action('reg_progress', async (ctx) => {
      await ctx.answerCbQuery('Progress indicator');
    });
    
    // Handle cancel button
    this.bot.action('reg_cancel', async (ctx) => {
      await ctx.answerCbQuery();
      
      ctx.session.registration = null;
      await ctx.editMessageText(
        '❌ *Registration Cancelled*\n\n' +
        'Your registration has been cancelled. Use /book to start again.',
        { parse_mode: 'Markdown' }
      );
    });
    
    // Handle province selection
    const provinces = this.registrationService.getProvinces();
    provinces.forEach(({ code }) => {
      this.bot.action(`reg_province_${code}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        const provinceName = this.registrationService.getProvinceName(code);
        ctx.session.registration.data.province = code;
        ctx.session.registration.step = 'postalCode';
        
        await ctx.editMessageText(`✅ Selected: ${provinceName}`);
        await this.showFormStep(ctx, 'postalCode');
      });
    });
    
    // Handle final confirmation
    this.bot.action('reg_confirm_final', async (ctx) => {
      await ctx.answerCbQuery();
      
      // Save customer info to session
      ctx.session.customerInfo = ctx.session.registration.data;
      
      // IMPORTANT: Check if we already have booking data (date/time) from before registration
      const hasBookingData = ctx.session.booking && ctx.session.booking.date && ctx.session.booking.time;
      
      if (hasBookingData) {
        // We already have date/time selected, go straight to confirmation
        const booking = ctx.session.booking;
        const moment = require('moment-timezone');
        const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm').tz('America/New_York');
        const formattedDate = dateTime.format('MMM DD, YYYY');
        const formattedTime = dateTime.format('h:mm A');
        
        // Get the user's registration summary
        const userSummary = this.registrationService.createRegistrationSummary(ctx.session.registration.data);
        
        // Create combined summary with user info AND booking details
        const summary = `
✅ *Registration & Booking Confirmation*

${userSummary}

*📋 Appointment Details:*
📅 Date: ${formattedDate}
⏰ Time: ${formattedTime} EST
📱 Service: ${booking.service || 'Lodge Scheduler Service'}
⏱️ Duration: ${booking.duration || 90} minutes

Ready to confirm your booking?
        `;
        
        await ctx.editMessageText(summary, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Confirm & Pay', 'confirm_booking'),
              Markup.button.callback('📅 Change Date/Time', 'show_calendar')
            ],
            [Markup.button.callback('❌ Cancel', 'cancel_booking')]
          ]).reply_markup
        });
      } else {
        // No booking data yet - check if payment is required before showing calendar
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/bot/handlers/EnhancedCustomerFormHandler.js:571',message:'Registration complete - checking payment requirement',data:{hasPaymentHandler:!!this.services?.paymentHandler,paymentConfirmed:ctx.session?.paymentConfirmed},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        
        // Check if payment is required
        console.log('🔍 Payment check:', {
          hasPaymentHandler: !!this.services?.paymentHandler,
          hasMoneroPayService: !!this.services?.paymentHandler?.moneroPayService,
          isEnabled: this.services?.paymentHandler?.moneroPayService?.isEnabled(),
          paymentConfirmed: ctx.session?.paymentConfirmed,
          enablePaymentsEnv: process.env.ENABLE_PAYMENTS
        });

        if (this.services?.paymentHandler && this.services.paymentHandler.moneroPayService?.isEnabled()) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/bot/handlers/EnhancedCustomerFormHandler.js:576',message:'Payment enabled - checking if payment confirmed',data:{paymentConfirmed:ctx.session?.paymentConfirmed},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          
          if (!ctx.session?.paymentConfirmed) {
            // Payment required - create payment request
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/bot/handlers/EnhancedCustomerFormHandler.js:581',message:'Payment not confirmed - creating payment request',data:{userId:ctx.from?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
            try {
              const User = require('../../models/User');
              const user = await User.query().where('telegram_id', ctx.from.id.toString()).first();
              
              if (!user) {
                await ctx.editMessageText('❌ User not found. Please use /start to register first.');
                return;
              }

              // Create payment request (appointmentId is null since appointment doesn't exist yet)
              const paymentData = await this.services.paymentHandler.moneroPayService.createPaymentRequest(
                null,
                user.id,
                'Lodge Mobile Appointment - Booking Fee'
              );
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/bot/handlers/EnhancedCustomerFormHandler.js:598',message:'Payment request created',data:{paymentId:paymentData.id},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'H'})}).catch(()=>{});
              // #endregion

              // Store payment info in session
              ctx.session.paymentId = paymentData.id;
              ctx.session.paymentAddress = paymentData.address;
              ctx.session.paymentConfirmed = false;

              // Generate payment message
              const paymentMessage = this.services.paymentHandler.moneroPayService.generatePaymentMessage(paymentData);
              const qrUrl = this.services.paymentHandler.moneroPayService.generateQrCodeUrl(
                paymentData.address,
                paymentData.amountXmr.replace('.', '')
              );

              await ctx.editMessageText(
                `✅ *Registration Complete!*\n\n` +
                `Your information has been saved.\n\n` +
                `💰 *Payment Required*\n\n` +
                `${paymentMessage}\n\n` +
                `_Once payment is confirmed, you can proceed to select your appointment date._`,
                {
                  parse_mode: 'Markdown',
                  reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔍 Check Payment Status', `check_payment_${paymentData.id}`)],
                    [Markup.button.callback('← Back', 'book')],
                    [Markup.button.callback('🏠 Main Menu', 'start')]
                  ]).reply_markup
                }
              );

              // Send QR code
              try {
                await ctx.replyWithPhoto(qrUrl, {
                  caption: '📱 Scan this QR code with your Monero wallet to pay',
                  parse_mode: 'Markdown'
                });
              } catch (photoError) {
                console.warn('Could not send QR code photo:', photoError);
              }
              
              return; // Don't show calendar yet
            } catch (paymentError) {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/bot/handlers/EnhancedCustomerFormHandler.js:630',message:'Payment creation error',data:{error:paymentError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'H'})}).catch(()=>{});
              // #endregion
              console.error('Error creating payment:', paymentError);
              await ctx.editMessageText(
                `❌ Error creating payment request: ${paymentError.message}\n\n` +
                `Please try again or contact support.`
              );
              return;
            }
          }
        }
        
        // Payment confirmed or not required - show calendar selection
        await ctx.editMessageText(
          '✅ *Registration Complete!*\n\n' +
          'Your information has been saved. Now let\'s schedule your appointment.',
          { parse_mode: 'Markdown' }
        );
        
        // Continue to calendar selection
        setTimeout(async () => {
          try {
            await ctx.reply(
              '📅 *Time to Book Your Appointment*\n\n' +
              'Now that we have your information, let\'s schedule your appointment.\n\n' +
              'Click below to select a date:',
              {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback('📅 Select Appointment Date', 'show_calendar')],
                  [Markup.button.callback('← Back', 'book')],
                  [Markup.button.callback('🏠 Main Menu', 'start')]
                ]).reply_markup
              }
            );
          } catch (error) {
            console.error('Error showing calendar after registration:', error);
            await ctx.reply('Registration complete! Please use /book to schedule your appointment.');
          }
        }, 1500);
      }
    });
    
    // Handle edit from summary
    this.bot.action('reg_edit_summary', async (ctx) => {
      await ctx.answerCbQuery();
      
      // Go back to first step
      ctx.session.registration.step = 'firstName';
      await ctx.editMessageText('📝 Let\'s review your information...');
      await this.showFormStep(ctx, 'firstName', true);
    });
  }

  async showProvinceSelection(ctx) {
    const provinces = this.registrationService.getProvinces();
    const buttons = [];
    
    // Create button rows (2 per row)
    for (let i = 0; i < provinces.length; i += 2) {
      const row = [
        Markup.button.callback(provinces[i].name, `reg_province_${provinces[i].code}`)
      ];
      if (i + 1 < provinces.length) {
        row.push(Markup.button.callback(provinces[i + 1].name, `reg_province_${provinces[i + 1].code}`));
      }
      buttons.push(row);
    }
    
    // Add back button
    buttons.push([Markup.button.callback('← Back', 'reg_back_province')]);
    
    await ctx.reply(
      `*Step 8 of 13: Province/Territory*\n\n` +
      `Please select your province or territory:`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
      }
    );
  }

  async showRegistrationSummary(ctx) {
    console.log('Showing registration summary');
    const processedData = this.registrationService.processRegistration(ctx.session.registration.data);
    const summary = this.registrationService.createRegistrationSummary(processedData);
    
    ctx.session.registration.data = processedData;
    ctx.session.registration.step = 'confirm';
    
    console.log('Registration data:', processedData);

    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Confirm & Continue', 'reg_confirm_final'),
          Markup.button.callback('📝 Edit', 'reg_edit_summary')
        ],
        [Markup.button.callback('❌ Cancel', 'reg_cancel')]
      ]).reply_markup
    });
  }
}

module.exports = EnhancedCustomerFormHandler;