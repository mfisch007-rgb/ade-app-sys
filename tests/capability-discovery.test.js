import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverCapabilities, EVIDENCE_CLASSES } from "../src/ingestion/CapabilityDiscovery.js";
import { matchCapability } from "../src/ingestion/CapabilityMatcher.js";
import { CapabilityRecordStore } from "../src/capabilities/CapabilityRecordStore.js";

// Batch 10 proving tests: discovery → understanding → matching → decision → state.

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

function svc() {
  const store = stubStore();
  const bus = stubBus();
  return { store, bus, records: new CapabilityRecordStore({ store, eventBus: bus }) };
}

const ADE_INTENTS = ["PING", "PROCARTA_EXECUTE", "CASE_CREATE", "SYSTEM_HEALTH"];

test("1 — valid capability discovery (manifest + openapi + webhook + sdk)", () => {
  const m = discoverCapabilities({
    evidenceClass: "MANIFEST",
    evidence: { name: "BPMN Exporter", version: "1.2.0", capabilities: [{ name: "export_bpmn", description: "company to BPMN", inputs: { company: "object" }, outputs: { xml: "string" } }] },
    sourceSystem: "ADE-PROCARTA",
    sourceVersion: "7dd0b3a"
  });
  assert.equal(m.length, 1);
  assert.equal(m[0].intent, "EXPORT_BPMN");
  assert.ok(m[0].sourceHash.startsWith("sha256:"));
  assert.equal(m[0].status, "DISCOVERED");
  const o = discoverCapabilities({
    evidenceClass: "OPENAPI",
    evidence: { info: { title: "t", version: "1" }, paths: { "/leads": { post: { summary: "create lead", parameters: [{ name: "email" }], responses: { 201: {} } } } } },
    sourceSystem: "EXT"
  });
  assert.equal(o[0].intent, "POST_LEADS");
  assert.ok(o[0].inputs.email);
  const w = discoverCapabilities({ evidenceClass: "WEBHOOK_SPEC", evidence: { events: ["delivery.created"] }, sourceSystem: "EXT" });
  assert.equal(w[0].intent, "DELIVERY_CREATED");
  const s = discoverCapabilities({ evidenceClass: "SDK_METADATA", evidence: { package: "x", exports: ["renderPdf"] }, sourceSystem: "EXT" });
  assert.equal(s[0].intent, "RENDER_PDF");
  assert.ok(EVIDENCE_CLASSES.includes("INTEGRATION_METADATA"));
});

test("2 — malformed capability evidence rejected, never invented", () => {
  assert.throws(() => discoverCapabilities({ evidenceClass: "MANIFEST", evidence: null }), /MALFORMED_EVIDENCE/);
  assert.throws(() => discoverCapabilities({ evidenceClass: "OPENAPI", evidence: { info: {} } }), /MALFORMED_EVIDENCE/);
  assert.throws(() => discoverCapabilities({ evidenceClass: "WEBHOOK_SPEC", evidence: {} }), /MALFORMED_EVIDENCE/);
  assert.throws(() => discoverCapabilities({ evidenceClass: "MANIFEST", evidence: [] }), /MALFORMED_EVIDENCE/);
});

test("3 — unknown capability class refused explicitly", () => {
  assert.throws(() => discoverCapabilities({ evidenceClass: "TELEPATHY", evidence: {} }), /UNKNOWN_EVIDENCE_CLASS/);
  assert.throws(() => discoverCapabilities({ evidence: {} }), /UNKNOWN_EVIDENCE_CLASS/);
});

test("4 — duplicate capability matches live ADE intent", () => {
  const [input] = discoverCapabilities({ evidenceClass: "MANIFEST", evidence: { capabilities: [{ name: "PROCARTA EXECUTE", description: "assess" }] }, sourceSystem: "EXT" });
  const m = matchCapability(input, { adeIntents: ADE_INTENTS });
  assert.equal(m.classification, "DUPLICATE");
  assert.equal(m.proposedMethod, "REUSE");
  assert.ok(m.matchedAde.includes("PROCARTA_EXECUTE"));
});

test("5 — complementary capability proposes ADAPT", () => {
  const m = matchCapability({ intent: "PROCARTA_PDF_REPORT", name: "procarta pdf report", description: "render findings", inputs: { a: "b" } }, { adeIntents: ADE_INTENTS });
  assert.equal(m.classification, "COMPLEMENTARY");
  assert.equal(m.proposedMethod, "ADAPT");
});

test("6 — novel capability with substance proposes REGISTER", () => {
  const m = matchCapability({ intent: "BPMN_EXPORT", description: "renders xml", inputs: { company: "object" } }, { adeIntents: ADE_INTENTS });
  assert.equal(m.classification, "NOVEL");
  assert.equal(m.proposedMethod, "REGISTER");
});

