import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { app, kernelReady } from "../../src/app.js";
import { PilotRegistry } from "../../src/community/PilotRegistry.js";
import EnterpriseEventBus from "../../src/kernel/EnterpriseEventBus.js";
import IdentityOnboarding from "../../src/kernel/IdentityOnboarding.js";

/**
 * G29 — PILOT FACTORY (foundation): durable pilot packages.
 *
 * A pilot package is the durable canonical object derived from a G27 approval.
 * Packages enter at the existing EVALUATION status and move to PROMOTED /
 * ARCHIVED only through an explicit operator verdict with a reason. No
 * evaluation policy is automated. Tests prove durability (survives a fresh
 * registry over the same store), strict verdict gating, canonical events, and
 * the level-2 HTTP surface.
 */

const __root = path.resolve(import.meta.dirname, "../..");
const CREDENTIAL_FILE = path.join(__root, "data", "admin-credential.json");

const authBootstrap = !fs.existsSync(CREDENTIAL_FILE) && !process.env.ADE_ADMIN_PIN_HASH;
if (authBootstrap) {
  process.env.ADE_ADMIN_PIN_HASH = process.env.ADE_ADMIN_PIN_HASH || "REGENERATE_AFTER_TEST";
}

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (authBootstrap) {
    delete process.env.ADE_ADMIN_PIN_HASH;
    fs.rmSync(CREDENTIAL_FILE, { force: true });
  }
});

const issueOperatorToken = (level = 1) =>
  IdentityOnboarding.getInstance().issueSession({
    subject: `g29-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tier: "COMMUNITY",
    level,
    persona: "OPERATOR"
  }).token;

function spyStore() {
  return {
    sections: {},
    readSection(name) {
      return this.sections[name];
    },
    writeSection(name, value) {
      this.sections[name] = value;
    }
  };
}

const approvedDecision = {
  id: "REC-001",
  intakeId: "INT-001",
  caseId: "CASE-PILOT-1",
  organization: "Pilot Co",
  approvedBy: "operator@ade",
  reason: "Founder-gated approval.",
  decidedAt: "2026-09-06T00:00:00.000Z"
};

test("G29 — an approved decision becomes a durable EVALUATION pilot package", () => {
  const bus = new EnterpriseEventBus();
  const store = spyStore();
  const registry = new PilotRegistry({ store, eventBus: bus });

  const record = registry.recordApproved(approvedDecision);
  assert.equal(record.state, "EVALUATION");
  assert.equal(record.caseId, "CASE-PILOT-1");
  assert.equal(registry.list().length, 1);
  assert.deepEqual(registry.stats(), { records: 1, byState: { EVALUATION: 1 } });
  assert.ok(store.sections.pilots.length === 1, "package is persisted to the canonical store section");
});

test("G29 — packages survive a fresh registry over the same store (durability)", () => {
  const store = spyStore();
  const registryA = new PilotRegistry({ store });
  registryA.recordApproved(approvedDecision);

  const registryB = new PilotRegistry({ store });
  const reloaded = registryB.get("REC-001");
  assert.ok(reloaded, "pilot package hydrates from the store");
  assert.equal(reloaded.state, "EVALUATION");
  assert.equal(reloaded.caseId, "CASE-PILOT-1");
});

test("G29 — verdicts are strictly operator-gated and evidence-reasoned", () => {
  const bus = new EnterpriseEventBus();
  const registry = new PilotRegistry({ store: spyStore(), eventBus: bus });
  registry.recordApproved(approvedDecision);

  assert.throws(
    () => registry.recordVerdict({ recordId: "REC-001", verdict: "EVALUATION", reason: "x" }),
    (e) => e.code === "PILOT_VERDICT_INVALID",
    "EVALUATION is not a verdict"
  );
  assert.throws(
    () => registry.recordVerdict({ recordId: "REC-001", verdict: "PROMOTED", reason: "   " }),
    (e) => e.code === "PILOT_VERDICT_REASON_REQUIRED",
    "a verdict without reason is rejected"
  );
  assert.throws(
    () => registry.recordVerdict({ recordId: "MISSING", verdict: "PROMOTED", reason: "x" }),
    (e) => e.code === "PILOT_RECORD_NOT_FOUND"
  );
  assert.throws(
    () => registry.recordVerdict({ verdict: "PROMOTED", reason: "x" }),
    (e) => e.code === "PILOT_VERDICT_RECORD_REQUIRED"
  );
});

test("G29 — a legal verdict emits audit + domain events and mutates only the verdict fields", () => {
  const bus = new EnterpriseEventBus();
  const audits = [];
  const events = [];
  bus.subscribe("audit.log.created", (p) => audits.push(p));
  bus.subscribe("pilot.verdict.recorded", (p) => events.push(p));
  const registry = new PilotRegistry({ store: spyStore(), eventBus: bus });
  registry.recordApproved(approvedDecision);

  const record = registry.recordVerdict({
    recordId: "REC-001",
    verdict: "PROMOTED",
    reason: "Pilot delivered measurable evidence of reduction in manual processing within the 90-day window.",
    decidedBy: "founder@ade"
  });

  assert.equal(record.state, "PROMOTED");
  assert.equal(record.verdictBy, "founder@ade");
  assert.ok(record.verdictReason.includes("90-day window"));

  assert.equal(audits.length, 2, "record-created + verdict-recorded audits");
  assert.equal(audits[1].action, "VERDICT_RECORDED");
  assert.equal(audits[1].verdict, "PROMOTED");
  assert.equal(events[0].state, "PROMOTED");

  assert.throws(
    () => registry.recordVerdict({ recordId: "REC-001", verdict: "ARCHIVED", reason: "double verdict" }),
    (e) => e.code === "PILOT_VERDICT_TERMINAL",
    "a verdict is terminal: re-verdicting a finalized package requires a transition policy (none invented)"
  );
});

// ========================================================================
// HTTP SURFACE — level-2 gated registry + verdict
// ========================================================================

test("G29 — pilot registry and verdict endpoints require level-2 authorization", async () => {
  const anon = await fetch(`${baseUrl}/api/v1/procarta/pilot/registry`);
  assert.equal(anon.status, 401);
  const lvl1 = await fetch(`${baseUrl}/api/v1/procarta/pilot/registry`, {
    headers: { Authorization: `Bearer ${issueOperatorToken(1)}` }
  });
  assert.equal(lvl1.status, 403);
  const anonVerdict = await fetch(`${baseUrl}/api/v1/procarta/pilot/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(anonVerdict.status, 401);
});

