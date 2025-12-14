/**
 * End-to-End Tests for Bulk Upload Feature
 * Tests template generation, Excel parsing, and validation
 */

const BulkUploadService = require('../src/services/BulkUploadService');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const service = new BulkUploadService();

console.log('='.repeat(60));
console.log('BULK UPLOAD E2E TESTS');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

// Helper to create Excel buffer from data
function createExcelBuffer(headers, rows) {
  const workbook = XLSX.utils.book_new();
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// ============================================================
// TEST 1: Template Generation
// ============================================================
console.log('\n--- TEST 1: Template Generation ---');

test('Template generates valid Excel buffer', () => {
  const buffer = service.getTemplateBuffer();
  assertTrue(Buffer.isBuffer(buffer), 'Should return a buffer');
  assertTrue(buffer.length > 0, 'Buffer should not be empty');
});

test('Template has correct structure (1 header + 20 empty rows)', () => {
  const buffer = service.getTemplateBuffer();
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  assertEqual(data.length, 21, 'Should have 21 rows (1 header + 20 data)');
  assertEqual(data[0].length, 13, 'Header should have 13 columns');
  assertEqual(data[0][0], 'First Name', 'First column should be First Name');
});

// ============================================================
// TEST 2: Valid Data - 3 Customers
// ============================================================
console.log('\n--- TEST 2: Valid Data - 3 Customers ---');

test('Parse 3 valid customers', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [
    ['John', 'Michael', 'Smith', '01/15/1990', '123', 'Unit 4B', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', ''],
    ['Jane', '', 'Doe', '03/22/1985', '456', '', 'Oak Avenue', 'Vancouver', 'BC', 'V6B 1K3', '', '', ''],
    ['Robert', 'James', 'Brown', '11/30/1978', '789', 'Apt 12', 'Elm Street', 'Calgary', 'AB', 'T2P 0A1', 'A1234-56789-00', '06/15/2019', '06/15/2024'],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''], // Empty row - should be skipped
    ['', '', '', '', '', '', '', '', '', '', '', '', ''], // Empty row - should be skipped
  ];

  const buffer = createExcelBuffer(headers, rows);
  const result = service.parseExcelFile(buffer);

  assertTrue(result.success, 'Parsing should succeed');
  assertEqual(result.totalRows, 3, 'Should find 3 data rows (empty rows skipped)');
});

test('Validate 3 valid customers', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [
    ['John', 'Michael', 'Smith', '01/15/1990', '123', 'Unit 4B', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', ''],
    ['Jane', '', 'Doe', '03/22/1985', '456', '', 'Oak Avenue', 'Vancouver', 'BC', 'V6B 1K3', '', '', ''],
    ['Robert', 'James', 'Brown', '11/30/1978', '789', 'Apt 12', 'Elm Street', 'Calgary', 'AB', 'T2P 0A1', 'A1234-56789-00', '06/15/2019', '06/15/2024'],
  ];

  const buffer = createExcelBuffer(headers, rows);
  const parseResult = service.parseExcelFile(buffer);
  const validationResult = service.validateAllRows(parseResult.registrations);

  assertEqual(validationResult.validCount, 3, 'All 3 should be valid');
  assertEqual(validationResult.invalidCount, 0, 'None should be invalid');
});

// ============================================================
// TEST 3: Mixed Valid/Invalid Data
// ============================================================
console.log('\n--- TEST 3: Mixed Valid/Invalid Data ---');

test('Parse and validate mixed data (2 valid, 2 invalid)', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [
    ['John', '', 'Smith', '01/15/1990', '123', '', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', ''], // Valid
    ['Jane', '', '', '03/22/1985', '456', '', 'Oak Avenue', 'Vancouver', 'BC', 'V6B 1K3', '', '', ''], // Invalid - no last name
    ['Robert', '', 'Brown', '11/30/1978', '789', '', 'Elm Street', 'Calgary', 'AB', 'T2P 0A1', '', '', ''], // Valid
    ['Sarah', '', 'Wilson', 'invalid-date', '321', '', 'Pine Road', 'Ottawa', 'ON', 'K1A 0B1', '', '', ''], // Invalid - bad date
  ];

  const buffer = createExcelBuffer(headers, rows);
  const parseResult = service.parseExcelFile(buffer);
  const validationResult = service.validateAllRows(parseResult.registrations);

  assertEqual(parseResult.totalRows, 4, 'Should parse 4 rows');
  assertEqual(validationResult.validCount, 2, 'Should have 2 valid');
  assertEqual(validationResult.invalidCount, 2, 'Should have 2 invalid');
});

