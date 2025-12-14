#!/bin/bash

# Bot Monitor Script with Auto-Restart
# This script monitors the Telegram bot and automatically restarts it if it crashes

BOT_DIR="/home/ralph/Desktop/Telegram-Project-Files/Lodge Scheduler"
BOT_SCRIPT="src/bot/bot.js"
LOG_FILE="bot.log"
MONITOR_LOG="monitor.log"
PID_FILE="bot.pid"

cd "$BOT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to start the bot
start_bot() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Starting Telegram bot...${NC}" | tee -a "$MONITOR_LOG"
    
    # Start bot in background and capture PID
    nohup node "$BOT_SCRIPT" >> "$LOG_FILE" 2>&1 &
    BOT_PID=$!
    echo $BOT_PID > "$PID_FILE"
    
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Bot started with PID: $BOT_PID${NC}" | tee -a "$MONITOR_LOG"
}

# Function to check if bot is running
is_bot_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Function to stop the bot
stop_bot() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] Stopping bot with PID: $PID${NC}" | tee -a "$MONITOR_LOG"
        kill -SIGTERM $PID 2>/dev/null
        sleep 2
        
        # Force kill if still running
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] Force killing bot...${NC}" | tee -a "$MONITOR_LOG"
            kill -9 $PID 2>/dev/null
        fi
        
        rm -f "$PID_FILE"
    fi
}

# Function to monitor and restart bot
monitor_bot() {
    echo -e "${GREEN}=== Bot Monitor Started ===${NC}" | tee -a "$MONITOR_LOG"
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Monitoring Telegram bot...${NC}" | tee -a "$MONITOR_LOG"
    echo -e "${YELLOW}Press Ctrl+C to stop monitoring${NC}"
    
    # Start the bot initially
    start_bot
    
    # Monitor loop
    while true; do
        sleep 10  # Check every 10 seconds
        
        if ! is_bot_running; then
            echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] Bot is not running! Restarting...${NC}" | tee -a "$MONITOR_LOG"
            
            # Log the last few lines of bot log for debugging
            echo -e "${YELLOW}Last bot log entries:${NC}" | tee -a "$MONITOR_LOG"
            tail -10 "$LOG_FILE" | tee -a "$MONITOR_LOG"
            
            # Restart the bot
            start_bot
            
            # Wait a bit before checking again
            sleep 5
        fi
    done
}

# Handle script termination
cleanup() {
    echo -e "\n${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] Monitor stopping...${NC}" | tee -a "$MONITOR_LOG"
    stop_bot
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] Monitor stopped${NC}" | tee -a "$MONITOR_LOG"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main script
case "${1:-monitor}" in
    start)
        if is_bot_running; then
            echo -e "${YELLOW}Bot is already running${NC}"
        else
            start_bot
        fi
        ;;
    stop)
        stop_bot
        ;;
    restart)
        stop_bot
        sleep 2
        start_bot
        ;;
    status)
        if is_bot_running; then
            PID=$(cat "$PID_FILE")
            echo -e "${GREEN}Bot is running with PID: $PID${NC}"
        else
            echo -e "${RED}Bot is not running${NC}"
        fi
        ;;
    monitor)
        monitor_bot
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|monitor}"
        echo "  start   - Start the bot"
        echo "  stop    - Stop the bot"
        echo "  restart - Restart the bot"
        echo "  status  - Check bot status"
        echo "  monitor - Monitor and auto-restart bot (default)"
        exit 1
        ;;
esac