# Appointment Scheduler API

A complete appointment scheduling and management system built with Node.js, featuring availability checking, booking confirmation, client notifications, waitlist management, and comprehensive timezone handling.

## 🚀 Features

### Core Functionality
- **Availability Checking & Conflict Resolution**: Real-time slot availability with intelligent conflict detection
- **Booking Confirmation & Cancellation Logic**: Automated booking workflows with configurable policies
- **Client Notification & Reminder Systems**: Multi-channel notifications (Email & SMS) with automated reminders
- **Appointment Modification & Rescheduling**: Flexible rescheduling with availability validation
- **Waitlist & Overbooking Management**: Intelligent waitlist processing with automatic notifications
- **Timezone Handling & Date Validation**: Full timezone support with robust date/time validation

### Advanced Features
- **Multi-role Authentication**: Clients, Providers, and Administrators
- **Service Management**: Configurable services with custom booking rules
- **Appointment History Tracking**: Complete audit trail of all appointment changes
- **Real-time Notifications**: Email and SMS notifications with retry logic
- **Performance Monitoring**: Comprehensive logging and error handling
- **API Rate Limiting**: Protection against abuse with configurable limits

## 📋 Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Services Architecture](#services-architecture)
- [Testing](#testing)
- [Deployment](#deployment)
- [Monitoring](#monitoring)

## 🛠 Installation

### Prerequisites

- Node.js 16+ and npm
- MySQL 5.7+ or 8.0+
- Redis (optional, for caching)
- Email service (Gmail, SendGrid, etc.)
- Twilio account (for SMS notifications)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd appointment-scheduler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup database**
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE appointment_scheduler;"
   
   # Run migrations
   npm run migrate
   
   # Seed initial data (optional)
   npm run seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## ⚙️ Configuration

### Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=appointment_scheduler
DB_USER=scheduler_user
DB_PASSWORD=secure_password

# Server Configuration
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRY=24h

# Email Configuration (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Timezone Configuration
DEFAULT_TIMEZONE=America/New_York

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Scheduling Configuration
DEFAULT_APPOINTMENT_DURATION=30
BOOKING_ADVANCE_DAYS=30
CANCELLATION_HOURS=24
REMINDER_HOURS_BEFORE=24
```

### Service Configuration

Each service can have custom booking rules:

```json
{
  "advance_booking_days": 30,
  "cancellation_hours": 24,
  "same_day_booking": false,
  "max_advance_days": 90,
  "require_confirmation": false,
  "allow_waitlist": true
}
```

## 📚 API Documentation

### Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

### Core Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

#### Appointments
- `GET /api/appointments` - Get appointments (filtered by user role)
- `POST /api/appointments` - Book new appointment (clients only)
- `GET /api/appointments/:uuid` - Get specific appointment
- `PUT /api/appointments/:uuid` - Update appointment
- `DELETE /api/appointments/:uuid` - Cancel appointment
- `POST /api/appointments/:uuid/confirm` - Confirm appointment (providers)
- `POST /api/appointments/:uuid/start` - Start appointment (providers)
- `POST /api/appointments/:uuid/complete` - Complete appointment (providers)
- `POST /api/appointments/:uuid/no-show` - Mark as no-show (providers)

#### Availability
- `GET /api/availability/:providerId/:date` - Get available slots
- `GET /api/availability/:providerId/range` - Get availability range

#### Services
- `GET /api/services` - Get all services
- `POST /api/services` - Create service (providers)
- `PUT /api/services/:id` - Update service (providers)

#### Waitlist
- `GET /api/waitlist` - Get waitlist entries
- `POST /api/waitlist` - Add to waitlist
- `PUT /api/waitlist/:id` - Update waitlist entry

### Request/Response Examples

#### Book Appointment

**Request:**
```bash
POST /api/appointments
Authorization: Bearer <client-token>
Content-Type: application/json

{
  "provider_id": 2,
  "service_id": 1,
  "appointment_datetime": "2024-01-15T14:00:00Z",
  "notes": "Regular checkup appointment",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "message": "Appointment booked successfully",
  "appointment": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "client_id": 3,
    "provider_id": 2,
    "service_id": 1,
    "appointment_datetime": "2024-01-15T14:00:00.000Z",
    "duration_minutes": 30,
    "status": "scheduled",
    "notes": "Regular checkup appointment",
    "price": 150.00,
    "client": {
      "id": 3,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@email.com"
    },
    "provider": {
      "id": 2,
      "first_name": "Dr. Jane",
      "last_name": "Smith",
      "email": "dr.smith@clinic.com"
    },
    "service": {
      "id": 1,
      "name": "General Consultation",
      "duration_minutes": 30,
      "price": 150.00
    }
  }
}
```

## 🗄 Database Schema

### Core Tables

#### Users
Stores client, provider, and admin user information with role-based access control.

#### Services
Defines services offered by providers with custom booking rules and pricing.

#### Appointments
Central appointment records with status tracking and comprehensive metadata.

#### Availability Schedules
Provider regular weekly schedules with effective date ranges.

#### Availability Exceptions
Special availability overrides (holidays, time off, special hours).

#### Waitlist
Client waitlist entries with preferences and automatic processing.

#### Notifications
Notification queue with retry logic and delivery tracking.

### Database Relationships

```
Users (1) -----> (M) Services
Users (1) -----> (M) Appointments (Client)
Users (1) -----> (M) Appointments (Provider)
Services (1) ---> (M) Appointments
Appointments (1) -> (M) AppointmentHistory
Appointments (1) -> (M) Notifications
```

## 🏗 Services Architecture

### AvailabilityService
- Real-time availability checking
- Conflict detection and resolution
- Schedule management
- Timezone handling

### BookingService
- Appointment lifecycle management
- Booking confirmation and validation
- Cancellation and rescheduling logic
- Waitlist integration

### NotificationService
- Multi-channel notification delivery
- Template management
- Automated reminders
- Retry logic and error handling

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run integration tests
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/integration/appointment.test.js
```

### Test Structure

```
tests/
├── unit/              # Unit tests for individual components
│   ├── models/        # Model tests
│   ├── services/      # Service tests
│   └── utils/         # Utility tests
├── integration/       # Integration tests
│   ├── appointment.test.js
│   ├── availability.test.js
│   └── notification.test.js
└── fixtures/          # Test data and helpers
```

### Test Coverage

The test suite covers:
- ✅ Appointment booking and management
- ✅ Availability checking and conflicts
- ✅ User authentication and authorization
- ✅ Service management
- ✅ Waitlist functionality
- ✅ Notification delivery
- ✅ Error handling and edge cases

## 🚀 Deployment

### Docker Deployment

1. **Build and run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

2. **The stack includes:**
   - Node.js application server
   - MySQL database
   - Redis for caching
   - Nginx reverse proxy

### Manual Deployment

1. **Prepare production environment:**
   ```bash
   # Set NODE_ENV
   export NODE_ENV=production
   
   # Install production dependencies
   npm ci --only=production
   
   # Run database migrations
   npm run migrate
   ```

2. **Start with PM2 (recommended):**
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name "appointment-scheduler"
   pm2 startup
   pm2 save
   ```

### Environment Considerations

- Use strong JWT secrets in production
- Configure proper HTTPS certificates
- Set up database connection pooling
- Configure email/SMS service credentials
- Set up monitoring and logging
- Configure backup strategies

## 📊 Monitoring

### Health Checks

The application provides health check endpoints:

- `GET /health` - Basic health status
- `GET /api` - API documentation and status

### Logging

Comprehensive logging includes:
- Request/response logging
- Appointment actions
- Notification delivery
- Error tracking
- Performance metrics

### Metrics

Key metrics monitored:
- Appointment booking success rate
- Notification delivery rate
- API response times
- Database performance
- User activity patterns

## 🔧 Maintenance

### Database Maintenance

```bash
# Backup database
mysqldump -u scheduler_user -p appointment_scheduler > backup.sql

# Clean old notifications (automated, runs daily)
# Processed automatically by the application

# Update database schema
npm run migrate
```

### Performance Optimization

- Database indexing on frequently queried fields
- Connection pooling for database connections
- Caching for frequently accessed data
- Rate limiting to prevent abuse
- Efficient query patterns in models

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the documentation
- Review the test examples
- Open an issue on GitHub
- Contact the development team

---

**Built with ❤️ by the Swarm Integration Engineer**

*Complete appointment scheduling solution with enterprise-grade features and reliability.*