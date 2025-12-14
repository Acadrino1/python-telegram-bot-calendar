/**
 * Translations - Backward Compatibility Shim
 *
 * This file re-exports from the new modular locale structure.
 * All translations are now split into per-locale, per-feature files:
 *
 * src/bot/locales/
 * ├── index.js              (loader/manager)
 * ├── en/
 * │   ├── index.js          (re-exports all)
 * │   ├── common.js         (welcome, buttons, errors)
 * │   ├── booking.js        (booking flow, calendar)
 * │   ├── registration.js   (13-step form)
 * │   ├── admin.js          (admin commands)
 * │   └── support.js        (support tickets)
 * └── fr/
 *     ├── index.js
 *     ├── common.js
 *     ├── booking.js
 *     ├── registration.js
 *     ├── admin.js
 *     └── support.js
 *
 * New code should import from './locales' directly.
 */

const {
  translations,
  getText,
  getUserLanguage,
  saveUserLanguage
} = require('./locales');

module.exports = {
  translations,
  getText,
  getUserLanguage,
  saveUserLanguage
};
