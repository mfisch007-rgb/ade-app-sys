import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { UniversalAIGateway } from "../src/ai/UniversalAIGateway.js";
import KernelEventBus from "../src/core/EventBus.js";

/**
 * G21 — Observability / Internal Operations
 *
 * Proves bounded observability without fabricated telemetry:
 *  - canonical health surface distinguishes the LIVE core from DEGRADED
 *    optional dependencies (AI)
 *  - an unconfigured AI provider does NOT mark the ADE core as dead
 *  - AI lifecycle events (dispatch / provider failure / fallback) flow
 *    through the canonical EventBus -> TelemetryEventHub authorities
 */

const ORIGINAL_ENV = { ...process.env };
function clearProviderEnv() {
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "DEEPSEEK_API_KEY", "QWEN_API_KEY"]) {
    delete process.env[k];
  }
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV) && k !== undefined) delete process.env[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

let server = null;
let baseUrl = null;

before(async () => {
  clearProviderEnv();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise(r => server.close(r));
  restoreEnv();
});

test("G21.A — canonical health surface reports the LIVE core with runtime uptime", async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "OK");
  assert.equal(body.runtime.alive, true);
  assert.equal(typeof body.runtime.uptimeSeconds, "number");
  assert.equal(body.service, "ADE-APEX EOS");
});

test("G21.B — kernel status and subsystem count are surfaced", async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  assert.ok(["HEALTHY", "ONLINE"].includes(body.kernel.status));
  assert.equal(typeof body.kernel.booted, "boolean");
  assert.ok(body.kernel.subsystemCount >= 0);
});

test("G21.C — unconfigured AI does NOT mark the core dead; it is reported as degraded optional", async () => {
  clearProviderEnv();
  const res = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  // Core remains alive even though AI is unconfigured.
  assert.equal(body.runtime.alive, true);
  assert.ok(["HEALTHY", "ONLINE"].includes(body.kernel.status));
  // AI is honestly reported as unavailable, not as a fake configured success.
  assert.equal(body.optional.ai.configured, false);
  assert.equal(body.optional.ai.state, "UNAVAILABLE");
  assert.equal(body.optional.ai.providerCount, 0);
  // Fallback is available and honestly labelled.
  assert.equal(body.optional.ai.fallback, "OFFLINE_LEXICAL_ENGINE");
});

test("G21.D — configured AI is reflected in health as CONFIGURED (without claiming live success)", async () => {
  clearProviderEnv();
  process.env.GEMINI_API_KEY = "test-key";
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  assert.equal(body.optional.ai.configured, true);
  assert.equal(body.optional.ai.state, "CONFIGURED");
  assert.equal(body.optional.ai.providerCount, 1);
});

test("G21.E — AI lifecycle events flow through the canonical EventBus (observability boundary)", async () => {
  clearProviderEnv();
  const eventBus = KernelEventBus.getInstance();

  let dispatchEventSeen = false;
  let dispatchSource = null;
  const unsub = eventBus.subscribe("AI_DISPATCH_EVENT", (payload) => {
    dispatchEventSeen = true;
    dispatchSource = payload?.source;
  });

  const gateway = new UniversalAIGateway();
  gateway.semanticCache.clear();
  const result = await gateway.dispatchPrompt("g21 observability probe");

  assert.equal(dispatchEventSeen, true, "AI_DISPATCH_EVENT should be published on the canonical bus");
  assert.ok(dispatchSource, "AI_DISPATCH_EVENT records the routing source");
  // Event source matches the actual route taken (honest observability).
  assert.equal(dispatchSource, result.route);

  const history = eventBus.getHistory(50);
  assert.ok(history.some(h => h.topic === "AI_DISPATCH_EVENT"), "AI_DISPATCH_EVENT appears in canonical bus history");
  unsub();
});

test("G21.F — provider failure events are emitted to EventBus and the core continues", async () => {
  clearProviderEnv();
  process.env.DEEPSEEK_API_KEY = "test-key";
  const eventBus = KernelEventBus.getInstance();
  let errorEventSeen = false;
  const unsub = eventBus.subscribe("AI_PROVIDER_ERROR", (payload) => {
    if (payload.provider === "DEEPSEEK") errorEventSeen = true;
  });

  const gateway = new UniversalAIGateway();
  gateway.semanticCache.clear();
  gateway.fetchWithTimeout = async () => { const e = new Error("simulated-outage"); e.res = { ok: false }; throw e; };
  const result = await gateway.dispatchPrompt("failure isolation probe");

  assert.equal(errorEventSeen, true, "AI_PROVIDER_ERROR should be published for the failing provider");
  // Dispatch still resolves to honest fallback; it never crashes.
  assert.equal(result.route, "OFFLINE_LEXICAL_ENGINE");
  unsub();
});

test("G21.G — observable kernel metrics are exposed through the canonical HTTP surface", async () => {
  const res = await fetch(`${baseUrl}/api/v1/metrics`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.service, "ADE-APEX EOS");
  assert.ok(body.kernel, "kernel metrics object is present");
  assert.ok(body.eventBus, "eventBus metrics object is present");
  assert.ok(body.observatory, "observatory snapshot is present");
  // Observable metrics are bounded and honest.
  assert.ok(typeof body.kernel.intentsDispatched === "number");
  assert.ok(typeof body.kernel.intentsSucceeded === "number");
  assert.ok(typeof body.kernel.intentsFailed === "number");
  assert.ok(typeof body.eventBus.published === "number");
});

test("G21.H — recent operational events are exposed via the canonical HTTP surface", async () => {
  const res = await fetch(`${baseUrl}/api/v1/events/recent`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.events));
  // The event-bus has recorded real kernel events (boot, subsystem attach, etc).
  assert.ok(body.count > 0, "recent event history is non-empty");
  for (const ev of body.events) {
    assert.ok(ev.eventId, "event has id");
    assert.ok(ev.topic, "event has topic");
    assert.ok(ev.timestamp, "event has timestamp");
  }
});

test("G21.I — RuntimeObservatory records system logs through the logSystem integration path", async () => {
  clearProviderEnv();
  const res = await fetch(`${baseUrl}/api/telemetry/poll`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.logs));
  // The observatory log path now contains real entries from kernel boot.
  assert.ok(body.logs.length > 0, "system logs are non-empty");
});
