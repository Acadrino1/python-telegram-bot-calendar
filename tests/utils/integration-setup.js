const { Model } = require('objection');
const Knex = require('knex');
const path = require('path');

module.exports = async () => {
  console.log('🚀 Setting up integration tests...');
  
  // Setup test database configuration
  const knexConfig = {
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../database/migrations')
    },
    seeds: {
      directory: path.join(__dirname, '../../database/seeders')
    }
  };

  // Create global knex instance for tests
  global.testDb = Knex(knexConfig);
  
  // Bind Objection model to knex instance
  Model.knex(global.testDb);

  try {
    // Run migrations
    await global.testDb.migrate.latest();
    console.log('✅ Test database migrations completed');
    
    // Verify critical tables exist
    const tables = await global.testDb.raw('SELECT name FROM sqlite_master WHERE type="table"');
    const tableNames = tables.map(t => t.name);
    const requiredTables = ['users', 'appointments', 'services', 'availability_schedules'];
    
    for (const table of requiredTables) {
      if (!tableNames.includes(table)) {
        console.warn(`⚠️  Warning: Required table '${table}' not found`);
      }
    }
    
    console.log(`✅ Found ${tableNames.length} database tables`);
    
  } catch (error) {
    console.error('❌ Failed to setup integration test database:', error);
    throw error;
  }

  // Set global test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.LOG_LEVEL = 'error';
  
  console.log('✅ Integration test setup completed');
};
