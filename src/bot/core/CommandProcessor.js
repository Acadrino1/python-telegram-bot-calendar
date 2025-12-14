/**
 * Command Processor Framework
 * 100% compliant with Telegram Global Rule 8
 * Features: Comprehensive validation, permission checking, argument parsing
 */

const CommandValidator = require('../utils/CommandValidator');

class CommandProcessor {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.validator = new CommandValidator();
    this.commands = new Map();
    this.middleware = [];
    this.options = {
      enableHelp: true,
      enableStats: true,
      defaultPermissions: [],
      rateLimitEnabled: true,
      ...options
    };
    
    // Command execution statistics
    this.stats = {
      totalExecuted: 0,
      successful: 0,
      failed: 0,
      validationErrors: 0,
      permissionErrors: 0,
      rateLimitHits: 0
    };
    
    // Setup built-in commands if enabled
    if (this.options.enableHelp) {
      this.registerBuiltInCommands();
    }
  }

  /**
   * Register a command with comprehensive schema
   * @param {string} name - Command name
   * @param {Object} config - Command configuration
   */
  registerCommand(name, config) {
    const schema = {
      name,
      description: config.description || `Execute ${name} command`,
      handler: config.handler,
      args: config.args || [],
      permissions: config.permissions || this.options.defaultPermissions,
      rateLimit: config.rateLimit || null,
      enabled: config.enabled !== false,
      hidden: config.hidden || false,
      aliases: config.aliases || [],
      examples: config.examples || [],
      category: config.category || 'general',
      validation: config.validation || {},
      middleware: config.middleware || [],
      acknowledgment: config.acknowledgment,
      timeout: config.timeout || 30000,
      ...config
    };

    // Register with validator
    this.validator.registerCommand(name, schema);
    
    // Store command
    this.commands.set(name, schema);
    
    // Register aliases
    if (schema.aliases.length > 0) {
      schema.aliases.forEach(alias => {
        this.commands.set(alias, { ...schema, isAlias: true, aliasFor: name });
      });
    }

    console.log(`Registered command: ${name}${schema.aliases.length ? ` (aliases: ${schema.aliases.join(', ')})` : ''}`);
  }

  /**
   * Process incoming command
   * @param {Object} ctx - Telegram context
   * @param {string} commandText - Full command text
   */
  async processCommand(ctx, commandText = null) {
    const startTime = Date.now();
    this.stats.totalExecuted++;

    try {
      // Extract command from context or parameter
      const { commandName, args, fullText } = this.parseCommand(ctx, commandText);
      
      if (!commandName) {
        return;
      }

      // Get command schema
      const command = this.getCommand(commandName);
      if (!command) {
        await this.handleUnknownCommand(ctx, commandName);
        return;
      }

      // Check if command is enabled
      if (!command.enabled) {
        await ctx.reply(`❌ The command /${commandName} is currently disabled.`);
        return;
      }

      // Send acknowledgment if configured
      if (command.acknowledgment) {
        const ackMessage = typeof command.acknowledgment === 'string' 
          ? command.acknowledgment
          : this.validator.generateAcknowledgment(commandName, args);
        await ctx.reply(ackMessage);
      }

      // Validate command
      const validation = await this.validator.validateCommand(ctx, commandName);
      if (!validation.valid) {
        this.stats.validationErrors++;
        
        if (validation.help) {
          await ctx.reply(validation.help, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`❌ ${validation.errors.join('\n')}`);
        }
        return;
      }

      // Run middleware
      const middlewareResult = await this.runMiddleware(ctx, command, args);
      if (!middlewareResult.continue) {
        if (middlewareResult.error) {
          await ctx.reply(middlewareResult.error);
        }
        return;
      }

      // Execute command with timeout protection
      await this.executeCommand(ctx, command, validation.args, startTime);
      
      this.stats.successful++;

    } catch (error) {
      this.stats.failed++;
      await this.handleCommandError(ctx, error, commandText);
    }
  }

  /**
   * Parse command from context or text
   * @param {Object} ctx - Telegram context
   * @param {string} commandText - Command text override
   */
  parseCommand(ctx, commandText = null) {
    let text = commandText || ctx.message?.text || '';
    
    if (!text.startsWith('/')) {
      return { commandName: null };
    }

    // Remove leading slash and split
    const parts = text.substring(1).split(' ');
    const commandPart = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Handle bot username in command (e.g., /start@botname)
    const commandName = commandPart.split('@')[0];

    return {
      commandName,
      args,
      fullText: text,
      rawArgs: text.substring(commandName.length + 1).trim()
    };
  }

  /**
   * Get command by name (handling aliases)
   * @param {string} name - Command name
   */
  getCommand(name) {
    const command = this.commands.get(name);
    if (!command) {
      return null;
    }

    // If it's an alias, get the original command
    if (command.isAlias) {
      return this.commands.get(command.aliasFor);
    }

    return command;
  }

  /**
   * Run middleware for command
   * @param {Object} ctx - Telegram context
   * @param {Object} command - Command schema
   * @param {Object} args - Parsed arguments
   */
  async runMiddleware(ctx, command, args) {
    const middlewareChain = [...this.middleware, ...command.middleware];
    
    for (const middleware of middlewareChain) {
      try {
        const result = await middleware(ctx, command, args);
        
        if (result === false || (result && result.continue === false)) {
          return {
            continue: false,
            error: result?.error || result?.message
          };
        }
      } catch (error) {
        console.error('Middleware error:', error);
        return {
          continue: false,
          error: 'An error occurred processing your request.'
        };
      }
    }

    return { continue: true };
  }

  /**
   * Execute command with timeout and error handling
   * @param {Object} ctx - Telegram context
   * @param {Object} command - Command schema
   * @param {Object} args - Validated arguments
   * @param {number} startTime - Execution start time
   */
  async executeCommand(ctx, command, args, startTime) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Command ${command.name} timed out after ${command.timeout}ms`));
      }, command.timeout);
    });

    try {
      // Execute with timeout protection
      await Promise.race([
        command.handler(ctx, args, {
          commandName: command.name,
          processingTime: Date.now() - startTime,
          originalCommand: command
        }),
        timeoutPromise
      ]);

      // Log successful execution
      const executionTime = Date.now() - startTime;
      if (executionTime > 5000) {
        console.warn(`Slow command execution: ${command.name} took ${executionTime}ms`);
      }

    } catch (error) {
      if (error.message.includes('timed out')) {
        await ctx.reply(
          `⏱️ The command /${command.name} is taking longer than expected. ` +
          `Please wait or try again later.`
        );
      }
      throw error;
    }
  }

  /**
   * Handle unknown command
   * @param {Object} ctx - Telegram context
   * @param {string} commandName - Unknown command name
   */
  async handleUnknownCommand(ctx, commandName) {
    // Try to find similar commands
    const suggestions = this.findSimilarCommands(commandName);
    
    let message = `❓ Unknown command: /${commandName}\n\n`;
    
    if (suggestions.length > 0) {
      message += `Did you mean:\n`;
      suggestions.slice(0, 3).forEach(suggestion => {
        message += `• /${suggestion}\n`;
      });
      message += '\n';
    }
    
    message += `Use /help to see all available commands.`;
    
    await ctx.reply(message);
  }

  /**
   * Find similar commands using simple string similarity
   * @param {string} commandName - Command to find matches for
   */
  findSimilarCommands(commandName) {
    const availableCommands = Array.from(this.commands.keys())
      .filter(name => {
        const command = this.commands.get(name);
        return command && !command.hidden && !command.isAlias;
      });

    return availableCommands
      .map(name => ({
        name,
        similarity: this.calculateSimilarity(commandName, name)
      }))
      .filter(item => item.similarity > 0.4)
      .sort((a, b) => b.similarity - a.similarity)
      .map(item => item.name);
  }

  /**
   * Calculate string similarity (simple Levenshtein-based)
   * @param {string} a - First string
   * @param {string} b - Second string
   */
  calculateSimilarity(a, b) {
    if (a === b) return 1.0;
    
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    
    return (maxLength - this.levenshteinDistance(a, b)) / maxLength;
  }

  /**
   * Calculate Levenshtein distance
   * @param {string} a - First string
   * @param {string} b - Second string
   */
  levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => 
      Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Handle command execution errors
   * @param {Object} ctx - Telegram context
   * @param {Error} error - Error object
   * @param {string} commandText - Original command text
   */
  async handleCommandError(ctx, error, commandText) {
    console.error('Command execution error:', error);
    
    // Determine appropriate user message based on error type
    let userMessage;
    
    if (error.message.includes('permission')) {
      userMessage = '🚫 You don\'t have permission to use this command.';
    } else if (error.message.includes('rate limit')) {
      userMessage = '⏰ Please wait before using this command again.';
    } else if (error.message.includes('timeout')) {
      userMessage = '⏱️ The command took too long to execute. Please try again.';
    } else if (error.message.includes('validation')) {
      userMessage = '❌ Invalid command format. Use /help for proper usage.';
    } else {
      userMessage = '❌ An error occurred executing the command. Please try again.';
    }
    
    try {
      await ctx.reply(userMessage);
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }

  /**
   * Register built-in commands
   */
  registerBuiltInCommands() {
    // Help command
    this.registerCommand('help', {
      description: 'Show available commands',
      handler: async (ctx, args) => {
        const category = args.category || 'all';
        const helpMessage = this.generateHelpMessage(ctx, category);
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
      },
      args: [{
        name: 'category',
        required: false,
        description: 'Command category to show'
      }],
      examples: ['/help', '/help booking', '/help admin']
    });

    // Command statistics (admin only)
    if (this.options.enableStats) {
      this.registerCommand('cmdstats', {
        description: 'Show command execution statistics',
        handler: async (ctx) => {
          const statsMessage = this.generateStatsMessage();
          await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
        },
        permissions: ['admin'],
        hidden: true
      });
    }
  }

  /**
   * Generate help message
   * @param {Object} ctx - Telegram context
   * @param {string} category - Command category
   */
  generateHelpMessage(ctx, category = 'all') {
    const commands = Array.from(this.commands.entries())
      .filter(([name, command]) => !command.hidden && !command.isAlias)
      .filter(([name, command]) => {
        if (category === 'all') return true;
        return command.category === category;
      });

    if (commands.length === 0) {
      return `No commands found for category: ${category}`;
    }

    let message = '*📚 Available Commands*\n\n';

    // Group by category
    const categories = {};
    commands.forEach(([name, command]) => {
      const cat = command.category || 'general';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push([name, command]);
    });

    // Format by category
    Object.entries(categories).forEach(([cat, cmds]) => {
      message += `*${cat.charAt(0).toUpperCase() + cat.slice(1)} Commands:*\n`;
      
      cmds.forEach(([name, command]) => {
        message += `• /${name}`;
        if (command.aliases.length > 0) {
          message += ` (${command.aliases.map(a => `/${a}`).join(', ')})`;
        }
        message += ` - ${command.description}\n`;
      });
      
      message += '\n';
    });

    message += 'Use `/help <command>` for detailed information about a specific command.';
    
    return message;
  }

  /**
   * Generate statistics message
   */
  generateStatsMessage() {
    const successRate = this.stats.totalExecuted > 0 
      ? ((this.stats.successful / this.stats.totalExecuted) * 100).toFixed(2)
      : '0.00';

    return `
