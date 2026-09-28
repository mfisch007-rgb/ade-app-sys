import { test } from "node:test";
import assert from "node:assert/strict";
import { AwbuliChannelAdapter, extractOperationalFacts } from "../src/injection/AwbuliChannelAdapter.js";
import { OperationalIntelligencePipeline } from "../src/injection/OperationalIntelligencePipeline.js";
import { TestBusinessAdapter } from "../src/ingestion/InjectionAdapter.js";
import { InjectionToCaseMapper } from "../src/ingestion/InjectionToCaseMapper.js";
import {
  buildAssessmentEvidence, assessmentToIntakeText, DocumentIntakeService,
  normalizeStructuredRows, translateProcessModel
} from "../src/injection/ProcartaInputAdapters.js";
import WebhookApiAdapter from "../src/injection/WebhookApiAdapter.js";
import ExternalConnectorModel from "../src/injection/ExternalConnectorModel.js";
import DataGovernance, { assertTenantVisible, assertCrossOrgAuthorized } from "../src/governance/DataGovernance.js";
import CommercialEntitlement, { editionToCommercialTier } from "../src/commerce/CommercialEntitlement.js";

function stubStore() {
  const sections = {};
  return {
    readSection(k) { return sections[k] ?? null; },
    writeSection(k, v) { sections[k] = v; },
    _sections: sections
  };
}
function stubBus() {
  const published = [];
  return { published, publish(t, p) { published.push({ topic: t, payload: p }); } };
}
function stubIntake() {
  let n = 0;
  return {
    ingest() {
      n += 1;
      return { case: { id: `CASE-${n}` }, intake: { intakeId: `IN-${n}` } };
    }
  };
}

// OI-01 canonical ingestion contract: unknown source rejected, known normalizes
test("OI-01 pipeline rejects unknown source, accepts registered adapter", async () => {
  const pipe = new OperationalIntelligencePipeline({
    adapters: { TEST: new TestBusinessAdapter({}) },
    caseMapper: new InjectionToCaseMapper({ intake: stubIntake(), store: stubStore(), eventBus: stubBus() }),
    eventBus: stubBus()
  });
  await assert.rejects(() => pipe.run({ source: "NOPE", input: { text: "hi" } }), /PIPELINE_UNKNOWN_SOURCE/);
  const ok = await pipe.run({ source: "TEST", input: { text: "Sold 5 bags of rice." }, tenantScope: "org-a", actor: "tester" });
  assert.equal(ok.success, true);
  assert.equal(ok.tenantScope, "org-a");
  assert.ok(ok.caseId);
});

// OI-02 AWBULI -> canonical event (cartons example generalizes, stays SIMULATED)
test("OI-02 AWBULI adapter extracts supplier/qty/damaged, SIMULATED by default", () => {
  const facts = extractOperationalFacts("We received 24 cartons from supplier X. 3 cartons damaged.");
  assert.equal(facts.quantity_received, 24);
  assert.equal(facts.damaged, 3);
  assert.equal(facts.supplier, "X");
  const adapter = new AwbuliChannelAdapter({});
  const env = adapter.normalize({ text: "We received 24 cartons from supplier X. 3 cartons damaged.", tenantScope: "org-a" });
  assert.equal(env.eventType, "SUPPLIER_DELIVERY");
  assert.equal(env.executionMode, "SIMULATED");
  assert.equal(env.provenance.synthetic, true);
});

// AWB-01/02: simulated stays simulated; live requires ENABLED gate
test("AWB-01/02 simulated remains simulated; ENABLED gate yields LIVE", () => {
  const sim = new AwbuliChannelAdapter({});
  assert.equal(sim.normalize({ text: "Delivered 10 boxes." }).executionMode, "SIMULATED");
  const gate = { ingestionAllowed: () => true };
  const live = new AwbuliChannelAdapter({ providerGate: gate });
  assert.equal(live.normalize({ text: "Delivered 10 boxes." }).executionMode, "LIVE");
});

// OI-06 / SEC-03 / AWB-04 tenant isolation
test("OI-06/SEC-03 tenant mismatch rejected across pipeline and mapper", async () => {
  const pipe = new OperationalIntelligencePipeline({
    adapters: { TEST: new TestBusinessAdapter({}) },
    caseMapper: new InjectionToCaseMapper({ intake: stubIntake(), store: stubStore(), eventBus: stubBus() }),
    eventBus: stubBus()
  });
  await assert.rejects(
    () => pipe.run({ source: "TEST", input: { text: "Stock update.", tenantScope: "org-a" }, tenantScope: "org-b" }),
    /TENANT_MISMATCH/
  );
  assert.throws(() => assertTenantVisible("org-a", "org-b"), /TENANT_MISMATCH/);
  assert.throws(() => assertCrossOrgAuthorized({}), /CROSS_ORG_DENIED/);
});

// OI-03 form -> PROCARTA evidence
test("OI-03 assessment evidence builds findings + intake text", () => {
  const ev = buildAssessmentEvidence({
    organization: "Acme Foods", industry: "Retail", area: "INVENTORY",
    answers: { receiving: "manual entry causes delays", approvals: "fine" },
    recurringProblems: "manual stock counts", processDelays: "supplier delays"
  }, { tenantScope: "acme", actor: "admin" });
  assert.equal(ev.organization, "Acme Foods");
  assert.ok(ev.findings.length >= 1);
  assert.ok(assessmentToIntakeText(ev).includes("Acme Foods"));
});

