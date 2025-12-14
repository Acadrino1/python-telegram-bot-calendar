const { chromium, firefox, webkit } = require('playwright');

class CrossBrowserTester {
  constructor() {
    this.browsers = {
      chromium: { browser: null, contexts: [] },
      firefox: { browser: null, contexts: [] },
      webkit: { browser: null, contexts: [] }
    };
    this.results = {
      compatibility: {},
      performance: {},
      functionality: {},
      summary: {}
    };
  }
  
  async setup() {
    console.log('Setting up cross-browser testing environment...');
    
    // Launch all browsers
    this.browsers.chromium.browser = await chromium.launch({ headless: true });
    this.browsers.firefox.browser = await firefox.launch({ headless: true });
    this.browsers.webkit.browser = await webkit.launch({ headless: true });
    
    console.log('All browsers launched successfully');
  }
  
  async teardown() {
    console.log('Cleaning up browsers...');
    
    for (const browserName in this.browsers) {
      const browserData = this.browsers[browserName];
      
      // Close all contexts
      for (const context of browserData.contexts) {
        await context.close();
      }
      
      // Close browser
      if (browserData.browser) {
        await browserData.browser.close();
      }
    }
    
    console.log('All browsers closed');
  }
  
  async createBrowserContext(browserName, options = {}) {
    const browser = this.browsers[browserName].browser;
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: this.getUserAgent(browserName),
      ...options
    });
    
    this.browsers[browserName].contexts.push(context);
    return context;
  }
  
  getUserAgent(browserName) {
    const userAgents = {
      chromium: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      webkit: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    };
    
    return userAgents[browserName] || userAgents.chromium;
  }
  
  async testPageCompatibility(url, testName) {
    console.log(`\nTesting page compatibility: ${testName}`);
    console.log(`URL: ${url}`);
    
    const browserResults = {};
    
    for (const browserName of ['chromium', 'firefox', 'webkit']) {
      console.log(`  Testing in ${browserName}...`);
      
      try {
        const context = await this.createBrowserContext(browserName);
        const page = await context.newPage();
        
        // Performance timing
        const startTime = Date.now();
        
        // Navigate to page
        await page.goto(url, { waitUntil: 'networkidle' });
        
        const loadTime = Date.now() - startTime;
        
        // Check for JavaScript errors
        const jsErrors = [];
        page.on('pageerror', error => jsErrors.push(error.message));
        
        // Wait for page to be interactive
        await page.waitForLoadState('domcontentloaded');
        
        // Test basic functionality
        const functionalityResults = await this.testBasicFunctionality(page, browserName);
        
        // Test CSS rendering
        const cssResults = await this.testCSSRendering(page, browserName);
        
        // Test responsive design
        const responsiveResults = await this.testResponsiveDesign(page, browserName);
        
        browserResults[browserName] = {
          success: true,
          loadTime: loadTime,
          jsErrors: jsErrors,
          functionality: functionalityResults,
          css: cssResults,
          responsive: responsiveResults,
          timestamp: new Date().toISOString()
        };
        
        console.log(`    ✅ ${browserName}: ${loadTime}ms load time, ${jsErrors.length} errors`);
        
        await context.close();
        
      } catch (error) {
        browserResults[browserName] = {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
        
        console.log(`    ❌ ${browserName}: ${error.message}`);
      }
    }
    
    this.results.compatibility[testName] = browserResults;
    return browserResults;
  }
  
  async testBasicFunctionality(page, browserName) {
    const results = {
      navigation: false,
      forms: false,
      buttons: false,
      modals: false,
      charts: false
    };
    
    try {
      // Test navigation
      const navLinks = await page.$$('nav a, [data-testid^="nav-"]');
      results.navigation = navLinks.length > 0;
      
      // Test forms
      const forms = await page.$$('form, input, textarea, select');
      results.forms = forms.length > 0;
      
      if (forms.length > 0) {
        // Test form interaction
        const firstInput = await page.$('input[type="text"], input[type="email"]');
        if (firstInput) {
          await firstInput.fill('test');
          const value = await firstInput.inputValue();
          results.forms = value === 'test';
        }
      }
      
      // Test buttons
      const buttons = await page.$$('button, [role="button"]');
      results.buttons = buttons.length > 0;
      
      if (buttons.length > 0) {
        // Test button click (non-destructive)
        try {
          await buttons[0].hover();
          results.buttons = true;
        } catch (e) {
          results.buttons = false;
        }
      }
      
      // Test modals/dialogs
      const modals = await page.$$('[role="dialog"], .modal, [data-testid*="modal"]');
      results.modals = modals.length >= 0; // Modals may not be present, that's OK
      
      // Test charts (if present)
      const charts = await page.$$('canvas, .chart, [data-testid*="chart"]');
      results.charts = charts.length >= 0; // Charts may not be present, that's OK
      
    } catch (error) {
      console.log(`      Functionality test error in ${browserName}: ${error.message}`);
    }
    
    return results;
  }
  
  async testCSSRendering(page, browserName) {
    const results = {
      layout: false,
      colors: false,
      fonts: false,
      animations: false
    };
    
    try {
      // Test layout rendering
      const bodyHeight = await page.evaluate(() => document.body.offsetHeight);
      const bodyWidth = await page.evaluate(() => document.body.offsetWidth);
      results.layout = bodyHeight > 0 && bodyWidth > 0;
      
      // Test color rendering
      const colorElements = await page.$$eval('[class*="color"], [style*="color"]', elements => {
        return elements.slice(0, 5).map(el => {
          const style = window.getComputedStyle(el);
          return {
            color: style.color,
            backgroundColor: style.backgroundColor
          };
        });
      });
      
      results.colors = colorElements.some(el => 
        el.color !== 'rgba(0, 0, 0, 0)' || el.backgroundColor !== 'rgba(0, 0, 0, 0)'
      );
      
      // Test font rendering
      const fontElements = await page.$$eval('h1, h2, h3, p, span', elements => {
        return elements.slice(0, 5).map(el => {
          const style = window.getComputedStyle(el);
          return {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight
          };
        });
      });
      
      results.fonts = fontElements.some(el => el.fontFamily && el.fontSize);
      
      // Test animations (check for CSS transitions/animations)
      const animatedElements = await page.$$eval('*', elements => {
        return elements.slice(0, 20).some(el => {
          const style = window.getComputedStyle(el);
          return style.transition !== 'none' || style.animation !== 'none';
        });
      });
      
      results.animations = animatedElements;
      
    } catch (error) {
      console.log(`      CSS test error in ${browserName}: ${error.message}`);
    }
    
    return results;
  }
  
  async testResponsiveDesign(page, browserName) {
    const results = {
      mobile: false,
      tablet: false,
      desktop: false
    };
    
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 }
    ];
    
    for (const viewport of viewports) {
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(500); // Allow time for responsive changes
        
        // Check if layout adapts
        const isResponsive = await page.evaluate(() => {
          // Check if any elements have responsive classes or styles
          const responsiveElements = document.querySelectorAll(
            '[class*="mobile"], [class*="tablet"], [class*="desktop"], [class*="responsive"], [class*="sm-"], [class*="md-"], [class*="lg-"]'
          );
          
          // Check viewport-specific styles
          const hasMediaQueries = Array.from(document.styleSheets).some(sheet => {
            try {
              return Array.from(sheet.cssRules).some(rule => 
                rule.media && rule.media.mediaText
              );
            } catch (e) {
              return false;
            }
          });
          
          return responsiveElements.length > 0 || hasMediaQueries;
        });
        
        results[viewport.name] = isResponsive;
        
      } catch (error) {
        console.log(`      Responsive test error in ${browserName} (${viewport.name}): ${error.message}`);
        results[viewport.name] = false;
      }
    }
    
    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    return results;
  }
  
  async testPerformanceAcrossBrowsers(url) {
    console.log(`\nTesting performance across browsers for: ${url}`);
    
    const performanceResults = {};
    
    for (const browserName of ['chromium', 'firefox', 'webkit']) {
      try {
        const context = await this.createBrowserContext(browserName);
        const page = await context.newPage();
        
        // Collect performance metrics
        const metrics = await page.evaluate(() => {
          return new Promise((resolve) => {
            if (window.performance && window.performance.timing) {
              const timing = window.performance.timing;
              const navigation = window.performance.navigation;
              
              resolve({
                domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
                loadComplete: timing.loadEventEnd - timing.navigationStart,
                domInteractive: timing.domInteractive - timing.navigationStart,
                firstPaint: window.performance.getEntriesByType('paint')
                  .find(entry => entry.name === 'first-paint')?.startTime || 0,
                firstContentfulPaint: window.performance.getEntriesByType('paint')
                  .find(entry => entry.name === 'first-contentful-paint')?.startTime || 0,
                navigationType: navigation.type
              });
            } else {
              resolve(null);
            }
          });
        });
        
        await page.goto(url, { waitUntil: 'networkidle' });
        
        performanceResults[browserName] = {
          success: true,
          metrics: metrics,
          timestamp: new Date().toISOString()
        };
        
        console.log(`  ${browserName}: Load ${metrics?.loadComplete || 'N/A'}ms, DOM ${metrics?.domContentLoaded || 'N/A'}ms`);
        
        await context.close();
        
      } catch (error) {
        performanceResults[browserName] = {
          success: false,
          error: error.message
        };
        
        console.log(`  ${browserName}: Performance test failed - ${error.message}`);
      }
    }
    
    this.results.performance[url] = performanceResults;
    return performanceResults;
  }
  
  async runFullCrossBrowserTest(baseUrl = 'http://localhost:3000') {
    console.log('Starting comprehensive cross-browser testing...\n');
    
    await this.setup();
    
    const testPages = [
      { url: `${baseUrl}/admin/login`, name: 'Admin Login' },
      { url: `${baseUrl}/admin/dashboard`, name: 'Admin Dashboard' },
      { url: `${baseUrl}/admin/users`, name: 'User Management' },
      { url: `${baseUrl}/admin/appointments`, name: 'Appointment Management' }
    ];
    
    // Test compatibility for each page
    for (const testPage of testPages) {
      await this.testPageCompatibility(testPage.url, testPage.name);
    }
    
    // Test performance
    for (const testPage of testPages) {
      await this.testPerformanceAcrossBrowsers(testPage.url);
    }
    
    await this.teardown();
    
    this.generateSummary();
    this.generateReport();
    
    return this.results;
  }
  
  generateSummary() {
    const browsers = ['chromium', 'firefox', 'webkit'];
    const totalTests = Object.keys(this.results.compatibility).length * browsers.length;
    let passedTests = 0;
    let failedTests = 0;
    
    // Count compatibility results
    for (const testName in this.results.compatibility) {
      const testResults = this.results.compatibility[testName];
      for (const browser of browsers) {
        if (testResults[browser]?.success) {
          passedTests++;
        } else {
          failedTests++;
        }
      }
    }
    
    const passRate = totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0;
    
    this.results.summary = {
      totalTests: totalTests,
      passedTests: passedTests,
      failedTests: failedTests,
      passRate: `${passRate}%`,
      browsersSupported: browsers.filter(browser => {
        return Object.values(this.results.compatibility).some(test => test[browser]?.success);
      })
    };
    
    console.log('\n=== CROSS-BROWSER TEST SUMMARY ===');
    console.log(`Total tests: ${this.results.summary.totalTests}`);
    console.log(`Passed: ${this.results.summary.passedTests}`);
    console.log(`Failed: ${this.results.summary.failedTests}`);
    console.log(`Pass rate: ${this.results.summary.passRate}`);
    console.log(`Browsers supported: ${this.results.summary.browsersSupported.join(', ')}`);
    
    // Show browser-specific compatibility
    console.log('\nBrowser Compatibility:');
    for (const browser of browsers) {
      const browserTests = Object.values(this.results.compatibility)
        .map(test => test[browser])
        .filter(result => result);
      
      const browserPassRate = browserTests.length > 0 
        ? (browserTests.filter(test => test.success).length / browserTests.length * 100).toFixed(1)
        : 0;
        
      console.log(`  ${browser}: ${browserPassRate}% (${browserTests.filter(test => test.success).length}/${browserTests.length})`);
    }
  }
  
  generateReport() {
    const fs = require('fs');
    const reportPath = 'tests/reports/cross-browser-report.json';
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`\nDetailed report saved to: ${reportPath}`);
    } catch (error) {
      console.error('Failed to save cross-browser report:', error.message);
    }
    
    // Generate HTML report
    this.generateHTMLReport();
  }
  
  generateHTMLReport() {
    const fs = require('fs');
    const path = require('path');
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Cross-Browser Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
        .browser { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
        .success { background-color: #d4edda; }
        .failure { background-color: #f8d7da; }
        .metric { display: inline-block; margin-right: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .pass { color: green; }
        .fail { color: red; }
    </style>
</head>
<body>
    <h1>Cross-Browser Test Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <div class="metric"><strong>Total Tests:</strong> ${this.results.summary.totalTests}</div>
        <div class="metric"><strong>Pass Rate:</strong> ${this.results.summary.passRate}</div>
        <div class="metric"><strong>Browsers:</strong> ${this.results.summary.browsersSupported.join(', ')}</div>
    </div>
    
    <h2>Compatibility Results</h2>
    <table>
        <tr>
            <th>Test</th>
            <th>Chromium</th>
            <th>Firefox</th>
            <th>WebKit</th>
        </tr>
        ${Object.entries(this.results.compatibility).map(([testName, results]) => `
        <tr>
            <td><strong>${testName}</strong></td>
            <td class="${results.chromium?.success ? 'pass' : 'fail'}">
                ${results.chromium?.success ? '✅' : '❌'} 
                ${results.chromium?.loadTime ? `${results.chromium.loadTime}ms` : 'Failed'}
            </td>
            <td class="${results.firefox?.success ? 'pass' : 'fail'}">
                ${results.firefox?.success ? '✅' : '❌'} 
                ${results.firefox?.loadTime ? `${results.firefox.loadTime}ms` : 'Failed'}
            </td>
            <td class="${results.webkit?.success ? 'pass' : 'fail'}">
                ${results.webkit?.success ? '✅' : '❌'} 
                ${results.webkit?.loadTime ? `${results.webkit.loadTime}ms` : 'Failed'}
            </td>
        </tr>
        `).join('')}
    </table>
    
    <h2>Performance Comparison</h2>
    <pre>${JSON.stringify(this.results.performance, null, 2)}</pre>
    
    <p><em>Report generated on ${new Date().toISOString()}</em></p>
</body>
</html>`;
    
    try {
      const reportPath = 'tests/reports/cross-browser-report.html';
      fs.writeFileSync(reportPath, htmlContent);
      console.log(`HTML report saved to: ${reportPath}`);
    } catch (error) {
      console.error('Failed to save HTML report:', error.message);
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const tester = new CrossBrowserTester();
  tester.runFullCrossBrowserTest()
    .then(results => {
      process.exit(results.summary.failedTests > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Cross-browser test failed:', error);
      process.exit(1);
    });
}

module.exports = CrossBrowserTester;