test("G29 — HTTP: approval event materializes an EVALUATION package, verdict moves it", async () => {
  const token2 = issueOperatorToken(2);

  const capture = await fetch(`${baseUrl}/api/v1/community/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "USE_CASE",
      organization: "Registry Pilot Co",
      useCaseDescription: "Guided pilot execution test",
      metadata: { caseId: "CASE-REG1", intent: "PILOT_TEST", procarta: true }
    })
  });
  assert.equal(capture.status, 201);
  const intakeId = (await capture.json()).intake.intakeId;

  const approve = await fetch(`${baseUrl}/api/v1/procarta/pilot/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ intakeId, reason: "Approved for a bounded pilot." })
  });
  assert.equal(approve.status, 201);
  const decision = (await approve.json()).decision;

  const registry = await fetch(`${baseUrl}/api/v1/procarta/pilot/registry`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.equal(registry.status, 200);
  const registryBody = await registry.json();
  assert.ok(registryBody.success);
  const record = registryBody.records.find((r) => r.id === decision.id);
  assert.ok(record, "approved decision materialized as a pilot package");
  assert.equal(record.state, "EVALUATION");
  assert.equal(record.caseId, "CASE-REG1");

  const validVerdict = await fetch(`${baseUrl}/api/v1/procarta/pilot/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ recordId: decision.id, verdict: "PROMOTED", reason: "Evidence verdict recorded by operator." })
  });
  assert.equal(validVerdict.status, 201);
  assert.equal((await validVerdict.json()).record.state, "PROMOTED");

  const invalidVerdict = await fetch(`${baseUrl}/api/v1/procarta/pilot/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ recordId: decision.id, verdict: "PROMOTED", reason: "" })
  });
  assert.equal(invalidVerdict.status, 400);
});