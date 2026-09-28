import { test } from "node:test";
import assert from "node:assert/strict";
import OrgUnitRegistry from "../src/operations/OrgUnitRegistry.js";
import CustomerRegistry from "../src/operations/CustomerRegistry.js";
import FieldTaskRegistry from "../src/operations/FieldTaskRegistry.js";
import AgentRegistry from "../src/operations/AgentRegistry.js";
import ExperienceStore from "../src/operations/ExperienceStore.js";
import AvailabilityMap from "../src/commerce/AvailabilityMap.js";
import CommercialEntitlement from "../src/commerce/CommercialEntitlement.js";
import { assertTenantVisible } from "../src/governance/DataGovernance.js";

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
  return {
    published,
    publish(t, p) { published.push({ topic: t, payload: p }); },
    subscribe() { return () => {}; }
  };
}

// ORG-01 hierarchy enforced, tenant-scoped
test("ORG-01 units form ORGANIZATION->BRANCH->DEPARTMENT->TEAM hierarchy", () => {
  const r = new OrgUnitRegistry({ store: stubStore(), eventBus: stubBus() });
  const org = r.create({ type: "ORGANIZATION", name: "Acme Foods", tenantScope: "acme" });
  const br = r.create({ type: "BRANCH", name: "Ikeja", parentId: org.unitId, tenantScope: "acme" });
  const dept = r.create({ type: "DEPARTMENT", name: "Sales", parentId: br.unitId, tenantScope: "acme" });
  const team = r.create({ type: "TEAM", name: "Field A", parentId: dept.unitId, tenantScope: "acme" });
  assert.deepEqual(r.ancestry(team.unitId, { tenantScope: "acme" }).map((u) => u.type), ["ORGANIZATION", "BRANCH", "DEPARTMENT", "TEAM"]);
  assert.throws(() => r.create({ type: "BRANCH", name: "No parent", tenantScope: "acme" }), /ORG_PARENT_REQUIRED/);
  assert.throws(() => r.create({ type: "BRANCH", name: "Bad", parentId: team.unitId, tenantScope: "acme" }), /ORG_HIERARCHY_VIOLATION/);
  assert.equal(r.list({ tenantScope: "other" }).length, 0);
  assert.throws(() => r.setStatus(br.unitId, "ACTIVE", { tenantScope: "acme", actor: "", reason: "" }), /APPROVAL_IDENTITY/);
  const off = r.setStatus(br.unitId, "SUSPENDED", { tenantScope: "acme", actor: "admin", reason: "renovation" });
  assert.equal(off.status, "SUSPENDED");
  assert.equal(r.list({ tenantScope: "acme" }).length, 3);
});

// CUST-01 lifecycle + dedupe + case link
test("CUST-01 lead lifecycle with dedupe and canonical case link", () => {
  const bus = stubBus();
  let ingested = 0;
  const intake = { ingest: () => { ingested += 1; return { case: { id: "CASE-1" } }; } };
  const r = new CustomerRegistry({ store: stubStore(), eventBus: bus, intake });
  const a = r.register({ name: "Jane Doe", phone: "+2348012345678", tenantScope: "acme", actor: "rep" });
  assert.equal(a.state, "LEAD");
  const dup = r.register({ name: "Jane Doe", phone: "+2348012345678", tenantScope: "acme" });
  assert.equal(dup.duplicate, true);
  assert.equal(dup.customerId, a.customerId);
  assert.throws(() => r.transition(a.customerId, "SERVICE", { tenantScope: "acme", actor: "rep" }), /TRANSITION_FORBIDDEN/);
  r.transition(a.customerId, "CONTACT", { tenantScope: "acme", actor: "rep" });
  r.transition(a.customerId, "QUALIFIED", { tenantScope: "acme", actor: "rep" });
  const c = r.transition(a.customerId, "CASE", { tenantScope: "acme", actor: "rep" });
  assert.equal(ingested, 1);
  assert.deepEqual(c.caseIds, ["CASE-1"]);
  assert.equal(r.list({ tenantScope: "other" }).length, 0);
  assert.ok(bus.published.some((p) => p.topic === "customer.transitioned"));
});

// TASK-01 assignment-bound lifecycle + outcome events
test("TASK-01 field tasks bind assignees and emit outcome events", () => {
  const bus = stubBus();
  const r = new FieldTaskRegistry({ store: stubStore(), eventBus: bus });
  const t = r.create({ kind: "VISIT", title: "Restock Ikeja shop", unitId: "unit-1", customerId: "cus-1", tenantScope: "acme", actor: "mgr", privacy: { location: "Ikeja", purpose: "visit routing" } });
  assert.equal(t.state, "OPEN");
  assert.equal(t.location.purpose, "visit routing");
  const noLoc = r.create({ kind: "TASK", title: "File returns", tenantScope: "acme" });
  assert.equal(noLoc.location, null);
  assert.throws(() => r.transition(t.taskId, "SUBMITTED", { tenantScope: "acme", actor: "rep-1" }), /TRANSITION_FORBIDDEN/);
  r.transition(t.taskId, "CLAIMED", { tenantScope: "acme", actor: "rep-1" });
  assert.equal(r.get(t.taskId, { tenantScope: "acme" }).assignee.id, "rep-1");
  assert.throws(() => r.transition(t.taskId, "IN_PROGRESS", { tenantScope: "acme", actor: "rep-2" }), /TASK_NOT_ASSIGNEE/);
  r.transition(t.taskId, "IN_PROGRESS", { tenantScope: "acme", actor: "rep-1" });
  const done = r.transition(t.taskId, "SUBMITTED", { tenantScope: "acme", actor: "rep-1", outcome: { summary: "Restocked 24 cartons", result: "COMPLETED", evidence: ["photo-1"], customerEffect: "shelf full" } });
  assert.equal(done.outcome.result, "COMPLETED");
  assert.ok(bus.published.some((p) => p.topic === "field.task.transitioned" && p.payload.outcome));
  assert.equal(r.list({ tenantScope: "acme", assigneeId: "rep-1" }).length, 1);
});

