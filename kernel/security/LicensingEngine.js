import crypto from "node:crypto";

export default class LicensingEngine {
    constructor(config = {}) {
        this.secretKey = config.secretKey || "ADE_MASTER_SECRET_KEY_2026";
        this.affiliateId = config.affiliateId || "AFFILIATE_MASTER_ID";
    }

    generateLicenseKey(tenantId, tier = "PRO", durationDays = 30) {
        const payload = JSON.stringify({
            tenantId,
            tier,
            expiresAt: Date.now() + (durationDays * 86400000)
        });
        const encoded = Buffer.from(payload).toString("base64");
        const signature = crypto.createHmac("sha256", this.secretKey).update(encoded).digest("hex");
        return `${encoded}.${signature}`;
    }

    verifyLicenseKey(licenseKey, userPayload = {}) {
        try {
            if (!licenseKey || !licenseKey.includes(".")) {
                return { valid: false, reason: "MISSING_OR_MALFORMED_KEY" };
            }
            const [encoded, signature] = licenseKey.split(".");
            const expectedSig = crypto.createHmac("sha256", this.secretKey).update(encoded).digest("hex");
            if (signature !== expectedSig) {
                return { valid: false, reason: "INVALID_SIGNATURE" };
            }
            const data = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
            if (data.expiresAt < Date.now()) {
                return { valid: false, reason: "LICENSE_EXPIRED" };
            }
            if (userPayload.tenantId && data.tenantId !== userPayload.tenantId) {
                return { valid: false, reason: "TENANT_MISMATCH" };
            }
            return { valid: true, tier: data.tier, tenantId: data.tenantId, expiresAt: data.expiresAt };
        } catch (err) {
            return { valid: false, reason: "VERIFICATION_FAILED: " + err.message };
        }
    }

    verifyAffiliateStatus(userBrokerAccount = {}) {
        if (!userBrokerAccount.referredBy) {
            return { verified: false, reason: "MISSING_REFERRAL_ID" };
        }
        const isReferredByUs = userBrokerAccount.referredBy === this.affiliateId;
        return {
            verified: isReferredByUs,
            status: isReferredByUs ? "ACTIVE_AFFILIATE" : "UNMATCHED_REFERRAL_ID",
            affiliateId: this.affiliateId
        };
    }
}