// ============================================================
// TEST 4: All Empty Rows
// ============================================================
console.log('\n--- TEST 4: All Empty Rows ---');

test('Reject file with all empty rows', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const buffer = createExcelBuffer(headers, rows);
  const result = service.parseExcelFile(buffer);

  assertTrue(!result.success, 'Parsing should fail');
  assertTrue(result.error.includes('No data rows'), 'Error should mention no data');
});

// ============================================================
// TEST 5: Maximum 20 Customers
// ============================================================
console.log('\n--- TEST 5: Maximum 20 Customers ---');

test('Accept exactly 20 customers', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [];
  for (let i = 1; i <= 20; i++) {
    rows.push([`Customer${i}`, '', `Last${i}`, '01/15/1990', `${i}00`, '', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', '']);
  }

  const buffer = createExcelBuffer(headers, rows);
  const result = service.parseExcelFile(buffer);

  assertTrue(result.success, 'Parsing should succeed');
  assertEqual(result.totalRows, 20, 'Should have 20 rows');
});

test('Reject more than 20 customers', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [];
  for (let i = 1; i <= 25; i++) {
    rows.push([`Customer${i}`, '', `Last${i}`, '01/15/1990', `${i}00`, '', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', '']);
  }

  const buffer = createExcelBuffer(headers, rows);
  const result = service.parseExcelFile(buffer);

  assertTrue(!result.success, 'Parsing should fail');
  assertTrue(result.error.includes('Too many rows'), 'Error should mention too many rows');
});

// ============================================================
// TEST 6: Missing Required Columns
// ============================================================
console.log('\n--- TEST 6: Missing Required Columns ---');

test('Reject file with missing required columns', () => {
  const headers = ['First Name', 'Last Name', 'Date of Birth']; // Missing many required columns
  const rows = [
    ['John', 'Smith', '01/15/1990'],
  ];

  const buffer = createExcelBuffer(headers, rows);
  const result = service.parseExcelFile(buffer);

  assertTrue(!result.success, 'Parsing should fail');
  assertTrue(result.error.includes('Missing required columns'), 'Error should mention missing columns');
});

// ============================================================
// TEST 7: Province Validation
// ============================================================
console.log('\n--- TEST 7: Province Validation ---');

test('Accept valid Canadian provinces', () => {
  const provinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];

  // Test just a few
  const testProvinces = ['ON', 'BC', 'AB', 'QC'];
  const rows = testProvinces.map((prov, i) =>
    [`Test${i}`, '', `User${i}`, '01/15/1990', '123', '', 'Main St', 'City', prov, 'M5V 1A1', '', '', '']
  );

  const buffer = createExcelBuffer(headers, rows);
  const parseResult = service.parseExcelFile(buffer);
  const validationResult = service.validateAllRows(parseResult.registrations);

  assertEqual(validationResult.validCount, 4, 'All 4 should be valid');
});

// ============================================================
// TEST 8: Summary Generation
// ============================================================
console.log('\n--- TEST 8: Summary Generation ---');

test('Generate valid summary', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [
    ['John', 'Michael', 'Smith', '01/15/1990', '123', '', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', ''],
    ['Jane', '', 'Doe', '03/22/1985', '456', '', 'Oak Avenue', 'Vancouver', 'BC', 'V6B 1K3', '', '', ''],
  ];

  const buffer = createExcelBuffer(headers, rows);
  const parseResult = service.parseExcelFile(buffer);
  const validationResult = service.validateAllRows(parseResult.registrations);
  const summary = service.generateValidSummary(validationResult.valid);

  assertTrue(summary.includes('John Smith'), 'Summary should include John Smith');
  assertTrue(summary.includes('Jane Doe'), 'Summary should include Jane Doe');
  assertTrue(summary.includes('Ready to book'), 'Summary should have ready message');
});

test('Generate error report', () => {
  const headers = ['First Name', 'Middle Name', 'Last Name', 'Date of Birth', 'Street Number', 'Suite/Unit', 'Street Address', 'City', 'Province', 'Postal Code', "Driver's License #", 'DL Issue Date', 'DL Expiry Date'];
  const rows = [
    ['John', '', '', '01/15/1990', '123', '', 'Main Street', 'Toronto', 'ON', 'M5V 1A1', '', '', ''], // Missing last name
  ];

  const buffer = createExcelBuffer(headers, rows);
  const parseResult = service.parseExcelFile(buffer);
  const validationResult = service.validateAllRows(parseResult.registrations);
  const errorReport = service.generateErrorReport(validationResult.invalid);

  assertTrue(errorReport.includes('Validation Errors'), 'Error report should have header');
  assertTrue(errorReport.includes('Row'), 'Error report should reference row');
});

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
