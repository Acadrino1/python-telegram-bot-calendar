const { Telegraf, Markup, session } = require('telegraf');
const moment = require('moment-timezone');
const User = require('../models/User');
const Service = require('../models/Service');
const Appointment = require('../models/Appointment');

class SimpleTelegramBot {
  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    
    // Session middleware for conversation state
    this.bot.use(session());
    
    // Global error handler
    this.bot.catch((err, ctx) => {
      console.error('Bot error:', err);
      // Only reply if we have a valid context
      if (ctx && ctx.reply) {
        ctx.reply('An error occurred. Please try again.').catch(() => {});
      }
    });
    
    this.setupCommands();
    this.setupHandlers();
  }

  setupCommands() {
    // Start command
    this.bot.command('start', async (ctx) => {
      const firstName = ctx.from.first_name || 'User';
      const welcomeMessage = `
🏥 *Welcome to Lodge Scheduler Bot!*

Hello ${firstName}! I'm here to help you book and manage appointments.

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel - Cancel an appointment
ℹ️ /help - Show help message

Let's get started! Use /book to schedule your first appointment.
      `;
      
      await ctx.replyWithMarkdown(welcomeMessage);
      
      // Register user if not exists
      await this.registerUser(ctx);
    });

    // Book appointment command
    this.bot.command('book', async (ctx) => {
      ctx.session = ctx.session || {};
      ctx.session.booking = {};
      
      await ctx.reply('Let\'s book an appointment! First, select a service category:', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🏥 Medical', 'category_medical')],
          [Markup.button.callback('💅 Beauty', 'category_beauty')],
          [Markup.button.callback('🦷 Dental', 'category_dental')],
          [Markup.button.callback('💆 Wellness', 'category_wellness')]
        ])
      );
    });

    // My appointments command
    this.bot.command('myappointments', async (ctx) => {
      try {
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          return ctx.reply('Please start the bot first with /start');
        }

        const appointments = await Appointment.query()
          .where('client_id', user.id)  // Changed to snake_case
          .whereIn('status', ['scheduled', 'confirmed'])
          .where('appointment_datetime', '>', moment().format('YYYY-MM-DD HH:mm:ss'))  // Fixed datetime format
          .withGraphFetched('[provider, service]')
          .orderBy('appointment_datetime', 'asc')  // Changed field name
          .limit(10);

        if (appointments.length === 0) {
          return ctx.reply('You have no upcoming appointments. Use /book to schedule one!');
        }

        let message = '*📅 Your Upcoming Appointments:*\n\n';
        appointments.forEach((apt, index) => {
          const date = moment(apt.appointment_datetime).format('MMM DD, YYYY');  // Changed field name
          const time = moment(apt.appointment_datetime).format('HH:mm');  // Changed field name
          
          message += `${index + 1}. *${apt.service ? apt.service.name : 'Service'}*\n`;
          message += `   📆 ${date} at ${time}\n`;
          message += `   🆔 ID: \`${apt.uuid}\`\n\n`;
        });

        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error('Error fetching appointments:', error);
        ctx.reply('Sorry, I couldn\'t fetch your appointments. Please try again later.');
      }
    });

    // Cancel appointment command
    this.bot.command('cancel', async (ctx) => {
      const args = ctx.message.text.split(' ');
      
      if (args.length < 2) {
        return ctx.reply('Please provide the appointment ID. Example: /cancel ABC123');
      }

      try {
        const appointmentId = args[1];
        const user = await this.getUser(ctx.from.id);
        
        const appointment = await Appointment.query()
          .where('uuid', appointmentId)
          .where('client_id', user.id)  // Changed to snake_case
          .first();

        if (!appointment) {
          return ctx.reply('Appointment not found or you don\'t have permission to cancel it.');
        }

        await appointment.$query().patch({
          status: 'cancelled',
          cancelled_at: moment().format('YYYY-MM-DD HH:mm:ss'),
          cancelled_by: user.id,
          cancellation_reason: 'Cancelled via Telegram bot'
        });
        
        ctx.reply(`✅ Appointment ${appointmentId} has been cancelled successfully.`);
      } catch (error) {
        console.error('Error cancelling appointment:', error);
        ctx.reply('Sorry, I couldn\'t cancel the appointment. Please try again.');
      }
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      const helpMessage = `
*🤖 Lodge Scheduler Bot Help*

*Commands:*
• /start - Start the bot
• /book - Book new appointment
• /myappointments - View appointments
• /cancel [ID] - Cancel appointment
• /help - Show this help

*Booking Process:*
1️⃣ Choose service category
2️⃣ Select specific service
3️⃣ Pick a date
4️⃣ Select available time
5️⃣ Confirm booking

*Need Support?*
Contact the administrator for help.
      `;
      
      await ctx.replyWithMarkdown(helpMessage);
    });
  }

  setupHandlers() {
    // Handle category selection
    this.bot.action(/category_(.+)/, async (ctx) => {
      try {
        // Answer callback query with graceful error handling
        await ctx.answerCbQuery().catch(() => {});
        
        const category = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.category = category;
        
        // Get actual services from database
        const services = await Service.query()
          .where('is_active', true)
          .orderBy('name', 'asc')
          .limit(5);

        const buttons = services.map(service => [
          Markup.button.callback(
            `${service.name} - $${service.price}`, 
            `service_${service.id}`
          )
        ]);

        await ctx.editMessageText('Select a service:', 
          Markup.inlineKeyboard(buttons)
        );
      } catch (error) {
        console.error('Category handler error:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle service selection
    this.bot.action(/service_(\d+)/, async (ctx) => {
      try {
        // Answer callback query with graceful error handling
        await ctx.answerCbQuery().catch(() => {});
        
        const serviceId = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.serviceId = serviceId;
        
        // Simple date selection
        const dates = [];
        for (let i = 1; i <= 7; i++) {
          const date = moment().add(i, 'days');
          dates.push([
            Markup.button.callback(
              date.format('MMM DD (ddd)'),
              `date_${date.format('YYYY-MM-DD')}`
            )
          ]);
        }

        await ctx.editMessageText('Select a date:',
          Markup.inlineKeyboard(dates)
        );
      } catch (error) {
        console.error('Service handler error:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle date selection
    this.bot.action(/date_(.+)/, async (ctx) => {
      try {
        // Answer callback query with graceful error handling
        await ctx.answerCbQuery().catch(() => {});
        
        const date = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.date = date;
        
        // Generate time slots
        const slots = [];
        for (let hour = 9; hour < 17; hour++) {
          slots.push(
            Markup.button.callback(`${hour}:00`, `time_${hour}:00`),
            Markup.button.callback(`${hour}:30`, `time_${hour}:30`)
          );
        }

        // Create rows of 2 buttons each
        const rows = [];
        for (let i = 0; i < slots.length; i += 2) {
          rows.push(slots.slice(i, i + 2));
        }

        await ctx.editMessageText(
          `Available time slots for ${date}:`,
          Markup.inlineKeyboard(rows)
        );
      } catch (error) {
        console.error('Date handler error:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle time selection
    this.bot.action(/time_(.+)/, async (ctx) => {
      try {
        // Answer callback query with graceful error handling
        await ctx.answerCbQuery().catch(() => {});
        
        const time = ctx.match[1];
        ctx.session = ctx.session || {};
        ctx.session.booking = ctx.session.booking || {};
        ctx.session.booking.time = time;
        
        const booking = ctx.session.booking;
        const summary = `
*📋 Booking Summary:*

Date: ${booking.date}
Time: ${booking.time}
Service ID: ${booking.serviceId}

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
        console.error('Time handler error:', error);
        ctx.reply('Sorry, something went wrong. Please try /book again.');
      }
    });

    // Handle booking confirmation
    this.bot.action('confirm_booking', async (ctx) => {
      try {
        // Answer callback query with graceful error handling
        await ctx.answerCbQuery().catch(() => {});
        
        console.log('Starting booking confirmation...');
        
        const user = await this.getUser(ctx.from.id);
        if (!user) {
          console.error('User not found for Telegram ID:', ctx.from.id);
          return ctx.reply('Please use /start first to register.');
        }
        
        ctx.session = ctx.session || {};
        const booking = ctx.session.booking || {};
        
        console.log('Booking data:', booking);
        console.log('User ID:', user.id);
        
        // Validate booking data
        if (!booking.date || !booking.time) {
          console.error('Missing booking data:', { date: booking.date, time: booking.time });
          return ctx.reply('Session expired. Please start booking again with /book');
        }
        
        // Create appointment
        const dateTime = moment(`${booking.date} ${booking.time}`, 'YYYY-MM-DD HH:mm');
        
        console.log('Creating appointment with datetime:', dateTime.format());
        
        // Get first available provider
        const provider = await User.query()
          .where('role', 'provider')
          .where('is_active', true)
          .first();
        
        if (!provider) {
          console.error('No active provider found');
          return ctx.reply('Sorry, no providers are available. Please try again later.');
        }
        
        const appointmentData = {
          uuid: require('uuid').v4(),
          client_id: user.id,  // Changed to snake_case
          provider_id: provider.id, // Use actual provider from database
          service_id: parseInt(booking.serviceId) || 1,
          appointment_datetime: dateTime.format('YYYY-MM-DD HH:mm:ss'),  // MySQL DATETIME format
          duration_minutes: 30,  // Default 30 minute appointment
          status: 'scheduled',
          notes: 'Booked via Telegram',
          price: 50.00  // Default price for now
        };
        
        console.log('Appointment data to insert:', appointmentData);
        
        const appointment = await Appointment.query().insert(appointmentData);
        
        console.log('Appointment created successfully:', appointment.uuid);

        await ctx.editMessageText(
          `✅ *Appointment Booked Successfully!*\n\n` +
          `Your appointment ID: \`${appointment.uuid}\`\n` +
          `Date: ${booking.date}\n` +
          `Time: ${booking.time}\n\n` +
          `Use /myappointments to view your bookings.`,
          { parse_mode: 'Markdown' }
        );

        ctx.session.booking = {};
      } catch (error) {
        console.error('Booking confirmation error:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        await ctx.reply('Sorry, booking failed. Please try again.\n\nError: ' + error.message);
      }
    });

    // Handle booking cancellation
    this.bot.action('cancel_booking', async (ctx) => {
      try {
        // Answer callback query with graceful error handling
        await ctx.answerCbQuery().catch(() => {});
        ctx.session = ctx.session || {};
        ctx.session.booking = {};
        await ctx.editMessageText('Booking cancelled. Use /book to start over.');
      } catch (error) {
        console.error('Cancel booking error:', error);
        ctx.reply('Cancelled.');
      }
    });
  }

  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first();

      if (!user) {
        user = await User.query().insert({
          telegram_id: telegramUser.id.toString(),
          email: `telegram_${telegramUser.id}@telegram.local`,
          password_hash: 'telegram_auth',
          first_name: telegramUser.first_name || 'User',
          last_name: telegramUser.last_name || '',
          phone: '',
          role: 'client',
          timezone: 'America/New_York',
          preferences: {
            notificationTelegram: true
          },
          is_active: true
        });
      }

      return user;
    } catch (error) {
      console.error('Error registering user:', error);
      return null;
    }
  }

  async getUser(telegramId) {
    try {
      return await User.query()
        .where('telegram_id', telegramId.toString())
        .first();
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  start() {
    this.bot.launch();
    console.log('🤖 Telegram bot started successfully!');
    
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = SimpleTelegramBot;