/**
 * French - Common translations
 * Messages de bienvenue, sélection de langue, commandes, boutons, erreurs
 */

module.exports = {
  // Welcome messages
  welcome_admin: '📅 *Bienvenue à Lodge Scheduler!*\n\nBonjour {firstName}! Vous êtes connecté en tant qu\'Administrateur.',
  welcome_back: '📅 *Bienvenue à Lodge Scheduler!*\n\nBonjour {firstName}! Bon retour.',
  welcome_new: '📅 *Bienvenue à Lodge Scheduler!*\n\nBonjour {firstName}! Configurons votre compte.',

  // Language selection
  language_prompt: '🌐 Please select your preferred language:\n🌐 Veuillez choisir votre langue préférée:',
  language_selected: '✅ Langue définie en français',
  language_changed: '✅ Langue changée en français',

  // Commands
  commands_available: '*Commandes Disponibles:*',
  commands_admin: '*Commandes Admin:*',
  cmd_book: '📅 /book - Réserver un rendez-vous',
  cmd_appointments: '📋 /myappointments - Voir les rendez-vous',
  cmd_cancel: '❌ /cancel - Annuler un rendez-vous',
  cmd_help: 'ℹ️ /help - Afficher l\'aide',
  cmd_admin: '🔧 /admin - Commandes admin',
  cmd_language: '🌐 /language - Changer la langue',
  cmd_profiles: '💳 /profiles - Acheter des profils',
  cmd_support: '💬 /support - Chat de Support en Direct',
  cmd_privatesupport: '🔒 /privatesupport - Chat Agent Privé',
  cmd_chat: '💭 /chat - Support Privé Rapide',
  cmd_requests: '/requests - Voir les demandes d\'accès en attente',
  cmd_approve: '/approve - Approuver l\'accès utilisateur',
  cmd_createcode: '/createcode - Créer un code de parrainage',

  // Buttons
  btn_yes: '✅ Oui',
  btn_no: '❌ Non',
  btn_confirm: '✅ Confirmer',
  btn_cancel: '❌ Annuler',
  btn_back: '⬅️ Retour',
  btn_skip: '⏭️ Passer',
  btn_edit: '✏️ Modifier',
  btn_continue: '➡️ Continuer',
  btn_english: '🇨🇦 English',
  btn_french: '⚜️ Français',

  // Errors
  error_generic: '❌ Une erreur s\'est produite. Veuillez réessayer.',
  error_invalid_input: '❌ Entrée invalide. Veuillez réessayer.',
  error_invalid_date: '❌ Format de date invalide. Veuillez utiliser le format MM/JJ/AAAA.',
  error_invalid_email: '❌ Adresse e-mail invalide. Veuillez entrer une adresse e-mail valide.',
  error_booking_failed: '❌ Échec de la réservation du rendez-vous. Veuillez réessayer.',
  session_expired: '⏰ Session expirée. Veuillez utiliser /book pour recommencer.'
};
