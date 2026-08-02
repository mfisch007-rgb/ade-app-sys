import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import ObservationEngine from "../kernel/engine/ObservationEngine.js";
import AutonomousExecutionEngine from "../kernel/engine/AutonomousExecutionEngine.js";
import LearningEngine from "../kernel/engine/LearningEngine.js";
import ADERuntime from "../kernel/engine/ADERuntime.js";
import ADEPluginSDK from "../kernel/sdk/ADEPluginSDK.js";

export async function runBatch4Suite() {
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

    test("LearningEngine records adaptation metrics on evaluation inputs", () => {
        const bus = new EnterpriseEventBus();
        const le = new LearningEngine(bus);
        le.initialize(); le.start();
        const evalRecord = { evalId: "EVAL-99", success: true };
        const learning = le.recordLearning(evalRecord, { note: "Optimized routing" });
        assert.strictEqual(learning.adjustmentDelta, 0.05);
    });

    test("ADERuntime boots registered engines and manages plugin integration", () => {
        const bus = new EnterpriseEventBus();
        const runtime = new ADERuntime(bus);
        const obs = new ObservationEngine(bus);
        const exec = new AutonomousExecutionEngine(bus);
        
        runtime.registerEngine("observation", obs);
        runtime.registerEngine("execution", exec);
        runtime.boot();
        assert.strictEqual(runtime.status, "RUNNING");

        class DummyPlugin extends ADEPluginSDK {
            constructor() { super("DummyPlugin"); }
        }
        const plugin = new DummyPlugin();
        runtime.registerPlugin(plugin);
        
        const obsResult = plugin.onObserve("TEST_SOURCE", { data: 123 });
        assert.strictEqual(obsResult.source, "TEST_SOURCE");
    });

    return { passed, failed };
}
