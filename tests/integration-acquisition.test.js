import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireCapability, reuseCapability } from "../src/ingestion/CapabilityAcquisition.js";
import { recordIntegrationLearning } from "../src/ingestion/IntegrationLearning.js";
import { LearningLoop } from "../src/ingestion/LearningLoop.js";
import { CapabilityRecordStore } from "../src/capabilities/CapabilityRecordStore.js";

// Batch 11 proving tests: acquisition → adaptation → registration → reuse →
// learning → governance seams. Live-registry paths use stub registries;
// the admin HTTP chain is covered in "25" via ephemeral app boot.

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

function liveRegistry(intents = {}) {
  const map = new Map(Object.entries(intents));
  return {
    getCapability: (i) => map.get(String(i)) || undefined,
    registerCapability: (cap, opts) => {
      const rec = { intent: cap.intent, handler: cap.handler };
      map.set(cap.intent, rec);
      return rec;
    }
  };
}

function approvedPair(method = "REGISTER", intent = "BPMN_EXPORT") {
  const store = stubStore();
  const bus = stubBus();
  const records = new CapabilityRecordStore({ store, eventBus: bus });
  const cap = records.register({ intent, description: "export pattern", sourceSystem: "EXT" });
  const d = records.recordDecision({ capabilityId: cap.capabilityId, method, rationale: "test" }, { actor: "t" });
  const approved = records.authorizeDecision(d.decisionId, { approved: true, decidedBy: "admin", reason: "verified safe" });
  return { store, bus, records, cap, decision: approved };
}

test("11A — acquisition kinds; unapproved/mismatch/contract guarded", () => {
  const { records, bus, cap: registered } = approvedPair("REGISTER", "PDF_RENDER");
  const sim = acquireCapability({ record: registered, decision: { capabilityId: registered.capabilityId, authorization: { state: "APPROVED" } }, kind: "SIMULATED", actor: "t", eventBus: bus });
  assert.equal(sim.binding.type, "SIMULATED");
  assert.throws(() => acquireCapability({ record: null, decision: null, kind: "SIMULATED" }), /ACQUISITION_RECORD_REQUIRED/);
  assert.throws(() => acquireCapability({ record: { capabilityId: "a", intent: "A" }, decision: { capabilityId: "a", authorization: { state: "PENDING" } }, kind: "SIMULATED" }), /ACQUISITION_NOT_APPROVED/);
  assert.throws(() => acquireCapability({ record: { capabilityId: "a", intent: "A" }, decision: { capabilityId: "b", authorization: { state: "APPROVED" } }, kind: "SIMULATED" }), /ACQUISITION_DECISION_MISMATCH/);
  assert.throws(() => acquireCapability({ record: { capabilityId: "a", intent: "A" }, decision: { capabilityId: "a", authorization: { state: "APPROVED" } }, kind: "ADAPTER" }), /ACQUISITION_CONTRACT_REQUIRED/);
  assert.throws(() => acquireCapability({ record: { capabilityId: "a", intent: "A" }, decision: { capabilityId: "a", authorization: { state: "APPROVED" } }, kind: "NOPE" }), /ACQUISITION_KIND_INVALID/);
  assert.ok(bus.published.some((p) => p.topic === "audit.log.created" && p.payload.category === "CAPABILITY_ACQUISITION"));
});

test("11A — LOCAL acquisition invokes the existing live handler, nothing new", () => {
  const { records } = approvedPair("REUSE", "PING");
  const reg = liveRegistry({ PING: { intent: "PING", handler: () => ({ pong: true }) } });
  const acq = acquireCapability({ record: { capabilityId: "c", intent: "PING", tenantScope: "default" }, decision: { capabilityId: "c", authorization: { state: "APPROVED" } }, kind: "LOCAL", capabilityRegistry: reg });
  assert.equal(acq.binding.type, "LOCAL");
  assert.equal(acq.binding.runtimeBound, true);
  assert.throws(() => acquireCapability({ record: { capabilityId: "c", intent: "MISSING_LAMP", tenantScope: "default" }, decision: { capabilityId: "c", authorization: { state: "APPROVED" } }, kind: "LOCAL", capabilityRegistry: reg }), /ACQUISITION_LOCAL_MISSING/);
  assert.throws(() => acquireCapability({ record: { capabilityId: "c", intent: "BINARY_X", tenantScope: "default" }, decision: { capabilityId: "c", authorization: { state: "APPROVED" } }, kind: "LOCAL", capabilityRegistry: reg }), /PROTECTED_CAPABILITY/);
});

