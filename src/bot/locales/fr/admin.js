/**
 * French - Admin translations
 * Commandes admin, approbations, codes, blocage
 */

module.exports = {
  // Access control
  access_required: '🔐 *Accès Requis*\n\nPour utiliser ce bot, vous avez besoin d\'une invitation.',
  enter_referral: '1️⃣ *Entrer le Code de Parrainage*\nSi vous avez un code de parrainage, veuillez l\'entrer maintenant.',
  request_access: '2️⃣ *Demander l\'Accès*\nTapez /request pour demander l\'accès à un administrateur.',
  access_note: '*Note:* Les demandes d\'accès sont examinées manuellement et peuvent prendre du temps.',
  already_approved: 'Vous avez déjà accès au bot. Utilisez /book pour planifier des rendez-vous.',
  invalid_code: '❌ Code de parrainage invalide ou expiré.\n\nVeuillez réessayer ou utiliser /request pour demander l\'accès à un administrateur.',
  access_granted: '✅ Accès accordé! Bienvenue à Lodge Scheduler.\n\nVous pouvez maintenant utiliser /book pour planifier des rendez-vous.',
  request_sent: '✅ Votre demande d\'accès a été envoyée aux administrateurs.\n\nVous serez notifié une fois votre demande examinée.',

  // Admin messages
  admin_only: 'Cette commande est réservée aux administrateurs.',
  user_approved: '✅ L\'utilisateur {userId} a été approuvé.',
  user_denied: '✅ L\'utilisateur {userId} s\'est vu refuser l\'accès.',
  code_created: '✅ Code de parrainage créé: {code}\nUtilisations max: {maxUses}',
  date_blocked: '🚫 La date {date} a été bloquée.\nTous les rendez-vous annulés et les clients notifiés.',
  date_unblocked: '✅ La date {date} a été débloquée. Les clients peuvent maintenant réserver des rendez-vous à cette date.',
  date_already_blocked: 'La date {date} est déjà bloquée.',
  date_not_blocked: 'La date {date} n\'est pas actuellement bloquée.',
  no_blocked_dates: 'Aucune date n\'est actuellement bloquée.',
  blocked_dates_list: '*🚫 Dates Bloquées:*'
};
