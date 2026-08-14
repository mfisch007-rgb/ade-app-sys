import CommunityEditionGuard from "../security/CommunityEditionGuard.js";

export class AffiliateLockGuard {
  constructor() {
    this.guard = CommunityEditionGuard.getInstance();
    this.registeredAffiliates = new Set();
  }

  static getInstance() {
    if (!global.__affiliateLockGuardInstance) {
      global.__affiliateLockGuardInstance = new AffiliateLockGuard();
    }
    return global.__affiliateLockGuardInstance;
  }

  registerValidAffiliate(affiliateId) {
    this.registeredAffiliates.add(affiliateId);
    return { status: "AFFILIATE_WHITELISTS_UPDATED", affiliateId };
  }

  validateUserAffiliate(userId, userAffiliateId) {
    const isValid = this.registeredAffiliates.has(userAffiliateId);
    if (!isValid) {
      this.guard.logAuditEvent({
        type: "AFFILIATE_LOCK_VIOLATION",
        userId,
        providedAffiliateId: userAffiliateId,
        timestamp: new Date().toISOString()
      });
      return { authorized: false, reason: "INVALID_AFFILIATE_REGISTRATION" };
    }
    return { authorized: true, userId, affiliateId: userAffiliateId };
  }
}

export default AffiliateLockGuard;