test("7 — protected capability refused automatically", () => {
  const m = matchCapability({ intent: "BINARY_LIVE_TRADE", description: "trade" }, { adeIntents: ADE_INTENTS });
  assert.equal(m.classification, "PROTECTED_PRIVATE");
  assert.equal(m.proposedMethod, "REJECT");
});

test("8 — provider-required capability stays gated", () => {
  const m = matchCapability({ intent: "WHATSAPP_SEND", description: "send", providerRequirements: ["WA_TOKEN"] }, { adeIntents: ADE_INTENTS });
  assert.equal(m.classification, "PROVIDER_DEPENDENT");
  assert.equal(m.proposedMethod, "PROVIDER_REQUIRED");
});

test("9 — human-review capability on thin evidence", () => {
  const m = matchCapability({ intent: "MYSTERY_BOX" }, { adeIntents: ADE_INTENTS });
  assert.equal(m.classification, "UNSUPPORTED");
  assert.equal(m.proposedMethod, "HUMAN_REVIEW");
  assert.throws(() => matchCapability({}, { adeIntents: [] }), /MATCH_IDENTITY_REQUIRED/);
});

test("10+12 — authorization-required then approved decision persisted", () => {
  const { records, store } = svc();
  const [input] = discoverCapabilities({ evidenceClass: "MANIFEST", evidence: { capabilities: [{ name: "bpmn_export", description: "xml" }] }, sourceSystem: "EXT" });
  const cap = records.register(input, { actor: "t" });
  const m = matchCapability(input, { adeIntents: ADE_INTENTS });
  const d = records.recordDecision({ capabilityId: cap.capabilityId, method: m.proposedMethod, rationale: m.rationale, confidence: m.confidence, matchEvidence: m.evidence }, { actor: "t" });
  assert.throws(() => records.authorizeDecision(d.decisionId, { approved: true, decidedBy: "", reason: "x" }), /APPROVAL_IDENTITY_AND_REASON_REQUIRED/);
  const ok = records.authorizeDecision(d.decisionId, { approved: true, decidedBy: "admin", reason: "export pattern safe" });
  assert.equal(ok.authorization.state, "APPROVED");
  assert.ok(store.calls.includes("integrationDecisions"));
});

test("11 — rejected decision terminal with evidence", () => {
  const { records } = svc();
  const cap = records.register({ intent: "SHADY_BRIDGE", description: "unverified" });
  const d = records.recordDecision({ capabilityId: cap.capabilityId, method: "HUMAN_REVIEW", rationale: "needs eyes" });
  const rej = records.authorizeDecision(d.decisionId, { approved: false, decidedBy: "admin", reason: "untrusted source" });
  assert.equal(rej.authorization.state, "REJECTED");
  assert.equal(rej.authorization.decidedBy, "admin");
});

test("19+20 — full state chain valid; invalid jumps + failure rollback", () => {
  const { records } = svc();
  const cap = records.register({ intent: "CHAIN_PROBE", description: "walk the machine" });
  const chain = ["PARSED", "UNDERSTOOD", "MATCHED", "PROPOSED", "AWAITING_AUTHORIZATION", "APPROVED", "INTEGRATING", "VALIDATING", "VERIFIED", "REGISTERED", "ACTIVE", "SUSPENDED", "ACTIVE"];
  for (const s of chain) records.updateState(cap.capabilityId, s, { actor: "t" });
  assert.equal(records.get(cap.capabilityId).status, "ACTIVE");
  assert.throws(() => records.updateState(cap.capabilityId, "DISCOVERED", { actor: "t" }), /INVALID_STATE_TRANSITION/);
  const f = records.register({ intent: "FAIL_PROBE", description: "x" });
  for (const s of ["PARSED", "UNDERSTOOD", "MATCHED", "PROPOSED", "AWAITING_AUTHORIZATION", "APPROVED", "INTEGRATING", "VALIDATING", "FAILED"]) {
    records.updateState(f.capabilityId, s, { actor: "t" });
  }
  assert.equal(records.get(f.capabilityId).status, "FAILED");
  records.updateState(f.capabilityId, "PROPOSED", { actor: "t" });
  assert.equal(records.get(f.capabilityId).status, "PROPOSED");
  assert.throws(() => records.updateState(f.capabilityId, "ACTIVE", { actor: "t" }), /INVALID_STATE_TRANSITION/);
  const hist = records.get(cap.capabilityId).history;
  assert.ok(hist.length >= chain.length);
});