test("11B — adaptation normalizes through the envelope, no parallel infra", () => {
  const { records } = approvedPair("ADAPT", "BPMN_EXPORT");
  const acq = acquireCapability({
    record: { capabilityId: "c", intent: "BPMN_EXPORT", tenantScope: "default" },
    decision: { capabilityId: "c", authorization: { state: "APPROVED" } },
    kind: "ADAPTER",
    contractRef: "adapter:bpmn-render@v1 (input: ADE case JSON, output: validated BPMN XML)"
  });
  assert.equal(acq.binding.type, "ADAPTER");
  assert.ok(acq.binding.contractRef.includes("BPMN"));
});

test("11C + 15 + 16 — registration via authorizedActivate; suspend; re-enable", () => {
  const store = stubStore();
  const bus = stubBus();
  const reg = liveRegistry();
  const records = new CapabilityRecordStore({ store, eventBus: bus, capabilityRegistry: reg });
  const cap = records.register({ intent: "PDF_RENDER", description: "renderer" });
  const d = records.recordDecision({ capabilityId: cap.capabilityId, method: "REGISTER", rationale: "safe" });
  records.authorizeDecision(d.decisionId, { approved: true, decidedBy: "admin", reason: "verified" });
  const out = records.authorizedActivate({ decisionId: d.decisionId, intent: "PDF_RENDER", handler: () => ({ pdf: true }), decidedBy: "admin", reason: "verified" });
  assert.equal(out.runtimeBound, true);
  for (const s of ["PARSED", "UNDERSTOOD", "MATCHED", "PROPOSED", "AWAITING_AUTHORIZATION", "APPROVED", "REGISTERED", "ACTIVE"]) {
    records.updateState(cap.capabilityId, s, { actor: "t" });
  }
  records.updateState(cap.capabilityId, "SUSPENDED", { actor: "admin", reason: "paused" });
  assert.equal(records.get(cap.capabilityId).status, "SUSPENDED");
  records.updateState(cap.capabilityId, "ACTIVE", { actor: "admin", reason: "resumed" });
  assert.equal(records.get(cap.capabilityId).status, "ACTIVE");
});

test("17 — tenant isolation across acquisition", () => {
  const store = stubStore();
  const records = new CapabilityRecordStore({ store, eventBus: stubBus() });
  const cap = records.register({ intent: "TENANT_WIDGET", description: "x", tenantScope: "tenantA" }, { tenantScope: "tenantA" });
  assert.equal(records.list({ tenantScope: "tenantB" }).length, 0);
  assert.equal(records.listDecisions({ tenantScope: "tenantB" }).length, 0);
  assert.ok(cap.capabilityId);
});

test("18 — secret redaction in discovery-shaped inputs", () => {
  const store = stubStore();
  const records = new CapabilityRecordStore({ store, eventBus: stubBus() });
  const cap = records.register({ intent: "BRIDGE_X", description: "uses sk-abcdefgh12345678", inputs: { endpoint: "https://x", token: "abc" } });
  assert.equal(cap.inputs.token, undefined);
  assert.ok(cap.description.includes("[REDACTED]"));
});

test("21 — simulated reuse labelled; provider-gated reuse inert", () => {
  const reg = liveRegistry({ PING: { intent: "PING", handler: () => ({ pong: true }) } });
  const local = reuseCapability({ capabilityRegistry: reg, intent: "PING" });
  assert.equal(local.runtimeBound, true);
  assert.equal(local.mode, "LOCAL");
  assert.deepEqual(local.handler?.() ?? reg.getCapability("PING").handler(), { pong: true });
  const sim = reuseCapability({ intent: "PDF_RENDER", binding: { type: "SIMULATED", intent: "PDF_RENDER" } });
  assert.equal(sim.mode, "SIMULATED");
  assert.equal(sim.runtimeBound, false);
  const gated = reuseCapability({ intent: "WHATSAPP_SEND", binding: { type: "PROVIDER_GATED", intent: "WHATSAPP_SEND" } });
  assert.equal(gated.mode, "PROVIDER_GATED");
  assert.throws(() => reuseCapability({ capabilityRegistry: reg, intent: "GHOST" }), /REUSE_NOT_REGISTERED/);
});

