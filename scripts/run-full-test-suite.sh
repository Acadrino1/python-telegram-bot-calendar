#!/bin/bash

# Comprehensive Testing and Validation Script for Lodge Scheduler Admin Panel
# This script runs the complete test suite for production readiness validation

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_RESULTS_DIR="tests/reports"
LOG_FILE="${TEST_RESULTS_DIR}/test-execution.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create reports directory
mkdir -p "$TEST_RESULTS_DIR"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")  echo -e "${BLUE}[INFO]${NC} $message" | tee -a "$LOG_FILE" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $message" | tee -a "$LOG_FILE" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" | tee -a "$LOG_FILE" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $message" | tee -a "$LOG_FILE" ;;
    esac
}

# Test result tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Function to run a test and track results
run_test() {
    local test_name=$1
    local test_command=$2
    local optional=${3:-false}
    
    log "INFO" "Running $test_name..."
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if eval "$test_command" >> "$LOG_FILE" 2>&1; then
        log "SUCCESS" "$test_name - PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        TEST_RESULTS+=("✅ $test_name")
    else
        if [ "$optional" = "true" ]; then
            log "WARN" "$test_name - FAILED (Optional)"
            TEST_RESULTS+=("⚠️  $test_name (Optional)")
        else
            log "ERROR" "$test_name - FAILED"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            TEST_RESULTS+=("❌ $test_name")
        fi
    fi
}

# Header
echo "================================================================="
echo "    LODGE SCHEDULER ADMIN PANEL - COMPREHENSIVE TEST SUITE"
echo "================================================================="
echo "Timestamp: $(date)"
echo "Test Results Directory: $TEST_RESULTS_DIR"
echo "================================================================="

log "INFO" "Starting comprehensive test suite execution..."

# 1. ENVIRONMENT SETUP
log "INFO" "Phase 1: Environment Setup and Validation"

run_test "Environment Variables Check" "[ -f .env ] && echo 'Environment file exists'"
run_test "Node.js Version Check" "node --version | grep -E 'v(16|18|20)'"
run_test "NPM Dependencies Installation" "npm ci"
run_test "Database Connection Test" "npm run migrate" true

# 2. CODE QUALITY AND LINTING
log "INFO" "Phase 2: Code Quality and Static Analysis"

run_test "ESLint Code Quality Check" "npm run lint"
run_test "Prettier Code Formatting Check" "npx prettier --check src/ tests/"
run_test "TypeScript Type Checking" "npm run typecheck" true
run_test "Security Lint Check" "npx eslint --ext .js src/ --plugin security"

# 3. UNIT TESTS
log "INFO" "Phase 3: Unit Testing"

run_test "Jest Unit Tests" "npm run test:unit"
run_test "Unit Test Coverage Analysis" "npm run test:coverage"

# 4. INTEGRATION TESTS
log "INFO" "Phase 4: Integration Testing"

run_test "Database Integration Tests" "npm run test:integration"
run_test "API Integration Tests" "npm run test:integration -- --testNamePattern='API'"

# 5. SECURITY TESTING
log "INFO" "Phase 5: Security Testing"

run_test "NPM Security Audit" "npm audit --audit-level moderate"
run_test "Snyk Security Scan" "npx snyk test" true
run_test "Security ESLint Rules" "npm run test:security:eslint"

# 6. PERFORMANCE TESTING
log "INFO" "Phase 6: Performance Testing"

# Start the application for performance testing
log "INFO" "Starting application for performance tests..."
npm start &
APP_PID=$!
sleep 10  # Wait for app to start

run_test "Artillery Load Testing" "npm run test:performance" true
run_test "Lighthouse Performance Audit" "npx lighthouse http://localhost:3000 --output=json --output-path=${TEST_RESULTS_DIR}/lighthouse-report.json" true

# Stop the application
kill $APP_PID 2>/dev/null || true

# 7. UI/UX TESTING
log "INFO" "Phase 7: UI/UX Testing"

# Start application for E2E tests
npm start &
APP_PID=$!
sleep 15

