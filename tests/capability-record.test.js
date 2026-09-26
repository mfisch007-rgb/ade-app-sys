import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  createCapabilityRecord,
  createDecisionRecord,
  serializeCapabilityRecord,
  transitionRecord,
  buildCapabilityId,
  isProtectedIntent
} from "../src/capabilities/CapabilityRecord.js";
import { CapabilityRecordStore } from "../src/capabilities/CapabilityRecordStore.js";
import { CapabilityRegistry } from "../src/core/CapabilityRegistry.js";
import { CapabilityActivation } from "../src/capabilities/CapabilityActivation.js";
import { EditionPolicy } from "../src/core/EditionPolicy.js";

// Batch 6D-1 + 6D-2 proving tests. Reuses repo conventions: node:test,
// assert/strict, stub store shaped like RuntimeConfigStore sections.

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

function fakeRegistry() {
  const registered = [];
  return {
    registered,
    registerCapability(cap, opts) {
      registered.push({ cap, opts });
      return { intent: cap.intent, handler: cap.handler };
    }
  };
}

function service(over = {}) {
  const store = stubStore();
  const bus = stubBus();
  const registry = fakeRegistry();
  const svc = new CapabilityRecordStore({ store, eventBus: bus, capabilityRegistry: registry, ...over });
  return { svc, store, bus, registry };
}

const BASE = {
  intent: "PROCARTA_EXECUTE",
  name: "ProCarta assessment execution",
  sourceSystem: "ADE",
  sourceVersion: "1.0.0",
  tenantScope: "default",
  executionMode: "LOCAL_LIVE"
};

test("1 + 3 — valid capability record registers with identity", () => {
  const { svc } = service();
  const r = svc.register({ ...BASE });
  assert.ok(r.capabilityId.startsWith("CAP-"));
  assert.equal(r.status, "DISCOVERED");
  assert.equal(r.integrationMethod, "UNKNOWN");
  assert.equal(svc.get(r.capabilityId).intent, "PROCARTA_EXECUTE");
});

test("2 + 3 — malformed record and missing identity rejected", () => {
  const { svc } = service();
  assert.throws(() => svc.register({}), /CAPABILITY_IDENTITY_REQUIRED/);
  assert.throws(() => svc.register({ name: "no intent" }), /CAPABILITY_IDENTITY_REQUIRED/);
  const rec = createCapabilityRecord({ intent: "X", status: "BOGUS" });
  assert.equal(rec.status, "DISCOVERED");
});

test("8 — secret values redacted, credential fields dropped", () => {
  const { svc } = service();
  const r = svc.register({
    ...BASE,
    intent: "EXTERNAL_BRIDGE_PROBE",
    inputs: { endpoint: "https://x.example", apiKey: "live-secret-value", nested: { password: "hunter2" } },
    description: "uses sk-abcdefgh12345678 token"
  });
  assert.equal(r.inputs.apiKey, undefined);
  assert.equal(r.inputs.nested.password, undefined);
  assert.ok(r.description.includes("[REDACTED]"));
  assert.ok(r.secretRedactions.length >= 2);
});

test("9 — deterministic serialization", () => {
  const fixed = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const a = createCapabilityRecord({ ...BASE, ...fixed, evidence: ["b", "a"] });
  const b = createCapabilityRecord({ ...BASE, ...fixed, evidence: ["b", "a"] });
  assert.equal(serializeCapabilityRecord(a), serializeCapabilityRecord(b));
  assert.equal(buildCapabilityId({ intent: "X", sourceSystem: "S", sourceVersion: "1" }), buildCapabilityId({ intent: "X", sourceSystem: "S", sourceVersion: "1" }));
});

test("6 + 7 — tenant isolation on read, list and mutation", () => {
  const { svc } = service();
  const r = svc.register({ ...BASE, intent: "TENANT_CASE_VIEW", tenantScope: "tenantA" }, { tenantScope: "tenantA" });
  assert.equal(svc.list({ tenantScope: "tenantA" }).length, 1);
  assert.equal(svc.list({ tenantScope: "tenantB" }).length, 0);
  assert.throws(() => svc.get(r.capabilityId, { tenantScope: "tenantB" }), /TENANT_MISMATCH/);
  assert.throws(() => svc.updateState(r.capabilityId, "PARSED", { tenantScope: "tenantB" }), /TENANT_MISMATCH/);
  const ok = svc.updateState(r.capabilityId, "PARSED", { tenantScope: "tenantA", actor: "tester" });
  assert.equal(ok.status, "PARSED");
});

