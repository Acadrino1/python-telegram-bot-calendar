
const { Markup } = require('telegraf');
const Calendar = require('telegraf-calendar-telegram');
const moment = require('moment-timezone');
const bookingConfig = require('../../config/booking.config');

// Set timezone
moment.tz.setDefault(bookingConfig.timezone || 'America/New_York');

class CalendarUIManager {
  constructor(bot, paymentHandler = null) {
    this.bot = bot;
    this.calendar = null;
    this.paymentHandler = paymentHandler;

    // Initialize the inline calendar if bot is provided
    if (bot) {
      this.initializeCalendar(bot);
    }
  }

  /**
   * Initialize the telegraf-calendar-telegram instance
   */
  initializeCalendar(bot) {
    try {
      // Create calendar with custom options
      // Note: telegraf-calendar-telegram expects Date objects, not strings
      this.calendar = new Calendar(bot, {
        startWeekDay: 0, // Sunday
        weekDayNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
        monthNames: [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ],
        minDate: new Date(), // Today is the earliest
        maxDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days ahead max
      });

      // We handle navigation ourselves to ensure back button is always present
      this.setupCalendarHandlers(bot);

      console.log('✅ Inline calendar initialized with telegraf-calendar-telegram');
    } catch (error) {
      console.error('Failed to initialize calendar:', error);
      this.calendar = null;
    }
  }

  /**
   * Setup custom calendar handlers for navigation (prev/next month)
   * This ensures our back button is always included when the calendar is re-rendered
   */
  setupCalendarHandlers(bot) {
    // Handle previous month navigation
    bot.action(/calendar-telegram-prev-[\d-]+/g, async (context) => {
      try {
        const dateString = context.match[0].replace('calendar-telegram-prev-', '');
        const date = new Date(dateString);
        date.setMonth(date.getMonth() - 1);

        await this.renderCalendarWithBackButton(context, date);
      } catch (error) {
        console.error('Calendar prev navigation error:', error);
        await context.answerCbQuery('Error navigating calendar');
      }
    });

    // Handle next month navigation
    bot.action(/calendar-telegram-next-[\d-]+/g, async (context) => {
      try {
        const dateString = context.match[0].replace('calendar-telegram-next-', '');
        const date = new Date(dateString);
        date.setMonth(date.getMonth() + 1);

        await this.renderCalendarWithBackButton(context, date);
      } catch (error) {
        console.error('Calendar next navigation error:', error);
        await context.answerCbQuery('Error navigating calendar');
      }
    });

    // Handle ignore clicks (empty cells, weekday headers, etc.)
    bot.action(/calendar-telegram-ignore-[\d\w-]+/g, (context) =>
      context.answerCbQuery()
    );
  }

  /**
   * Render calendar for a specific date with back button included
   */
  async renderCalendarWithBackButton(context, date) {
    const prevText = context.callbackQuery.message.text;
    const prevEntities = context.callbackQuery.message.entities;

    // Get calendar markup for the specified date
    const calendarMarkup = this.calendar.helper.getCalendarMarkup(date);

    // Add back button row at the bottom
    if (calendarMarkup && calendarMarkup.reply_markup && calendarMarkup.reply_markup.inline_keyboard) {
      calendarMarkup.reply_markup.inline_keyboard.push([
        Markup.button.callback('← Back to Services', 'book')
      ]);
    }

    await context.answerCbQuery();
    await context.editMessageText(prevText, {
      ...calendarMarkup,
      entities: prevEntities,
    });
  }

  /**
   * Set the bot reference (called after bot is created)
   */
  setBot(bot) {
    this.bot = bot;
    if (!this.calendar && bot) {
      this.initializeCalendar(bot);
    }
  }

  /**
   * Get the calendar markup for display
   */
  getCalendarMarkup() {
    if (!this.calendar) {
      console.warn('Calendar not initialized, falling back to date list');
      return null;
    }
    return this.calendar.getCalendar();
  }

  /**
   * Handle calendar button clicks - returns selected date or null
   */
  handleCalendarClick(ctx) {
    if (!this.calendar) {
      return null;
    }

    try {
      const result = this.calendar.clickButtonCalendar(ctx.callbackQuery);

      // Result is -1 for navigation clicks, a date string for selection, or undefined
      if (result && result !== -1) {
        return moment(result).format('YYYY-MM-DD');
      }
      return null;
    } catch (error) {
      console.error('Calendar click error:', error);
      return null;
    }
  }

  /**
   * Check if a callback is a calendar action
   */
  isCalendarCallback(callbackData) {
    return callbackData && (
      callbackData.startsWith('calendar-') ||
      callbackData.startsWith('calendar:')
    );
  }


