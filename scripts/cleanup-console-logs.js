#!/usr/bin/env node

/**
 * Professional Admin Panel Cleanup Script
 * Removes console.log statements and implements proper logging
 */

const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Setup professional logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'admin-panel' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/admin-error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/admin-combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

console.log('🧹 Starting Professional Admin Panel Cleanup...\n');

// Directories to clean
const dirsToClean = [
  'src/admin',
  'src/middleware/adminSecurity.js',
  'src/routes/admin.js',
  'src/controllers'
];

let totalConsoleLogsRemoved = 0;
let filesProcessed = 0;

function processFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Count console.log statements
  const consoleLogMatches = content.match(/console\.(log|debug|info|warn|error)/g);
  if (!consoleLogMatches) return;
  
  const logsInFile = consoleLogMatches.length;
  filesProcessed++;
  
  // Replace console.log with proper winston logging
  let cleanedContent = content
    // Replace console.log with logger.info
    .replace(/console\.log\(/g, 'logger.info(')
    // Replace console.error with logger.error
    .replace(/console\.error\(/g, 'logger.error(')
    // Replace console.warn with logger.warn
    .replace(/console\.warn\(/g, 'logger.warn(')
    // Replace console.debug with logger.debug
    .replace(/console\.debug\(/g, 'logger.debug(')
    // Replace console.info with logger.info
    .replace(/console\.info\(/g, 'logger.info(');
  
  // Add winston import if logger is used
  if (cleanedContent.includes('logger.')) {
    // Check if winston is already imported
    if (!cleanedContent.includes('winston') && !cleanedContent.includes('logger')) {
      // Add winston import at the top
      const lines = cleanedContent.split('\n');
      let insertIndex = 0;
      
      // Find the last require statement
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('require(') || lines[i].includes('import ')) {
          insertIndex = i + 1;
        }
        if (lines[i].includes('class ') || lines[i].includes('function ') || lines[i].includes('module.exports')) {
          break;
        }
      }
      
      lines.splice(insertIndex, 0, "const logger = require('../utils/logger');");
      cleanedContent = lines.join('\n');
    }
  }
  
  // Write cleaned content back
  fs.writeFileSync(filePath, cleanedContent, 'utf8');
  
  totalConsoleLogsRemoved += logsInFile;
  console.log(`✅ ${path.basename(filePath)}: Cleaned ${logsInFile} console statements`);
}

function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`⚠️  Directory not found: ${dirPath}`);
    return;
  }
  
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (item.endsWith('.js') || item.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

// Create logs directory
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
  console.log('📁 Created logs directory');
}

// Process each directory
for (const dir of dirsToClean) {
  console.log(`\n📂 Processing ${dir}...`);
  processDirectory(dir);
}

// Process individual important files
const importantFiles = [
  'src/middleware/adminSecurity.js',
  'src/routes/admin.js',
  'src/index.js'
];

for (const file of importantFiles) {
  if (fs.existsSync(file)) {
    console.log(`\n📄 Processing ${file}...`);
    processFile(file);
  }
}

console.log('\n' + '='.repeat(50));
console.log('🎉 CLEANUP COMPLETE!');
console.log('='.repeat(50));
console.log(`📊 Files processed: ${filesProcessed}`);
console.log(`🧹 Console statements cleaned: ${totalConsoleLogsRemoved}`);
console.log(`📝 Professional logging implemented with Winston`);
console.log(`📁 Log files will be created in: logs/`);
console.log(`🔧 Configure LOG_LEVEL environment variable for log levels`);

// Create professional logger utility
const loggerUtilContent = `/**
 * Professional logging utility for Lodge Scheduler Admin Panel
 */
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'lodge-scheduler-admin',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/admin-error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/admin-combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
});

// Add console logging for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ level, message, timestamp, service }) => {
        return \`[\${timestamp}] [\${service}] \${level}: \${message}\`;
      })
    )
  }));
}

// Add audit logging for admin actions
logger.auditLog = (action, admin, details = {}) => {
  logger.info('ADMIN_AUDIT', {
    action,
    admin: {
      id: admin.id,
      email: admin.email,
      ip: admin.ip
    },
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;
`;

// Create logger utility
fs.writeFileSync('src/utils/logger.js', loggerUtilContent);
console.log(`✅ Created professional logger utility: src/utils/logger.js`);

console.log('\n📋 NEXT STEPS:');
console.log('1. Install winston: npm install winston');
console.log('2. Set LOG_LEVEL environment variable (debug|info|warn|error)');
console.log('3. Review logs in the logs/ directory');
console.log('4. Restart admin panel to use new logging system');
console.log('\n💡 TIP: Set LOG_LEVEL=error in production for optimal performance');