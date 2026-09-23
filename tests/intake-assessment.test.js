import { test } from "node:test";
import assert from "node:assert/strict";
import { UnifiedIntakeEngine } from "../src/intelligence/UnifiedIntakeEngine.js";

// Deterministic PROCARTA intake assessment: the public PROCARTA + Community
// flows rely on intake returning a structured, honest assessment object.
// No HTTP / storage required — pure engine contract.

const makeStubCaseManager = () => ({
  cases: new Map(),
  createCase(input = {}) {
    const record = { id: `CASE-2026-${Math.random().toString(16).slice(2, 10).toUpperCase()}`, ...input, history: [] };
    this.cases.set(record.id, record);
    return record;
  }
});

test("rich procurement submission yields structured assessment and readback", () => {
  const engine = new UnifiedIntakeEngine({ caseManager: makeStubCaseManager() });
  const r = engine.ingest("API", {
    organization: "Acme Trading",
    orgSize: "MEDIUM (50-249)",
    useCase: "Cut procurement delays and manual data entry",
    description: "We struggle with procurement and inventory. Purchasing is manual in a spreadsheet, orders are delayed for days, and stock records go missing. We want to integrate with our ERP."
  });

  const intake = r.intake;
  assert.equal(intake.organization, "Acme Trading");
  assert.equal(intake.useCase, "Cut procurement delays and manual data entry");
  assert.equal(intake.orgSize, "MEDIUM (50-249)");
  assert.equal(intake.request.intent, "ENTERPRISE_IMPLEMENTATION");

  const a = intake.request.assessment;
  assert.ok(a, "assessment must exist on rich submissions");
  assert.equal(a.aiUsed, false, "assessment must never claim AI usage");
  assert.equal(a.generatedBy, "DETERMINISTIC_LINGUISTIC_ANALYSIS");
  assert.ok(a.observation.includes("procurement"), "observation must reference the detected area");
  assert.ok(a.bottleneck, "bottleneck must be present");
  assert.ok(a.digestionDelay.includes("delay"), "delay language must be surfaced");
  assert.ok(a.risk, "risk must be present");
  assert.ok(a.improvement.includes("procurement"), "improvement must reference the area");
  assert.ok(a.recommendedNextStep.includes("procurement"), "next step must reference the area");
  assert.ok(Array.isArray(a.evidence) && a.evidence.length >= 4, "multiple evidence points expected");
  assert.equal(a.humanReviewRequired, false, "rich submission should not require forced human review");
  assert.ok(a.confidence > 0.7, "confidence should be high for a rich submission");

  const storable = r.case;
  assert.ok(storable.request.assessment, "assessment must be persisted on the case record");
  assert.ok(storable.id.startsWith("CASE-2026-"), "case id format preserved");
});

test("vague growth request must not overreach and escalates honestly", () => {
  const engine = new UnifiedIntakeEngine({ caseManager: makeStubCaseManager() });
  const r = engine.ingest("WEB", {
    organization: "Minimal Co",
    description: "We are hoping to grow and serve more customers."
  });
  const a = r.intake.request.assessment;
  assert.ok(a, "assessment must always be present");
  assert.equal(a.humanReviewRequired, true, "low-signal request must escalate to human review");
  assert.ok(!a.observation.includes("customer_operations"), "vague growth must not force a business area");
  assert.equal(a.recommendedNextStep, "A human operator should contact the submitter to structure the discovery and confirm scope.");
  assert.ok(a.bottleneck.length > 0);
});

test("normalize exposes orgSize and useCase readback for the frontend", () => {
  const engine = new UnifiedIntakeEngine({ caseManager: makeStubCaseManager() });
  const n = engine.normalize("WEBHOOK", {
    description: "Customer complaints pile up, we answer calls all day and have no CRM.",
    orgSize: "SOLO / FREELANCER",
    businessType: "Cleaning business"
  });
  assert.equal(n.orgSize, "SOLO / FREELANCER");
  assert.equal(n.useCase, null, "no useCase provided => null readback");
  const a = n.request.assessment;
  assert.ok(a.observation.includes("customer_operations"), "explicit complaint/call language majors customer operations");
  assert.ok(a.humanReviewRequired, "complaint request without scale/system signals stays human-review");
});