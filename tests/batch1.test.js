import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import LicensingEngine from "../kernel/security/LicensingEngine.js";
import OracleIntelligenceEngine from "../kernel/engine/OracleIntelligenceEngine.js";
import NexusLedgerEngine from "../kernel/engine/NexusLedgerEngine.js";

export async function runBatch1Suite() {
    let passed = 0, failed = 0;
    const test = (name, fn) => {
        try {
            fn();
            console.log("  ✔ PASS: " + name);
            passed++;
        } catch (err) {
            console.error("  ✖ FAIL: " + name + "\n    " + err.message);
            failed++;
        }
    };

    test("LicensingEngine generates and validates license keys correctly", () => {
        const licenser = new LicensingEngine({ secretKey: "TEST_KEY" });
        const key = licenser.generateLicenseKey("tenant-101", "PRO", 30);
        const result = licenser.verifyLicenseKey(key, { tenantId: "tenant-101" });
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.tier, "PRO");
    });

    test("LicensingEngine blocks tampered or invalid license keys", () => {
        const licenser = new LicensingEngine({ secretKey: "TEST_KEY" });
        const key = licenser.generateLicenseKey("tenant-101", "PRO", 30);
        const tamperedKey = key.slice(0, -4) + "abcd";
        const result = licenser.verifyLicenseKey(tamperedKey, { tenantId: "tenant-101" });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, "INVALID_SIGNATURE");
    });

    test("LicensingEngine enforces affiliate referral registration", () => {
        const licenser = new LicensingEngine({ affiliateId: "PARTNER_99" });
        const validAffiliate = licenser.verifyAffiliateStatus({ referredBy: "PARTNER_99" });
        assert.strictEqual(validAffiliate.verified, true);
        const invalidAffiliate = licenser.verifyAffiliateStatus({ referredBy: "OTHER_BROKER" });
        assert.strictEqual(invalidAffiliate.verified, false);
    });

    test("OracleIntelligenceEngine calculates dynamic Z-Score risk correctly", () => {
        const bus = new EnterpriseEventBus();
        const oracle = new OracleIntelligenceEngine(bus);
        const evalResult = oracle.evaluateRisk({ tenantId: "tenant-101", currentValue: 150, mean: 100, stdDev: 25 });
        assert.strictEqual(evalResult.zScore, 2);
        assert.strictEqual(evalResult.passed, false);
    });

    test("NexusLedgerEngine enforces double-entry invariants and credit balances", () => {
        const bus = new EnterpriseEventBus();
        const ledger = new NexusLedgerEngine(bus);
        ledger.initializeWallet("tenant-101", 0);
        ledger.recordTransaction("tenant-101", "CREDIT", 500, "Affiliate Commission");
        ledger.recordTransaction("tenant-101", "DEBIT", 200, "License Fee");
        assert.strictEqual(ledger.getBalance("tenant-101"), 300);
        assert.strictEqual(ledger.verifyInvariant("tenant-101"), true);
    });

    return { passed, failed };
}
