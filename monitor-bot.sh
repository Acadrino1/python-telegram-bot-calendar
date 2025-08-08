#!/bin/bash

# Lodge Mobile Activations Bot Monitor Script
# This script checks if the bot is running and restarts it if needed

BOT_PROCESS="node src/bot/bot.js"
LOG_FILE="bot.log"

# Function to check if bot is running
check_bot() {
    if pgrep -f "$BOT_PROCESS" > /dev/null; then
        return 0  # Bot is running
    else
        return 1  # Bot is not running
    fi
}

# Function to start the bot
start_bot() {
    echo "$(date): Starting Lodge Mobile Activations Bot..."
    nohup npm run start:bot > $LOG_FILE 2>&1 &
    sleep 3
    
    if check_bot; then
        echo "$(date): ✅ Bot started successfully"
        return 0
    else
        echo "$(date): ❌ Failed to start bot"
        return 1
    fi
}

# Function to stop the bot
stop_bot() {
    echo "$(date): Stopping bot..."
    pkill -f "$BOT_PROCESS"
    sleep 2
}

# Main monitoring logic
case "${1:-status}" in
    start)
        if check_bot; then
            echo "Bot is already running"
        else
            start_bot
        fi
        ;;
    
    stop)
        stop_bot
        echo "Bot stopped"
        ;;
    
    restart)
        stop_bot
        start_bot
        ;;
    
    status)
        if check_bot; then
            echo "✅ Bot is RUNNING"
            PID=$(pgrep -f "$BOT_PROCESS")
            echo "Process ID: $PID"
            echo "Log file: $LOG_FILE"
            echo ""
            echo "Recent logs:"
            tail -n 5 $LOG_FILE
        else
            echo "❌ Bot is NOT running"
            echo "Use '$0 start' to start the bot"
        fi
        ;;
    
    monitor)
        echo "Starting continuous monitoring..."
        echo "Press Ctrl+C to stop"
        
        while true; do
            if ! check_bot; then
                echo "$(date): Bot crashed! Restarting..."
                start_bot
            fi
            sleep 30  # Check every 30 seconds
        done
        ;;
    
    logs)
        tail -f $LOG_FILE
        ;;
    
    *)
        echo "Usage: $0 {start|stop|restart|status|monitor|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the bot if not running"
        echo "  stop    - Stop the bot"
        echo "  restart - Restart the bot"
        echo "  status  - Check if bot is running"
        echo "  monitor - Continuously monitor and restart if crashed"
        echo "  logs    - Show live logs"
        exit 1
        ;;
esac