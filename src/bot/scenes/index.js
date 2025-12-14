/**
 * Telegraf Scenes Index
 * Creates and exports the Stage with all registered scenes
 *
 * Usage in bot setup:
 * const { createStage } = require('./scenes');
 * const stage = createStage();
 * bot.use(stage.middleware());
 *
 * Entry points:
 * ctx.scene.enter('support_ticket') - Start support ticket wizard
 * ctx.scene.enter('registration') - Start registration wizard (future)
 * ctx.scene.enter('booking') - Start booking wizard (future)
 */

const { Scenes } = require('telegraf');

// Import scenes
const SupportTicketScene = require('./SupportTicketScene');

/**
 * Create the Stage with all registered scenes
 * @returns {Scenes.Stage} - Configured Stage instance
 */
function createStage() {
  const stage = new Scenes.Stage([
    SupportTicketScene
    // Future scenes:
    // RegistrationScene,
    // BookingScene
  ]);

  // Global scene middleware - runs for all scenes
  stage.use((ctx, next) => {
    // Log scene entry/exit for debugging
    if (ctx.scene?.current) {
      console.log(`📍 Scene: ${ctx.scene.current.id}, User: ${ctx.from?.id}`);
    }
    return next();
  });

  return stage;
}

/**
 * Get scene IDs for reference
 * @returns {Object} - Map of scene names to IDs
 */
function getSceneIds() {
  return {
    SUPPORT_TICKET: 'support_ticket',
    // REGISTRATION: 'registration',
    // BOOKING: 'booking'
  };
}

module.exports = {
  createStage,
  getSceneIds,
  // Export individual scenes for testing
  SupportTicketScene
};
