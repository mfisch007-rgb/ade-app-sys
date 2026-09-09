import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, kernel, kernelReady } from "../src/app.js";

/**
 * SPAN 2-15 — Community Foundation Infrastructure Tests
 *
 * Validates:
 * - Edition policy (SPAN 2)
 * - Demo safety boundary (SPAN 3)
 * - Self-guided experience surfaces (SPAN 4)
 * - Demo orchestration (SPAN 7)
 * - Demo scenarios (SPAN 8)
 * - Capability map (SPAN 9)
 * - Feedback intelligence (SPAN 10)
 * - Community progression (SPAN 11)
 * - Notification foundation (SPAN 12)
 * - Media engine (SPAN 13)
 * - Product integration (SPAN 14)
 */

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
  if (server) await new Promise(r => server.close(r));
});

// ---- SPAN 2: EDITION POLICY ----

test("SPAN 2.A — edition endpoint returns valid edition information", async () => {
  const res = await fetch(`${baseUrl}/api/v1/edition`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.edition, "edition is present");
  assert.ok(typeof body.isDemoMode === "boolean");
  assert.ok(typeof body.badge === "string");
  assert.ok(body.limits, "limits are present");
  assert.ok(Array.isArray(body.capabilities));
  assert.ok(body.capabilities.length > 0);
});

test("SPAN 2.B — edition capabilities include expected core capabilities", async () => {
  const res = await fetch(`${baseUrl}/api/v1/edition`);
  const body = await res.json();
  const intents = body.capabilities.map(c => c.intent);
  assert.ok(intents.includes("PING"), "PING is available");
  assert.ok(intents.includes("CASE_CREATE"), "CASE_CREATE is available");
  assert.ok(intents.includes("DEMO_ORCHESTRATE"), "DEMO_ORCHESTRATE is available");
  assert.ok(intents.includes("FEEDBACK_SUBMIT"), "FEEDBACK_SUBMIT is available");
});

test("SPAN 2.C — capability map endpoint returns edition-aware metadata", async () => {
  const res = await fetch(`${baseUrl}/api/v1/capability-map`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.edition);
  assert.ok(Array.isArray(body.capabilities));
  assert.ok(body.capabilities.length >= 8);
  const pingCap = body.capabilities.find(c => c.intent === "PING");
  assert.ok(pingCap);
  assert.equal(pingCap.registered, true);
});

// ---- SPAN 3: DEMO SAFETY BOUNDARY ----

test("SPAN 3.A — demo status endpoint reflects current mode", async () => {
  const res = await fetch(`${baseUrl}/api/v1/demo/status`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(typeof body.demoMode === "boolean");
  assert.ok(body.edition);
  assert.ok(body.badge);
});

// ---- SPAN 4/7/8: DEMO ORCHESTRATION + SCENARIOS ----

test("SPAN 4.A — demo scenarios endpoint returns available scenarios", async () => {
  const res = await fetch(`${baseUrl}/api/v1/demo/scenarios`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.scenarios));
  assert.ok(body.scenarios.length >= 5, "at least 5 demo scenarios available");
  assert.ok(Array.isArray(body.categories));
  assert.ok(body.categories.length >= 3);
});

test("SPAN 7.A — demo run endpoint executes a full demonstration", async () => {
  const res = await fetch(`${baseUrl}/api/v1/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenarioId: "operational-assessment",
      input: { prompt: "Find the bottleneck in our operations", source: "TEST", type: "DEMO" }
    })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.demo);
  assert.ok(body.demo.demoId);
  assert.equal(body.demo.status, "COMPLETED");
  assert.ok(body.demo.stages.length === 10, "all 10 stages executed");
  assert.ok(body.demo.confidence > 0);
  assert.ok(body.demo.outcome);
  assert.equal(body.demo.outcome.type, "SUCCESS");
  assert.ok(body.demo.stages.every(s => s.classification), "every stage has a truth classification");
});

test("SPAN 7.B — demo trace endpoint returns trace for a completed demo", async () => {
  const runRes = await fetch(`${baseUrl}/api/v1/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "workflow-automation", input: { prompt: "Simulate workflow", source: "TEST", type: "DEMO" } })
  });
  const runBody = await runRes.json();
  const demoId = runBody.demo.demoId;
  const res = await fetch(`${baseUrl}/api/v1/demo/trace/${demoId}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.trace);
  assert.equal(body.trace.demoId, demoId);
  assert.ok(body.trace.stages.length === 10);
});

test("SPAN 7.C — demo run requires scenarioId", async () => {
  const res = await fetch(`${baseUrl}/api/v1/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
});

