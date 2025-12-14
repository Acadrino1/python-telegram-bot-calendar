// Custom Cypress commands for the admin panel testing

// Authentication commands
Cypress.Commands.add('authenticateAsAdmin', () => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('testApiUrl')}/auth/login`,
    body: {
      email: Cypress.env('adminEmail'),
      password: Cypress.env('adminPassword')
    }
  }).then(response => {
    expect(response.status).to.eq(200);
    expect(response.body).to.have.property('token');
    
    // Store token in local storage
    window.localStorage.setItem('authToken', response.body.token);
    window.localStorage.setItem('userRole', 'admin');
    
    // Set authorization header for future requests
    Cypress.env('authToken', response.body.token);
  });
});

// Navigation commands
Cypress.Commands.add('navigateToAdminSection', (section) => {
  cy.get(`[data-testid="nav-${section}"]`).click();
  cy.url().should('include', `/admin/${section}`);
  cy.waitForLoadingToFinish();
});

// Form interaction commands
Cypress.Commands.add('fillForm', (formSelector, data) => {
  Object.entries(data).forEach(([field, value]) => {
    cy.get(`${formSelector} [data-testid="${field}-input"]`).clear().type(value);
  });
});

Cypress.Commands.add('submitForm', (formSelector) => {
  cy.get(`${formSelector} [data-testid="submit-button"]`).click();
});

// Table interaction commands
Cypress.Commands.add('searchInTable', (searchTerm) => {
  cy.get('[data-testid="search-input"]').clear().type(searchTerm);
  cy.get('[data-testid="search-button"]').click();
  cy.waitForLoadingToFinish();
});

Cypress.Commands.add('sortTableBy', (column) => {
  cy.get(`[data-testid="sort-${column}"]`).click();
  cy.waitForLoadingToFinish();
});

Cypress.Commands.add('filterTableBy', (filter, value) => {
  cy.get(`[data-testid="filter-${filter}"]`).select(value);
  cy.waitForLoadingToFinish();
});

// Modal interaction commands
Cypress.Commands.add('openModal', (modalTrigger) => {
  cy.get(`[data-testid="${modalTrigger}"]`).click();
  cy.get('[data-testid="modal"]').should('be.visible');
});

Cypress.Commands.add('closeModal', () => {
  cy.get('[data-testid="modal-close"]').click();
  cy.get('[data-testid="modal"]').should('not.exist');
});

// Data manipulation commands
Cypress.Commands.add('createUser', (userData) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('testApiUrl')}/admin/users`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`
    },
    body: userData
  }).then(response => {
    expect(response.status).to.eq(201);
    return response.body.user;
  });
});

Cypress.Commands.add('updateUser', (userId, userData) => {
  return cy.request({
    method: 'PUT',
    url: `${Cypress.env('testApiUrl')}/admin/users/${userId}`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`
    },
    body: userData
  }).then(response => {
    expect(response.status).to.eq(200);
    return response.body.user;
  });
});

Cypress.Commands.add('deleteUser', (userId) => {
  return cy.request({
    method: 'DELETE',
    url: `${Cypress.env('testApiUrl')}/admin/users/${userId}`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`
    }
  }).then(response => {
    expect(response.status).to.eq(200);
  });
});

Cypress.Commands.add('createAppointment', (appointmentData) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('testApiUrl')}/admin/appointments`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`
    },
    body: appointmentData
  }).then(response => {
    expect(response.status).to.eq(201);
    return response.body.appointment;
  });
});

// Assertion helpers
Cypress.Commands.add('shouldHaveMetrics', () => {
  cy.get('[data-testid="metric-total-users"]').should('contain.text', /\d+/);
  cy.get('[data-testid="metric-total-appointments"]').should('contain.text', /\d+/);
  cy.get('[data-testid="metric-pending-appointments"]').should('contain.text', /\d+/);
});

Cypress.Commands.add('shouldDisplayTable', (tableName) => {
  cy.get(`[data-testid="${tableName}-table"]`).should('be.visible');
  cy.get(`[data-testid="${tableName}-table"] tbody tr`).should('have.length.at.least', 1);
});

// Utility commands
Cypress.Commands.add('waitForAPI', (alias, timeout = 10000) => {
  cy.wait(alias, { timeout });
});

Cypress.Commands.add('checkResponseStatus', (response, expectedStatus = 200) => {
  expect(response.status).to.eq(expectedStatus);
});

// File upload command
Cypress.Commands.add('uploadFile', (selector, fileName, fileType = 'text/plain') => {
  cy.get(selector).selectFile({
    contents: Cypress.Buffer.from('file contents'),
    fileName: fileName,
    mimeType: fileType,
  });
});

// Date picker helpers
Cypress.Commands.add('selectDate', (selector, date) => {
  cy.get(selector).click();
  cy.get('.calendar-day').contains(date.getDate()).click();
});

// Accessibility testing
Cypress.Commands.add('testKeyboardNavigation', () => {
  cy.get('body').tab();
  cy.focused().should('be.visible');
  
  // Tab through several elements
  for (let i = 0; i < 10; i++) {
    cy.focused().tab();
    cy.focused().should('be.visible');
  }
});

// Performance monitoring
Cypress.Commands.add('measurePageLoad', () => {
  cy.window().then(win => {
    const performance = win.performance;
    const timing = performance.timing;
    
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
    
    cy.log(`Page Load Time: ${loadTime}ms`);
    cy.log(`DOM Ready Time: ${domReady}ms`);
    
    // Assert performance thresholds
    expect(loadTime).to.be.lessThan(5000); // 5 seconds max
    expect(domReady).to.be.lessThan(3000); // 3 seconds max
  });
});

// Error handling
Cypress.Commands.add('handleApiError', (response) => {
  if (response.status >= 400) {
    cy.log(`API Error ${response.status}: ${response.body.error || 'Unknown error'}`);
  }
});