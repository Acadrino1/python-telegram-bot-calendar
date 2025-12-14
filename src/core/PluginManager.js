const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');

/**
 * PluginManager - Handles plugin lifecycle, hot-reloading, and dependency management
 */
class PluginManager {
  constructor(bot) {
    this.bot = bot;
    this.plugins = new Map();
    this.pluginConfig = {};
    this.watchers = new Map();
    this.loadOrder = [];
    this.isDevMode = process.env.NODE_ENV === 'development';
    
    this.loadConfig();
  }
  
  async loadConfig() {
    try {
      const configPath = path.join(__dirname, '../../config/plugins.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.pluginConfig = JSON.parse(configData);
      this.bot.logger.info('Plugin configuration loaded');
    } catch (error) {
      this.bot.logger.warn('No plugin configuration found, using defaults');
      this.pluginConfig = {
        enabled: ['auth', 'booking', 'support', 'admin'],
        plugins: {}
      };
    }
  }
  
  async loadConfiguredPlugins() {
    const enabledPlugins = this.pluginConfig.enabled || [];
    
    for (const pluginName of enabledPlugins) {
      try {
        const pluginPath = path.join(__dirname, `../plugins/${pluginName}`);
        const PluginClass = require(pluginPath);
        await this.load(pluginName, PluginClass);
      } catch (error) {
        this.bot.logger.error(`Failed to load configured plugin ${pluginName}:`, error);
      }
    }
  }
  
  async load(name, PluginClass) {
    try {
      // Check if already loaded
      if (this.plugins.has(name)) {
        this.bot.logger.warn(`Plugin ${name} is already loaded`);
        return false;
      }
      
      // Create plugin instance
      const config = this.pluginConfig.plugins?.[name] || {};
      const plugin = new PluginClass(this.bot, config);
      
      // Validate plugin
      if (!plugin.name || !plugin.version) {
        throw new Error('Plugin must have name and version properties');
      }
      
      // Check dependencies
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!this.plugins.has(dep)) {
            this.bot.logger.warn(`Plugin ${name} requires ${dep}, loading it first`);
            await this.loadDependency(dep);
          }
        }
      }
      
      // Initialize plugin
      await plugin.onLoad();
      
      // Register plugin
      this.plugins.set(name, plugin);
      this.bot.plugins.set(name, plugin);
      this.loadOrder.push(name);
      
      // Setup hot-reload in development
      if (this.isDevMode) {
        this.setupHotReload(name);
      }
      
      // Register plugin commands
      this.registerPluginCommands(plugin);
      
      // Register plugin handlers
      this.registerPluginHandlers(plugin);
      
      this.bot.logger.info(`Plugin ${name} v${plugin.version} loaded successfully`);
      this.bot.eventBus.emit('plugin:loaded', { name, plugin });
      
      return true;
    } catch (error) {
      this.bot.logger.error(`Failed to load plugin ${name}:`, error);
      this.bot.errorHandler.recordPluginError(name, error);
      return false;
    }
  }
  
  async unload(name) {
    try {
      const plugin = this.plugins.get(name);
      if (!plugin) {
        this.bot.logger.warn(`Plugin ${name} is not loaded`);
        return false;
      }
      
      // Check if other plugins depend on this
      for (const [otherName, otherPlugin] of this.plugins) {
        if (otherPlugin.dependencies?.includes(name)) {
          this.bot.logger.warn(`Cannot unload ${name}: ${otherName} depends on it`);
          return false;
        }
      }
      
      // Call plugin cleanup
      if (plugin.onUnload) {
        await plugin.onUnload();
      }
      
      // Remove from maps
      this.plugins.delete(name);
      this.bot.plugins.delete(name);
      this.loadOrder = this.loadOrder.filter(n => n !== name);
      
      // Stop watching for hot-reload
      if (this.watchers.has(name)) {
        this.watchers.get(name).close();
        this.watchers.delete(name);
      }
      
      // Clear require cache
      const pluginPath = path.join(__dirname, `../plugins/${name}`);
      delete require.cache[require.resolve(pluginPath)];
      
      this.bot.logger.info(`Plugin ${name} unloaded successfully`);
      this.bot.eventBus.emit('plugin:unloaded', { name });
      
      return true;
    } catch (error) {
      this.bot.logger.error(`Failed to unload plugin ${name}:`, error);
      return false;
    }
  }
  
  async reload(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      this.bot.logger.warn(`Plugin ${name} is not loaded`);
      return false;
    }
    
    const PluginClass = plugin.constructor;
    await this.unload(name);
    await this.load(name, PluginClass);
    return true;
  }
  
  async unloadAll() {
    // Unload in reverse order
    const reverseOrder = [...this.loadOrder].reverse();
    for (const name of reverseOrder) {
      await this.unload(name);
    }
  }
  
  getStatuses() {
    const statuses = {};
    for (const [name, plugin] of this.plugins) {
      statuses[name] = {
        loaded: true,
        version: plugin.version,
        enabled: plugin.enabled !== false,
        health: plugin.getHealth ? plugin.getHealth() : 'unknown',
        errors: this.bot.errorHandler.getPluginErrors(name)
      };
    }
    return statuses;
  }
  
  registerPluginCommands(plugin) {
    if (!plugin.commands) return;
    
    for (const [command, handler] of Object.entries(plugin.commands)) {
      this.bot.bot.command(command, async (ctx) => {
        try {
          await handler.call(plugin, ctx);
        } catch (error) {
          this.bot.errorHandler.handle(error, ctx, plugin.name);
        }
      });
    }
  }
  
  registerPluginHandlers(plugin) {
    if (!plugin.handlers) return;
    
    for (const [action, handler] of Object.entries(plugin.handlers)) {
      if (action.startsWith('action:')) {
        const actionName = action.replace('action:', '');
        this.bot.bot.action(actionName, async (ctx) => {
          try {
            await handler.call(plugin, ctx);
          } catch (error) {
            this.bot.errorHandler.handle(error, ctx, plugin.name);
          }
        });
      }
    }
  }
  
  setupHotReload(name) {
    const pluginPath = path.join(__dirname, `../plugins/${name}`);
    const watcher = chokidar.watch(pluginPath, {
      ignored: /node_modules/,
      persistent: true
    });
    
    watcher.on('change', async () => {
      this.bot.logger.info(`Plugin ${name} changed, reloading...`);
      await this.reload(name);
    });
    
    this.watchers.set(name, watcher);
  }
  
  async loadDependency(name) {
    try {
      const pluginPath = path.join(__dirname, `../plugins/${name}`);
      const PluginClass = require(pluginPath);
      await this.load(name, PluginClass);
    } catch (error) {
      throw new Error(`Failed to load dependency ${name}: ${error.message}`);
    }
  }
}

module.exports = PluginManager;