test("SPAN 7.D — demo run rejects unknown scenario", async () => {
  const res = await fetch(`${baseUrl}/api/v1/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "nonexistent-scenario" })
  });
  assert.equal(res.status, 404);
});

// ---- SPAN 9: PUBLIC ARCHITECTURE ----

test("SPAN 9.A — public architecture surface returns valid structure", async () => {
  const res = await fetch(`${baseUrl}/api/v1/public-architecture`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.platform, "ADE-APEX");
  assert.ok(body.architecture);
  assert.ok(body.architecture.operations);
  assert.ok(body.architecture.core);
  assert.ok(Array.isArray(body.architecture.products));
  assert.ok(body.capabilities > 0);
  assert.ok(body.truthClassification);
});

// ---- SPAN 10: FEEDBACK INTELLIGENCE ----

test("SPAN 10.A — feedback submission captures and sanitizes feedback", async () => {
  const res = await fetch(`${baseUrl}/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "I_FOUND_A_BUG",
      message: "Found a bug in the test at user@example.com",
      feature: "TestCase",
      version: "1.0.0"
    })
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.feedback.feedbackId);
  assert.equal(body.feedback.status, "RECEIVED");
  assert.equal(body.feedback.priority, "HIGH");
});

test("SPAN 10.B — feedback PII is sanitized", async () => {
  const res = await fetch(`${baseUrl}/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "OTHER",
      message: "Contact me at test@email.com or +1234567890"
    })
  });
  const body = await res.json();
  assert.equal(body.success, true);
  const recentRes = await fetch(`${baseUrl}/api/v1/feedback/recent?limit=1`);
  const recentBody = await recentRes.json();
  const latest = recentBody.feedback[recentBody.feedback.length - 1];
  assert.ok(!latest.message.includes("test@email.com"), "email is redacted");
  assert.ok(!latest.message.includes("+1234567890"), "phone is redacted");
});

test("SPAN 10.C — feedback patterns endpoint returns analysis", async () => {
  const res = await fetch(`${baseUrl}/api/v1/feedback/patterns`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(typeof body.patterns.totalFeedback === "number");
  assert.ok(body.patterns.byCategory);
  assert.ok(body.patterns.byPriority);
});

// ---- SPAN 11: COMMUNITY PROGRESSION ----

test("SPAN 11.A — community intake captures progression interest", async () => {
  const res = await fetch(`${baseUrl}/api/v1/community/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "PILOT_INTEREST",
      organization: "Test Corp",
      useCaseDescription: "We need automated workflow processing"
    })
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.intake.intakeId);
  assert.equal(body.intake.status, "CAPTURED");
});

test("SPAN 11.B — community progression stats return correctly", async () => {
  const res = await fetch(`${baseUrl}/api/v1/community/progression`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(typeof body.stats.totalIntakes === "number");
  assert.ok(body.stats.byType);
});

// ---- SPAN 12: NOTIFICATION FOUNDATION ----

test("SPAN 12.A — notifications endpoint returns recent events", async () => {
  const res = await fetch(`${baseUrl}/api/v1/notifications/recent`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.events));
});

// ---- SPAN 13: MEDIA ENGINE ----

test("SPAN 13.A — media providers endpoint returns provider status", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/providers`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.providers));
  assert.ok(body.providers.length >= 4, "multiple provider categories registered");
  const unconfigured = body.providers.filter(p => p.status === "UNCONFIGURED");
  assert.ok(unconfigured.length > 0, "unconfigured providers are honest");
});

test("SPAN 13.B — media request creates a request record", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: "ADE", duration: 30, campaignObjective: "DEMO" })
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.request.requestId);
  assert.equal(body.request.status, "CREATED");
  assert.equal(body.request.truthClassification, "PLACEHOLDER");
});

test("SPAN 13.C — media request list returns requests", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/requests`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.requests));
});

test("SPAN 13.D — media registry stats return correctly", async () => {
  const res = await fetch(`${baseUrl}/api/v1/media/registry/stats`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(typeof body.stats.totalAssets === "number");
});

// ---- SPAN 14: PRODUCT INTEGRATION ----

test("SPAN 14.A — products endpoint returns registered products and campaign variants", async () => {
  const res = await fetch(`${baseUrl}/api/v1/products`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.products));
  assert.ok(body.products.length >= 3, "at least ADE + PROCARTA + AWBULI registered");
  assert.ok(Array.isArray(body.variants));
  assert.ok(body.variants.length >= 4, "multiple campaign variants defined");
});
