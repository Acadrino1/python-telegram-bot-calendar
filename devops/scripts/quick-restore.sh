#!/bin/bash

# Quick Restore Script for Telegram Appointment Scheduler Bot
# Usage: ./quick-restore.sh [backup-timestamp] [environment]
# Example: ./quick-restore.sh 20241201_143000 production

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_TIMESTAMP="${1:-latest}"
ENVIRONMENT="${2:-production}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Find backup directory
find_backup() {
    local backup_dir="$PROJECT_ROOT/devops/backup"
    
    if [[ "$BACKUP_TIMESTAMP" == "latest" ]]; then
        BACKUP_PATH=$(find "$backup_dir" -type d -name "*_*" | sort | tail -n 1)
    else
        BACKUP_PATH="$backup_dir/deployments/$BACKUP_TIMESTAMP"
    fi
    
    if [[ ! -d "$BACKUP_PATH" ]]; then
        log_error "Backup not found: $BACKUP_PATH"
        exit 1
    fi
    
    log_info "Using backup: $BACKUP_PATH"
}

# Stop services
stop_services() {
    log_step "Stopping services"
    cd "$PROJECT_ROOT"
    docker-compose down --remove-orphans
}

# Restore database
restore_database() {
    log_step "Restoring database"
    
    if [[ -f "$BACKUP_PATH/database_backup.sql" ]]; then
        log_info "Starting database container..."
        docker-compose up -d mysql
        
        # Wait for database to be ready
        sleep 30
        
        log_info "Restoring database from backup..."
        docker exec -i appointment-scheduler-mysql mysql -u root -prootpassword123 appointment_scheduler < "$BACKUP_PATH/database_backup.sql"
        
        log_info "Database restored successfully"
    else
        log_warn "No database backup found"
    fi
}

# Restore application data
restore_data() {
    log_step "Restoring application data"
    
    if [[ -d "$BACKUP_PATH/data" ]]; then
        log_info "Restoring application data..."
        rm -rf "$PROJECT_ROOT/data"
        cp -r "$BACKUP_PATH/data" "$PROJECT_ROOT/"
        log_info "Application data restored"
    else
        log_warn "No application data backup found"
    fi
    
    if [[ -d "$BACKUP_PATH/logs" ]]; then
        log_info "Restoring logs..."
        mkdir -p "$PROJECT_ROOT/logs/restored"
        cp -r "$BACKUP_PATH/logs/"* "$PROJECT_ROOT/logs/restored/"
        log_info "Logs restored to logs/restored/"
    else
        log_warn "No log backup found"
    fi
}

# Start services
start_services() {
    log_step "Starting services"
    cd "$PROJECT_ROOT"
    docker-compose up -d
    
    # Wait for services
    log_info "Waiting for services to start..."
    sleep 60
    
    # Check health
    if curl -f -s "http://localhost:3000/health" > /dev/null; then
        log_info "API is healthy"
    else
        log_error "API health check failed"
    fi
}

# Verify restoration
verify_restoration() {
    log_step "Verifying restoration"
    
    # Check database
    if docker exec appointment-scheduler-mysql mysqladmin ping -h localhost --silent; then
        log_info "Database is accessible"
        
        # Check if tables exist
        local table_count=$(docker exec appointment-scheduler-mysql mysql -u root -prootpassword123 -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'appointment_scheduler';" --skip-column-names)
        log_info "Found $table_count tables in database"
    else
        log_error "Database verification failed"
    fi
    
    # Check bot status
    sleep 10
    if docker logs appointment-scheduler-bot 2>&1 | tail -20 | grep -q "Bot started"; then
        log_info "Bot appears to be running"
    else
        log_warn "Bot status unclear - check logs manually"
    fi
}

# Main restoration process
main() {
    log_info "Starting quick restoration process..."
    log_info "Backup: $BACKUP_TIMESTAMP"
    log_info "Environment: $ENVIRONMENT"
    
    find_backup
    stop_services
    restore_database
    restore_data
    start_services
    verify_restoration
    
    log_info "Restoration completed!"
    log_info "Services:"
    log_info "  - API: http://localhost:3000"
    log_info "  - Adminer: http://localhost:8080"
    log_info "  - Bot logs: docker logs appointment-scheduler-bot"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi