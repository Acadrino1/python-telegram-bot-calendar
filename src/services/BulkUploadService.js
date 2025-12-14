const path = require('path');
const fs = require('fs');
const CustomerRegistrationService = require('./CustomerRegistrationService');

/**
 * BulkUploadService - Handles bulk customer registration via TXT files
 *
 * Format: Pipe-delimited (|) text file
 * Each line is one customer registration
 */
class BulkUploadService {
  constructor() {
    this.customerService = new CustomerRegistrationService();
    this.maxRows = 20;

    // Field order in the TXT file (pipe-delimited)
    // Matches the 13-step registration form order
    this.fieldOrder = [
      'firstName',
      'middleName',
      'lastName',
      'dateOfBirth',
      'suiteUnit',
      'streetNumber',
      'streetAddress',
      'city',
      'province',
      'postalCode',
      'driverLicense',
      'dlIssued',
      'dlExpiry'
    ];

    this.fieldLabels = {
      firstName: 'First Name',
      middleName: 'Middle Name (or SKIP)',
      lastName: 'Last Name',
      dateOfBirth: 'Date of Birth (MM/DD/YYYY)',
      streetNumber: 'Street Number',
      suiteUnit: 'Suite/Unit (or SKIP)',
      streetAddress: 'Street Name',
      city: 'City',
      province: 'Province (2-letter code)',
      postalCode: 'Postal Code',
      driverLicense: "Driver's License # (or SKIP)",
      dlIssued: 'DL Issue Date (or SKIP)',
      dlExpiry: 'DL Expiry Date (or SKIP)'
    };

    this.requiredFields = [
      'firstName',
      'lastName',
      'dateOfBirth',
      'streetNumber',
      'streetAddress',
      'city',
      'province',
      'postalCode'
    ];
  }

