const { Markup } = require('telegraf');
const BulkUploadService = require('../../services/BulkUploadService');
const MoneroPayService = require('../../services/MoneroPayService');
const path = require('path');

class BulkUploadHandler {
  constructor(bot, services = {}) {
    this.bot = bot;
    this.services = services;
    this.bulkUploadService = new BulkUploadService();
    this.moneroPayService = new MoneroPayService();
  }

  setupHandlers(bot, services = null) {
    if (bot) this.bot = bot;
    if (services) this.services = services;

    console.log('Setting up BulkUploadHandler... (methods available for direct calls)');
    console.log('BulkUploadHandler setup complete');
  }

  /**
   * Handle callback routing from FixedCallbackQueryHandler
   */
  async handleCallback(ctx, callbackData) {
    console.log(`📄 BulkUploadHandler.handleCallback: ${callbackData}`);

    switch (callbackData) {
      case 'reg_mode_single':
        return await this.handleSingleMode(ctx);
      case 'reg_mode_bulk':
        return await this.handleBulkMode(ctx);
      case 'bulk_download_template':
        return await this.handleDownloadTemplate(ctx);
      case 'bulk_confirm':
        return await this.handleBulkConfirm(ctx);
      case 'bulk_cancel':
        return await this.handleBulkCancel(ctx);
      case 'bulk_next':
        return await this.handleBulkNext(ctx);
      // bulk_skip and bulk_finish_early removed - all customers in bulk upload must be booked
      default:
        return false;
    }
  }

