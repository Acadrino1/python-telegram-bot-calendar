class MessageHandler {
  constructor(bot, services) {
    this.bot = bot;
    this.services = services;
    this.commandRegistry = services.commandRegistry;
  }

  /**
   * Check if message is in a private chat (DM with bot)
   */
  isPrivateChat(ctx) {
    return ctx.chat?.type === 'private';
  }

  /**
   * Check if bot was mentioned in a group message
   */
  isBotMentioned(ctx) {
    const botUsername = ctx.botInfo?.username;
    if (!botUsername) return false;
    const text = ctx.message?.text || ctx.message?.caption || '';
    return text.includes(`@${botUsername}`);
  }

  /**
   * Check if bot should respond to this message
   * Only responds in private chats or when explicitly mentioned
   */
  shouldRespond(ctx) {
    return this.isPrivateChat(ctx) || this.isBotMentioned(ctx);
  }

  setupHandlers() {
    // Handle text messages that aren't commands
    this.bot.on('text', async (ctx, next) => {
      // If message starts with '/', let command handler deal with it
      if (ctx.message.text.startsWith('/')) {
        return next();
      }

      // Only process non-command text in private chats during active flows
      if (!this.isPrivateChat(ctx)) {
        return; // Ignore all non-command messages in groups/channels
      }

      // Check if user is entering a coupon code
      if (ctx.session?.pendingCouponPaymentId) {
        const paymentHandler = this.services?.paymentHandler;
        if (paymentHandler && typeof paymentHandler.processCouponCode === 'function') {
          const handled = await paymentHandler.processCouponCode(ctx, ctx.message.text);
          if (handled) return;
        }
      }

      // Check if admin is creating/broadcasting coupon
      if (ctx.session?.creatingCoupon || ctx.session?.broadcastingCoupon) {
        const adminHandler = this.services?.adminHandler;
        if (adminHandler && typeof adminHandler.processCouponAmount === 'function') {
          const handled = await adminHandler.processCouponAmount(ctx, ctx.message.text);
          if (handled) return;
        }
      }

      // Check if admin is editing a setting value
      if (ctx.session?.editingSetting) {
        const adminHandler = this.services?.adminHandler;
        if (adminHandler && typeof adminHandler.handleSettingValueInput === 'function') {
          const handled = await adminHandler.handleSettingValueInput(ctx);
          if (handled) return;
        }
      }

      // Check if user is in support ticket creation flow OR has a pending reply
      const callbackHandler = this.services?.callbackHandler;
      if (callbackHandler && typeof callbackHandler.handleSupportInput === 'function') {
        const handled = await callbackHandler.handleSupportInput(ctx);
        if (handled) return;
      }

      // Check if user is entering a coupon code
      const bookingHandler = this.services?.bookingHandler;
      if (bookingHandler && bookingHandler.isAwaitingCouponCode && bookingHandler.isAwaitingCouponCode(ctx)) {
        const handled = await bookingHandler.processCouponCode(ctx, ctx.message.text.trim());
        if (handled) return;
        return;
      }

      // Check if user is in active registration flow
      if (ctx.session?.registration?.step && ctx.session?.registration?.awaitingInput) {
        return next(); // Pass to registration form handler
      }

      // Also check if registration exists even if awaitingInput is not set
      if (ctx.session?.registration?.step) {
        return next(); // Pass to form handler
      }

      // No response to random text - users must use /commands
    });

    // Handle photo messages - only in private chats
    this.bot.on('photo', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handlePhotoMessage(ctx);
    });

    // Handle document messages - only in private chats
    this.bot.on('document', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handleDocumentMessage(ctx);
    });

    // Handle voice messages - only in private chats
    this.bot.on('voice', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handleVoiceMessage(ctx);
    });

    // Handle location messages - only in private chats
    this.bot.on('location', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handleLocationMessage(ctx);
    });

    // Handle contact messages - only in private chats
    this.bot.on('contact', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handleContactMessage(ctx);
    });

    // Handle sticker messages - ignore (no response needed)
    this.bot.on('sticker', () => {
      // Silent - no response to stickers
    });

    // Handle video messages - only in private chats
    this.bot.on('video', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handleVideoMessage(ctx);
    });

    // Handle audio messages - only in private chats
    this.bot.on('audio', (ctx) => {
      if (this.isPrivateChat(ctx)) this.handleAudioMessage(ctx);
    });

    // Handle new chat members
    this.bot.on('new_chat_members', (ctx) => this.handleNewChatMembers(ctx));

    // Handle left chat member
    this.bot.on('left_chat_member', (ctx) => this.handleLeftChatMember(ctx));

    // Handle group chat created
    this.bot.on('group_chat_created', (ctx) => this.handleGroupChatCreated(ctx));

    // Handle poll messages
    this.bot.on('poll', (ctx) => this.handlePollMessage(ctx));
  }


  async handlePhotoMessage(ctx) {
    try {
      // Check if admin is awaiting proof upload
      const completionHandler = this.services?.completionHandler;
      if (completionHandler && completionHandler.isAwaitingProof(ctx)) {
        const appointmentUuid = completionHandler.getAwaitingProofUuid(ctx);
        if (appointmentUuid && ctx.message.photo) {
          const photo = ctx.message.photo[ctx.message.photo.length - 1];
          await completionHandler.handleProofUpload(ctx, photo.file_id, appointmentUuid);
        }
      }
      // No response to random photos - users must use /commands
    } catch (error) {
      console.error('Error handling photo message:', error);
    }
  }

  async handleDocumentMessage(ctx) {
    try {
      // Check if we're in bulk upload mode
      if (ctx.session?.bulkUpload?.awaitingFile) {
        const bulkUploadHandler = this.services?.bulkUploadHandler;
        if (bulkUploadHandler && typeof bulkUploadHandler.handleDocumentUpload === 'function') {
          await bulkUploadHandler.handleDocumentUpload(ctx);
        }
      }
      // No response to random documents - users must use /commands
    } catch (error) {
      console.error('Error handling document message:', error);
    }
  }

  async handleVoiceMessage(ctx) {
    // Silent - no response to voice messages
  }

  async handleLocationMessage(ctx) {
    // Silent - no response to location shares
  }

  async handleContactMessage(ctx) {
    // Silent - no response to contact shares
  }

  async handleStickerMessage(ctx) {
    // Silent - no response to stickers
  }

  async handleVideoMessage(ctx) {
    // Silent - no response to videos
  }

  async handleAudioMessage(ctx) {
    // Silent - no response to audio files
  }

  async handleNewChatMembers(ctx) {
    try {
      const newMembers = ctx.message.new_chat_members;

      for (const member of newMembers) {
        if (member.is_bot && member.id === ctx.botInfo.id) {
          // Bot was added to group - notify admins only
          await ctx.reply(
            '🤖 Hello! I\'m the Lodge Scheduler Bot.\n\n' +
            'I help with appointment scheduling and support.\n\n' +
            'Admins can use /setgroup to set up notifications for this group.'
          );
        }
        // No welcome message for regular users joining - reduces spam
      }
    } catch (error) {
      console.error('Error handling new chat members:', error);
    }
  }

  async handleLeftChatMember(ctx) {
    // No action needed when users leave
  }

  async handleGroupChatCreated(ctx) {
    // No automatic message - reduces spam
  }

  async handlePollMessage(ctx) {
    // No automatic response to polls - reduces spam
    try {
      // Silent - no action needed
    } catch (error) {
      console.error('Error handling poll message:', error);
    }
  }

}


module.exports = MessageHandler;