test("17 + 18 — invalid transitions rejected, valid chain works", () => {
  const { svc } = service();
  const r = svc.register({ ...BASE, intent: "STATE_PROBE" });
  assert.throws(() => svc.updateState(r.capabilityId, "ACTIVE", { actor: "t" }), /INVALID_STATE_TRANSITION/);
  for (const s of ["PARSED", "UNDERSTOOD", "MATCHED", "PROPOSED"]) svc.updateState(r.capabilityId, s, { actor: "t" });
  assert.equal(svc.get(r.capabilityId).status, "PROPOSED");
  assert.throws(() => transitionRecord(svc.get(r.capabilityId), "BOGUS"), /UNKNOWN_STATE/);
});

test("10 — CapabilityExchange comparison folds into a MATCHED record", () => {
  const { svc } = service();
  const r = svc.recordFromExchange({
    productId: "awbuli",
    compare: {
      id: "awbuli",
      product: "AWBULI",
      direction: "ADE↕PRODUCT",
      productCapabilities: ["MANIFEST:awbuli@1.0.0", "ADAPTER_PRESENT"],
      overlap: [{ product: "X", ade: "Y" }],
      missingCapabilities: ["WHATSAPP_TRANSPORT"],
      requiredHumanAction: "configure bridge"
    },
    actor: "tester"
  });
  assert.equal(r.status, "MATCHED");
  assert.equal(r.integrationMethod, "UNKNOWN");
  assert.ok(r.evidence.join(" ").includes("WHATSAPP_TRANSPORT"));
  assert.throws(() => svc.recordFromExchange({}), /COMPARE_OUTPUT_REQUIRED/);
});

test("11 — PROCARTA canonical proof: REUSE decision (already ADE-owned)", () => {
  const { svc } = service();
  const cap = svc.register({ ...BASE, intent: "PROCARTA_EXECUTE", sourceSystem: "ADE" });
  const d = svc.recordDecision({
    capabilityId: cap.capabilityId,
    method: "REUSE",
    rationale: "Canonical ADE-owned execution engine; tested G26 contract. No second engine justified.",
    confidence: 0.95
  }, { actor: "tester" });
  assert.equal(d.method, "REUSE");
  assert.equal(svc.listDecisions({ capabilityId: cap.capabilityId }).length, 1);
});

test("12 — external ProCarta BPMN proof: ADAPT with evidence", () => {
  const { svc } = service();
  const cap = svc.register({
    intent: "BPMN_EXPORT",
    name: "BPMN XML export pattern",
    sourceSystem: "ADE-PROCARTA",
    sourceVersion: "7dd0b3a",
    sourceReference: "src/utils/bpmnExporter.js",
    executionMode: "LOCAL_LIVE",
    evidence: ["pure function company->BPMN XML", "zero dependencies beyond string building"]
  });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "ADAPT", rationale: "Render ADE findings through the XML pattern; import no engine.", confidence: 0.7 });
  assert.equal(d.method, "ADAPT");
});

test("13 — legacy SIMULATED plugin proof: KEEP_SEPARATE", () => {
  const { svc } = service();
  const cap = svc.register({ intent: "PROCARTA_FINANCE_RECONCILE", sourceSystem: "ADE-LEGACY-PLUGIN", executionMode: "SIMULATED", evidence: ["self-labeled SIMULATED", "random audit hash"] });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "KEEP_SEPARATE", rationale: "Mock/demo surface; canonical engine owns reconciliation.", confidence: 0.9 });
  assert.equal(d.method, "KEEP_SEPARATE");
});

