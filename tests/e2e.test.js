import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";

export async function runE2ESuite() {
    let passed = 0, failed = 0;
    const test = async (name, fn) => {
        try {
            await fn();
            console.log("  ̓V PASS: " + name);
            passed++;
        } catch (err) {
            console.error("  ͖ FAIL: " + name + "\n    " + err.message);
            failed++;
        }
    };

    await test("E2E Pipeline: Event Registration -> Processing -> Bus Propagation", async () => {
        const bus = new EnterpriseEventBus();
        const records = [];
        bus.subscribe("lead.received", async (payload) => {
            records.push({ step: 1, id: payload.id });
        });
        bus.subscribe("lead.received", async () => {
            records.push({ step: 2, status: "PROCESSED" });
        });
        await bus.publish("lead.received", { id: "LEAD-8899" });
        assert.strictEqual(records.length, 2);
        assert.strictEqual(records[0].id, "LEAD-8899");
    });

    await test("E2E Hardening: High Velocity Event Stress Test", async () => {
        const bus = new EnterpriseEventBus();
        let count = 0;
        bus.subscribe("telemetry.tick", () => { count++; });
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(bus.publish("telemetry.tick", { seq: i }));
        }
        await Promise.all(promises);
        assert.strictEqual(count, 50);
    });

    return { passed, failed };
}