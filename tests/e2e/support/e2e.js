// Import commands.js using ES2015 syntax:
import './commands';

// Import Cypress code coverage support
import '@cypress/code-coverage/support';

// Global configuration for E2E tests
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false here prevents Cypress from failing the test
  // on uncaught exceptions that we might expect in testing
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  if (err.message.includes('Script error')) {
    return false;
  }
  
  return true;
});

// Add custom commands for common operations
Cypress.Commands.add('login', (email = Cypress.env('adminEmail'), password = Cypress.env('adminPassword')) => {
  cy.session([email, password], () => {
    cy.visit('/admin/login');
    cy.get('[data-testid="email-input"]').type(email);
    cy.get('[data-testid="password-input"]').type(password);
    cy.get('[data-testid="login-button"]').click();
    cy.url().should('include', '/admin/dashboard');
  });
});

Cypress.Commands.add('loginAsAdmin', () => {
  cy.login(Cypress.env('adminEmail'), Cypress.env('adminPassword'));
});

Cypress.Commands.add('createTestUser', (userData = {}) => {
  const defaultUser = {
    first_name: 'Test',
    last_name: 'User',
    email: `test${Date.now()}@example.com`,
    phone_number: '+1234567890',
    telegram_user_id: `${Date.now()}`,
    role: 'user'
  };
  
  const user = { ...defaultUser, ...userData };
  
  cy.request({
    method: 'POST',
    url: `${Cypress.env('testApiUrl')}/admin/users`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    },
    body: user
  }).then(response => {
    expect(response.status).to.eq(201);
    return response.body.user;
  });
});

Cypress.Commands.add('createTestAppointment', (appointmentData = {}) => {
  const defaultAppointment = {
    user_id: 1,
    appointment_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    appointment_time: '10:00:00',
    service_type: 'consultation',
    status: 'scheduled',
    notes: 'Test appointment'
  };
  
  const appointment = { ...defaultAppointment, ...appointmentData };
  
  cy.request({
    method: 'POST',
    url: `${Cypress.env('testApiUrl')}/admin/appointments`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    },
    body: appointment
  }).then(response => {
    expect(response.status).to.eq(201);
    return response.body.appointment;
  });
});

Cypress.Commands.add('waitForLoadingToFinish', () => {
  cy.get('[data-testid="loading-indicator"]', { timeout: 1000 }).should('not.exist');
  cy.get('[data-testid="spinner"]', { timeout: 1000 }).should('not.exist');
  cy.get('.loading', { timeout: 1000 }).should('not.exist');
});

Cypress.Commands.add('checkAccessibility', () => {
  cy.injectAxe();
  cy.checkA11y();
});

// Global before hook
beforeEach(() => {
  // Clear local storage
  cy.clearLocalStorage();
  
  // Set viewport for consistent testing
  cy.viewport(1280, 720);
  
  // Intercept API calls for better control
  cy.intercept('GET', '/api/admin/dashboard').as('getDashboard');
  cy.intercept('GET', '/api/admin/users*').as('getUsers');
  cy.intercept('GET', '/api/admin/appointments*').as('getAppointments');
});

// Global after hook
afterEach(() => {
  // Take screenshot on failure
  cy.screenshot({ capture: 'runner', onlyOnFailure: true });
});