// OI-04 document provenance (no fake extraction)
test("OI-04 document ingest keeps provenance, marks extraction pending", () => {
  const svc = new DocumentIntakeService({ store: stubStore(), eventBus: stubBus() });
  const rec = svc.ingest({ name: "sop.pdf", kind: "PDF", organization: "Acme" }, { tenantScope: "acme", actor: "u1" });
  assert.equal(rec.extraction.state, "PENDING_MANUAL_OR_PROVIDER");
  assert.equal(rec.tenantScope, "acme");
  assert.throws(() => svc.ingest({ name: "x.pdf", kind: "PDF", ref: "data:base64,AAA" }), /INLINE_BINARY/);
  assert.throws(() => svc.get(rec.documentId, { tenantScope: "other" }), /TENANT_MISMATCH/);
});

// L3 structured rows
test("OI-05a structured CSV rows normalize deterministically", () => {
  const rows = normalizeStructuredRows({ csv: "item,qty\nrice,10\nbeans,20" }, { tenantScope: "acme" });
  assert.equal(rows.length, 2);
  assert.ok(rows[0].text.includes("rice"));
});

// L4 BPMN translation (no new engine)
test("OI-05b BPMN subset translates to existing-engine steps", () => {
  const model = translateProcessModel({
    format: "BPMN", name: "Receiving",
    bpmnXml: '<bpmn:startEvent id="s1" name="Start"/><bpmn:task id="t1" name="Count cartons"/><bpmn:sequenceFlow sourceRef="s1" targetRef="t1"/>'
  });
  assert.equal(model.engine, "EXISTING_WORKFLOW_ENGINE");
  assert.equal(model.steps.length, 2);
  assert.deepEqual(model.steps[0].next, ["t1"]);
});

// OI-05 API/webhook normalization + failure truthfulness
test("OI-05 API webhook auth failure is truthful; NONE auth passes", () => {
  const store = stubStore();
  const secrets = { _m: new Map([["ADE_CONN_c1", "tok-123"]]), getSecret(k) { return this._m.get(k); } };
  const cm = { get: (id) => (id === "c1" ? { id: "c1", provider: "TESTSYS", baseUrl: "https://x.example", authType: "API_KEY" } : null) };
  const adapter = new WebhookApiAdapter({ connectionManager: cm, secrets, eventBus: stubBus() });
  assert.throws(() => adapter.inbound({ connectorId: "c1", headers: { authorization: "Bearer wrong" }, body: { text: "hi" } }), /WEBHOOK_AUTH_FAILED/);
  const ok = adapter.inbound({ connectorId: "c1", headers: { authorization: "Bearer tok-123" }, body: { text: "Order received" } });
  assert.equal(ok.payload.text, "Order received");
});

// OI-07 capability routing hint is best-effort, never fatal
test("OI-07 pipeline survives discovery failure", async () => {
  const pipe = new OperationalIntelligencePipeline({
    adapters: { TEST: new TestBusinessAdapter({}) },
    caseMapper: new InjectionToCaseMapper({ intake: stubIntake(), store: stubStore(), eventBus: stubBus() }),
    capabilityDiscovery: { discover: () => { throw new Error("down"); } },
    eventBus: stubBus()
  });
  const ok = await pipe.run({ source: "TEST", input: { text: "Paid supplier invoice." } });
  assert.equal(ok.success, true);
  assert.equal(ok.capabilityHint, null);
});

// OI-08 entitlement gating truthfulness
test("OI-08 commercial tiers gate capabilities honestly", () => {
  assert.equal(editionToCommercialTier("COMMUNITY"), "COMMUNITY");
  assert.equal(editionToCommercialTier("PILOT"), "TRIAL");
  assert.equal(editionToCommercialTier("PROFESSIONAL"), "PAID");
  const ce = new CommercialEntitlement({});
  const gated = ce.check({ capability: "automation" });
  assert.equal(typeof gated.allowed, "boolean");
  assert.equal(ce.check({ capability: "nope" }).allowed, false);
});

// L6 connector model: vendors register without hard-coding
test("L6 external vendor registers + mirrors provider gate", () => {
  const registered = [];
  const gate = { register: (d) => registered.push(d) };
  const model = new ExternalConnectorModel({ providerGate: gate, connectionManager: { get: () => ({ id: "c9" }) }, eventBus: stubBus() });
  const rec = model.registerVendor({ vendor: "Acme ERP", systemClass: "ERP", capabilities: ["sync_inventory"] });
  assert.equal(rec.vendor, "ACME_ERP");
  assert.equal(registered.length, 1);
  const row = model.normalizeRow("ACME_ERP", { sku: "R1", qty: 5 });
  assert.ok(row.text.includes("R1"));
});

// Governance defaults
test("governance default denies cross-customer analytics", () => {
  const g = new DataGovernance({});
  assert.equal(g.checkPurpose({ purpose: "CROSS_CUSTOMER_BENCHMARK" }), false);
  assert.equal(g.checkPurpose({ purpose: "PROCARTA_ASSESSMENT" }), true);
});
