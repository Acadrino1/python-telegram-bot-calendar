# Invite-Only Access System

## Overview
The Lodge Mobile Activations Bot now requires users to have an invitation before they can book appointments. This ensures controlled access to the booking system.

## How It Works

### For New Users
When a new user starts the bot with `/start`, they will:
1. Be prompted to enter a referral code, OR
2. Use `/request` to request access from an admin

### For Admins (@CH1_FU - ID: 7930798268)
Admins have full access and can:
- View pending access requests: `/requests`
- Approve user access: `/approve [user_id]`
- Deny user access: `/deny [user_id]`
- Create new referral codes: `/createcode [CODE] [MAX_USES]`

## Default Referral Code
The system comes with one pre-configured referral code:
- **Code**: `LODGE2024`
- **Maximum Uses**: 50
- **Status**: Active

## Access Management Commands

### Admin Commands
- `/requests` - View all pending access requests
- `/approve 123456789` - Approve a specific user
- `/deny 123456789` - Deny a specific user
- `/createcode SUMMER2025 100` - Create a new referral code with 100 uses

### User Commands
- `/start` - Begin registration process
- `/request` - Request access from admin

## Data Storage
- **Referral codes and approved users**: `/referral-codes.json`
- **Blocked dates**: `/blocked-dates.json`

## Access Flow
1. New user starts bot
2. System checks if user is admin or already approved
3. If not approved, user must:
   - Enter valid referral code (automatically approved)
   - Request access and wait for admin approval
4. Once approved, user can book appointments

## Notifications
- Admins receive notifications for new access requests
- Users receive notifications when approved/denied
- All notifications are sent via Telegram

## Security Features
- Only admins can create/manage referral codes
- Referral codes have usage limits
- All access requests are logged with timestamps
- Users can only request access once (until processed)