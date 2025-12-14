const EventEmitter = require('events');

/**
 * EventBus - Central event system for inter-plugin communication
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Support many plugins
  }
  
  /**
   * Emit event with automatic error handling
   */
  emitAsync(event, data) {
    return new Promise((resolve) => {
      process.nextTick(() => {
        try {
          this.emit(event, data);
          resolve(true);
        } catch (error) {
          console.error(`EventBus error on ${event}:`, error);
          resolve(false);
        }
      });
    });
  }
  
  /**
   * Wait for event with timeout
   */
  waitFor(event, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(event, handler);
        reject(new Error(`Timeout waiting for ${event}`));
      }, timeout);
      
      const handler = (data) => {
        clearTimeout(timer);
        resolve(data);
      };
      
      this.once(event, handler);
    });
  }
}

module.exports = EventBus;