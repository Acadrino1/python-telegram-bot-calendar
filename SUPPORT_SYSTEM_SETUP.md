# Support System Setup Instructions

This guide will help administrators configure the live support system for the Appointment Scheduler Telegram Bot.

## 🚀 Quick Setup

### 1. Environment Configuration

Copy the environment variables to your `.env` file:

```bash
# Support System Configuration
SUPPORT_GROUP_ID=-1001234567890
SUPPORT_SYSTEM_ENABLED=true
SUPPORT_ANONYMIZE_DATA=true
SUPPORT_MAX_TICKETS=50
SUPPORT_TICKET_TIMEOUT=30
SUPPORT_AUTO_ESCALATE=60

# Admin User IDs (comma-separated)
ADMIN_USER_IDS=123456789,987654321
```

### 2. Create Support Group

1. **Create a Telegram group** for support agents
2. **Add your bot** to the group as an administrator
3. **Get the group chat ID**:
   - Forward a message from the group to @userinfobot
   - Copy the chat ID (should start with `-100`)
   - Set it as `SUPPORT_GROUP_ID` in your .env

### 3. Configure Admin Users

1. **Get your Telegram user ID**:
   - Message @userinfobot
   - Copy your user ID
   - Add to `ADMIN_USER_IDS` in .env (comma-separated for multiple admins)

### 4. Test the Configuration

1. Start the bot: `npm run start:bot`
2. Check the startup logs for configuration validation:
   ```
   ✅ Support system configuration validated
      Support Group ID: -1001234567890
      Anonymize Data: true
      Max Tickets: 50
   ```
3. Test with `/support` command in the bot

## 📋 Configuration Reference

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SUPPORT_GROUP_ID` | Telegram group chat ID for support agents | - | Yes |
| `SUPPORT_SYSTEM_ENABLED` | Enable/disable support system | `true` | No |
| `SUPPORT_ANONYMIZE_DATA` | Anonymize user data in support messages | `true` | No |
| `SUPPORT_MAX_TICKETS` | Maximum active tickets per user | `50` | No |
| `SUPPORT_TICKET_TIMEOUT` | Ticket auto-close timeout (minutes) | `30` | No |
| `SUPPORT_AUTO_ESCALATE` | Auto-escalate timeout (minutes) | `60` | No |
| `ADMIN_USER_IDS` | Admin Telegram user IDs (comma-separated) | - | No |

### Config.json Structure

For production deployments, you can also use `config.json`:

```json
{
  "production": {
    "supportSystem": {
      "enabled": true,
      "supportGroupId": "${SUPPORT_GROUP_ID}",
      "anonymizeUserData": true,
      "maxSupportTickets": 50,
      "ticketTimeoutMinutes": 30,
      "autoEscalateMinutes": 60
    },
    "telegram": {
      "supportGroupId": "${SUPPORT_GROUP_ID}",
      "adminUserIds": "${ADMIN_USER_IDS}"
    }
  }
}
```

## 🔧 Advanced Configuration

### Rate Limiting

The support system includes built-in rate limiting:

- **Daily limit**: 5 tickets per user per day
- **Message frequency**: Prevents spam
- **Blocking**: Temporary blocks for abuse

### Anonymization

When `SUPPORT_ANONYMIZE_DATA=true`:
- User names are replaced with ticket IDs
- Personal info is masked
- Only essential context is preserved

### Auto-escalation

Tickets are auto-escalated if:
- No agent response within `SUPPORT_AUTO_ESCALATE` minutes
- User sends multiple follow-up messages
- Ticket is marked as high priority

## 🎯 Bot Commands for Admins

Use these commands in the support group or as an admin:

- `/support_list` - View all active tickets
- `/support_assign <ticket_id>` - Assign ticket to yourself
- `/support_close <ticket_id>` - Close a ticket
- `/support_stats` - View support statistics
- `/support_config` - Show current configuration

## 🔍 Troubleshooting

### Common Issues

1. **"Support system is disabled"**
   - Check `SUPPORT_SYSTEM_ENABLED=true` in .env
   - Verify `SUPPORT_GROUP_ID` is set correctly

2. **Bot not receiving messages in support group**
   - Ensure bot is added as administrator in the group
   - Check group privacy settings
   - Verify the group chat ID is correct (starts with `-100`)

3. **Admin commands not working**
   - Confirm your user ID is in `ADMIN_USER_IDS`
   - Restart the bot after configuration changes

### Getting Support Group Chat ID

**Method 1: Using @userinfobot**
1. Add @userinfobot to your support group
2. Forward any message from the group to @userinfobot
3. Copy the chat ID from the response

**Method 2: Using your bot**
1. Add your bot to the group
2. Send any message in the group
3. Check bot logs for the chat ID

**Method 3: Using Telegram API**
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
```

### Getting User IDs

**Method 1: @userinfobot**
1. Message @userinfobot with any text
2. Copy your user ID from the response

**Method 2: Bot logs**
1. Start your bot in development mode
2. Send any message to the bot
3. Check logs for user ID

## 🚨 Security Considerations

### Data Protection
- User data is anonymized by default
- Support conversations are stored securely
- Regular cleanup of old tickets

### Access Control
- Only configured admins can use admin commands
- Support group membership controls agent access
- Rate limiting prevents abuse

### Monitoring
- All support interactions are logged
- Failed attempts are tracked
- Performance metrics are collected

## 📊 Monitoring and Metrics

The system provides comprehensive monitoring:

### Key Metrics
- Active tickets count
- Average response time
- Ticket resolution rate
- Agent performance

### Logs
- All support interactions
- Rate limiting events
- System errors and warnings
- Performance benchmarks

### Alerts
Configure alerts for:
- High ticket volume
- Long response times
- System errors
- Rate limit violations

## 🔄 Maintenance

### Regular Tasks
1. **Monitor ticket volume** and adjust limits
2. **Review agent performance** and provide training
3. **Clean up old tickets** (automated)
4. **Update configuration** as needed

### Backup
Support data is stored in:
- Database (tickets, messages)
- File system (logs, configs)
- Memory (active sessions)

## 📞 Getting Help

If you need assistance with the setup:

1. Check the logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test with a simple configuration first
4. Review the troubleshooting section above

For additional support, please refer to the main README.md or contact the development team.

---

**Note**: Always test the configuration in a development environment before deploying to production.