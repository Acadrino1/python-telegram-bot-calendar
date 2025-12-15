#!/bin/bash

# Comprehensive Backup Script for Telegram Appointment Scheduler Bot
# Usage: ./backup-script.sh [type] [retention-days]
# Types: full, incremental, database-only, files-only
# Example: ./backup-script.sh full 30

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_TYPE="${1:-full}"
RETENTION_DAYS="${2:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$SCRIPT_DIR/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Configuration
MYSQL_CONTAINER="appointment-scheduler-mysql"
REDIS_CONTAINER="appointment-scheduler-redis"
APP_CONTAINER="appointment-scheduler-app"
BOT_CONTAINER="appointment-scheduler-bot"

DB_USER="root"
DB_PASSWORD="rootpassword123"
DB_NAME="appointment_scheduler"

# Create backup directories
create_backup_structure() {
    local backup_path="$BACKUP_DIR/$BACKUP_TYPE/$TIMESTAMP"
    
    mkdir -p "$backup_path"/{database,files,configs,logs,docker}
    echo "$backup_path"
}

# Database backup
backup_database() {
    local backup_path="$1"
    log_step "Backing up database"
    
    if ! docker ps | grep -q "$MYSQL_CONTAINER"; then
        log_error "MySQL container not running"
        return 1
    fi
    
    # Full database backup
    log_info "Creating full database dump..."
    docker exec "$MYSQL_CONTAINER" mysqldump \
        -u "$DB_USER" \
        -p"$DB_PASSWORD" \
        --single-transaction \
        --routines \
        --triggers \
        --all-databases \
        > "$backup_path/database/full_backup.sql"
    
    # Application-specific backup
    log_info "Creating application database dump..."
    docker exec "$MYSQL_CONTAINER" mysqldump \
        -u "$DB_USER" \
        -p"$DB_PASSWORD" \
        --single-transaction \
        --routines \
        --triggers \
        "$DB_NAME" \
        > "$backup_path/database/app_backup.sql"
    
    # Schema-only backup
    log_info "Creating schema backup..."
    docker exec "$MYSQL_CONTAINER" mysqldump \
        -u "$DB_USER" \
        -p"$DB_PASSWORD" \
        --no-data \
        --routines \
        --triggers \
        "$DB_NAME" \
        > "$backup_path/database/schema_backup.sql"
    
    # Database statistics
    docker exec "$MYSQL_CONTAINER" mysql \
        -u "$DB_USER" \
        -p"$DB_PASSWORD" \
        -e "SELECT 
                table_name AS 'Table',
                table_rows AS 'Rows',
                ROUND(data_length/1024/1024, 2) AS 'Size (MB)'
            FROM information_schema.tables 
            WHERE table_schema = '$DB_NAME'
            ORDER BY data_length DESC;" \
        > "$backup_path/database/table_stats.txt"
    
    log_info "Database backup completed"
}

# Redis backup
backup_redis() {
    local backup_path="$1"
    log_step "Backing up Redis data"
    
    if docker ps | grep -q "$REDIS_CONTAINER"; then
        log_info "Creating Redis backup..."
        
        # Create Redis dump
        docker exec "$REDIS_CONTAINER" redis-cli BGSAVE
        sleep 5
        
        # Copy dump file
        docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$backup_path/files/redis_dump.rdb" || {
            log_warn "Redis backup failed - continuing without Redis data"
        }
        
        # Redis configuration
        docker exec "$REDIS_CONTAINER" redis-cli CONFIG GET "*" > "$backup_path/configs/redis_config.txt" || true
        
        log_info "Redis backup completed"
    else
        log_warn "Redis container not running - skipping Redis backup"
    fi
}

# Application files backup
backup_application_files() {
    local backup_path="$1"
    log_step "Backing up application files"
    
    # Application data
    if [[ -d "$PROJECT_ROOT/data" ]]; then
        log_info "Backing up application data..."
        cp -r "$PROJECT_ROOT/data" "$backup_path/files/"
    fi
    
    # Configuration files
    log_info "Backing up configuration files..."
    if [[ -f "$PROJECT_ROOT/config.json" ]]; then
        cp "$PROJECT_ROOT/config.json" "$backup_path/configs/"
    fi
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        cp "$PROJECT_ROOT/.env" "$backup_path/configs/.env.backup"
    fi
    
    # Referral codes and blocked dates
    [[ -f "$PROJECT_ROOT/referral-codes.json" ]] && cp "$PROJECT_ROOT/referral-codes.json" "$backup_path/files/"
    [[ -f "$PROJECT_ROOT/blocked-dates.json" ]] && cp "$PROJECT_ROOT/blocked-dates.json" "$backup_path/files/"
    
    # Docker configurations
    log_info "Backing up Docker configurations..."
    cp "$PROJECT_ROOT/docker-compose.yml" "$backup_path/docker/" || true
    cp "$PROJECT_ROOT/Dockerfile" "$backup_path/docker/" || true
    [[ -f "$PROJECT_ROOT/.dockerignore" ]] && cp "$PROJECT_ROOT/.dockerignore" "$backup_path/docker/"
    
    log_info "Application files backup completed"
}

# Logs backup
backup_logs() {
    local backup_path="$1"
    log_step "Backing up logs"
    
    # Application logs
    if [[ -d "$PROJECT_ROOT/logs" ]]; then
        log_info "Backing up application logs..."
        cp -r "$PROJECT_ROOT/logs" "$backup_path/"
    fi
    
    # Container logs
    log_info "Backing up container logs..."
    local containers=("$MYSQL_CONTAINER" "$REDIS_CONTAINER" "$APP_CONTAINER" "$BOT_CONTAINER")
    
    for container in "${containers[@]}"; do
        if docker ps -a | grep -q "$container"; then
            docker logs "$container" > "$backup_path/logs/${container}.log" 2>&1 || true
        fi
    done
    
    log_info "Logs backup completed"
}

# System information backup
backup_system_info() {
    local backup_path="$1"
    log_step "Backing up system information"
    
    # Docker system info
    docker system df > "$backup_path/docker/system_df.txt" || true
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" > "$backup_path/docker/images.txt" || true
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" > "$backup_path/docker/containers.txt" || true
    
    # System information
    {
        echo "=== System Information ==="
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        echo "Kernel: $(uname -r)"
        echo ""
        echo "=== Disk Usage ==="
        df -h
        echo ""
        echo "=== Memory Usage ==="
        free -h
        echo ""
        echo "=== Docker Version ==="
        docker --version
        docker-compose --version
    } > "$backup_path/system_info.txt"
    
    log_info "System information backup completed"
}

# Create backup manifest
create_manifest() {
    local backup_path="$1"
    log_step "Creating backup manifest"
    
    {
        echo "=== Backup Manifest ==="
        echo "Type: $BACKUP_TYPE"
        echo "Timestamp: $TIMESTAMP"
        echo "Date: $(date)"
        echo "Project: Telegram Appointment Scheduler Bot"
        echo ""
        echo "=== Backup Contents ==="
        find "$backup_path" -type f -exec ls -lh {} \; | awk '{print $9, $5}'
        echo ""
        echo "=== Backup Size ==="
        du -sh "$backup_path"
        echo ""
        echo "=== Checksums ==="
        find "$backup_path" -type f -exec md5sum {} \;
    } > "$backup_path/manifest.txt"
    
    log_info "Backup manifest created"
}

# Compress backup
compress_backup() {
    local backup_path="$1"
    log_step "Compressing backup"
    
    local backup_name="$(basename "$backup_path")"
    local backup_parent="$(dirname "$backup_path")"
    
    cd "$backup_parent"
    tar -czf "${backup_name}.tar.gz" "$backup_name"
    
    if [[ -f "${backup_name}.tar.gz" ]]; then
        rm -rf "$backup_name"
        log_info "Backup compressed: ${backup_name}.tar.gz"
        echo "${backup_parent}/${backup_name}.tar.gz"
    else
        log_error "Backup compression failed"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log_step "Cleaning up old backups (older than $RETENTION_DAYS days)"
    
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -type d -empty -delete
    
    local remaining=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f | wc -l)
    log_info "Cleanup completed. $remaining backup(s) remaining."
}

# Verify backup
verify_backup() {
    local backup_file="$1"
    log_step "Verifying backup"
    
    if [[ -f "$backup_file" ]]; then
        # Test archive integrity
        if tar -tzf "$backup_file" >/dev/null 2>&1; then
            log_info "Backup archive integrity verified"
            
            # Check key files in archive
            local key_files=("manifest.txt" "database/app_backup.sql")
            for file in "${key_files[@]}"; do
                if tar -tzf "$backup_file" | grep -q "$file"; then
                    log_info "✓ Key file present: $file"
                else
                    log_warn "✗ Key file missing: $file"
                fi
            done
            
            return 0
        else
            log_error "Backup archive is corrupted"
            return 1
        fi
    else
        log_error "Backup file not found: $backup_file"
        return 1
    fi
}

# Send notification
send_notification() {
    local status="$1"
    local backup_file="$2"
    local size="$(du -sh "$backup_file" 2>/dev/null | cut -f1 || echo 'Unknown')"
    
    local message="Backup $status: $BACKUP_TYPE backup ($size) completed at $(date)"
    
    # Log to backup log
    echo "$(date): $message" >> "$BACKUP_DIR/backup.log"
    
    # Send to Slack if webhook configured
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"📦 $message\"}" \
            "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
    fi
    
    log_info "Notification sent: $message"
}

# Main backup process
main() {
    log_info "Starting $BACKUP_TYPE backup process..."
    log_info "Retention period: $RETENTION_DAYS days"
    log_info "Timestamp: $TIMESTAMP"
    
    # Create backup directory structure
    local backup_path
    backup_path=$(create_backup_structure)
    
    # Perform backup based on type
    case "$BACKUP_TYPE" in
        "full")
            backup_database "$backup_path"
            backup_redis "$backup_path"
            backup_application_files "$backup_path"
            backup_logs "$backup_path"
            backup_system_info "$backup_path"
            ;;
        "incremental")
            # Only backup changed files and new logs
            backup_application_files "$backup_path"
            backup_logs "$backup_path"
            ;;
        "database-only")
            backup_database "$backup_path"
            backup_system_info "$backup_path"
            ;;
        "files-only")
            backup_application_files "$backup_path"
            backup_logs "$backup_path"
            ;;
        *)
            log_error "Unknown backup type: $BACKUP_TYPE"
            log_error "Valid types: full, incremental, database-only, files-only"
            exit 1
            ;;
    esac
    
    # Create manifest and compress
    create_manifest "$backup_path"
    local compressed_backup
    compressed_backup=$(compress_backup "$backup_path")
    
    # Verify and cleanup
    if verify_backup "$compressed_backup"; then
        cleanup_old_backups
        send_notification "SUCCESS" "$compressed_backup"
        
        log_info "Backup completed successfully!"
        log_info "Backup location: $compressed_backup"
        log_info "Backup size: $(du -sh "$compressed_backup" | cut -f1)"
    else
        send_notification "FAILED" "$compressed_backup"
        log_error "Backup verification failed!"
        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi