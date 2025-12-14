/**
 * English locale - Re-exports all translation modules
 */

const common = require('./common');
const booking = require('./booking');
const registration = require('./registration');
const admin = require('./admin');
const support = require('./support');

module.exports = {
  ...common,
  ...booking,
  ...registration,
  ...admin,
  ...support
};
