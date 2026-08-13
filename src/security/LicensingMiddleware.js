import CommunityEditionGuard from "./CommunityEditionGuard.js";

export class LicensingMiddleware {
  constructor() {
    this.dailyUsageTracker = new Map();
    this.maxDailyFreeRequests = 50;
    this.guard = CommunityEditionGuard.getInstance();
  }

  static getInstance() {
    if (!global.__licensingMiddlewareInstance) {
      global.__licensingMiddlewareInstance = new LicensingMiddleware();
    }
    return global.__licensingMiddlewareInstance;
  }

  verifyAuthAndEntitlement(reqHeaders) {
    const licenseKey = reqHeaders["x-license-key"];
    const affiliateId = reqHeaders["x-affiliate-id"];

    // 1. Broker Affiliate Lock Check
    if (!affiliateId || affiliateId.trim() === "") {
      return {
        authorized: false,
        reason: "MISSING_AFFILIATE_ID",
        message: "Access Denied: Registered Broker Affiliate ID required."
      };
    }

    if (!licenseKey) {
      return {
        authorized: false,
        reason: "MISSING_LICENSE_KEY",
        message: "Access Denied: License key absent."
      };
    }

    // 2. Direct Cryptographic Delegated Verification
    const cryptoVerification = this.guard.verifyLicenseKey(licenseKey);

    if (!cryptoVerification.valid) {
      return {
        authorized: false,
        reason: "INVALID_CRYPTOGRAPHIC_LICENSE",
        message: `Access Denied: ${cryptoVerification.reason || "Signature verification failed."}`
      };
    }

    return {
      authorized: true,
      licenseKey,
      affiliateId,
      tier: cryptoVerification.tier,
      details: cryptoVerification
    };
  }

  checkAndConsumeQuota(userId, tier = "COMMUNITY") {
    if (tier === "ENTERPRISE") {
      return { allowed: true, remaining: 99999, tier: "ENTERPRISE" };
    }

    const today = new Date().toISOString().split("T")[0];
    const userKey = `${userId}:${today}`;
    const currentUsage = this.dailyUsageTracker.get(userKey) || 0;

    if (currentUsage >= this.maxDailyFreeRequests) {
      return {
        allowed: false,
        remaining: 0,
        tier: "COMMUNITY",
        message: `Community Quota Exceeded: ${this.maxDailyFreeRequests}/${this.maxDailyFreeRequests} daily limit reached.`
      };
    }

    this.dailyUsageTracker.set(userKey, currentUsage + 1);
    return {
      allowed: true,
      remaining: this.maxDailyFreeRequests - (currentUsage + 1),
      tier: "COMMUNITY"
    };
  }

  resetTracker() {
    this.dailyUsageTracker.clear();
  }
}

export default LicensingMiddleware;