  /**
   * Handle "Single Registration" choice
   */
  async handleSingleMode(ctx) {
    console.log('📝 BULK HANDLER: reg_mode_single clicked');
    await ctx.answerCbQuery();

    // Initialize standard registration session
    ctx.session = ctx.session || {};
    ctx.session.booking = {
      service: 'Lodge Mobile: New Registration',
      requiresForm: true
    };
    ctx.session.registration = {
      service: 'Lodge Mobile: New Registration',
      step: 'firstName',
      data: {},
      awaitingInput: false,
      pendingInput: null
    };
    ctx.session.bulkUpload = null;

    await ctx.editMessageText(
      `*Single Registration Selected*\n\n` +
      `We'll collect information for one customer.\n\n` +
      `This form has 13 steps. Ready to begin?`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('Start Registration', 'reg_start')],
          [Markup.button.callback('Back', 'service_lodge_mobile_new_registration')]
        ]).reply_markup
      }
    );
    return true;
  }

  /**
   * Handle "Bulk Upload" choice - automatically send template
   */
  async handleBulkMode(ctx) {
    console.log('📝 BULK HANDLER: reg_mode_bulk clicked');
    await ctx.answerCbQuery('Preparing template...');

    // Initialize bulk upload session
    ctx.session = ctx.session || {};
    ctx.session.bulkUpload = {
      active: true,
      awaitingFile: true,
      registrations: [],
      currentIndex: 0,
      errors: []
    };
    ctx.session.booking = {
      service: 'Lodge Mobile: New Registration',
      requiresForm: true
    };

    console.log('📝 Session bulkUpload set:', JSON.stringify(ctx.session.bulkUpload));

    try {
      // Automatically send the template
      const templateBuffer = this.bulkUploadService.getTemplateBuffer();
      const templateFilename = this.bulkUploadService.getTemplateFilename();

      await ctx.replyWithDocument(
        {
          source: templateBuffer,
          filename: templateFilename
        },
        {
          caption: '*Bulk Registration Template*\n\n' +
            '1. Open this TXT file in any text editor\n' +
            '2. Add one customer per line using | as separator\n' +
            '3. Use SKIP for optional fields\n' +
            '4. Save and upload the file here\n\n' +
            'Required: First Name, Last Name, DOB, Address, Province, Postal Code\n' +
            'Max 20 customers per file.',
          parse_mode: 'Markdown'
        }
      );

      // Prompt for file upload
      await ctx.reply(
        'Upload your completed TXT file when ready:',
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Cancel Upload', 'book')]
          ]).reply_markup
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending template:', error);
      await ctx.reply('Failed to generate template. Please try again.');
      return true;
    }
  }

  /**
   * Handle "Download Template" button
   */
  async handleDownloadTemplate(ctx) {
    await ctx.answerCbQuery('Preparing template...');

    try {
      const templateBuffer = this.bulkUploadService.getTemplateBuffer();
      const templateFilename = this.bulkUploadService.getTemplateFilename();

      await ctx.replyWithDocument(
        {
          source: templateBuffer,
          filename: templateFilename
        },
        {
          caption: '*Bulk Registration Template*\n\n' +
            '1. Open this TXT file in any text editor\n' +
            '2. Add one customer per line using | as separator\n' +
            '3. Use SKIP for optional fields\n' +
            '4. Save and upload the file here\n\n' +
            'Required: First Name, Last Name, DOB, Address, Province, Postal Code',
          parse_mode: 'Markdown'
        }
      );

      // Prompt for file upload
      await ctx.reply(
        'Upload your completed TXT file when ready:',
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Cancel Upload', 'book')]
          ]).reply_markup
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending template:', error);
      await ctx.reply('Failed to generate template. Please try again.');
      return true;
    }
  }

  /**
   * Handle bulk upload confirmation
   */
  async handleBulkConfirm(ctx) {
    await ctx.answerCbQuery();

    if (!ctx.session?.bulkUpload?.registrations?.length) {
      await ctx.reply('No valid registrations found. Please upload a file first.');
      return true;
    }

    // Start booking process for first registration
    ctx.session.bulkUpload.currentIndex = 0;
    ctx.session.bulkUpload.completedBookings = [];

    await this.showCurrentBulkBooking(ctx);
    return true;
  }

  /**
   * Handle bulk upload cancel
   */
  async handleBulkCancel(ctx) {
    await ctx.answerCbQuery();

    ctx.session.bulkUpload = null;

    await ctx.editMessageText(
      'Bulk upload cancelled.\n\nUse /book to start over.',
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  /**
   * Handle "Next" in bulk booking (after a booking is completed)
   */
  async handleBulkNext(ctx) {
    await ctx.answerCbQuery();

    console.log('📦 handleBulkNext called, session.bulkUpload:', JSON.stringify(ctx.session?.bulkUpload || null));

    if (!ctx.session?.bulkUpload) {
      console.log('⚠️ Bulk session lost! Notifying user.');
      await ctx.reply(
        '❌ *Session Expired*\n\n' +
        'Your bulk upload session was lost. This can happen if the bot was restarted.\n\n' +
        'Please start again with /book and select Bulk Upload.',
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    ctx.session.bulkUpload.currentIndex++;

    if (ctx.session.bulkUpload.currentIndex < ctx.session.bulkUpload.registrations.length) {
      await this.showCurrentBulkBooking(ctx);
    } else {
      await this.showBulkCompletionSummary(ctx);
    }
    return true;
  }


  /**
   * Handle document upload for bulk registration
   */
  async handleDocumentUpload(ctx) {
    console.log('📄 BulkUploadHandler.handleDocumentUpload called');
    console.log('📄 Session bulkUpload:', JSON.stringify(ctx.session?.bulkUpload || null));

    // Check if we're expecting a bulk upload file
    if (!ctx.session?.bulkUpload?.awaitingFile) {
      console.log('📄 Not awaiting file, returning false');
      return false; // Not in bulk upload mode
    }

    const document = ctx.message.document;
    console.log('📄 Document received:', document.file_name);

    // Validate file type - accept TXT files
    const fileName = (document.file_name || '').toLowerCase();
    if (!fileName.endsWith('.txt')) {
      await ctx.reply(
        'Please upload a TXT file (.txt).\n\n' +
        'Click "Download Template" to get the correct format.',
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Download Template', 'bulk_download_template')],
            [Markup.button.callback('Cancel', 'book')]
          ]).reply_markup
        }
      );
      return true;
    }

    // Download file
    await ctx.reply('Processing your file...');

    try {
      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());

      console.log('📄 File downloaded, parsing TXT...');

      // Parse TXT file
      const parseResult = this.bulkUploadService.parseTextFile(buffer);

      if (!parseResult.success) {
        await ctx.reply(
          `Failed to process file:\n${parseResult.error}\n\n` +
          'Please check your file and try again.',
          {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('Download Template', 'bulk_download_template')],
              [Markup.button.callback('Cancel', 'book')]
            ]).reply_markup
          }
        );
        return true;
      }

      // Validate all rows
      const validationResult = this.bulkUploadService.validateAllRows(parseResult.registrations);

      console.log('📄 Bulk validation result:', {
        valid: validationResult.validCount,
        invalid: validationResult.invalidCount,
        errors: validationResult.invalid.map(e => ({ row: e.row, name: e.name, errors: e.errors }))
      });

      // Store valid registrations in session
      ctx.session.bulkUpload.registrations = validationResult.valid;
      ctx.session.bulkUpload.awaitingFile = false;

      // Build summary message
      let message = `*File Processed*\n\n`;

      if (validationResult.validCount > 0) {
        message += this.bulkUploadService.generateValidSummary(validationResult.valid);
        message += '\n\n';
      }

      if (validationResult.invalidCount > 0) {
        message += this.bulkUploadService.generateErrorReport(validationResult.invalid);
        message += '\n\n';
      }

      if (validationResult.validCount === 0) {
        message += 'No valid registrations found. Please fix errors and re-upload.';

        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Upload Again', 'reg_mode_bulk')],
            [Markup.button.callback('Cancel', 'book')]
          ]).reply_markup
        });
        return true;
      }

      message += `Ready to book ${validationResult.validCount} appointment(s)?`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('Continue to Booking', 'bulk_confirm')],
          [Markup.button.callback('Cancel', 'bulk_cancel')]
        ]).reply_markup
      });

      return true;
    } catch (error) {
      console.error('Error processing bulk upload:', error);
      await ctx.reply(
        'An error occurred while processing your file. Please try again.',
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Try Again', 'reg_mode_bulk')],
            [Markup.button.callback('Cancel', 'book')]
          ]).reply_markup
        }
      );
      return true;
    }
  }

  /**
   * Show current registration for booking - directly shows calendar
   * No skip or cancel options - all customers must be booked
   */
  async showCurrentBulkBooking(ctx) {
    const { registrations, currentIndex } = ctx.session.bulkUpload;
    const current = registrations[currentIndex];
    const total = registrations.length;

    console.log(`📦 showCurrentBulkBooking: Customer ${currentIndex + 1} of ${total}: ${current.displayName}`);

    // Store current registration data in session for booking
    ctx.session.customerInfo = current;
    ctx.session.registration = {
      service: 'Lodge Mobile: New Registration',
      step: 'confirm',
      data: current
    };

    // Build full address
    const suiteUnit = current.suiteUnit && current.suiteUnit !== 'skip' ? ` Unit ${current.suiteUnit},` : '';
    const fullAddress = `${current.streetNumber}${suiteUnit} ${current.streetAddress}, ${current.city}, ${current.province} ${current.postalCode}`;

    // Format DOB if available
    const dobDisplay = current.dateOfBirth ? `\n*DOB:* ${current.dateOfBirth}` : '';

    // Show customer info header - no skip/cancel buttons, booking is required
    const message = `📦 *Bulk Booking ${currentIndex + 1} of ${total}*\n\n` +
      `*Customer:* ${current.displayName}${dobDisplay}\n` +
      `*Address:* ${fullAddress}\n\n` +
      `_Select an appointment date and time:_`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

    // Directly show the calendar - user must select a date/time
    const calendarUIManager = this.services?.calendarUIManager;
    if (calendarUIManager && typeof calendarUIManager.showCalendar === 'function') {
      await calendarUIManager.showCalendar(ctx);
    } else {
      console.log('⚠️ CalendarUIManager not available, falling back to button');
      await ctx.reply('Select a date:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📅 Open Calendar', 'show_calendar')]
        ]).reply_markup
      });
    }
  }

  /**
   * Called after a booking is confirmed in bulk mode
   * Automatically advances to next customer's date/time selection
   * No confirmation messages - direct flow to next customer
   */
  async onBulkBookingCompleted(ctx, bookingDetails) {
    console.log('📦 onBulkBookingCompleted called');
    if (!ctx.session?.bulkUpload) {
      console.log('⚠️ onBulkBookingCompleted: No bulk session found');
      return;
    }

    const current = ctx.session.bulkUpload.registrations[ctx.session.bulkUpload.currentIndex];
    console.log(`📦 Completed booking for: ${current.displayName}`);

    // Store completed booking
    ctx.session.bulkUpload.completedBookings = ctx.session.bulkUpload.completedBookings || [];
    ctx.session.bulkUpload.completedBookings.push({
      name: current.displayName,
      date: bookingDetails.date,
      time: bookingDetails.time
    });

    const remaining = ctx.session.bulkUpload.registrations.length - ctx.session.bulkUpload.currentIndex - 1;
    console.log(`📦 Remaining customers to book: ${remaining}`);

    if (remaining > 0) {
      // Automatically advance to next customer - no confirmation message
      ctx.session.bulkUpload.currentIndex++;

      // Immediately show next customer's booking screen with calendar
      await this.showCurrentBulkBooking(ctx);
    } else {
      // All done - show summary
      ctx.session.bulkUpload.currentIndex++;
      await this.showBulkCompletionSummary(ctx);
    }
  }

  /**
   * Show final summary of all bulk bookings + payment invoice
   */
  async showBulkCompletionSummary(ctx) {
    const { completedBookings, appointmentIds } = ctx.session.bulkUpload;

    let message = `📋 *Bulk Booking Summary*\n\n`;

    if (completedBookings && completedBookings.length > 0) {
      message += `*${completedBookings.length} Appointments Scheduled:*\n\n`;
      completedBookings.forEach((booking, i) => {
        message += `${i + 1}. ${booking.name}\n   📅 ${booking.date} at ${booking.time}\n\n`;
      });
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

    // Check if payments are enabled
    if (this.moneroPayService.isEnabled() && completedBookings && completedBookings.length > 0) {
      try {
        // Collect appointment IDs from completed bookings
        const aptIds = appointmentIds || completedBookings.map(b => b.appointmentId).filter(Boolean);

        // Create single bulk payment invoice
        const paymentData = await this.moneroPayService.createBulkPaymentRequest(
          aptIds,
          ctx.user?.id || ctx.from.id,
          completedBookings.length
        );

        // Generate and send payment message
        const paymentMessage = this.moneroPayService.generateBulkPaymentMessage(paymentData);

        // Generate QR code URL
        const qrUrl = this.moneroPayService.generateQrCodeUrl(
          paymentData.address,
          paymentData.amountXmr.replace('.', '') // Convert to atomic for QR
        );

        // Send QR code image
        await ctx.replyWithPhoto(qrUrl, {
          caption: paymentMessage,
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ Check Payment Status', `check_payment_${paymentData.id}`)],
            [Markup.button.callback('❌ Cancel Booking', `cancel_payment_${paymentData.id}`)]
          ]).reply_markup
        });

        // Store payment ID in session for status checks
        ctx.session.pendingPaymentId = paymentData.id;

      } catch (error) {
        console.error('Error creating bulk payment:', error);
        await ctx.reply(
          '⚠️ Payment system temporarily unavailable.\n' +
          'Your appointments are pending. An admin will contact you for payment.',
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      // Payments disabled - just show completion
      await ctx.reply(
        '✅ All appointments have been scheduled!\n\nThank you for using Lodge Scheduler!',
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Book More', 'book')],
            [Markup.button.callback('Main Menu', 'start')]
          ]).reply_markup
        }
      );
    }

    // Clear bulk upload session
    ctx.session.bulkUpload = null;
  }

  /**
   * Check if currently in bulk upload mode
   */
  isInBulkMode(ctx) {
    return ctx.session?.bulkUpload?.active === true;
  }

  /**
   * Check if we're in bulk booking flow (after file upload, during appointment selection)
   */
  isInBulkBookingFlow(ctx) {
    return this.isInBulkMode(ctx) &&
      ctx.session.bulkUpload.registrations?.length > 0 &&
      !ctx.session.bulkUpload.awaitingFile;
  }
}

module.exports = BulkUploadHandler;
