const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'tests/e2e/support/e2e.js',
    specPattern: 'tests/e2e/**/*.cy.{js,jsx,ts,tsx}',
    videosFolder: 'tests/reports/videos',
    screenshotsFolder: 'tests/reports/screenshots',
    video: true,
    screenshot: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    pageLoadTimeout: 10000,
    
    setupNodeEvents(on, config) {
      // Task for database operations
      on('task', {
        async clearDatabase() {
          const knex = require('knex')(require('../../database/knexfile').test);
          await knex('appointment_history').del();
          await knex('notifications').del();
          await knex('waitlist_entries').del();
          await knex('appointments').del();
          await knex('users').del();
          await knex.destroy();
          return null;
        },
        
        async seedDatabase() {
          const knex = require('knex')(require('../../database/knexfile').test);
          const TestHelpers = require('../utils/test-helpers');
          
          // Create admin user
          const adminUser = await TestHelpers.createAdminUser();
          await knex('users').insert(adminUser);
          
          // Create test users
          const users = TestHelpers.generateTestData('users', 10);
          await knex('users').insert(users);
          
          // Create test appointments
          const appointments = TestHelpers.generateTestData('appointments', 20);
          await knex('appointments').insert(appointments);
          
          await knex.destroy();
          return null;
        },
        
        log(message) {
          console.log(message);
          return null;
        }
      });
      
      // Code coverage support
      require('@cypress/code-coverage/task')(on, config);
      
      return config;
    }
  },
  
  env: {
    adminEmail: 'admin@example.com',
    adminPassword: 'adminpassword',
    testApiUrl: 'http://localhost:3000/api'
  },
  
  retries: {
    runMode: 2,
    openMode: 0
  }
});