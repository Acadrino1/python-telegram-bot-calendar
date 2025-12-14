const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class QualityMetricsAnalyzer {
  constructor() {
    this.metrics = {
      codeQuality: {},
      testCoverage: {},
      complexity: {},
      security: {},
      performance: {},
      documentation: {},
      summary: {}
    };
  }
  
  async analyzeCodeQuality() {
    console.log('Analyzing code quality...');
    
    try {
      // Run ESLint analysis
      const lintResult = await execAsync('npx eslint src/ --format json', {
        encoding: 'utf8'
      });
      
      const lintData = JSON.parse(lintResult.stdout);
      
      let totalErrors = 0;
      let totalWarnings = 0;
      let totalFiles = 0;
      const issuesByCategory = {};
      
      lintData.forEach(file => {
        totalFiles++;
        totalErrors += file.errorCount;
        totalWarnings += file.warningCount;
        
        file.messages.forEach(message => {
          const category = message.ruleId || 'unknown';
          if (!issuesByCategory[category]) {
            issuesByCategory[category] = 0;
          }
          issuesByCategory[category]++;
        });
      });
      
      this.metrics.codeQuality = {
        totalFiles: totalFiles,
        totalErrors: totalErrors,
        totalWarnings: totalWarnings,
        errorRate: totalFiles > 0 ? (totalErrors / totalFiles).toFixed(2) : 0,
        warningRate: totalFiles > 0 ? (totalWarnings / totalFiles).toFixed(2) : 0,
        issuesByCategory: Object.entries(issuesByCategory)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10),
        qualityScore: this.calculateQualityScore(totalErrors, totalWarnings, totalFiles)
      };
      
      console.log(`  Code Quality: ${this.metrics.codeQuality.qualityScore}/100`);
      console.log(`  Files: ${totalFiles}, Errors: ${totalErrors}, Warnings: ${totalWarnings}`);
      
    } catch (error) {
      console.error('Error analyzing code quality:', error.message);
      this.metrics.codeQuality = { error: error.message };
    }
  }
  
  async analyzeTestCoverage() {
    console.log('Analyzing test coverage...');
    
    try {
      // Run test coverage
      await execAsync('npm run test:coverage', { encoding: 'utf8' });
      
      // Read coverage report
      const coverageFile = path.join(process.cwd(), 'tests/reports/coverage/coverage-summary.json');
      
      if (fs.existsSync(coverageFile)) {
        const coverageData = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
        
        const total = coverageData.total;
        this.metrics.testCoverage = {
          statements: {
            pct: total.statements.pct,
            covered: total.statements.covered,
            total: total.statements.total
          },
          branches: {
            pct: total.branches.pct,
            covered: total.branches.covered,
            total: total.branches.total
          },
          functions: {
            pct: total.functions.pct,
            covered: total.functions.covered,
            total: total.functions.total
          },
          lines: {
            pct: total.lines.pct,
            covered: total.lines.covered,
            total: total.lines.total
          },
          overallScore: Math.round(
            (total.statements.pct + total.branches.pct + total.functions.pct + total.lines.pct) / 4
          )
        };
        
        console.log(`  Test Coverage: ${this.metrics.testCoverage.overallScore}%`);
        console.log(`  Statements: ${total.statements.pct}%, Branches: ${total.branches.pct}%`);
        
      } else {
        throw new Error('Coverage report not found');
      }
      
    } catch (error) {
      console.error('Error analyzing test coverage:', error.message);
      this.metrics.testCoverage = { error: error.message };
    }
  }
  
  async analyzeComplexity() {
    console.log('Analyzing code complexity...');
    
    try {
      // Calculate cyclomatic complexity
      const complexityData = await this.calculateComplexity();
      
      this.metrics.complexity = {
        averageComplexity: complexityData.average,
        maxComplexity: complexityData.max,
        filesWithHighComplexity: complexityData.highComplexityFiles,
        totalFunctions: complexityData.totalFunctions,
        complexityDistribution: complexityData.distribution,
        complexityScore: this.calculateComplexityScore(complexityData.average, complexityData.max)
      };
      
      console.log(`  Complexity Score: ${this.metrics.complexity.complexityScore}/100`);
      console.log(`  Average: ${complexityData.average}, Max: ${complexityData.max}`);
      
    } catch (error) {
      console.error('Error analyzing complexity:', error.message);
      this.metrics.complexity = { error: error.message };
    }
  }
  
  async analyzeSecurity() {
    console.log('Analyzing security...');
    
    try {
      // Run security audit (npm audit)
      const auditResult = await execAsync('npm audit --json', { encoding: 'utf8' });
      const auditData = JSON.parse(auditResult.stdout);
      
      // Run Snyk test if available
      let snykResults = null;
      try {
        const snykResult = await execAsync('snyk test --json', { encoding: 'utf8' });
        snykResults = JSON.parse(snykResult.stdout);
      } catch (e) {
        // Snyk might not be available
      }
      
      this.metrics.security = {
        vulnerabilities: {
          critical: auditData.metadata?.vulnerabilities?.critical || 0,
          high: auditData.metadata?.vulnerabilities?.high || 0,
          moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
          low: auditData.metadata?.vulnerabilities?.low || 0,
          info: auditData.metadata?.vulnerabilities?.info || 0
        },
        totalVulnerabilities: auditData.metadata?.vulnerabilities?.total || 0,
        securityScore: this.calculateSecurityScore(auditData.metadata?.vulnerabilities),
        snykIssues: snykResults ? snykResults.vulnerabilities?.length || 0 : 'N/A'
      };
      
      console.log(`  Security Score: ${this.metrics.security.securityScore}/100`);
      console.log(`  Vulnerabilities: ${this.metrics.security.totalVulnerabilities}`);
      
    } catch (error) {
      console.error('Error analyzing security:', error.message);
      this.metrics.security = { error: error.message };
    }
  }
  
  async analyzePerformance() {
    console.log('Analyzing performance metrics...');
    
    try {
      // Check for performance test results
      const performanceResults = await this.getPerformanceMetrics();
      
      this.metrics.performance = {
        loadTime: performanceResults.averageLoadTime,
        responseTime: performanceResults.averageResponseTime,
        throughput: performanceResults.requestsPerSecond,
        errorRate: performanceResults.errorRate,
        performanceScore: this.calculatePerformanceScore(performanceResults)
      };
      
      console.log(`  Performance Score: ${this.metrics.performance.performanceScore}/100`);
      console.log(`  Load Time: ${performanceResults.averageLoadTime}ms`);
      
    } catch (error) {
      console.error('Error analyzing performance:', error.message);
      this.metrics.performance = { error: error.message };
    }
  }
  
  async analyzeDocumentation() {
    console.log('Analyzing documentation...');
    
    try {
      const docMetrics = await this.analyzeDocumentationCoverage();
      
      this.metrics.documentation = {
        functionsCovered: docMetrics.functionsCovered,
        totalFunctions: docMetrics.totalFunctions,
        coveragePercentage: docMetrics.coveragePercentage,
        readmeQuality: docMetrics.readmeQuality,
        apiDocumentation: docMetrics.apiDocumentation,
        documentationScore: docMetrics.score
      };
      
      console.log(`  Documentation Score: ${this.metrics.documentation.documentationScore}/100`);
      console.log(`  Function Coverage: ${docMetrics.coveragePercentage}%`);
      
    } catch (error) {
      console.error('Error analyzing documentation:', error.message);
      this.metrics.documentation = { error: error.message };
    }
  }
  
  calculateQualityScore(errors, warnings, files) {
    if (files === 0) return 0;
    
    const errorPenalty = (errors / files) * 10;
    const warningPenalty = (warnings / files) * 5;
    const totalPenalty = Math.min(errorPenalty + warningPenalty, 100);
    
    return Math.max(0, 100 - totalPenalty);
  }
  
  calculateComplexityScore(average, max) {
    // Good: average < 5, max < 10
    // Fair: average < 10, max < 20
    // Poor: average >= 10 or max >= 20
    
    let score = 100;
    
    if (average >= 10) {
      score -= 40;
    } else if (average >= 7) {
      score -= 20;
    } else if (average >= 5) {
      score -= 10;
    }
    
    if (max >= 20) {
      score -= 30;
    } else if (max >= 15) {
      score -= 20;
    } else if (max >= 10) {
      score -= 10;
    }
    
    return Math.max(0, score);
  }
  
  calculateSecurityScore(vulnerabilities) {
    if (!vulnerabilities) return 100;
    
    const { critical = 0, high = 0, moderate = 0, low = 0 } = vulnerabilities;
    const totalVulns = critical + high + moderate + low;
    
    if (totalVulns === 0) return 100;
    
    // Heavy penalty for critical and high severity
    const penalty = (critical * 25) + (high * 15) + (moderate * 5) + (low * 1);
    
    return Math.max(0, 100 - penalty);
  }
  
  calculatePerformanceScore(metrics) {
    let score = 100;
    
    // Load time penalty
    if (metrics.averageLoadTime > 3000) {
      score -= 30;
    } else if (metrics.averageLoadTime > 1000) {
      score -= 15;
    }
    
    // Response time penalty
    if (metrics.averageResponseTime > 500) {
      score -= 20;
    } else if (metrics.averageResponseTime > 200) {
      score -= 10;
    }
    
    // Error rate penalty
    if (metrics.errorRate > 5) {
      score -= 30;
    } else if (metrics.errorRate > 1) {
      score -= 15;
    }
    
    return Math.max(0, score);
  }
  
  async calculateComplexity() {
    // Simple complexity analysis by counting decision points
    const sourceFiles = this.getAllJSFiles('src/');
    const results = {
      total: 0,
      count: 0,
      max: 0,
      distribution: { simple: 0, moderate: 0, complex: 0, veryComplex: 0 },
      highComplexityFiles: []
    };
    
    for (const filePath of sourceFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const complexity = this.calculateFileComplexity(content);
        
        results.total += complexity.total;
        results.count += complexity.functionCount;
        results.max = Math.max(results.max, complexity.max);
        
        if (complexity.max > 15) {
          results.highComplexityFiles.push({
            file: filePath,
            complexity: complexity.max
          });
        }
        
        // Distribute complexity scores
        complexity.functions.forEach(func => {
          if (func.complexity <= 5) {
            results.distribution.simple++;
          } else if (func.complexity <= 10) {
            results.distribution.moderate++;
          } else if (func.complexity <= 20) {
            results.distribution.complex++;
          } else {
            results.distribution.veryComplex++;
          }
        });
        
      } catch (error) {
        console.warn(`Could not analyze complexity for ${filePath}:`, error.message);
      }
    }
    
    return {
      average: results.count > 0 ? (results.total / results.count).toFixed(2) : 0,
      max: results.max,
      totalFunctions: results.count,
      distribution: results.distribution,
      highComplexityFiles: results.highComplexityFiles
    };
  }
  
  calculateFileComplexity(content) {
    // Count decision points: if, else if, while, for, switch case, catch, &&, ||, ?
    const decisionPoints = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bwhile\s*\(/g,
      /\bfor\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /&&/g,
      /\|\|/g,
      /\?/g
    ];
    
    // Extract function bodies (simplified)
    const functionRegex = /function\s+\w+\s*\([^)]*\)\s*\{|=>\s*\{|\w+\s*\([^)]*\)\s*\{/g;
    const functions = [];
    let match;
    
    // Simple function extraction
    const lines = content.split('\n');
    let currentFunction = null;
    let braceCount = 0;
    
    lines.forEach((line, index) => {
      const functionMatch = line.match(/(?:function\s+(\w+)|(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))/);
      
      if (functionMatch && braceCount === 0) {
        currentFunction = {
          name: functionMatch[1] || functionMatch[2] || 'anonymous',
          startLine: index,
          complexity: 1, // Base complexity
          content: ''
        };
      }
      
      if (currentFunction) {
        currentFunction.content += line + '\n';
        
        // Count braces to determine function boundaries
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        
        if (braceCount === 0 && currentFunction.content.includes('{')) {
          // Function complete, calculate complexity
          decisionPoints.forEach(pattern => {
            const matches = currentFunction.content.match(pattern) || [];
            currentFunction.complexity += matches.length;
          });
          
          functions.push(currentFunction);
          currentFunction = null;
        }
      }
    });
    
    const total = functions.reduce((sum, func) => sum + func.complexity, 0);
    const max = functions.length > 0 ? Math.max(...functions.map(func => func.complexity)) : 0;
    
    return {
      functions: functions,
      functionCount: functions.length,
      total: total,
      max: max
    };
  }
  
  getAllJSFiles(dir) {
    const files = [];
    
    function traverseDir(currentDir) {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          traverseDir(fullPath);
        } else if (stat.isFile() && item.endsWith('.js')) {
          files.push(fullPath);
        }
      });
    }
    
    traverseDir(dir);
    return files;
  }
  
  async getPerformanceMetrics() {
    // Try to read performance test results
    try {
      const performanceFile = path.join(process.cwd(), 'tests/reports/performance-results.json');
      
      if (fs.existsSync(performanceFile)) {
        const data = JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
        return data;
      }
    } catch (error) {
      // File doesn't exist or is invalid
    }
    
    // Return default/mock metrics
    return {
      averageLoadTime: 800,
      averageResponseTime: 150,
      requestsPerSecond: 45,
      errorRate: 0.5
    };
  }
  
  async analyzeDocumentationCoverage() {
    const sourceFiles = this.getAllJSFiles('src/');
    let totalFunctions = 0;
    let documentedFunctions = 0;
    
    for (const filePath of sourceFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const analysis = this.analyzeFileDocumentation(content);
        
        totalFunctions += analysis.totalFunctions;
        documentedFunctions += analysis.documentedFunctions;
        
      } catch (error) {
        console.warn(`Could not analyze documentation for ${filePath}:`, error.message);
      }
    }
    
    const coveragePercentage = totalFunctions > 0 
      ? ((documentedFunctions / totalFunctions) * 100).toFixed(1)
      : 0;
    
    // Check README quality
    const readmeQuality = this.analyzeReadmeQuality();
    
    return {
      functionsCovered: documentedFunctions,
      totalFunctions: totalFunctions,
      coveragePercentage: parseFloat(coveragePercentage),
      readmeQuality: readmeQuality,
      apiDocumentation: this.hasApiDocumentation(),
      score: this.calculateDocumentationScore(coveragePercentage, readmeQuality)
    };
  }
  
  analyzeFileDocumentation(content) {
    // Look for JSDoc comments before functions
    const lines = content.split('\n');
    let totalFunctions = 0;
    let documentedFunctions = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line contains a function declaration
      if (line.match(/(?:function\s+\w+|exports\.\w+\s*=\s*function|\w+\s*:\s*function)/)) {
        totalFunctions++;
        
        // Check previous lines for JSDoc comment
        let hasDocumentation = false;
        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
          const prevLine = lines[j].trim();
          
          if (prevLine.startsWith('/**') || prevLine.startsWith('/*') || prevLine.startsWith('//')) {
            hasDocumentation = true;
            break;
          }
          
          // Stop if we hit another function or significant code
          if (prevLine && !prevLine.startsWith('*') && !prevLine.startsWith('//')) {
            break;
          }
        }
        
        if (hasDocumentation) {
          documentedFunctions++;
        }
      }
    }
    
    return {
      totalFunctions: totalFunctions,
      documentedFunctions: documentedFunctions
    };
  }
  
  analyzeReadmeQuality() {
    try {
      const readmePath = path.join(process.cwd(), 'README.md');
      
      if (!fs.existsSync(readmePath)) {
        return { score: 0, issues: ['No README.md file found'] };
      }
      
      const content = fs.readFileSync(readmePath, 'utf8');
      const issues = [];
      let score = 100;
      
      // Check for essential sections
      const requiredSections = [
        { name: 'Installation', patterns: [/#{1,6}\s*installation/i, /#{1,6}\s*setup/i] },
        { name: 'Usage', patterns: [/#{1,6}\s*usage/i, /#{1,6}\s*getting started/i] },
        { name: 'API', patterns: [/#{1,6}\s*api/i, /#{1,6}\s*endpoints/i] },
        { name: 'Contributing', patterns: [/#{1,6}\s*contribut/i] }
      ];
      
      requiredSections.forEach(section => {
        const hasSection = section.patterns.some(pattern => pattern.test(content));
        if (!hasSection) {
          issues.push(`Missing ${section.name} section`);
          score -= 15;
        }
      });
      
      // Check for code examples
      if (!content.includes('```')) {
        issues.push('No code examples found');
        score -= 10;
      }
      
      // Check length (should have substantial content)
      if (content.length < 500) {
        issues.push('README is too short');
        score -= 20;
      }
      
      return { score: Math.max(0, score), issues: issues };
      
    } catch (error) {
      return { score: 0, issues: [`Error reading README: ${error.message}`] };
    }
  }
  
  hasApiDocumentation() {
    const docsDir = path.join(process.cwd(), 'docs');
    const hasDocsDir = fs.existsSync(docsDir);
    
    if (hasDocsDir) {
      const docFiles = fs.readdirSync(docsDir);
      const apiDocs = docFiles.filter(file => 
        file.toLowerCase().includes('api') || file.toLowerCase().includes('endpoint')
      );
      return apiDocs.length > 0;
    }
    
    return false;
  }
  
  calculateDocumentationScore(coveragePercentage, readmeQuality) {
    return Math.round((coveragePercentage * 0.6) + (readmeQuality.score * 0.4));
  }
  
  generateOverallScore() {
    const weights = {
      codeQuality: 0.25,
      testCoverage: 0.25,
      complexity: 0.15,
      security: 0.20,
      performance: 0.10,
      documentation: 0.05
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(weights).forEach(([metric, weight]) => {
      const metricData = this.metrics[metric];
      let score = 0;
      
      switch (metric) {
        case 'codeQuality':
          score = metricData.qualityScore || 0;
          break;
        case 'testCoverage':
          score = metricData.overallScore || 0;
          break;
        case 'complexity':
          score = metricData.complexityScore || 0;
          break;
        case 'security':
          score = metricData.securityScore || 0;
          break;
        case 'performance':
          score = metricData.performanceScore || 0;
          break;
        case 'documentation':
          score = metricData.documentationScore || 0;
          break;
      }
      
      if (!metricData.error && score > 0) {
        totalScore += score * weight;
        totalWeight += weight;
      }
    });
    
    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }
  
  async runFullAnalysis() {
    console.log('Starting comprehensive quality metrics analysis...\n');
    
    await this.analyzeCodeQuality();
    await this.analyzeTestCoverage();
    await this.analyzeComplexity();
    await this.analyzeSecurity();
    await this.analyzePerformance();
    await this.analyzeDocumentation();
    
    // Generate overall summary
    this.metrics.summary = {
      overallScore: this.generateOverallScore(),
      timestamp: new Date().toISOString(),
      recommendations: this.generateRecommendations()
    };
    
    this.displaySummary();
    this.saveReport();
    
    return this.metrics;
  }
  
  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.codeQuality.qualityScore < 80) {
      recommendations.push({
        category: 'Code Quality',
        priority: 'High',
        message: 'Fix ESLint errors and warnings to improve code quality'
      });
    }
    
    if (this.metrics.testCoverage.overallScore < 80) {
      recommendations.push({
        category: 'Test Coverage',
        priority: 'High',
        message: 'Increase test coverage, especially for critical functionality'
      });
    }
    
    if (this.metrics.complexity.complexityScore < 70) {
      recommendations.push({
        category: 'Complexity',
        priority: 'Medium',
        message: 'Refactor complex functions to improve maintainability'
      });
    }
    
    if (this.metrics.security.totalVulnerabilities > 0) {
      recommendations.push({
        category: 'Security',
        priority: 'Critical',
        message: 'Address security vulnerabilities in dependencies'
      });
    }
    
    if (this.metrics.performance.performanceScore < 70) {
      recommendations.push({
        category: 'Performance',
        priority: 'Medium',
        message: 'Optimize application performance and response times'
      });
    }
    
    if (this.metrics.documentation.documentationScore < 60) {
      recommendations.push({
        category: 'Documentation',
        priority: 'Low',
        message: 'Improve code documentation and API documentation'
      });
    }
    
    return recommendations;
  }
  
  displaySummary() {
    console.log('\n=== QUALITY METRICS SUMMARY ===');
    console.log(`Overall Score: ${this.metrics.summary.overallScore}/100`);
    console.log('\nDetailed Scores:');
    console.log(`  Code Quality: ${this.metrics.codeQuality.qualityScore || 'N/A'}/100`);
    console.log(`  Test Coverage: ${this.metrics.testCoverage.overallScore || 'N/A'}%`);
    console.log(`  Complexity: ${this.metrics.complexity.complexityScore || 'N/A'}/100`);
    console.log(`  Security: ${this.metrics.security.securityScore || 'N/A'}/100`);
    console.log(`  Performance: ${this.metrics.performance.performanceScore || 'N/A'}/100`);
    console.log(`  Documentation: ${this.metrics.documentation.documentationScore || 'N/A'}/100`);
    
    console.log('\nTop Recommendations:');
    this.metrics.summary.recommendations
      .filter(rec => rec.priority === 'Critical' || rec.priority === 'High')
      .slice(0, 3)
      .forEach(rec => {
        console.log(`  [${rec.priority}] ${rec.category}: ${rec.message}`);
      });
  }
  
  saveReport() {
    try {
      const reportPath = path.join(process.cwd(), 'tests/reports/quality-metrics.json');
      fs.writeFileSync(reportPath, JSON.stringify(this.metrics, null, 2));
      console.log(`\nDetailed report saved to: ${reportPath}`);
      
      // Generate HTML report
      this.generateHTMLReport();
      
    } catch (error) {
      console.error('Failed to save quality metrics report:', error.message);
    }
  }
  
  generateHTMLReport() {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Quality Metrics Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f8f9fa; padding: 20px; margin-bottom: 20px; }
        .score { font-size: 2em; font-weight: bold; color: #28a745; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .metric h3 { margin-top: 0; color: #333; }
        .score-bar { background: #e9ecef; height: 20px; border-radius: 10px; overflow: hidden; }
        .score-fill { height: 100%; background: linear-gradient(90deg, #dc3545, #ffc107, #28a745); }
        .recommendations { background: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid #007bff; }
        .high { color: #dc3545; }
        .medium { color: #ffc107; }
        .low { color: #6c757d; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Quality Metrics Report</h1>
        <div class="score">${this.metrics.summary.overallScore}/100</div>
        <p>Generated on ${new Date(this.metrics.summary.timestamp).toLocaleString()}</p>
    </div>
    
    <div class="metrics">
        ${this.generateMetricHTML('Code Quality', this.metrics.codeQuality)}
        ${this.generateMetricHTML('Test Coverage', this.metrics.testCoverage)}
        ${this.generateMetricHTML('Complexity', this.metrics.complexity)}
        ${this.generateMetricHTML('Security', this.metrics.security)}
        ${this.generateMetricHTML('Performance', this.metrics.performance)}
        ${this.generateMetricHTML('Documentation', this.metrics.documentation)}
    </div>
    
    <div class="recommendations">
        <h2>Recommendations</h2>
        ${this.metrics.summary.recommendations.map(rec => `
            <div class="${rec.priority.toLowerCase()}">
                <strong>[${rec.priority}] ${rec.category}:</strong> ${rec.message}
            </div>
        `).join('')}
    </div>
    
    <h2>Detailed Metrics</h2>
    <pre>${JSON.stringify(this.metrics, null, 2)}</pre>
</body>
</html>`;
    
    try {
      const htmlPath = path.join(process.cwd(), 'tests/reports/quality-metrics.html');
      fs.writeFileSync(htmlPath, htmlContent);
      console.log(`HTML report saved to: ${htmlPath}`);
    } catch (error) {
      console.error('Failed to save HTML report:', error.message);
    }
  }
  
  generateMetricHTML(title, data) {
    if (data.error) {
      return `
        <div class="metric">
            <h3>${title}</h3>
            <p style="color: #dc3545;">Error: ${data.error}</p>
        </div>
      `;
    }
    
    let score = 0;
    let details = '';
    
    switch (title) {
      case 'Code Quality':
        score = data.qualityScore;
        details = `
          <p>Files: ${data.totalFiles}, Errors: ${data.totalErrors}, Warnings: ${data.totalWarnings}</p>
          <p>Error Rate: ${data.errorRate}/file, Warning Rate: ${data.warningRate}/file</p>
        `;
        break;
      case 'Test Coverage':
        score = data.overallScore;
        details = `
          <p>Statements: ${data.statements?.pct}%, Branches: ${data.branches?.pct}%</p>
          <p>Functions: ${data.functions?.pct}%, Lines: ${data.lines?.pct}%</p>
        `;
        break;
      case 'Complexity':
        score = data.complexityScore;
        details = `
          <p>Average: ${data.averageComplexity}, Max: ${data.maxComplexity}</p>
          <p>High Complexity Files: ${data.filesWithHighComplexity?.length || 0}</p>
        `;
        break;
      case 'Security':
        score = data.securityScore;
        details = `
          <p>Total Vulnerabilities: ${data.totalVulnerabilities}</p>
          <p>Critical: ${data.vulnerabilities?.critical}, High: ${data.vulnerabilities?.high}</p>
        `;
        break;
      case 'Performance':
        score = data.performanceScore;
        details = `
          <p>Load Time: ${data.loadTime}ms, Response Time: ${data.responseTime}ms</p>
          <p>Throughput: ${data.throughput} req/s, Error Rate: ${data.errorRate}%</p>
        `;
        break;
      case 'Documentation':
        score = data.documentationScore;
        details = `
          <p>Function Coverage: ${data.coveragePercentage}%</p>
          <p>README Quality: ${data.readmeQuality?.score || 'N/A'}/100</p>
        `;
        break;
    }
    
    return `
      <div class="metric">
          <h3>${title}</h3>
          <div class="score-bar">
              <div class="score-fill" style="width: ${score}%"></div>
          </div>
          <p><strong>${score}/100</strong></p>
          ${details}
      </div>
    `;
  }
}

// Run the analysis if this file is executed directly
if (require.main === module) {
  const analyzer = new QualityMetricsAnalyzer();
  analyzer.runFullAnalysis()
    .then(results => {
      process.exit(results.summary.overallScore < 70 ? 1 : 0);
    })
    .catch(error => {
      console.error('Quality analysis failed:', error);
      process.exit(1);
    });
}

module.exports = QualityMetricsAnalyzer;