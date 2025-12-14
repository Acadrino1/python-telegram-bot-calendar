#!/usr/bin/env node

/**
 * Auto-approve admin user (Ch1fu)
 * This ensures the bot owner has full access
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const ADMIN_ID = '7930798268'; // Ch1fu's Telegram ID
const DB_PATH = path.join(__dirname, '..', 'database', 'test_lodge_scheduler.sqlite3');
const ALT_DB_PATH = path.join(__dirname, '..', 'lodge-scheduler.db');

console.log('🔧 Auto-Approving Admin Access...');
console.log('================================\n');
console.log(`👤 Admin ID: ${ADMIN_ID} (Ch1fu)`);

// Try main database first
let dbPath = DB_PATH;
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  if (fs.existsSync(ALT_DB_PATH)) {
    dbPath = ALT_DB_PATH;
  } else {
    console.log('⚠️  No database found, creating new one...');
    dbPath = ALT_DB_PATH;
  }
}

console.log(`💾 Database: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Create users table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      email TEXT,
      status TEXT DEFAULT 'pending',
      is_admin BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Error creating table:', err);
    }
  });

  // Check if admin exists
  db.get('SELECT * FROM users WHERE telegram_id = ?', [ADMIN_ID], (err, row) => {
    if (err) {
      console.error('Error checking user:', err);
      return;
    }

    if (row) {
      // Update existing user
      db.run(`
        UPDATE users 
        SET status = 'approved', 
            is_admin = 1,
            username = 'Ch1fu',
            updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `, [ADMIN_ID], (err) => {
        if (err) {
          console.error('Error updating user:', err);
        } else {
          console.log('✅ Admin user updated:');
          console.log('   Status: approved');
          console.log('   Admin: true');
          console.log('   Username: Ch1fu');
        }
      });
    } else {
      // Insert new admin user
      db.run(`
        INSERT INTO users (telegram_id, username, first_name, status, is_admin)
        VALUES (?, ?, ?, ?, ?)
      `, [ADMIN_ID, 'Ch1fu', 'Admin', 'approved', 1], (err) => {
        if (err) {
          console.error('Error inserting user:', err);
        } else {
          console.log('✅ Admin user created:');
          console.log('   ID: ' + ADMIN_ID);
          console.log('   Username: Ch1fu');
          console.log('   Status: approved');
          console.log('   Admin: true');
        }
      });
    }

    // Also check if there's a separate admin table
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      db.run('INSERT OR REPLACE INTO admins (telegram_id, username) VALUES (?, ?)', 
        [ADMIN_ID, 'Ch1fu'], (err) => {
          if (!err) {
            console.log('✅ Added to admins table');
          }
      });
    });

    console.log('\n🎉 Admin permissions fixed!');
    console.log('You should now have full access without any approval prompts.');
    console.log('\n⚠️  If the bot is running, restart it for changes to take effect:');
    console.log('   1. Stop the current bot (Ctrl+C)');
    console.log('   2. Run: node src/bot/restored-simple-bot.js');
    console.log('      OR: node start-bot-simple.js');
    
    setTimeout(() => {
      db.close();
      process.exit(0);
    }, 1000);
  });
});