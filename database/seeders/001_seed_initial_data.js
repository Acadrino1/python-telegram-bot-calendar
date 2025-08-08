exports.seed = function(knex) {
  // Deletes ALL existing entries
  return knex('notifications').del()
    .then(() => knex('notification_templates').del())
    .then(() => knex('appointment_history').del())
    .then(() => knex('waitlist').del())
    .then(() => knex('appointments').del())
    .then(() => knex('availability_exceptions').del())
    .then(() => knex('availability_schedules').del())
    .then(() => knex('services').del())
    .then(() => knex('users').del())
    .then(() => {
      // Insert users
      return knex('users').insert([
        {
          id: 1,
          email: 'admin@scheduler.com',
          password_hash: '$2b$10$example.hash.for.admin.user',
          first_name: 'System',
          last_name: 'Administrator',
          phone: '+1234567890',
          role: 'admin',
          timezone: 'America/New_York',
          email_notifications: true,
          sms_notifications: true
        },
        {
          id: 2,
          email: 'dr.smith@clinic.com',
          password_hash: '$2b$10$example.hash.for.provider.user',
          first_name: 'Dr. Jane',
          last_name: 'Smith',
          phone: '+1234567891',
          role: 'provider',
          timezone: 'America/New_York',
          email_notifications: true,
          sms_notifications: true
        },
        {
          id: 3,
          email: 'john.doe@email.com',
          password_hash: '$2b$10$example.hash.for.client.user',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+1234567892',
          role: 'client',
          timezone: 'America/New_York',
          email_notifications: true,
          sms_notifications: false
        }
      ]);
    })
    .then(() => {
      // Insert services
      return knex('services').insert([
        {
          id: 1,
          provider_id: 2,
          name: 'New Registration',
          description: 'Complete registration and activation for new customers',
          duration_minutes: 90,
          price: 0.00,
          color_code: '#E91E63',
          booking_rules: JSON.stringify({
            advance_booking_days: 21,
            cancellation_hours: 24,
            same_day_booking: false,
            min_advance_hours: 24
          })
        },
        {
          id: 2,
          provider_id: 2,
          name: 'Account Update',
          description: 'Update existing account information',
          duration_minutes: 30,
          price: 0.00,
          color_code: '#4CAF50',
          booking_rules: JSON.stringify({
            advance_booking_days: 14,
            cancellation_hours: 12,
            same_day_booking: true
          })
        },
        {
          id: 3,
          provider_id: 2,
          name: 'Technical Support',
          description: 'Technical assistance and troubleshooting',
          duration_minutes: 45,
          price: 0.00,
          color_code: '#2196F3',
          booking_rules: JSON.stringify({
            advance_booking_days: 7,
            cancellation_hours: 6,
            same_day_booking: true
          })
        },
        {
          id: 4,
          provider_id: 2,
          name: 'Plan Upgrade',
          description: 'Upgrade to a different service plan',
          duration_minutes: 60,
          price: 0.00,
          color_code: '#FF9800',
          booking_rules: JSON.stringify({
            advance_booking_days: 14,
            cancellation_hours: 24,
            same_day_booking: false
          })
        }
      ]);
    })
    .then(() => {
      // Insert availability schedules (Monday to Friday, 9 AM to 5 PM)
      const schedules = [];
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      days.forEach(day => {
        schedules.push({
          provider_id: 2,
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '12:00:00',
          is_active: true
        });
        schedules.push({
          provider_id: 2,
          day_of_week: day,
          start_time: '13:00:00',
          end_time: '17:00:00',
          is_active: true
        });
      });
      return knex('availability_schedules').insert(schedules);
    })
    .then(() => {
      // Insert notification templates
      return knex('notification_templates').insert([
        {
          name: 'appointment_confirmation',
          type: 'email',
          subject: 'Appointment Confirmation - {service_name}',
          content: `Dear {client_name},

Your appointment has been confirmed:

Service: {service_name}
Provider: {provider_name}
Date & Time: {appointment_datetime}
Duration: {duration_minutes} minutes
Location: {provider_address}

To reschedule or cancel, please contact us at least {cancellation_hours} hours in advance.

Best regards,
The Appointment Team`
        },
        {
          name: 'appointment_confirmation',
          type: 'sms',
          content: 'Appointment confirmed: {service_name} with {provider_name} on {appointment_date} at {appointment_time}. Location: {provider_address}'
        },
        {
          name: 'reminder_24h',
          type: 'email',
          subject: 'Reminder: Appointment Tomorrow - {service_name}',
          content: `Dear {client_name},

This is a reminder that you have an appointment tomorrow:

Service: {service_name}
Provider: {provider_name}
Date & Time: {appointment_datetime}
Duration: {duration_minutes} minutes

Please arrive 10 minutes early. To reschedule or cancel, please contact us immediately.

Best regards,
The Appointment Team`
        },
        {
          name: 'reminder_24h',
          type: 'sms',
          content: 'Reminder: You have an appointment tomorrow at {appointment_time} with {provider_name} for {service_name}. Please arrive 10 minutes early.'
        },
        {
          name: 'appointment_cancelled',
          type: 'email',
          subject: 'Appointment Cancelled - {service_name}',
          content: `Dear {client_name},

Your appointment has been cancelled:

Service: {service_name}
Provider: {provider_name}
Original Date & Time: {appointment_datetime}
Reason: {cancellation_reason}

Please contact us to reschedule if needed.

Best regards,
The Appointment Team`
        },
        {
          name: 'waitlist_available',
          type: 'email',
          subject: 'Appointment Available - {service_name}',
          content: `Dear {client_name},

Good news! An appointment slot has become available for your waitlisted service:

Service: {service_name}
Provider: {provider_name}
Available Date & Time: {appointment_datetime}

This slot will be held for you for 2 hours. Please confirm by replying to this email or calling us.

Best regards,
The Appointment Team`
        }
      ]);
    });
};