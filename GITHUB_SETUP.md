# GitHub Repository Setup Guide

Your local Git repository has been successfully initialized with a comprehensive structure. Follow these steps to push it to GitHub:

## Step 1: Create a New Repository on GitHub

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Fill in the repository details:
   - **Repository name**: `appointment-scheduler`
   - **Description**: "Complete appointment scheduling system with Telegram bot integration and REST API"
   - **Visibility**: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

## Step 2: Connect Your Local Repository to GitHub

After creating the repository on GitHub, you'll see instructions. Run these commands in your terminal:

```bash
# Navigate to your project directory
cd /home/ralph/Desktop/appointment-scheduler

# Add the GitHub repository as origin (replace with your actual repository URL)
git remote add origin https://github.com/YOUR_USERNAME/appointment-scheduler.git

# Or if using SSH:
git remote add origin git@github.com:YOUR_USERNAME/appointment-scheduler.git

# Push your code to GitHub
git push -u origin main
```

## Step 3: Update Package.json

After pushing, update the repository URLs in package.json:

```bash
# Edit package.json to replace 'yourusername' with your actual GitHub username
nano package.json
```

Update these fields:
- `"url": "git+https://github.com/YOUR_USERNAME/appointment-scheduler.git"`
- `"bugs": "https://github.com/YOUR_USERNAME/appointment-scheduler/issues"`
- `"homepage": "https://github.com/YOUR_USERNAME/appointment-scheduler#readme"`

Then commit and push the changes:
```bash
git add package.json
git commit -m "docs: update repository URLs with correct GitHub username"
git push
```

## Step 4: Configure GitHub Repository Settings

### Enable Issues
1. Go to Settings → General
2. Ensure "Issues" is checked

### Set Up Branch Protection (for production repositories)
1. Go to Settings → Branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Check:
   - Require pull request reviews before merging
   - Dismiss stale pull request approvals when new commits are pushed
   - Require status checks to pass before merging
   - Require branches to be up to date before merging
   - Include administrators

### Enable GitHub Actions
1. Go to Settings → Actions → General
2. Select "Allow all actions and reusable workflows"

### Set Up Secrets for CI/CD
1. Go to Settings → Secrets and variables → Actions
2. Add these repository secrets:
   - `JWT_SECRET`: Your JWT secret key
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token (if deploying bot)
   - `DOCKER_USERNAME`: Docker Hub username (optional)
   - `DOCKER_PASSWORD`: Docker Hub password (optional)

### Configure Dependabot
1. Go to Settings → Security & analysis
2. Enable:
   - Dependency graph
   - Dependabot alerts
   - Dependabot security updates

## Step 5: Verify GitHub Actions

After pushing, check the Actions tab to ensure:
- CI workflow runs on push
- All tests pass
- No security vulnerabilities detected

## Step 6: Add Repository Topics

Go to the main repository page and click the gear icon next to "About" to add topics:
- `nodejs`
- `telegram-bot`
- `appointment-scheduler`
- `rest-api`
- `mysql`
- `docker`
- `express`

## Step 7: Create Initial Release (Optional)

1. Go to Releases → Create a new release
2. Tag version: `v1.0.0`
3. Release title: "Initial Release"
4. Describe the features
5. Publish release

## Additional Recommendations

### README Badges
After pushing, you can add status badges to your README:

```markdown
![CI](https://github.com/YOUR_USERNAME/appointment-scheduler/workflows/CI/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
```

### Create a Project Board
1. Go to Projects → New project
2. Select "Board" template
3. Create columns: To Do, In Progress, In Review, Done
4. Link to issues and pull requests

### Enable Discussions (Optional)
1. Go to Settings → General
2. Check "Discussions" to enable community discussions

## Troubleshooting

### If you encounter permission errors:
```bash
# Check your Git configuration
git config --list

# Set up your GitHub credentials
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### If using SSH and having issues:
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Copy public key and add to GitHub Settings → SSH and GPG keys
cat ~/.ssh/id_ed25519.pub
```

## Next Steps

1. **Invite Collaborators**: Settings → Manage access → Invite a collaborator
2. **Set Up Webhooks**: Settings → Webhooks (for deployment automation)
3. **Configure Deployment**: Set up automated deployment using GitHub Actions
4. **Monitor Security**: Regularly check Security tab for vulnerabilities
5. **Create Wiki**: Document detailed usage and API documentation

## Support

If you encounter any issues:
1. Check GitHub Status: https://www.githubstatus.com/
2. GitHub Documentation: https://docs.github.com/
3. Create an issue in the repository for project-specific problems

---

**Note**: Remember to keep your tokens and secrets secure. Never commit them to the repository!