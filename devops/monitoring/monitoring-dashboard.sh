#!/bin/bash

# Monitoring Dashboard for Telegram Appointment Scheduler Bot
# Displays real-time system status in a user-friendly format

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
REFRESH_INTERVAL=5
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HEALTH_CHECK_SCRIPT="$PROJECT_ROOT/devops/monitoring/health-check.js"

# Display functions
print_header() {
    clear
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║               APPOINTMENT SCHEDULER MONITORING DASHBOARD          ║${NC}"
    echo -e "${BLUE}║                    Last Update: $(date '+%Y-%m-%d %H:%M:%S')                 ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo
}

get_container_status() {
    local container=$1
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container.*Up"; then
        echo -e "${GREEN}●${NC} Running"
    elif docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -q "$container"; then
        echo -e "${RED}●${NC} Stopped"
    else
        echo -e "${YELLOW}●${NC} Not Found"
    fi
}

get_container_uptime() {
    local container=$1
    local status=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$container" | awk '{print $2, $3}' 2>/dev/null || echo "Down")
    echo "$status"
}

get_container_resource_usage() {
    local container=$1
    if docker ps | grep -q "$container"; then
        local stats=$(docker stats "$container" --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}" | tail -1)
        echo "$stats"
    else
        echo "N/A"
    fi
}

check_api_health() {
    if curl -f -s "http://localhost:3000/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Healthy"
    else
        echo -e "${RED}✗${NC} Unhealthy"
    fi
}

check_database_health() {
    if docker exec appointment-scheduler-mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Connected"
    else
        echo -e "${RED}✗${NC} Disconnected"
    fi
}

get_database_stats() {
    if docker ps | grep -q "appointment-scheduler-mysql"; then
        local connections=$(docker exec appointment-scheduler-mysql mysql -u root -prootpassword123 -e "SHOW STATUS LIKE 'Threads_connected'" --skip-column-names 2>/dev/null | awk '{print $2}' || echo "N/A")
        local queries=$(docker exec appointment-scheduler-mysql mysql -u root -prootpassword123 -e "SHOW STATUS LIKE 'Questions'" --skip-column-names 2>/dev/null | awk '{print $2}' || echo "N/A")
        echo "Connections: $connections, Queries: $queries"
    else
        echo "Database offline"
    fi
}

get_redis_stats() {
    if docker ps | grep -q "appointment-scheduler-redis"; then
        local info=$(docker exec appointment-scheduler-redis redis-cli info stats 2>/dev/null | grep -E "total_commands_processed|connected_clients" | cut -d: -f2 | tr -d '\r' | paste -sd "," || echo "N/A")
        echo "Commands: $(echo $info | cut -d, -f1), Clients: $(echo $info | cut -d, -f2)"
    else
        echo "Redis offline"
    fi
}

get_system_metrics() {
    # CPU Usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    
    # Memory Usage
    local mem_info=$(free | grep Mem)
    local mem_total=$(echo $mem_info | awk '{print $2}')
    local mem_used=$(echo $mem_info | awk '{print $3}')
    local mem_percent=$(awk "BEGIN {printf \"%.1f\", $mem_used/$mem_total*100}")
    
    # Disk Usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}')
    
    echo "CPU: ${cpu_usage}%, Memory: ${mem_percent}%, Disk: ${disk_usage}"
}

get_log_tail() {
    local log_file="$1"
    local lines="${2:-5}"
    
    if [[ -f "$log_file" ]]; then
        tail -n "$lines" "$log_file" 2>/dev/null | while IFS= read -r line; do
            if [[ "$line" == *"ERROR"* ]] || [[ "$line" == *"error"* ]]; then
                echo -e "${RED}$line${NC}"
            elif [[ "$line" == *"WARN"* ]] || [[ "$line" == *"warn"* ]]; then
                echo -e "${YELLOW}$line${NC}"
            else
                echo "$line"
            fi
        done
    else
        echo "Log file not found"
    fi
}

display_container_status() {
    echo -e "${CYAN}┌─ CONTAINER STATUS ────────────────────────────────────────────────┐${NC}"
    printf "%-20s %-15s %-20s %-20s\n" "Container" "Status" "Uptime" "Resources"
    echo "────────────────────────────────────────────────────────────────────"
    
    local containers=(
        "appointment-scheduler-mysql"
        "appointment-scheduler-redis" 
        "appointment-scheduler-app"
        "appointment-scheduler-bot"
    )
    
    for container in "${containers[@]}"; do
        local name=$(echo "$container" | sed 's/appointment-scheduler-//')
        local status=$(get_container_status "$container")
        local uptime=$(get_container_uptime "$container")
        local resources=$(get_container_resource_usage "$container")
        
        printf "%-20s %-25s %-20s %-20s\n" "$name" "$status" "$uptime" "$resources"
    done
    echo -e "${CYAN}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo
}

