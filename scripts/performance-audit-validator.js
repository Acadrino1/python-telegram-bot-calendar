#!/usr/bin/env node
/**
 * Performance Audit Validator
 * Validates current system performance against Global Rules 13-15
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceAuditor {
  constructor() {
    this.results = {
      rule13: { passed: false, issues: [], score: 0 },
      rule14: { passed: false, issues: [], score: 0 },
      rule15: { passed: false, issues: [], score: 0 },
      overall: { passed: false, score: 0 }
    };
  }

  async runAudit() {
    console.log('🔍 Starting Performance Audit...\n');

    // Rule 13: Database Operations
    await this.auditDatabaseOperations();
    
    // Rule 14: Memory Management
    await this.auditMemoryManagement();
    
    // Rule 15: Async Operations
    await this.auditAsyncOperations();

    // Generate overall score
    this.calculateOverallScore();

    // Output results
    this.displayResults();
    
    return this.results;
  }

  async auditDatabaseOperations() {
    console.log('📊 Auditing Database Operations (Rule 13)...');
    
    const issues = [];
    let score = 100;

    // Check for N+1 query patterns
    const n1QueryPatterns = await this.findN1Queries();
    if (n1QueryPatterns.length > 0) {
      issues.push(`Found ${n1QueryPatterns.length} potential N+1 query patterns`);
      score -= 30;
    }

    // Check for missing indexes
    const indexCoverage = await this.checkIndexCoverage();
    if (indexCoverage.coverage < 80) {
      issues.push(`Index coverage is ${indexCoverage.coverage}% (should be >80%)`);
      score -= 20;
    }

    // Check pagination implementation
    const paginationIssues = await this.checkPagination();
    if (paginationIssues.length > 0) {
      issues.push(...paginationIssues);
      score -= 15;
    }

    // Check transaction usage
    const transactionIssues = await this.checkTransactionUsage();
    if (transactionIssues.length > 0) {
      issues.push(...transactionIssues);
      score -= 25;
    }

    this.results.rule13 = {
      passed: score >= 70,
      issues,
      score: Math.max(0, score)
    };

    console.log(`  Score: ${this.results.rule13.score}/100\n`);
  }

  async auditMemoryManagement() {
    console.log('🧠 Auditing Memory Management (Rule 14)...');
    
    const issues = [];
    let score = 100;

    // Check current memory usage
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    
    if (rssMB > 50) {
      issues.push(`High memory usage: ${rssMB}MB (should be <50MB)`);
      score -= 40;
    }

    // Check for memory leak patterns
    const memoryLeaks = await this.detectMemoryLeaks();
    if (memoryLeaks.length > 0) {
      issues.push(...memoryLeaks);
      score -= 30;
    }

    // Check resource cleanup
    const cleanupIssues = await this.checkResourceCleanup();
    if (cleanupIssues.length > 0) {
      issues.push(...cleanupIssues);
      score -= 20;
    }

    // Check for stream usage
    const streamIssues = await this.checkStreamUsage();
    if (streamIssues.length > 0) {
      issues.push(...streamIssues);
      score -= 10;
    }

    this.results.rule14 = {
      passed: score >= 70,
      issues,
      score: Math.max(0, score)
    };

    console.log(`  Current Memory: ${rssMB}MB`);
    console.log(`  Score: ${this.results.rule14.score}/100\n`);
  }

  async auditAsyncOperations() {
    console.log('⚡ Auditing Async Operations (Rule 15)...');
    
    const issues = [];
    let score = 100;

    // Check Promise.all usage
    const parallelOpsScore = await this.checkParallelOperations();
    if (parallelOpsScore < 70) {
      issues.push('Insufficient use of Promise.all for parallel operations');
      score -= 30;
    }

    // Check for await in loops
    const loopIssues = await this.findAwaitInLoops();
    if (loopIssues.length > 0) {
      issues.push(`Found ${loopIssues.length} instances of await in loops`);
      score -= 25;
    }

    // Check timeout implementation
    const timeoutIssues = await this.checkTimeouts();
    if (timeoutIssues.length > 0) {
      issues.push(...timeoutIssues);
      score -= 20;
    }

    // Check for event loop blocking
    const blockingIssues = await this.checkEventLoopBlocking();
    if (blockingIssues.length > 0) {
      issues.push(...blockingIssues);
      score -= 25;
    }

    this.results.rule15 = {
      passed: score >= 70,
      issues,
      score: Math.max(0, score)
    };

    console.log(`  Score: ${this.results.rule15.score}/100\n`);
  }

  async findN1Queries() {
    const patterns = [];
    const files = await this.getJavaScriptFiles();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Look for withGraphFetched in loops or lists without proper filtering
      if (content.includes('withGraphFetched') && content.includes('query()')) {
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes('withGraphFetched') && 
              (line.includes('[client') || line.includes('[provider') || line.includes('[service'))) {
            patterns.push({
              file: file.replace(process.cwd(), '.'),
              line: index + 1,
              pattern: line.trim()
            });
          }
        });
      }
    }
    
    return patterns;
  }

  async checkIndexCoverage() {
    // Check if performance indexes migration exists
    const migrationFile = path.join(process.cwd(), 'database/migrations/013_add_performance_indexes.js');
    const hasIndexMigration = fs.existsSync(migrationFile);
    
    if (hasIndexMigration) {
      const content = fs.readFileSync(migrationFile, 'utf8');
      const indexCount = (content.match(/table\.index/g) || []).length;
      
      // Estimate coverage based on number of indexes
      const coverage = Math.min(100, indexCount * 10); // Rough estimate
      return { coverage, indexCount };
    }
    
    return { coverage: 0, indexCount: 0 };
  }

  async checkPagination() {
    const issues = [];
    const files = await this.getJavaScriptFiles();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for basic offset pagination without limit validation
      if (content.includes('offset(') && !content.includes('limit(')) {
        issues.push(`${file.replace(process.cwd(), '.')}: Using offset without limit`);
      }
      
      // Check for large default limits
      const limitMatch = content.match(/limit\s*=\s*(\d+)/);
      if (limitMatch && parseInt(limitMatch[1]) > 100) {
        issues.push(`${file.replace(process.cwd(), '.')}: Large default limit (${limitMatch[1]})`);
      }
    }
    
    return issues;
  }

  async checkTransactionUsage() {
    const issues = [];
    const files = await this.getJavaScriptFiles();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for transactions without proper cleanup
      if (content.includes('transaction.start') && 
          !content.includes('trx.rollback') && 
          !content.includes('trx.commit')) {
        issues.push(`${file.replace(process.cwd(), '.')}: Transaction without proper cleanup`);
      }
    }
    
    return issues;
  }

  async detectMemoryLeaks() {
    const leaks = [];
    
    // Check for event listeners without cleanup
    const files = await this.getJavaScriptFiles();
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      if (content.includes('setInterval') && !content.includes('clearInterval')) {
        leaks.push(`${file.replace(process.cwd(), '.')}: setInterval without clearInterval`);
      }
      
      if (content.includes('addEventListener') && !content.includes('removeEventListener')) {
        leaks.push(`${file.replace(process.cwd(), '.')}: addEventListener without cleanup`);
      }
    }
    
    return leaks;
  }

  async checkResourceCleanup() {
    const issues = [];
    const files = await this.getJavaScriptFiles();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for database connections without cleanup
      if (content.includes('Model.knex()') && !content.includes('destroy')) {
        issues.push(`${file.replace(process.cwd(), '.')}: Database connection without cleanup`);
      }
    }
    
    return issues;
  }

  async checkStreamUsage() {
    const issues = [];
    // For now, return empty array as we don't have large file operations
    return issues;
  }

  async checkParallelOperations() {
    const files = await this.getJavaScriptFiles();
    let promiseAllCount = 0;
    let asyncOperationsCount = 0;
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      promiseAllCount += (content.match(/Promise\.all/g) || []).length;
      asyncOperationsCount += (content.match(/await\s+/g) || []).length;
    }
    
    // Calculate score based on ratio of Promise.all to total async operations
    const ratio = asyncOperationsCount > 0 ? (promiseAllCount / asyncOperationsCount) * 100 : 0;
    return Math.min(100, ratio * 10); // Scale the score
  }

  async findAwaitInLoops() {
    const issues = [];
    const files = await this.getJavaScriptFiles();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (line.includes('for ') && lines[index + 1] && lines[index + 1].includes('await')) {
          issues.push(`${file.replace(process.cwd(), '.')}: Line ${index + 1}`);
        }
      });
    }
    
    return issues;
  }

  async checkTimeouts() {
    const issues = [];
    const files = await this.getJavaScriptFiles();
    
    let hasTimeoutConfig = false;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('timeout') || content.includes('acquireTimeoutMillis')) {
        hasTimeoutConfig = true;
        break;
      }
    }
    
    if (!hasTimeoutConfig) {
      issues.push('No timeout configurations found in HTTP clients or database connections');
    }
    
    return issues;
  }

  async checkEventLoopBlocking() {
    const issues = [];
    const files = await this.getJavaScriptFiles();
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for synchronous file operations
      if (content.includes('readFileSync') || content.includes('writeFileSync')) {
        issues.push(`${file.replace(process.cwd(), '.')}: Synchronous file operations`);
      }
      
      // Check for blocking crypto operations
      if (content.includes('bcrypt.hash') && !content.includes('await')) {
        issues.push(`${file.replace(process.cwd(), '.')}: Synchronous bcrypt operations`);
      }
    }
    
    return issues;
  }

  async getJavaScriptFiles() {
    const files = [];
    const walkDir = (dir) => {
      const entries = fs.readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          walkDir(fullPath);
        } else if (entry.endsWith('.js')) {
          files.push(fullPath);
        }
      }
    };
    
    walkDir(path.join(process.cwd(), 'src'));
    return files;
  }

  calculateOverallScore() {
    const avgScore = (
      this.results.rule13.score + 
      this.results.rule14.score + 
      this.results.rule15.score
    ) / 3;
    
    this.results.overall = {
      passed: avgScore >= 70,
      score: Math.round(avgScore)
    };
  }

  displayResults() {
    console.log('📋 PERFORMANCE AUDIT RESULTS');
    console.log('================================\n');

    // Rule 13 Results
    const rule13Status = this.results.rule13.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`Rule 13 - Database Operations: ${rule13Status} (${this.results.rule13.score}/100)`);
    if (this.results.rule13.issues.length > 0) {
      this.results.rule13.issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    }
    console.log();

    // Rule 14 Results
    const rule14Status = this.results.rule14.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`Rule 14 - Memory Management: ${rule14Status} (${this.results.rule14.score}/100)`);
    if (this.results.rule14.issues.length > 0) {
      this.results.rule14.issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    }
    console.log();

    // Rule 15 Results
    const rule15Status = this.results.rule15.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`Rule 15 - Async Operations: ${rule15Status} (${this.results.rule15.score}/100)`);
    if (this.results.rule15.issues.length > 0) {
      this.results.rule15.issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    }
    console.log();

    // Overall Results
    const overallStatus = this.results.overall.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`OVERALL PERFORMANCE: ${overallStatus} (${this.results.overall.score}/100)\n`);

    // Recommendations
    console.log('🎯 IMMEDIATE ACTION ITEMS:');
    if (!this.results.rule13.passed) {
      console.log('  1. Fix database N+1 queries and add missing indexes');
    }
    if (!this.results.rule14.passed) {
      console.log('  2. Implement memory leak fixes and resource cleanup');
    }
    if (!this.results.rule15.passed) {
      console.log('  3. Optimize async operations with Promise.all and proper timeouts');
    }
    console.log();

    // Performance metrics
    const memUsage = process.memoryUsage();
    console.log('📊 CURRENT SYSTEM METRICS:');
    console.log(`  Memory Usage: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
    console.log(`  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.log();
  }
}

// Run audit if called directly
if (require.main === module) {
  const auditor = new PerformanceAuditor();
  auditor.runAudit().then((results) => {
    process.exit(results.overall.passed ? 0 : 1);
  }).catch((error) => {
    console.error('Audit failed:', error);
    process.exit(1);
  });
}

module.exports = PerformanceAuditor;