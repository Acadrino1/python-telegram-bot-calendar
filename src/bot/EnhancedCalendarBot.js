
const SimpleTelegramBot = require('./SimpleTelegramBot');
const { Markup } = require('telegraf');

class EnhancedCalendarBot extends SimpleTelegramBot {
  constructor() {
    super();
    
    // Use the existing calendarUIManager from parent class instead of creating a new one
    this.calendarManager = this.calendarUIManager;
    
    // Override existing handlers with calendar-enhanced versions
    this.setupEnhancedHandlers();
    
    console.log('📅 Enhanced Calendar Bot initialized successfully!');
  }

  setupEnhancedHandlers() {
    // Enhanced date selection is now handled by ServiceSelectionHandler with calendar integration
    // No need to override select_date action as it's handled by parent class

    // Handle fallback to basic booking
    this.bot.action('basic_booking_flow', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        
        // Call the original parent method for basic date selection
        await this.showBasicDateSelection(ctx);
      } catch (error) {
        console.error('Basic booking fallback error:', error);
        ctx.reply('Please try starting over with /book');
      }
    });

    // Add calendar-specific commands
    this.setupCalendarCommands();
  }

  setupCalendarCommands() {
    // Calendar command - redirect to book command since service selection is required
    this.bot.command('calendar', async (ctx) => {
      try {
        const message = [
          '📅 *Lodge Mobile Calendar View*',
          '',
          'The calendar interface is integrated with our booking system.',
          'Please use /book to start booking and access the calendar.'
        ].join('\n');

        await ctx.replyWithMarkdown(message);
        
        // Simulate the /book command
        setTimeout(async () => {
          await this.bot.telegram.sendMessage(ctx.chat.id, 
            '📱 *Lodge Mobile Activations*\n\nPlease select one of the following service options:', 
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
        }, 500);
      } catch (error) {
        console.error('Calendar command error:', error);
        ctx.reply('Unable to show calendar. Please try /book instead.');
      }
    });

    // Quick next available command
    this.bot.command('nextavailable', async (ctx) => {
      try {
        const nextAvailable = await this.calendarManager.availabilityService.getNextAvailableDate();
        
        if (!nextAvailable) {
          await ctx.reply(
            '❌ *No Available Dates*\n\n' +
            'Sorry, no appointments are available in the booking window.\n\n' +
            'Please contact support for assistance.',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        await ctx.replyWithMarkdown(
          `🔍 *Next Available Appointment*\n\n` +
          `📅 **${nextAvailable.display}**\n\n` +
          `${this.calendarManager.availabilityService.formatDateStatus(nextAvailable.status, true)}\n\n` +
          `Use /book to schedule your appointment!`
        );
      } catch (error) {
        console.error('Next available command error:', error);
        ctx.reply('Unable to check next available date. Please try /book');
      }
    });

    // Availability command - show general availability
    this.bot.command('availability', async (ctx) => {
      try {
        const now = moment().tz(this.bookingSlotService.config.timezone);
        const currentMonth = await this.calendarManager.availabilityService.getMonthAvailability(
          now.year(), 
          now.month() + 1
        );
        const nextMonth = await this.calendarManager.availabilityService.getMonthAvailability(
          now.clone().add(1, 'month').year(), 
          now.clone().add(1, 'month').month() + 1
        );

        const currentSummary = this.calendarManager.getAvailabilitySummary(currentMonth);
        const nextSummary = this.calendarManager.getAvailabilitySummary(nextMonth);

        const message = [
          '📊 *Booking Availability Overview*',
          '',
          `**${now.format('MMMM YYYY')}:**`,
          `• ✅ Available: ${currentSummary.available} days`,
          `• 🟡 Limited: ${currentSummary.limited} days`,
          `• ❌ Full: ${currentSummary.full} days`,
          '',
          `**${now.clone().add(1, 'month').format('MMMM YYYY')}:**`,
          `• ✅ Available: ${nextSummary.available} days`,
          `• 🟡 Limited: ${nextSummary.limited} days`,
          `• ❌ Full: ${nextSummary.full} days`,
          '',
          '🕐 *Business Hours:* 11 AM - 6 PM EST',
          '📅 *Open:* Monday - Saturday',
          '',
          'Use /book to schedule your appointment!'
        ].join('\n');

        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error('Availability command error:', error);
        ctx.reply('Unable to check availability. Please try /book');
      }
    });
  }

  async showBasicDateSelection(ctx) {
    try {
      // Get available dates using the existing service
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

      // Add option to try calendar view again
      dateButtons.unshift([
        Markup.button.callback('📅 Try Calendar View', 'select_date')
      ]);

      await ctx.editMessageText(
        `📅 *Basic Date Selection*\n\n` +
        `Select a date for your appointment:\n\n` +
        `⏰ Business Hours: ${this.bookingSlotService.getBusinessHoursDisplay().hours}`,
        Markup.inlineKeyboard(dateButtons)
      );
    } catch (error) {
      console.error('Basic date selection error:', error);
      ctx.reply('Unable to show dates. Please try /book again.');
    }
  }

  // Booking confirmation is handled by parent class - no override needed

  // Help command uses parent class implementation with standard help text

  start() {
    // Start the parent bot (includes all standard functionality)
    super.start();
    
    console.log('🚀 Enhanced Calendar Bot is now running!');
    console.log('📅 Calendar features available:');
    console.log('   • Visual month calendar integrated with booking');
    console.log('   • Real-time availability indicators');
    console.log('   • Smart navigation and date selection');
    console.log('   • Mobile-optimized interface');
  }
}

module.exports = EnhancedCalendarBot;