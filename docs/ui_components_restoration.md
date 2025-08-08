# UI Components Restoration Guide

## Overview
This document details the specific UI components that have been hijacked and need restoration in the Telegram appointment scheduler bot.

## 🔍 **Hijacking Summary**

### **Critical Changes Identified:**
1. **Bot Implementation Swap**: `bot.js` switched from `TelegramBot.js` to `EnhancedTelegramBot.js`
2. **Menu System Override**: Category selection completely removed
3. **Branding Hijack**: All text changed to "Lodge Mobile Activations"
4. **Access Control**: Unauthorized referral code system added
5. **Data Collection**: Excessive 13-step customer data collection added

## 🎯 **UI Components Needing Restoration**

### **1. Welcome Messages**
**HIJACKED:**
```javascript
welcome_admin: '📱 *Welcome to Lodge Mobile Activations Bot!*'
welcome_back: '📱 *Welcome to Lodge Mobile Activations Bot!*'
```

**RESTORED:**
```javascript
welcome: '🏥 *Welcome to Appointment Scheduler Bot!*'
welcome_back: '🏥 *Welcome back to Appointment Scheduler Bot!*'
```

### **2. Main Menu System**
**HIJACKED:** (Category selection completely bypassed)
```javascript
// In EnhancedTelegramBot.js line 191:
ctx.session.booking.category = 'lodge_mobile';
// Hardcoded to single service - NO CATEGORY CHOICE
```

**RESTORED:** (Original multi-category menu)
```javascript
// Category selection buttons:
[Markup.button.callback('🏥 Medical', 'category_medical')],
[Markup.button.callback('💅 Beauty', 'category_beauty')],
[Markup.button.callback('🦷 Dental', 'category_dental')],
[Markup.button.callback('💆 Wellness', 'category_wellness')],
[Markup.button.callback('🏋️ Fitness', 'category_fitness')],
[Markup.button.callback('📚 Consultation', 'category_consultation')]
```

### **3. Booking Flow Messages**
**HIJACKED:**
```javascript
book_start: '📅 *Book Your Lodge Mobile Activation*'
info_collection_start: '📋 *Lodge Mobile Activation - Customer Information*'
```

**RESTORED:**
```javascript
book_start: '📅 *Book an Appointment*\n\nLet\'s schedule your appointment! First, select a service category:'
select_category: 'Please select a service category:'
```

### **4. Appointment Confirmation**
**HIJACKED:**
```javascript
booking_confirmed: 'Your Lodge Mobile activation appointment has been booked'
confirm_booking: '*📋 Confirm Your Appointment*\n\n🏢 Service: Lodge Mobile Activations'
```

**RESTORED:**
```javascript
booking_confirmed: 'Your appointment has been booked successfully'
confirm_booking: '*📋 Confirm Your Appointment*\n\n🏢 Service: {serviceName}'
```

### **5. Appointment Display**
**HIJACKED:**
```javascript
appointment_item: '{index}. *Lodge Mobile Activation*'
```

**RESTORED:**
```javascript
appointment_item: '{index}. *{serviceName}*\n   👨‍⚕️ {providerName}'
```

### **6. Command Descriptions**
**HIJACKED:**
```javascript
cmd_book: '📅 /book - Book activation appointment'
```

**RESTORED:**
```javascript
cmd_book: '📅 /book - Book a new appointment'
```

## 🔧 **Handler Functions to Restore**

### **1. Category Selection Handler**
```javascript
// RESTORE THIS HANDLER IN TelegramBot.js:
this.bot.action(/category_(.+)/, async (ctx) => {
  const category = ctx.match[1];
  ctx.session = ctx.session || {};
  ctx.session.booking = ctx.session.booking || {};
  ctx.session.booking.category = category;
  
  // Get services for category
  const services = await Service.query()
    .where('category', category)
    .where('isActive', true)
    .limit(10);
    
  // Show service selection menu
});
```

### **2. Access Control Removal**
```javascript
// REMOVE THESE UNAUTHORIZED CHECKS:
// - this.isUserApproved(userId)
// - referral code validation
// - admin approval system
// - pendingSessions tracking
```

### **3. Data Collection Simplification**
**REMOVE:** 13-step extended data collection
**RESTORE:** Simple 3-field collection:
- Name
- Phone  
- Email (optional)

## 🚨 **Security Issues to Address**

### **1. Unauthorized Data Collection**
The hijacked bot collects:
- Driver's license numbers
- Date of birth
- Full address
- License issue/expiry dates

**ACTION:** Remove all excessive data collection.

### **2. Access Control System**
- Referral code requirement
- Admin approval process
- User access restrictions

**ACTION:** Remove access control, restore open booking.

### **3. Admin Command Injection**
Unauthorized admin commands added:
- `/approve` - User approval
- `/deny` - User denial  
- `/createcode` - Referral code creation
- `/admin` - Admin panel

**ACTION:** Remove unauthorized admin commands.

## 🧪 **Testing Checklist**

After restoration, verify:
- [ ] Welcome message shows generic appointment bot branding
- [ ] /book command shows 6 service categories
- [ ] Each category shows relevant services
- [ ] Booking flow: Category → Service → Provider → Date → Time → Simple Info → Confirm
- [ ] No "Lodge Mobile" branding appears anywhere
- [ ] No referral code prompts
- [ ] No extended data collection (13 steps)
- [ ] Appointments display with actual service names
- [ ] All users can access without approval

## 🔄 **Rollback Instructions**

If restoration fails:
1. Restore from `.hijacked.backup` files
2. Check bot.js imports correct file
3. Verify translations.js content
4. Restart bot service

## 📁 **File Status After Restoration**

```
src/bot/
├── TelegramBot.js                    # ✅ ACTIVE - Original clean bot
├── EnhancedTelegramBot.js.disabled   # 🚫 DISABLED - Hijacked version
├── bot.js                           # ✅ RESTORED - Points to TelegramBot.js
├── translations.js                  # ✅ RESTORED - Clean translations
├── translations.js.hijacked.backup  # 📦 BACKUP - Hijacked translations
└── bot.js.hijacked.backup           # 📦 BACKUP - Hijacked bot loader
```

This restoration will return the bot to its original multi-category appointment scheduling functionality while removing all unauthorized Lodge Mobile branding and access restrictions.