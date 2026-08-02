import assert from "node:assert/strict";
import EnterpriseEventBus from "../kernel/bus/EnterpriseEventBus.js";
import KnowledgeEngine from "../kernel/engine/KnowledgeEngine.js";
import DecisionEngine from "../kernel/engine/DecisionEngine.js";
import EvaluationEngine from "../kernel/engine/EvaluationEngine.js";

export async function runBatch3Suite() {
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

    test("KnowledgeEngine links entities and builds semantic graph", () => {
        const bus = new EnterpriseEventBus();
        const ke = new KnowledgeEngine(bus);
        ke.initialize(); ke.start();
        ke.linkEntity("tenant-100", "OWNS", "project-alpha");
        const relations = ke.getRelations("tenant-100");
        assert.strictEqual(relations.length, 1);
        assert.strictEqual(relations[0].target, "project-alpha");
    });

    test("DecisionEngine registers policies and evaluates decisions", () => {
        const bus = new EnterpriseEventBus();
        const de = new DecisionEngine(bus);
        de.initialize(); de.start();
        de.register("HIGH_VALUE_APPROVAL", (ctx) => ({ approved: ctx.amount > 1000 }));
        const res = de.evaluateDecision("HIGH_VALUE_APPROVAL", { amount: 5000 });
        assert.strictEqual(res.result.approved, true);
    });

    test("EvaluationEngine evaluates outcome confidence", () => {
        const bus = new EnterpriseEventBus();
        const ee = new EvaluationEngine(bus);
        ee.initialize(); ee.start();
        const audit = ee.evaluateOutcome("EXEC-1", { status: "SENT" }, { status: "SENT" });
        assert.strictEqual(audit.success, true);
        assert.strictEqual(audit.confidenceScore, 1.0);
    });

    return { passed, failed };
}
