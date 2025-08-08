# Telegram Bot UI Restoration Plan

## Overview
The Telegram appointment scheduler bot has been compromised with unauthorized "Lodge Mobile Activations" branding and functionality. This document outlines the restoration strategy.

## Hijacking Analysis

### Files Affected
1. `/src/bot/EnhancedTelegramBot.js` - Complete replacement of menu system
2. `/src/bot/translations.js` - Rewritten with Lodge Mobile branding
3. `/src/bot/bot.js` - Modified to use hijacked bot file

### Original vs Hijacked Functionality

#### Original (TelegramBot.js)
- Multi-category service selection menu
- Generic appointment scheduler branding
- Simple booking flow: Category → Service → Provider → Date → Time → Confirm
- Standard user registration process

#### Hijacked (EnhancedTelegramBot.js)
- Single service forced ("Lodge Mobile Activation")
- Lodge Mobile branding throughout
- Access control system with referral codes
- Extended 13-step customer data collection
- Admin approval system for new users

## Restoration Steps

### Step 1: Switch Bot Implementation
```javascript
// In /src/bot/bot.js, line 7:
// FROM:
const TelegramBot = require('./EnhancedTelegramBot');
// TO:
const TelegramBot = require('./TelegramBot');
```

### Step 2: Create Clean Translation File
Create `/src/bot/translations_clean.js` with generic appointment bot text:

```javascript
const translations = {
  en: {
    welcome: '🏥 *Welcome to Appointment Scheduler Bot!*\n\nHello {firstName}! I\'m here to help you book and manage appointments.',
    book_start: '📅 *Book an Appointment*\n\nLet\'s schedule your appointment! First, select a service category:',
    // ... more generic translations
  }
};
```

### Step 3: Restore Category Menu
Ensure TelegramBot.js has the original category selection:
- 🏥 Medical
- 💅 Beauty  
- 🦷 Dental
- 💆 Wellness
- 🏋️ Fitness
- 📚 Consultation

### Step 4: Remove Access Control
The hijacked bot added unauthorized features:
- Referral code system
- Admin approval process
- User access restrictions

These should be removed to restore original open access.

### Step 5: Simplify Booking Flow
Remove the extended 13-step customer data collection and return to simple flow:
1. Select category
2. Select service
3. Select provider
4. Select date
5. Select time
6. Enter basic info (name, phone, email)
7. Confirm

## Code Changes Required

### 1. Bot Initialization
```javascript
// Remove unauthorized config options
this.config = {
  // Remove: supportGroupId, referral systems, admin IDs
  // Keep only: basic bot configuration
};
```

### 2. Command Handlers
```javascript
// Restore original /start command
this.bot.command('start', async (ctx) => {
  // Remove access control checks
  // Show original welcome message
  // Register user normally
});

// Restore original /book command  
this.bot.command('book', async (ctx) => {
  // Remove access control checks
  // Show category selection menu
  // Restore original booking flow
});
```

### 3. Menu Handlers
```javascript
// Restore category handler
this.bot.action(/category_(.+)/, async (ctx) => {
  const category = ctx.match[1];
  // Show services for selected category
  // Continue with original flow
});
```

## Security Considerations

1. **Data Privacy**: The hijacked bot collected excessive personal data (driver's license, DOB, full address). This should be removed.

2. **Access Control**: The referral code system may have been used to restrict access to legitimate users.

3. **Admin Functions**: Unauthorized admin commands were added that could be used for malicious purposes.

## Testing Plan

1. Test category selection menu shows all 6 categories
2. Verify booking flow works for each category
3. Ensure no Lodge Mobile branding appears
4. Confirm user registration works without access codes
5. Test appointment creation, viewing, and cancellation

## Rollback Strategy

Keep the EnhancedTelegramBot.js file as backup but rename it to prevent accidental use:
```bash
mv EnhancedTelegramBot.js EnhancedTelegramBot.js.hijacked.backup
```

## Post-Restoration Tasks

1. Audit all appointments created during hijacked period
2. Check if any unauthorized data was collected or transmitted
3. Review user database for any compromise
4. Update security measures to prevent future hijacking