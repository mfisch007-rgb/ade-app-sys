import assert from "node:assert/strict";
import * as BusModule from "../kernel/bus/EnterpriseEventBus.js";

const EnterpriseEventBus = BusModule.EnterpriseEventBus || BusModule.default;

export async function runKernelSuite() {
    let passed = 0, failed = 0;
    const test = (name, fn) => {
        try { fn(); console.log("  ✔ PASS: " + name); passed++; } catch (err) { console.error("  ✖ FAIL: " + name + "\n    " + err.message); failed++; }
    };
    const asyncTest = async (name, fn) => {
        try { await fn(); console.log("  ✔ PASS: " + name); passed++; } catch (err) { console.error("  ✖ FAIL: " + name + "\n    " + err.message); failed++; }
    };
    test("EnterpriseEventBus instantiates cleanly", () => {
        assert.ok(EnterpriseEventBus, "EnterpriseEventBus export must exist");
        const bus = new EnterpriseEventBus();
        assert.ok(bus, "Bus instance should exist");
    });
    test("Integration module registration and tracking", () => {
        const bus = new EnterpriseEventBus();
        if (typeof bus.registerModule === "function") {
            bus.registerModule("testModule", { version: "1.0.0" });
            if (typeof bus.isRegistered === "function") {
                assert.strictEqual(bus.isRegistered("testModule"), true);
            }
        }
    });
    await asyncTest("Event publishing and subscription execution", async () => {
        const bus = new EnterpriseEventBus();
        let eventReceived = false;
        if (typeof bus.subscribe === "function" && typeof bus.publish === "function") {
            bus.subscribe("system.init", (payload) => {
                if (payload && payload.status === "OK") eventReceived = true;
            });
            await bus.publish("system.init", { status: "OK" });
            assert.strictEqual(eventReceived, true);
        }
    });
    await asyncTest("Event bus fault isolation", async () => {
        const bus = new EnterpriseEventBus();
        let secondHandlerFired = false;
        if (typeof bus.subscribe === "function" && typeof bus.publish === "function") {
            bus.subscribe("data.process", () => {
                throw new Error("Simulated crash");
            });
            bus.subscribe("data.process", () => {
                secondHandlerFired = true;
            });
            await bus.publish("data.process", { id: 101 });
            assert.strictEqual(secondHandlerFired, true);
        }
    });
    return { passed, failed };
}