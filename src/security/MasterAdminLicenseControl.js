import CommunityEditionGuard from "./CommunityEditionGuard.js";

export class MasterAdminLicenseControl {
  constructor() {
    this.guard = CommunityEditionGuard.getInstance();
    this.userTierOverrides = new Map();
  }

  static getInstance() {
    if (!global.__masterAdminControlInstance) {
      global.__masterAdminControlInstance = new MasterAdminLicenseControl();
    }
    return global.__masterAdminControlInstance;
  }

  overrideUserPermissions(userId, targetTier) {
    this.userTierOverrides.set(userId, targetTier);
    this.guard.logAuditEvent({
      type: "ADMIN_TIER_OVERRIDE",
      targetUser: userId,
      newTier: targetTier,
      executedBy: "MASTER_ROOT_ADMIN"
    });
    return { userId, activeTier: targetTier, status: "UPDATED_INSTANTLY" };
  }

  getUserTier(userId) {
    return this.userTierOverrides.get(userId) || "COMMUNITY";
  }
}

export default MasterAdminLicenseControl;
