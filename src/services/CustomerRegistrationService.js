
const moment = require('moment');
const crypto = require('crypto');

class CustomerRegistrationService {
  constructor() {
    // Canadian provinces for dropdown
    this.provinces = [
      { code: 'AB', name: 'Alberta' },
      { code: 'BC', name: 'British Columbia' },
      { code: 'MB', name: 'Manitoba' },
      { code: 'NB', name: 'New Brunswick' },
      { code: 'NL', name: 'Newfoundland and Labrador' },
      { code: 'NT', name: 'Northwest Territories' },
      { code: 'NS', name: 'Nova Scotia' },
      { code: 'NU', name: 'Nunavut' },
      { code: 'ON', name: 'Ontario' },
      { code: 'PE', name: 'Prince Edward Island' },
      { code: 'QC', name: 'Quebec' },
      { code: 'SK', name: 'Saskatchewan' },
      { code: 'YT', name: 'Yukon' }
    ];

    // Registration form fields (13 steps, 11 if DL skipped)
    this.registrationFields = [
      { key: 'firstName', label: 'First Name', required: true, type: 'text' },
      { key: 'middleName', label: 'Middle Name', required: false, type: 'text' },
      { key: 'lastName', label: 'Last Name', required: true, type: 'text' },
      { key: 'dateOfBirth', label: 'Date of Birth (MM/DD/YYYY)', required: true, type: 'date' },
      { key: 'streetNumber', label: 'Street Number', required: true, type: 'text' },
      { key: 'suiteUnit', label: 'Suite/Unit #', required: false, type: 'text', note: 'Optional' },
      { key: 'streetAddress', label: 'Street Address', required: true, type: 'text' },
      { key: 'city', label: 'City', required: true, type: 'text' },
      { key: 'province', label: 'Province', required: true, type: 'select', options: this.provinces },
      { key: 'postalCode', label: 'Postal Code', required: true, type: 'postal', pattern: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i },
      { key: 'driverLicense', label: "Driver's License #", required: false, type: 'text', note: 'Optional' },
      { key: 'dlIssued', label: 'DL Issued Date', required: false, type: 'date', note: 'Optional' },
      { key: 'dlExpiry', label: 'DL Expiry Date', required: false, type: 'date', note: 'Optional' }
    ];
  }

  getProvinces() {
    return this.provinces;
  }

  getProvinceName(code) {
    const province = this.provinces.find(p => p.code === code);
    return province ? province.name : code;
  }

  // Removed auto-generation - should never generate IDs

  validatePostalCode(postalCode) {
    const pattern = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
    return pattern.test(postalCode);
  }

  formatPostalCode(postalCode) {
    const cleaned = postalCode.replace(/\s/g, '').toUpperCase();
    if (cleaned.length === 6) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
    }
    return postalCode.toUpperCase();
  }

  validateDate(date) {
    // Accept both / and - as separators
    return moment(date, 'MM/DD/YYYY', true).isValid() || 
           moment(date, 'MM-DD-YYYY', true).isValid();
  }

  calculateAge(dateOfBirth) {
    // Try both formats
    let dob = moment(dateOfBirth, 'MM/DD/YYYY', true);
    if (!dob.isValid()) {
      dob = moment(dateOfBirth, 'MM-DD-YYYY', true);
    }
    return moment().diff(dob, 'years');
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  formatFullAddress(addressData) {
    const { streetNumber, suiteUnit, streetAddress, city, province, postalCode } = addressData;
    let addressLine = `${streetNumber} ${streetAddress}`;
    if (suiteUnit && suiteUnit.toLowerCase() !== 'skip') {
      addressLine = `${suiteUnit}-${streetNumber} ${streetAddress}`;
    }
    return `${addressLine}\n${city}, ${province} ${this.formatPostalCode(postalCode)}`;
  }

  validateRegistration(data) {
    const errors = [];

    // Required fields
    if (!data.firstName?.trim()) errors.push('First name is required');
    if (!data.lastName?.trim()) errors.push('Last name is required');
    
    // Date of birth validation
    if (!data.dateOfBirth) {
      errors.push('Date of birth is required');
    } else if (!this.validateDate(data.dateOfBirth)) {
      errors.push('Invalid date format. Use MM/DD/YYYY or MM-DD-YYYY');
    } else {
      const age = this.calculateAge(data.dateOfBirth);
      if (age < 18) errors.push('Must be 18 or older to register');
    }

    // Address validation
    if (!data.streetNumber?.trim()) errors.push('Street number is required');
    if (!data.streetAddress?.trim()) errors.push('Street address is required');
    if (!data.city?.trim()) errors.push('City is required');
    if (!data.province) {
      errors.push('Province is required');
    } else if (!this.provinces.find(p => p.code === data.province.toUpperCase())) {
      errors.push('Invalid province selection');
    }
    
    // Postal code validation
    if (!data.postalCode) {
      errors.push('Postal code is required');
    } else if (!this.validatePostalCode(data.postalCode)) {
      errors.push('Invalid postal code format (e.g., A1A 1A1)');
    }

    // Email validation removed - no longer required

    return {
      valid: errors.length === 0,
      errors
    };
  }

  processRegistration(data) {
    // Normalize province to uppercase
    if (data.province) {
      data.province = data.province.toUpperCase();
    }
    // Format postal code
    data.postalCode = this.formatPostalCode(data.postalCode);

    // Add formatted full address
    data.formattedAddress = this.formatFullAddress(data);

    // Add registration timestamp
    data.registeredAt = moment().format('YYYY-MM-DD HH:mm:ss');

    return data;
  }

  createRegistrationSummary(data) {
    // Build the summary with proper formatting
    let summary = `📋 *Registration Summary*\n\n`;

    // Personal Information - each name component on separate line
    summary += `*Personal Information:*\n`;
    summary += `• First Name: ${data.firstName}\n`;
    if (data.middleName && data.middleName !== 'skip') {
      summary += `• Middle Name: ${data.middleName}\n`;
    }
    summary += `• Last Name: ${data.lastName}\n`;
    summary += `• Date of Birth: ${data.dateOfBirth}\n`;
    const age = this.calculateAge(data.dateOfBirth);
    summary += `• Age: ${age} years old\n\n`;
    
    // Address
    summary += `*Address:*\n`;
    let addressLine = `${data.streetNumber} ${data.streetAddress}`;
    if (data.suiteUnit && data.suiteUnit.toLowerCase() !== 'skip') {
      addressLine = `${data.suiteUnit}-${data.streetNumber} ${data.streetAddress}`;
    }
    summary += `${addressLine}\n`;
    summary += `${data.city}, ${this.getProvinceName(data.province)} ${data.postalCode}\n\n`;
    
    // Driver's License (only if provided)
    if (data.driverLicense && data.driverLicense !== 'skip') {
      summary += `*Driver's License:*\n`;
      summary += `• Number: ${data.driverLicense}\n`;
      if (data.dlIssued && data.dlIssued !== 'skip') {
        summary += `• Issued: ${data.dlIssued}\n`;
      }
      if (data.dlExpiry && data.dlExpiry !== 'skip') {
        summary += `• Expires: ${data.dlExpiry}\n`;
      }
      summary += '\n';
    } else {
      summary += `*Driver's License:* Not provided\n\n`;
    }
    
    summary += `Please confirm this information is correct.`;
    
    return summary.trim();
  }
}

module.exports = CustomerRegistrationService;