import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import EnterpriseOrchestrator from "../kernel/engine/EnterpriseOrchestrator.js";

export async function runOrchestratorSuite() {
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

    await test("Orchestrator cascades customer.registered across system modules", async () => {
        const bus = new EnterpriseEventBus();
        const orchestrator = new EnterpriseOrchestrator(bus);
        let completed = false;

        bus.subscribe("orchestration.completed", (data) => {
            assert.strictEqual(data.tenantId, "tenant-999");
            completed = true;
        });

        await bus.publish("customer.registered", { tenantId: "tenant-999", email: "user@enterprise.com" });
        assert.strictEqual(completed, true);
    });

    await test("EventBus routes unhandled subscriber failures to DLQ", async () => {
        const bus = new EnterpriseEventBus();
        bus.subscribe("fault.event", () => { throw new Error("Subscriber crashed"); });
        await bus.publish("fault.event", { data: "test" });
        assert.strictEqual(bus.dlq.length, 1);
    });

    return { passed, failed };
}
