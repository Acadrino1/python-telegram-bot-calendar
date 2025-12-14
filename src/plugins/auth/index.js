const BasePlugin = require('../../core/BasePlugin');
const User = require('../../models/User');
const ReferralCodeService = require('../../services/ReferralCodeService');

/**
 * Authentication Plugin - Handles user registration, approval, and access control
 */
class AuthPlugin extends BasePlugin {
  get name() {
    return 'auth';
  }

  get version() {
    return '1.0.0';
  }

  get description() {
    return 'User authentication and authorization system';
  }

  get dependencies() {
    return [];
  }

  get priority() {
    return 1; // High priority - loaded first
  }

  async onInitialize() {
    // Initialize referral code service
    this.referralCodeService = new ReferralCodeService();
    
    // Admin configuration
    this.adminIds = process.env.ADMIN_USER_IDS ?
      process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : [];
    this.ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID;

    // Define commands
    this.commands = [
      {
        name: 'start',
        handler: this.handleStartCommand.bind(this),
        description: 'Start the bot and register user'
      },
      {
        name: 'request',
        handler: this.handleRequestCommand.bind(this),
        description: 'Check access request status'
      },
      {
        name: 'invite',
        handler: this.handleInviteCommand.bind(this),
        description: 'Use referral code for instant access'
      }
    ];

    // Define middleware
    this.middleware = [
      this.authMiddleware.bind(this)
    ];
  }

  async authMiddleware(ctx, next) {
    // Add user context to all requests
    if (ctx.from) {
      ctx.user = await this.getUser(ctx.from.id);
    }
    
    await next();
  }

  async handleStartCommand(ctx) {
    try {
      this.logger.info('Start command invoked', {
        userId: ctx.from.id,
        username: ctx.from.username
      });
      
      // Register or get existing user
      const user = await this.registerUser(ctx);
      
      if (!user) {
        this.logger.error('Failed to register/retrieve user');
        return await ctx.replyWithMarkdown(this.getFallbackWelcomeMessage());
      }
      
      const firstName = ctx.from.first_name || 'User';
      
      // Check approval status and respond accordingly
      if (!this.isUserApproved(user)) {
        if (user.isPending()) {
          return await ctx.replyWithMarkdown(this.getPendingApprovalMessage(firstName, user));
        } else if (user.isDenied()) {
          return await ctx.replyWithMarkdown(this.getDeniedAccessMessage());
        }
      }
      
      // User is approved - show welcome message
      await ctx.replyWithMarkdown(this.getWelcomeMessage(firstName, ctx.from.id));
      
    } catch (error) {
      this.logger.error('Start command error:', error);
      await ctx.replyWithMarkdown(this.getFallbackWelcomeMessage());
    }
  }

  async handleRequestCommand(ctx) {
    try {
      let user = await this.getUser(ctx.from.id);
      if (!user) {
        user = await this.registerUser(ctx);
      }
      
      if (this.isUserApproved(user)) {
        return await ctx.reply('You already have access to the bot. Use /book to schedule appointments.');
      }
      
      if (user.isPending()) {
        return await ctx.replyWithMarkdown(this.getRequestStatusMessage(ctx.from, user));
      }
      
      if (user.isDenied()) {
        return await ctx.reply('Your access request has been denied. Please contact support if you believe this is an error.');
      }
      
    } catch (error) {
      this.logger.error('Request command error:', error);
      await ctx.reply('Sorry, I couldn\'t process your request. Please try again.');
    }
  }

