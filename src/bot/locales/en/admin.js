/**
 * English - Admin translations
 * Admin commands, approvals, codes, blocking
 */

module.exports = {
  // Access control
  access_required: '🔐 *Access Required*\n\nTo use this bot, you need an invitation.',
  enter_referral: '1️⃣ *Enter Referral Code*\nIf you have a referral code, please enter it now.',
  request_access: '2️⃣ *Request Access*\nType /request to request access from an administrator.',
  access_note: '*Note:* Access requests are reviewed manually and may take some time.',
  already_approved: 'You already have access to the bot. Use /book to schedule appointments.',
  invalid_code: '❌ Invalid or expired referral code.\n\nPlease try again or use /request to request access from an administrator.',
  access_granted: '✅ Access granted! Welcome to Lodge Scheduler.\n\nYou can now use /book to schedule appointments.',
  request_sent: '✅ Your access request has been sent to the administrators.\n\nYou will be notified once your request is reviewed.',

  // Admin messages
  admin_only: 'This command is for administrators only.',
  user_approved: '✅ User {userId} has been approved.',
  user_denied: '✅ User {userId} has been denied access.',
  code_created: '✅ Referral code created: {code}\nMax uses: {maxUses}',
  date_blocked: '🚫 Date {date} has been blocked.\nAll appointments cancelled and customers notified.',
  date_unblocked: '✅ Date {date} has been unblocked. Customers can now book appointments on this date.',
  date_already_blocked: 'Date {date} is already blocked.',
  date_not_blocked: 'Date {date} is not currently blocked.',
  no_blocked_dates: 'No dates are currently blocked.',
  blocked_dates_list: '*🚫 Blocked Dates:*'
};
