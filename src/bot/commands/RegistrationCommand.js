const User = require('../../models/User');

class RegistrationCommand {
  constructor(bot, services) {
    this.bot = bot;
    this.referralCodeService = services.referralCodeService;
    this.ADMIN_ID = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
    this.adminIds = services.adminIds || [];
  }

  getName() {
    return 'start';
  }

  getDescription() {
    return 'Start the bot and register user';
  }

  async execute(ctx) {
    try {
      console.log('Start command invoked by:', ctx.from.id, ctx.from.username);
      
      const user = await this.registerUser(ctx);
      
      if (!user) {
        console.error('Failed to register/retrieve user');
        const fallbackMessage = `
📱 *Welcome to Lodge Mobile Activations Bot!*

Hello! I'm experiencing a temporary issue with user registration.

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments  
❌ /cancel - Cancel an appointment
🎧 /support - Get support help
ℹ️ /help - Show help message

Please try these commands or contact support if you continue to have issues.`;
        
        return await ctx.replyWithMarkdown(fallbackMessage);
      }
      
      const firstName = ctx.from.first_name || 'User';
      
      if (!user.isApproved()) {
        if (user.isPending()) {
          const pendingMessage = `
👋 Hello ${firstName}!

🔒 *Access Request Pending*

Your access request is pending approval. Please wait for admin review.

*What you can do while waiting:*
• Use /request to check your request status
• Use /invite [code] to enter a referral code if you have one
• Contact support if you have questions

You'll be notified once your access is approved!`;
          
          return await ctx.replyWithMarkdown(pendingMessage);
        } else if (user.isDenied()) {
          const deniedMessage = `
❌ *Access Denied*

Your access request has been denied.

If you believe this is an error, please contact support.`;
          
          return await ctx.replyWithMarkdown(deniedMessage);
        }
      }
      
      const welcomeMessage = `
📱 *Welcome to Lodge Mobile Activations Bot!*

Hello ${firstName}! I'm here to help you schedule your Lodge Mobile activation appointments.

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel - Cancel an appointment
🎧 /support - Get support help
🎫 /ticket - View support tickets
📊 /supportstatus - Check ticket status
${ctx.from.id.toString() === this.ADMIN_ID ? '🔧 /admin - Admin commands (Lodge Mobile management)\n' : ''}ℹ️ /help - Show help message

Let's get started! Use /book to schedule your first appointment.
      `;
      
      await ctx.replyWithMarkdown(welcomeMessage);
    } catch (error) {
      console.error('Start command error:', error);
      console.error('Error details:', error.message, error.stack);
      
      const errorMessage = `
📱 *Welcome to Lodge Mobile Activations Bot!*

I encountered an issue during setup, but you can still use the bot.

*Available Commands:*
📅 /book - Book appointments
📋 /myappointments - View bookings
❌ /cancel - Cancel appointments
🎧 /support - Get help
ℹ️ /help - Show all commands

Please try these commands or contact support if issues persist.`;
      
      await ctx.replyWithMarkdown(errorMessage).catch(e => {
        ctx.reply('Welcome! Please try /help for available commands.');
      });
    }
  }

