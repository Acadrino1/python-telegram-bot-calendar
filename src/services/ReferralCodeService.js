const fs = require('fs').promises;
const path = require('path');

class ReferralCodeService {
  constructor() {
    this.codesFilePath = path.join(__dirname, '../../referral-codes.json');
    this.codes = null;
  }

  async loadCodes() {
    try {
      const data = await fs.readFile(this.codesFilePath, 'utf8');
      this.codes = JSON.parse(data);
      return this.codes;
    } catch (error) {
      console.error('Error loading referral codes:', error);
      // Initialize with default structure if file doesn't exist
      const adminId = process.env.ADMIN_USER_ID || process.env.ADMIN_TELEGRAM_ID || '';
      this.codes = {
        codes: {},
        pendingRequests: {},
        approvedUsers: adminId ? [adminId] : [], // Admin auto-approved if configured
        userPreferences: {}
      };
      await this.saveCodes();
      return this.codes;
    }
  }

  async saveCodes() {
    try {
      await fs.writeFile(this.codesFilePath, JSON.stringify(this.codes, null, 2));
    } catch (error) {
      console.error('Error saving referral codes:', error);
      throw error;
    }
  }

  async validateCode(code) {
    if (!this.codes) await this.loadCodes();
    
    const codeData = this.codes.codes[code];
    if (!codeData) {
      return { valid: false, reason: 'Code not found' };
    }

    if (!codeData.active) {
      return { valid: false, reason: 'Code is inactive' };
    }

    if (codeData.uses >= codeData.maxUses) {
      return { valid: false, reason: 'Code usage limit reached' };
    }

    return { valid: true, codeData };
  }

  async useCode(code, userId) {
    if (!this.codes) await this.loadCodes();
    
    const validation = await this.validateCode(code);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    // Increment usage
    this.codes.codes[code].uses += 1;
    this.codes.codes[code].lastUsed = new Date().toISOString();
    this.codes.codes[code].lastUsedBy = userId;

    // Add user to approved list
    if (!this.codes.approvedUsers.includes(userId)) {
      this.codes.approvedUsers.push(userId);
    }

    await this.saveCodes();
    return true;
  }

  async createCode(code, maxUses, createdBy) {
    if (!this.codes) await this.loadCodes();

    if (this.codes.codes[code]) {
      throw new Error('Code already exists');
    }

    this.codes.codes[code] = {
      uses: 0,
      maxUses,
      active: true,
      createdBy,
      createdAt: new Date().toISOString()
    };

    await this.saveCodes();
    return this.codes.codes[code];
  }

  async getAllCodes() {
    if (!this.codes) await this.loadCodes();
    return this.codes.codes;
  }

  async isUserApproved(userId) {
    if (!this.codes) await this.loadCodes();
    return this.codes.approvedUsers.includes(userId.toString());
  }

  async approveUser(userId) {
    if (!this.codes) await this.loadCodes();
    
    if (!this.codes.approvedUsers.includes(userId.toString())) {
      this.codes.approvedUsers.push(userId.toString());
      await this.saveCodes();
    }
    return true;
  }

  async denyUser(userId) {
    if (!this.codes) await this.loadCodes();
    
    // Remove from approved users if present
    this.codes.approvedUsers = this.codes.approvedUsers.filter(id => id !== userId.toString());
    
    // Remove from pending requests if present
    delete this.codes.pendingRequests[userId.toString()];
    
    await this.saveCodes();
    return true;
  }

  async addPendingRequest(userId, userData) {
    if (!this.codes) await this.loadCodes();
    
    this.codes.pendingRequests[userId.toString()] = {
      ...userData,
      requestedAt: new Date().toISOString()
    };
    
    await this.saveCodes();
    return true;
  }

  async getPendingRequests() {
    if (!this.codes) await this.loadCodes();
    return this.codes.pendingRequests;
  }

  async removePendingRequest(userId) {
    if (!this.codes) await this.loadCodes();
    delete this.codes.pendingRequests[userId.toString()];
    await this.saveCodes();
  }
}

module.exports = ReferralCodeService;