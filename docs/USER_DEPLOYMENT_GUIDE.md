# User Deployment Guide
## Telegram Appointment Scheduler Bot - Complete Setup

**Integration Agent**: Swarm Coordination Project  
**Guide Version**: 1.0.0  
**Last Updated**: 2025-08-08  
**Difficulty**: Beginner to Intermediate

---

## 🎯 Overview

This guide will walk you through deploying the fully restored Telegram appointment scheduler bot. The system has been completely cleaned of security vulnerabilities and contamination, and is now ready for production use.

**⏱️ Estimated Time**: 30-45 minutes  
**👥 Target Audience**: System administrators, developers, business owners  
**📋 Prerequisites**: Basic command line knowledge, Telegram account, MySQL database access

---

## 🚨 Important Security Notice

**CRITICAL**: The original bot token `8124276494:AAEXy61BMBQcrz6TCCNHRI3_4d6fbXERy8M` has been compromised and is blocked. You MUST generate a new token before deployment.

**CRITICAL**: Unauthorized admin user ID `7930798268` has been removed. You MUST set your own admin user ID.

---

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] Linux/macOS/Windows with Docker support
- [ ] Node.js 18.x or higher installed
- [ ] MySQL 8.0+ database server
- [ ] Docker and Docker Compose installed
- [ ] Git installed (for cloning/updates)
- [ ] Active Telegram account
- [ ] Domain name (optional, for webhooks)

### System Requirements

**Minimum:**
- 2GB RAM
- 20GB disk space
- 1 CPU core
- Ubuntu 20.04+ / CentOS 8+ / macOS 10.15+

**Recommended:**
- 4GB RAM
- 50GB disk space
- 2 CPU cores
- SSL certificate for production

---

## 🚀 Quick Start (5-Minute Setup)

For experienced users who want to get started quickly:

```bash
# 1. Clone and enter directory
git clone <repository-url> appointment-scheduler
cd appointment-scheduler

# 2. Run master deployment script
chmod +x scripts/master-deployment.sh
./scripts/master-deployment.sh

# 3. Follow prompts to configure credentials
# 4. Start services
docker-compose up -d
```

**⚠️ Warning**: This quick start assumes you have all prerequisites installed. For detailed setup, continue with the step-by-step guide below.

---

## 📖 Step-by-Step Deployment Guide

### Step 1: Environment Preparation

#### 1.1 Install Dependencies

**On Ubuntu/Debian:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot to apply Docker permissions
sudo reboot
```

**On macOS:**
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node@18
brew install --cask docker
```

