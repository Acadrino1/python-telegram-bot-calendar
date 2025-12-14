const fs = require('fs').promises;
const path = require('path');

describe('Test Coverage Analysis', () => {
  let sourceFiles = [];
  let testFiles = [];

  beforeAll(async () => {
    // Scan source files
    sourceFiles = await scanDirectory('src', '.js');
    testFiles = await scanDirectory('tests', '.test.js');
  });

  describe('Coverage Analysis', () => {
    test('should identify untested source files', async () => {
      const untestedFiles = [];
      
      for (const sourceFile of sourceFiles) {
        const relativePath = sourceFile.replace(/^src\//, '');
        const testPath = `tests/unit/${relativePath.replace('.js', '.test.js')}`;
        
        try {
          await fs.access(testPath);
        } catch {
          untestedFiles.push(sourceFile);
        }
      }

      console.log('Untested files:', untestedFiles);
      
      // Report but don't fail if we're building test coverage
      if (untestedFiles.length > 0) {
        console.warn(`${untestedFiles.length} source files lack unit tests`);
      }
    });

    test('should identify critical functions without tests', async () => {
      const criticalPatterns = [
        /class\s+\w+Controller/,
        /class\s+\w+Service/,
        /class\s+\w+Model/,
        /exports?\.\w+\s*=.*function/,
        /async\s+function\s+\w+/
      ];

      const untestedCriticalFunctions = [];

      for (const sourceFile of sourceFiles) {
        if (sourceFile.includes('test') || sourceFile.includes('spec')) continue;
        
        try {
          const content = await fs.readFile(sourceFile, 'utf8');
          
          for (const pattern of criticalPatterns) {
            if (pattern.test(content)) {
              const hasTest = await hasCorrespondingTest(sourceFile);
              if (!hasTest) {
                untestedCriticalFunctions.push({
                  file: sourceFile,
                  pattern: pattern.toString()
                });
              }
            }
          }
        } catch (error) {
          console.warn(`Could not analyze ${sourceFile}: ${error.message}`);
        }
      }

      console.log('Critical functions without tests:', untestedCriticalFunctions);
    });

    test('should analyze test quality metrics', async () => {
      const testMetrics = {
        totalTests: testFiles.length,
        hasSetup: 0,
        hasTeardown: 0,
        hasMocks: 0,
        hasErrorHandling: 0,
        hasEdgeCases: 0,
        hasAsyncTests: 0
      };

      for (const testFile of testFiles) {
        try {
          const content = await fs.readFile(testFile, 'utf8');
          
          if (/beforeAll|beforeEach/.test(content)) testMetrics.hasSetup++;
          if (/afterAll|afterEach/.test(content)) testMetrics.hasTeardown++;
          if (/jest\.mock|sinon|stub|spy/.test(content)) testMetrics.hasMocks++;
          if (/expect.*toThrow|catch.*error/i.test(content)) testMetrics.hasErrorHandling++;
          if (/edge|boundary|limit|null|undefined|empty/i.test(content)) testMetrics.hasEdgeCases++;
          if (/async.*test|await.*expect/.test(content)) testMetrics.hasAsyncTests++;
        } catch (error) {
          console.warn(`Could not analyze test file ${testFile}: ${error.message}`);
        }
      }

      console.log('Test Quality Metrics:', testMetrics);
      
      // Quality thresholds
      expect(testMetrics.totalTests).toBeGreaterThan(0);
      
      if (testMetrics.totalTests > 0) {
        const setupRatio = testMetrics.hasSetup / testMetrics.totalTests;
        const mockRatio = testMetrics.hasMocks / testMetrics.totalTests;
        const errorHandlingRatio = testMetrics.hasErrorHandling / testMetrics.totalTests;
        
        console.log(`Setup/Teardown coverage: ${(setupRatio * 100).toFixed(1)}%`);
        console.log(`Mocking usage: ${(mockRatio * 100).toFixed(1)}%`);
        console.log(`Error handling tests: ${(errorHandlingRatio * 100).toFixed(1)}%`);
      }
    });

    test('should check for test isolation', async () => {
      const isolationIssues = [];

      for (const testFile of testFiles) {
        try {
          const content = await fs.readFile(testFile, 'utf8');
          
          // Check for potential isolation issues
          if (content.includes('console.log') && !content.includes('jest.mock')) {
            isolationIssues.push(`${testFile}: Contains console.log without mocking`);
          }
          
          if (content.includes('process.env') && !content.includes('beforeEach')) {
            isolationIssues.push(`${testFile}: Modifies process.env without cleanup`);
          }
          
          if (content.includes('require(') && content.includes('delete require.cache')) {
            isolationIssues.push(`${testFile}: Manual require cache manipulation`);
          }
        } catch (error) {
          console.warn(`Could not analyze isolation for ${testFile}: ${error.message}`);
        }
      }

      if (isolationIssues.length > 0) {
        console.warn('Test isolation issues found:', isolationIssues);
      }
    });

    test('should validate mock usage patterns', async () => {
      const mockingPatterns = [];

      for (const testFile of testFiles) {
        try {
          const content = await fs.readFile(testFile, 'utf8');
          
          // Check for proper mocking patterns
          if (content.includes('jest.mock') && !content.includes('jest.clearAllMocks')) {
            mockingPatterns.push(`${testFile}: Uses mocks but doesn't clear them`);
          }
          
          if (content.includes('mockResolvedValue') && !content.includes('async')) {
            mockingPatterns.push(`${testFile}: Mocks async functions in sync tests`);
          }
          
          if (content.includes('toHaveBeenCalled') && !content.includes('beforeEach')) {
            mockingPatterns.push(`${testFile}: Checks mock calls without proper setup`);
          }
        } catch (error) {
          console.warn(`Could not analyze mocking patterns for ${testFile}: ${error.message}`);
        }
      }

      console.log('Mock usage analysis:', mockingPatterns);
    });
  });

  describe('Performance Test Analysis', () => {
    test('should identify missing performance tests', async () => {
      const performanceCriticalFiles = sourceFiles.filter(file => 
        file.includes('Service') || 
        file.includes('Controller') || 
        file.includes('booking') ||
        file.includes('notification')
      );

      const missingPerformanceTests = [];

      for (const criticalFile of performanceCriticalFiles) {
        try {
          const testPath = criticalFile.replace('src/', 'tests/unit/').replace('.js', '.test.js');
          const content = await fs.readFile(testPath, 'utf8');
          
          if (!content.includes('performance') && 
              !content.includes('concurrent') && 
              !content.includes('load') &&
              !content.includes('timeout')) {
            missingPerformanceTests.push(criticalFile);
          }
        } catch {
          missingPerformanceTests.push(criticalFile);
        }
      }

      console.log('Files missing performance tests:', missingPerformanceTests);
    });
  });
});

// Helper functions
async function scanDirectory(dir, extension) {
  const files = [];
  
  async function scan(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory() && !entry.name.includes('node_modules')) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
    }
  }
  
  await scan(dir);
  return files;
}

async function hasCorrespondingTest(sourceFile) {
  const testPath = sourceFile
    .replace('src/', 'tests/unit/')
    .replace('.js', '.test.js');
  
  try {
    await fs.access(testPath);
    return true;
  } catch {
    return false;
  }
}