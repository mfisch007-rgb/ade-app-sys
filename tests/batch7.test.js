import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import ADERuntime from "../kernel/engine/ADERuntime.js";
import ObservationEngine from "../kernel/engine/ObservationEngine.js";
import MemoryEngine from "../kernel/engine/MemoryEngine.js";
import StorageEngine from "../kernel/engine/StorageEngine.js";
import AutonomousExecutionEngine from "../kernel/engine/AutonomousExecutionEngine.js";
import ContextCacheEngine from "../kernel/engine/ContextCacheEngine.js";
import CRMWorkflowPlugin from "../plugins/crm/CRMWorkflowPlugin.js";

export async function runBatch7Suite() {
    let passed = 0, failed = 0;
    const test = async (name, fn) => {
        try {
            await fn();
            console.log("  ✔ PASS: " + name);
            passed++;
        } catch (err) {
            console.error("  ✖ FAIL: " + name + "\n    " + err.message);
            failed++;
        }
    };

    await test("ContextCacheEngine registers cached schemas and records cache hits", async () => {
        const bus = new EnterpriseEventBus();
        const cacheEngine = new ContextCacheEngine(bus);
        cacheEngine.initialize(); cacheEngine.start();
        
        const sysSchema = "System Policy v1: All VIP enterprise leads require instant SDR routing.";
        cacheEngine.createCache("policy_schema_v1", sysSchema, 1800);
        
        const fetched = cacheEngine.getCache("policy_schema_v1");
        assert.strictEqual(fetched, sysSchema);
        assert.strictEqual(cacheEngine.metrics().cacheHits, 1);
    });

    await test("Full ADE Runtime System Integration Loop", async () => {
        const bus = new EnterpriseEventBus();
        const runtime = new ADERuntime(bus);
        const storage = new StorageEngine(bus);
        const memory = new MemoryEngine(bus, storage);
        const obs = new ObservationEngine(bus);
        const exec = new AutonomousExecutionEngine(bus);
        const cache = new ContextCacheEngine(bus);

        runtime.registerEngine("storage", storage);
        runtime.registerEngine("memory", memory);
        runtime.registerEngine("observation", obs);
        runtime.registerEngine("execution", exec);
        runtime.registerEngine("cache", cache);
        runtime.boot();

        const crmPlugin = new CRMWorkflowPlugin({ tenantId: "enterprise-core" });
        runtime.registerPlugin(crmPlugin);

        cache.createCache("crm_policy", "Always prioritize VIP leads");
        await memory.remember("system_status", "HEALTHY");
        
        const lead = { id: "L-10000", email: "founder@firm.com", company: "Apex Global", estimatedValue: 25000 };
        const res = crmPlugin.processLeadIngress(lead);

        assert.strictEqual(res.isHighValue, true);
        assert.strictEqual(runtime.status, "RUNNING");
        assert.strictEqual(obs.metrics().totalObserved, 1);
        assert.strictEqual(exec.metrics().totalExecuted, 1);
    });

    return { passed, failed };
}
