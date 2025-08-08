# 🤖 Telegram Bot Setup Guide

## Prerequisites
- Telegram account
- Node.js and npm installed
- MySQL database running (via Docker or locally)

## Step 1: Create Your Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a conversation** with BotFather
3. **Create a new bot**:
   - Send `/newbot`
   - Choose a name for your bot (e.g., "My Appointment Scheduler")
   - Choose a username (must end in 'bot', e.g., `myappointment_bot`)
4. **Save the token** that BotFather gives you (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## Step 2: Configure the Bot

1. **Edit the `.env` file**:
```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
```
Replace `YOUR_BOT_TOKEN_HERE` with the token from BotFather.

2. **Optional: Set admin Telegram ID**:
```env
TELEGRAM_ADMIN_ID=YOUR_TELEGRAM_USER_ID
```
To find your Telegram ID, message `@userinfobot` on Telegram.

## Step 3: Configure Bot Commands in BotFather

Send these commands to BotFather to set up the command menu:

1. Send `/mybots`
2. Select your bot
3. Click "Edit Bot"
4. Click "Edit Commands"
5. Send this list:
```
start - Start the bot and see welcome message
book - Book a new appointment
myappointments - View your upcoming appointments
cancel - Cancel an appointment
reschedule - Reschedule an appointment
help - Show help information
profile - View or update your profile
availability - (Providers) Set your availability
schedule - (Providers) View your schedule
```

## Step 4: Start the Services

### Option 1: Start Everything Together
```bash
# Start MySQL
sudo docker-compose up -d mysql

# Run migrations
npm run migrate

# Start both API and Bot
npm run start:all
```

### Option 2: Start Services Separately
```bash
# Terminal 1: Start the API
npm start

# Terminal 2: Start the Telegram bot
npm run start:bot
```

## Step 5: Test Your Bot

1. **Open Telegram** and search for your bot username
2. **Start a conversation** by clicking "Start" or sending `/start`
3. **Try the commands**:
   - `/book` - Book an appointment
   - `/help` - See all available commands
   - `/myappointments` - View your bookings

## 📱 Bot Features

### For Clients:
- **Book Appointments**: Interactive booking with service selection, calendar, and time slots
- **View Appointments**: See all upcoming appointments with details
- **Cancel/Reschedule**: Manage existing appointments
- **Reminders**: Automatic notifications 24h and 2h before appointments
- **Profile Management**: Update contact information

### For Providers:
- **Availability Management**: Set working hours and days off
- **Schedule View**: See all upcoming appointments
- **Appointment Confirmation**: Confirm or reject bookings
- **Client Management**: View client information

## 🎨 Customization

### Change Bot Messages
Edit `src/bot/TelegramBot.js` to customize:
- Welcome messages
- Button labels
- Response texts
- Emoji usage

### Add Custom Commands
Add new commands in the `setupCommands()` method:
```javascript
this.bot.command('yourcommand', async (ctx) => {
  // Your command logic
});
```

### Modify Booking Flow
The booking flow is handled in `setupHandlers()`. You can:
- Add more service categories
- Change the calendar behavior
- Modify time slot generation
- Add custom validation

## 🔧 Advanced Configuration

### Use Webhooks (Production)
For production, use webhooks instead of polling:

1. **Set webhook URL in `.env`**:
```env
TELEGRAM_WEBHOOK_URL=https://yourdomain.com
TELEGRAM_WEBHOOK_PORT=3001
```

2. **Configure nginx** to proxy webhook requests
3. **Use HTTPS** (required for webhooks)

### Database Integration
The bot automatically:
- Creates user accounts for Telegram users
- Links appointments to Telegram IDs
- Stores user preferences
- Manages notification settings

## 🐛 Troubleshooting

### Bot Not Responding
- Check bot token in `.env`
- Ensure MySQL is running
- Check logs: `tail -f logs/app.log`
- Verify network connection

### Database Errors
- Run migrations: `npm run migrate`
- Check MySQL connection in `.env`
- Verify database exists

### Commands Not Working
- Restart the bot
- Check for JavaScript errors in console
- Verify command handlers in `TelegramBot.js`

## 📊 Monitoring

### View Bot Logs
```bash
# Bot-specific logs
tail -f logs/telegram-bot.log

# API logs
tail -f logs/app.log
```

### Check Bot Status
The bot outputs status messages to console:
- Connection status
- Command usage
- Error messages

## 🚀 Deployment

For production deployment:

1. **Use PM2** for process management:
```bash
pm2 start src/bot/bot.js --name telegram-bot
pm2 start src/index.js --name api-server
```

2. **Set up monitoring**:
```bash
pm2 monit
```

3. **Enable auto-restart**:
```bash
pm2 startup
pm2 save
```

## 📝 Testing Checklist

- [ ] Bot responds to `/start`
- [ ] Can book appointment through full flow
- [ ] Calendar displays correctly
- [ ] Time slots are shown
- [ ] Booking confirmation works
- [ ] Can view appointments with `/myappointments`
- [ ] Can cancel appointments
- [ ] Receives confirmation message
- [ ] Help command shows information
- [ ] Error messages are user-friendly

## 🆘 Support

If you encounter issues:
1. Check this documentation
2. Review logs for errors
3. Verify all services are running
4. Check Telegram Bot API status
5. Ensure database has required tables

## 🎉 Success!

Your Telegram appointment bot is ready! Users can now:
- Book appointments directly in Telegram
- Receive instant confirmations
- Get automatic reminders
- Manage their appointments easily

No need for a separate app or website - everything works right in Telegram!