// AGENT-01 capability-bound runs, limits, no impersonation
test("AGENT-01 agents run only bound capabilities with full attribution", async () => {
  const bus = stubBus();
  const workforce = {
    listAgents: async () => [{ id: "ag-1", name: "Recon", status: "ACTIVE" }],
    markAgentUsed: async () => {}
  };
  const caps = {
    getCapability: (intent) => intent === "ORG_UNITS" ? { handler: async () => ({ success: true, units: [] }) } : null,
    listCapabilities: () => [{ intent: "ORG_UNITS" }]
  };
  const r = new AgentRegistry({ store: stubStore(), eventBus: bus, workforce, capabilityRegistry: caps });
  await assert.rejects(() => r.bind({ agentId: "ghost", capabilities: ["ORG_UNITS"], tenantScope: "acme" }), /AGENT_IDENTITY_NOT_FOUND/);
  await assert.rejects(() => r.bind({ agentId: "ag-1", capabilities: ["NOPE"], tenantScope: "acme" }), /AGENT_CAPABILITY_UNKNOWN/);
  const b = await r.bind({ agentId: "ag-1", capabilities: ["ORG_UNITS"], tenantScope: "acme", maxRunsPerDay: 1, actor: "admin" });
  assert.equal(b.status, "ACTIVE");
  await assert.rejects(() => r.run({ agentId: "ag-1", capability: "CUSTOMERS", tenantScope: "acme" }), /AGENT_CAPABILITY_DENIED/);
  const run = await r.run({ agentId: "ag-1", capability: "ORG_UNITS", input: {}, tenantScope: "acme", actor: "admin", correlationId: "c-1", triggeringEvent: "evt-1" });
  assert.equal(run.success, true);
  assert.equal(run.correlationId, "c-1");
  assert.ok(run.requestedBy);
  await assert.rejects(() => r.run({ agentId: "ag-1", capability: "ORG_UNITS", tenantScope: "acme" }), /AGENT_RUN_LIMIT/);
  assert.equal(r.runsFor("ag-1", { tenantScope: "acme" }).length, 1);
  assert.throws(() => assertTenantVisible("acme", "other"), /TENANT_MISMATCH/);
});

// EXP-01 experience record/query + loop import + finance resolution ingestion
test("EXP-01 experience unifies loops, resolutions and manual lessons", () => {
  const bus = stubBus();
  const learned = [];
  const knowledge = { ingest: (id, content, meta) => learned.push({ id, meta }) };
  const r = new ExperienceStore({ store: stubStore(), eventBus: bus, knowledge });
  assert.throws(() => r.record({ situation: "", lesson: "" }), /EXPERIENCE_CONTENT_REQUIRED/);
  const e = r.record({ situation: "Stockout at branch", action: "Emergency restock", result: "Shelf full in 2h", outcome: "RESOLVED", lesson: "Keep 3-day buffer", confidence: 0.8, capabilityKey: "INVENTORY", tenantScope: "acme", actor: "mgr" });
  assert.equal(learned.length, 1);
  assert.equal(learned[0].meta.tenantScope, "acme");
  const fromLoop = r.fromLearningLoop({ loopId: "LOOP-1", capabilityKey: "INVENTORY", tenantScope: "acme", stages: [], outcome: "ok", reusable: true }, { actor: "sys" });
  assert.equal(fromLoop.source, "LEARNING_LOOP");
  assert.throws(() => r.fromLearningLoop({ loopId: "x", reusable: false }), /NOT_REUSABLE/);
  assert.equal(r.query({ tenantScope: "acme", minConfidence: 0.7 }).length, 1);
  assert.equal(r.query({ tenantScope: "other" }).length, 0);
});

// AVAIL-01 unified availability labels
test("AVAIL-01 capabilities classify COMMUNITY/EXPERIMENTAL/PROVIDER_REQUIRED/ENTERPRISE", () => {
  const m = new AvailabilityMap({});
  assert.equal(m.classify("PAYSTACK_LIVE").availability, "PROVIDER_REQUIRED");
  assert.equal(m.classify("AWBULI_SIMULATED").availability, "EXPERIMENTAL");
  assert.equal(m.classify("MAJOR_PSP").availability, "ENTERPRISE");
  assert.equal(m.classify("ORG_UNITS").availability, "COMMUNITY");
  const cat = m.catalog({ tenantScope: "default" });
  assert.ok(cat.length > 20);
  assert.ok(cat.every((c) => ["COMMUNITY", "EXPERIMENTAL", "PROVIDER_REQUIRED", "ENTERPRISE"].includes(c.availability)));
});

// ENT-01 new gates enforced per tier
test("ENT-01 branches/aiWorkers/customers/fieldTasks gates exist", () => {
  const ce = new CommercialEntitlement({});
  for (const cap of ["branches", "aiWorkers", "customers", "fieldTasks"]) {
    const chk = ce.check({ capability: cap, usage: 0 });
    assert.equal(typeof chk.allowed, "boolean");
  }
  assert.equal(ce.check({ capability: "nope" }).allowed, false);
});
