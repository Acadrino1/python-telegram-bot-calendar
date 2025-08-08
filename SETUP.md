# 🚀 Quick Start Guide - Appointment Scheduler

## Prerequisites
- Node.js 18+ installed
- Docker and Docker Compose installed
- Terminal/Command Line access

## Option 1: Automated Setup with Docker (Recommended)

```bash
# 1. Start MySQL with Docker
sudo docker-compose up -d mysql

# 2. Wait 10 seconds for MySQL to initialize
sleep 10

# 3. Run database migrations
npm run migrate

# 4. (Optional) Seed sample data
npm run seed

# 5. Start the application
npm start
```

The application will be available at `http://localhost:3000`

## Option 2: Using the Setup Script

```bash
# Run the automated setup script
sudo ./start-docker.sh

# Then start the application
npm start
```

## Option 3: Manual MySQL Setup (Without Docker)

If you have MySQL installed locally:

1. Create the database:
```sql
CREATE DATABASE appointment_scheduler;
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'apppassword123';
GRANT ALL PRIVILEGES ON appointment_scheduler.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
```

2. Update `.env` file with your MySQL credentials

3. Run migrations:
```bash
npm run migrate
```

4. Start the application:
```bash
npm start
```

## 📊 Database Management

Access Adminer (Database UI) at: `http://localhost:8080`
- Server: `mysql`
- Username: `appuser`
- Password: `apppassword123`
- Database: `appointment_scheduler`

## 🧪 Testing the API

### 1. Register a new user:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "role": "client"
  }'
```

### 2. Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the token from the response for authenticated requests.

### 3. Get available services (authenticated):
```bash
curl -X GET http://localhost:3000/api/services \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🛠️ Useful Commands

```bash
# Docker commands
sudo docker-compose up -d        # Start all containers
sudo docker-compose down         # Stop all containers
sudo docker-compose logs mysql   # View MySQL logs
sudo docker-compose ps          # Check container status

# Database commands
npm run migrate                  # Run migrations
npm run seed                    # Seed sample data

# Application commands
npm start                       # Start production server
npm run dev                     # Start development server with nodemon
npm test                        # Run tests
npm run lint                    # Run linter
```

## 🔧 Troubleshooting

### MySQL Connection Error
If you get "ECONNREFUSED" error:
1. Check if MySQL container is running: `sudo docker-compose ps`
2. Wait a bit longer for MySQL to initialize
3. Check MySQL logs: `sudo docker-compose logs mysql`

### Permission Denied for Docker
Add your user to the docker group:
```bash
sudo usermod -aG docker $USER
newgrp docker
```
Then logout and login again.

### Port Already in Use
If port 3306 is already in use:
1. Stop existing MySQL: `sudo systemctl stop mysql`
2. Or change the port in `docker-compose.yml` and `.env`

## 📚 API Documentation

Once the server is running, visit:
- API Info: `http://localhost:3000/api`
- Health Check: `http://localhost:3000/health`

Full API documentation is available in the README.md file.

## 🎯 Next Steps

1. Create provider accounts and services
2. Set up availability schedules
3. Configure email/SMS notifications
4. Start booking appointments!

## 💡 Tips

- Use Adminer at `http://localhost:8080` to explore the database
- Check `logs/app.log` for application logs
- Run `npm run test` to ensure everything is working
- Use Postman or similar tool to test API endpoints

## 🆘 Need Help?

- Check the logs: `docker-compose logs` and `logs/app.log`
- Verify all services are running: `docker-compose ps`
- Ensure `.env` file has correct database credentials
- Make sure ports 3000, 3306, and 8080 are available