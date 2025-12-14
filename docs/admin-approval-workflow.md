## Admin Approval Workflow

The Telegram bot now enforces a strict approval gate for every new user. Pending users cannot reach booking or support flows until an administrator approves their account.

### Prerequisites

1. Set `ADMIN_TELEGRAM_ID` (or `ADMIN_USER_ID`) in `.env`. This ID receives approval notifications.
2. Optional: Populate `ADMIN_USER_IDS` with additional admin IDs (comma-separated) so multiple reviewers get the alerts.
3. Restart the bot after changing environment variables.

### What Happens When a User Joins

1. Any `/start` (or first interaction) from a non-admin Telegram account creates a `users` row with `approval_status = 'pending'`.
2. Auth middleware blocks every command except `/start`, `/help`, `/request`, and `/invite` while the user remains pending.
3. The bot sends every admin a Markdown alert that includes:
   - Full name / username / Telegram ID
   - Telegram locale (language + region hint)
   - Phone country code + area code (when available)
   - Timestamp of the access request
   - A quick “Canada Match” verdict so you can spot non-Canadian sign-ups at a glance
4. Inline buttons on that notification let admins approve or deny instantly.

### Approving or Denying Access

You can review pending requests in two ways:

- **Inline buttons** – tap `Approve <id>` or `Deny <id>` straight from the alert.
- **Commands** – use `/requests` to see the queue, `/approve <telegram_id>`, or `/deny <telegram_id>` if you prefer manual entry.

When approved, the user receives a confirmation DM and immediately regains full access to `/book`, `/support`, etc. Denied users are prevented from interacting unless you later change their status.

### Verifying the Flow

1. Start the bot locally (`npm run start:bot`).
2. From a non-admin Telegram account run `/start`. You should get the “pending approval” response.
3. Confirm that the admin account receives the rich notification with locale + phone metadata.
4. Approve the user either via the inline button or `/approve <id>`.
5. Retry `/book` from the user account – it should now succeed.

Following the above steps keeps the bot geo-locked at the human-review layer while still giving admins the context they need to vet every new account.
