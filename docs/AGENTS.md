# AGENTS.md - Instructions for Codex

## Node.js Environment

This project uses Node.js with npm. **Always ensure dependencies are installed before running commands.**

### Project Location
- **Windows**: `C:\Users\yvrbu\Desktop\Lodge Scheduler`

## Running the Bot

### Start the Telegram Bot:
```bash
# Standard start
npm run start:bot

# Or directly
node src/bot/bot.js
```

### With Docker:
```bash
docker-compose up -d
```

## Running Tests

### Correct way to run tests:
```bash
# Run all tests
npm test

# Run specific test file
node tests/validate-system.js

# Run integration tests
node tests/system-integration-tests.js

# Run security validation
node tests/security-validation.js
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in required values:
   - `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
   - `DATABASE_URL` - Database connection string
   - `JWT_SECRET` - Secret for JWT tokens

## Database Commands

- Run migrations: `npx knex migrate:latest`
- Rollback: `npx knex migrate:rollback`
- Seed data: `npx knex seed:run`

## Before Committing

1. Ensure all tests pass: `npm test`
2. Check for linting errors: `npm run lint` (if configured)
3. Verify bot starts without errors: `npm run start:bot`

## Docker Deployment

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```
