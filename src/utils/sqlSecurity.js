/**
 * SQL Security Utilities
 * Provides input validation and sanitization for database queries
 */

// Security: Allowlists for SQL injection prevention
const ALLOWED_QUERY_FIELDS = [
  'role', 'is_active', 'created_at', 'updated_at',
  'email_notifications', 'sms_notifications', 'first_name',
  'last_name', 'email', 'telegram_username'
];

const ALLOWED_PREFERENCE_KEYS = [
  'language', 'timezone', 'notifications', 'email_opt_in',
  'sms_opt_in', 'marketing', 'theme', 'locale'
];

// Security: Escape LIKE wildcards to prevent pattern injection
function escapeLikeWildcards(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// Security: Validate field name against allowlist
function validateFieldName(field) {
  if (!ALLOWED_QUERY_FIELDS.includes(field)) {
    throw new Error('Invalid field name: ' + field + '. Allowed: ' + ALLOWED_QUERY_FIELDS.join(', '));
  }
  return field;
}

// Security: Validate preference key against allowlist  
function validatePreferenceKey(key) {
  if (!/^[a-zA-Z0-9_]+/.test(key)) {
    throw new Error('Invalid preference key format: ' + key);
  }
  if (!ALLOWED_PREFERENCE_KEYS.includes(key)) {
    throw new Error('Invalid preference key: ' + key + '. Allowed: ' + ALLOWED_PREFERENCE_KEYS.join(', '));
  }
  return key;
}

// Security: Validate JSON path format
function validateJsonPath(path) {
  if (!/^$.[a-zA-Z0-9_]+/.test(path)) {
    throw new Error('Invalid JSON path format: ' + path);
  }
  return path;
}

module.exports = { 
  ALLOWED_QUERY_FIELDS, 
  ALLOWED_PREFERENCE_KEYS, 
  escapeLikeWildcards, 
  validateFieldName, 
  validatePreferenceKey,
  validateJsonPath
};
