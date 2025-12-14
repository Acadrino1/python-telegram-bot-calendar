/**
 * Registration Handler
 * Handles customer registration form callbacks (13-step wizard)
 */

const {
  escapeMarkdown,
  safeEditMessage,
  safeAnswerCbQuery
} = require('../utils/CallbackUtils');

class RegistrationHandler {
  constructor(services = {}, bot = null) {
    this.services = services;
    this.bot = bot;
    console.log('✅ RegistrationHandler initialized');
  }

  /**
   * Main entry point for registration callbacks
   * @param {Object} ctx - Telegram context
   * @param {string} callbackData - Callback data string
   * @returns {Promise<boolean>} - Whether callback was handled
   */
  async handle(ctx, callbackData) {
    const formHandler = this.services.customerFormHandler;

    // If we have a form handler, delegate to it
    if (formHandler) {
      await safeAnswerCbQuery(ctx);

      // Ensure session exists
      ctx.session = ctx.session || {};

      // Ensure registration object exists to prevent null reference errors
      if (!ctx.session.registration) {
        ctx.session.registration = {
          step: null,
          data: {},
          awaitingInput: false,
          pendingInput: null
        };
      }

      // Handle reg_start - start the registration form
      if (callbackData === 'reg_start') {
        return await this.handleRegStart(ctx, formHandler);
      }

      // Handle reg_confirm_* - confirm current step and move to next
      // EXCLUDE reg_confirm_final - that's handled separately
      if (callbackData.startsWith('reg_confirm_') && callbackData !== 'reg_confirm_final') {
        return await this.handleRegConfirm(ctx, callbackData, formHandler);
      }

      // Handle reg_edit_* - edit current step
      if (callbackData.startsWith('reg_edit_')) {
        return await this.handleRegEdit(ctx, callbackData, formHandler);
      }

      // Handle reg_back_* - go back to previous step
      if (callbackData.startsWith('reg_back_')) {
        return await this.handleRegBack(ctx, callbackData, formHandler);
      }

      // Handle province selection
      if (callbackData.startsWith('reg_province_')) {
        return await this.handleProvinceSelection(ctx, callbackData, formHandler);
      }

      // Handle reg_cancel
      if (callbackData === 'reg_cancel') {
        return await this.handleRegCancel(ctx);
      }

      // Handle reg_progress (just an indicator)
      if (callbackData === 'reg_progress') {
        await safeAnswerCbQuery(ctx, 'Progress indicator');
        return true;
      }

      // Handle final confirmation
      if (callbackData === 'reg_confirm_final') {
        return await this.handleRegConfirmFinal(ctx, formHandler);
      }

      // Handle edit from summary
      if (callbackData === 'reg_edit_summary') {
        return await this.handleRegEditSummary(ctx, formHandler);
      }
    }

    // Basic fallback only when no form handler exists
    await safeAnswerCbQuery(ctx, 'Processing...');
    await safeEditMessage(ctx, 'Registration system is being configured. Please try /book for now.');
    return true;
  }

  /**
   * Handle reg_start - start the registration form
   */
  async handleRegStart(ctx, formHandler) {
    // Initialize registration session data
    ctx.session.registration = ctx.session.registration || {
      step: 'firstName',
      data: {},
      awaitingInput: false,
      pendingInput: null
    };
    console.log('🚀 Starting registration, initializing session');
    await safeEditMessage(ctx, '📝 Starting registration...');
    await formHandler.showFormStep(ctx, 'firstName');
    return true;
  }

