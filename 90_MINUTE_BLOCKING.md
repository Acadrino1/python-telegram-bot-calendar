# 90-Minute Appointment Blocking System

## Overview
Each appointment now blocks a **90-minute (1.5 hour) window** to ensure adequate time for Lodge Mobile Activations without overlapping appointments.

## Key Changes

### 1. Appointment Duration
- All appointments are set to **90 minutes** duration
- This applies regardless of the service selected
- Database stores `duration_minutes: 90` for all bookings

### 2. Time Slot Blocking
When someone books an appointment:
- **Example**: Book at 11:00 AM
- **Blocked slots**: 11:00 AM, 11:30 AM, 12:00 PM
- **Next available**: 12:30 PM or later

### 3. Available Time Slots
- **First slot**: 11:00 AM
- **Last slot**: 6:30 PM (ends at 8:00 PM with 90-min duration)
- **Total slots per day**: 16 slots (but limited to 5 bookings max)

### Updated Schedule:
```
11:00 AM - 12:30 PM (blocks 11:00, 11:30, 12:00)
11:30 AM - 1:00 PM  (blocks 11:30, 12:00, 12:30)
12:00 PM - 1:30 PM  (blocks 12:00, 12:30, 1:00)
12:30 PM - 2:00 PM  (blocks 12:30, 1:00, 1:30)
1:00 PM - 2:30 PM   (blocks 1:00, 1:30, 2:00)
1:30 PM - 3:00 PM   (blocks 1:30, 2:00, 2:30)
2:00 PM - 3:30 PM   (blocks 2:00, 2:30, 3:00)
2:30 PM - 4:00 PM   (blocks 2:30, 3:00, 3:30)
3:00 PM - 4:30 PM   (blocks 3:00, 3:30, 4:00)
3:30 PM - 5:00 PM   (blocks 3:30, 4:00, 4:30)
4:00 PM - 5:30 PM   (blocks 4:00, 4:30, 5:00)
4:30 PM - 6:00 PM   (blocks 4:30, 5:00, 5:30)
5:00 PM - 6:30 PM   (blocks 5:00, 5:30, 6:00)
5:30 PM - 7:00 PM   (blocks 5:30, 6:00, 6:30)
6:00 PM - 7:30 PM   (blocks 6:00, 6:30)
6:30 PM - 8:00 PM   (blocks 6:30) - LAST POSSIBLE SLOT
```

## Conflict Prevention

### How It Works:
1. When checking available slots, the system looks for any appointments that would overlap with the 90-minute window
2. All slots within the 90-minute window are marked as "❌ Blocked"
3. Users cannot select blocked time slots

### Example Scenario:
- User A books 11:00 AM on Monday
- User B tries to book on the same Monday:
  - 11:00 AM: ❌ Blocked
  - 11:30 AM: ❌ Blocked  
  - 12:00 PM: ❌ Blocked
  - 12:30 PM: ✅ Available

## Daily Limits
- **Maximum appointments per day**: 5
- With 90-minute blocks, this ensures manageable workload
- When 5 appointments are booked, the entire day shows as "Fully Booked"

## User Interface Updates

### Time Selection Screen:
- Shows: "⏱️ Each appointment blocks 90 minutes (1.5 hours)"
- Available slots marked with ✅
- Blocked slots marked with ❌ and labeled "Blocked (90-min window)"

### Confirmation Screen:
- Displays: "Duration: 90 minutes (1.5 hours)"
- Clear indication of the time commitment

### Notifications:
- Provider receives: "Duration: 90 minutes (1.5 hours)"
- Client reminder includes the 90-minute duration

## Testing the System

1. **Book an appointment at 11:00 AM**
   - Verify 11:00, 11:30, 12:00 slots become blocked
   
2. **Try to book overlapping slots**
   - System should prevent booking within the 90-minute window
   
3. **Check daily limits**
   - After 5 bookings, day should show as fully booked

## Future Enhancements

- Add ability to mark appointment as "completed early" to free up slots
- Allow admin to override 90-minute duration for specific appointments
- Implement different durations for different service types

## Current Status
✅ **Implemented and Active** - All appointments now use 90-minute blocking