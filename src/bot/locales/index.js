/**
 * Locale Loader
 * Loads and manages translations for all supported languages
 */

const en = require('./en');
const fr = require('./fr');

const translations = { en, fr };

/**
 * Get translated text with placeholder substitution
 * @param {string} lang - Language code (en, fr)
 * @param {string} key - Translation key
 * @param {Object} params - Placeholder values
 * @returns {string} - Translated text
 */
function getText(lang, key, params = {}) {
  const text = translations[lang]?.[key] || translations['en'][key] || key;

  // Replace placeholders with actual values
  return text.replace(/{(\w+)}/g, (match, param) => params[param] || match);
}

/**
 * Get user's language preference
 * @param {string|number} userId - User ID
 * @param {Object} referralData - Referral data object containing user preferences
 * @returns {string} - Language code
 */
function getUserLanguage(userId, referralData) {
  const userPrefs = referralData?.userPreferences || {};
  return userPrefs[userId]?.language || 'en';
}

/**
 * Save user's language preference
 * @param {string|number} userId - User ID
 * @param {string} language - Language code
 * @param {Object} referralData - Referral data object
 * @returns {Object} - Updated referral data
 */
function saveUserLanguage(userId, language, referralData) {
  if (!referralData.userPreferences) {
    referralData.userPreferences = {};
  }
  if (!referralData.userPreferences[userId]) {
    referralData.userPreferences[userId] = {};
  }
  referralData.userPreferences[userId].language = language;
  return referralData;
}

/**
 * Get all translations for a language
 * @param {string} lang - Language code
 * @returns {Object} - All translations for the language
 */
function getLocale(lang) {
  return translations[lang] || translations['en'];
}

/**
 * Get available languages
 * @returns {Array<string>} - Array of language codes
 */
function getAvailableLanguages() {
  return Object.keys(translations);
}

module.exports = {
  translations,
  getText,
  getUserLanguage,
  saveUserLanguage,
  getLocale,
  getAvailableLanguages
};
