# Appointment Reminder System

## Overview
The bot automatically sends reminders at specific intervals before each appointment to ensure customers don't miss their Lodge Mobile Activation appointments.

## Reminder Schedule

Reminders are sent at the following times before the appointment:

1. **12 Hours Before** - Half-day reminder
2. **3 Hours Before** - Morning/afternoon reminder  
3. **1 Hour Before** - Final preparation reminder
4. **30 Minutes Before** - Last-minute reminder

## Reminder Message Format

Each reminder includes:
- 🔔 Clear "Lodge Mobile Activation Reminder" header
- ⏰ Time remaining until appointment
- 📅 Date and time of appointment (12-hour format)
- 📱 Service name
- 👨‍💼 Specialist name
- ⏱️ Duration (90 minutes)
- 📍 Location
- 🆔 Confirmation number
- Option to cancel using `/cancel` command

## Example Reminder Message

```
🔔 Lodge Mobile Activation Reminder

⏰ 3 hours until your appointment

📅 Date: Aug 07, 2025
⏰ Time: 2:30 PM
📱 Service: Lodge Mobile Basic Activation
👨‍💼 Specialist: John Smith
⏱️ Duration: 90 minutes

📍 Location: Lodge Mobile
🆔 Confirmation: abc123-def456

To cancel, use: /cancel abc123-def456
```

## Technical Implementation

### Features:
- **Automatic Scheduling**: Reminders are scheduled immediately upon booking
- **Duplicate Prevention**: Each reminder is sent only once
- **Time Zone Aware**: All times in Eastern Time
- **Cron-based**: Checks every minute for reminders to send
- **Memory Efficient**: Cleans up old reminder records daily

### How It Works:
1. When appointment is booked, system calculates reminder times
2. Reminder scheduler checks every minute for due reminders
3. Sends reminders via Telegram when time matches
4. Tracks sent reminders to prevent duplicates
5. Cleans up old reminder data daily

## Benefits

- **Reduces No-Shows**: Multiple reminders ensure customers remember
- **Better Preparation**: Early reminders allow time to prepare
- **Professional Service**: Automated reminders show professionalism
- **Convenient**: All reminders delivered via Telegram

## Testing Reminders

To test the reminder system:
1. Book an appointment for a future time
2. Reminders will be sent at the scheduled intervals
3. Check Telegram for reminder messages

## Notes

- Reminders only sent for "scheduled" or "confirmed" appointments
- Cancelled appointments don't receive reminders
- If bot is restarted, it will catch up on any missed reminders
- Reminders require customer to have Telegram ID registered

## Current Status
✅ **ACTIVE** - Reminder system is running and will send notifications at 12hr, 3hr, 1hr, and 30min intervals