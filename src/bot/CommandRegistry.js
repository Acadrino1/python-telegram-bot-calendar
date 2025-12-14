class CommandRegistry {
  constructor(bot, services) {
    this.bot = bot;
    this.services = services;
    this.commands = new Map();
    this.featureFlags = services.featureFlags || {};
  }

  register(CommandClass) {
    const command = new CommandClass(this.bot, this.services);
    const name = command.getName();
    
    if (this.commands.has(name)) {
      console.warn(`Command ${name} is already registered. Overwriting.`);
    }
    
    this.commands.set(name, command);
    
    // Register the command with Telegraf
    if (name === 'start') {
      this.bot.start((ctx) => this.executeCommand(name, ctx));
    } else {
      this.bot.command(name, (ctx) => this.executeCommand(name, ctx));
    }
    
    console.log(`✅ Registered command: ${name}`);
    return this;
  }

  async executeCommand(name, ctx) {
    const command = this.commands.get(name);
    if (!command) {
      console.error(`Command ${name} not found`);
      return ctx.reply('Unknown command. Use /help for available commands.');
    }

    // Check feature flags
    if (this.featureFlags[`command_${name}`] === false) {
      return ctx.reply(`The ${name} command is currently disabled.`);
    }

    try {
      await command.execute(ctx);
    } catch (error) {
      console.error(`Error executing command ${name}:`, error);
      await ctx.reply('An error occurred while processing your command. Please try again.');
    }
  }

  getCommand(name) {
    return this.commands.get(name);
  }

  getAllCommands() {
    return Array.from(this.commands.values());
  }

  getCommandNames() {
    return Array.from(this.commands.keys());
  }

  generateHelpMessage(isAdmin = false) {
    const commands = this.getAllCommands();
    let helpMessage = '*📱 Lodge Mobile Activations Bot Help*\n\n*Commands:*\n';

    commands.forEach(command => {
      const name = command.getName();
      const description = command.getDescription();
      
      // Skip admin commands for non-admin users
      if (!isAdmin && (name === 'admin' || name.startsWith('admin_'))) {
        return;
      }
      
      // Check feature flags
      if (this.featureFlags[`command_${name}`] === false) {
        return;
      }
      
      helpMessage += `• /${name} - ${description}\n`;
    });

    helpMessage += `\n*Booking Process:*\n`;
    helpMessage += `1️⃣ Choose service category\n`;
    helpMessage += `2️⃣ Select specific service\n`;
    helpMessage += `3️⃣ Pick a date\n`;
    helpMessage += `4️⃣ Select available time\n`;
    helpMessage += `5️⃣ Confirm booking\n`;

    helpMessage += `\n*Need Support?*\n`;
    helpMessage += `• Use /support for interactive help and ticket creation\n`;
    helpMessage += `• Use /ticket to view your support tickets\n`;
    helpMessage += `• Use /supportstatus to check your ticket status`;

    return helpMessage;
  }

  // Enable/disable commands via feature flags
  enableCommand(name) {
    this.featureFlags[`command_${name}`] = true;
    console.log(`✅ Enabled command: ${name}`);
  }

  disableCommand(name) {
    this.featureFlags[`command_${name}`] = false;
    console.log(`❌ Disabled command: ${name}`);
  }

  isCommandEnabled(name) {
    return this.featureFlags[`command_${name}`] !== false;
  }

  // Register multiple commands at once
  registerCommands(commandClasses) {
    commandClasses.forEach(CommandClass => {
      this.register(CommandClass);
    });
    return this;
  }

  // Unregister a command (useful for hot reloading)
  unregister(name) {
    if (this.commands.has(name)) {
      this.commands.delete(name);
      console.log(`🗑️ Unregistered command: ${name}`);
    }
  }

  // Get command statistics
  getStats() {
    const total = this.commands.size;
    const enabled = this.getCommandNames().filter(name => this.isCommandEnabled(name)).length;
    const disabled = total - enabled;

    return {
      total,
      enabled,
      disabled,
      commands: this.getCommandNames()
    };
  }
}

module.exports = CommandRegistry;