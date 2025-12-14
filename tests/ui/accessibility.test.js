const { chromium } = require('playwright');
const { AxePuppeteer } = require('@axe-core/playwright');

class AccessibilityTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = {
      passed: [],
      failed: [],
      summary: {}
    };
  }
  
  async setup() {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    
    // Set viewport for consistent testing
    await this.page.setViewportSize({ width: 1280, height: 720 });
  }
  
  async teardown() {
    if (this.browser) {
      await this.browser.close();
    }
  }
  
  async testPage(url, testName) {
    try {
      console.log(`Testing accessibility for: ${testName} (${url})`);
      
      await this.page.goto(url);
      
      // Wait for page to be fully loaded
      await this.page.waitForLoadState('networkidle');
      
      // Run axe-core accessibility tests
      const axeResults = await new AxePuppeteer(this.page).analyze();
      
      // Process results
      const pageResults = {
        url,
        testName,
        violations: axeResults.violations,
        passes: axeResults.passes,
        incomplete: axeResults.incomplete,
        inapplicable: axeResults.inapplicable,
        timestamp: new Date().toISOString()
      };
      
      if (axeResults.violations.length === 0) {
        this.results.passed.push(pageResults);
        console.log(`✅ ${testName}: No accessibility violations found`);
      } else {
        this.results.failed.push(pageResults);
        console.log(`❌ ${testName}: ${axeResults.violations.length} violations found`);
        
        // Log violations
        axeResults.violations.forEach(violation => {
          console.log(`   - ${violation.id}: ${violation.description}`);
          console.log(`     Impact: ${violation.impact}`);
          console.log(`     Nodes: ${violation.nodes.length}`);
        });
      }
      
      // Test specific accessibility features
      await this.testKeyboardNavigation(testName);
      await this.testColorContrast(testName);
      await this.testScreenReaderContent(testName);
      
      return pageResults;
      
    } catch (error) {
      console.error(`Error testing ${testName}:`, error);
      throw error;
    }
  }
  
  async testKeyboardNavigation(testName) {
    try {
      console.log(`  Testing keyboard navigation for ${testName}`);
      
      // Focus on first focusable element
      await this.page.keyboard.press('Tab');
      
      // Track focus path
      const focusPath = [];
      let previousElement = null;
      
      for (let i = 0; i < 20; i++) { // Test first 20 tab stops
        const currentElement = await this.page.evaluate(() => {
          const focused = document.activeElement;
          return focused ? {
            tagName: focused.tagName,
            id: focused.id,
            className: focused.className,
            ariaLabel: focused.getAttribute('aria-label'),
            href: focused.href || null
          } : null;
        });
        
        if (currentElement && JSON.stringify(currentElement) !== JSON.stringify(previousElement)) {
          focusPath.push(currentElement);
          previousElement = currentElement;
        }
        
        await this.page.keyboard.press('Tab');
      }
      
      console.log(`    Keyboard navigation path: ${focusPath.length} focusable elements`);
      
      // Test Enter key activation on buttons and links
      const interactiveElements = await this.page.$$eval('button, a, input[type="button"], [role="button"]', elements => {
        return elements.slice(0, 5).map(el => ({
          tagName: el.tagName,
          id: el.id,
          text: el.textContent.trim().substring(0, 30)
        }));
      });
      
      for (const element of interactiveElements) {
        try {
          await this.page.focus(`${element.tagName}${element.id ? '#' + element.id : ''}`);
          // Note: We don't actually press Enter to avoid navigation during testing
        } catch (e) {
          // Element might not be focusable
        }
      }
      
    } catch (error) {
      console.error(`    Keyboard navigation test failed for ${testName}:`, error.message);
    }
  }
  
  async testColorContrast(testName) {
    try {
      console.log(`  Testing color contrast for ${testName}`);
      
      // Get text elements and their computed styles
      const contrastIssues = await this.page.evaluate(() => {
        const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, button, a, label');
        const issues = [];
        
        function getRGBValues(color) {
          const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
        }
        
        function getLuminance(r, g, b) {
          const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        }
        
        function getContrastRatio(color1, color2) {
          const lum1 = getLuminance(...color1);
          const lum2 = getLuminance(...color2);
          const brightest = Math.max(lum1, lum2);
          const darkest = Math.min(lum1, lum2);
          return (brightest + 0.05) / (darkest + 0.05);
        }
        
        for (let i = 0; i < Math.min(textElements.length, 50); i++) {
          const element = textElements[i];
          const computedStyle = window.getComputedStyle(element);
          const color = computedStyle.color;
          const backgroundColor = computedStyle.backgroundColor;
          
          const colorRGB = getRGBValues(color);
          const backgroundRGB = getRGBValues(backgroundColor);
          
          if (colorRGB && backgroundRGB) {
            const contrast = getContrastRatio(colorRGB, backgroundRGB);
            const fontSize = parseFloat(computedStyle.fontSize);
            const isLargeText = fontSize >= 18 || (fontSize >= 14 && computedStyle.fontWeight >= 700);
            const minRatio = isLargeText ? 3 : 4.5;
            
            if (contrast < minRatio) {
              issues.push({
                element: element.tagName.toLowerCase() + (element.id ? '#' + element.id : ''),
                contrast: contrast.toFixed(2),
                required: minRatio,
                fontSize: fontSize,
                isLargeText: isLargeText
              });
            }
          }
        }
        
        return issues;
      });
      
      if (contrastIssues.length > 0) {
        console.log(`    ⚠️  Color contrast issues found: ${contrastIssues.length}`);
        contrastIssues.slice(0, 5).forEach(issue => {
          console.log(`      ${issue.element}: ${issue.contrast}:1 (required: ${issue.required}:1)`);
        });
      } else {
        console.log(`    ✅ Color contrast: No issues found`);
      }
      
    } catch (error) {
      console.error(`    Color contrast test failed for ${testName}:`, error.message);
    }
  }
  
  async testScreenReaderContent(testName) {
    try {
      console.log(`  Testing screen reader content for ${testName}`);
      
      // Check for proper heading hierarchy
      const headingHierarchy = await this.page.$$eval('h1, h2, h3, h4, h5, h6', headings => {
        return headings.map(h => ({
          level: parseInt(h.tagName.charAt(1)),
          text: h.textContent.trim().substring(0, 50),
          hasContent: h.textContent.trim().length > 0
        }));
      });
      
      // Validate heading structure
      let headingIssues = 0;
      for (let i = 1; i < headingHierarchy.length; i++) {
        const current = headingHierarchy[i];
        const previous = headingHierarchy[i - 1];
        
        if (current.level - previous.level > 1) {
          headingIssues++;
        }
        
        if (!current.hasContent) {
          headingIssues++;
        }
      }
      
      console.log(`    Heading structure: ${headingIssues === 0 ? '✅' : '⚠️'} ${headingHierarchy.length} headings, ${headingIssues} issues`);
      
      // Check for alt text on images
      const imageIssues = await this.page.$$eval('img', images => {
        return images.filter(img => !img.alt || img.alt.trim() === '').length;
      });
      
      console.log(`    Image alt text: ${imageIssues === 0 ? '✅' : '⚠️'} ${imageIssues} images missing alt text`);
      
      // Check for form labels
      const formIssues = await this.page.evaluate(() => {
        const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
        let unlabeled = 0;
        
        inputs.forEach(input => {
          const hasLabel = input.labels && input.labels.length > 0;
          const hasAriaLabel = input.getAttribute('aria-label');
          const hasAriaLabelledBy = input.getAttribute('aria-labelledby');
          
          if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
            unlabeled++;
          }
        });
        
        return {
          total: inputs.length,
          unlabeled: unlabeled
        };
      });
      
      console.log(`    Form labels: ${formIssues.unlabeled === 0 ? '✅' : '⚠️'} ${formIssues.unlabeled}/${formIssues.total} inputs unlabeled`);
      
      // Check for semantic landmarks
      const landmarks = await this.page.$$eval('[role], main, nav, aside, header, footer', elements => {
        return elements.map(el => el.tagName.toLowerCase() + (el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''));
      });
      
      console.log(`    Semantic landmarks: ${landmarks.length > 0 ? '✅' : '⚠️'} ${landmarks.length} landmarks found`);
      
    } catch (error) {
      console.error(`    Screen reader content test failed for ${testName}:`, error.message);
    }
  }
  
  async runFullAudit(baseUrl = 'http://localhost:3000') {
    console.log('Starting comprehensive accessibility audit...\n');
    
    await this.setup();
    
    const testPages = [
      { url: `${baseUrl}/admin/login`, name: 'Admin Login' },
      { url: `${baseUrl}/admin/dashboard`, name: 'Admin Dashboard' },
      { url: `${baseUrl}/admin/users`, name: 'User Management' },
      { url: `${baseUrl}/admin/appointments`, name: 'Appointment Management' },
      { url: `${baseUrl}/admin/settings`, name: 'System Settings' },
      { url: `${baseUrl}/admin/reports`, name: 'Reports' }
    ];
    
    // Test each page
    for (const testPage of testPages) {
      try {
        await this.testPage(testPage.url, testPage.name);
      } catch (error) {
        console.error(`Failed to test ${testPage.name}:`, error.message);
      }
    }
    
    await this.teardown();
    
    // Generate summary
    this.generateSummary();
    this.generateReport();
    
    return this.results;
  }
  
  generateSummary() {
    const totalPages = this.results.passed.length + this.results.failed.length;
    const passRate = totalPages > 0 ? (this.results.passed.length / totalPages * 100).toFixed(1) : 0;
    
    this.results.summary = {
      totalPages: totalPages,
      passedPages: this.results.passed.length,
      failedPages: this.results.failed.length,
      passRate: `${passRate}%`,
      totalViolations: this.results.failed.reduce((sum, page) => sum + page.violations.length, 0)
    };
    
    console.log('\n=== ACCESSIBILITY AUDIT SUMMARY ===');
    console.log(`Total pages tested: ${this.results.summary.totalPages}`);
    console.log(`Pages passed: ${this.results.summary.passedPages}`);
    console.log(`Pages failed: ${this.results.summary.failedPages}`);
    console.log(`Pass rate: ${this.results.summary.passRate}`);
    console.log(`Total violations: ${this.results.summary.totalViolations}`);
  }
  
  generateReport() {
    const fs = require('fs');
    const reportPath = 'tests/reports/accessibility-report.json';
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`\nDetailed report saved to: ${reportPath}`);
    } catch (error) {
      console.error('Failed to save accessibility report:', error.message);
    }
  }
}

// Run the audit if this file is executed directly
if (require.main === module) {
  const tester = new AccessibilityTester();
  tester.runFullAudit()
    .then(results => {
      process.exit(results.summary.failedPages > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Accessibility audit failed:', error);
      process.exit(1);
    });
}

module.exports = AccessibilityTester;