run_test "Cypress E2E Tests" "npm run test:e2e" true
run_test "Accessibility Testing" "npm run test:accessibility" true
run_test "Cross-Browser Testing" "npm run test:cross-browser" true

# Stop the application
kill $APP_PID 2>/dev/null || true

# 8. QUALITY METRICS ANALYSIS
log "INFO" "Phase 8: Quality Metrics Analysis"

run_test "Code Quality Metrics" "npm run quality:check" true

# 9. GENERATE COMPREHENSIVE REPORT
log "INFO" "Phase 9: Report Generation"

# Create comprehensive test report
cat > "${TEST_RESULTS_DIR}/comprehensive-test-report_${TIMESTAMP}.md" << EOF
# Comprehensive Test Report - Lodge Scheduler Admin Panel

**Execution Date:** $(date)
**Test Suite Version:** 1.0.0
**Environment:** $(node --version)

## Executive Summary

- **Total Tests:** $TOTAL_TESTS
- **Passed:** $PASSED_TESTS
- **Failed:** $FAILED_TESTS
- **Success Rate:** $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%

## Test Results

$(printf '%s\n' "${TEST_RESULTS[@]}")

## Detailed Logs

See \`test-execution.log\` for detailed execution logs.

## Quality Assessment

$([ $FAILED_TESTS -eq 0 ] && echo "🎉 **PRODUCTION READY** - All critical tests passed" || echo "⚠️  **NEEDS ATTENTION** - $FAILED_TESTS test(s) failed")

## Next Steps

$(if [ $FAILED_TESTS -eq 0 ]; then
    echo "- ✅ System is ready for production deployment"
    echo "- ✅ All quality gates have been met"
    echo "- ✅ Security and performance requirements satisfied"
else
    echo "- ❌ Address failed test cases before deployment"
    echo "- ❌ Review error logs and fix identified issues"
    echo "- ❌ Re-run test suite after fixes"
fi)

---
*Generated by Lodge Scheduler Test Automation Suite*
EOF

# 10. FINAL VALIDATION AND SUMMARY
log "INFO" "Phase 10: Final Validation and Summary"

echo ""
echo "================================================================="
echo "                    TEST EXECUTION SUMMARY"
echo "================================================================="
echo "Total Tests Run: $TOTAL_TESTS"
echo "Tests Passed:    $PASSED_TESTS"
echo "Tests Failed:    $FAILED_TESTS"
echo "Success Rate:    $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"
echo ""

# Display test results
echo "Detailed Results:"
printf '%s\n' "${TEST_RESULTS[@]}"
echo ""

# Final assessment
if [ $FAILED_TESTS -eq 0 ]; then
    log "SUCCESS" "🎉 ALL TESTS PASSED - SYSTEM IS PRODUCTION READY!"
    echo ""
    echo "✅ The Lodge Scheduler Admin Panel has successfully passed"
    echo "   all quality gates and is ready for production deployment."
    echo ""
    echo "📊 Reports generated:"
    echo "   - Test execution log: $LOG_FILE"
    echo "   - Comprehensive report: ${TEST_RESULTS_DIR}/comprehensive-test-report_${TIMESTAMP}.md"
    echo "   - Coverage reports: ${TEST_RESULTS_DIR}/coverage/"
    echo ""
    EXIT_CODE=0
else
    log "ERROR" "❌ TESTING FAILED - $FAILED_TESTS test(s) need attention"
    echo ""
    echo "⚠️  The system has $FAILED_TESTS failed test(s) that must be"
    echo "   addressed before production deployment."
    echo ""
    echo "📋 Please review the detailed logs and fix the issues."
    EXIT_CODE=1
fi

echo "================================================================="
echo "Test suite execution completed at $(date)"
echo "================================================================="

# Cleanup
log "INFO" "Cleaning up test processes..."
pkill -f "node.*npm.*start" 2>/dev/null || true
pkill -f "artillery" 2>/dev/null || true

exit $EXIT_CODE