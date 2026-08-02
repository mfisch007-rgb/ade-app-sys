import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import ADERuntime from "../kernel/engine/ADERuntime.js";
import ObservationEngine from "../kernel/engine/ObservationEngine.js";
import AutonomousExecutionEngine from "../kernel/engine/AutonomousExecutionEngine.js";
import AnomalyEngine from "../kernel/engine/AnomalyEngine.js";
import ResilienceGuard from "../kernel/security/ResilienceGuard.js";
import SystemHealthDashboard from "../kernel/engine/SystemHealthDashboard.js";

export async function runBatch8Suite() {
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

    await test("AnomalyEngine detects statistical outliers on metric data", async () => {
        const bus = new EnterpriseEventBus();
        const anomalyEngine = new AnomalyEngine(bus);
        anomalyEngine.initialize(); anomalyEngine.start();
        
        const history = [10, 12, 11, 10, 11, 12, 10];
        const normal = anomalyEngine.detectOutlier("latency", 11, history);
        assert.strictEqual(normal.isAnomaly, false);

        const spike = anomalyEngine.detectOutlier("latency", 500, history);
        assert.strictEqual(spike.isAnomaly, true);
        assert.strictEqual(anomalyEngine.metrics().totalAnomaliesDetected, 1);
    });

    await test("ResilienceGuard trips circuit breaker on consecutive errors and executes fallback", async () => {
        const guard = new ResilienceGuard(2, 5000);
        const faultyTask = async () => { throw new Error("API_TIMEOUT"); };
        const fallback = async (err) => "FALLBACK_SUCCESS";

        await guard.execute(faultyTask, fallback);
        await guard.execute(faultyTask, fallback);
        
        // Third call should trigger circuit open fallback
        const res = await guard.execute(faultyTask, fallback);
        assert.strictEqual(res, "FALLBACK_SUCCESS");
        assert.strictEqual(guard.state, "OPEN");
    });

    await test("SystemHealthDashboard compiles unified engine metrics across ADERuntime", async () => {
        const bus = new EnterpriseEventBus();
        const runtime = new ADERuntime(bus);
        const obs = new ObservationEngine(bus);
        const exec = new AutonomousExecutionEngine(bus);

        runtime.registerEngine("observation", obs);
        runtime.registerEngine("execution", exec);
        runtime.boot();

        const dashboard = new SystemHealthDashboard(runtime);
        const report = dashboard.generateReport();

        assert.strictEqual(report.runtimeStatus, "RUNNING");
        assert.strictEqual(report.engineHealth.observation.status, "RUNNING");
        assert.strictEqual(report.engineHealth.execution.status, "RUNNING");
    });

    return { passed, failed };
}
