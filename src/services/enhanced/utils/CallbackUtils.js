/**
 * Callback Handler Utility Functions
 * Shared utilities for all callback handlers
 */

const moment = require('moment-timezone');

/**
 * Escape markdown special characters to prevent parse errors
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text safe for markdown
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([*_`\[\]])/g, '\\$1');
}

/**
 * Full markdown escape including all special characters
 * @param {string} text - Text to escape
 * @returns {string} - Fully escaped text
 */
function escapeMarkdownFull(text) {
  if (!text) return 'N/A';
  return String(text).replace(/[_*`\[\]()~>#+=|{}.!-]/g, '\\$&');
}

/**
 * Format date value without time component
 * @param {string|Date} dateVal - Date value to format
 * @returns {string} - Formatted date string (MM/DD/YYYY)
 */
function formatDateOnly(dateVal) {
  if (!dateVal) return 'N/A';
  const m = moment(dateVal);
  if (!m.isValid()) return String(dateVal);
  return m.format('MM/DD/YYYY');
}

/**
 * Convert date from MM-DD-YYYY to YYYY-MM-DD format for MySQL
 * @param {string} dateStr - Date in MM-DD-YYYY format
 * @returns {string|null} - Date in YYYY-MM-DD format or null if invalid
 */
function convertDateForMySQL(dateStr) {
  if (!dateStr || dateStr === 'skip' || dateStr === 'N/A') {
    return null;
  }

  // Check if already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Convert from MM-DD-YYYY to YYYY-MM-DD
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month}-${day}`;
  }

  // Try parsing with moment as fallback
  try {
    const parsed = moment(dateStr, ['MM-DD-YYYY', 'M-D-YYYY', 'MM/DD/YYYY', 'M/D/YYYY', 'YYYY-MM-DD']);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }
  } catch (e) {
    console.warn('Date parsing failed:', dateStr);
  }

  return null;
}

/**
 * Check whether we already have registration/customer info in session
 * @param {Object} ctx - Telegram context
 * @returns {boolean} - True if registration data exists
 */
function hasRegistrationData(ctx) {
  const customerInfo = ctx.session?.customerInfo;
  if (customerInfo && Object.keys(customerInfo).length > 0) {
    return true;
  }

  const regData = ctx.session?.registration?.data;
  return regData && Object.keys(regData).length > 0;
}

/**
 * Get formatted timestamp for refresh uniqueness
 * @param {string} timezone - Timezone string (default: America/New_York)
 * @returns {string} - Formatted time string
 */
function getRefreshTimestamp(timezone = 'America/New_York') {
  return moment().tz(timezone).format('h:mm:ss A');
}

/**
 * Format appointment datetime for display
 * @param {string|Date} datetime - Datetime to format
 * @param {string} timezone - Timezone (default: America/New_York)
 * @returns {Object} - Object with formatted date and time strings
 */
function formatAppointmentDateTime(datetime, timezone = 'America/New_York') {
  const dt = moment(datetime).tz(timezone);
  return {
    date: dt.format('MMM DD, YYYY'),
    time: dt.format('h:mm A'),
    full: dt.format('MMM DD, YYYY h:mm A'),
    short: dt.format('MMM DD')
  };
}

/**
 * Get status emoji for tickets
 * @param {string} status - Status string
 * @returns {string} - Emoji character
 */
function getStatusEmoji(status) {
  const emojis = {
    'open': '🟠',
    'assigned': '🔵',
    'closed': '🟢',
    'escalated': '🔴',
    'pending_approval': '⏳',
    'confirmed': '✅',
    'scheduled': '📅',
    'in_progress': '🔄',
    'completed': '✔️',
    'cancelled': '❌',
    'rejected': '❌'
  };
  return emojis[status] || '⚫';
}

/**
 * Get priority emoji
 * @param {string} priority - Priority string
 * @returns {string} - Emoji character
 */
function getPriorityEmoji(priority) {
  const emojis = {
    'critical': '🚨',
    'high': '🔴',
    'medium': '🟠',
    'low': '🟢'
  };
  return emojis[priority] || '⚫';
}

/**
 * Check if user is admin
 * SECURITY: Uses consistent string comparison to prevent type coercion bypasses
 * @param {Object} ctx - Telegram context
 * @param {Array} adminIds - Array of admin IDs
 * @returns {boolean} - True if user is admin
 */
function isAdmin(ctx, adminIds = []) {
  const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID || '';
  const userIdStr = ctx.from.id.toString();

  // SECURITY: Use consistent string comparison only (no type coercion)
  return adminIds.includes(userIdStr) || userIdStr === ADMIN_ID;
}

/**
 * Build standard navigation keyboard
 * @param {Array} additionalButtons - Additional button rows to include
 * @returns {Object} - Inline keyboard markup
 */
function buildNavigationKeyboard(additionalButtons = []) {
  const keyboard = [...additionalButtons];
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return { inline_keyboard: keyboard };
}

/**
 * Build admin navigation keyboard
 * @param {Array} additionalButtons - Additional button rows to include
 * @returns {Object} - Inline keyboard markup
 */
function buildAdminNavigationKeyboard(additionalButtons = []) {
  const keyboard = [...additionalButtons];
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return { inline_keyboard: keyboard };
}

/**
 * Safely edit message with error handling
 * @param {Object} ctx - Telegram context
 * @param {string} text - Message text
 * @param {Object} options - Message options
 * @returns {Promise<boolean>} - Success status
 */
async function safeEditMessage(ctx, text, options = {}) {
  try {
    await ctx.editMessageText(text, options);
    return true;
  } catch (error) {
    // If edit fails, try reply
    if (error.description?.includes('message is not modified')) {
      // Ignore - message was the same
      return true;
    }
    try {
      await ctx.reply(text, options);
      return true;
    } catch (replyError) {
      console.error('Failed to edit or reply:', replyError.message);
      return false;
    }
  }
}

/**
 * Safe answer callback query
 * @param {Object} ctx - Telegram context
 * @param {string} text - Answer text
 * @param {Object} options - Answer options
 */
async function safeAnswerCbQuery(ctx, text = '', options = {}) {
  try {
    await ctx.answerCbQuery(text, options);
  } catch (error) {
    console.error('Failed to answer callback query:', error.message);
  }
}

module.exports = {
  escapeMarkdown,
  escapeMarkdownFull,
  formatDateOnly,
  convertDateForMySQL,
  hasRegistrationData,
  getRefreshTimestamp,
  formatAppointmentDateTime,
  getStatusEmoji,
  getPriorityEmoji,
  isAdmin,
  buildNavigationKeyboard,
  buildAdminNavigationKeyboard,
  safeEditMessage,
  safeAnswerCbQuery
};
