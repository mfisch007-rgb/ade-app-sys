import test from "node:test";
import assert from "node:assert/strict";
import { CaseManager } from "../src/intelligence/CaseManager.js";
import { PartnerRegistry } from "../src/integrations/PartnerRegistry.js";
import EngagementOrchestrator from "../src/engagement/EngagementOrchestrator.js";

test("engagement case lifecycle is guarded", () => {
  const cases = new CaseManager();
  const c = cases.createCase({ organization: "Test" });

  assert.equal(c.status, "DISCOVERY_REQUIRED");

  assert.throws(
    () => cases.transition(c.id, "CLOSED"),
    /Invalid case transition/
  );

  const started = cases.transition(c.id, "DISCOVERY_IN_PROGRESS");
  assert.equal(started.status, "DISCOVERY_IN_PROGRESS");
});

test("partner routing returns capability matches", async () => {
  const cases = new CaseManager();
  const partners = new PartnerRegistry();

  partners.upsert({
    name: "Integration Partner",
    capabilities: ["ODOO_IMPLEMENTATION", "API_INTEGRATION"]
  });

  const orchestrator = new EngagementOrchestrator({
    caseManager: cases,
    partnerRegistry: partners,
    capabilityRegistry: {
      getCapability: () => undefined
    },
    kernel: null
  });

  let c = cases.createCase({
    request: { intent: "ENTERPRISE_IMPLEMENTATION" },
    requiredCapabilities: ["ODOO_IMPLEMENTATION"]
  });

  c = cases.transition(c.id, "DISCOVERY_IN_PROGRESS");
  c = cases.transition(c.id, "ANALYSIS_READY");
  c = cases.transition(c.id, "DECISION_PENDING");

  orchestrator.resolve = () => ({
    evaluate: async () => ({
      requiredCapabilities: ["ODOO_IMPLEMENTATION"],
      confidence: 0.9
    })
  });

  c = await orchestrator.runDecision(c);

  assert.equal(c.status, "PARTNER_RECOMMENDED");
  assert.equal(c.partnerRecommendations.length, 1);
  assert.equal(c.partnerRecommendations[0].name, "Integration Partner");
});

test("feedback closes feedback-pending case", async () => {
  const cases = new CaseManager();

  const pipeline = {
    ingest: async (payload) => ({
      id: "feedback-1",
      payload,
      status: "RECEIVED"
    })
  };

  const orchestrator = new EngagementOrchestrator({
    caseManager: cases,
    feedbackPipeline: pipeline
  });

  let c = cases.createCase();
  c = cases.transition(c.id, "DISCOVERY_IN_PROGRESS");
  c = cases.transition(c.id, "ANALYSIS_READY");
  c = cases.transition(c.id, "DECISION_PENDING");
  c = cases.transition(c.id, "ROUTED");
  c = cases.transition(c.id, "ADE_EXECUTION");
  c = cases.transition(c.id, "EXECUTION_IN_PROGRESS");
  c = cases.transition(c.id, "EVALUATION");
  c = cases.transition(c.id, "FEEDBACK_PENDING");

  c = await orchestrator.ingestFeedback(c.id, { text: "completed successfully" });

  assert.equal(c.status, "CLOSED");
  assert.equal(c.feedback.length, 1);
});
