#!/bin/bash

# Telegram Appointment Scheduler Bot - Deployment Script
# Usage: ./deploy.sh [environment] [version]
# Example: ./deploy.sh production v1.0.0

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Validate environment
validate_environment() {
    log_step "Validating environment: $ENVIRONMENT"
    
    case "$ENVIRONMENT" in
        development|staging|production)
            log_info "Environment '$ENVIRONMENT' is valid"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            log_error "Valid options: development, staging, production"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites"
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if required files exist
    if [[ ! -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        log_error "docker-compose.yml not found in project root"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/Dockerfile" ]]; then
        log_error "Dockerfile not found in project root"
        exit 1
    fi
    
    log_info "All prerequisites met"
}

# Create environment file
create_env_file() {
    log_step "Creating environment file for $ENVIRONMENT"
    
    local env_file="$PROJECT_ROOT/.env"
    local example_file="$PROJECT_ROOT/.env.example"
    
    if [[ ! -f "$env_file" ]] && [[ -f "$example_file" ]]; then
        cp "$example_file" "$env_file"
        log_warn "Created .env from .env.example - please update with actual values"
    elif [[ ! -f "$env_file" ]]; then
        log_error "No .env file found and no .env.example to copy from"
        exit 1
    fi
    
    # Set environment-specific variables
    case "$ENVIRONMENT" in
        production)
            export NODE_ENV=production
            export LOG_LEVEL=warn
            ;;
        staging)
            export NODE_ENV=staging
            export LOG_LEVEL=info
            ;;
        development)
            export NODE_ENV=development
            export LOG_LEVEL=debug
            ;;
    esac
    
    # Export version
    export APP_VERSION="$VERSION"
    
    log_info "Environment variables configured for $ENVIRONMENT"
}

# Backup existing data
backup_data() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_step "Creating backup for production deployment"
        
        local backup_dir="$PROJECT_ROOT/devops/backup/deployments/$BACKUP_TIMESTAMP"
        mkdir -p "$backup_dir"
        
        # Backup database
        if docker ps | grep -q "appointment-scheduler-mysql"; then
            log_info "Backing up database..."
            docker exec appointment-scheduler-mysql mysqldump -u root -p\${MYSQL_ROOT_PASSWORD} appointment_scheduler > "$backup_dir/database_backup.sql"
        fi
        
        # Backup application data
        if [[ -d "$PROJECT_ROOT/data" ]]; then
            log_info "Backing up application data..."
            cp -r "$PROJECT_ROOT/data" "$backup_dir/"
        fi
        
        # Backup logs
        if [[ -d "$PROJECT_ROOT/logs" ]]; then
            log_info "Backing up logs..."
            cp -r "$PROJECT_ROOT/logs" "$backup_dir/"
        fi
        
        log_info "Backup completed: $backup_dir"
    fi
}

# Build application
build_application() {
    log_step "Building application"
    
    cd "$PROJECT_ROOT"
    
    # Build Docker image
    log_info "Building Docker image..."
    docker build \
        --tag "appointment-scheduler:$VERSION" \
        --tag "appointment-scheduler:latest" \
        --build-arg NODE_ENV="$ENVIRONMENT" \
        .
    
    log_info "Docker image built successfully"
}

# Deploy application
deploy_application() {
    log_step "Deploying application"
    
    cd "$PROJECT_ROOT"
    
    # Stop existing containers
    log_info "Stopping existing containers..."
    docker-compose down --remove-orphans
    
    # Start new containers
    log_info "Starting new containers..."
    docker-compose up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose ps | grep -q "healthy"; then
            log_info "Services are healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Services failed to become healthy within timeout"
            exit 1
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for services..."
        sleep 10
        ((attempt++))
    done
    
    log_info "Application deployed successfully"
}

