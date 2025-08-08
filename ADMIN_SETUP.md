# Admin Setup for Lodge Mobile Bot

## How to Set Yourself as Admin

1. **Get your Telegram ID:**
   - Start a chat with @userinfobot on Telegram
   - It will reply with your user ID
   - Copy this number

2. **Update the bot configuration:**
   - Open `/src/bot/EnhancedTelegramBot.js`
   - Find line: `this.adminIds = ['your_telegram_id'];`
   - Replace `'your_telegram_id'` with your actual Telegram ID
   - Example: `this.adminIds = ['123456789'];`
   - You can add multiple admins: `this.adminIds = ['123456789', '987654321'];`

3. **Restart the bot:**
   ```bash
   ./monitor-bot.sh restart
   ```

## Admin Commands

Once configured as admin, you can use:

### Date Blocking Commands:
- `/blockdate YYYY-MM-DD` - Block a specific date
- `/unblockdate YYYY-MM-DD` - Unblock a date  
- `/blockeddays` - View all blocked dates
- `/admin` - Show admin help menu

### Examples:
```
/blockdate 2025-08-15
/blockdate 2025-08-20
/blockeddays
/unblockdate 2025-08-15
```

## What Happens When You Block a Date:

1. **Date becomes unavailable** - Won't appear in booking calendar
2. **Existing appointments cancelled** - All appointments on that date are cancelled
3. **Clients notified** - Automatic Telegram message sent to affected customers
4. **Persistent storage** - Blocked dates saved in `blocked-dates.json`

## Features:

- ✅ Block specific dates (vacation, holidays, etc.)
- ✅ Automatic appointment cancellation
- ✅ Client notifications
- ✅ Multiple admin support
- ✅ Persistent blocked dates across restarts
- ✅ Past dates cannot be blocked
- ✅ Sundays already blocked by default

## Blocked Dates File:

Blocked dates are stored in `/blocked-dates.json`:
```json
{
  "blockedDates": ["2025-08-15", "2025-08-20"],
  "lastUpdated": "2025-08-06T..."
}
```

You can manually edit this file if needed, but using commands is recommended.