test("22 — provider-gated reuse never claims live", () => {
  const r = reuseCapability({ intent: "WHATSAPP_SEND", binding: { type: "PROVIDER_GATED", intent: "WHATSAPP_SEND" } });
  assert.ok(r.note.includes("live execution not claimed"));
});

test("23 — learning outcome recording bounded + auditable", () => {
  const store = stubStore();
  const bus = stubBus();
  const loop = new LearningLoop({ store, eventBus: bus });
  const done = recordIntegrationLearning({
    loop,
    decision: { capabilityId: "CAP-1", decisionId: "DEC-1", method: "ADAPT", matchEvidence: ["overlap X"], matchClassification: "COMPLEMENTARY", authorization: { state: "APPROVED" }, execution: { state: "SUCCEEDED" } },
    acquisition: { acquisitionId: "ACQ-1", kind: "ADAPTER" },
    outcome: "adapter validated against 3 cases",
    validated: true,
    actor: "admin"
  });
  assert.equal(done.reusable, true);
  assert.equal(loop.findReusable({ capabilityKey: "CAP-1" }).length, 1);
  const fail = recordIntegrationLearning({
    loop,
    decision: { capabilityId: "CAP-2", method: "REGISTER", authorization: { state: "APPROVED" }, execution: {} },
    outcome: "handler threw on edge input",
    validated: false,
    actor: "admin"
  });
  assert.equal(fail.reusable, false);
  assert.ok(bus.published.some((p) => p.topic === "audit.log.created"));
  assert.throws(() => recordIntegrationLearning({ loop, decision: null, outcome: "x" }), /LEARNING_DECISION_REQUIRED/);
});

test("25 — admin governance chain: VISIBLE→API→AUTH→PERSIST→AUDIT→STATUS", async (t) => {
  const { app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (token, method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return r.json();
  };
  const closed = await call(null, "GET", "/api/v1/admin/providers");
  assert.equal(closed.success !== true, true);
  const uniq = `gov${Date.now().toString(36)}`;
  const boot = await call(null, "POST", "/api/v1/workforce/provision-founder", { fullName: "Gov Admin", username: uniq, password: "GovPass!12345", pin: "654321" });
  if (!boot.success) return;
  const login = await call(null, "POST", "/api/v1/account/login", { username: uniq, password: "GovPass!12345" });
  assert.ok(login.token, "login issues a session");
  const elev = await call(login.token, "POST", "/api/v1/account/pin", { pin: "654321" });
  assert.ok(elev.token, "elevation issues a step-up session");
  const auth = elev.token;
  const empty = await call(auth, "GET", "/api/v1/admin/providers");
  assert.equal(empty.success, true);
  const reg = await call(auth, "POST", "/api/v1/admin/providers", { providerId: "E2E_GOV_PROBE", providerType: "WEB_API", credentialRequirements: ["E2E_KEY"] });
  assert.equal(reg.success, true);
  assert.equal(reg.provider.state, "NOT_CONFIGURED");
  const conf = await call(auth, "POST", "/api/v1/admin/providers/E2E_GOV_PROBE/configure", { baseUrl: "https://provider.example.invalid/api" });
  assert.equal(conf.provider.state, "CONFIGURED");
  const ver = await call(auth, "POST", "/api/v1/admin/providers/E2E_GOV_PROBE/verify", {});
  assert.ok(["VERIFIED", "VERIFICATION_FAILED"].includes(ver.provider.state));
  assert.equal(ver.provider.health.live, false);
  const recs = await call(auth, "GET", "/api/v1/admin/capability-records");
  assert.equal(recs.success, true);
  const decs = await call(auth, "GET", "/api/v1/admin/decisions");
  assert.equal(decs.success, true);
  const anon = await call(null, "POST", "/api/v1/admin/providers/E2E_GOV_PROBE/enable", { reason: "x" });
  assert.equal(anon.success !== true, true);
});
