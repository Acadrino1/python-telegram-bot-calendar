exports.seed = async function(knex) {
  // Check if users table is empty (for providers)
  const providers = await knex('users').where('role', 'provider');
  if (providers.length === 0) {
    // Insert default provider
    await knex('users').insert([
      {
        email: 'provider1@example.com',
        password_hash: '$2b$10$YourHashedPasswordHere',
        first_name: 'Dr. John',
        last_name: 'Smith',
        phone: '555-0101',
        role: 'provider',
        timezone: 'America/New_York',
        is_active: true,
        preferences: JSON.stringify({
          notificationEmail: true,
          notificationSMS: false,
          notificationTelegram: false
        })
      }
    ]);
  }

  // Check if services table is empty
  const services = await knex('services').select('*');
  if (services.length === 0) {
    // Insert default services
    await knex('services').insert([
      {
        name: 'General Consultation',
        description: 'Standard medical consultation with a healthcare provider',
        duration_minutes: 30,
        price: 50.00,
        category: 'medical',
        is_active: true,
        booking_notice_hours: 24,
        cancellation_notice_hours: 12
      },
      {
        name: 'Specialist Visit',
        description: 'Consultation with a medical specialist',
        duration_minutes: 45,
        price: 100.00,
        category: 'medical',
        is_active: true,
        booking_notice_hours: 48,
        cancellation_notice_hours: 24
      },
      {
        name: 'Quick Checkup',
        description: 'Brief medical checkup and assessment',
        duration_minutes: 15,
        price: 30.00,
        category: 'medical',
        is_active: true,
        booking_notice_hours: 12,
        cancellation_notice_hours: 6
      },
      {
        name: 'Dental Cleaning',
        description: 'Professional teeth cleaning and oral health check',
        duration_minutes: 60,
        price: 80.00,
        category: 'dental',
        is_active: true,
        booking_notice_hours: 24,
        cancellation_notice_hours: 12
      },
      {
        name: 'Hair Styling',
        description: 'Professional haircut and styling service',
        duration_minutes: 45,
        price: 45.00,
        category: 'beauty',
        is_active: true,
        booking_notice_hours: 12,
        cancellation_notice_hours: 6
      },
      {
        name: 'Massage Therapy',
        description: 'Relaxing full-body massage therapy session',
        duration_minutes: 60,
        price: 90.00,
        category: 'wellness',
        is_active: true,
        booking_notice_hours: 24,
        cancellation_notice_hours: 12
      }
    ]);
    console.log('✅ Inserted default services');
  }

  // Check if provider_services table is empty
  const providerServices = await knex('provider_services').select('*');
  if (providerServices.length === 0) {
    // Get the first provider
    const provider = await knex('users').where('role', 'provider').first();
    
    if (provider) {
      // Get all services
      const allServices = await knex('services').select('id');
      
      // Link provider to all services
      const providerServiceLinks = allServices.map(service => ({
        provider_id: provider.id,
        service_id: service.id,
        is_available: true,
        custom_price: null,
        custom_duration: null
      }));
      
      await knex('provider_services').insert(providerServiceLinks);
      console.log('✅ Linked provider to services');
    }
  }

  console.log('✅ Database seeding complete');
};