# Run health checks
health_check() {
    log_step "Running health checks"
    
    # Check API health
    local api_url="http://localhost:3000/health"
    if curl -f -s "$api_url" > /dev/null; then
        log_info "API health check passed"
    else
        log_error "API health check failed"
        exit 1
    fi
    
    # Check database connection
    if docker exec appointment-scheduler-mysql mysqladmin ping -h localhost --silent; then
        log_info "Database health check passed"
    else
        log_error "Database health check failed"
        exit 1
    fi
    
    # Check bot status
    if docker logs appointment-scheduler-bot 2>&1 | grep -q "Bot started successfully"; then
        log_info "Bot health check passed"
    else
        log_warn "Bot health check failed - check logs"
    fi
    
    log_info "Health checks completed"
}

# Run smoke tests
smoke_tests() {
    log_step "Running smoke tests"
    
    cd "$PROJECT_ROOT"
    
    # Run basic API tests
    if [[ -f "tests/smoke/api.test.js" ]]; then
        npm run test:smoke
    else
        log_warn "No smoke tests found - skipping"
    fi
    
    log_info "Smoke tests completed"
}

# Post-deployment tasks
post_deployment() {
    log_step "Running post-deployment tasks"
    
    # Run database migrations
    log_info "Running database migrations..."
    docker exec -it appointment-scheduler-app npm run migrate
    
    # Clear cache if Redis is available
    if docker ps | grep -q "redis"; then
        log_info "Clearing cache..."
        docker exec appointment-scheduler-redis redis-cli FLUSHDB
    fi
    
    # Restart Telegram bot to ensure clean state
    log_info "Restarting Telegram bot..."
    docker-compose restart bot
    
    log_info "Post-deployment tasks completed"
}

# Cleanup old images
cleanup() {
    log_step "Cleaning up old Docker images"
    
    # Remove unused images
    docker image prune -f
    
    # Remove old app images (keep last 3 versions)
    docker images appointment-scheduler --format "table {{.ID}}\t{{.Tag}}" | \
        tail -n +4 | \
        awk '{print $1}' | \
        xargs -r docker rmi
    
    log_info "Cleanup completed"
}

# Send notification
send_notification() {
    local status=$1
    local message="Deployment $status: $ENVIRONMENT environment, version $VERSION"
    
    # Log deployment event
    echo "$(date): $message" >> "$PROJECT_ROOT/devops/logs/deployment.log"
    
    # Send Slack notification (if configured)
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    log_info "Notification sent: $message"
}

# Rollback function
rollback() {
    log_error "Deployment failed - initiating rollback"
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        # Restore from backup
        local latest_backup=$(find "$PROJECT_ROOT/devops/backup/deployments" -maxdepth 1 -type d | sort | tail -n 2 | head -n 1)
        
        if [[ -n "$latest_backup" ]] && [[ -d "$latest_backup" ]]; then
            log_info "Restoring from backup: $latest_backup"
            
            # Restore database
            if [[ -f "$latest_backup/database_backup.sql" ]]; then
                docker exec -i appointment-scheduler-mysql mysql -u root -p\${MYSQL_ROOT_PASSWORD} appointment_scheduler < "$latest_backup/database_backup.sql"
            fi
            
            # Restart services with previous version
            docker-compose down
            docker-compose up -d
        fi
    fi
    
    send_notification "FAILED (rollback initiated)"
    exit 1
}

# Main deployment process
main() {
    log_info "Starting deployment process..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    log_info "Timestamp: $BACKUP_TIMESTAMP"
    
    # Set trap for error handling
    trap rollback ERR
    
    validate_environment
    check_prerequisites
    create_env_file
    backup_data
    build_application
    deploy_application
    health_check
    smoke_tests
    post_deployment
    cleanup
    
    send_notification "SUCCESS"
    
    log_info "Deployment completed successfully!"
    log_info "Application is running at:"
    log_info "  - API: http://localhost:3000"
    log_info "  - Admin Panel: http://localhost:8080 (Adminer)"
    log_info "  - Logs: $PROJECT_ROOT/logs"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi