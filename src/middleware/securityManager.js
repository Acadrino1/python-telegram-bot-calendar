
const developmentSecurity = require('./developmentSecurity');
const productionSecurity = require('./adminSecurityProduction');
const enterpriseSecurity = require('./adminSecurity');

class SecurityManager {
  constructor() {
    this.securityMode = this.determineSecurityMode();
    this.activeSecurityProvider = this.getSecurityProvider();
  }

  determineSecurityMode() {
    // Check environment variable override first
    if (process.env.ADMIN_SECURITY_MODE) {
      return process.env.ADMIN_SECURITY_MODE.toLowerCase();
    }

    // Auto-detect based on NODE_ENV and other factors
    if (process.env.NODE_ENV === 'production') {
      return 'production';
    } else if (process.env.NODE_ENV === 'development') {
      return 'development';
    } else if (process.env.NODE_ENV === 'test') {
      return 'development';
    } else {
      // Default to development for unknown environments
      return 'development';
    }
  }

  getSecurityProvider() {
    switch (this.securityMode) {
      case 'enterprise':
        console.log('🛡️  Using Enterprise Security (Full Protection)');
        return enterpriseSecurity;
      
      case 'production':
        console.log('🔒 Using Production Security (Balanced)');
        return productionSecurity;
      
      case 'development':
      default:
        console.log('🔓 Using Development Security (Permissive)');
        return developmentSecurity;
    }
  }

  getAdminMiddleware() {
    return this.activeSecurityProvider.getAdminMiddleware();
  }

  getAdminLoginMiddleware() {
    return this.activeSecurityProvider.getAdminLoginMiddleware();
  }

  getAdminJSAuthenticate() {
    return this.activeSecurityProvider.getAdminJSAuthenticate();
  }

  getLocalhostOnly() {
    return this.activeSecurityProvider.localhostOnly;
  }

  getSecurityHeaders() {
    return this.activeSecurityProvider.adminSecurityHeaders;
  }

  getSessionMiddleware() {
    return this.activeSecurityProvider.sessionMiddleware;
  }

  getRateLimit(type = 'general') {
    switch (type) {
      case 'login':
        return this.activeSecurityProvider.adminLoginRateLimit;
      case 'general':
      default:
        return this.activeSecurityProvider.adminPanelRateLimit;
    }
  }

  applySecurityMiddleware(app) {
    if (typeof this.activeSecurityProvider.applySecurityMiddleware === 'function') {
      return this.activeSecurityProvider.applySecurityMiddleware(app);
    } else {
      // Manual application for providers that don't have this method
      const middleware = this.getAdminMiddleware();
      app.use('/admin', ...middleware);
    }
  }

  getSecurityInfo() {
    return {
      mode: this.securityMode,
      provider: this.activeSecurityProvider.constructor.name,
      features: {
        csrf: this.securityMode !== 'development',
        hsts: this.securityMode === 'production' || this.securityMode === 'enterprise',
        strictCSP: this.securityMode === 'enterprise',
        sessionTimeout: this.securityMode !== 'development',
        auditLogging: true,
        rateLimit: true,
        localhostOnly: true
      }
    };
  }

  switchSecurityMode(mode) {
    if (['development', 'production', 'enterprise'].includes(mode)) {
      this.securityMode = mode;
      this.activeSecurityProvider = this.getSecurityProvider();
      return true;
    }
    return false;
  }
}

module.exports = new SecurityManager();