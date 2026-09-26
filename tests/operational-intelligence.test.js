import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBusinessMeaning, extractQuantity, extractItem } from "../src/ingestion/BusinessMeaningExtractor.js";
import { routeLedger } from "../src/ingestion/OperationalLedgerRouter.js";
import {
  detectAll,
  detectUnresolvedCases,
  detectSupplierDelayRisk,
  detectCustomerComplaints,
  detectBottleneckFlags,
  detectEventFrequencySpike,
  detectRepeatedExceptions,
  predict
} from "../src/ingestion/OperationalSignals.js";
import { confidenceBand, actionMode, reviewReason } from "../src/ingestion/ConfidenceModel.js";
import { LearningLoop, LOOP_STAGES } from "../src/ingestion/LearningLoop.js";
import { TestBusinessAdapter } from "../src/ingestion/InjectionAdapter.js";
import { InjectionToCaseMapper } from "../src/ingestion/InjectionToCaseMapper.js";
import { UnifiedIntakeEngine } from "../src/intelligence/UnifiedIntakeEngine.js";

// Batch 9 proving tests: deterministic intelligence over existing substrate.
// No LLM, no prediction, no second ledger.

function stubStore() {
  const sections = {};
  return {
    calls: [],
    readSection(k) { return sections[k] ?? null; },
    writeSection(k, v) { sections[k] = v; this.calls.push(k); },
    _sections: sections
  };
}

function stubBus() {
  const published = [];
  return { published, publish(t, p) { published.push({ topic: t, payload: p }); } };
}

function stubCaseManager() {
  return {
    cases: new Map(),
    createCase(input = {}) {
      const record = { id: `CASE-2026-${String(this.cases.size + 1).padStart(4, "0")}`, ...input, history: [] };
      this.cases.set(record.id, record);
      return record;
    }
  };
}

const MILK = "Supplier delivered 20 cartons of milk.";

function milkMeaning() {
  const adapter = new TestBusinessAdapter({});
  const env = adapter.normalize({ text: MILK, organization: "Dairy Co", eventId: "evt-9a", eventType: "SUPPLIER_DELIVERY" });
  return { env, meaning: extractBusinessMeaning(env, null) };
}

test("9-event interpretation: supplier, delivery, quantity, item, tenant, time", () => {
  const { meaning } = milkMeaning();
  assert.equal(meaning.eventKind, "SUPPLIER_DELIVERY");
  assert.equal(meaning.category, "SUPPLY");
  assert.deepEqual(meaning.quantity, { value: 20, unit: "cartons", raw: "20 cartons" });
  assert.equal(meaning.item, "milk");
  assert.equal(meaning.party, "Dairy Co");
  assert.equal(meaning.tenantScope, "default");
  assert.ok(meaning.occurredAt && meaning.receivedAt);
  assert.equal(meaning.caseRef, null);
  assert.equal(meaning.aiUsed, false);
  assert.deepEqual(extractQuantity("no numbers here"), { value: null, unit: null, raw: null });
  assert.equal(extractItem("no quantity here"), null);
});

test("9-unsupported fields stay null, never invented", () => {
  const { meaning } = milkMeaning();
  assert.ok(Array.isArray(meaning.unknownFields) && meaning.unknownFields.length > 0);
  assert.equal(meaning.assessmentArea, null);
  const thin = extractBusinessMeaning(new TestBusinessAdapter({}).normalize({ text: "Hello." }));
  assert.equal(thin.confidence, 0.15);
});

test("9-structured meaning + case linkage", () => {
  const store = stubStore();
  const bus = stubBus();
  const cm = stubCaseManager();
  const intake = new UnifiedIntakeEngine({ caseManager: cm });
  const mapper = new InjectionToCaseMapper({ intake, store, eventBus: bus });
  const { env } = milkMeaning();
  const out = mapper.map(env, { actor: "9" });
  const withCase = { ...extractBusinessMeaning(env, cm.cases.get(out.caseId).request.assessment), caseRef: out.caseId };
  assert.equal(withCase.caseRef, out.caseId);
  assert.ok(withCase.assessmentArea);
  assert.ok(Number.isFinite(withCase.assessmentConfidence));
});

