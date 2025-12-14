/**
 * Dependency Scanner
 * 
 * Scans for broken imports and missing dependencies
 */

const fs = require('fs');
const path = require('path');

class DependencyScanner {
  constructor() {
    this.issues = {
      brokenImports: [],
      missingFiles: [],
      adminReferences: [],
      unusedDependencies: []
    };
  }

  async scanProject() {
    console.log('🔍 Scanning project for dependency issues...\n');

    try {
      await this.scanForBrokenImports();
      await this.scanForAdminReferences();
      await this.scanForMissingFiles();
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Scan failed:', error.message);
    }
  }

  async scanForBrokenImports() {
    console.log('🔗 Scanning for broken imports...');
    
    const srcDir = path.join(process.cwd(), 'src');
    if (!fs.existsSync(srcDir)) {
      console.log('⚠️  src directory not found');
      return;
    }

    this.scanDirectory(srcDir);
    console.log(`Found ${this.issues.brokenImports.length} potential import issues\n`);
  }

  scanDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        this.scanDirectory(fullPath);
      } else if (item.endsWith('.js')) {
        this.scanFile(fullPath);
      }
    }
  }

  scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Find all require statements
      const requireMatches = content.match(/require\(['"][^'"]+['"]\)/g) || [];
      
      for (const requireStatement of requireMatches) {
        const match = requireStatement.match(/require\(['"]([^'"]+)['"]\)/);
        if (match) {
          const importPath = match[1];
          
          // Skip node_modules dependencies
          if (!importPath.startsWith('./') && !importPath.startsWith('../') && !importPath.startsWith('/')) {
            continue;
          }
          
          // Resolve the import path
          const resolvedPath = this.resolveImportPath(filePath, importPath);
          
          if (!fs.existsSync(resolvedPath)) {
            this.issues.brokenImports.push({
              file: relativePath,
              import: importPath,
              resolvedPath: resolvedPath,
              line: this.findLineNumber(content, requireStatement)
            });
          }
        }
      }
    } catch (error) {
      console.log(`⚠️  Could not scan ${filePath}: ${error.message}`);
    }
  }

  resolveImportPath(fromFile, importPath) {
    const fromDir = path.dirname(fromFile);
    let resolved = path.resolve(fromDir, importPath);
    
    // Try with .js extension if no extension
    if (!path.extname(resolved)) {
      resolved += '.js';
    }
    
    return resolved;
  }

  findLineNumber(content, searchText) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchText)) {
        return i + 1;
      }
    }
    return '?';
  }

  async scanForAdminReferences() {
    console.log('🔍 Scanning for admin/support references...');
    
    const srcDir = path.join(process.cwd(), 'src');
    if (fs.existsSync(srcDir)) {
      this.scanForAdminInDirectory(srcDir);
    }
    
    // Also check main files
    const mainFiles = ['src/index.js', 'package.json'];
    for (const file of mainFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        this.scanForAdminInFile(filePath);
      }
    }
    
    console.log(`Found ${this.issues.adminReferences.length} admin/support references\n`);
  }

  scanForAdminInDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        this.scanForAdminInDirectory(fullPath);
      } else if (item.endsWith('.js') || item.endsWith('.json')) {
        this.scanForAdminInFile(fullPath);
      }
    }
  }

  scanForAdminInFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      
      const adminPatterns = [
        /admin(?!js)/gi,
        /support(?!ed|ing|s\s)/gi,
        /broadcast/gi,
        /AdminController/gi,
        /BroadcastService/gi,
        /SupportService/gi
      ];

      for (const pattern of adminPatterns) {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          // Find line numbers
          const lines = content.split('\n');
          const matchLines = [];
          
          lines.forEach((line, index) => {
            if (pattern.test(line)) {
              matchLines.push(index + 1);
            }
          });

          this.issues.adminReferences.push({
            file: relativePath,
            pattern: pattern.source,
            matches: matches.length,
            lines: matchLines.slice(0, 5) // Limit to first 5 matches
          });
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  async scanForMissingFiles() {
    console.log('📁 Checking for missing core files...');
    
    const coreFiles = [
      'src/index.js',
      'src/bot/bot.js',
      'src/models/User.js',
      'src/models/Appointment.js',
      'package.json',
      '.env.example'
    ];

    for (const file of coreFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        this.issues.missingFiles.push(file);
      }
    }
    
    console.log(`Found ${this.issues.missingFiles.length} missing core files\n`);
  }

  generateReport() {
    console.log('📋 DEPENDENCY SCAN REPORT');
    console.log('========================');
    
    // Broken imports
    if (this.issues.brokenImports.length > 0) {
      console.log('\n❌ BROKEN IMPORTS:');
      this.issues.brokenImports.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.file}:${issue.line}`);
        console.log(`   Import: ${issue.import}`);
        console.log(`   Missing: ${issue.resolvedPath}`);
      });
    } else {
      console.log('\n✅ No broken imports found');
    }

    // Admin references
    if (this.issues.adminReferences.length > 0) {
      console.log('\n⚠️  ADMIN/SUPPORT REFERENCES:');
      this.issues.adminReferences.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.file}`);
        console.log(`   Pattern: /${issue.pattern}/gi`);
        console.log(`   Matches: ${issue.matches} (lines: ${issue.lines.join(', ')})`);
      });
    } else {
      console.log('\n✅ No admin/support references found');
    }

    // Missing files
    if (this.issues.missingFiles.length > 0) {
      console.log('\n❌ MISSING CORE FILES:');
      this.issues.missingFiles.forEach((file, index) => {
        console.log(`${index + 1}. ${file}`);
      });
    } else {
      console.log('\n✅ All core files present');
    }

    const totalIssues = this.issues.brokenImports.length + 
                       this.issues.adminReferences.length + 
                       this.issues.missingFiles.length;

    console.log(`\n${totalIssues === 0 ? '🎉' : '⚠️ '} TOTAL ISSUES: ${totalIssues}`);
    console.log('========================\n');
  }
}

// Run scanner if called directly
if (require.main === module) {
  const scanner = new DependencyScanner();
  scanner.scanProject();
}

module.exports = DependencyScanner;