export class SecurityAffiliateShield {
  constructor(config = {}) {
    this.name = 'SecurityAffiliateShield';
    this.allowedAffiliateIds = new Set(config.validAffiliates || ['AFF_REF_88291', 'AFF_REF_MASTER']);
  }

  verifyAffiliateRegistration(userAffiliateId) {
    if (!userAffiliateId || !this.allowedAffiliateIds.has(userAffiliateId)) {
      console.log(`[AffiliateShield] DENIED access for Affiliate ID: '${userAffiliateId}'`);
      return { authorized: false, reason: 'Invalid or missing affiliate link registration key.' };
    }
    console.log(`[AffiliateShield] VERIFIED user under Affiliate ID: '${userAffiliateId}'`);
    return { authorized: true };
  }
}
