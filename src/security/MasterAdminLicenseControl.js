import CommunityEditionGuard from "./CommunityEditionGuard.js";

export class MasterAdminLicenseControl {
  constructor() {
    this.guard = CommunityEditionGuard.getInstance();
    this.userTierOverrides = new Map();
    this.issuedLicenses = new Map();
  }

  static getInstance() {
    if (!global.__masterAdminControlInstance) {
      global.__masterAdminControlInstance = new MasterAdminLicenseControl();
    }
    return global.__masterAdminControlInstance;
  }

  issueLicense(userId, duration = "30d") {
    const durationMap = {
      "1d": 86400000,
      "7d": 7 * 86400000,
      "30d": 30 * 86400000,
      "90d": 90 * 86400000,
      "365d": 365 * 86400000
    };

    const expiresInMs = durationMap[duration] || durationMap["30d"];

    const licenseKey = this.guard.generateLicenseKey(
      "ENTERPRISE",
      expiresInMs,
      "ADE-MASTER-ADMIN"
    );

    const record = {
      userId,
      licenseKey,
      tier: "ENTERPRISE",
      duration,
      issuedAt: new Date().toISOString()
    };

    this.issuedLicenses.set(userId, record);

    this.guard.logAuditEvent({
      type: "LICENSE_ISSUED",
      userId,
      tier: "ENTERPRISE",
      duration,
      executedBy: "MASTER_ROOT_ADMIN"
    });

    return record;
  }

  validateLicense(licenseKey) {
    const verification = this.guard.verifyLicenseKey(licenseKey);

    return {
      active: verification.valid === true,
      valid: verification.valid === true,
      tier: verification.tier || null,
      issuer: verification.issuer || null,
      reason: verification.reason || null
    };
  }

  overrideUserPermissions(userId, targetTier) {
    this.userTierOverrides.set(userId, targetTier);

    this.guard.logAuditEvent({
      type: "ADMIN_TIER_OVERRIDE",
      targetUser: userId,
      newTier: targetTier,
      executedBy: "MASTER_ROOT_ADMIN"
    });

    return {
      userId,
      activeTier: targetTier,
      status: "UPDATED_INSTANTLY"
    };
  }

  getUserTier(userId) {
    return this.userTierOverrides.get(userId) || "COMMUNITY";
  }
}

export default MasterAdminLicenseControl;
