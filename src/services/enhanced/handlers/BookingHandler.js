/**
 * Booking Handler
 * Handles booking-related callback queries: date/time selection, confirmation, my appointments
 */

const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const { Markup } = require('telegraf');
const { escapeMarkdown, escapeMarkdownFull, convertDateForMySQL, hasRegistrationData, safeAnswerCbQuery } = require('../utils/CallbackUtils');
const Coupon = require('../../../models/Coupon');

class BookingHandler {
  constructor(services = {}, bot = null) {
    this.services = services;
    this.bot = bot;
  }

  /**
   * Set bot instance
   */
  setBot(bot) {
    this.bot = bot;
  }

  /**
   * Handle Lodge Mobile specific service selections
   */
  async handleLodgeService(ctx) {
    const callbackData = ctx.callbackQuery.data;

    await safeAnswerCbQuery(ctx, 'Loading...');

    // Extract service type
    const serviceType = callbackData.replace('service_lodge_mobile_', '');

    // Setup session
    ctx.session = ctx.session || {};
    ctx.session.booking = ctx.session.booking || {};

    // For new_registration, show bulk/single choice FIRST (don't enforce registration yet)
    // Registration requirement will be checked when user picks single mode
    if (serviceType === 'new_registration') {
      console.log('📊 NEW REGISTRATION: Showing bulk/single choice menu');
      // Show choice between single and bulk upload
      await ctx.editMessageText(
        `*Lodge Mobile: New Registration*\n\n` +
        `How many customers are you registering?\n\n` +
        `*Single Registration:*\n` +
        `Register one customer step-by-step (13 fields)\n\n` +
        `*Bulk Upload:*\n` +
        `Register multiple customers via Excel file (max 20)`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Single Registration', callback_data: 'reg_mode_single' }],
              [{ text: 'Bulk Upload (Multiple)', callback_data: 'reg_mode_bulk' }],
              [{ text: 'Download Template', callback_data: 'bulk_download_template' }],
              [{ text: 'Back to Services', callback_data: 'book' }]
            ]
          }
        }
      );
      return true;
    }

    // Services that require existing customer registration
    const existingCustomerServices = ['simcard_activation', 'technical_support', 'upgrade_device'];

    if (existingCustomerServices.includes(serviceType)) {
      // Get all completed registrations for this user
      const Appointment = require('../../../models/Appointment');
      const User = require('../../../models/User');
      const userId = ctx.from?.id?.toString();

      // Find user by telegram_id
      const user = await User.query().where('telegram_id', userId).first();

      const completedRegistrations = user ? await Appointment.query()
        .where('client_id', user.id)
        .where('status', 'completed')
        .whereExists(
          Appointment.relatedQuery('service')
            .where('name', 'like', '%New Registration%')
        )
        .orderBy('appointment_datetime', 'desc') : [];

      if (!completedRegistrations || completedRegistrations.length === 0) {
        await ctx.editMessageText(
          `⚠️ *Existing Customers Only*\n\n` +
          `This service is available only to existing Lodge Mobile customers.\n\n` +
          `To access this service, you must first complete a *New Customer Registration* appointment.\n\n` +
          `Please select "New Registration" to get started.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 New Registration', callback_data: 'service_lodge_mobile_new_registration' }],
                [{ text: '← Back to Services', callback_data: 'book' }]
              ]
            }
          }
        );
        return true;
      }

      // Store service type and show customer selection
      const serviceNames = {
        'simcard_activation': 'SIM Card Activation',
        'technical_support': 'Technical Support',
        'upgrade_device': 'Device Upgrade'
      };

      ctx.session.booking.service = `Lodge Scheduler: ${serviceNames[serviceType]}`;
      ctx.session.booking.serviceType = serviceType;

      // Show customer selection menu
      await this.showRegisteredCustomerSelection(ctx, completedRegistrations, serviceNames[serviceType]);
      return true;
    }

    // Handle default case (should not reach here for lodge services)
    await ctx.editMessageText('❌ Unknown service. Please try again.', {
      reply_markup: {
        inline_keyboard: [[{ text: '← Back to Services', callback_data: 'book' }]]
      }
    });

    return true;
  }

  /**
   * Show registered customer selection for existing customer services
   */
  async showRegisteredCustomerSelection(ctx, registrations, serviceName) {
    try {
      const customerButtons = [];

      for (const reg of registrations) {
        let customerData = {};
        try {
          customerData = typeof reg.customer_data === 'string'
            ? JSON.parse(reg.customer_data)
            : reg.customer_data || {};
        } catch (e) {
          continue;
        }

        const firstName = customerData.first_name || customerData.firstName || '';
        const lastName = customerData.last_name || customerData.lastName || '';
        const phone = customerData.phone || customerData.phoneNumber || '';

        if (!firstName && !lastName) continue;

        const displayName = `${firstName} ${lastName}`.trim();
        const phoneDisplay = phone ? ` (${phone.slice(-4)})` : '';

        customerButtons.push([{
          text: `👤 ${displayName}${phoneDisplay}`,
          callback_data: `select_customer_${reg.id}`
        }]);
      }

      if (customerButtons.length === 0) {
        await ctx.editMessageText(
          `⚠️ *No Registered Customers Found*\n\n` +
          `Please complete a New Registration first.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 New Registration', callback_data: 'service_lodge_mobile_new_registration' }],
                [{ text: '← Back to Services', callback_data: 'book' }]
              ]
            }
          }
        );
        return;
      }

      customerButtons.push([{ text: '← Back to Services', callback_data: 'book' }]);

      await ctx.editMessageText(
        `📱 *${serviceName}*\n\n` +
        `Select the customer for this service:\n\n` +
        `_These are your previously registered customers._`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: customerButtons }
        }
      );
    } catch (error) {
      console.error('Customer selection error:', error);
      await ctx.editMessageText('❌ Error loading customers. Please try again.');
    }
  }

  /**
   * Handle customer selection for existing customer services
   */
  async handleCustomerSelection(ctx, appointmentId) {
    try {
      const Appointment = require('../../../models/Appointment');

      const registration = await Appointment.query().findById(appointmentId);
      if (!registration) {
        await ctx.editMessageText('❌ Customer not found. Please try again.');
        return true;
      }

      let customerData = {};
      try {
        customerData = typeof registration.customer_data === 'string'
          ? JSON.parse(registration.customer_data)
          : registration.customer_data || {};
      } catch (e) {
        customerData = {};
      }

      // Store customer data in session for booking
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.selectedCustomer = customerData;
      ctx.session.booking.selectedCustomerId = appointmentId;

      const firstName = customerData.first_name || customerData.firstName || '';
      const lastName = customerData.last_name || customerData.lastName || '';
      const customerName = `${firstName} ${lastName}`.trim() || 'Selected Customer';

      // Show calendar for time selection
      await ctx.editMessageText(
        `✅ *Customer Selected: ${customerName}*\n\n` +
        `Service: ${ctx.session.booking.service || 'Lodge Service'}\n\n` +
        `📅 Now select a date for the appointment:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Select Date', callback_data: 'show_calendar' }],
              [{ text: '← Back to Customers', callback_data: `service_lodge_mobile_${ctx.session.booking.serviceType}` }],
              [{ text: '← Back to Services', callback_data: 'book' }]
            ]
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Customer selection handler error:', error);
      await ctx.editMessageText('❌ Error selecting customer. Please try again.');
      return true;
    }
  }

  /**
   * Show calendar or fallback to basic date selection
   */
  async showCalendar(ctx, serviceMessage) {
    try {
      // Use calendar manager if available
      if (this.services.calendarUIManager) {
        await this.services.calendarUIManager.showCalendar(ctx);
      } else {
        // Fallback to basic date selection
        await ctx.editMessageText(
          `✅ *${serviceMessage}*\n\nLet's schedule your appointment.\n\nPlease select a date:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Select Date', callback_data: 'select_date' }],
                [{ text: '← Back to Services', callback_data: 'book' }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Calendar display error:', error);
      await ctx.editMessageText('❌ Error loading calendar. Please try /book again.');
    }
  }

  /**
   * Enforce registration completion when a booking requires the form.
   */
  async enforceRegistrationRequirement(ctx) {
    const booking = ctx.session?.booking;
    if (!booking?.requiresForm) {
      return true; // No gating needed
    }

    // If we already have customer info or registration data, allow booking to continue
    if (hasRegistrationData(ctx)) {
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

  /**
   * Handle inline calendar widget callbacks
   */
  async handleCalendarCallback(ctx) {
    try {
      const callbackData = ctx.callbackQuery.data;
      console.log(`📅 Calendar callback received: ${callbackData}`);

      // Check registration requirement first
      const canProceed = await this.enforceRegistrationRequirement(ctx);
      if (!canProceed) return true;

      // Ignore buttons (empty calendar cells)
      if (callbackData.includes('ignore')) {
        await ctx.answerCbQuery();
        return true;
      }

      // Handle navigation (prev/next month)
      if (callbackData.includes('-prev-') || callbackData.includes('-next-')) {
        console.log('📅 Calendar navigation detected');
        await ctx.answerCbQuery();
        return true;
      }

      // Handle date selection - pattern: calendar-telegram-date-YYYY-MM-DD
      const dateMatch = callbackData.match(/calendar-telegram-date-(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const selectedDate = dateMatch[1];
        console.log(`📅 Date selected from callback: ${selectedDate}`);

        await ctx.answerCbQuery(`Selected: ${selectedDate}`);

        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.date = selectedDate;

        // Show time slots for selected date
        if (this.services.calendarUIManager && this.services.calendarUIManager.handleDateSelection) {
          await this.services.calendarUIManager.handleDateSelection(ctx, selectedDate);
        } else {
          await this.showTimeSelection(ctx, selectedDate);
        }
        return true;
      }

      // Fallback - unknown calendar callback
      console.log(`📅 Unknown calendar callback pattern: ${callbackData}`);
      await ctx.answerCbQuery();
      return true;
    } catch (error) {
      console.error('Calendar callback error:', error);
      await ctx.answerCbQuery('Error processing calendar. Please try again.');
      return true;
    }
  }

  /**
   * Handle date and time selection
   */
  async handleDateTimeSelection(ctx) {
    const callbackData = ctx.callbackQuery.data;

    await safeAnswerCbQuery(ctx, 'Loading...');

    // Handle customer selection for existing customer services
    if (callbackData.startsWith('select_customer_')) {
      const appointmentId = callbackData.replace('select_customer_', '');
      return await this.handleCustomerSelection(ctx, parseInt(appointmentId, 10));
    }

    const canProceed = await this.enforceRegistrationRequirement(ctx);
    if (!canProceed) return true;

    if (callbackData === 'select_date' || callbackData === 'show_calendar') {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/enhanced/handlers/BookingHandler.js:409',message:'show_calendar callback - checking payment',data:{hasPaymentHandler:!!this.services?.paymentHandler,paymentConfirmed:ctx.session?.paymentConfirmed},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'J'})}).catch(()=>{});
      // #endregion
      
      // Check if payment is required and confirmed before showing calendar
      if (this.services?.paymentHandler && this.services.paymentHandler.moneroPayService?.isEnabled()) {
        if (!ctx.session?.paymentConfirmed) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/enhanced/handlers/BookingHandler.js:414',message:'Payment not confirmed - blocking calendar',data:{paymentId:ctx.session?.paymentId},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'J'})}).catch(()=>{});
          // #endregion
          
          // Payment required but not confirmed
          const paymentId = ctx.session?.paymentId;
          if (paymentId) {
            await ctx.editMessageText(
              `💰 *Payment Required*\n\n` +
              `Please complete your payment before selecting an appointment date.\n\n` +
              `Use the button below to check your payment status.`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [Markup.button.callback('Check Payment Status', `check_payment_${paymentId}`)],
                    [Markup.button.callback('🏠 Main Menu', 'main_menu')]
                  ]
                }
              }
            );
          } else {
            // No payment created yet - should not happen, but handle gracefully
            await ctx.editMessageText(
              `💰 *Payment Required*\n\n` +
              `Please complete your registration first to create a payment request.`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [Markup.button.callback('🏠 Main Menu', 'main_menu')]
                  ]
                }
              }
            );
          }
          return true;
        }
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/9ed284dd-42b1-4906-a5f9-81092a7a7cfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/enhanced/handlers/BookingHandler.js:440',message:'Payment confirmed - showing calendar',data:{paymentId:ctx.session?.paymentId},timestamp:Date.now(),sessionId:'debug-session',runId:'payment-flow',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
      }
      
      // Show calendar or date selection
      if (this.services.calendarUIManager) {
        await this.services.calendarUIManager.showCalendar(ctx);
      } else {
        await this.showBasicDateSelection(ctx);
      }
      return true;
    }

    if (callbackData.startsWith('date_')) {
      const date = callbackData.replace('date_', '');
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.date = date;

      await this.showTimeSelection(ctx, date);
      return true;
    }

    if (callbackData.startsWith('time_')) {
      const time = callbackData.replace('time_', '');
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.time = time;

      await this.showBookingSummary(ctx);
      return true;
    }

    return false;
  }

  /**
   * Handle booking confirmation and cancellation
   */
  async handleBookingActions(ctx) {
    const callbackData = ctx.callbackQuery.data;

    await safeAnswerCbQuery(ctx, 'Processing...');

    if (callbackData === 'confirm_booking') {
      await this.processBookingConfirmation(ctx);
      return true;
    }

    if (callbackData === 'cancel_booking') {
      ctx.session = ctx.session || {};
      ctx.session.booking = {};

      await ctx.editMessageText(
        '❌ Booking cancelled.\n\nWhat would you like to do next?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Start New Booking', callback_data: 'book' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return true;
    }

    return false;
  }

  /**
   * Handle user appointment actions (cancel, edit)
   */
  async handleUserAppointmentAction(ctx) {
    const callbackData = ctx.callbackQuery.data;
    await safeAnswerCbQuery(ctx, 'Processing...');

    try {
      const Appointment = require('../../../models/Appointment');

      // Handle cancel action
      if (callbackData.startsWith('user_cancel_')) {
        const appointmentId = callbackData.replace('user_cancel_', '');
        return await this.processUserCancellation(ctx, appointmentId);
      }

      // Handle edit action - redirect to rebooking
      if (callbackData.startsWith('user_edit_')) {
        const appointmentId = callbackData.replace('user_edit_', '');

        await ctx.editMessageText(
          '✏️ *Edit Appointment*\n\n' +
          'To change your appointment time, please cancel this booking and create a new one.\n\n' +
          'Would you like to cancel this appointment?',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Cancel Appointment', callback_data: `user_cancel_${appointmentId}` }],
                [{ text: '← Back to Appointments', callback_data: 'my_appointments' }]
              ]
            }
          }
        );
        return true;
      }

      return false;

    } catch (error) {
      console.error('User appointment action error:', error);
      await ctx.editMessageText('❌ Error processing your request. Please try again.');
      return true;
    }
  }

  /**
   * Process user cancellation of an appointment
   */
  async processUserCancellation(ctx, appointmentId) {
    try {
      const Appointment = require('../../../models/Appointment');

      const appointment = await Appointment.query()
        .where('uuid', appointmentId)
        .withGraphFetched('[client, service]')
        .first();

      if (!appointment) {
        await ctx.editMessageText('❌ Appointment not found.');
        return true;
      }

      // Verify ownership
      if (appointment.client?.telegram_id !== ctx.from.id.toString()) {
        await ctx.editMessageText('❌ You can only cancel your own appointments.');
        return true;
      }

      // Check if already cancelled
      if (appointment.status === 'cancelled' || appointment.status === 'rejected') {
        await ctx.editMessageText('❌ This appointment has already been cancelled.');
        return true;
      }

      // Cancel the appointment
      await Appointment.query()
        .where('uuid', appointmentId)
        .patch({
          status: 'cancelled',
          cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
          cancellation_reason: 'Cancelled by user'
        });

      const dateTime = moment(appointment.appointment_datetime).tz('America/New_York');
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      await ctx.editMessageText(
        `✅ *Appointment Cancelled*\n\n` +
        `📅 Date: ${formattedDate}\n` +
        `⏰ Time: ${formattedTime} EST\n` +
        `📱 Service: ${appointment.service?.name || 'Lodge Service'}\n\n` +
        `Your appointment has been cancelled successfully.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Book New Appointment', callback_data: 'book' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );

      // Notify admin about cancellation
      const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;
      if (ADMIN_ID && this.bot) {
        try {
          await this.bot.telegram.sendMessage(
            ADMIN_ID,
            `📢 *Booking Cancelled by User*\n\n` +
            `👤 Client: ${appointment.client?.first_name || 'Unknown'} ${appointment.client?.last_name || ''}\n` +
            `📅 Date: ${formattedDate}\n` +
            `⏰ Time: ${formattedTime} EST\n` +
            `📱 Service: ${appointment.service?.name || 'Lodge Service'}\n` +
            `🆔 ID: \`${appointmentId}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.error('Failed to notify admin about cancellation:', notifyError);
        }
      }

      return true;

    } catch (error) {
      console.error('User cancellation error:', error);
      await ctx.editMessageText('❌ Error cancelling appointment. Please try again.');
      return true;
    }
  }

  /**
   * Handle my_appointments callback - show user's appointments
   */
  async handleMyAppointments(ctx) {
    try {
      const User = require('../../../models/User');
      const Appointment = require('../../../models/Appointment');

      const user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();

      if (!user) {
        await ctx.editMessageText(
          '❌ Please register first with /start',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      const appointments = await Appointment.query()
        .where('client_id', user.id)
        .whereIn('status', ['scheduled', 'confirmed', 'pending_approval'])
        .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
        .withGraphFetched('[service]')
        .orderBy('appointment_datetime', 'asc')
        .limit(10);

      if (appointments.length === 0) {
        await ctx.editMessageText(
          '📋 *Your Appointments*\n\n' +
          'You have no upcoming appointments.\n\n' +
          'Use the button below to book one!',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Book Appointment', callback_data: 'book' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return true;
      }

      let message = '📋 *Your Upcoming Appointments:*\n\n';
      const inlineKeyboard = [];

      appointments.forEach((apt, index) => {
        const dateTime = moment(apt.appointment_datetime).tz('America/New_York');
        const formattedDate = dateTime.format('MMM DD, YYYY');
        const formattedTime = dateTime.format('h:mm A');

        // Format status with icon
        let statusDisplay = apt.status;
        if (apt.status === 'pending_approval') {
          statusDisplay = '⏳ Pending Approval';
        } else if (apt.status === 'confirmed') {
          statusDisplay = '✅ Confirmed';
        } else if (apt.status === 'scheduled') {
          statusDisplay = '📅 Scheduled';
        }

        message += `${index + 1}. *${apt.service?.name || 'Lodge Scheduler Service'}*\n`;
        message += `   📆 ${formattedDate}\n`;
        message += `   ⏰ ${formattedTime} EST\n`;
        message += `   🔗 Status: ${statusDisplay}\n\n`;

        // Add cancel button for each appointment
        inlineKeyboard.push([
          { text: `❌ Cancel #${index + 1}`, callback_data: `user_cancel_${apt.uuid}` }
        ]);
      });

      message += '_Tap a button below to cancel an appointment_';

      // Add navigation buttons
      inlineKeyboard.push([{ text: '📅 Book Another', callback_data: 'book' }]);
      inlineKeyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });

      return true;

    } catch (error) {
      console.error('Error fetching appointments:', error);
      await ctx.editMessageText(
        '❌ Error loading appointments. Please try /myappointments command instead.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return true;
    }
  }

  /**
   * Show basic date selection fallback
   */
  async showBasicDateSelection(ctx) {
    try {
      const bookingService = this.services.bookingSlotService;
      if (!bookingService) {
        await ctx.editMessageText('❌ Booking service unavailable. Please try again later.');
        return;
      }

      const availableDates = bookingService.getAvailableDates();

      if (availableDates.length === 0) {
        await ctx.editMessageText('❌ No available dates for booking.');
        return;
      }

      const dateButtons = availableDates.slice(0, 10).map(dateInfo => [{
        text: dateInfo.display,
        callback_data: `date_${dateInfo.date}`
      }]);

      dateButtons.push([{ text: '← Back to Services', callback_data: 'book' }]);

      await ctx.editMessageText(
        '📅 *Select a date for your appointment:*',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: dateButtons }
        }
      );
    } catch (error) {
      console.error('Basic date selection error:', error);
      await ctx.editMessageText('❌ Error loading dates. Please try /book again.');
    }
  }

  /**
   * Show time selection for selected date
   */
  async showTimeSelection(ctx, date) {
    try {
      const bookingService = this.services.bookingSlotService;
      if (!bookingService) {
        await ctx.editMessageText('❌ Booking service unavailable.');
        return;
      }

      const slotInfo = await bookingService.getAvailableTimeSlots(date);

      if (slotInfo.slots.length === 0) {
        await ctx.editMessageText(
          `❌ No available slots for ${new Date(date).toLocaleDateString()}\n\n` +
          'Please select another date.',
          {
            reply_markup: {
              inline_keyboard: [[{ text: '← Back to dates', callback_data: 'select_date' }]]
            }
          }
        );
        return;
      }

      const timeButtons = [];
      for (let i = 0; i < slotInfo.slots.length; i += 2) {
        const row = [];
        const slot1 = slotInfo.slots[i];
        row.push({
          text: `${slot1.time12} - ${slot1.endTime}`,
          callback_data: `time_${slot1.time24}`
        });

        if (slotInfo.slots[i + 1]) {
          const slot2 = slotInfo.slots[i + 1];
          row.push({
            text: `${slot2.time12} - ${slot2.endTime}`,
            callback_data: `time_${slot2.time24}`
          });
        }
        timeButtons.push(row);
      }

      timeButtons.push([
        { text: '← Back to dates', callback_data: 'show_calendar' },
        { text: '❌ Cancel', callback_data: 'cancel_booking' }
      ]);

      await ctx.editMessageText(
        `⏰ Available time slots for ${new Date(date).toLocaleDateString()}:\n\n` +
        `📊 ${slotInfo.totalBooked}/${slotInfo.maxSlots} slots booked\n` +
        `✅ ${slotInfo.slotsRemaining} slots available\n\n` +
        'Select a time:',
        { reply_markup: { inline_keyboard: timeButtons } }
      );

    } catch (error) {
      console.error('Time selection error:', error);
      await ctx.editMessageText('❌ Error loading time slots. Please try again.');
    }
  }

  /**
   * Show booking summary before confirmation
   */
  async showBookingSummary(ctx) {
    try {
      const canProceed = await this.enforceRegistrationRequirement(ctx);
      if (!canProceed) return;

      const booking = ctx.session.booking || {};

      if (!booking.date || !booking.time) {
        await ctx.editMessageText('❌ Booking information incomplete. Please start over with /book');
        return;
      }

      const serviceName = booking.service || 'Lodge Scheduler Service';
      const dateTime = new Date(`${booking.date} ${booking.time}`);
      const formattedDate = dateTime.toLocaleDateString();
      const formattedTime = dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Get customer name for existing customer services
      let customerDisplay = '';
      if (booking.selectedCustomer) {
        const firstName = booking.selectedCustomer.first_name || booking.selectedCustomer.firstName || '';
        const lastName = booking.selectedCustomer.last_name || booking.selectedCustomer.lastName || '';
        customerDisplay = `👤 Customer: ${firstName} ${lastName}\n`;
      }

      // Build summary with optional coupon info
      let summary = `*📋 Booking Summary:*\n\n` +
        `${customerDisplay}` +
        `📅 Date: ${formattedDate}\n` +
        `⏰ Time: ${formattedTime} EST\n` +
        `📱 Service: ${serviceName}\n` +
        `⏱️ Duration: 60 minutes\n`;

      // Show applied coupon if any
      if (booking.couponCode && booking.couponDiscount) {
        summary += `\n🎟️ Coupon: \`${booking.couponCode}\`\n`;
        summary += `💰 Discount: *$${booking.couponDiscount} OFF*\n`;
      }

      summary += `\nConfirm your booking?`;

      // Build keyboard with coupon option
      const keyboard = [];

      // Add coupon button if no coupon applied yet
      if (!booking.couponCode) {
        keyboard.push([{ text: '🎟️ Have a coupon code?', callback_data: 'enter_coupon' }]);
      } else {
        keyboard.push([{ text: '🗑️ Remove Coupon', callback_data: 'remove_coupon' }]);
      }

      keyboard.push([
        { text: '✅ Confirm', callback_data: 'confirm_booking' },
        { text: '❌ Cancel', callback_data: 'cancel_booking' }
      ]);

      await ctx.editMessageText(summary, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('Booking summary error:', error);
      await ctx.editMessageText('❌ Error showing booking summary. Please try again.');
    }
  }

  /**
   * Handle coupon entry request
   */
  async handleEnterCoupon(ctx) {
    await safeAnswerCbQuery(ctx, 'Enter your coupon code');

    ctx.session = ctx.session || {};
    ctx.session.awaitingCouponCode = true;

    await ctx.editMessageText(
      `🎟️ *Enter Coupon Code*\n\n` +
      `Type your coupon code below:\n\n` +
      `_Example: LODGE-XXXX-XXXX_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back to Summary', callback_data: 'booking_summary' }]
          ]
        }
      }
    );
    return true;
  }

  /**
   * Process coupon code from text input
   */
  async processCouponCode(ctx, code) {
    try {
      const validation = await Coupon.validateCoupon(code);

      if (!validation.valid) {
        await ctx.reply(
          `❌ *Invalid Coupon*\n\n${validation.error}\n\n_Please try another code or continue without a coupon._`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Another Code', callback_data: 'enter_coupon' }],
                [{ text: '← Back to Booking', callback_data: 'booking_summary' }]
              ]
            }
          }
        );
        return false;
      }

      // Store coupon in session (will be redeemed on final confirmation)
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.couponCode = validation.coupon.code;
      ctx.session.booking.couponDiscount = validation.coupon.amount;
      ctx.session.booking.couponId = validation.coupon.id;
      ctx.session.awaitingCouponCode = false;

      await ctx.reply(
        `✅ *Coupon Applied!*\n\n` +
        `🎟️ Code: \`${validation.coupon.code}\`\n` +
        `💰 Discount: *$${validation.coupon.amount} OFF*\n\n` +
        `_The discount will be applied to your booking._`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Continue to Booking', callback_data: 'booking_summary' }]
            ]
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Coupon processing error:', error);
      await ctx.reply('❌ Error processing coupon. Please try again.');
      return false;
    }
  }

  /**
   * Remove applied coupon
   */
  async handleRemoveCoupon(ctx) {
    await safeAnswerCbQuery(ctx, 'Coupon removed');

    ctx.session = ctx.session || {};
    ctx.session.booking = ctx.session.booking || {};

    delete ctx.session.booking.couponCode;
    delete ctx.session.booking.couponDiscount;
    delete ctx.session.booking.couponId;

    // Refresh the booking summary
    await this.showBookingSummary(ctx);
    return true;
  }

  /**
   * Check if awaiting coupon code input
   */
  isAwaitingCouponCode(ctx) {
    return ctx.session?.awaitingCouponCode === true;
  }

  /**
   * Process booking confirmation with admin approval workflow
   */
  async processBookingConfirmation(ctx) {
    try {
      console.log('🔧 Starting booking confirmation with admin approval workflow...');

      const canProceed = await this.enforceRegistrationRequirement(ctx);
      if (!canProceed) return;

      // Import required modules
      const User = require('../../../models/User');
      const Service = require('../../../models/Service');
      const Appointment = require('../../../models/Appointment');

      // Get user from database or create if not exists
      let user = await User.query()
        .where('telegram_id', ctx.from.id.toString())
        .first();

      if (!user) {
        console.log('User not found for Telegram ID:', ctx.from.id, '- Creating new user from registration data');

        // Get customer info from session
        const customerInfo = ctx.session.customerInfo || ctx.session.registration?.data;

        if (!customerInfo || !customerInfo.firstName || !customerInfo.lastName) {
          console.error('Cannot create user - missing registration data');
          return ctx.editMessageText('Registration data missing. Please start again with /book');
        }

        // Create user in database from registration data
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

        try {
          user = await User.query().insert(userData);
          console.log('✅ New user created:', { userId: user.id, name: `${user.first_name} ${user.last_name}` });
        } catch (createError) {
          console.error('Failed to create user:', createError);
          return ctx.editMessageText('Error creating your account. Please try again with /book');
        }
      }

      // Get booking data from session
      const booking = ctx.session.booking || {};

      // Ensure customerInfo is populated from registration data or selected customer
      let customerInfo = ctx.session.customerInfo || null;

      // For existing customer services (SIM/Support/Upgrade), use selected customer data
      if (ctx.session.booking?.selectedCustomer) {
        const selected = ctx.session.booking.selectedCustomer;
        customerInfo = {
          firstName: selected.first_name || selected.firstName,
          lastName: selected.last_name || selected.lastName,
          middleName: selected.middle_name || selected.middleName,
          dateOfBirth: selected.date_of_birth || selected.dateOfBirth,
          phone: selected.phone || selected.phoneNumber,
          streetNumber: selected.street_number || selected.streetNumber,
          streetAddress: selected.street_address || selected.streetAddress,
          suiteUnit: selected.suite_unit || selected.suiteUnit,
          city: selected.city,
          province: selected.province,
          postalCode: selected.postal_code || selected.postalCode,
          driverLicense: selected.driver_license || selected.driverLicense,
          dlIssued: selected.dl_issued || selected.dlIssued,
          dlExpiry: selected.dl_expiry || selected.dlExpiry
        };
        ctx.session.customerInfo = customerInfo;
        console.log('📋 Customer info populated from selected existing customer');
      } else if (!customerInfo && ctx.session.registration?.data) {
        customerInfo = ctx.session.registration.data;
        ctx.session.customerInfo = customerInfo;
        console.log('📋 Customer info populated from registration data');
      }

      if (!booking.date || !booking.time) {
        console.error('Missing booking data:', { date: booking.date, time: booking.time });
        return ctx.editMessageText('Session expired. Please start booking again with /book');
      }

      // Set service info if from registration
      if (!booking.service && customerInfo) {
        booking.service = 'Lodge Scheduler: New Registration';
      }

      const serviceName = booking.service || 'Lodge Scheduler Service';

      // Validate business hours BEFORE checking availability
      if (this.services.bookingSlotService) {
        const validation = this.services.bookingSlotService.isValidBusinessHourSlot(booking.date, booking.time);
        if (!validation.valid) {
          console.warn(`⚠️ Booking rejected - outside business hours: ${booking.date} ${booking.time}`);
          return ctx.editMessageText(
            `❌ Invalid booking time.\n\n${validation.reason}\n\nPlease use /book to select a valid time slot.`
          );
        }
      }

      // Check slot availability
      if (this.services.bookingSlotService) {
        const isAvailable = await this.services.bookingSlotService.isSlotAvailable(booking.date, booking.time);
        if (!isAvailable) {
          return ctx.editMessageText(
            '❌ Sorry, this slot was just booked by someone else.\n\n' +
            'Please use /book to select another time.'
          );
        }
      }

      // Prepare appointment datetime
      const dateTime = moment.tz(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm', 'America/New_York');

      // Get service details
      let service = null;
      let serviceDuration = 90;
      if (booking.serviceId) {
        service = await Service.query().findById(booking.serviceId);
        if (service) {
          serviceDuration = service.duration || 90;
        }
      }

      // Get provider (with admin fallback)
      let provider = await User.query()
        .where('role', 'provider')
        .where('is_active', true)
        .first();

      if (!provider) {
        provider = await User.query()
          .where('role', 'admin')
          .where('is_active', true)
          .first();
        if (provider) {
          console.log('Using admin as provider fallback');
        }
      }

      if (!provider) {
        console.error('No active provider or admin found');
        return ctx.editMessageText('Sorry, no providers are available. Please try again later.');
      }

      // Build full address for billing_address field
      let billingAddress = '';
      if (customerInfo) {
        const parts = [];
        if (customerInfo.suiteUnit && customerInfo.suiteUnit.toLowerCase() !== 'skip') {
          parts.push(`${customerInfo.suiteUnit}-${customerInfo.streetNumber || ''} ${customerInfo.streetAddress || ''}`);
        } else {
          parts.push(`${customerInfo.streetNumber || ''} ${customerInfo.streetAddress || ''}`);
        }
        parts.push(`${customerInfo.city || ''}, ${customerInfo.province || ''}`);
        parts.push(customerInfo.postalCode || '');
        billingAddress = parts.filter(p => p.trim()).join(', ');
      }

      // Create appointment with PENDING_APPROVAL status and customer data
      const appointmentData = {
        uuid: uuidv4(),
        client_id: user.id,
        provider_id: provider.id,
        service_id: booking.serviceId || 1,
        appointment_datetime: dateTime.format('YYYY-MM-DD HH:mm:ss'),
        duration_minutes: serviceDuration,
        status: 'pending_approval',
        notes: `${serviceName} - Booked via Telegram${customerInfo ? '\nCustomer Registration: Yes' : ''}${ctx.session?.bulkUpload?.active ? '\nBulk Upload: Yes' : ''}`,
        price: service?.price || 0,
        customer_first_name: customerInfo?.firstName || null,
        customer_middle_name: customerInfo?.middleName !== 'skip' ? customerInfo?.middleName : null,
        customer_last_name: customerInfo?.lastName || null,
        customer_dob: convertDateForMySQL(customerInfo?.dateOfBirth),
        billing_address: billingAddress || null,
        customer_email: user.email !== 'telegram_user_no_password' ? user.email : null,
        drivers_license_number: customerInfo?.driverLicense !== 'skip' ? customerInfo?.driverLicense : null,
        dl_issued_date: convertDateForMySQL(customerInfo?.dlIssued !== 'skip' ? customerInfo?.dlIssued : null),
        dl_expiry_date: convertDateForMySQL(customerInfo?.dlExpiry !== 'skip' ? customerInfo?.dlExpiry : null)
      };

      console.log('💾 Saving appointment with pending_approval status...');

      // Save appointment to database
      const appointment = await Appointment.query().insert(appointmentData);
      console.log('✅ Appointment saved with pending_approval status!', {
        appointmentId: appointment.id,
        uuid: appointment.uuid
      });

      // Link payment to appointment if payment was made
      if (ctx.session?.paymentId) {
        const { Model } = require('objection');
        const knex = Model.knex();
        await knex('payments')
          .where('id', ctx.session.paymentId)
          .update({ appointment_id: appointment.id });
        console.log('✅ Payment linked to appointment:', {
          paymentId: ctx.session.paymentId,
          appointmentId: appointment.id
        });
      }

      // Redeem coupon if one was applied
      let couponRedeemed = false;
      if (booking.couponCode && booking.couponId) {
        try {
          const result = await Coupon.redeemCoupon(
            booking.couponCode,
            ctx.from.id,
            appointment.id
          );
          if (result.redeemed) {
            couponRedeemed = true;
            console.log(`🎟️ Coupon ${booking.couponCode} redeemed for appointment ${appointment.uuid}`);
          }
        } catch (couponError) {
          console.error('Error redeeming coupon:', couponError);
          // Don't fail the booking if coupon redemption fails
        }
      }

      // Format display datetime
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');

      // Send notification to admin with approval buttons
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

      if (ADMIN_TELEGRAM_ID && this.bot) {
        try {
          let customerSection = '';
          if (customerInfo) {
            customerSection = `\n\n📋 *Customer Registration Info:*\n`;
            customerSection += `• First Name: ${escapeMarkdownFull(customerInfo.firstName)}\n`;
            if (customerInfo.middleName && customerInfo.middleName !== 'skip') {
              customerSection += `• Middle Name: ${escapeMarkdownFull(customerInfo.middleName)}\n`;
            }
            customerSection += `• Last Name: ${escapeMarkdownFull(customerInfo.lastName)}\n`;
            customerSection += `• Date of Birth: ${escapeMarkdownFull(customerInfo.dateOfBirth)}\n`;

            let addressLine = `${customerInfo.streetNumber || ''} ${customerInfo.streetAddress || ''}`.trim();
            if (customerInfo.suiteUnit && customerInfo.suiteUnit.toLowerCase() !== 'skip') {
              addressLine = `${customerInfo.suiteUnit}-${addressLine}`;
            }
            customerSection += `• Address: ${escapeMarkdownFull(addressLine)}\n`;
            customerSection += `• City: ${escapeMarkdownFull(customerInfo.city)}, ${escapeMarkdownFull(customerInfo.province)}\n`;
            customerSection += `• Postal Code: ${escapeMarkdownFull(customerInfo.postalCode)}\n`;

            if (customerInfo.driverLicense && customerInfo.driverLicense !== 'skip') {
              customerSection += `• Driver's License: ${escapeMarkdownFull(customerInfo.driverLicense)}\n`;
              if (customerInfo.dlIssued && customerInfo.dlIssued !== 'skip') {
                customerSection += `• DL Issued: ${escapeMarkdownFull(customerInfo.dlIssued)}\n`;
              }
              if (customerInfo.dlExpiry && customerInfo.dlExpiry !== 'skip') {
                customerSection += `• DL Expiry: ${escapeMarkdownFull(customerInfo.dlExpiry)}\n`;
              }
            }
          }

          const adminMessage =
            `🔔 *NEW BOOKING REQUEST*\n\n` +
            `🆔 Booking ID: \`${appointment.uuid}\`\n` +
            `📱 Service: ${escapeMarkdownFull(serviceName)}\n` +
            `📅 Date: ${formattedDate}\n` +
            `⏰ Time: ${formattedTime} EST\n` +
            `⏱️ Duration: ${serviceDuration} minutes\n\n` +
            `👤 *Client Info:*\n` +
            `• Name: ${escapeMarkdownFull(user.first_name || '')} ${escapeMarkdownFull(user.last_name || '')}\n` +
            `• Telegram: @${escapeMarkdownFull(user.telegram_username || 'N/A')}\n` +
            `• Telegram ID: ${user.telegram_id}\n` +
            `• Phone: ${escapeMarkdownFull(user.phone || 'Not provided')}\n` +
            `• Email: ${escapeMarkdownFull(user.email || 'Not provided')}` +
            customerSection +
            `\n\n⏳ *Awaiting your approval*`;

          await this.bot.telegram.sendMessage(
            ADMIN_TELEGRAM_ID,
            adminMessage,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Approve', callback_data: `admin_approve_booking_${appointment.uuid}` },
                    { text: '❌ Reject', callback_data: `admin_reject_booking_${appointment.uuid}` }
                  ]
                ]
              }
            }
          );
          console.log(`📢 Admin notification sent to ${ADMIN_TELEGRAM_ID}`);
        } catch (adminNotifError) {
          console.error('Failed to send admin notification:', adminNotifError);
        }
      } else {
        console.warn('⚠️ ADMIN_TELEGRAM_ID not configured - no admin notification sent');
      }

      // Check if we're in bulk upload mode
      console.log('📦 Bulk mode check:', {
        hasSession: !!ctx.session,
        hasBulkUpload: !!ctx.session?.bulkUpload,
        bulkActive: ctx.session?.bulkUpload?.active,
        registrationsLength: ctx.session?.bulkUpload?.registrations?.length || 0,
        currentIndex: ctx.session?.bulkUpload?.currentIndex,
        hasBulkHandler: !!this.services?.bulkUploadHandler
      });

      const isInBulkMode = ctx.session?.bulkUpload?.active &&
                           ctx.session.bulkUpload.registrations?.length > 0;

      if (isInBulkMode) {
        console.log('📦 IN BULK MODE - calling onBulkBookingCompleted');
        // Bulk mode: call the bulk handler to continue with next customer
        const bulkUploadHandler = this.services?.bulkUploadHandler;
        if (bulkUploadHandler && typeof bulkUploadHandler.onBulkBookingCompleted === 'function') {
          await bulkUploadHandler.onBulkBookingCompleted(ctx, {
            date: formattedDate,
            time: formattedTime,
            appointmentId: appointment.uuid
          });

          // Clear only the current booking data, keep bulk session
          ctx.session.booking = {};
          ctx.session.customerInfo = {};
          ctx.session.registration = {};

          console.log('🎉 Bulk booking submitted, continuing to next customer...');
          return;
        }
      }

      // Build confirmation message with optional coupon info
      let confirmationMsg = `⏳ *Booking Request Submitted!*\n\n` +
        `🆔 Booking ID: \`${appointment.uuid}\`\n` +
        `📱 Service: ${serviceName}\n` +
        `📅 Date: ${formattedDate}\n` +
        `⏰ Time: ${formattedTime} EST\n` +
        `⏱️ Duration: ${serviceDuration} minutes\n`;

      if (couponRedeemed && booking.couponCode) {
        confirmationMsg += `\n🎟️ Coupon Applied: \`${booking.couponCode}\`\n`;
        confirmationMsg += `💰 Discount: *$${booking.couponDiscount} OFF*\n`;
      }

      confirmationMsg += `\n📋 *Status: Pending Admin Approval*\n\n` +
        `Your booking request has been submitted and is awaiting approval from an administrator.\n\n` +
        `You will receive a notification once your booking is confirmed or if there are any issues.\n\n` +
        `Use /myappointments to view your bookings.`;

      // Send confirmation to user that booking is pending approval (single booking mode)
      await ctx.editMessageText(
        confirmationMsg,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Book Another', callback_data: 'book' }],
              [{ text: '📋 My Appointments', callback_data: 'my_appointments' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );

      // Clear session data
      ctx.session.booking = {};
      ctx.session.customerInfo = {};
      ctx.session.registration = {};

      console.log('🎉 Booking submitted for admin approval!');

    } catch (error) {
      console.error('❌ Booking confirmation error:', error);
      await ctx.editMessageText(
        '❌ Booking failed due to a system error.\n\n' +
        'Please try again or contact support if the problem persists.\n\n' +
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Handle generic service selection
   */
  async handleGenericService(ctx) {
    await safeAnswerCbQuery(ctx, 'Loading...');

    // For generic service callbacks, show calendar
    await this.showCalendar(ctx, 'Service Selected');
    return true;
  }
}

module.exports = BookingHandler;
