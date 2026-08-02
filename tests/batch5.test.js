import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import ObservationEngine from "../kernel/engine/ObservationEngine.js";
import AutonomousExecutionEngine from "../kernel/engine/AutonomousExecutionEngine.js";
import ADERuntime from "../kernel/engine/ADERuntime.js";
import CRMWorkflowPlugin from "../plugins/crm/CRMWorkflowPlugin.js";

export async function runBatch5Suite() {
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

    test("CRMWorkflowPlugin registers into ADERuntime and executes VIP onboarding workflows", () => {
        const bus = new EnterpriseEventBus();
        const runtime = new ADERuntime(bus);
        const obs = new ObservationEngine(bus);
        const exec = new AutonomousExecutionEngine(bus);
        
        runtime.registerEngine("observation", obs);
        runtime.registerEngine("execution", exec);
        runtime.boot();

        const crmPlugin = new CRMWorkflowPlugin({ tenantId: "enterprise-org-1" });
        runtime.registerPlugin(crmPlugin);

        const lead = { id: "L-9901", email: "ceo@enterprise.com", company: "Acme Corp", estimatedValue: 12000 };
        const result = crmPlugin.processLeadIngress(lead);
        
        assert.strictEqual(result.isHighValue, true);
        assert.strictEqual(crmPlugin.workflowsTriggered, 1);
        assert.strictEqual(obs.metrics().totalObserved, 1);
        assert.strictEqual(exec.metrics().totalExecuted, 1);
    });

    return { passed, failed };
}
