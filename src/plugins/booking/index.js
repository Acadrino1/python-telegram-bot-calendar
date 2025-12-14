const BasePlugin = require('../../core/BasePlugin');
const { Markup } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../../models/User');
const Service = require('../../models/Service');
const Appointment = require('../../models/Appointment');
const BookingSlotService = require('../../services/BookingSlotService');

/**
 * Booking Plugin - Handles appointment booking and management
 */
class BookingPlugin extends BasePlugin {
  get name() {
    return 'booking';
  }

  get version() {
    return '1.0.0';
  }

  get description() {
    return 'Appointment booking and management system';
  }

  get dependencies() {
    return ['auth', 'session'];
  }

  async onInitialize() {
    // Initialize booking service
    this.bookingSlotService = new BookingSlotService();
    
    // Set timezone
    moment.tz.setDefault(this.getConfig('timezone', 'America/New_York'));

    // Define commands
    this.commands = [
      {
        name: 'book',
        handler: this.handleBookCommand.bind(this),
        description: 'Start booking process'
      },
      {
        name: 'myappointments',
        handler: this.handleMyAppointmentsCommand.bind(this),
        description: 'View your appointments'
      },
      {
        name: 'cancel',
        handler: this.handleCancelCommand.bind(this),
        description: 'Cancel an appointment'
      }
    ];

    // Define action handlers
    this.handlers = [
      {
        pattern: /service_(\d+)/,
        handler: this.handleServiceSelection.bind(this)
      },
      {
        pattern: /service_lodge_mobile_(.+)/,
        handler: this.handleLodgeMobileService.bind(this)
      },
      {
        pattern: /date_(.+)/,
        handler: this.handleDateSelection.bind(this)
      },
      {
        pattern: /time_(.+)/,
        handler: this.handleTimeSelection.bind(this)
      },
      {
        pattern: 'confirm_booking',
        handler: this.handleBookingConfirmation.bind(this)
      },
      {
        pattern: 'cancel_booking',
        handler: this.handleBookingCancellation.bind(this)
      }
    ];
  }

