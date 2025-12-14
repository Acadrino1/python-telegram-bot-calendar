# Known Issues

## Announcement Inline Buttons Not Triggering Actions

**File:** `scripts/announce-updates.js:50-56`

**Problem:**
Inline buttons in channel announcement messages don't trigger any bot actions when clicked. Users click buttons but nothing happens.

**Current Behavior:**
- Buttons use URL type pointing to `https://t.me/LodgeMobile_bot`
- Clicking only opens bot chat, no command executed
- No automatic action triggered

**Expected Behavior:**
- Clicking "Book TELUS Activation Now" should start booking flow
- Clicking "View Services" should show service selection
- Clicking "Get Support" should open support menu

**Root Cause:**
URL buttons (`url` type) in channel messages can't trigger callback actions. They only open links. Need different approach:
- Option 1: Use `switch_inline_query` to send commands
- Option 2: Use deep links with /start parameters
- Option 3: Simplify to just open bot and instruct users to use commands

**Steps to Reproduce:**
1. Run `node scripts/announce-updates.js`
2. Check Lodge Mobile channel (topic 7394)
3. Click any inline button
4. Observe: bot opens but no action triggered

**Hypothesis:**
Telegram URL buttons from channel messages can't execute bot callbacks. Need to use `switch_inline_query` or properly formatted deep links (`https://t.me/LodgeMobile_bot?start=<payload>`) with corresponding /start handler.

**Proposed Fix:**
Implement deep link handling:
1. Add /start parameter handling in bot
2. Update buttons to use `?start=book`, `?start=services`, `?start=support`
3. Parse start params and route to appropriate handlers

**Priority:** Medium
**Tags:** [bug] [telegram] [UX]
**Status:** Open
**Created:** 2024-12-14