  /**
   * Handle reg_confirm_* - confirm current step and move to next
   */
  async handleRegConfirm(ctx, callbackData, formHandler) {
    const step = callbackData.replace('reg_confirm_', '');
    const pendingInput = ctx.session?.registration?.pendingInput;

    if (pendingInput) {
      // List of optional fields that can be skipped
      const optionalFields = ['middleName', 'suiteUnit', 'driverLicense', 'dlIssued', 'dlExpiry'];

      // Save the confirmed input
      if (optionalFields.includes(step)) {
        if (pendingInput.toLowerCase() !== 'skip') {
          ctx.session.registration.data[step] = pendingInput;
        } else if (step === 'driverLicense') {
          // When DL is skipped, also skip issue and expiry dates
          ctx.session.registration.data[step] = null;
          ctx.session.registration.data.dlIssued = null;
          ctx.session.registration.data.dlExpiry = null;
        }
        // For other optional fields (middleName, suiteUnit), just don't save if skipped
      } else {
        ctx.session.registration.data[step] = pendingInput;
      }

      // Get next step
      let nextStep = formHandler.getNextStep(step);

      // Skip DL dates if driver's license was skipped
      if (step === 'driverLicense' && (!pendingInput || pendingInput.toLowerCase() === 'skip')) {
        // Jump directly to registration summary (skip dlIssued and dlExpiry)
        nextStep = null;
      }

      if (nextStep) {
        ctx.session.registration.step = nextStep;
        if (nextStep === 'province') {
          await formHandler.showProvinceSelection(ctx);
        } else {
          await safeEditMessage(ctx, '✅ Information saved!');
          await formHandler.showFormStep(ctx, nextStep);
        }
      } else {
        await safeEditMessage(ctx, '✅ Information saved!');
        await formHandler.showRegistrationSummary(ctx);
      }
    }

    if (!pendingInput) {
      ctx.session.registration.awaitingInput = true;
      ctx.session.registration.pendingInput = null;

      try {
        await ctx.editMessageText(
          'No response was captured for this step. Please re-enter your answer.',
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.warn('Unable to edit message when re-prompting for input:', error.message);
      }

      if (formHandler?.showFormStep) {
        await formHandler.showFormStep(ctx, step, true);
      } else if (ctx.reply) {
        await ctx.reply('Please enter your response again to continue registration.');
      }
    }
    return true;
  }

  /**
   * Handle reg_edit_* - edit current step
   */
  async handleRegEdit(ctx, callbackData, formHandler) {
    const step = callbackData.replace('reg_edit_', '');
    ctx.session.registration.pendingInput = null;
    ctx.session.registration.awaitingInput = true;
    await safeEditMessage(ctx, '✏️ Please enter the correct value:');
    await formHandler.showFormStep(ctx, step, true);
    return true;
  }

  /**
   * Handle reg_back_* - go back to previous step
   */
  async handleRegBack(ctx, callbackData, formHandler) {
    const step = callbackData.replace('reg_back_', '');
    const previousStep = formHandler.getPreviousStep(step);
    if (previousStep) {
      ctx.session.registration.step = previousStep;
      await safeEditMessage(ctx, '⬅️ Going back...');
      if (previousStep === 'province') {
        await formHandler.showProvinceSelection(ctx);
      } else {
        await formHandler.showFormStep(ctx, previousStep, true);
      }
    }
    return true;
  }

  /**
   * Handle province selection
   */
  async handleProvinceSelection(ctx, callbackData, formHandler) {
    const code = callbackData.replace('reg_province_', '');
    const provinceName = formHandler.registrationService.getProvinceName(code);
    ctx.session.registration.data.province = code;
    ctx.session.registration.step = 'postalCode';
    await safeEditMessage(ctx, `✅ Selected: ${provinceName}`);
    await formHandler.showFormStep(ctx, 'postalCode');
    return true;
  }

  /**
   * Handle reg_cancel
   */
  async handleRegCancel(ctx) {
    ctx.session.registration = null;
    await safeEditMessage(ctx,
      '❌ *Registration Cancelled*\n\n' +
      'Your registration has been cancelled. Use /book to start again.',
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  /**
   * Handle final confirmation - creates user and completes registration
   */
  async handleRegConfirmFinal(ctx, formHandler) {
    // Check if registration data exists (could be lost if bot restarted)
    if (!ctx.session.registration?.data) {
      await safeEditMessage(ctx,
        '❌ *Session Expired*\n\n' +
        'Your registration data was lost. This can happen if the bot was restarted.\n\n' +
        'Please start again with /book',
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    ctx.session.customerInfo = ctx.session.registration.data;
    const customerInfo = ctx.session.registration.data;

    // Create user in database at registration time
    await this.createOrUpdateUser(ctx, customerInfo);

    const hasBookingData = ctx.session.booking?.date && ctx.session.booking?.time;

    if (hasBookingData) {
      // Show combined summary
      await this.showCombinedBookingSummary(ctx, customerInfo, formHandler);
    } else {
      await this.showRegistrationCompleteMessage(ctx);
    }
    return true;
  }

  /**
   * Create or update user in database
   */
  async createOrUpdateUser(ctx, customerInfo) {
    try {
      const User = require('../../../models/User');

      // Check if user already exists
      let existingUser = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();

      if (!existingUser) {
        // Create the user now
        const uniqueEmail = `telegram_${ctx.from.id}@placeholder.local`;
        const userData = {
          telegram_id: ctx.from.id.toString(),
          first_name: customerInfo.firstName,
          last_name: customerInfo.lastName,
          telegram_username: ctx.from.username || null,
          telegram_first_name: ctx.from.first_name || customerInfo.firstName,
          telegram_last_name: ctx.from.last_name || customerInfo.lastName,
          email: uniqueEmail,
          password_hash: 'telegram_user_no_password',
          role: 'client',
          is_active: true,
          timezone: 'America/New_York',
          registration_source: 'telegram',
          approval_status: 'approved'
        };

        existingUser = await User.query().insert(userData);
        console.log('✅ User created at registration:', {
          userId: existingUser.id,
          name: `${existingUser.first_name} ${existingUser.last_name}`,
          telegramId: ctx.from.id
        });
      } else {
        // Update existing user with new registration data
        await User.query()
          .where('id', existingUser.id)
          .patch({
            first_name: customerInfo.firstName,
            last_name: customerInfo.lastName,
            telegram_username: ctx.from.username || existingUser.telegram_username
          });
        console.log('✅ User updated at registration:', { userId: existingUser.id });
      }
    } catch (userError) {
      console.error('⚠️ Error creating/updating user at registration:', userError.message);
      // Don't block the flow - user will be created at booking if this fails
    }
  }

  /**
   * Show combined booking summary after registration with existing booking data
   */
  async showCombinedBookingSummary(ctx, customerInfo, formHandler) {
    const moment = require('moment-timezone');
    const booking = ctx.session.booking;
    const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm').tz('America/New_York');
    const formattedDate = dateTime.format('MMM DD, YYYY');
    const formattedTime = dateTime.format('h:mm A');
    const userSummary = formHandler.registrationService.createRegistrationSummary(ctx.session.registration.data);

    const summary = `✅ *Registration & Booking Confirmation*\n\n${userSummary}\n\n*📋 Appointment Details:*\n📅 Date: ${formattedDate}\n⏰ Time: ${formattedTime} EST\n📱 Service: ${booking.service || 'Lodge Scheduler Service'}\n⏱️ Duration: 90 minutes\n\nReady to confirm your booking?`;

    await safeEditMessage(ctx, summary, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Booking', callback_data: 'confirm_booking' },
            { text: '📅 Change Date/Time', callback_data: 'show_calendar' }
          ],
          [{ text: '❌ Cancel', callback_data: 'cancel_booking' }]
        ]
      }
    });
  }

  /**
   * Show registration complete message when no booking data exists
   */
  async showRegistrationCompleteMessage(ctx) {
    await safeEditMessage(ctx,
      '✅ *Registration Complete!*\n\n' +
      'Your information has been saved. Now let\'s schedule your appointment.',
      { parse_mode: 'Markdown' }
    );

    setTimeout(async () => {
      try {
        await ctx.reply(
          '📅 *Time to Book Your Appointment*\n\n' +
          'Click below to select a date:',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Select Appointment Date', callback_data: 'show_calendar' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('Error sending registration complete follow-up:', error.message);
      }
    }, 1000);
  }

  /**
   * Handle edit from summary
   */
  async handleRegEditSummary(ctx, formHandler) {
    ctx.session.registration.step = 'firstName';
    await safeEditMessage(ctx, '📝 Let\'s review your information...');
    await formHandler.showFormStep(ctx, 'firstName', true);
    return true;
  }

  /**
   * Check whether we already have registration/customer info in session
   * @param {Object} ctx - Telegram context
   * @returns {boolean} - True if registration data exists
   */
  hasRegistrationData(ctx) {
    const customerInfo = ctx.session?.customerInfo;
    if (customerInfo && Object.keys(customerInfo).length > 0) {
      return true;
    }

    const regData = ctx.session?.registration?.data;
    return regData && Object.keys(regData).length > 0;
  }

  /**
   * Enforce registration completion when a booking requires the form.
   * Returns true if booking can continue, false if we redirected to the form.
   */
  async enforceRegistrationRequirement(ctx) {
    const booking = ctx.session?.booking;
    if (!booking?.requiresForm) {
      return true; // No gating needed
    }

    // If we already have customer info or registration data, allow booking to continue
    if (this.hasRegistrationData(ctx)) {
      return true;
    }

    // Prepare or restore registration session
    ctx.session = ctx.session || {};
    ctx.session.booking = ctx.session.booking || { requiresForm: true };
    ctx.session.registration = ctx.session.registration || {
      step: 'firstName',
      data: {},
      awaitingInput: false,
      pendingInput: null
    };

    // Make sure we're ready to collect input again
    const formHandler = this.services.customerFormHandler;
    const step = ctx.session.registration.step || 'firstName';
    ctx.session.registration.step = step;
    ctx.session.registration.awaitingInput = true;
    ctx.session.registration.pendingInput = null;

    // Let the user know we need the form completed
    try {
      await ctx.editMessageText(
        'We need your registration details before booking. Please complete the form to continue.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Start Registration', callback_data: 'reg_start' }],
              [{ text: 'Back to Services', callback_data: 'book' }]
            ]
          }
        }
      );
    } catch (error) {
      console.warn('Unable to edit message for registration prompt:', error.message);
    }

    // Show the current or first step so the user can resume
    if (formHandler?.showFormStep) {
      await formHandler.showFormStep(ctx, step);
    } else if (ctx.reply) {
      await ctx.reply('Please use /book to start the registration form.');
    }

    return false;
  }
}

module.exports = RegistrationHandler;
