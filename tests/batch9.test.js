import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import MultiChannelAdapter from "../kernel/channel/MultiChannelAdapter.js";
import OfflineQueueEngine from "../kernel/engine/OfflineQueueEngine.js";
import FinancialSettlementEngine from "../kernel/engine/FinancialSettlementEngine.js";

export async function runBatch9Suite() {
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

    await test("MultiChannelAdapter normalizes WhatsApp and USSD enterprise inputs", async () => {
        const bus = new EnterpriseEventBus();
        const adapter = new MultiChannelAdapter(bus);
        
        const waMsg = adapter.normalizeIncomingMessage("WHATSAPP", { from: "2348000000000", text: { body: "Hello ADE" } });
        assert.strictEqual(waMsg.sender, "2348000000000");
        assert.strictEqual(waMsg.text, "Hello ADE");

        const ussdMsg = adapter.normalizeIncomingMessage("USSD", { phoneNumber: "254700000000", text: "*123*1#", sessionId: "S-99" });
        assert.strictEqual(ussdMsg.sender, "254700000000");
        assert.strictEqual(ussdMsg.metadata.sessionId, "S-99");
    });

    await test("OfflineQueueEngine retains tasks offline and flushes on connection recovery", async () => {
        const bus = new EnterpriseEventBus();
        const queueEngine = new OfflineQueueEngine(bus);
        queueEngine.initialize(); queueEngine.start();
        
        queueEngine.enqueue({ task: "SYNC_CUSTOMER_PAYLOAD", id: 1 });
        queueEngine.enqueue({ task: "SYNC_CUSTOMER_PAYLOAD", id: 2 });
        assert.strictEqual(queueEngine.metrics().queuedItems, 2);

        const processed = [];
        queueEngine.flush((item) => processed.push(item.id));
        assert.strictEqual(processed.length, 2);
        assert.strictEqual(queueEngine.metrics().queuedItems, 0);
    });

    await test("FinancialSettlementEngine processes multi-currency regional settlements", async () => {
        const bus = new EnterpriseEventBus();
        const finEngine = new FinancialSettlementEngine(bus);
        finEngine.initialize(); finEngine.start();
        
        const tx = finEngine.processSettlement("REF-8899", 50000, "NGN", "MOBILE_MONEY", { tenantId: "merchant-1" });
        assert.strictEqual(tx.settled, true);
        assert.strictEqual(tx.currency, "NGN");
        assert.strictEqual(finEngine.metrics().totalSettlements, 1);
    });

    return { passed, failed };
}