**On Windows:**
- Download and install Node.js from [nodejs.org](https://nodejs.org)
- Download and install Docker Desktop from [docker.com](https://docker.com)

#### 1.2 Verify Installation
```bash
node --version    # Should show v18.x.x or higher
docker --version  # Should show version info
docker-compose --version  # Should show version info
```

### Step 2: Download and Setup Project

#### 2.1 Get Project Files
```bash
# Option 1: If you have the project locally
cd /path/to/appointment-scheduler

# Option 2: Clone from repository (if available)
git clone <repository-url> appointment-scheduler
cd appointment-scheduler

# Verify project structure
ls -la
```

#### 2.2 Install Project Dependencies
```bash
# Install Node.js dependencies
npm install

# Verify installation
npm list --depth=0
```

### Step 3: Database Setup

#### 3.1 Setup MySQL Database

**Option A: Using Docker (Recommended)**
```bash
# Start MySQL container
docker run -d \
  --name appointment-scheduler-mysql \
  -e MYSQL_ROOT_PASSWORD=secure_root_password \
  -e MYSQL_DATABASE=appointment_scheduler \
  -e MYSQL_USER=appuser \
  -e MYSQL_PASSWORD=secure_app_password \
  -p 3306:3306 \
  mysql:8.0

# Wait for MySQL to start
sleep 30

# Test connection
docker exec appointment-scheduler-mysql mysql -u appuser -psecure_app_password -e "SELECT 1;"
```

**Option B: Local MySQL Installation**
```bash
# Ubuntu/Debian
sudo apt install mysql-server
sudo mysql_secure_installation

# Create database and user
sudo mysql -u root -p
```

```sql
CREATE DATABASE appointment_scheduler;
CREATE USER 'appuser'@'%' IDENTIFIED BY 'secure_app_password';
GRANT ALL PRIVILEGES ON appointment_scheduler.* TO 'appuser'@'%';
FLUSH PRIVILEGES;
EXIT;
```

#### 3.2 Run Database Cleanup (CRITICAL)

**⚠️ IMPORTANT**: This step removes Lodge Mobile contamination and restores original services.

```bash
# Backup existing database (if any)
mysqldump -u appuser -psecure_app_password appointment_scheduler > backup_before_cleanup.sql

# Apply database cleanup
mysql -u appuser -psecure_app_password appointment_scheduler < security/database-cleanup.sql

# Verify cleanup
mysql -u appuser -psecure_app_password appointment_scheduler -e "SELECT name FROM services WHERE name NOT LIKE '%Lodge Mobile%';"
```

### Step 4: Telegram Bot Configuration

#### 4.1 Create New Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow prompts to create your bot
4. **SAVE THE BOT TOKEN** - you'll need it for configuration
5. (Optional) Send `/setdescription` to set bot description
6. (Optional) Send `/setabouttext` to set about text

**Example interaction:**
```
You: /newbot
BotFather: Alright, a new bot. How are we going to call it?
You: Appointment Scheduler Bot
BotFather: Good. Now let's choose a username for your bot...
You: my_appointment_bot
BotFather: Done! Congratulations on your new bot. You will find it at t.me/my_appointment_bot. 
           You can now add a description... Here is your token: 1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

#### 4.2 Get Your User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. Send any message
3. The bot will reply with your user information
4. **SAVE YOUR USER ID** - you'll need it for admin configuration

### Step 5: Environment Configuration

#### 5.1 Create Environment File
```bash
# Copy secure environment template
cp security/.env.secure .env

# Edit environment file
nano .env  # or use your preferred editor
```

#### 5.2 Configure Environment Variables

Update the `.env` file with your specific values:

```env
# Server Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database Configuration (Update with your values)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=appointment_scheduler
DB_USER=appuser
DB_PASSWORD=secure_app_password

# Telegram Bot Configuration (REPLACE WITH YOUR VALUES)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ  # FROM BOTFATHER
ADMIN_USER_IDS=123456789  # YOUR TELEGRAM USER ID

# Support System (Optional - Configure for live chat)
SUPPORT_GROUP_ID=-100123456789  # Telegram group ID for support
ENABLE_LIVE_SUPPORT=true

# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-here
API_KEY_HASH=optional-api-key-for-external-access

# Rate Limiting
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Notification Settings (Optional)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Business Configuration
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=17:00
TIMEZONE=America/New_York
BOOKING_ADVANCE_DAYS=30
```

**🔐 Security Notes:**
- Keep your `.env` file secure and never commit it to version control
- Use strong, unique passwords for all credentials
- Generate a random JWT secret (32+ characters)
- Restrict database user permissions to only necessary tables

### Step 6: Run Security Setup

#### 6.1 Apply Security Patches
```bash
# Run security configuration
node scripts/security-setup.js

# Verify security patches
ls -la security/
```

#### 6.2 Validate Configuration
```bash
# Validate support system configuration
node scripts/validate-support-config.js

# Expected output: "✅ All configurations are valid"
```

### Step 7: Database Migration and Seeding

#### 7.1 Run Database Migrations
```bash
# Apply database schema
npm run migrate

# Expected output: "Batch 1 run: X migrations"
```

#### 7.2 Seed Initial Data
```bash
# Add initial services and data
npm run seed

# Expected output: "Ran X seed files"
```

#### 7.3 Verify Database
```bash
# Check that services are properly loaded
mysql -u appuser -psecure_app_password appointment_scheduler -e "SELECT id, name, duration, price FROM services;"

# Expected output: List of 5 legitimate appointment services
```

### Step 8: Deploy Application

#### 8.1 Run Master Deployment
```bash
# Make deployment script executable
chmod +x scripts/master-deployment.sh

# Run complete deployment
./scripts/master-deployment.sh

# Follow prompts and monitor output
```

#### 8.2 Alternative: Manual Deployment
If the master deployment script doesn't work, deploy manually:

```bash
# Start services with Docker Compose
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 9: Testing and Validation

#### 9.1 Run System Validation
```bash
# Run comprehensive system validation
node scripts/final-system-validation.js

# Expected output: Overall score 90%+
```

#### 9.2 Test Bot Functionality

1. **Start Conversation**: Find your bot on Telegram (t.me/your_bot_username)
2. **Send `/start`**: Bot should respond with welcome message
3. **Send `/book`**: Should start booking flow with service categories
4. **Test Full Flow**: Complete a test booking from start to finish
5. **Send `/myappointments`**: Should show your test booking
6. **Send `/help`**: Should show comprehensive help

#### 9.3 Test API Endpoints
```bash
# Test health endpoint
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

# Test services endpoint
curl http://localhost:3000/api/services
# Expected: JSON array of services

# Test authentication (if configured)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/api/appointments
```

### Step 10: Production Hardening

#### 10.1 SSL/HTTPS Setup (Recommended)

**Using Let's Encrypt (Free):**
```bash
# Install Certbot
sudo apt install certbot

# Get SSL certificate
sudo certbot certonly --standalone -d your-domain.com

# Update nginx configuration (if using)
# Or configure reverse proxy
```

#### 10.2 Firewall Configuration
```bash
# Ubuntu/Debian - Allow only necessary ports
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000  # Application port
sudo ufw enable
```

#### 10.3 Setup Monitoring
```bash
# Enable health monitoring
chmod +x devops/monitoring/health-check.js
node devops/monitoring/health-check.js &

# Setup log rotation
sudo logrotate -f logs/logrotate.conf
```

---

## 🔧 Advanced Configuration

### Webhook Configuration (Optional but Recommended)

For better performance, configure webhooks instead of polling:

```bash
# Set webhook URL (replace with your domain)
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain.com/webhook/telegram"}'
```

### Live Chat Support Setup

1. Create Telegram group for support team
2. Add your bot as administrator
3. Get group ID using [@userinfobot](https://t.me/userinfobot)
4. Update `SUPPORT_GROUP_ID` in `.env`
5. Restart services

### Backup Configuration

```bash
# Setup automated backups
chmod +x devops/backup/backup-script.sh

# Add to crontab for daily backups
crontab -e
# Add: 0 2 * * * /path/to/appointment-scheduler/devops/backup/backup-script.sh
```

---

## 🧪 Testing Checklist

### Manual Testing Checklist

- [ ] Bot responds to `/start` command
- [ ] Booking flow works end-to-end
- [ ] User can view appointments with `/myappointments`
- [ ] Admin commands work (if admin user)
- [ ] Rate limiting prevents spam
- [ ] Error messages are user-friendly
- [ ] Database stores appointments correctly
- [ ] API endpoints return expected data
- [ ] Health check endpoint works
- [ ] Logs are generated properly

### Performance Testing

```bash
# Test concurrent users (requires additional tools)
# Install artillery for load testing
npm install -g artillery

# Create basic load test
artillery run --count 10 --num 5 tests/load-test.yml
```

---

## 🚨 Troubleshooting

### Common Issues

#### Bot Not Responding
```bash
# Check bot token
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
# Should return bot information

# Check logs
docker-compose logs bot
# Look for connection errors
```

#### Database Connection Errors
```bash
# Test database connectivity
mysql -u appuser -psecure_app_password -h localhost appointment_scheduler -e "SELECT 1;"

# Check Docker MySQL container
docker logs appointment-scheduler-mysql
```

#### Port Already in Use
```bash
# Find process using port 3000
sudo netstat -tulpn | grep :3000
# Kill process or change port in .env

# Alternative: Use different port
echo "PORT=3001" >> .env
```

#### Rate Limiting Too Strict
```bash
# Temporarily disable rate limiting
echo "ENABLE_RATE_LIMITING=false" >> .env
# Restart services
docker-compose restart
```

### Log Analysis

```bash
# View application logs
tail -f logs/combined.log

# View error logs only
tail -f logs/error.log

# View Docker logs
docker-compose logs -f --tail=100
```

### Recovery Procedures

#### If Deployment Fails
```bash
# Run rollback (if available)
./devops/scripts/quick-restore.sh

# Or restore from backup
mysql -u appuser -psecure_app_password appointment_scheduler < backup_before_cleanup.sql
```

#### If Database is Corrupted
```bash
# Restore from backup
mysql -u appuser -psecure_app_password appointment_scheduler < latest_backup.sql

# Re-run cleanup
mysql -u appuser -psecure_app_password appointment_scheduler < security/database-cleanup.sql
```

---

## 📈 Monitoring and Maintenance

### Health Monitoring

**Automated Health Checks:**
```bash
# Check every 5 minutes
*/5 * * * * curl -f http://localhost:3000/health || echo "Service down" | mail -s "Alert" admin@yourdomain.com
```

**Manual Health Check:**
```bash
# Run comprehensive health check
node devops/monitoring/health-check.js
```

### Performance Monitoring

Monitor these key metrics:
- Response time (should be < 2 seconds)
- Memory usage (should be < 200MB)
- CPU usage (should be < 50%)
- Database connections (should not exceed pool size)
- Error rate (should be < 1%)

### Security Monitoring

```bash
# Monitor failed authentication attempts
grep "Authentication failed" logs/combined.log | tail -20

# Monitor rate limiting violations
grep "Rate limit exceeded" logs/combined.log | tail -20

# Check for suspicious patterns
grep -E "(injection|xss|attack)" logs/combined.log
```

### Regular Maintenance Tasks

**Daily:**
- [ ] Review error logs
- [ ] Check service health
- [ ] Monitor resource usage

**Weekly:**
- [ ] Analyze performance metrics
- [ ] Review user feedback
- [ ] Update documentation

**Monthly:**
- [ ] Security audit
- [ ] Dependency updates
- [ ] Performance optimization
- [ ] Backup testing

---

## 🔄 Updates and Upgrades

### Applying Updates

```bash
# Backup before updates
./devops/backup/backup-script.sh

# Pull latest changes (if using git)
git pull origin main

# Update dependencies
npm update

# Run migrations
npm run migrate

# Restart services
docker-compose restart
```

### Version Management

```bash
# Tag current version before updating
git tag v1.0.0
git push origin v1.0.0

# Always test updates in staging first
docker-compose -f docker-compose.staging.yml up -d
```

---

## 📞 Support and Help

### Getting Help

1. **Check Logs**: Most issues are visible in application logs
2. **Review Documentation**: All features are documented
3. **Run Validation**: Use the system validation script
4. **Check Issues**: Review common issues in troubleshooting section

### Documentation Resources

- **Technical Overview**: `docs/INTEGRATED_SOLUTION_OVERVIEW.md`
- **System Handover**: `docs/SYSTEM_HANDOVER.md`
- **API Documentation**: Available at `/api/docs` when running
- **Change Log**: `docs/COMPLETE_CHANGE_LOG.md`

### Support Contacts

- **Integration Team**: integration@yourcompany.com
- **Security Issues**: security@yourcompany.com
- **Technical Support**: support@yourcompany.com

---

## 🎉 Congratulations!

You have successfully deployed the Telegram appointment scheduler bot! 

### What's Next?

1. **Customize Services**: Add your specific appointment types
2. **Brand Customization**: Update bot messages and branding
3. **Integration**: Connect with your existing systems
4. **Analytics**: Setup tracking and reporting
5. **Scaling**: Configure for high availability if needed

### Key Success Indicators

- ✅ Bot responds to all commands
- ✅ Users can successfully book appointments
- ✅ Database stores data correctly
- ✅ No security vulnerabilities detected
- ✅ System passes health checks
- ✅ Performance meets requirements

**🚀 Your appointment scheduler bot is now live and ready to serve your users!**

---

**Guide Version**: 1.0.0  
**Last Updated**: 2025-08-08  
**Integration Agent**: Swarm Coordination Project  

*This guide represents the complete deployment process for the restored and secured Telegram appointment scheduler bot.*