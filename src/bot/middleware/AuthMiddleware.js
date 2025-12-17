const { Markup } = require('telegraf');
const User = require('../../models/User');

const COUNTRY_NAME_MAP = {
  CA: 'Canada',
  US: 'United States',
  GB: 'United Kingdom',
  AU: 'Australia',
  FR: 'France',
  DE: 'Germany',
  IN: 'India'
};

const PHONE_CODE_MAP = {
  '+1': 'Canada / United States',
  '+44': 'United Kingdom',
  '+61': 'Australia',
  '+81': 'Japan',
  '+91': 'India'
};

class AuthMiddleware {
  constructor(options = {}) {
    this.adminIds = options.adminIds || [];
    this.ADMIN_ID = options.ADMIN_ID || process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
    this.exemptCommands = options.exemptCommands || ['start', 'help', 'request', 'invite'];
    this.requireApproval = options.requireApproval !== false; // Default to true
  }

  // Main middleware function
  middleware() {
    return async (ctx, next) => {
      try {
        // Skip auth for certain update types
        if (!this.shouldCheckAuth(ctx)) {
          return next();
        }

        const userId = ctx.from?.id;
        if (!userId) {
          return next();
        }

        console.log(`Auth check for user ${userId}, isAdmin: ${this.isAdmin(userId)}`);

        // Get or create user
        const user = await this.getOrRegisterUser(ctx);
        if (!user) {
          // Only send auth failure to private chats, never groups
          if (ctx.chat?.type === 'private') {
            return ctx.reply('Authentication failed. Please try /start to register.');
          }
          return; // Silently ignore in groups
        }

        // Attach user to context for other handlers
        ctx.user = user;

        console.log(`User loaded: role=${user.role}, approval_status=${user.approval_status}, isApproved=${user.isApproved()}`);

        // Check if command requires approval
        if (this.requiresApproval(ctx)) {
          console.log(`Command requires approval, checking user.isApproved()...`);
          if (!user.isApproved()) {
            return this.handleUnapprovedUser(ctx, user);
          }
        }

        // Check admin permissions
        if (this.requiresAdmin(ctx)) {
          if (!this.isAdmin(userId)) {
            // Only reply in private chats
            if (ctx.chat?.type === 'private') {
              return ctx.reply('❌ This command requires administrator privileges.');
            }
            return;
          }
        }

        // User is authenticated and authorized
        return next();
      } catch (error) {
        console.error('Auth middleware error:', error);
        // Only reply in private chats, never groups
        if (ctx.chat?.type === 'private') {
          await ctx.reply('Authentication error occurred. Please try again.');
        }
      }
    };
  }

  shouldCheckAuth(ctx) {
    // Skip auth for callback queries, inline queries, etc. that don't have from field
    if (!ctx.from) return false;

    // Skip auth for non-user updates (channel posts, etc.)
    if (ctx.updateType === 'channel_post') return false;

    return true;
  }

