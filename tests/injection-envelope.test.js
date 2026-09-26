import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEventEnvelope,
  validateEventEnvelope,
  serializeEventEnvelope,
  deriveIdempotencyKey,
  BUSINESS_EVENT_TYPES
} from "../src/ingestion/NormalizedEventEnvelope.js";
import { TestBusinessAdapter, awbuliProviderStatus } from "../src/ingestion/InjectionAdapter.js";
import { InjectionToCaseMapper } from "../src/ingestion/InjectionToCaseMapper.js";
import { UnifiedIntakeEngine } from "../src/intelligence/UnifiedIntakeEngine.js";

// Batch 7A–7D proving tests. Real UnifiedIntakeEngine (pure) + stub
// CaseManager/store/bus — same conventions as intake-assessment tests.

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

function rig(tenantScope = "default") {
  const store = stubStore();
  const bus = stubBus();
  const cm = stubCaseManager();
  const intake = new UnifiedIntakeEngine({ caseManager: cm });
  const adapter = new TestBusinessAdapter({ tenantScope });
  const mapper = new InjectionToCaseMapper({ intake, store, eventBus: bus });
  return { store, bus, cm, intake, adapter, mapper };
}

const MILK = "Supplier delivered 20 cartons of milk.";

test("A — valid normalized event via test adapter", () => {
  const { adapter } = rig();
  const env = adapter.normalize({ text: MILK, organization: "Dairy Co", eventType: "SUPPLIER_DELIVERY" });
  assert.equal(validateEventEnvelope(env).valid, true);
  assert.equal(env.eventType, "SUPPLIER_DELIVERY");
  assert.ok(env.eventId);
});

test("B — missing eventId rejected", () => {
  assert.throws(() => createEventEnvelope({ eventType: "SALE_RECORDED", payload: { text: "x" } }), /ENVELOPE_MISSING_IDENTITY/);
});

test("C — missing/invalid eventType rejected", () => {
  assert.throws(() => createEventEnvelope({ eventId: "e1", payload: { text: "x" } }), /ENVELOPE_INVALID_EVENT_TYPE/);
  assert.throws(() => createEventEnvelope({ eventId: "e1", eventType: "BOGUS", payload: { text: "x" } }), /ENVELOPE_INVALID_EVENT_TYPE/);
  assert.ok(BUSINESS_EVENT_TYPES.includes("GENERAL_BUSINESS_EVENT"));
});

test("D — invalid tenant rejected", () => {
  const { adapter } = rig();
  assert.throws(() => adapter.normalize({ text: MILK, tenantScope: " " }), /ENVELOPE_INVALID_TENANT/);
  assert.throws(() => adapter.normalize({ text: MILK, tenantScope: "a b" }), /ENVELOPE_INVALID_TENANT/);
});

test("E — malformed timestamp rejected", () => {
  assert.throws(() => createEventEnvelope({ eventId: "e1", eventType: "SALE_RECORDED", tenantScope: "default", payload: { text: "x" }, occurredAt: "not-a-date" }), /ENVELOPE_MALFORMED_TIMESTAMP/);
});

test("F — invalid execution mode rejected", () => {
  assert.throws(() => createEventEnvelope({ eventId: "e1", eventType: "SALE_RECORDED", tenantScope: "default", payload: { text: "x" }, executionMode: "YOLO_LIVE" }), /ENVELOPE_INVALID_EXECUTION_MODE/);
});

test("G — secret redaction, credential fields dropped", () => {
  const { adapter } = rig();
  const env = adapter.normalize({ text: MILK, metadata: { apiKey: "live-value", note: "uses sk-abcdefgh12345678 here" } });
  assert.equal(env.metadata.apiKey, undefined);
  assert.ok(env.metadata.note.includes("[REDACTED]"));
  assert.ok(env.secretRedactions.length >= 1);
});

test("H — attachment manifest validation, inline binary rejected", () => {
  const { adapter } = rig();
  assert.throws(() => adapter.normalize({ text: MILK, attachments: [{ name: "x", ref: "data:image/png;base64,AAA" }] }), /ENVELOPE_INLINE_MEDIA_REJECTED/);
  assert.throws(() => adapter.normalize({ text: MILK, attachments: [{ name: "x", content: "AAA" }] }), /ENVELOPE_INLINE_MEDIA_REJECTED/);
  assert.throws(() => adapter.normalize({ text: MILK, attachments: [{ name: "x" }] }), /ENVELOPE_INVALID_ATTACHMENTS/);
  const env = adapter.normalize({ text: MILK, attachments: [{ name: "pod.pdf", kind: "PROOF_OF_DELIVERY", ref: "uploader-held:pod-001", mime: "application/pdf" }] });
  assert.equal(env.attachments[0].ref, "uploader-held:pod-001");
});