  async handleInviteCommand(ctx) {
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
      
      if (this.isUserApproved(user)) {
        return await ctx.reply('You already have access to the bot. Use /book to schedule appointments.');
      }
      
      // Validate and use the code
      try {
        await this.referralCodeService.useCode(code, ctx.from.id.toString());
        
        // Approve the user
        await user.approve(this.ADMIN_ID);
        
        await ctx.replyWithMarkdown(this.getApprovalSuccessMessage());
        
        // Emit approval event
        this.eventBus.emit('auth:user-approved', {
          user: user,
          method: 'referral_code',
          code: code
        });
        
      } catch (codeError) {
        this.logger.error('Code validation error:', codeError);
        await ctx.reply(`❌ Invalid or expired referral code: ${code}\n\nPlease check your code and try again, or wait for admin approval.`);
      }
      
    } catch (error) {
      this.logger.error('Invite command error:', error);
      await ctx.reply('Sorry, I couldn\'t process your referral code. Please try again.');
    }
  }

  async registerUser(ctx) {
    try {
      const telegramUser = ctx.from;
      
      this.logger.info('Registering/retrieving user', {
        userId: telegramUser.id,
        username: telegramUser.username
      });
      
      // Try to find existing user
      let user = await User.query()
        .where('telegram_id', telegramUser.id.toString())
        .first()
        .catch(err => {
          this.logger.error('Error querying user:', err);
          return null;
        });

      if (!user) {
        this.logger.info('User not found, creating new user');
        
        try {
          // Create user with pending approval status (unless admin)
          const approvalStatus = telegramUser.id.toString() === this.ADMIN_ID ? 'approved' : 'pending';
          user = await User.createTelegramUser(telegramUser, approvalStatus);
          this.logger.info('User created successfully:', { userId: user.id });
          
          // Emit registration event
          this.eventBus.emit('auth:user-registered', {
            user: user,
            isNewUser: true
          });
          
        } catch (createError) {
          this.logger.error('Failed to create user:', createError);
          return this.createMockUser(telegramUser);
        }
        
        // Notify admin about new request (if not admin)
        if (telegramUser.id.toString() !== this.ADMIN_ID) {
          await this.notifyAdminNewRequest(user);
        }
      } else {
        this.logger.info('Existing user found:', { userId: user.id });
        
        // Emit login event
        this.eventBus.emit('auth:user-login', {
          user: user,
          isNewUser: false
        });
      }

      return user;
      
    } catch (error) {
      this.logger.error('Error in registerUser:', error);
      return this.createMockUser(ctx.from);
    }
  }

  createMockUser(telegramUser) {
    // Fallback user object for graceful degradation
    // SECURITY: Default to pending, NOT approved
    return {
      id: 0,
      telegram_id: telegramUser.id.toString(),
      first_name: telegramUser.first_name || 'User',
      last_name: telegramUser.last_name || 'User',
      email: `${telegramUser.id}@telegram.user`,
      role: 'client',
      approval_status: 'pending',
      isApproved: () => false,
      isPending: () => true,
      isDenied: () => false
    };
  }

  async getUser(telegramId) {
    try {
      return await User.query()
        .where('telegram_id', telegramId.toString())
        .first();
    } catch (error) {
      this.logger.error('Error getting user:', error);
      return null;
    }
  }

  isUserApproved(user) {
    if (!user) return false;
    return user.isApproved ? user.isApproved() : user.approval_status === 'approved';
  }

  isAdmin(telegramId) {
    if (!telegramId) return false;
    return this.adminIds.includes(telegramId.toString()) || telegramId.toString() === this.ADMIN_ID;
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
      this.logger.error('Error notifying admin about new request:', error);
    }
  }

  // Message templates
  getFallbackWelcomeMessage() {
    return `
📱 *Welcome to Lodge Mobile Activations Bot!*

I'm experiencing a temporary issue with user registration.

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments  
❌ /cancel - Cancel an appointment
🎧 /support - Get support help
ℹ️ /help - Show help message

Please try these commands or contact support if you continue to have issues.`;
  }

  getPendingApprovalMessage(firstName, user) {
    return `
👋 Hello ${firstName}!

🔒 *Access Request Pending*

Your access request is pending approval. Please wait for admin review.

*What you can do while waiting:*
• Use /request to check your request status
• Use /invite [code] to enter a referral code if you have one
• Contact support if you have questions

You'll be notified once your access is approved!`;
  }

  getDeniedAccessMessage() {
    return `
❌ *Access Denied*

Your access request has been denied.

If you believe this is an error, please contact support.`;
  }

  getWelcomeMessage(firstName, userId) {
    const adminCommands = this.isAdmin(userId) ? '🔧 /admin - Admin commands (Lodge Mobile management)\n' : '';
    
    return `
📱 *Welcome to Lodge Mobile Activations Bot!*

Hello ${firstName}! I'm here to help you schedule your Lodge Mobile activation appointments.

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel - Cancel an appointment
🎧 /support - Get support help
🎫 /ticket - View support tickets
📊 /supportstatus - Check ticket status
${adminCommands}ℹ️ /help - Show help message

Let's get started! Use /book to schedule your first appointment.`;
  }

  getRequestStatusMessage(from, user) {
    return `
🕐 *Access Request Status: PENDING*

Your request is currently pending admin review.

*Request Details:*
• User ID: ${from.id}
• Username: @${from.username || 'N/A'}
• Name: ${from.first_name} ${from.last_name || ''}
• Requested: ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Recently'}

*What's next?*
• Wait for admin approval
• You'll be notified when approved
• Use /invite [code] if you have a referral code

Thank you for your patience!`;
  }

  getApprovalSuccessMessage() {
    return `
✅ *Welcome! Access Granted*

Your referral code has been accepted and you now have full access to the bot!

*Available Commands:*
📅 /book - Book a new appointment
📋 /myappointments - View your appointments
❌ /cancel - Cancel an appointment
🎧 /support - Get support help
ℹ️ /help - Show help message

Let's get started! Use /book to schedule your first appointment.`;
  }

  async onHealthCheck() {
    try {
      // Test database connection by querying a user
      await User.query().limit(1);
      
      // Test referral code service
      if (this.referralCodeService) {
        const codes = await this.referralCodeService.getAllCodes();
        return codes !== null;
      }
      
      return true;
    } catch (error) {
      this.logger.error('Auth plugin health check failed:', error);
      return false;
    }
  }

  getMetrics() {
    const baseMetrics = super.getMetrics();
    
    return {
      ...baseMetrics,
      authSpecific: {
        adminIds: this.adminIds.length,
        referralServiceAvailable: !!this.referralCodeService
      }
    };
  }
}

module.exports = AuthPlugin;