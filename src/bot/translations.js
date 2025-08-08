const translations = {
  en: {
    // Welcome messages
    welcome_admin: '📱 *Welcome to Lodge Mobile Activations Bot!*\n\nHello {firstName}! You are logged in as an Administrator.',
    welcome_back: '📱 *Welcome to Lodge Mobile Activations Bot!*\n\nHello {firstName}! Welcome back.',
    welcome_new: '📱 *Welcome to Lodge Mobile Activations Bot!*\n\nHello {firstName}! Let\'s get you set up.',
    
    // Language selection
    language_prompt: '🌐 Please select your preferred language:\n🌐 Veuillez choisir votre langue préférée:',
    language_selected: '✅ Language set to English',
    language_changed: '✅ Language changed to English',
    
    // Commands
    commands_available: '*Available Commands:*',
    commands_admin: '*Admin Commands:*',
    cmd_book: '📅 /book - Book activation appointment',
    cmd_appointments: '📋 /myappointments - View appointments',
    cmd_cancel: '❌ /cancel - Cancel appointment',
    cmd_help: 'ℹ️ /help - Show help',
    cmd_admin: '🔧 /admin - Admin commands',
    cmd_language: '🌐 /language - Change language',
    cmd_profiles: '💳 /profiles - Purchase profiles',
    cmd_support: '💬 /support - Live Support Chat',
    cmd_requests: '/requests - View pending access requests',
    cmd_approve: '/approve - Approve user access',
    cmd_createcode: '/createcode - Create referral code',
    
    // Access control
    access_required: '🔐 *Access Required*\n\nTo use this bot, you need an invitation.',
    enter_referral: '1️⃣ *Enter Referral Code*\nIf you have a referral code, please enter it now.',
    request_access: '2️⃣ *Request Access*\nType /request to request access from an administrator.',
    access_note: '*Note:* Access requests are reviewed manually and may take some time.',
    already_approved: 'You already have access to the bot. Use /book to schedule appointments.',
    invalid_code: '❌ Invalid or expired referral code.\n\nPlease try again or use /request to request access from an administrator.',
    access_granted: '✅ Access granted! Welcome to Lodge Mobile Activations.\n\nYou can now use /book to schedule appointments.',
    request_sent: '✅ Your access request has been sent to the administrators.\n\nYou will be notified once your request is reviewed.',
    
    // Booking flow
    book_start: '📅 *Book Your Lodge Mobile Activation*\n\nLet\'s schedule your appointment!',
    select_date: '📅 Please select a date for your appointment:',
    select_time: '🕐 Select an appointment time for {date}:',
    no_dates_available: 'No available dates found. Please try again later.',
    no_times_available: 'No available times for this date. Please select another date.',
    
    // Customer Information Collection
    info_collection_start: '📋 *Lodge Mobile Activation - Customer Information*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nTo complete your activation, I\'ll need to collect some information.\n\n📝 *Step 1 of 13 - First Name*\nPlease enter your first name:',
    enter_first_name: '📝 *Step 1 of 13 - First Name*\n\nPlease enter your first name:',
    enter_middle_name: '📝 *Step 2 of 13 - Middle Name*\n\nPlease enter your middle name:\n(Optional - type "skip" if not applicable)',
    enter_last_name: '📝 *Step 3 of 13 - Last Name*\n\nPlease enter your last name:',
    enter_dob: '📝 *Step 4 of 13 - Date of Birth*\n\nPlease enter your date of birth:\nFormat: MM/DD/YYYY',
    enter_street_number: '📝 *Step 5 of 13 - Street Number*\n\nPlease enter your street number:',
    enter_street_address: '📝 *Step 6 of 13 - Street Address*\n\nPlease enter your street name (without the number):',
    enter_city: '📝 *Step 7 of 13 - City*\n\nPlease enter your city:',
    select_province: '📝 *Step 8 of 13 - Province*\n\nPlease select your province:',
    enter_postal_code: '📝 *Step 9 of 13 - Postal Code*\n\nPlease enter your postal code:\nFormat: A1A 1A1',
    enter_email_required: '📝 *Step 10 of 13 - Email Address*\n\nPlease enter your email address:',
    enter_drivers_license: '📝 *Step 11 of 13 - Driver\'s License*\n\nPlease enter your driver\'s license number:\n\n⚠️ Highly Recommended but optional\nType "skip" if not available - one will be provided',
    enter_dl_issued: '📝 *Step 12 of 13 - License Issue Date*\n\nWhen was your driver\'s license issued?\nFormat: MM/DD/YYYY or type "skip"',
    enter_dl_expiry: '📝 *Step 13 of 13 - License Expiry Date*\n\nWhen does your driver\'s license expire?\nFormat: MM/DD/YYYY or type "skip"',
    info_review: '✅ *Information Review*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n{info}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nIs all information correct?',
    info_saved: '✅ Information saved successfully!\n\n🗓️ Now let\'s select your appointment date...',
    
    // Appointment details (legacy - kept for compatibility)
    enter_name: '👤 Please enter your full name:',
    enter_phone: '📱 Please enter your phone number:',
    enter_email: '📧 Please enter your email address (or type "skip" to skip):',
    
    // Confirmation
    confirm_booking: '*📋 Confirm Your Appointment*\n\n📅 Date: {date}\n🕐 Time: {time}\n⏱️ Duration: 90 minutes\n\n*Customer Information:*\n👤 Name: {fullName}\n🎂 DOB: {dob}\n🏠 Address: {address}\n📧 Email: {email}\n📱 Phone: {phone}\n🪪 DL: {dlInfo}\n\n🏢 Service: Lodge Mobile Activations\n\nIs this information correct?',
    booking_confirmed: '✅ *Appointment Confirmed!*\n\nYour Lodge Mobile activation appointment has been booked.\n\n📅 Date: {date}\n🕐 Time: {time}\n⏱️ Duration: 90 minutes\n🏢 Service: Lodge Mobile Activations\n\n📱 Reference ID: {refId}\n\n*Important:*\n• Please arrive 5 minutes early\n• Bring valid ID and account information\n• You\'ll receive reminders before your appointment\n\nTo view or cancel: /myappointments',
    
    // Appointments view
    my_appointments: '*📋 Your Appointments:*',
    no_appointments: 'You have no appointments scheduled.\n\nUse /book to schedule a new appointment.',
    appointment_item: '{index}. *Lodge Mobile Activation*\n   📅 {date}\n   🕐 {time}\n   ⏱️ Duration: 90 minutes\n   📱 Reference: {refId}\n   📍 Status: {status}',
    
    // Cancellation
    cancel_select: '❌ *Cancel Appointment*\n\nSelect the appointment you want to cancel:',
    cancel_confirm: '⚠️ *Confirm Cancellation*\n\nAre you sure you want to cancel this appointment?\n\n📅 Date: {date}\n🕐 Time: {time}\n\nThis action cannot be undone.',
    cancel_success: '✅ Your appointment has been cancelled successfully.',
    cancel_failed: '❌ Failed to cancel appointment. Please try again.',
    
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
    blocked_dates_list: '*🚫 Blocked Dates:*',
    
    // Errors
    error_generic: '❌ An error occurred. Please try again.',
    error_invalid_input: '❌ Invalid input. Please try again.',
    error_invalid_date: '❌ Invalid date format. Please use MM/DD/YYYY format.',
    error_invalid_email: '❌ Invalid email address. Please enter a valid email.',
    error_booking_failed: '❌ Failed to book appointment. Please try again.',
    session_expired: '⏰ Session expired. Please use /book to start over.',
    
    // Reminders
    reminder_12hr: '🔔 *Appointment Reminder*\n\nYou have an appointment tomorrow:\n📅 {date}\n🕐 {time}\n🏢 Lodge Mobile Activations\n\nSee you tomorrow!',
    reminder_3hr: '🔔 *Appointment Reminder*\n\nYour appointment is in 3 hours:\n📅 {date}\n🕐 {time}\n🏢 Lodge Mobile Activations\n\nPlease prepare your documents.',
    reminder_1hr: '⏰ *Appointment Starting Soon*\n\nYour appointment is in 1 hour:\n📅 {date}\n🕐 {time}\n🏢 Lodge Mobile Activations\n\nPlease start making your way to the location.',
    reminder_30min: '🚨 *Final Reminder*\n\nYour appointment is in 30 minutes:\n📅 {date}\n🕐 {time}\n🏢 Lodge Mobile Activations\n\nPlease arrive 5 minutes early.',
    
    // Buttons
    btn_yes: '✅ Yes',
    btn_no: '❌ No',
    btn_confirm: '✅ Confirm',
    btn_cancel: '❌ Cancel',
    btn_back: '⬅️ Back',
    btn_skip: '⏭️ Skip',
    btn_edit: '✏️ Edit',
    btn_continue: '➡️ Continue',
    btn_english: '🇨🇦 English',
    btn_french: '⚜️ Français',
    
    // Live Support messages
    support_button: '💬 Live Support',
    support_welcome: '👋 *Welcome to Live Support*\n\nHow can we help you today?\n\nPlease describe your issue and a support agent will assist you shortly.',
    support_ticket_created: '✅ *Support Ticket Created*\n\nTicket ID: `{ticketId}`\n\nA support agent will respond to you shortly. You will receive all responses here in this chat.',
    support_rate_limit_daily: '⚠️ You have reached the daily limit of {limit} support tickets. Please try again tomorrow.',
    support_rate_limit_hourly: '⚠️ You are sending messages too quickly. Please slow down and try again.',
    support_ticket_closed: '✅ Your support ticket has been closed. Thank you for contacting us!',
    support_agent_joined: '👨‍💻 A support agent has joined your chat. How can I help you?',
    support_no_agents: '⏳ All support agents are currently busy. Your message has been queued and will be answered as soon as possible.',
    support_error: '❌ An error occurred. Please try again later or contact support directly.',
    support_continue_prompt: 'Type your message to continue the conversation, or click "Close Ticket" when done.',
    supportNotAvailable: '⚠️ Live support is currently not available. Please try again later or contact an administrator.',
    
    // Profile referral messages
    profile_referral_sent: '✅ *Profile Purchase Request Sent!*\n\nYour order has been forwarded to our profile vendor.\n\n📱 Order ID: `{orderId}`\n\nPlease save this order ID for your purchase. The vendor will contact you shortly with available profiles and pricing.',
    profile_referral_error: '❌ Unable to send profile purchase request at this time. Please try again later or contact support.'
  },
  
  fr: {
    // Welcome messages
    welcome_admin: '📱 *Bienvenue au Bot d\'Activation Mobile Lodge!*\n\nBonjour {firstName}! Vous êtes connecté en tant qu\'Administrateur.',
    welcome_back: '📱 *Bienvenue au Bot d\'Activation Mobile Lodge!*\n\nBonjour {firstName}! Bon retour.',
    welcome_new: '📱 *Bienvenue au Bot d\'Activation Mobile Lodge!*\n\nBonjour {firstName}! Configurons votre compte.',
    
    // Language selection
    language_prompt: '🌐 Please select your preferred language:\n🌐 Veuillez choisir votre langue préférée:',
    language_selected: '✅ Langue définie en français',
    language_changed: '✅ Langue changée en français',
    
    // Commands
    commands_available: '*Commandes Disponibles:*',
    commands_admin: '*Commandes Admin:*',
    cmd_book: '📅 /book - Réserver un rendez-vous d\'activation',
    cmd_appointments: '📋 /myappointments - Voir les rendez-vous',
    cmd_cancel: '❌ /cancel - Annuler un rendez-vous',
    cmd_help: 'ℹ️ /help - Afficher l\'aide',
    cmd_admin: '🔧 /admin - Commandes admin',
    cmd_language: '🌐 /language - Changer la langue',
    cmd_profiles: '💳 /profiles - Acheter des profils',
    cmd_support: '💬 /support - Chat de Support en Direct',
    cmd_requests: '/requests - Voir les demandes d\'accès en attente',
    cmd_approve: '/approve - Approuver l\'accès utilisateur',
    cmd_createcode: '/createcode - Créer un code de parrainage',
    
    // Access control
    access_required: '🔐 *Accès Requis*\n\nPour utiliser ce bot, vous avez besoin d\'une invitation.',
    enter_referral: '1️⃣ *Entrer le Code de Parrainage*\nSi vous avez un code de parrainage, veuillez l\'entrer maintenant.',
    request_access: '2️⃣ *Demander l\'Accès*\nTapez /request pour demander l\'accès à un administrateur.',
    access_note: '*Note:* Les demandes d\'accès sont examinées manuellement et peuvent prendre du temps.',
    already_approved: 'Vous avez déjà accès au bot. Utilisez /book pour planifier des rendez-vous.',
    invalid_code: '❌ Code de parrainage invalide ou expiré.\n\nVeuillez réessayer ou utiliser /request pour demander l\'accès à un administrateur.',
    access_granted: '✅ Accès accordé! Bienvenue aux Activations Mobile Lodge.\n\nVous pouvez maintenant utiliser /book pour planifier des rendez-vous.',
    request_sent: '✅ Votre demande d\'accès a été envoyée aux administrateurs.\n\nVous serez notifié une fois votre demande examinée.',
    
    // Booking flow
    book_start: '📅 *Réservez Votre Activation Mobile Lodge*\n\nPlanifions votre rendez-vous!',
    select_date: '📅 Veuillez sélectionner une date pour votre rendez-vous:',
    select_time: '🕐 Sélectionnez une heure de rendez-vous pour le {date}:',
    no_dates_available: 'Aucune date disponible trouvée. Veuillez réessayer plus tard.',
    no_times_available: 'Aucune heure disponible pour cette date. Veuillez sélectionner une autre date.',
    
    // Customer Information Collection
    info_collection_start: '📋 *Activation Mobile Lodge - Informations Client*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nPour compléter votre activation, j\'ai besoin de collecter quelques informations.\n\n📝 *Étape 1 sur 13 - Prénom*\nVeuillez entrer votre prénom:',
    enter_first_name: '📝 *Étape 1 sur 13 - Prénom*\n\nVeuillez entrer votre prénom:',
    enter_middle_name: '📝 *Étape 2 sur 13 - Deuxième Prénom*\n\nVeuillez entrer votre deuxième prénom:\n(Optionnel - tapez "passer" si non applicable)',
    enter_last_name: '📝 *Étape 3 sur 13 - Nom de Famille*\n\nVeuillez entrer votre nom de famille:',
    enter_dob: '📝 *Étape 4 sur 13 - Date de Naissance*\n\nVeuillez entrer votre date de naissance:\nFormat: MM/JJ/AAAA',
    enter_street_number: '📝 *Étape 5 sur 13 - Numéro de Rue*\n\nVeuillez entrer votre numéro de rue:',
    enter_street_address: '📝 *Étape 6 sur 13 - Nom de Rue*\n\nVeuillez entrer le nom de votre rue (sans le numéro):',
    enter_city: '📝 *Étape 7 sur 13 - Ville*\n\nVeuillez entrer votre ville:',
    select_province: '📝 *Étape 8 sur 13 - Province*\n\nVeuillez sélectionner votre province:',
    enter_postal_code: '📝 *Étape 9 sur 13 - Code Postal*\n\nVeuillez entrer votre code postal:\nFormat: A1A 1A1',
    enter_email_required: '📝 *Étape 10 sur 13 - Adresse E-mail*\n\nVeuillez entrer votre adresse e-mail:',
    enter_drivers_license: '📝 *Étape 11 sur 13 - Permis de Conduire*\n\nVeuillez entrer votre numéro de permis de conduire:\n\n⚠️ Fortement recommandé mais optionnel\nTapez "passer" si non disponible - un sera fourni',
    enter_dl_issued: '📝 *Étape 12 sur 13 - Date d\'Émission du Permis*\n\nQuand votre permis de conduire a-t-il été émis?\nFormat: MM/JJ/AAAA ou tapez "passer"',
    enter_dl_expiry: '📝 *Étape 13 sur 13 - Date d\'Expiration du Permis*\n\nQuand votre permis de conduire expire-t-il?\nFormat: MM/JJ/AAAA ou tapez "passer"',
    info_review: '✅ *Révision des Informations*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n{info}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nToutes les informations sont-elles correctes?',
    info_saved: '✅ Informations enregistrées avec succès!\n\n🗓️ Maintenant, sélectionnons votre date de rendez-vous...',
    
    // Appointment details (legacy - kept for compatibility)
    enter_name: '👤 Veuillez entrer votre nom complet:',
    enter_phone: '📱 Veuillez entrer votre numéro de téléphone:',
    enter_email: '📧 Veuillez entrer votre adresse e-mail (ou tapez "passer" pour ignorer):',
    
    // Confirmation  
    confirm_booking: '*📋 Confirmer Votre Rendez-vous*\n\n📅 Date: {date}\n🕐 Heure: {time}\n⏱️ Durée: 90 minutes\n\n*Informations Client:*\n👤 Nom: {fullName}\n🎂 Date de naissance: {dob}\n🏠 Adresse: {address}\n📧 Email: {email}\n📱 Téléphone: {phone}\n🪪 Permis: {dlInfo}\n\n🏢 Service: Activations Mobile Lodge\n\nCes informations sont-elles correctes?',
    booking_confirmed: '✅ *Rendez-vous Confirmé!*\n\nVotre rendez-vous d\'activation Mobile Lodge a été réservé.\n\n📅 Date: {date}\n🕐 Heure: {time}\n⏱️ Durée: 90 minutes\n🏢 Service: Activations Mobile Lodge\n\n📱 ID de Référence: {refId}\n\n*Important:*\n• Veuillez arriver 5 minutes à l\'avance\n• Apportez une pièce d\'identité valide et les informations du compte\n• Vous recevrez des rappels avant votre rendez-vous\n\nPour voir ou annuler: /myappointments',
    
    // Appointments view
    my_appointments: '*📋 Vos Rendez-vous:*',
    no_appointments: 'Vous n\'avez aucun rendez-vous prévu.\n\nUtilisez /book pour planifier un nouveau rendez-vous.',
    appointment_item: '{index}. *Activation Mobile Lodge*\n   📅 {date}\n   🕐 {time}\n   ⏱️ Durée: 90 minutes\n   📱 Référence: {refId}\n   📍 Statut: {status}',
    
    // Cancellation
    cancel_select: '❌ *Annuler le Rendez-vous*\n\nSélectionnez le rendez-vous que vous souhaitez annuler:',
    cancel_confirm: '⚠️ *Confirmer l\'Annulation*\n\nÊtes-vous sûr de vouloir annuler ce rendez-vous?\n\n📅 Date: {date}\n🕐 Heure: {time}\n\nCette action ne peut pas être annulée.',
    cancel_success: '✅ Votre rendez-vous a été annulé avec succès.',
    cancel_failed: '❌ Échec de l\'annulation du rendez-vous. Veuillez réessayer.',
    
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
    blocked_dates_list: '*🚫 Dates Bloquées:*',
    
    // Errors
    error_generic: '❌ Une erreur s\'est produite. Veuillez réessayer.',
    error_invalid_input: '❌ Entrée invalide. Veuillez réessayer.',
    error_invalid_date: '❌ Format de date invalide. Veuillez utiliser le format MM/JJ/AAAA.',
    error_invalid_email: '❌ Adresse e-mail invalide. Veuillez entrer une adresse e-mail valide.',
    error_booking_failed: '❌ Échec de la réservation du rendez-vous. Veuillez réessayer.',
    session_expired: '⏰ Session expirée. Veuillez utiliser /book pour recommencer.',
    
    // Reminders
    reminder_12hr: '🔔 *Rappel de Rendez-vous*\n\nVous avez un rendez-vous demain:\n📅 {date}\n🕐 {time}\n🏢 Activations Mobile Lodge\n\nÀ demain!',
    reminder_3hr: '🔔 *Rappel de Rendez-vous*\n\nVotre rendez-vous est dans 3 heures:\n📅 {date}\n🕐 {time}\n🏢 Activations Mobile Lodge\n\nVeuillez préparer vos documents.',
    reminder_1hr: '⏰ *Rendez-vous Bientôt*\n\nVotre rendez-vous est dans 1 heure:\n📅 {date}\n🕐 {time}\n🏢 Activations Mobile Lodge\n\nVeuillez vous diriger vers le lieu.',
    reminder_30min: '🚨 *Rappel Final*\n\nVotre rendez-vous est dans 30 minutes:\n📅 {date}\n🕐 {time}\n🏢 Activations Mobile Lodge\n\nVeuillez arriver 5 minutes à l\'avance.',
    
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
    
    // Live Support messages  
    support_button: '💬 Support en Direct',
    support_welcome: '👋 *Bienvenue au Support en Direct*\n\nComment pouvons-nous vous aider aujourd\'hui?\n\nVeuillez décrire votre problème et un agent de support vous assistera bientôt.',
    support_ticket_created: '✅ *Ticket de Support Créé*\n\nID du Ticket: `{ticketId}`\n\nUn agent de support vous répondra bientôt. Vous recevrez toutes les réponses ici dans ce chat.',
    support_rate_limit_daily: '⚠️ Vous avez atteint la limite quotidienne de {limit} tickets de support. Veuillez réessayer demain.',
    support_rate_limit_hourly: '⚠️ Vous envoyez des messages trop rapidement. Veuillez ralentir et réessayer.',
    support_ticket_closed: '✅ Votre ticket de support a été fermé. Merci de nous avoir contactés!',
    support_agent_joined: '👨‍💻 Un agent de support a rejoint votre chat. Comment puis-je vous aider?',
    support_no_agents: '⏳ Tous les agents de support sont actuellement occupés. Votre message a été mis en file d\'attente et sera répondu dès que possible.',
    support_error: '❌ Une erreur s\'est produite. Veuillez réessayer plus tard ou contacter directement le support.',
    support_continue_prompt: 'Tapez votre message pour continuer la conversation, ou cliquez sur "Fermer le Ticket" lorsque vous avez terminé.',
    supportNotAvailable: '⚠️ Le support en direct n\'est actuellement pas disponible. Veuillez réessayer plus tard ou contacter un administrateur.',
    
    // Profile referral messages  
    profile_referral_sent: '✅ *Demande d\'Achat de Profil Envoyée!*\n\nVotre commande a été transmise à notre vendeur de profils.\n\n📱 ID de Commande: `{orderId}`\n\nVeuillez conserver cet ID de commande pour votre achat. Le vendeur vous contactera bientôt avec les profils disponibles et les prix.',
    profile_referral_error: '❌ Impossible d\'envoyer la demande d\'achat de profil pour le moment. Veuillez réessayer plus tard ou contacter le support.'
  }
};

// Helper function to get translated text
function getText(lang, key, params = {}) {
  const text = translations[lang]?.[key] || translations['en'][key] || key;
  
  // Replace placeholders with actual values
  return text.replace(/{(\w+)}/g, (match, param) => params[param] || match);
}

// Helper function to get user's language preference
function getUserLanguage(userId, referralData) {
  // Check if user has a saved language preference
  const userPrefs = referralData.userPreferences || {};
  return userPrefs[userId]?.language || 'en'; // Default to English
}

// Helper function to save user's language preference
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

module.exports = {
  translations,
  getText,
  getUserLanguage,
  saveUserLanguage
};