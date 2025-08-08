# Available Time Slots - Lodge Mobile Activations

## Business Hours Configuration
- **Days**: Monday through Saturday ONLY (No Sundays)
- **Hours**: 11:00 AM - 8:00 PM Eastern Time
- **Appointment Duration**: 90 minutes (1.5 hours) per booking
- **Daily Maximum**: 5 appointments per day

## Available Time Slot Buttons

The bot will ONLY show these time slot buttons:

### Morning to Afternoon:
- ✅ 11:00 AM
- ✅ 11:30 AM  
- ✅ 12:00 PM
- ✅ 12:30 PM
- ✅ 1:00 PM
- ✅ 1:30 PM
- ✅ 2:00 PM
- ✅ 2:30 PM

### Afternoon to Evening:
- ✅ 3:00 PM
- ✅ 3:30 PM
- ✅ 4:00 PM
- ✅ 4:30 PM
- ✅ 5:00 PM
- ✅ 5:30 PM
- ✅ 6:00 PM
- ✅ 6:30 PM (LAST SLOT - ends at 8:00 PM)

**Total**: 16 possible time slots per day

## NO Slots Outside Business Hours

The following times are NEVER shown as buttons:
- ❌ Any time before 11:00 AM
- ❌ 7:00 PM 
- ❌ 7:30 PM
- ❌ 8:00 PM
- ❌ Any time after 8:00 PM
- ❌ Any slot on Sunday

## How 90-Minute Blocking Works

When a customer books a slot, it blocks 3 consecutive 30-minute slots:

### Example Bookings:
1. **Book 11:00 AM** → Blocks: 11:00 AM, 11:30 AM, 12:00 PM
2. **Book 12:30 PM** → Blocks: 12:30 PM, 1:00 PM, 1:30 PM  
3. **Book 3:00 PM** → Blocks: 3:00 PM, 3:30 PM, 4:00 PM
4. **Book 5:00 PM** → Blocks: 5:00 PM, 5:30 PM, 6:00 PM
5. **Book 6:30 PM** → Blocks: 6:30 PM (last slot, ends at 8:00 PM)

## Date Selection

When selecting dates, the bot:
- Shows next 7 available business days
- Automatically skips Sundays
- Shows date format: "Aug 07 (Wed)"
- Only displays Monday through Saturday

## Implementation Details

### Code prevents slots outside hours:
```javascript
// Loop only goes from 11 (11 AM) to 18 (6 PM)
for (let hour = 11; hour <= 18; hour++) {
  // Only creates buttons for valid business hours
  // Last slot is 6:30 PM (18:30)
}
```

### No buttons created for:
- Hours before 11 (morning)
- Hours after 18:30 (6:30 PM)
- Any time on Sunday (day 0)

## User Experience

1. User types `/book`
2. Selects service (Lodge Mobile Activations)
3. Sees ONLY Monday-Saturday dates
4. Sees ONLY 11:00 AM - 6:30 PM time slots
5. Cannot book outside business hours (no buttons exist)
6. Each booking blocks 90 minutes automatically

## Current Status
✅ **ACTIVE** - Bot enforces all business hour restrictions
- No slots shown outside 11 AM - 8 PM
- No Sunday appointments possible
- 90-minute blocking prevents overlaps
- Maximum 5 appointments per day enforced