test("9-measurement linkage is a recommendation, not a write", () => {
  const { env, meaning } = milkMeaning();
  const plan = routeLedger({ envelope: env, meaning, caseRef: "CASE-2026-0001" });
  const byDest = Object.fromEntries(plan.legs.map((l) => [l.destination, l]));
  assert.equal(byDest.CASE.action, "RECORD");
  assert.equal(byDest.AUDIT.action, "RECORD");
  assert.equal(byDest.FEEDBACK.action, "RECOMMEND");
  assert.equal(byDest.MEASUREMENT.action, "RECOMMEND");
  assert.equal(byDest.MEASUREMENT.proposal.afterValue, 20);
  assert.equal(byDest.KNOWLEDGE.action, "SKIP");
  const thin = routeLedger({ envelope: env, meaning: { ...meaning, quantity: { value: null, unit: null, raw: null } }, caseRef: null });
  assert.equal(thin.legs.find((l) => l.destination === "MEASUREMENT").action, "SKIP");
  assert.throws(() => routeLedger({}), /LEDGER_ENVELOPE_REQUIRED/);
});

test("9-evidence-backed signals across records", () => {
  const now = "2026-09-23T15:00:00.000Z";
  const cases = [
    { id: "CASE-1", status: "DISCOVERY_REQUIRED", createdAt: "2026-09-01T00:00:00.000Z", request: { intent: "BUSINESS_ASSESSMENT", assessment: { humanReviewRequired: true, bottleneck: "manual intake queue" } } },
    { id: "CASE-2", status: "DISCOVERY_REQUIRED", createdAt: "2026-09-10T00:00:00.000Z", request: { intent: "GENERAL_INQUIRY", description: "supplier delivery delayed weeks waiting parts" } },
    { id: "CASE-3", status: "CLOSED", createdAt: "2026-09-20T00:00:00.000Z", request: { intent: "GENERAL_INQUIRY" } }
  ];
  const intakes = [{ intakeId: "INT-1", text: "customer complaint: support desk never replies" }];
  const events = Array.from({ length: 12 }, (_, i) => ({ receivedAt: "2026-09-23T1" + (i % 10) + ":00:00.000Z" }));
  const all = detectAll({ cases, intakes, events, options: { now, threshold: 10 } });
  const types = all.map((s) => s.type);
  for (const t of ["UNRESOLVED_CASES", "SUPPLIER_DELAY_RISK", "CUSTOMER_COMPLAINT", "BOTTLENECK_FLAG", "EVENT_FREQUENCY_SPIKE"]) {
    assert.ok(types.includes(t), `missing ${t}`);
  }
  for (const s of all) {
    assert.ok(Array.isArray(s.evidence) && s.evidence.length > 0, `${s.type} needs evidence`);
    assert.ok(["OBSERVED", "INFERRED"].includes(s.level));
  }
  assert.equal(detectUnresolvedCases([{ status: "CLOSED" }], { now }), null);
  assert.equal(detectRepeatedExceptions([{ request: { intent: "A" } }], { minRepeats: 3, now }), null);
  const rep = detectRepeatedExceptions([{ request: { intent: "A" }, id: "1" }, { request: { intent: "A" }, id: "2" }, { request: { intent: "A" }, id: "3" }], { now });
  assert.equal(rep.type, "REPEATED_EXCEPTIONS");
});

test("9-confidence bands truthful", () => {
  assert.equal(confidenceBand(0.9), "HIGH");
  assert.equal(confidenceBand(0.6), "MEDIUM");
  assert.equal(confidenceBand(0.35), "LOW");
  assert.equal(confidenceBand(0.1), "UNKNOWN");
  assert.equal(confidenceBand(NaN), "UNKNOWN");
});