  async handleBookCommand(ctx) {
    try {
      // Get auth plugin to check user access
      const authPlugin = this.getOtherPlugin('auth');
      if (!authPlugin) {
        throw new Error('Auth plugin not available');
      }

      const user = await authPlugin.getUser(ctx.from.id);
      if (!user || !authPlugin.isUserApproved(user)) {
        const message = !user ? 
          'Please use /start first to register.' :
          user.isPending() ? 
            'Your access request is pending approval. Please wait for admin review.' :
            'Your access has been denied. Please contact support if you believe this is an error.';
        return await ctx.reply(message);
      }

      // Initialize booking session
      ctx.session = ctx.session || {};
      ctx.session.booking = {};

      // Show service selection
      await ctx.reply('📱 *Lodge Mobile Activations*\n\nPlease select one of the following service options:', 
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🆕 New Registration', 'service_lodge_mobile_new_registration')],
            [Markup.button.callback('📱 SIM Card Activation', 'service_lodge_mobile_simcard_activation')],
            [Markup.button.callback('🔧 Technical Support', 'service_lodge_mobile_technical_support')],
            [Markup.button.callback('📲 Upgrade Device', 'service_lodge_mobile_upgrade_device')]
          ]).reply_markup
        }
      );

    } catch (error) {
      this.logger.error('Book command error:', error);
      await ctx.reply('Sorry, I couldn\'t process your booking request. Please try again.');
    }
  }

  async handleMyAppointmentsCommand(ctx) {
    try {
      const authPlugin = this.getOtherPlugin('auth');
      if (!authPlugin) {
        throw new Error('Auth plugin not available');
      }

      const user = await authPlugin.getUser(ctx.from.id);
      if (!user) {
        return ctx.reply('Please start the bot first with /start');
      }

      if (!authPlugin.isUserApproved(user)) {
        const message = user.isPending() ? 
          'Your access request is pending approval. Please wait for admin review.' :
          'Your access has been denied. Please contact support if you believe this is an error.';
        return await ctx.reply(message);
      }

      const appointments = await Appointment.query()
        .where('client_id', user.id)
        .whereIn('status', ['scheduled', 'confirmed'])
        .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))
        .withGraphFetched('[provider, service]')
        .orderBy('appointment_datetime', 'asc')
        .limit(10);

      if (appointments.length === 0) {
        return ctx.reply('You have no upcoming appointments. Use /book to schedule one!');
      }

      let message = '*📅 Your Upcoming Appointments:*\n\n';
      appointments.forEach((apt, index) => {
        const dateTime = this.bookingSlotService.formatDateTime(apt.appointment_datetime);
        
        message += `${index + 1}. *${apt.service ? apt.service.name : 'Lodge Mobile Service'}*\n`;
        message += `   📆 ${dateTime.date}\n`;
        message += `   ⏰ ${dateTime.time} ${dateTime.timezone}\n`;
        message += `   🆔 ID: \`${apt.uuid}\`\n`;
        message += `   🔗 Status: ${apt.status}\n\n`;
      });
      
      message += '\n*To cancel an appointment:*\nUse /cancel followed by the appointment ID\n';
      message += 'Example: /cancel ABC-123-DEF';

      await ctx.replyWithMarkdown(message);

    } catch (error) {
      this.logger.error('Error fetching appointments:', error);
      ctx.reply('Sorry, I couldn\'t fetch your appointments. Please try again later.');
    }
  }

  async handleCancelCommand(ctx) {
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
      return ctx.reply('Please provide the appointment ID. Example: /cancel ABC123');
    }

    try {
      const appointmentId = args[1];
      const authPlugin = this.getOtherPlugin('auth');
      const user = await authPlugin.getUser(ctx.from.id);
      
      const appointment = await Appointment.query()
        .where('uuid', appointmentId)
        .where('client_id', user.id)
        .withGraphFetched('[service]')
        .first();

      if (!appointment) {
        return ctx.reply('Appointment not found or you don\'t have permission to cancel it.');
      }
      
      if (appointment.status === 'cancelled') {
        return ctx.reply('This appointment has already been cancelled.');
      }

      await appointment.$query().patch({
        status: 'cancelled',
        cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
        cancelled_by: user.id,
        cancellation_reason: 'Cancelled via Telegram bot'
      });
      
      // Notify other plugins about cancellation
      this.eventBus.emit('booking:appointment-cancelled', {
        appointment: appointment,
        user: user,
        cancelledAt: new Date()
      });
      
      const dateTime = this.bookingSlotService.formatDateTime(appointment.appointment_datetime);
      
      ctx.reply(
        `✅ *Appointment Cancelled Successfully*\n\n` +
        `🆔 ID: \`${appointmentId}\`\n` +
        `📱 Service: ${appointment.service?.name || 'Lodge Mobile Service'}\n` +
        `📅 Date: ${dateTime.date}\n` +
        `⏰ Time: ${dateTime.time} ${dateTime.timezone}\n\n` +
        `The time slot is now available for others to book.`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      this.logger.error('Error cancelling appointment:', error);
      ctx.reply('Sorry, I couldn\'t cancel the appointment. Please try again.');
    }
  }

  async handleLodgeMobileService(ctx) {
    try {
      await ctx.answerCbQuery();
      
      const serviceType = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.serviceType = serviceType;
      
      // Map service types to display names
      const serviceNames = {
        'new_registration': 'New Registration',
        'simcard_activation': 'SIM Card Activation', 
        'technical_support': 'Technical Support',
        'upgrade_device': 'Upgrade Device'
      };
      
      ctx.session.booking.service = serviceNames[serviceType] || 'Lodge Mobile Service';
      
      // Get calendar plugin to show date selection
      const calendarPlugin = this.getOtherPlugin('calendar');
      if (calendarPlugin) {
        await calendarPlugin.showCalendar(ctx);
      } else {
        // Fallback to basic date selection
        await this.showBasicDateSelection(ctx);
      }

    } catch (error) {
      this.logger.error('Lodge Mobile service handler error:', error);
      ctx.reply('Sorry, something went wrong. Please try /book again.');
    }
  }

  async handleServiceSelection(ctx) {
    try {
      await ctx.answerCbQuery();
      
      const serviceId = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.serviceId = serviceId;
      
      // Get calendar plugin to show date selection
      const calendarPlugin = this.getOtherPlugin('calendar');
      if (calendarPlugin) {
        await calendarPlugin.showCalendar(ctx);
      } else {
        await this.showBasicDateSelection(ctx);
      }

    } catch (error) {
      this.logger.error('Service handler error:', error);
      ctx.reply('Sorry, something went wrong. Please try /book again.');
    }
  }

  async handleDateSelection(ctx) {
    try {
      await ctx.answerCbQuery();
      
      const date = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.date = date;
      
      // Get available time slots for this date
      const slotInfo = await this.bookingSlotService.getAvailableTimeSlots(date);
      
      if (slotInfo.slots.length === 0) {
        await ctx.editMessageText(
          `❌ No available slots for ${moment(date).format('MMM DD, YYYY')}\n\n` +
          slotInfo.message || 'All slots are booked for this day.\n\n' +
          'Please select another date with /book'
        );
        return;
      }
      
      // Create time slot buttons
      const timeButtons = [];
      for (let i = 0; i < slotInfo.slots.length; i += 2) {
        const row = [];
        const slot1 = slotInfo.slots[i];
        row.push(Markup.button.callback(
          `${slot1.time12} - ${slot1.endTime}`,
          `time_${slot1.time24}`
        ));
        if (slotInfo.slots[i + 1]) {
          const slot2 = slotInfo.slots[i + 1];
          row.push(Markup.button.callback(
            `${slot2.time12} - ${slot2.endTime}`,
            `time_${slot2.time24}`
          ));
        }
        timeButtons.push(row);
      }
      
      // Add back button
      timeButtons.push([
        Markup.button.callback('← Back to dates', 'show_calendar'),
        Markup.button.callback('❌ Cancel', 'cancel_booking')
      ]);

      await ctx.editMessageText(
        `⏰ Available time slots for ${moment(date).format('MMM DD, YYYY')}:\n\n` +
        `📊 ${slotInfo.totalBooked}/${slotInfo.maxSlots} slots booked\n` +
        `✅ ${slotInfo.slotsRemaining} slots available\n\n` +
        'Select a time:',
        Markup.inlineKeyboard(timeButtons)
      );

    } catch (error) {
      this.logger.error('Date handler error:', error);
      ctx.reply('Sorry, something went wrong. Please try /book again.');
    }
  }

  async handleTimeSelection(ctx) {
    try {
      await ctx.answerCbQuery();
      
      const time = ctx.match[1];
      ctx.session = ctx.session || {};
      ctx.session.booking = ctx.session.booking || {};
      ctx.session.booking.time = time;
      
      const booking = ctx.session.booking;
      const serviceName = booking.service || 'Lodge Mobile Service';
      
      // Format time for display
      const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm')
        .tz(this.getConfig('timezone', 'America/New_York'));
      const formattedDate = dateTime.format('MMM DD, YYYY');
      const formattedTime = dateTime.format('h:mm A');
      
      const summary = `
*📋 Booking Summary:*

📅 Date: ${formattedDate}
⏰ Time: ${formattedTime} EST
📱 Service: ${serviceName}
⏱️ Duration: ${this.getConfig('serviceDurations', {})[serviceName] || 60} minutes

Confirm your booking?
      `;

      await ctx.editMessageText(summary, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirm', 'confirm_booking'),
            Markup.button.callback('❌ Cancel', 'cancel_booking')
          ]
        ]).reply_markup
      });

    } catch (error) {
      this.logger.error('Time handler error:', error);
      ctx.reply('Sorry, something went wrong. Please try /book again.');
    }
  }

  async handleBookingConfirmation(ctx) {
    try {
      await ctx.answerCbQuery();
      
      const authPlugin = this.getOtherPlugin('auth');
      const user = await authPlugin.getUser(ctx.from.id);
      if (!user) {
        return ctx.reply('Please use /start first to register.');
      }
      
      ctx.session = ctx.session || {};
      const booking = ctx.session.booking || {};
      
      if (!booking.date || !booking.time) {
        return ctx.reply('Session expired. Please start booking again with /book');
      }
      
      // Check slot availability
      const isAvailable = await this.bookingSlotService.isSlotAvailable(booking.date, booking.time);
      if (!isAvailable) {
        return ctx.editMessageText(
          '❌ Sorry, this slot was just booked by someone else.\n\n' +
          'Please use /book to select another time.'
        );
      }
      
      // Create appointment
      const dateTime = moment.tz(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm', 
        this.getConfig('timezone', 'America/New_York'));
      
      let service = null;
      let serviceDuration = 60;
      if (booking.serviceId) {
        service = await Service.query().findById(booking.serviceId);
        if (service) {
          serviceDuration = service.duration_minutes || 60;
        }
      }
      
      // Get provider
      const provider = await User.query()
        .where('role', 'provider')
        .where('is_active', true)
        .first();
      
      if (!provider) {
        return ctx.reply('Sorry, no providers are available. Please try again later.');
      }
      
      const appointmentData = {
        uuid: require('uuid').v4(),
        client_id: user.id,
        provider_id: provider.id,
        service_id: booking.serviceId || 1,
        appointment_datetime: dateTime.format('YYYY-MM-DD HH:mm:ss'),
        duration_minutes: serviceDuration,
        status: 'scheduled',
        notes: `${booking.service || 'Lodge Mobile Service'} - Booked via Telegram`,
        price: service?.price || 0
      };
      
      const appointment = await Appointment.query().insert(appointmentData);
      
      // Emit booking event
      this.eventBus.emit('booking:appointment-created', {
        appointment: appointment,
        user: user,
        service: service || { name: booking.service || 'Lodge Mobile Service' }
      });
      
      const displayDateTime = this.bookingSlotService.formatDateTime(appointment.appointment_datetime);

      await ctx.editMessageText(
        `✅ *Appointment Booked Successfully!*\n\n` +
        `📱 Service: ${booking.service || "Lodge Mobile Service"}\n` +
        `📅 Date: ${displayDateTime.date}\n` +
        `⏰ Time: ${displayDateTime.time}\n` +
        `🌎 Timezone: ${displayDateTime.timezone}\n\n` +
        `Use /myappointments to view your bookings.`,
        { parse_mode: 'Markdown' }
      );

      // Clear session
      ctx.session.booking = {};

    } catch (error) {
      this.logger.error('Booking confirmation error:', error);
      await ctx.reply('Sorry, booking failed. Please try again.\n\nError: ' + error.message);
    }
  }

  async handleBookingCancellation(ctx) {
    try {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      await ctx.editMessageText('Booking cancelled. Use /book to start over.');
    } catch (error) {
      this.logger.error('Cancel booking error:', error);
      ctx.reply('Cancelled.');
    }
  }

  async showBasicDateSelection(ctx) {
    const availableDates = this.bookingSlotService.getAvailableDates();
    
    if (availableDates.length === 0) {
      await ctx.editMessageText(
        '❌ No available dates for booking.\n\n' +
        `Business Hours: ${this.bookingSlotService.getBusinessHoursDisplay().full}`
      );
      return;
    }
    
    const dateButtons = availableDates.map(dateInfo => [
      Markup.button.callback(
        dateInfo.display,
        `date_${dateInfo.date}`
      )
    ]);

    await ctx.editMessageText(
      `📅 Select a date for your appointment:\n\n` +
      `⏰ Business Hours: ${this.bookingSlotService.getBusinessHoursDisplay().hours}`,
      Markup.inlineKeyboard(dateButtons)
    );
  }

  async onHealthCheck() {
    try {
      // Check if booking slot service is working
      const businessHours = this.bookingSlotService.getBusinessHoursDisplay();
      const availableDates = this.bookingSlotService.getAvailableDates();
      
      return businessHours && availableDates !== null;
    } catch (error) {
      this.logger.error('Booking plugin health check failed:', error);
      return false;
    }
  }

  getMetrics() {
    const baseMetrics = super.getMetrics();
    
    return {
      ...baseMetrics,
      bookingSpecific: {
        // Add booking-specific metrics
        availableDates: this.bookingSlotService ? this.bookingSlotService.getAvailableDates().length : 0,
        businessHours: this.bookingSlotService ? this.bookingSlotService.getBusinessHoursDisplay() : null
      }
    };
  }
}

module.exports = BookingPlugin;