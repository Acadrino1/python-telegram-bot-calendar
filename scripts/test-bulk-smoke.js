/**
 * Smoke test for bulk upload parsing
 * Tests that the BulkUploadService correctly parses the TXT file
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const BulkUploadService = require('../src/services/BulkUploadService');

async function testBulkUpload() {
  console.log('🧪 Testing Bulk Upload Service...\n');

  const bulkService = new BulkUploadService();

  // Read test file
  const testFilePath = path.join(__dirname, 'test-bulk-upload.txt');
  const fileBuffer = fs.readFileSync(testFilePath);

  console.log('📄 Test file contents:');
  console.log('─'.repeat(50));
  console.log(fileBuffer.toString());
  console.log('─'.repeat(50));
  console.log();

  // Parse the file
  console.log('📊 Parsing file...');
  const parseResult = bulkService.parseTextFile(fileBuffer);

  if (!parseResult.success) {
    console.error('❌ Parse failed:', parseResult.error);
    return;
  }

  console.log(`✅ Parsed ${parseResult.totalRows} customers successfully\n`);

  // Show parsed data
  console.log('📋 Parsed registrations:');
  parseResult.registrations.forEach((reg, i) => {
    console.log(`\n${i + 1}. ${reg.firstName} ${reg.lastName}`);
    console.log(`   DOB: ${reg.dateOfBirth}`);
    console.log(`   Address: ${reg.streetNumber} ${reg.streetAddress}, ${reg.city}, ${reg.province} ${reg.postalCode}`);
    if (reg.driverLicense && reg.driverLicense !== 'skip') {
      console.log(`   DL: ${reg.driverLicense}`);
    }
  });

  // Validate all rows
  console.log('\n📝 Validating registrations...');
  const validation = bulkService.validateAllRows(parseResult.registrations);

  console.log(`\n✅ Valid: ${validation.validCount}`);
  console.log(`❌ Invalid: ${validation.invalidCount}`);

  if (validation.invalidCount > 0) {
    console.log('\n❌ Validation Errors:');
    validation.invalid.forEach(err => {
      console.log(`   Line ${err.row} (${err.name}): ${err.errors.join(', ')}`);
    });
  }

  if (validation.validCount > 0) {
    console.log('\n✅ Valid customers ready for booking:');
    validation.valid.forEach((reg, i) => {
      console.log(`   ${i + 1}. ${reg.displayName}`);
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Bulk upload parsing test complete!');
  console.log('\nTo test the full flow:');
  console.log('1. Open Telegram and message your bot');
  console.log('2. Use /book -> Lodge Mobile: New Registration -> Bulk Upload');
  console.log('3. Upload the test file: scripts/test-bulk-upload.txt');
  console.log('4. The bot will parse it and show the customers');
  console.log('5. Confirm to start booking appointments');
}

testBulkUpload().catch(console.error);