  /**
   * Parse TXT file buffer and extract rows
   * Format: pipe-delimited, one customer per line
   */
  parseTextFile(buffer) {
    try {
      const content = buffer.toString('utf-8');
      const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

      if (lines.length === 0) {
        return {
          success: false,
          error: 'File is empty'
        };
      }

      // Check if first line is header (contains field names)
      const firstLine = lines[0].toLowerCase();
      let dataStartIndex = 0;

      // Skip header line if it looks like one
      if (firstLine.includes('first name') || firstLine.includes('firstname') ||
          firstLine.startsWith('#') || firstLine.startsWith('//')) {
        dataStartIndex = 1;
      }

      const dataLines = lines.slice(dataStartIndex).filter(line => {
        // Skip comment lines
        if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
          return false;
        }
        // Skip lines that look like instructions
        if (line.toLowerCase().includes('instructions') ||
            line.toLowerCase().includes('example') ||
            line.toLowerCase().includes('fill in')) {
          return false;
        }
        return true;
      });

      if (dataLines.length === 0) {
        return {
          success: false,
          error: 'No customer data found in file. Make sure to fill in at least one line.'
        };
      }

      if (dataLines.length > this.maxRows) {
        return {
          success: false,
          error: `Too many customers. Maximum allowed: ${this.maxRows}, found: ${dataLines.length}`
        };
      }

      // Parse each line
      const registrations = [];
      const parseErrors = [];

      dataLines.forEach((line, index) => {
        const lineNum = dataStartIndex + index + 1;
        const fields = line.split('|').map(f => f.trim());

        if (fields.length < 8) {
          parseErrors.push({
            line: lineNum,
            error: `Not enough fields. Expected at least 8, found ${fields.length}. Make sure to use | as separator.`
          });
          return;
        }

        const data = {};
        this.fieldOrder.forEach((fieldKey, fieldIndex) => {
          let value = fields[fieldIndex] || '';
          // Normalize SKIP values
          if (value.toLowerCase() === 'skip' || value === '-' || value === 'n/a') {
            value = 'skip';
          }
          // Normalize province to uppercase (ON not on)
          if (fieldKey === 'province' && value !== 'skip') {
            value = value.toUpperCase();
          }
          // Normalize postal code to uppercase
          if (fieldKey === 'postalCode' && value !== 'skip') {
            value = value.toUpperCase();
          }
          data[fieldKey] = value;
        });
        data._rowNumber = lineNum;
        registrations.push(data);
      });

      if (parseErrors.length > 0 && registrations.length === 0) {
        return {
          success: false,
          error: parseErrors.map(e => `Line ${e.line}: ${e.error}`).join('\n')
        };
      }

      return {
        success: true,
        registrations,
        totalRows: registrations.length,
        parseErrors
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse file: ${error.message}`
      };
    }
  }

  /**
   * Main entry point - parse file (supports both TXT and attempts Excel)
   */
  parseFile(buffer, filename = '') {
    // Always use TXT parser now
    return this.parseTextFile(buffer);
  }

  /**
   * Alias for backward compatibility
   */
  parseExcelFile(buffer) {
    return this.parseTextFile(buffer);
  }

  /**
   * Validate all rows and separate valid from invalid
   */
  validateAllRows(registrations) {
    const validRegistrations = [];
    const errors = [];

    registrations.forEach((data) => {
      const rowNum = data._rowNumber;
      const validation = this.customerService.validateRegistration(data);

      if (validation.valid) {
        // Process and format the data
        const processed = this.customerService.processRegistration({ ...data });
        delete processed._rowNumber;
        validRegistrations.push({
          ...processed,
          displayName: `${data.firstName} ${data.lastName}`
        });
      } else {
        errors.push({
          row: rowNum,
          name: `${data.firstName || 'Unknown'} ${data.lastName || ''}`.trim(),
          errors: validation.errors
        });
      }
    });

    return {
      valid: validRegistrations,
      invalid: errors,
      validCount: validRegistrations.length,
      invalidCount: errors.length,
      totalCount: registrations.length
    };
  }

  /**
   * Generate human-readable error report
   */
  generateErrorReport(errors) {
    if (errors.length === 0) return '';

    let report = '❌ *Validation Errors:*\n\n';
    errors.forEach(({ row, name, errors: rowErrors }) => {
      report += `Line ${row} (${name || 'Unknown'}):\n`;
      rowErrors.forEach(err => {
        report += `  • ${err}\n`;
      });
      report += '\n';
    });

    return report.trim();
  }

  /**
   * Generate summary message for valid registrations
   */
  generateValidSummary(validRegistrations) {
    if (validRegistrations.length === 0) return '';

    let summary = '✅ *Ready to book appointments for:*\n\n';
    validRegistrations.forEach((reg, index) => {
      summary += `${index + 1}. ${reg.displayName}\n`;
    });

    return summary.trim();
  }

  /**
   * Create the TXT template content
   */
  createTemplate() {
    const template = `# BULK REGISTRATION TEMPLATE
# ===========================
#
# Instructions:
# 1. Each line below is ONE customer
# 2. Fields are separated by | (pipe character)
# 3. Use SKIP for optional fields you want to leave blank
# 4. Delete these instruction lines and the example
# 5. Save and send this file back to the bot
#
# Field Order:
# First Name | Middle Name | Last Name | Date of Birth | Suite | Street # | Street Name | City | Province | Postal Code | DL # | DL Issued | DL Expiry
#
# Example (delete this line):
# John | Michael | Smith | 01/15/1990 | SKIP | 123 | Main Street | Toronto | ON | M5V 1A1 | D1234-56789-01234 | 01/01/2020 | 01/01/2025
#
# Required fields: First Name, Last Name, DOB, Street #, Street Name, City, Province, Postal Code
# Optional fields (use SKIP): Middle Name, Suite, DL #, DL Issued, DL Expiry
#
# Date format: MM/DD/YYYY
# Province: 2-letter code (ON, BC, AB, QC, etc.)
# Postal Code: X1X 1X1 format
#
# ===========================
# ADD YOUR CUSTOMERS BELOW (one per line):
# ===========================

`;
    return Buffer.from(template, 'utf-8');
  }

  /**
   * Get template file path
   */
  getTemplatePath() {
    return path.join(__dirname, '../../templates/bulk-registration-template.txt');
  }

  /**
   * Save template to file system
   */
  saveTemplate() {
    const templatePath = this.getTemplatePath();
    const templateDir = path.dirname(templatePath);

    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    const buffer = this.createTemplate();
    fs.writeFileSync(templatePath, buffer);

    return templatePath;
  }

  /**
   * Get or create template buffer for sending
   */
  getTemplateBuffer() {
    const templatePath = this.getTemplatePath();

    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath);
    }

    // Create and save template if doesn't exist
    this.saveTemplate();
    return fs.readFileSync(templatePath);
  }

  /**
   * Get template filename for download
   */
  getTemplateFilename() {
    return 'bulk-registration-template.txt';
  }

  /**
   * Create single customer template
   */
  createSingleTemplate() {
    const template = `# ===========================
# SINGLE CUSTOMER REGISTRATION TEMPLATE
# ===========================
#
# Fill in ONE customer's information below
# Use | (pipe) as separator between fields
# Use SKIP for optional fields
#
# Format (all on ONE line):
# FirstName | LastName | DOB | AddressLine1 | Province | PostalCode | PhoneNumber | Email | IDType | IDNumber | ContactMethod | ReferralSource | Notes
#
# Example:
# John | Doe | 01/15/1990 | 123 Main St | ON | M5V 2T6 | 4165551234 | john.doe@email.com | Driver's License | D1234567 | Email | Friend | SKIP
#
# Required Fields: FirstName, LastName, DOB, AddressLine1, Province, PostalCode
# Optional Fields: PhoneNumber, Email, IDType, IDNumber, ContactMethod, ReferralSource, Notes
#
# Date format: MM/DD/YYYY
# Province: 2-letter code (ON, BC, AB, QC, etc.)
# Postal Code: X1X 1X1 format
#
# ===========================
# ENTER CUSTOMER INFO BELOW:
# ===========================

`;
    return Buffer.from(template, 'utf-8');
  }

  /**
   * Get or create single template buffer for sending
   */
  getSingleTemplateBuffer() {
    return this.createSingleTemplate();
  }
}

module.exports = BulkUploadService;
