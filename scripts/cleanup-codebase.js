#!/usr/bin/env node

/**
 * Cleanup script to remove commented code, TODOs, and dead code
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🧹 Starting codebase cleanup...\n');

// Patterns to remove
const patternsToRemove = [
  /^\s*\/\/\s*TODO:.*$/gm,
  /^\s*\/\/\s*FIXME:.*$/gm,
  /^\s*\/\/\s*HACK:.*$/gm,
  /^\s*\/\/\s*BUG:.*$/gm,
  /^\s*\/\/\s*console\.log.*$/gm,
  /^\s*\/\*[\s\S]*?\*\/\s*$/gm, // Multi-line comments that are code
];

// Files to clean
const filesToClean = glob.sync('src/**/*.js', {
  cwd: path.join(__dirname, '..'),
  absolute: true
});

let totalCleaned = 0;
let filesModified = 0;

filesToClean.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalLength = content.length;
  
  // Remove patterns
  patternsToRemove.forEach(pattern => {
    content = content.replace(pattern, '');
  });
  
  // Remove multiple empty lines
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  if (content.length !== originalLength) {
    fs.writeFileSync(file, content);
    filesModified++;
    totalCleaned += (originalLength - content.length);
    console.log(`✅ Cleaned: ${path.basename(file)} (${originalLength - content.length} bytes removed)`);
  }
});

console.log(`\n🎉 Cleanup complete!`);
console.log(`📊 Files modified: ${filesModified}`);
console.log(`💾 Total bytes removed: ${totalCleaned}`);
console.log(`✨ Your codebase is now cleaner!`);