# Contributing to Appointment Scheduler

Thank you for your interest in contributing to the Appointment Scheduler project! We welcome contributions from the community.

## How to Contribute

### Reporting Issues

Before creating an issue, please check if it already exists. When creating a new issue, provide:
- Clear description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- System information (OS, Node version, etc.)

### Pull Requests

1. **Fork the Repository**
   ```bash
   git clone https://github.com/yourusername/appointment-scheduler.git
   cd appointment-scheduler
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   npm install
   npm test
   npm run lint
   ```

5. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

6. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your fork and branch
   - Provide a clear description of your changes

## Development Setup

### Prerequisites
- Node.js >= 16.0.0
- MySQL 8.0
- Redis (optional)

### Local Development
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Set up database
npm run migrate
npm run seed

# Start development server
npm run dev

# Start bot in development
npm run dev:bot
```

### Testing
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## Code Style

- Use ESLint and Prettier configurations provided
- Follow JavaScript Standard Style
- Use meaningful variable and function names
- Add JSDoc comments for functions
- Keep functions small and focused

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add SMS notification support
fix: resolve booking conflict detection issue
docs: update API documentation
```

## Security

- Never commit sensitive data (tokens, passwords, etc.)
- Report security vulnerabilities privately to maintainers
- Follow security best practices in code

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for contributing to Appointment Scheduler!