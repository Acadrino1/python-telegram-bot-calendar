/**
 * Performance optimization indexes for high-traffic queries.
 * This version is idempotent so re-running migrations in tests won't fail
 * with "index already exists" errors (overlaps with migration 013).
 */

const isSqlite = (knex) => knex.client.config.client === 'sqlite3';

const indexExists = async (knex, table, indexName) => {
  if (isSqlite(knex)) {
    const result = await knex.raw(`PRAGMA index_list('${table}')`);
    const rows = Array.isArray(result) ? result : result?.[0] || [];
    return rows.some((row) => row.name === indexName);
  }

  // MySQL: check information_schema
  try {
    const [rows] = await knex.raw(
      `
        SELECT COUNT(1) as count
        FROM information_schema.statistics
        WHERE table_schema = database()
          AND table_name = ?
          AND index_name = ?
      `,
      [table, indexName]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row?.count || 0) > 0;
  } catch (error) {
    console.warn(`Warning: unable to verify index ${indexName} existence: ${error.message}`);
    return false;
  }
};

const createIndexSafely = async (knex, table, columns, indexName) => {
  if (await indexExists(knex, table, indexName)) return;

  if (isSqlite(knex)) {
    const cols = columns.map((c) => `"${c}"`).join(', ');
    await knex.raw(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" (${cols})`);
    return;
  }

  try {
    await knex.schema.alterTable(table, (t) => t.index(columns, indexName));
  } catch (error) {
    if (!/exists/i.test(error.message)) throw error;
  }
};

const dropIndexSafely = async (knex, table, indexName) => {
  if (!(await indexExists(knex, table, indexName))) return;

  if (isSqlite(knex)) {
    await knex.raw(`DROP INDEX IF EXISTS "${indexName}"`);
    return;
  }

  try {
    await knex.schema.alterTable(table, (t) => t.dropIndex([], indexName));
  } catch (error) {
    if (!/unknown|exists/i.test(error.message)) throw error;
  }
};

exports.up = async function(knex) {
  console.log('Adding performance optimization indexes...');

  const appointmentIndexes = [
    { columns: ['status', 'appointment_datetime'], name: 'idx_appointments_status_datetime' },
    { columns: ['provider_id', 'appointment_datetime'], name: 'idx_appointments_provider_datetime' },
    { columns: ['client_id', 'status'], name: 'idx_appointments_client_status' },
    { columns: ['client_id', 'appointment_datetime'], name: 'idx_appointments_client_datetime' },
    { columns: ['appointment_datetime', 'status'], name: 'idx_appointments_datetime_status' },
    { columns: ['created_at', 'status'], name: 'idx_appointments_created_status' },
    { columns: ['service_id', 'status'], name: 'idx_appointments_service_status' },
    { columns: ['service_id', 'appointment_datetime'], name: 'idx_appointments_service_datetime' },
    { columns: ['uuid'], name: 'idx_appointments_uuid' }
  ];
  for (const idx of appointmentIndexes) {
    await createIndexSafely(knex, 'appointments', idx.columns, idx.name);
  }
  console.log('Added appointments table indexes');

  const userIndexes = [
    { columns: ['telegram_id'], name: 'idx_users_telegram_id' },
    { columns: ['telegram_id', 'role'], name: 'idx_users_telegram_role' },
    { columns: ['email'], name: 'idx_users_email' },
    { columns: ['email', 'role'], name: 'idx_users_email_role' },
    { columns: ['role'], name: 'idx_users_role' },
    { columns: ['role', 'is_active'], name: 'idx_users_role_active' },
    { columns: ['is_active'], name: 'idx_users_active' },
    { columns: ['created_at'], name: 'idx_users_created' }
  ];
  for (const idx of userIndexes) {
    await createIndexSafely(knex, 'users', idx.columns, idx.name);
  }
  console.log('Added users table indexes');

  const serviceIndexes = [
    { columns: ['is_active'], name: 'idx_services_active' },
    { columns: ['is_active', 'duration_minutes'], name: 'idx_services_active_duration' },
    { columns: ['provider_id'], name: 'idx_services_provider' },
    { columns: ['provider_id', 'is_active'], name: 'idx_services_provider_active' },
    { columns: ['price'], name: 'idx_services_price' },
    { columns: ['is_active', 'price'], name: 'idx_services_active_price' }
  ];
  for (const idx of serviceIndexes) {
    await createIndexSafely(knex, 'services', idx.columns, idx.name);
  }
  console.log('Added services table indexes');

  if (await knex.schema.hasTable('availability')) {
    const availabilityIndexes = [
      { columns: ['provider_id', 'day_of_week'], name: 'idx_availability_provider_day' },
      { columns: ['provider_id', 'is_available'], name: 'idx_availability_provider_available' }
    ];
    for (const idx of availabilityIndexes) {
      await createIndexSafely(knex, 'availability', idx.columns, idx.name);
    }
    console.log('Added availability table indexes');
  }

  if (await knex.schema.hasTable('notifications')) {
    const notificationIndexes = [
      { columns: ['user_id', 'is_read'], name: 'idx_notifications_user_read' },
      { columns: ['user_id', 'created_at'], name: 'idx_notifications_user_created' },
      { columns: ['type', 'is_read'], name: 'idx_notifications_type_read' }
    ];
    for (const idx of notificationIndexes) {
      await createIndexSafely(knex, 'notifications', idx.columns, idx.name);
    }
    console.log('Added notifications table indexes');
  }

  if (await knex.schema.hasTable('waitlist')) {
    const waitlistIndexes = [
      { columns: ['client_id', 'status'], name: 'idx_waitlist_client_status' },
      { columns: ['provider_id', 'status'], name: 'idx_waitlist_provider_status' },
      { columns: ['requested_datetime', 'status'], name: 'idx_waitlist_datetime_status' }
    ];
    for (const idx of waitlistIndexes) {
      await createIndexSafely(knex, 'waitlist', idx.columns, idx.name);
    }
    console.log('Added waitlist table indexes');
  }

  console.log('Performance indexes installation completed');
};

exports.down = async function(knex) {
  console.log('Removing performance optimization indexes...');

  const appointmentIndexes = [
    'idx_appointments_status_datetime',
    'idx_appointments_provider_datetime',
    'idx_appointments_client_status',
    'idx_appointments_client_datetime',
    'idx_appointments_datetime_status',
    'idx_appointments_created_status',
    'idx_appointments_service_status',
    'idx_appointments_service_datetime',
    'idx_appointments_uuid'
  ];
  for (const name of appointmentIndexes) {
    await dropIndexSafely(knex, 'appointments', name);
  }

  const userIndexes = [
    'idx_users_telegram_id',
    'idx_users_telegram_role',
    'idx_users_email',
    'idx_users_email_role',
    'idx_users_role',
    'idx_users_role_active',
    'idx_users_active',
    'idx_users_created'
  ];
  for (const name of userIndexes) {
    await dropIndexSafely(knex, 'users', name);
  }

  const serviceIndexes = [
    'idx_services_active',
    'idx_services_active_duration',
    'idx_services_provider',
    'idx_services_provider_active',
    'idx_services_price',
    'idx_services_active_price'
  ];
  for (const name of serviceIndexes) {
    await dropIndexSafely(knex, 'services', name);
  }

  if (await knex.schema.hasTable('availability')) {
    const availabilityIndexes = [
      'idx_availability_provider_day',
      'idx_availability_provider_available'
    ];
    for (const name of availabilityIndexes) {
      await dropIndexSafely(knex, 'availability', name);
    }
  }

  if (await knex.schema.hasTable('notifications')) {
    const notificationIndexes = [
      'idx_notifications_user_read',
      'idx_notifications_user_created',
      'idx_notifications_type_read'
    ];
    for (const name of notificationIndexes) {
      await dropIndexSafely(knex, 'notifications', name);
    }
  }

  if (await knex.schema.hasTable('waitlist')) {
    const waitlistIndexes = [
      'idx_waitlist_client_status',
      'idx_waitlist_provider_status',
      'idx_waitlist_datetime_status'
    ];
    for (const name of waitlistIndexes) {
      await dropIndexSafely(knex, 'waitlist', name);
    }
  }

  console.log('Performance indexes removal completed');
};
