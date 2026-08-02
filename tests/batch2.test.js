import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import LicensingEngine from "../kernel/security/LicensingEngine.js";
import ObservationEngine from "../kernel/engine/ObservationEngine.js";
import MemoryEngine from "../kernel/engine/MemoryEngine.js";
import AutonomousExecutionEngine from "../kernel/engine/AutonomousExecutionEngine.js";

export async function runBatch2Suite() {
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

    test("ObservationEngine fulfills standard Engine Contract and captures multi-source events", () => {
        const bus = new EnterpriseEventBus();
        const obs = new ObservationEngine(bus);
        obs.initialize();
        obs.start();
        assert.strictEqual(obs.health().status, "RUNNING");
        const observation = obs.observe("CRM_WEBHOOK", { leadId: "1001", status: "NEW" });
        assert.strictEqual(observation.source, "CRM_WEBHOOK");
        assert.strictEqual(obs.metrics().totalObserved, 1);
    });

    test("MemoryEngine remembers, recalls, and enforces TTL expiration", () => {
        const mem = new MemoryEngine();
        mem.initialize();
        mem.start();
        mem.remember("session:tenant-1", { userId: "usr-99" });
        assert.deepStrictEqual(mem.recall("session:tenant-1"), { userId: "usr-99" });
    });

    test("AutonomousExecutionEngine executes generic business tasks under valid license", () => {
        const bus = new EnterpriseEventBus();
        const licenser = new LicensingEngine({ secretKey: "MASTER_KEY_123" });
        const key = licenser.generateLicenseKey("tenant-55", "ENTERPRISE", 30);
        const executor = new AutonomousExecutionEngine(bus, licenser);
        executor.initialize();
        executor.start();

        const task = { taskType: "GENERATE_INVOICE", amount: 1500 };
        const context = { tenantId: "tenant-55", licenseKey: key };

        const res = executor.executeTask(task, context);
        assert.strictEqual(res.executed, true);
        assert.strictEqual(res.record.taskType, "GENERATE_INVOICE");
    });

    return { passed, failed };
}
