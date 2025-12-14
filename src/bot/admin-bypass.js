/**
 * Admin Bypass Module - Ensures authorized admins have access
 */

const ADMIN_IDS = process.env.ADMIN_TELEGRAM_ID
  ? process.env.ADMIN_TELEGRAM_ID.split(',').map(id => id.trim())
  : [];

// Override any permission checks
function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

// Bypass approval checks for admin
function requiresApproval(userId) {
  if (isAdmin(userId)) {
    return false; // Admin never needs approval
  }
  // Check database for other users
  return true;
}

// Auto-approve admin actions
function checkPermission(userId, action) {
  if (isAdmin(userId)) {
    return true; // Admin can do anything
  }
  // Normal permission check for others
  return false;
}

// Middleware to bypass all restrictions for admin
function adminBypassMiddleware(ctx, next) {
  if (ctx.from && isAdmin(ctx.from.id)) {
    ctx.isAdmin = true;
    ctx.approved = true;
    ctx.hasAccess = true;
    // Set session to bypass any checks
    if (ctx.session) {
      ctx.session.approved = true;
      ctx.session.isAdmin = true;
    }
  }
  return next();
}

module.exports = {
  isAdmin,
  requiresApproval,
  checkPermission,
  adminBypassMiddleware,
  ADMIN_IDS
};