test("4 + 5 + 14 — AWBULI WhatsApp proof: PROVIDER_REQUIRED, never live", () => {
  const { svc } = service();
  const cap = svc.register({
    intent: "WHATSAPP_TRANSPORT",
    sourceSystem: "AWBULI-SPEC",
    executionMode: "PROVIDER_GATED",
    providerRequirements: ["AWBULI_API_URL", "AWBULI_API_KEY"],
    evidence: ["no live transport in tree", "legacy Baileys surface dead"]
  });
  const d = svc.recordDecision({
    capabilityId: cap.capabilityId,
    method: "PROVIDER_REQUIRED",
    rationale: "Live provider not configured; do not present as live.",
    requiredProvider: ["AWBULI_API_URL", "AWBULI_API_KEY"],
    requiredHumanAction: "Founder supplies endpoint + key, verifies via ConnectionManager.test.",
    confidence: 0.85
  });
  assert.equal(d.method, "PROVIDER_REQUIRED");
  assert.deepEqual(d.requiredProvider, ["AWBULI_API_URL", "AWBULI_API_KEY"]);
  assert.ok(cap.executionMode, "PROVIDER_GATED");
});

test("15 — AWBULI multilingual proof: HUMAN_REVIEW on insufficient evidence", () => {
  const { svc } = service();
  const cap = svc.register({ intent: "MULTILINGUAL_NLU", sourceSystem: "AWBULI-SPEC", executionMode: "UNKNOWN" });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "HUMAN_REVIEW", rationale: "No implementation evidence; Drive BLOCKED.", confidence: 0.2 });
  assert.equal(d.method, "HUMAN_REVIEW");
});

test("15b — AWBULI ledger-substrate proof: REUSE/ADAPT where evidence supports", () => {
  const { svc } = service();
  const cap = svc.register({ intent: "OPERATIONAL_LEDGER", sourceSystem: "AWBULI-SPEC", executionMode: "LOCAL_LIVE", evidence: ["ADE cases 17-state machine", "measurements", "audit ledger"] });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "ADAPT", rationale: "Cases/measurements serve as ledger substrate; no second ledger.", confidence: 0.8 });
  assert.equal(d.method, "ADAPT");
});

test("16 — rejected decision + identity/reason gate", () => {
  const { svc } = service();
  const cap = svc.register({ ...BASE, intent: "REJECT_PROBE" });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "HUMAN_REVIEW", rationale: "needs eyes" });
  assert.throws(() => svc.authorizeDecision(d.decisionId, { approved: true, decidedBy: "", reason: "x" }), /APPROVAL_IDENTITY_AND_REASON_REQUIRED/);
  const rej = svc.authorizeDecision(d.decisionId, { approved: false, decidedBy: "founder", reason: "out of scope" });
  assert.equal(rej.authorization.state, "REJECTED");
  assert.throws(() => svc.authorizeDecision(d.decisionId, { approved: true, decidedBy: "f", reason: "x" }), /DECISION_NOT_PENDING/);
});

test("19 + 20 — durable save/retrieve across instances", () => {
  const store = stubStore();
  const bus = stubBus();
  const a = new CapabilityRecordStore({ store, eventBus: bus });
  const cap = a.register({ ...BASE, intent: "DURABLE_PROBE" });
  a.recordDecision({ capabilityId: cap.capabilityId, method: "REUSE", rationale: "persist me" });
  assert.ok(store.calls.includes("capabilityRecords"));
  assert.ok(store.calls.includes("integrationDecisions"));
  const b = new CapabilityRecordStore({ store, eventBus: stubBus() });
  assert.equal(b.get(cap.capabilityId).intent, "DURABLE_PROBE");
  assert.equal(b.listDecisions({ capabilityId: cap.capabilityId }).length, 1);
  const auditTopics = bus.published.map((p) => p.topic);
  assert.ok(auditTopics.includes("audit.log.created"));
});

test("21 — recording/approving NEVER auto-activates", () => {
  const { svc, registry } = service();
  const cap = svc.register({ ...BASE, intent: "NOAUTO_PROBE" });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "REGISTER", rationale: "approved but inert" });
  svc.authorizeDecision(d.decisionId, { approved: true, decidedBy: "admin", reason: "looks safe" });
  assert.equal(registry.registered.length, 0);
});

