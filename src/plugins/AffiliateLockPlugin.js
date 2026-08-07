import { BasePlugin } from '../kernel/contracts/BasePlugin.js';

export class AffiliateLockPlugin extends BasePlugin {
  constructor() {
    super('AffiliateLockPlugin', '1.0.0');
    this.validKeys = new Set(['AFF-KEY-9981', 'AFF-KEY-0012', 'PRO-USER-889']);
  }

  async boot(kernel) {
    await super.boot(kernel);
    console.log('[AffiliateLockPlugin] Affiliate key protection active.');
  }

  verifyLicense(key) {
    const isValid = this.validKeys.has(key);
    console.log(`[AffiliateLockPlugin] Key validation ${key}: ${isValid ? 'AUTHORIZED' : 'DENIED'}`);
    return isValid;
  }
}
