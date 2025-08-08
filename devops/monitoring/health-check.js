#!/usr/bin/env node

/**
 * Comprehensive Health Check for Telegram Appointment Scheduler
 * Monitors all system components and provides detailed status
 */

const http = require('http');
const mysql = require('mysql2/promise');
const redis = require('redis');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
    api: {
        host: process.env.API_HOST || 'localhost',
        port: process.env.API_PORT || 3000,
        timeout: 5000
    },
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'appuser',
        password: process.env.DB_PASSWORD || 'apppassword123',
        database: process.env.DB_NAME || 'appointment_scheduler'
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        timeout: 3000
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN
    },
    thresholds: {
        diskUsage: 85, // Alert if disk usage > 85%
        memoryUsage: 85, // Alert if memory usage > 85%
        responseTime: 2000, // Alert if API response > 2s
        logFileSize: 100 * 1024 * 1024 // 100MB
    }
};

class HealthChecker {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            overall: 'UNKNOWN',
            components: {},
            metrics: {},
            alerts: []
        };
    }

    async checkAPI() {
        console.log('🔍 Checking API health...');
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const req = http.request({
                hostname: config.api.host,
                port: config.api.port,
                path: '/health',
                method: 'GET',
                timeout: config.api.timeout
            }, (res) => {
                const responseTime = Date.now() - startTime;
                let data = '';
                
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    const status = res.statusCode === 200 ? 'HEALTHY' : 'UNHEALTHY';
                    
                    this.results.components.api = {
                        status,
                        responseTime,
                        statusCode: res.statusCode,
                        message: data.slice(0, 200)
                    };
                    
                    if (responseTime > config.thresholds.responseTime) {
                        this.results.alerts.push(`API response time high: ${responseTime}ms`);
                    }
                    
                    resolve();
                });
            });
            
            req.on('error', (err) => {
                this.results.components.api = {
                    status: 'ERROR',
                    error: err.message
                };
                this.results.alerts.push(`API unreachable: ${err.message}`);
                resolve();
            });
            
            req.on('timeout', () => {
                this.results.components.api = {
                    status: 'TIMEOUT',
                    error: 'Request timeout'
                };
                this.results.alerts.push('API request timeout');
                resolve();
            });
            
            req.end();
        });
    }

    async checkDatabase() {
        console.log('🔍 Checking database health...');
        
        try {
            const connection = await mysql.createConnection(config.database);
            const startTime = Date.now();
            
            // Basic connection test
            await connection.ping();
            const pingTime = Date.now() - startTime;
            
            // Check table count
            const [rows] = await connection.execute(
                "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ?",
                [config.database.database]
            );
            const tableCount = rows[0].table_count;
            
            // Check recent appointments
            try {
                const [appointments] = await connection.execute(
                    "SELECT COUNT(*) as recent_appointments FROM appointments WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)"
                );
                var recentAppointments = appointments[0].recent_appointments;
            } catch (err) {
                var recentAppointments = 'N/A';
            }
            
            await connection.end();
            
            this.results.components.database = {
                status: 'HEALTHY',
                pingTime,
                tableCount,
                recentAppointments
            };
            
            if (pingTime > 1000) {
                this.results.alerts.push(`Database ping time high: ${pingTime}ms`);
            }
            
        } catch (error) {
            this.results.components.database = {
                status: 'ERROR',
                error: error.message
            };
            this.results.alerts.push(`Database error: ${error.message}`);
        }
    }

    async checkRedis() {
        console.log('🔍 Checking Redis health...');
        
        try {
            const client = redis.createClient({
                host: config.redis.host,
                port: config.redis.port
            });
            
            await client.connect();
            const startTime = Date.now();
            
            await client.ping();
            const pingTime = Date.now() - startTime;
            
            const info = await client.info();
            const memoryUsage = info.match(/used_memory:(\d+)/)?.[1];
            
            await client.disconnect();
            
            this.results.components.redis = {
                status: 'HEALTHY',
                pingTime,
                memoryUsage: memoryUsage ? `${Math.round(memoryUsage / 1024 / 1024)}MB` : 'Unknown'
            };
            
        } catch (error) {
            this.results.components.redis = {
                status: error.message.includes('ECONNREFUSED') ? 'UNAVAILABLE' : 'ERROR',
                error: error.message
            };
            
            if (error.message.includes('ECONNREFUSED')) {
                // Redis is optional, so don't create alert for unavailable
            } else {
                this.results.alerts.push(`Redis error: ${error.message}`);
            }
        }
    }

    async checkTelegramBot() {
        console.log('🔍 Checking Telegram bot health...');
        
        if (!config.telegram.botToken) {
            this.results.components.telegramBot = {
                status: 'UNCONFIGURED',
                message: 'Bot token not configured'
            };
            return;
        }
        
        try {
            // Check if bot process is running
            let botProcessRunning = false;
            try {
                execSync('docker ps | grep appointment-scheduler-bot', { stdio: 'pipe' });
                botProcessRunning = true;
            } catch (err) {
                // Process not running in Docker
            }
            
            // Check bot API
            const https = require('https');
            const botApiUrl = `https://api.telegram.org/bot${config.telegram.botToken}/getMe`;
            
            const botInfo = await new Promise((resolve, reject) => {
                https.get(botApiUrl, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            resolve(parsed);
                        } catch (err) {
                            reject(err);
                        }
                    });
                }).on('error', reject);
            });
            
            this.results.components.telegramBot = {
                status: botInfo.ok ? 'HEALTHY' : 'ERROR',
                processRunning: botProcessRunning,
                botInfo: botInfo.result ? {
                    username: botInfo.result.username,
                    firstName: botInfo.result.first_name
                } : null
            };
            
            if (!botProcessRunning) {
                this.results.alerts.push('Telegram bot process not running in Docker');
            }
            
        } catch (error) {
            this.results.components.telegramBot = {
                status: 'ERROR',
                error: error.message
            };
            this.results.alerts.push(`Telegram bot error: ${error.message}`);
        }
    }

    async checkSystemMetrics() {
        console.log('🔍 Checking system metrics...');
        
        try {
            // Disk usage
            const diskUsage = execSync("df / | tail -1 | awk '{print $5}' | sed 's/%//'", { encoding: 'utf8' }).trim();
            
            // Memory usage
            const memInfo = execSync('cat /proc/meminfo', { encoding: 'utf8' });
            const totalMem = memInfo.match(/MemTotal:\s+(\d+)/)?.[1];
            const availMem = memInfo.match(/MemAvailable:\s+(\d+)/)?.[1];
            const memoryUsage = totalMem && availMem ? 
                Math.round((1 - availMem / totalMem) * 100) : null;
            
            // Load average
            const loadAvg = execSync('uptime | grep -oE "load average[s]*: [0-9]+(.[0-9]+)?, [0-9]+(.[0-9]+)?, [0-9]+(.[0-9]+)?" | sed "s/load average[s]*: //"', 
                { encoding: 'utf8' }).trim();
            
            this.results.metrics = {
                diskUsage: `${diskUsage}%`,
                memoryUsage: memoryUsage ? `${memoryUsage}%` : 'Unknown',
                loadAverage: loadAvg
            };
            
            // Check thresholds
            if (parseInt(diskUsage) > config.thresholds.diskUsage) {
                this.results.alerts.push(`High disk usage: ${diskUsage}%`);
            }
            
            if (memoryUsage && memoryUsage > config.thresholds.memoryUsage) {
                this.results.alerts.push(`High memory usage: ${memoryUsage}%`);
            }
            
        } catch (error) {
            this.results.metrics = {
                error: error.message
            };
        }
    }

    async checkLogFiles() {
        console.log('🔍 Checking log files...');
        
        try {
            const logsDir = path.join(__dirname, '../../logs');
            const logFiles = ['error.log', 'combined.log', 'bot.log'];
            
            const logStatus = {};
            
            for (const logFile of logFiles) {
                const filePath = path.join(logsDir, logFile);
                
                try {
                    const stats = await fs.stat(filePath);
                    const sizeBytes = stats.size;
                    const sizeMB = Math.round(sizeBytes / 1024 / 1024 * 100) / 100;
                    
                    logStatus[logFile] = {
                        exists: true,
                        size: `${sizeMB}MB`,
                        lastModified: stats.mtime.toISOString()
                    };
                    
                    if (sizeBytes > config.thresholds.logFileSize) {
                        this.results.alerts.push(`Large log file: ${logFile} (${sizeMB}MB)`);
                    }
                    
                } catch (err) {
                    logStatus[logFile] = {
                        exists: false,
                        error: err.code
                    };
                }
            }
            
            this.results.components.logs = {
                status: 'CHECKED',
                files: logStatus
            };
            
        } catch (error) {
            this.results.components.logs = {
                status: 'ERROR',
                error: error.message
            };
        }
    }

    async checkDockerContainers() {
        console.log('🔍 Checking Docker containers...');
        
        try {
            const containers = execSync('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', { encoding: 'utf8' });
            const containerLines = containers.split('\n').slice(1).filter(line => line.trim());
            
            const containerStatus = {};
            let healthyContainers = 0;
            
            for (const line of containerLines) {
                const [name, status, ports] = line.split('\t').map(s => s.trim());
                if (name && name.includes('appointment-scheduler')) {
                    containerStatus[name] = {
                        status: status.includes('Up') ? 'RUNNING' : 'STOPPED',
                        details: status,
                        ports: ports || 'None'
                    };
                    
                    if (status.includes('Up')) healthyContainers++;
                }
            }
            
            this.results.components.docker = {
                status: healthyContainers > 0 ? 'HEALTHY' : 'UNHEALTHY',
                containers: containerStatus,
                healthyCount: healthyContainers
            };
            
        } catch (error) {
            this.results.components.docker = {
                status: 'ERROR',
                error: error.message
            };
            this.results.alerts.push(`Docker check failed: ${error.message}`);
        }
    }

    calculateOverallStatus() {
        const criticalComponents = ['api', 'database', 'telegramBot'];
        const componentStatuses = Object.values(this.results.components)
            .map(comp => comp.status);
        
        const hasCriticalError = criticalComponents.some(comp => 
            this.results.components[comp]?.status === 'ERROR'
        );
        
        if (hasCriticalError) {
            this.results.overall = 'UNHEALTHY';
        } else if (componentStatuses.includes('ERROR')) {
            this.results.overall = 'DEGRADED';
        } else if (componentStatuses.includes('UNHEALTHY')) {
            this.results.overall = 'DEGRADED';
        } else {
            this.results.overall = 'HEALTHY';
        }
    }

    async run() {
        console.log('🏥 Starting comprehensive health check...\n');
        
        await Promise.all([
            this.checkAPI(),
            this.checkDatabase(),
            this.checkRedis(),
            this.checkTelegramBot(),
            this.checkSystemMetrics(),
            this.checkLogFiles(),
            this.checkDockerContainers()
        ]);
        
        this.calculateOverallStatus();
        
        return this.results;
    }

    displayResults() {
        const status = this.results.overall;
        const emoji = {
            'HEALTHY': '✅',
            'DEGRADED': '⚠️',
            'UNHEALTHY': '❌',
            'UNKNOWN': '❓'
        };
        
        console.log('\n' + '='.repeat(60));
        console.log(`${emoji[status]} Overall Status: ${status}`);
        console.log('='.repeat(60));
        
        // Component status
        console.log('\n📊 Component Status:');
        for (const [component, details] of Object.entries(this.results.components)) {
            const componentEmoji = {
                'HEALTHY': '✅',
                'RUNNING': '✅',
                'CHECKED': '✅',
                'UNHEALTHY': '❌',
                'ERROR': '❌',
                'TIMEOUT': '⏰',
                'UNAVAILABLE': '⭕',
                'UNCONFIGURED': '⚙️',
                'STOPPED': '🛑'
            };
            
            console.log(`  ${componentEmoji[details.status] || '❓'} ${component}: ${details.status}`);
            
            if (details.error) {
                console.log(`     Error: ${details.error}`);
            }
            if (details.responseTime) {
                console.log(`     Response time: ${details.responseTime}ms`);
            }
            if (details.pingTime) {
                console.log(`     Ping time: ${details.pingTime}ms`);
            }
        }
        
        // System metrics
        if (Object.keys(this.results.metrics).length > 0) {
            console.log('\n📈 System Metrics:');
            for (const [metric, value] of Object.entries(this.results.metrics)) {
                if (metric !== 'error') {
                    console.log(`  ${metric}: ${value}`);
                }
            }
        }
        
        // Alerts
        if (this.results.alerts.length > 0) {
            console.log('\n🚨 Alerts:');
            this.results.alerts.forEach(alert => {
                console.log(`  - ${alert}`);
            });
        }
        
        console.log(`\n🕐 Check completed at: ${this.results.timestamp}`);
        console.log('='.repeat(60) + '\n');
    }
}

// Main execution
async function main() {
    const checker = new HealthChecker();
    
    try {
        const results = await checker.run();
        checker.displayResults();
        
        // Write results to file for external monitoring
        const outputFile = path.join(__dirname, '../logs/health-check.json');
        await fs.mkdir(path.dirname(outputFile), { recursive: true });
        await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
        
        // Exit with appropriate code
        const exitCode = results.overall === 'HEALTHY' ? 0 : 1;
        process.exit(exitCode);
        
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        process.exit(2);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = HealthChecker;