  async handleRequestAccess(ctx) {
    try {
      const args = ctx.message.text.split(' ');
      const forceResend = args[1]?.toLowerCase() === 'resend';

      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
      }

      if (user.isApproved()) {
        return await ctx.reply('You already have access to the bot. Use /book to schedule appointments.');
      }

      if (user.isPending()) {
        // Force resend notification to admin
        if (forceResend) {
          await this.notifyAdminNewRequest(user);
          return await ctx.replyWithMarkdown(
            `✅ *Request Re-sent!*\n\n` +
            `Your access request has been re-sent to the admin.\n\n` +
            `Please wait for approval. You'll be notified when approved.`
          );
        }

        const requestMessage = `
🕐 *Access Request Status: PENDING*

Your request is currently pending admin review.

*Request Details:*
• User ID: ${ctx.from.id}
• Username: @${ctx.from.username || 'N/A'}
• Name: ${ctx.from.first_name} ${ctx.from.last_name || ''}
• Requested: ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Recently'}

*What's next?*
• Wait for admin approval
• You'll be notified when approved
• Use /invite [code] if you have a referral code
• Use /request resend to re-send your request

Thank you for your patience!`;

        return await ctx.replyWithMarkdown(requestMessage);
      }

      if (user.isDenied()) {
        return await ctx.reply('Your access request has been denied. Please contact support if you believe this is an error.');
      }

    } catch (error) {
      console.error('Request command error:', error);
      await ctx.reply('Sorry, I couldn\'t process your request. Please try again.');
    }
  }

  async handleInviteCode(ctx) {
    try {
      const args = ctx.message.text.split(' ');
      
      if (args.length < 2) {
        return ctx.reply(
          'Please provide a referral code.\n\n' +
          'Format: /invite CODE\n' +
          'Example: /invite LODGE2024'
        );
      }
      
      const code = args[1].toUpperCase();
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
      }
      
      if (user.isApproved()) {
        return await ctx.reply('You already have access to the bot. Use /book to schedule appointments.');
      }
      
      try {
        await this.referralCodeService.useCode(code, ctx.from.id.toString());
        
        await user.approve(this.ADMIN_ID);
        
        const successMessage = `
✅ *Welcome! Access Granted*

Your referral code has been accepted and you now have full access to the bot!

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel - Cancel an appointment
🎧 /support - Get support help
ℹ️ /help - Show help message

Let's get started! Use /book to schedule your first appointment.`;
        
        await ctx.replyWithMarkdown(successMessage);
        
        await this.notifyAdminNewApproval(user, code);
        
      } catch (codeError) {
        console.error('Code validation error:', codeError);
        await ctx.reply(`❌ Invalid or expired referral code: ${code}\n\nPlease check your code and try again, or wait for admin approval.`);
      }
      
    } catch (error) {
      console.error('Invite command error:', error);
      await ctx.reply('Sorry, I couldn\'t process your referral code. Please try again.');
    }
  }

  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      
      console.log('Registering/retrieving user:', telegramUser.id, telegramUser.username);
      
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first()
        .catch(err => {
          console.error('Error querying user:', err.message);
          return null;
        });

      if (!user) {
        console.log('User not found, creating new user');
        
        try {
          user = await User.createTelegramUser(telegramUser, 'pending');
          console.log('User created successfully:', user.id);
        } catch (createError) {
          console.error('Failed to create user:', createError.message);
          
          const minimalUserData = {
            email: `${telegramUser.id}@telegram.user`,
            password_hash: await require('bcrypt').hash('telegram_user', 10),
            first_name: telegramUser.first_name || 'User',
            last_name: telegramUser.last_name || 'User',
            telegram_id: telegramUser.id.toString(),
            role: 'client',
            is_active: true
          };
          
          try {
            user = await User.query().insert(minimalUserData);
            console.log('Minimal user created:', user.id);
          } catch (minimalError) {
            console.error('Even minimal user creation failed:', minimalError.message);
            return {
              id: 0,
              telegram_id: telegramUser.id.toString(),
              first_name: telegramUser.first_name || 'User',
              last_name: telegramUser.last_name || 'User',
              email: `${telegramUser.id}@telegram.user`,
              role: 'client',
              approval_status: 'approved',
              isApproved: () => true,
              isPending: () => false,
              isDenied: () => false
            };
          }
        }
        
        if (telegramUser.id.toString() !== this.ADMIN_ID && this.referralCodeService) {
          try {
            await this.referralCodeService.addPendingRequest(telegramUser.id.toString(), {
              userId: telegramUser.id.toString(),
              username: telegramUser.username,
              firstName: telegramUser.first_name,
              lastName: telegramUser.last_name
            });
            
            await this.notifyAdminNewRequest(user);
          } catch (notifyError) {
            console.error('Failed to notify admin:', notifyError.message);
          }
        }
      } else {
        console.log('Existing user found:', user.id);
      }

      return user;
    } catch (error) {
      console.error('Error in registerUser:', error.message, error.stack);
      
      return {
        id: 0,
        telegram_id: ctx.from.id.toString(),
        first_name: ctx.from.first_name || 'User',
        last_name: ctx.from.last_name || 'User',
        email: `${ctx.from.id}@telegram.user`,
        role: 'client',
        approval_status: 'approved',
        isApproved: () => true,
        isPending: () => false,
        isDenied: () => false
      };
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

  async notifyAdminNewRequest(user) {
    try {
      const message = `
🔔 *New Access Request*

*User Details:*
• Name: ${user.first_name} ${user.last_name}
• Username: @${user.telegram_username || 'N/A'}
• User ID: \`${user.telegram_id}\`
• Registration: ${new Date(user.created_at).toLocaleString()}

*Quick Actions:*
• /approve ${user.telegram_id} - Approve user
• /deny ${user.telegram_id} - Deny user
• /requests - View all pending requests
      `;
      
      await this.bot.telegram.sendMessage(this.ADMIN_ID, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying admin about new request:', error);
    }
  }

  async notifyAdminNewApproval(user, referralCode) {
    try {
      const message = `
✅ *User Auto-Approved via Referral Code*

*User Details:*
• Name: ${user.first_name} ${user.last_name}
• Username: @${user.telegram_username || 'N/A'}
• User ID: \`${user.telegram_id}\`
• Referral Code: \`${referralCode}\`
• Approved: ${new Date().toLocaleString()}

User now has full access to the bot.
      `;
      
      await this.bot.telegram.sendMessage(this.ADMIN_ID, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying admin about new approval:', error);
    }
  }
}

module.exports = RegistrationCommand;