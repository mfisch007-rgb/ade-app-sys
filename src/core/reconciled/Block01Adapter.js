/**
 * ADE Block 01 Runtime Adapter (Native JavaScript)
 * Reconciles Block 01 entitlement, demo guard, and onboarding contracts
 * into existing ADE runtime engines without creating duplicate logic.
 */

const CapabilityRegistry = require('../CapabilityRegistry');
const securityEngine = require('../../engines/securityEngine');
const onboardingEngine = require('../../engines/onboardingEngine');

class Block01Adapter {
  constructor() {
    this.capabilityRegistry = CapabilityRegistry;
    this.securityEngine = securityEngine;
    this.onboardingEngine = onboardingEngine;
  }

  getEditionCapabilities(planKey) {
    if (typeof this.capabilityRegistry.getPlanCapabilities === 'function') {
      return this.capabilityRegistry.getPlanCapabilities(planKey);
    }
    return [];
  }

  evaluateDemoGuard(action, context = {}) {
    if (this.securityEngine && typeof this.securityEngine.evaluateExecutionGuard === 'function') {
      return this.securityEngine.evaluateExecutionGuard(action, context);
    }
    return { allowed: true, mode: 'SIMULATED' };
  }

  getOnboardingStage(userState) {
    if (this.onboardingEngine && typeof this.onboardingEngine.getStage === 'function') {
      return this.onboardingEngine.getStage(userState);
    }
    return 'INITIAL';
  }
}

module.exports = new Block01Adapter();