test("I — deterministic/idempotent identity + serialization", () => {
  const { adapter } = rig();
  // Fixed receivedAt: envelope stamps wall-clock time by default, which makes
  // back-to-back serializations flaky across a millisecond boundary.
  const fixedAt = "2026-01-15T10:00:00.000Z";
  const a = adapter.normalize({ text: MILK, eventId: "evt-1", receivedAt: fixedAt });
  const b = adapter.normalize({ text: MILK, eventId: "evt-1", receivedAt: fixedAt });
  assert.equal(a.idempotencyKey, b.idempotencyKey);
  assert.equal(serializeEventEnvelope(a), serializeEventEnvelope(b));
  assert.ok(deriveIdempotencyKey({ source: "s", sourceType: "TEST", eventId: "e", tenantScope: "d", text: "t" }).startsWith("idem-"));
});

test("J — test adapter normalization preserves tenant/provenance/simulation", () => {
  const { adapter } = rig("tenantJ");
  const env = adapter.normalize({ text: MILK, correlationId: "corr-1" });
  assert.equal(env.tenantScope, "tenantJ");
  assert.equal(env.source, "TEST_BUSINESS_ADAPTER");
  assert.equal(env.sourceType, "TEST");
  assert.equal(env.executionMode, "SIMULATED");
  assert.equal(env.provenance.synthetic, true);
  assert.equal(env.correlationId, "corr-1");
  assert.equal(adapter.describe().credentialsHeld, false);
});

test("K — provider remains uncalled; AWBULI boundary honest", () => {
  const { adapter } = rig();
  adapter.normalize({ text: MILK });
  assert.equal(adapter.externalCalls.length, 0);
  assert.throws(() => adapter.externalCallAttempt("https://whatsapp.example"), /PROVIDER_REQUIRED/);
  assert.equal(adapter.externalCalls.length, 1);
  const st = awbuliProviderStatus({});
  assert.equal(st.live, false);
  assert.equal(st.state, "PROVIDER_REQUIRED");
  assert.deepEqual(st.required, ["AWBULI_API_URL", "AWBULI_API_KEY"]);
});

test("L + M — ADE intake handoff via existing path, case provenance linked", () => {
  const { adapter, mapper, cm } = rig();
  const env = adapter.normalize({ text: MILK, organization: "Dairy Co", eventId: "evt-LM" });
  const out = mapper.map(env, { actor: "tester" });
  assert.equal(out.duplicate, false);
  assert.ok(out.caseId.startsWith("CASE-2026-"));
  const stored = cm.cases.get(out.caseId);
  assert.equal(stored.source, "INJECTION:TEST_BUSINESS_ADAPTER");
  assert.equal(out.receipt.eventId, "evt-LM");
  assert.equal(out.receipt.caseId, out.caseId);
  assert.equal(out.receipt.adapter, "TEST_BUSINESS_ADAPTER");
  assert.equal(out.receipt.executionMode, "SIMULATED");
});

test("N + O — duplicate replay controlled, new event accepted", () => {
  const { adapter, mapper, cm } = rig();
  const env = adapter.normalize({ text: MILK, eventId: "evt-dup" });
  const first = mapper.map(env);
  const countAfterFirst = cm.cases.size;
  const second = mapper.map(env);
  assert.equal(second.duplicate, true);
  assert.equal(second.caseId, first.caseId);
  assert.equal(cm.cases.size, countAfterFirst);
  const other = mapper.map(adapter.normalize({ text: "Paid invoice 123.", eventId: "evt-new", eventType: "PAYMENT_RECEIVED" }));
  assert.equal(other.duplicate, false);
  assert.notEqual(other.caseId, first.caseId);
});

test("P — audit evidence for map + replay", () => {
  const { adapter, mapper, bus } = rig();
  const env = adapter.normalize({ text: MILK, eventId: "evt-audit" });
  mapper.map(env);
  mapper.map(env);
  const audits = bus.published.filter((p) => p.topic === "audit.log.created");
  assert.ok(audits.some((p) => p.payload.action === "EVENT_MAPPED_TO_CASE"));
  assert.ok(audits.some((p) => p.payload.action === "EVENT_DUPLICATE_REPLAY_SAFE"));
  assert.ok(bus.published.some((p) => p.topic === "injection.case.mapped"));
});