*📊 Command Execution Statistics*

*Total Executed:* ${this.stats.totalExecuted}
*Successful:* ${this.stats.successful}
*Failed:* ${this.stats.failed}
*Success Rate:* ${successRate}%

*Error Breakdown:*
• Validation Errors: ${this.stats.validationErrors}
• Permission Errors: ${this.stats.permissionErrors}
• Rate Limit Hits: ${this.stats.rateLimitHits}

*Registered Commands:* ${this.commands.size}
*Active Middleware:* ${this.middleware.length}
    `.trim();
  }

  /**
   * Add global middleware
   * @param {Function} middleware - Middleware function
   */
  addMiddleware(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Remove middleware
   * @param {Function} middleware - Middleware function to remove
   */
  removeMiddleware(middleware) {
    const index = this.middleware.indexOf(middleware);
    if (index > -1) {
      this.middleware.splice(index, 1);
    }
  }

  /**
   * Enable/disable command
   * @param {string} commandName - Command name
   * @param {boolean} enabled - Enable state
   */
  setCommandEnabled(commandName, enabled) {
    const command = this.commands.get(commandName);
    if (command && !command.isAlias) {
      command.enabled = enabled;
      console.log(`Command ${commandName} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get command list for registration with bot
   */
  getBotCommands() {
    return Array.from(this.commands.entries())
      .filter(([name, command]) => !command.hidden && !command.isAlias && command.enabled)
      .map(([name, command]) => ({
        command: name,
        description: command.description.length > 256 
          ? command.description.substring(0, 253) + '...' 
          : command.description
      }));
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      ...this.stats,
      registeredCommands: this.commands.size,
      enabledCommands: Array.from(this.commands.values())
        .filter(cmd => !cmd.isAlias && cmd.enabled).length,
      categories: [...new Set(Array.from(this.commands.values())
        .map(cmd => cmd.category || 'general'))],
      middleware: this.middleware.length
    };
  }

  /**
   * Health check
   */
  healthCheck() {
    const stats = this.getStats();
    const errorRate = stats.totalExecuted > 0 
      ? (stats.failed / stats.totalExecuted) 
      : 0;
    
    return {
      healthy: errorRate < 0.1, // Less than 10% error rate
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      totalCommands: stats.registeredCommands,
      enabledCommands: stats.enabledCommands,
      successRate: stats.totalExecuted > 0 
        ? `${((stats.successful / stats.totalExecuted) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  /**
   * Shutdown command processor
   */
  shutdown() {
    this.commands.clear();
    this.middleware.length = 0;
    
    // Reset statistics
    this.stats = {
      totalExecuted: 0,
      successful: 0,
      failed: 0,
      validationErrors: 0,
      permissionErrors: 0,
      rateLimitHits: 0
    };
    
    console.log('Command processor shut down');
  }
}

module.exports = CommandProcessor;