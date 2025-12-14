/**
 * French - Booking translations
 * Flux de réservation, sélection date/heure, confirmation, vue rendez-vous
 */

module.exports = {
  // Booking flow
  book_start: '📅 *Réservez Votre Rendez-vous*\n\nPlanifions votre rendez-vous!',
  select_date: '📅 Veuillez sélectionner une date pour votre rendez-vous:',
  select_time: '🕐 Sélectionnez une heure de rendez-vous pour le {date}:',
  no_dates_available: 'Aucune date disponible trouvée. Veuillez réessayer plus tard.',
  no_times_available: 'Aucune heure disponible pour cette date. Veuillez sélectionner une autre date.',

  // Appointment details (legacy - kept for compatibility)
  enter_name: '👤 Veuillez entrer votre nom complet:',
  enter_phone: '📱 Veuillez entrer votre numéro de téléphone:',
  enter_email: '📧 Veuillez entrer votre adresse e-mail (ou tapez "passer" pour ignorer):',

  // Confirmation
  confirm_booking: '*📋 Confirmer Votre Rendez-vous*\n\n📅 Date: {date}\n🕐 Heure: {time}\n⏱️ Durée: 90 minutes\n\n*Informations Client:*\n👤 Nom: {fullName}\n🎂 Date de naissance: {dob}\n🏠 Adresse: {address}\n📧 Email: {email}\n📱 Téléphone: {phone}\n🪪 Permis: {dlInfo}\n\n🏢 Service: Lodge Scheduler\n\nCes informations sont-elles correctes?',
  booking_confirmed: '✅ *Rendez-vous Confirmé!*\n\nVotre rendez-vous a été réservé.\n\n📅 Date: {date}\n🕐 Heure: {time}\n⏱️ Durée: 90 minutes\n🏢 Service: Lodge Scheduler\n\n📱 ID de Référence: {refId}\n\n*Important:*\n• Veuillez arriver 5 minutes à l\'avance\n• Apportez une pièce d\'identité valide et les informations du compte\n• Vous recevrez des rappels avant votre rendez-vous\n\nPour voir ou annuler: /myappointments',

  // Appointments view
  my_appointments: '*📋 Vos Rendez-vous:*',
  no_appointments: 'Vous n\'avez aucun rendez-vous prévu.\n\nUtilisez /book pour planifier un nouveau rendez-vous.',
  appointment_item: '{index}. *Rendez-vous*\n   📅 {date}\n   🕐 {time}\n   ⏱️ Durée: 90 minutes\n   📱 Référence: {refId}\n   📍 Statut: {status}',

  // Cancellation
  cancel_select: '❌ *Annuler le Rendez-vous*\n\nSélectionnez le rendez-vous que vous souhaitez annuler:',
  cancel_confirm: '⚠️ *Confirmer l\'Annulation*\n\nÊtes-vous sûr de vouloir annuler ce rendez-vous?\n\n📅 Date: {date}\n🕐 Heure: {time}\n\nCette action ne peut pas être annulée.',
  cancel_success: '✅ Votre rendez-vous a été annulé avec succès.',
  cancel_failed: '❌ Échec de l\'annulation du rendez-vous. Veuillez réessayer.',

  // Reminders
  reminder_12hr: '🔔 *Rappel de Rendez-vous*\n\nVous avez un rendez-vous demain:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nÀ demain!',
  reminder_3hr: '🔔 *Rappel de Rendez-vous*\n\nVotre rendez-vous est dans 3 heures:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nVeuillez préparer vos documents.',
  reminder_1hr: '⏰ *Rendez-vous Bientôt*\n\nVotre rendez-vous est dans 1 heure:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nVeuillez vous diriger vers le lieu.',
  reminder_30min: '🚨 *Rappel Final*\n\nVotre rendez-vous est dans 30 minutes:\n📅 {date}\n🕐 {time}\n🏢 Lodge Scheduler\n\nVeuillez arriver 5 minutes à l\'avance.'
};