  async getOrRegisterUser(ctx) {
    try {
      const telegramId = ctx.from.id.toString();

      // Try to find existing user
      let user = await User.query()
        .where('telegram_id', telegramId)
        .first()
        .catch(() => null);

      // If user exists but is pending and using /start, re-notify admin (handles DB resets)
      const isStartCommand = ctx.message?.text?.startsWith('/start');
      if (user && user.approval_status === 'pending' && isStartCommand) {
        console.log(`Existing pending user ${telegramId} - re-notifying admin`);
        await this.notifyAdminOfNewRequest(ctx, user);
      }

      if (!user) {
        // Check if user has a username before allowing registration
        if (!ctx.from.username) {
          // Only send to private chats
          if (ctx.chat?.type === 'private') {
            await ctx.replyWithMarkdown(
              `⚠️ *Username Required*\n\n` +
              `To use this bot, you must have a Telegram username set.\n\n` +
              `*How to set your username:*\n` +
              `1. Go to Telegram Settings\n` +
              `2. Tap on your profile\n` +
              `3. Set a username\n` +
              `4. Return here and tap /start\n\n` +
              `_A username helps us identify and serve you better._`
            );
          }
          return null;
        }

        // Block users with Chinese or Russian characters in name
        const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`;
        const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(fullName);
        const hasRussian = /[\u0400-\u04ff]/.test(fullName);

        if (hasChinese || hasRussian) {
          console.log(`Blocked user ${telegramId}: non-Latin characters in name`);
          // Only send to private chats
          if (ctx.chat?.type === 'private') {
            await ctx.replyWithMarkdown(
              `🚫 *Registration Unavailable*\n\n` +
              `This service is not available in your region.\n\n` +
              `_We apologize for any inconvenience._`
            );
          }
          return null;
        }

        // Geo-restriction removed - admin manually approves/denies users
        // Locale info is still collected for admin notification

        // Auto-register user with pending status
        console.log(`Auto-registering new user: ${telegramId}`);
        user = await this.registerUser(ctx);
      }

      return user;
    } catch (error) {
      console.error('Error getting/registering user:', error);
      return null;
    }
  }

  async registerUser(ctx) {
    let status = 'pending';
    try {
      const telegramUser = ctx.from;
      
      // Determine initial status
      if (telegramUser.id.toString() === this.ADMIN_ID) {
        status = 'approved'; // Auto-approve admin
      }

      const user = await User.createTelegramUser(telegramUser, status);
      console.log(`User registered with status: ${status}`);
      
      if (status === 'pending') {
        await this.notifyAdminOfNewRequest(ctx, user);
      }
      
      return user;
    } catch (error) {
      console.error('Error registering user:', error);
      
      // Create minimal user as fallback
      const minimalUserData = {
        email: `${ctx.from.id}@telegram.user`,
        password_hash: await require('bcrypt').hash('telegram_user', 10),
        first_name: ctx.from.first_name || 'User',
        last_name: ctx.from.last_name || 'User',
        telegram_id: ctx.from.id.toString(),
        role: 'client',
        is_active: true,
        approval_status: status,
        preferences: JSON.stringify({ approval_status: status })
      };
      
      try {
        const fallbackUser = await User.query().insert(minimalUserData);
        if (minimalUserData.approval_status === 'pending') {
          await this.notifyAdminOfNewRequest(ctx, fallbackUser);
        }
        return fallbackUser;
      } catch (fallbackError) {
        console.error('Fallback user creation failed:', fallbackError);
        return null;
      }
    }
  }

  requiresApproval(ctx) {
    if (!this.requireApproval) return false;

    // Exempt commands don't require approval
    const command = this.extractCommand(ctx);
    if (this.exemptCommands.includes(command)) {
      return false;
    }

    // Admin is always approved
    if (this.isAdmin(ctx.from.id)) {
      return false;
    }

    return true;
  }

  requiresAdmin(ctx) {
    const command = this.extractCommand(ctx);
    
    // Commands that require admin privileges
    const adminCommands = [
      'admin', 'tickets', 'closeticket', 'assignticket', 'supportstats',
      'setgroup', 'testnotify', 'dailysummary', 'businesshours',
      'requests', 'approve', 'deny', 'createcode', 'codes'
    ];

    return adminCommands.includes(command);
  }

  extractCommand(ctx) {
    if (ctx.updateType === 'message' && ctx.message?.text?.startsWith('/')) {
      return ctx.message.text.split(' ')[0].substring(1).toLowerCase();
    }
    return null;
  }

  isAdmin(telegramId) {
    if (!telegramId) return false;
    return this.adminIds.includes(telegramId.toString()) || telegramId.toString() === this.ADMIN_ID;
  }

  async handleUnapprovedUser(ctx, user) {
    const command = this.extractCommand(ctx);

    if (user.isPending()) {
      const message = `
🔒 *Access Pending*

Your access request is pending admin approval.

*Available Commands:*
• /request - Check request status
• /invite [code] - Use referral code
• /help - Show help

You'll be notified when approved!`;

      // Send to user's DM only, never to groups
      return ctx.telegram.sendMessage(ctx.from.id, message, { parse_mode: 'Markdown' });
    }

    if (user.isDenied()) {
      // Send to user's DM only, never to groups
      return ctx.telegram.sendMessage(
        ctx.from.id,
        '❌ *Access Denied*\n\n' +
        'Your access request has been denied.\n\n' +
        'If you believe this is an error, please contact support.',
        { parse_mode: 'Markdown' }
      );
    }
    
    // Default case - send to user's DM only
    return ctx.telegram.sendMessage(ctx.from.id, 'Your account requires approval. Please wait for admin review.');
  }

  // Static method to create middleware instance
  static create(options = {}) {
    return new AuthMiddleware(options).middleware();
  }

  // Utility methods for manual auth checks
  static async checkUserApproval(userId) {
    try {
      const user = await User.query()
        .where('telegram_id', userId.toString())
        .first();
      
      return user?.isApproved() || false;
    } catch (error) {
      console.error('Error checking user approval:', error);
      return false;
    }
  }

  static isAdminUser(userId, adminIds = [], ADMIN_ID = null) {
    if (!userId) return false;
    const userIdStr = userId.toString();
    return adminIds.includes(userIdStr) || userIdStr === ADMIN_ID;
  }

  async notifyAdminOfNewRequest(ctx, user) {
    try {
      if (!ctx?.telegram || !user) return;
      if (user.approval_status && user.approval_status !== 'pending') return;

      const recipients = this.getAdminRecipients();
      if (recipients.length === 0) return;

      const message = this.buildAdminNotificationMessage(ctx, user);
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`✅ Approve ${user.telegram_id}`, `approve_${user.telegram_id}`)],
        [Markup.button.callback(`❌ Deny ${user.telegram_id}`, `deny_${user.telegram_id}`)],
        [Markup.button.callback('📋 View Pending', 'admin_pending_list')]
      ]);

      await Promise.all(recipients.map(async (adminId) => {
        try {
          await ctx.telegram.sendMessage(adminId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
          });
        } catch (notifyError) {
          console.error(`Error notifying admin ${adminId} about new request:`, notifyError.message);
        }
      }));
    } catch (error) {
      console.error('Failed to notify admins about new request:', error);
    }
  }

  buildAdminNotificationMessage(ctx, user) {
    const telegramUser = ctx.from || {};
    const localeInfo = this.parseLocaleInfo(telegramUser.language_code);
    const phoneInfo = this.extractPhoneDetails(ctx, user);
    const timestamp = this.formatTimestamp(user.created_at ? new Date(user.created_at) : new Date());
    const usernameDisplay = user.telegram_username ? `@${user.telegram_username}` : 'N/A';
    const isLikelyCanadian = localeInfo.countryIso === 'CA' || phoneInfo.countryCode === '+1';
    const regionStatus = isLikelyCanadian ? '✅ Matches Canadian metadata' : '⚠️ Needs manual verification';

    const lines = [
      '🚦 *New Access Request (Pending Approval)*',
      '',
      `*Name:* ${this.escapeMarkdown(`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown')}`,
      `*Username:* ${this.escapeMarkdown(usernameDisplay)}`,
      `*User ID:* ${this.escapeMarkdown(user.telegram_id || 'Unknown')}`,
      `*Locale:* ${this.escapeMarkdown(localeInfo.languageDisplay)}`,
      `*Locale Country:* ${this.escapeMarkdown(localeInfo.countryName)}`,
      `*Phone:* ${this.escapeMarkdown(phoneInfo.raw)}`,
      `*Phone Country Code:* ${this.escapeMarkdown(`${phoneInfo.countryCode} ${phoneInfo.countryName ? `(${phoneInfo.countryName})` : ''}`.trim())}`,
      `*Area Code:* ${this.escapeMarkdown(phoneInfo.areaCode)}`,
      `*Request Time:* ${this.escapeMarkdown(timestamp)}`,
      `*Canada Match:* ${regionStatus}`,
      '',
      '_Use the buttons below to approve or deny this request._'
    ];

    return lines.join('\n');
  }

  parseLocaleInfo(languageCode) {
    if (!languageCode) {
      return {
        languageDisplay: 'Unknown',
        countryIso: 'Unknown',
        countryName: 'Unknown'
      };
    }

    const normalized = languageCode.toLowerCase();
    const [language, region] = normalized.split('-');
    const languageDisplay = region ? `${language.toUpperCase()}-${region.toUpperCase()}` : language.toUpperCase();
    const countryIso = region ? region.toUpperCase() : 'Unknown';
    const countryName = COUNTRY_NAME_MAP[countryIso] || (countryIso !== 'Unknown' ? countryIso : 'Unknown');

    return { languageDisplay, countryIso, countryName };
  }

  extractPhoneDetails(ctx, user) {
    const contactPhone = ctx?.message?.contact?.phone_number || ctx?.update?.message?.contact?.phone_number;
    const rawPhone = contactPhone || user?.phone || '';

    if (!rawPhone) {
      return {
        raw: 'Not provided',
        countryCode: 'Unknown',
        countryName: 'Unknown',
        areaCode: 'Unknown'
      };
    }

    const normalized = rawPhone.replace(/[^\d+]/g, '');
    const match = normalized.match(/^\+?(\d{1,3})/);
    let countryCode = 'Unknown';
    let remaining = normalized;
    if (match) {
      countryCode = `+${match[1]}`;
      remaining = normalized.replace(/^\+?(\d{1,3})/, '');
    }

    let areaCode = 'Unknown';
    if (remaining.length >= 3) {
      areaCode = remaining.substring(0, 3);
    }

    return {
      raw: rawPhone.startsWith('+') ? rawPhone : normalized || rawPhone,
      countryCode,
      countryName: PHONE_CODE_MAP[countryCode] || (countryCode !== 'Unknown' ? `Code ${countryCode}` : 'Unknown'),
      areaCode
    };
  }

  formatTimestamp(date) {
    const timezone = process.env.BOT_TIMEZONE || process.env.DEFAULT_TIMEZONE || 'America/Toronto';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone
      }).format(date);
    } catch (error) {
      return date.toISOString();
    }
  }

  getAdminRecipients() {
    const recipients = new Set();
    if (this.ADMIN_ID) {
      recipients.add(this.ADMIN_ID.toString());
    }

    if (Array.isArray(this.adminIds)) {
      this.adminIds.forEach((id) => {
        if (id) {
          recipients.add(id.toString());
        }
      });
    }

    return Array.from(recipients);
  }

  escapeMarkdown(value = '') {
    if (!value) return value || '';
    return value
      .replace(/\\/g, '\\\\')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/`/g, '\\`')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }
}

module.exports = AuthMiddleware;