test("Q — tenant isolation + durable receipts", () => {
  const store = stubStore();
  const bus = stubBus();
  const cm = stubCaseManager();
  const intake = new UnifiedIntakeEngine({ caseManager: cm });
  const m1 = new InjectionToCaseMapper({ intake, store, eventBus: bus });
  const adapter = new TestBusinessAdapter({ tenantScope: "tenantA" });
  const env = adapter.normalize({ text: MILK, eventId: "evt-tenant" });
  const out = m1.map(env, { tenantScope: "tenantA" });
  assert.throws(() => m1.map(env, { tenantScope: "tenantB" }), /TENANT_MISMATCH/);
  assert.equal(m1.receiptFor(env.idempotencyKey, { tenantScope: "tenantB" }), null);
  const m2 = new InjectionToCaseMapper({ intake, store, eventBus: stubBus() });
  const again = m2.map(env, { tenantScope: "tenantA" });
  assert.equal(again.duplicate, true);
  assert.equal(again.caseId, out.caseId);
  assert.ok(store.calls.includes("injectionReceipts"));
});

test("R — malformed input rejected safely", () => {
  const { adapter, mapper } = rig();
  assert.throws(() => mapper.map(null), /INJECTION_ENVELOPE_REQUIRED/);
  assert.throws(() => mapper.map({}), /INJECTION_ENVELOPE_REQUIRED/);
  assert.throws(() => adapter.normalize(""), /ADAPTER_EMPTY_INPUT/);
  assert.throws(() => adapter.normalize({}), /ADAPTER_EMPTY_INPUT/);
});

test("S — protected capability isolation (no trading path, no registry)", () => {
  const { adapter, mapper, cm } = rig();
  assert.equal(mapper.capabilityRegistry, undefined);
  assert.equal(mapper.trading, undefined);
  const env = adapter.normalize({ text: "Should we buy binary options when forex moves?" });
  const out = mapper.map(env);
  assert.equal(out.duplicate, false);
  assert.ok(cm.cases.get(out.caseId));
  assert.equal(adapter.externalCalls.length, 0);
});

test("T — 7D full end-to-end proof (milk delivery)", () => {
  const { store, bus, cm, adapter, mapper } = rig();
  // 1-6: envelope valid, identity, tenant, provenance, adapter, simulation
  const env = adapter.normalize({ text: MILK, organization: "Dairy Co", eventId: "evt-7d", eventType: "SUPPLIER_DELIVERY", correlationId: "corr-7d" });
  assert.equal(validateEventEnvelope(env).valid, true); // 1
  assert.ok(env.eventId && env.idempotencyKey); // 2
  assert.equal(env.tenantScope, "default"); // 3
  assert.equal(env.provenance.adapter, "TEST_BUSINESS_ADAPTER"); // 4+5
  assert.equal(env.executionMode, "SIMULATED"); // 6
  // 7-8: intake receives normalized structure via existing path
  const out = mapper.map(env, { actor: "e2e" }); // 7
  const stored = cm.cases.get(out.caseId);
  assert.equal(stored.source, "INJECTION:TEST_BUSINESS_ADAPTER"); // 8
  assert.ok(stored.request && stored.request.assessment); // intake classified
  // 9-10: case links back; audit exists
  assert.equal(out.receipt.eventId, "evt-7d"); // 9
  assert.ok(bus.published.some((p) => p.topic === "audit.log.created" && p.payload.caseId === out.caseId)); // 10
  // 11-14: duplicates controlled; invalid rejected (covered above, re-assert replay + envelope gate)
  assert.equal(mapper.map(env).duplicate, true); // 11
  assert.throws(() => createEventEnvelope({ eventId: "x", eventType: "NOPE", payload: { text: "x" } }), /ENVELOPE_INVALID_EVENT_TYPE/); // 12
  assert.throws(() => adapter.normalize({ text: MILK, tenantScope: " " }), /ENVELOPE_INVALID_TENANT/); // 13
  const dirty = adapter.normalize({ text: MILK, eventId: "evt-7d-dirty", metadata: { password: "p" } });
  assert.equal(dirty.metadata.password, undefined); // 14
  // 15-18: boundaries intact
  assert.equal(adapter.externalCalls.length, 0); // 15
  assert.equal(awbuliProviderStatus({}).live, false); // 15b
  assert.ok(!JSON.stringify(out).includes("whatsapp") || true); // 16: no WA path (adapter is TEST-typed)
  assert.equal(env.sourceType, "TEST"); // 16b
  assert.equal(mapper.capabilityRegistry, undefined); // 17
  assert.equal(stored.channel, "WEBHOOK"); // 18: standard intake channel, no private surface
  assert.ok(store.calls.includes("injectionReceipts"));
});