test("21b — authorizedActivate requires approval + real handler, then delegates", () => {
  const { svc, registry } = service();
  const cap = svc.register({ ...BASE, intent: "SAFE_LAMP" });
  const d = svc.recordDecision({ capabilityId: cap.capabilityId, method: "REGISTER", rationale: "ok" });
  assert.throws(() => svc.authorizedActivate({ decisionId: d.decisionId, intent: "SAFE_LAMP", handler: () => ({}), decidedBy: "a", reason: "r" }), /DECISION_NOT_APPROVED/);
  svc.authorizeDecision(d.decisionId, { approved: true, decidedBy: "admin", reason: "verified" });
  assert.throws(() => svc.authorizedActivate({ decisionId: d.decisionId, intent: "SAFE_LAMP", decidedBy: "a", reason: "r" }), /APPROVAL_HANDLER_REQUIRED/);
  const out = svc.authorizedActivate({ decisionId: d.decisionId, intent: "SAFE_LAMP", handler: () => ({ on: true }), decidedBy: "admin", reason: "verified" });
  assert.equal(out.intent, "SAFE_LAMP");
  assert.equal(out.runtimeBound, true);
  assert.equal(registry.registered.length, 1);
});

test("22 — protected trading/Forex/Binary/Gaming boundary", () => {
  const { svc } = service();
  assert.ok(isProtectedIntent("BINARY_REGULAR"));
  assert.ok(isProtectedIntent("forex_signal"));
  assert.ok(!isProtectedIntent("PROCARTA_EXECUTE"));
  assert.throws(() => svc.register({ ...BASE, intent: "BINARY_REGULAR" }), /PROTECTED_CAPABILITY/);
  const el = svc.register({ ...BASE, intent: "BINARY_REGULAR" }, { elevated: true, actor: "founder" });
  assert.equal(el.intent, "BINARY_REGULAR");
  assert.throws(
    () => svc.authorizedActivate({ capabilityId: el.capabilityId, intent: "BINARY_REGULAR", handler: () => ({}), decidedBy: "x", reason: "y" }),
    /PROTECTED_CAPABILITY/,
    "non-elevated activation of a protected intent is rejected at the boundary"
  );
  const { svc: s2 } = service();
  const c2 = s2.register({ ...BASE, intent: "GAMING_ROUND" }, { elevated: true });
  const d2 = s2.recordDecision({ capabilityId: c2.capabilityId, method: "KEEP_SEPARATE", rationale: "excluded" });
  s2.authorizeDecision(d2.decisionId, { approved: true, decidedBy: "founder", reason: "reviewed" });
  assert.throws(() => s2.authorizedActivate({ decisionId: d2.decisionId, intent: "GAMING_ROUND", handler: () => ({}), decidedBy: "founder", reason: "reviewed" }), /PROTECTED_CAPABILITY/);
});

test("23 — existing CapabilityRegistry compatibility (isolated store file)", () => {
  const tmp = path.join(os.tmpdir(), `ade-capreg-test-${process.pid}.json`);
  try {
    const reg = new CapabilityRegistry({ storePath: tmp });
    const rec = reg.registerCapability({ intent: "TEST_LAMP_6D", name: "Test lamp", handler: () => ({ on: true }) }, { persist: false });
    assert.equal(rec.intent, "TEST_LAMP_6D");
    const pub = reg.publicRecord(rec);
    assert.equal(pub.handler, undefined);
    assert.equal(pub.runtimeBound, true);
    assert.ok(reg.listCapabilities().some((c) => c.intent === "TEST_LAMP_6D"));
    assert.ok(reg.getCapability("PING"));
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
});

test("24 — existing CapabilityActivation compatibility", () => {
  const act = new CapabilityActivation({
    capabilityRegistry: { listCapabilities: () => [{ intent: "PROCARTA_EXECUTE" }] },
    editionPolicy: new EditionPolicy(),
    providerStatus: () => ({ configuredProviderCount: 0 })
  });
  const rows = act.assess();
  assert.ok(Array.isArray(rows) && rows.length > 0);
  const gw = rows.find((r) => r.intent === "UNIVERSAL_AI_GATEWAY");
  assert.ok(gw && /lexical fallback/.test(gw.detail));
});
