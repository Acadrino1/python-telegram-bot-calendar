# Maintenance Procedures for Telegram Appointment Scheduler Bot

## 📋 Table of Contents

1. [Daily Maintenance](#daily-maintenance)
2. [Weekly Maintenance](#weekly-maintenance)
3. [Monthly Maintenance](#monthly-maintenance)
4. [Emergency Procedures](#emergency-procedures)
5. [Performance Optimization](#performance-optimization)
6. [Security Maintenance](#security-maintenance)
7. [Database Maintenance](#database-maintenance)
8. [Log Management](#log-management)

## 🔄 Daily Maintenance

### Automated Daily Tasks

These tasks should be automated via cron jobs:

```bash
# Add to crontab: crontab -e
# Health check every 5 minutes
*/5 * * * * /path/to/appointment-scheduler/devops/monitoring/health-check.js >> /var/log/health-check.log 2>&1

# Daily backup at 2 AM
0 2 * * * /path/to/appointment-scheduler/devops/backup/backup-script.sh full >> /var/log/backup.log 2>&1

# Log rotation at 3 AM
0 3 * * * /path/to/appointment-scheduler/devops/maintenance/rotate-logs.sh >> /var/log/maintenance.log 2>&1
```

### Manual Daily Checks

**Morning Health Check (5 minutes)**
1. Run monitoring dashboard: `./devops/monitoring/monitoring-dashboard.sh`
2. Check all containers are running
3. Verify API health endpoint: `curl http://localhost:3000/health`
4. Check bot responsiveness in Telegram
5. Review error logs from past 24 hours

**Evening Review (10 minutes)**
1. Review appointment bookings for the day
2. Check system metrics (CPU, memory, disk usage)
3. Verify backup completion
4. Review any alerts or notifications

## 📅 Weekly Maintenance

### Every Monday (30 minutes)

**System Updates**
```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Update Node.js dependencies (in staging first)
npm audit
npm update

# Check disk space
df -h
```

**Performance Review**
1. Review API response times
2. Check database query performance
3. Analyze bot interaction patterns
4. Review resource usage trends

**Security Checks**
1. Review access logs
2. Check for failed login attempts
3. Verify SSL certificate expiry
4. Review user permissions

### Every Friday (15 minutes)

**Database Maintenance**
```bash
# Optimize database tables
docker exec appointment-scheduler-mysql mysql -u root -p -e "OPTIMIZE TABLE appointments, users, services;"

# Update statistics
docker exec appointment-scheduler-mysql mysql -u root -p -e "ANALYZE TABLE appointments, users, services;"
```

## 🗓️ Monthly Maintenance

### First Monday of Month (2 hours)

**Comprehensive System Review**

1. **Performance Analysis**
   - Review monthly metrics
   - Identify performance bottlenecks
   - Analyze user growth trends
   - Check system capacity

2. **Security Audit**
   - Review access logs
   - Update security policies
   - Check for vulnerabilities
   - Update dependencies

3. **Database Optimization**
   ```bash
   # Archive old data (older than 1 year)
   ./devops/maintenance/archive-old-data.sh
   
   # Rebuild indexes
   ./devops/maintenance/rebuild-indexes.sh
   
   # Update database statistics
   ./devops/maintenance/update-db-stats.sh
   ```

4. **Backup Testing**
   - Test backup restoration
   - Verify backup integrity
   - Update backup retention policy

5. **Documentation Updates**
   - Update system documentation
   - Review and update procedures
   - Update configuration templates

## 🚨 Emergency Procedures

### System Down

**Immediate Actions (5 minutes)**
1. Check container status: `docker ps -a`
2. Check logs: `docker logs <container-name>`
3. Attempt service restart: `docker-compose restart`
4. Check system resources: `htop`, `df -h`

**If Restart Fails (10 minutes)**
1. Run full health check: `./devops/monitoring/health-check.js`
2. Check database connectivity
3. Review recent changes in logs
4. Restore from latest backup if needed: `./devops/scripts/quick-restore.sh`

### Database Issues

**Connection Problems**
```bash
# Check MySQL container
docker logs appointment-scheduler-mysql

# Check network connectivity
docker exec appointment-scheduler-app ping mysql

# Restart MySQL service
docker-compose restart mysql
```

**Data Corruption**
```bash
# Stop services
docker-compose stop app bot

# Repair database
docker exec appointment-scheduler-mysql mysqlcheck --repair --all-databases -u root -p

# Restore from backup if repair fails
./devops/scripts/quick-restore.sh latest production
```

### Bot Not Responding

**Telegram Bot Issues**
1. Check bot container: `docker logs appointment-scheduler-bot`
2. Verify bot token is valid
3. Test bot API connection: `curl https://api.telegram.org/bot<TOKEN>/getMe`
4. Restart bot service: `docker-compose restart bot`
5. Check Telegram service status

### High Traffic / Performance Issues

**Immediate Response**
```bash
# Scale services (if using Docker Swarm/Kubernetes)
docker-compose up --scale app=3 --scale bot=2

# Enable additional monitoring
./devops/monitoring/monitoring-dashboard.sh

# Check resource usage
docker stats
```

## 🚀 Performance Optimization

### Database Optimization

**Query Performance**
```sql
-- Find slow queries
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;

-- Check index usage
SHOW INDEX FROM appointments;

-- Optimize tables
OPTIMIZE TABLE appointments, users, services;
```

**Connection Pool Tuning**
```javascript
// In database configuration
{
  pool: {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  }
}
```

### Application Performance

**Memory Optimization**
- Monitor memory usage: `docker stats`
- Implement memory limits in docker-compose.yml
- Use Redis for session storage and caching

**API Optimization**
- Enable response compression
- Implement API rate limiting
- Use database connection pooling
- Add response caching for frequent queries

## 🔒 Security Maintenance

### Regular Security Tasks

**Certificate Management**
```bash
# Check SSL certificate expiry
openssl x509 -in /path/to/certificate.crt -text -noout | grep "Not After"

# Renew certificates (Let's Encrypt)
certbot renew
```

**Password Policies**
- Rotate database passwords monthly
- Update API keys quarterly
- Review user access permissions

**Security Scanning**
```bash
# Scan for vulnerabilities
npm audit
docker scan appointment-scheduler:latest

# Check for exposed ports
nmap localhost
```

### Access Control

**User Management**
1. Review admin users monthly
2. Disable inactive accounts
3. Audit user permissions
4. Review API access logs

## 💾 Database Maintenance

### Regular Tasks

**Data Cleanup**
```sql
-- Archive old appointments (older than 2 years)
INSERT INTO appointments_archive SELECT * FROM appointments WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR);
DELETE FROM appointments WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR);

-- Clean up expired sessions
DELETE FROM sessions WHERE expires_at < NOW();

-- Remove old notification logs
DELETE FROM notification_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
```

**Index Maintenance**
```sql
-- Rebuild fragmented indexes
ALTER TABLE appointments ENGINE=InnoDB;
ALTER TABLE users ENGINE=InnoDB;

-- Update table statistics
ANALYZE TABLE appointments, users, services;
```

**Backup Verification**
```bash
# Test backup restore process monthly
./devops/scripts/test-backup-restore.sh

# Verify backup integrity
./devops/backup/verify-backup.sh latest
```

## 📄 Log Management

### Log Rotation

**Automated Log Rotation**
```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/appointment-scheduler << EOF
/path/to/appointment-scheduler/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    postrotate
        docker-compose restart app bot
    endscript
}
EOF
```

**Manual Log Cleanup**
```bash
# Archive logs older than 30 days
find /path/to/logs -name "*.log" -mtime +30 -exec gzip {} \;

# Remove archived logs older than 90 days
find /path/to/logs -name "*.log.gz" -mtime +90 -delete
```

### Log Analysis

**Weekly Log Review**
```bash
# Check for errors
grep -i error /path/to/logs/*.log | tail -50

# Check for warnings
grep -i warn /path/to/logs/*.log | tail -50

# Analyze access patterns
awk '{print $1}' /path/to/logs/access.log | sort | uniq -c | sort -nr | head -20
```

## 📊 Monitoring and Alerting

### Alert Configuration

**Critical Alerts** (Immediate response required)
- System down
- Database connection failure
- API response time > 10 seconds
- Disk usage > 90%
- Memory usage > 95%

**Warning Alerts** (Response within 1 hour)
- High API response time (> 2 seconds)
- Database connection pool exhausted
- High error rate (> 5% of requests)
- Backup failure

**Info Alerts** (Daily review)
- High traffic patterns
- Unusual bot activity
- Resource usage trends

### Monitoring Tools Setup

**Prometheus Queries**
```promql
# API availability
up{job="appointment-scheduler-api"}

# Response time
histogram_quantile(0.95, http_request_duration_seconds_bucket)

# Error rate
rate(http_requests_total{status=~"5.."}[5m])
```

## 🔧 Troubleshooting Guide

### Common Issues

**"Database connection timeout"**
1. Check MySQL container status
2. Verify connection parameters
3. Check network connectivity
4. Review connection pool settings

**"Bot webhook failed"**
1. Check bot token validity
2. Verify webhook URL accessibility
3. Check Telegram service status
4. Review bot error logs

**"High memory usage"**
1. Check for memory leaks in application
2. Review Docker memory limits
3. Analyze database query patterns
4. Consider scaling services

### Diagnostic Commands

```bash
# System health overview
./devops/monitoring/health-check.js

# Container resource usage
docker stats --no-stream

# Database connection test
docker exec appointment-scheduler-mysql mysql -u root -p -e "SHOW PROCESSLIST;"

# Bot status check
docker logs appointment-scheduler-bot --tail 50

# API endpoint test
curl -v http://localhost:3000/health
```

---

## 📞 Support Contacts

- **System Administrator**: [admin@example.com]
- **Database Administrator**: [dba@example.com]
- **Security Team**: [security@example.com]
- **On-call Support**: [oncall@example.com]

## 📝 Change Log

Document all maintenance activities:
- Date and time
- Person responsible
- Changes made
- Results/outcomes
- Follow-up actions needed

---

*Last updated: 2024-12-08*
*Version: 1.0*