import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import StorageEngine from "../kernel/engine/StorageEngine.js";
import MemoryEngine from "../kernel/engine/MemoryEngine.js";

export async function runBatch6Suite() {
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

    await test("StorageEngine writes persistent entries adhering to Engine Contract", async () => {
        const bus = new EnterpriseEventBus();
        const storage = new StorageEngine(bus);
        storage.initialize(); storage.start();
        await storage.set("sys_config", { env: "production" });
        const val = await storage.get("sys_config");
        assert.deepStrictEqual(val, { env: "production" });
        assert.strictEqual(storage.metrics().writeCount, 1);
    });

    await test("MemoryEngine syncs state to StorageEngine on remember", async () => {
        const bus = new EnterpriseEventBus();
        const storage = new StorageEngine(bus);
        storage.initialize(); storage.start();
        const memory = new MemoryEngine(bus, storage);
        memory.initialize(); memory.start();
        await memory.remember("tenant:auth:01", { active: true });
        const persisted = await storage.get("tenant:auth:01");
        assert.strictEqual(persisted.value.active, true);
    });

    return { passed, failed };
}
