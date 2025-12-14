module.exports = {
  authenticateAsAdmin: authenticateAsAdmin,
  trackDatabaseTime: trackDatabaseTime,
  validateResponse: validateResponse,
  generateTestData: generateTestData
};

// Custom processor functions for Artillery load testing

function authenticateAsAdmin(requestParams, context, ee, next) {
  // Authenticate as admin user for subsequent requests
  const adminCredentials = {
    email: 'admin@example.com',
    password: 'adminpassword'
  };
  
  const request = require('request');
  const options = {
    url: `${context.vars.target}/api/auth/login`,
    method: 'POST',
    json: true,
    body: adminCredentials
  };
  
  request(options, (error, response, body) => {
    if (error) {
      return next(error);
    }
    
    if (response.statusCode === 200 && body.token) {
      context.vars.adminToken = body.token;
      
      // Track successful authentications
      ee.emit('counter', 'auth.success', 1);
    } else {
      ee.emit('counter', 'auth.failure', 1);
    }
    
    return next();
  });
}

function trackDatabaseTime(requestParams, response, context, ee, next) {
  // Extract database query time from response headers
  const dbTime = response.headers['x-db-time'];
  
  if (dbTime) {
    ee.emit('histogram', 'database.query_time', parseFloat(dbTime));
  }
  
  // Track response size
  if (response.body) {
    const responseSize = Buffer.byteLength(JSON.stringify(response.body), 'utf8');
    ee.emit('histogram', 'response.size', responseSize);
  }
  
  return next();
}

function validateResponse(requestParams, response, context, ee, next) {
  // Custom response validation
  if (response.statusCode === 200) {
    // Validate response structure for different endpoints
    const url = requestParams.url;
    
    if (url.includes('/api/admin/dashboard')) {
      if (!response.body || !response.body.totalUsers) {
        ee.emit('counter', 'validation.dashboard_invalid', 1);
      } else {
        ee.emit('counter', 'validation.dashboard_valid', 1);
      }
    }
    
    if (url.includes('/api/admin/users')) {
      if (!response.body || !response.body.users || !Array.isArray(response.body.users)) {
        ee.emit('counter', 'validation.users_invalid', 1);
      } else {
        ee.emit('counter', 'validation.users_valid', 1);
        ee.emit('histogram', 'response.user_count', response.body.users.length);
      }
    }
    
    if (url.includes('/api/admin/appointments')) {
      if (!response.body || !response.body.appointments) {
        ee.emit('counter', 'validation.appointments_invalid', 1);
      } else {
        ee.emit('counter', 'validation.appointments_valid', 1);
        ee.emit('histogram', 'response.appointment_count', response.body.appointments.length);
      }
    }
  }
  
  // Track error types
  if (response.statusCode >= 400) {
    ee.emit('counter', `errors.${response.statusCode}`, 1);
    
    // Log error details for debugging
    if (response.body && response.body.error) {
      console.log(`Error ${response.statusCode}: ${response.body.error}`);
    }
  }
  
  return next();
}

function generateTestData(requestParams, context, ee, next) {
  // Generate dynamic test data for requests
  const faker = require('faker');
  
  context.vars.randomUser = {
    first_name: faker.name.firstName(),
    last_name: faker.name.lastName(),
    email: faker.internet.email(),
    phone_number: faker.phone.phoneNumber('+1##########')
  };
  
  context.vars.randomAppointment = {
    appointment_date: faker.date.future().toISOString().split('T')[0],
    appointment_time: faker.random.arrayElement(['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00']),
    service_type: faker.random.arrayElement(['consultation', 'meeting', 'interview', 'review']),
    notes: faker.lorem.sentence()
  };
  
  return next();
}

// Performance monitoring utilities
const performanceMonitor = {
  startTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  responseTimeSum: 0,
  
  trackRequest: function(responseTime, isError = false) {
    this.requestCount++;
    this.responseTimeSum += responseTime;
    
    if (isError) {
      this.errorCount++;
    }
  },
  
  getStats: function() {
    const runtime = Date.now() - this.startTime;
    const avgResponseTime = this.requestCount > 0 ? this.responseTimeSum / this.requestCount : 0;
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
    const requestsPerSecond = this.requestCount / (runtime / 1000);
    
    return {
      runtime: runtime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: errorRate.toFixed(2) + '%',
      avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
      requestsPerSecond: requestsPerSecond.toFixed(2)
    };
  }
};

// Memory usage tracking
function trackMemoryUsage(requestParams, response, context, ee, next) {
  const memUsage = process.memoryUsage();
  
  ee.emit('histogram', 'memory.heapUsed', memUsage.heapUsed / 1024 / 1024); // MB
  ee.emit('histogram', 'memory.heapTotal', memUsage.heapTotal / 1024 / 1024); // MB
  ee.emit('histogram', 'memory.external', memUsage.external / 1024 / 1024); // MB
  
  return next();
}

// CPU usage tracking (simplified)
function trackCpuUsage(requestParams, response, context, ee, next) {
  const startTime = process.hrtime();
  
  // Simulate some CPU work to measure
  setTimeout(() => {
    const diff = process.hrtime(startTime);
    const cpuTime = diff[0] * 1000 + diff[1] * 1e-6; // Convert to milliseconds
    
    ee.emit('histogram', 'cpu.processing_time', cpuTime);
  }, 0);
  
  return next();
}

module.exports.trackMemoryUsage = trackMemoryUsage;
module.exports.trackCpuUsage = trackCpuUsage;
module.exports.performanceMonitor = performanceMonitor;