display_service_health() {
    echo -e "${CYAN}┌─ SERVICE HEALTH ──────────────────────────────────────────────────┐${NC}"
    printf "%-20s %-20s %-30s\n" "Service" "Status" "Details"
    echo "────────────────────────────────────────────────────────────────────"
    
    printf "%-20s %-20s %-30s\n" "API" "$(check_api_health)" "http://localhost:3000"
    printf "%-20s %-20s %-30s\n" "Database" "$(check_database_health)" "$(get_database_stats)"
    printf "%-20s %-20s %-30s\n" "Redis" "$(docker ps | grep -q redis && echo -e "${GREEN}✓${NC} Available" || echo -e "${YELLOW}○${NC} Optional")" "$(get_redis_stats)"
    
    echo -e "${CYAN}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo
}

display_system_metrics() {
    echo -e "${CYAN}┌─ SYSTEM METRICS ──────────────────────────────────────────────────┐${NC}"
    echo "System Resources: $(get_system_metrics)"
    echo "Docker Images: $(docker images | grep -c appointment-scheduler) related images"
    echo "Docker Volumes: $(docker volume ls | grep -c appointment) volumes in use"
    echo -e "${CYAN}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo
}

display_recent_logs() {
    echo -e "${CYAN}┌─ RECENT LOGS (Last 3 lines) ─────────────────────────────────────┐${NC}"
    
    echo -e "${PURPLE}API Logs:${NC}"
    get_log_tail "$PROJECT_ROOT/logs/combined.log" 3
    echo
    
    echo -e "${PURPLE}Error Logs:${NC}"
    get_log_tail "$PROJECT_ROOT/logs/error.log" 3
    echo
    
    echo -e "${PURPLE}Bot Logs (Docker):${NC}"
    if docker ps | grep -q "appointment-scheduler-bot"; then
        docker logs --tail 3 appointment-scheduler-bot 2>&1 | while IFS= read -r line; do
            if [[ "$line" == *"error"* ]] || [[ "$line" == *"Error"* ]]; then
                echo -e "${RED}$line${NC}"
            else
                echo "$line"
            fi
        done
    else
        echo "Bot container not running"
    fi
    
    echo -e "${CYAN}└───────────────────────────────────────────────────────────────────┘${NC}"
    echo
}

display_quick_actions() {
    echo -e "${CYAN}┌─ QUICK ACTIONS ───────────────────────────────────────────────────┐${NC}"
    echo "Press 'h' for health check  | Press 'r' to restart services"
    echo "Press 'l' for full logs     | Press 'b' to backup system"
    echo "Press 's' to stop           | Press 'q' to quit dashboard"
    echo -e "${CYAN}└───────────────────────────────────────────────────────────────────┘${NC}"
}

handle_input() {
    read -t 1 -n 1 key 2>/dev/null || return
    
    case "$key" in
        'h')
            echo "Running health check..."
            if [[ -f "$HEALTH_CHECK_SCRIPT" ]]; then
                node "$HEALTH_CHECK_SCRIPT"
            else
                echo "Health check script not found"
            fi
            read -p "Press any key to continue..." -n 1
            ;;
        'r')
            echo "Restarting services..."
            cd "$PROJECT_ROOT"
            docker-compose restart
            read -p "Services restarted. Press any key to continue..." -n 1
            ;;
        'l')
            echo "Displaying recent logs..."
            echo "=== API Logs ==="
            tail -20 "$PROJECT_ROOT/logs/combined.log" 2>/dev/null || echo "No API logs found"
            echo -e "\n=== Bot Logs ==="
            docker logs --tail 20 appointment-scheduler-bot 2>/dev/null || echo "No bot logs found"
            read -p "Press any key to continue..." -n 1
            ;;
        'b')
            echo "Starting backup..."
            "$PROJECT_ROOT/devops/backup/backup-script.sh" full
            read -p "Backup completed. Press any key to continue..." -n 1
            ;;
        's')
            echo "Stopping services..."
            cd "$PROJECT_ROOT"
            docker-compose stop
            read -p "Services stopped. Press any key to continue..." -n 1
            ;;
        'q')
            echo "Exiting dashboard..."
            exit 0
            ;;
    esac
}

# Main dashboard loop
main() {
    echo "Starting monitoring dashboard..."
    echo "Press Ctrl+C to exit"
    sleep 2
    
    while true; do
        print_header
        display_container_status
        display_service_health
        display_system_metrics
        display_recent_logs
        display_quick_actions
        
        echo -n "Auto-refresh in ${REFRESH_INTERVAL}s (or press a key for actions): "
        
        # Handle input with timeout
        handle_input
        
        sleep "$REFRESH_INTERVAL"
    done
}

# Cleanup on exit
trap 'echo -e "\n\nDashboard stopped."; exit 0' INT TERM

# Start dashboard
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi