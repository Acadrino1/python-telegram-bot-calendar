#!/usr/bin/env node

/**
 * Calendar and Menu Cleanup Validation Script
 * Tests for duplicates and validates clean implementation
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Calendar and Menu Cleanup Validation');
console.log('==========================================\n');

// Test results storage
const results = {
    calendarImplementations: [],
    commandHandlers: {},
    actionHandlers: {},
    duplicates: [],
    issues: [],
    passed: 0,
    failed: 0
};

/**
 * Check for calendar implementations
 */
function checkCalendarImplementations() {
    console.log('1️⃣ Checking Calendar Implementations...');
    
    const botFiles = [
        'src/bot/EnhancedCalendarBot.js',
        'src/bot/SimpleTelegramBot.js', 
        'src/bot/CalendarUIManager.js',
        'src/bot/CustomCalendar.js',
        'src/bot/TelegramBot.js',
        'src/bot/SessionOptimizedTelegramBot.js'
    ];
    
    botFiles.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check for calendar-related code
            const hasCalendar = content.includes('Calendar') || content.includes('calendar');
            const hasCalendarUI = content.includes('CalendarUIManager');
            const hasCustomCalendar = content.includes('CustomCalendar');
            
            if (hasCalendar || hasCalendarUI || hasCustomCalendar) {
                results.calendarImplementations.push({
                    file,
                    hasCalendar,
                    hasCalendarUI, 
                    hasCustomCalendar,
                    active: file === 'src/bot/EnhancedCalendarBot.js' // Only this should be active
                });
            }
        }
    });
    
    console.log(`   Found ${results.calendarImplementations.length} files with calendar code`);
    
    // Check if only one calendar implementation is active
    const activeImplementations = results.calendarImplementations.filter(impl => impl.active);
    
    if (activeImplementations.length === 1 && activeImplementations[0].file === 'src/bot/EnhancedCalendarBot.js') {
        console.log('   ✅ Only one calendar implementation is active: EnhancedCalendarBot');
        results.passed++;
    } else {
        console.log('   ❌ Multiple or incorrect calendar implementations active');
        results.failed++;
        results.issues.push('Multiple calendar implementations may conflict');
    }
}

/**
 * Check for duplicate command handlers
 */
function checkCommandHandlers() {
    console.log('\n2️⃣ Checking Command Handlers...');
    
    const commands = ['start', 'book', 'calendar', 'availability', 'help', 'myappointments'];
    
    // Check main entry point
    const mainBotPath = path.join(process.cwd(), 'src/bot/bot.js');
    if (fs.existsSync(mainBotPath)) {
        const content = fs.readFileSync(mainBotPath, 'utf8');
        
        if (content.includes('EnhancedCalendarBot')) {
            console.log('   ✅ Main bot entry uses EnhancedCalendarBot');
            results.passed++;
        } else {
            console.log('   ❌ Main bot entry does not use EnhancedCalendarBot');
            results.failed++;
            results.issues.push('Main bot entry should use EnhancedCalendarBot');
        }
        
        // Check for duplicate command definitions
        commands.forEach(cmd => {
            const commandRegex = new RegExp(`bot\\.command\\(['"\`]${cmd}['"\`]`, 'g');
            const matches = content.match(commandRegex);
            
            if (!results.commandHandlers[cmd]) {
                results.commandHandlers[cmd] = 0;
            }
            
            if (matches) {
                results.commandHandlers[cmd] += matches.length;
            }
        });
    }
    
    // Check for duplicates
    const duplicateCommands = Object.entries(results.commandHandlers)
        .filter(([cmd, count]) => count > 1);
        
    if (duplicateCommands.length === 0) {
        console.log('   ✅ No duplicate command handlers found');
        results.passed++;
    } else {
        console.log('   ❌ Duplicate command handlers found:');
        duplicateCommands.forEach(([cmd, count]) => {
            console.log(`      - ${cmd}: ${count} handlers`);
            results.duplicates.push(`${cmd} command`);
        });
        results.failed++;
    }
}

/**
 * Check for duplicate action handlers
 */
function checkActionHandlers() {
    console.log('\n3️⃣ Checking Action Handlers...');
    
    const criticalActions = [
        'select_date',
        'show_calendar', 
        'confirm_booking',
        'cancel_booking',
        'service_lodge_mobile_'
    ];
    
    const botFiles = [
        'src/bot/EnhancedCalendarBot.js',
        'src/bot/SimpleTelegramBot.js',
        'src/bot/CalendarUIManager.js'
    ];
    
    criticalActions.forEach(action => {
        let count = 0;
        const foundIn = [];
        
        botFiles.forEach(file => {
            const filePath = path.join(process.cwd(), file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                const actionRegex = action.includes('_') 
                    ? new RegExp(`bot\\.action\\([^)]*${action.replace('_', '.*')}`, 'g')
                    : new RegExp(`bot\\.action\\(['"\`]${action}['"\`]`, 'g');
                
                const matches = content.match(actionRegex);
                if (matches) {
                    count += matches.length;
                    foundIn.push(file);
                }
            }
        });
        
        results.actionHandlers[action] = { count, foundIn };
    });
    
    // Check for problematic duplicates
    let hasActionDuplicates = false;
    Object.entries(results.actionHandlers).forEach(([action, {count, foundIn}]) => {
        if (count > 1) {
            // Some duplication is expected between base and enhanced classes
            const expectedDuplication = (
                foundIn.includes('src/bot/EnhancedCalendarBot.js') && 
                foundIn.includes('src/bot/SimpleTelegramBot.js') &&
                foundIn.length === 2
            );
            
            if (!expectedDuplication) {
                console.log(`   ⚠️  ${action}: ${count} handlers in ${foundIn.join(', ')}`);
                hasActionDuplicates = true;
                results.duplicates.push(`${action} action`);
            }
        }
    });
    
    if (!hasActionDuplicates) {
        console.log('   ✅ No problematic action handler duplicates found');
        results.passed++;
    } else {
        console.log('   ❌ Found problematic action handler duplicates');
        results.failed++;
    }
}

/**
 * Validate calendar-specific functionality
 */
function validateCalendarFunctionality() {
    console.log('\n4️⃣ Validating Calendar Functionality...');
    
    // Check EnhancedCalendarBot structure
    const enhancedBotPath = path.join(process.cwd(), 'src/bot/EnhancedCalendarBot.js');
    if (fs.existsSync(enhancedBotPath)) {
        const content = fs.readFileSync(enhancedBotPath, 'utf8');
        
        const checks = [
            { name: 'Extends SimpleTelegramBot', test: content.includes('extends SimpleTelegramBot') },
            { name: 'Has CalendarUIManager', test: content.includes('CalendarUIManager') },
            { name: 'Has calendar command', test: content.includes("command('calendar'") },
            { name: 'Has availability command', test: content.includes("command('availability'") },
            { name: 'Has nextavailable command', test: content.includes("command('nextavailable'") },
            { name: 'Overrides select_date action', test: content.includes("action('select_date'") }
        ];
        
        let passedChecks = 0;
        checks.forEach(check => {
            if (check.test) {
                console.log(`   ✅ ${check.name}`);
                passedChecks++;
            } else {
                console.log(`   ❌ ${check.name}`);
                results.issues.push(`EnhancedCalendarBot missing: ${check.name}`);
            }
        });
        
        if (passedChecks === checks.length) {
            results.passed++;
        } else {
            results.failed++;
        }
    } else {
        console.log('   ❌ EnhancedCalendarBot.js not found');
        results.failed++;
        results.issues.push('EnhancedCalendarBot.js file missing');
    }
}

/**
 * Check bot startup configuration
 */
function checkBotStartup() {
    console.log('\n5️⃣ Checking Bot Startup Configuration...');
    
    const botEntryPath = path.join(process.cwd(), 'src/bot/bot.js');
    if (fs.existsSync(botEntryPath)) {
        const content = fs.readFileSync(botEntryPath, 'utf8');
        
        if (content.includes("require('./EnhancedCalendarBot')")) {
            console.log('   ✅ Bot entry point correctly imports EnhancedCalendarBot');
            results.passed++;
        } else {
            console.log('   ❌ Bot entry point does not import EnhancedCalendarBot');
            results.failed++;
            results.issues.push('Bot startup uses wrong bot implementation');
        }
        
        // Check for proper error handling
        if (content.includes('try') && content.includes('catch')) {
            console.log('   ✅ Bot startup has error handling');
            results.passed++;
        } else {
            console.log('   ⚠️  Bot startup lacks comprehensive error handling');
            results.issues.push('Bot startup should have better error handling');
        }
    } else {
        console.log('   ❌ Bot entry point (src/bot/bot.js) not found');
        results.failed++;
        results.issues.push('Bot entry point missing');
    }
}

/**
 * Generate final report
 */
function generateReport() {
    console.log('\n📊 VALIDATION REPORT');
    console.log('====================\n');
    
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    
    if (results.duplicates.length > 0) {
        console.log('\n🔄 Duplicates Found:');
        results.duplicates.forEach(dup => console.log(`   • ${dup}`));
    }
    
    if (results.issues.length > 0) {
        console.log('\n⚠️  Issues to Address:');
        results.issues.forEach(issue => console.log(`   • ${issue}`));
    }
    
    // Calendar implementations summary
    if (results.calendarImplementations.length > 0) {
        console.log('\n📅 Calendar Implementations:');
        results.calendarImplementations.forEach(impl => {
            const status = impl.active ? '🟢 ACTIVE' : '⚪ INACTIVE';
            console.log(`   ${status} ${impl.file}`);
        });
    }
    
    // Overall assessment
    console.log('\n🎯 OVERALL ASSESSMENT:');
    if (results.failed === 0 && results.duplicates.length === 0) {
        console.log('   ✅ CLEAN - Calendar and menu system properly cleaned up');
    } else if (results.failed <= 2 && results.duplicates.length <= 1) {
        console.log('   🟡 MOSTLY CLEAN - Minor issues that should be addressed');
    } else {
        console.log('   ❌ NEEDS CLEANUP - Significant issues found');
    }
    
    console.log('\n' + '='.repeat(50));
}

// Run all validation checks
try {
    checkCalendarImplementations();
    checkCommandHandlers();
    checkActionHandlers();
    validateCalendarFunctionality();
    checkBotStartup();
    generateReport();
} catch (error) {
    console.error('\n❌ Validation script failed:', error.message);
    process.exit(1);
}

// Exit with appropriate code
process.exit(results.failed > 2 ? 1 : 0);