  /**
   * Show the visual inline calendar
   */
  async showCalendar(ctx, currentDate = null) {
    try {
      console.log('📅 showCalendar called, calendar exists:', !!this.calendar);

      // Get service name from session if available
      const serviceName = ctx.session?.booking?.service || 'Your Appointment';

      // Use inline calendar if available
      if (this.calendar) {
        console.log('📅 Rendering inline calendar...');
        const calendarMarkup = this.calendar.getCalendar();
        console.log('📅 Calendar markup generated:', !!calendarMarkup);

        // Add back button row at the bottom of the calendar
        if (calendarMarkup && calendarMarkup.reply_markup && calendarMarkup.reply_markup.inline_keyboard) {
          calendarMarkup.reply_markup.inline_keyboard.push([
            Markup.button.callback('← Back to Services', 'book')
          ]);
        }

        await ctx.editMessageText(
          `*${serviceName} Selected*\n\n` +
          `📅 *Select a date for your appointment:*\n\n` +
          `Use the calendar below to choose your preferred date.\n` +
          `_Business Hours: Mon-Sat, 11 AM - 8 PM EST_`,
          {
            parse_mode: 'Markdown',
            reply_markup: calendarMarkup.reply_markup
          }
        );
        console.log('📅 Inline calendar displayed successfully!');
        return;
      }

      // Fallback to date list if calendar not available
      console.log('📅 Calendar not available, using fallback date list');
      await this.showDateList(ctx, serviceName);

    } catch (error) {
      console.error('Calendar display error:', error);
      // Try fallback
      try {
        await this.showDateList(ctx, 'Appointment');
      } catch (fallbackError) {
        console.error('Fallback date list also failed:', fallbackError);
        await ctx.reply('Unable to show calendar. Please try /book again.');
      }
    }
  }

  /**
   * Fallback: Show dates as a list of buttons
   */
  async showDateList(ctx, serviceName) {
    const BookingSlotService = require('../services/BookingSlotService');
    const slotService = new BookingSlotService();

    // Get available dates (7 days ahead)
    const availableDates = slotService.getAvailableDates();

    if (availableDates.length === 0) {
      await ctx.editMessageText(
        '❌ No available dates for booking.\n\n' +
        `Business Hours: ${slotService.getBusinessHoursDisplay().full}`
      );
      return;
    }

    const dateButtons = availableDates.map(dateInfo => [
      Markup.button.callback(
        dateInfo.display,
        `date_${dateInfo.date}`
      )
    ]);

    // Add back button
    dateButtons.push([Markup.button.callback('← Back to Services', 'book')]);

    await ctx.editMessageText(
      `✅ *${serviceName} Selected*\n\n` +
      `📅 Select a date for your appointment:\n\n` +
      `⏰ Business Hours: Monday - Saturday, 11 AM - 8 PM EST`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(dateButtons).reply_markup
      }
    );
  }

  /**
   * Handle calendar date selection and show time slots
   */
  async handleDateSelection(ctx, selectedDate) {
    try {
      const BookingSlotService = require('../services/BookingSlotService');
      const slotService = new BookingSlotService();

      // Check if date is valid for booking
      const dayOfWeek = moment(selectedDate).day();

      // Business hours: Mon-Sat (1-6), closed Sunday (0)
      if (dayOfWeek === 0) {
        await ctx.editMessageText(
          `❌ Sorry, we're closed on Sundays.\n\n` +
          `Please select another date.`,
          {
            parse_mode: 'Markdown',
            reply_markup: this.calendar ? this.calendar.getCalendar().reply_markup : undefined
          }
        );
        return false;
      }

      // Get available time slots for this date (async method)
      const slotResult = await slotService.getAvailableTimeSlots(selectedDate);
      const slots = slotResult.slots || [];

      if (!slots || slots.length === 0) {
        await ctx.editMessageText(
          `❌ No available time slots for ${moment(selectedDate).format('MMMM D, YYYY')}.\n\n` +
          `Please select another date.`,
          {
            parse_mode: 'Markdown',
            reply_markup: this.calendar ? this.calendar.getCalendar().reply_markup : undefined
          }
        );
        return false;
      }

      // Store selected date in session
      if (ctx.session) {
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.date = selectedDate;
      }

      // Show time slots (slot has: time24, time12, endTime, datetime)
      const timeButtons = slots.map(slot => [
        Markup.button.callback(
          `${slot.time12} - ${slot.endTime}`,
          `time_${slot.time24}`
        )
      ]);

      // Add back to calendar button
      timeButtons.push([Markup.button.callback('← Back to Calendar', 'show_calendar')]);

      const formattedDate = moment(selectedDate).format('dddd, MMMM D, YYYY');

      await ctx.editMessageText(
        `📅 *${formattedDate}*\n\n` +
        `⏰ Select an available time slot:`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(timeButtons).reply_markup
        }
      );

      return true;
    } catch (error) {
      console.error('Date selection error:', error);
      await ctx.reply('Error loading time slots. Please try /book again.');
      return false;
    }
  }

  async clickButtonCalendar(ctx) {
    try {
      await ctx.answerCbQuery();
      await this.showCalendar(ctx);
    } catch (error) {
      console.error('Calendar click error:', error);
    }
  }

  getAvailabilitySummary(monthData) {
    if (!monthData || !Array.isArray(monthData)) {
      return { available: 0, limited: 0, full: 0 };
    }

    return monthData.reduce(
      (acc, day) => {
        if (day.status === 'available') acc.available++;
        else if (day.status === 'limited') acc.limited++;
        else if (day.status === 'full') acc.full++;
        return acc;
      },
      { available: 0, limited: 0, full: 0 }
    );
  }

  async getBookingsForDate(dateStr) {
    const Appointment = require('../models/Appointment');

    try {
      return await Appointment.query()
        .whereRaw('DATE(appointment_datetime) = ?', [dateStr])
        .where('status', 'not in', ['cancelled']);
    } catch (error) {
      console.error('Error getting bookings for date:', error);
      return [];
    }
  }
}

module.exports = CalendarUIManager;
