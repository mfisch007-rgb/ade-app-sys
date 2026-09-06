import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { app, kernelReady } from "../../src/app.js";
import { CommunityProgression, INTAKE_TYPES } from "../../src/community/CommunityProgression.js";
import { PilotGate } from "../../src/community/PilotGate.js";
import EnterpriseEventBus from "../../src/kernel/EnterpriseEventBus.js";
import IdentityOnboarding from "../../src/kernel/IdentityOnboarding.js";

/**
 * G27 — PILOT PROGRESSION GATE.
 *
 * The gate is mechanism, not policy: candidates are exactly the PROCARTA
 * engine-qualified intakes (metadata.procarta === true); promotion requires an
 * explicit level-2 OPERATOR decision with a reason. No qualification policy is
 * invented here. Tests prove: candidate derivation is honest, approval requires
 * operator + reason, decisions are recorded on the canonical audit topic, and
 * the HTTP surface enforces the level-2 gate.
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
    subject: `g27-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tier: "COMMUNITY",
    level,
    persona: "OPERATOR"
  }).token;

function makeEnvironment() {
  const bus = new EnterpriseEventBus();
  const progression = new CommunityProgression({ eventBus: bus });
  const gate = new PilotGate({ eventBus: bus, progression });
  return { bus, progression, gate };
}

// ========================================================================
// CANDIDATE DERIVATION IS HONEST
// ========================================================================

test("G27 — no intakes → no candidates", () => {
  const { gate } = makeEnvironment();
  assert.deepEqual(gate.listCandidates(), []);
});

test("G27 — non-PROCARTA intakes (USE_CASE, PILOT_INTEREST) are NEVER candidates", () => {
  const { progression, gate } = makeEnvironment();
  progression.captureIntake({ type: INTAKE_TYPES.PILOT_INTEREST, organization: "X", metadata: {} });
  progression.captureIntake({ type: INTAKE_TYPES.USE_CASE, organization: "Y" });
  assert.equal(gate.listCandidates().length, 0, "generic interests cannot become pilot candidates");
});

test("G27 — PROCARTA engine-qualified intake IS a candidate", () => {
  const { progression, gate } = makeEnvironment();
  progression.captureIntake({
    type: INTAKE_TYPES.USE_CASE,
    organization: "Qualified Org",
    useCaseDescription: "SAP order-to-cash automation",
    metadata: { caseId: "CASE-G271", intent: "PROCESS_AUTOMATION", procarta: true }
  });
  const candidates = gate.listCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].intakeId, progression.listIntakes()[0].id);
  assert.equal(candidates[0].caseId, "CASE-G271");
  assert.equal(candidates[0].organization, "Qualified Org");
});

// ========================================================================
// APPROVAL REQUIRES AN EXPLICIT OPERATOR DECISION
// ========================================================================

test("G27 — approve requires an intake id", () => {
  const { gate } = makeEnvironment();
  assert.throws(
    () => gate.approveCandidate({ reason: "x" }),
    (e) => e.code === "PILOT_APPROVE_INTAKE_REQUIRED"
  );
});

test("G27 — approve requires an explicit reason", () => {
  const { progression, gate } = makeEnvironment();
  progression.captureIntake({ type: INTAKE_TYPES.USE_CASE, metadata: { procarta: true, caseId: "C1" } });
  const candidate = gate.listCandidates()[0];
  assert.throws(
    () => gate.approveCandidate({ intakeId: candidate.intakeId, approvedBy: "op" }),
    (e) => e.code === "PILOT_APPROVE_REASON_REQUIRED"
  );
});

test("G27 — a non-qualified intake can never be approved", () => {
  const { progression, gate } = makeEnvironment();
  const intake = progression.captureIntake({ type: INTAKE_TYPES.PILOT_INTEREST, organization: "Unqualified" });
  assert.throws(
    () => gate.approveCandidate({ intakeId: intake.intakeId, reason: "operator shortlisted" }),
    (e) => e.code === "PILOT_CANDIDATE_NOT_FOUND"
  );
});

// ========================================================================
// APPROVAL RECORDS THE DECISION DURABLY ON THE CANONICAL AUDIT PATH
// ========================================================================

test("G27 — a valid approval records a decision, an audit entry and a domain event", () => {
  const { bus, progression, gate } = makeEnvironment();
  const audits = [];
  const events = [];
  bus.subscribe("audit.log.created", (payload) => audits.push(payload));
  bus.subscribe("pilot.candidate.approved", (payload) => events.push(payload));

  progression.captureIntake({
    type: INTAKE_TYPES.USE_CASE,
    organization: "Pilot Org",
    useCaseDescription: "Factory floor visibility",
    metadata: { caseId: "CASE-P1", intent: "OBSERVABILITY", procarta: true }
  });
  const candidate = gate.listCandidates()[0];

  const decision = gate.approveCandidate({
    intakeId: candidate.intakeId,
    approvedBy: "operator@ade",
    reason: "Founder approved this organization for a bounded 90-day pilot."
  });

  assert.equal(decision.state, "APPROVED_TO_PILOT");
  assert.equal(decision.approvedBy, "operator@ade");
  assert.equal(decision.caseId, "CASE-P1");
  assert.equal(gate.recentDecisions(1)[0].intakeId, candidate.intakeId);

  assert.equal(audits.length, 1);
  assert.equal(audits[0].category, "PILOT");
  assert.equal(audits[0].action, "CANDIDATE_APPROVED");
  assert.equal(audits[0].caseId, "CASE-P1");

  assert.equal(events.length, 1);
  assert.equal(events[0].state, "APPROVED_TO_PILOT");
});

// ========================================================================
// HTTP SURFACE ENFORCES THE LEVEL-2 OPERATOR GATE
// ========================================================================

test("G27 — pilot surfaces require authentication and level-2 authorization", async () => {
  const anon = await fetch(`${baseUrl}/api/v1/procarta/pilot-candidates`);
  assert.equal(anon.status, 401);
  const anonStatus = await fetch(`${baseUrl}/api/v1/procarta/pilot/status`);
  assert.equal(anonStatus.status, 401);

  const lvl1 = await fetch(`${baseUrl}/api/v1/procarta/pilot-candidates`, {
    headers: { Authorization: `Bearer ${issueOperatorToken(1)}` }
  });
  assert.equal(lvl1.status, 403, "level-1 cannot operate the pilot gate");
});

test("G27 — full HTTP flow: capture qualified intake → list → approve → status", async () => {
  const token2 = issueOperatorToken(2);

  const capture = await fetch(`${baseUrl}/api/v1/community/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "USE_CASE",
      organization: "HTTP Pilot Org",
      useCaseDescription: "Webhook-driven order processing",
      metadata: { caseId: "CASE-HTTP", intent: "INTEGRATION", procarta: true }
    })
  });
  assert.equal(capture.status, 201);
  const intakeId = (await capture.json()).intake.intakeId;

  const list = await fetch(`${baseUrl}/api/v1/procarta/pilot-candidates`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.ok(listBody.candidates.some((c) => c.intakeId === intakeId), "qualified intake appears as a candidate");

  const approveNoReason = await fetch(`${baseUrl}/api/v1/procarta/pilot/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ intakeId })
  });
  assert.equal(approveNoReason.status, 400, "reason is mandatory");

  const approve = await fetch(`${baseUrl}/api/v1/procarta/pilot/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ intakeId, reason: "Founder-gated approval for this use case." })
  });
  assert.equal(approve.status, 201);
  const approveBody = await approve.json();
  assert.equal(approveBody.decision.state, "APPROVED_TO_PILOT");

  const status = await fetch(`${baseUrl}/api/v1/procarta/pilot/status`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.pilotGate.decisions, 1);
  assert.ok(statusBody.recentDecisions.some((d) => d.intakeId === intakeId));
});