test("9-human-review routing; consequential never auto", () => {
  assert.equal(actionMode({ category: "GENERAL", confidence: 0.9 }), "AUTO");
  assert.equal(actionMode({ category: "GENERAL", confidence: 0.6 }), "ASSISTED");
  assert.equal(actionMode({ category: "GENERAL", confidence: 0.2 }), "HUMAN_REVIEW");
  assert.equal(actionMode({ category: "TRADING", confidence: 0.99 }), "HUMAN_REVIEW");
  assert.equal(actionMode({ category: "FINANCIAL", confidence: 0.99 }), "HUMAN_REVIEW");
  assert.equal(actionMode({ category: "CREDENTIALS", confidence: 0.99 }), "HUMAN_REVIEW");
  assert.equal(actionMode({ category: "GENERAL", confidence: 0.9, providerRequired: true }), "PROVIDER_REQUIRED");
  assert.equal(actionMode({ category: "GENERAL", confidence: 0.9, rejected: true }), "REJECT");
  assert.ok(reviewReason({ category: "TRADING", confidence: 1 }).includes("always requires human review"));
});

test("9-unsupported predictive claims rejected", () => {
  assert.throws(() => predict(), /PREDICTIVE_UNAVAILABLE/);
});

test("9-learning loop: stages, persistence, reuse, tenant isolation", () => {
  const store = stubStore();
  const bus = stubBus();
  const loop = new LearningLoop({ store, eventBus: bus });
  const started = loop.startLoop({ capabilityKey: "SUPPLY_DELIVERY", tenantScope: "tenantA", actor: "t" });
  for (const s of ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REUSE"]) {
    loop.recordStage(started.loopId, s, { note: s });
  }
  assert.throws(() => loop.recordStage(started.loopId, "BOGUS"), /LOOP_STAGE_INVALID/);
  assert.throws(() => loop.recordStage(started.loopId, "OBSERVE"), /LOOP_STAGE_REGRESSION/);
  const done = loop.completeLoop(started.loopId, { outcome: "mapped to case", reusable: true, actor: "t" });
  assert.equal(done.reusable, true);
  assert.equal(loop.findReusable({ capabilityKey: "SUPPLY_DELIVERY", tenantScope: "tenantA" }).length, 1);
  assert.equal(loop.findReusable({ capabilityKey: "SUPPLY_DELIVERY", tenantScope: "tenantB" }).length, 0);
  const loop2 = new LearningLoop({ store, eventBus: stubBus() });
  assert.equal(loop2.get(started.loopId).stages.length, 10);
  assert.ok(store.calls.includes("learningLoop"));
  assert.ok(bus.published.some((p) => p.topic === "audit.log.created" && p.payload.category === "LEARNING_LOOP"));
  assert.ok(LOOP_STAGES.includes("EVALUATE"));
});

test("9-audit trail across intelligence path", () => {
  const store = stubStore();
  const bus = stubBus();
  const cm = stubCaseManager();
  const intake = new UnifiedIntakeEngine({ caseManager: cm });
  const mapper = new InjectionToCaseMapper({ intake, store, eventBus: bus });
  const { env, meaning } = milkMeaning();
  const out = mapper.map(env, { actor: "9audit" });
  routeLedger({ envelope: env, meaning, caseRef: out.caseId, eventBus: bus });
  const loop = new LearningLoop({ store, eventBus: bus });
  const l = loop.startLoop({ capabilityKey: "SUPPLY_DELIVERY" });
  loop.completeLoop(l.loopId, { outcome: "ok", reusable: true });
  const cats = bus.published.filter((p) => p.topic === "audit.log.created").map((p) => p.payload.category);
  for (const c of ["INJECTION", "LEARNING_LOOP"]) assert.ok(cats.includes(c), `missing audit ${c}`);
});

test("9-protected-intent rejection via confidence model", () => {
  assert.equal(actionMode({ category: "TRADING", confidence: 1 }), "HUMAN_REVIEW");
  assert.equal(actionMode({ category: "DESTRUCTIVE", confidence: 1 }), "HUMAN_REVIEW");
  assert.equal(actionMode({ category: "EXTERNAL_MUTATION", confidence: 1 }), "HUMAN_REVIEW");
});
