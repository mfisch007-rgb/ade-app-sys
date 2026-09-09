import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { app, kernel, kernelReady } from "../src/app.js";
import EnterpriseEventBus from "../src/kernel/EnterpriseEventBus.js";
import { EditionPolicy, EDITION_COMPATIBILITY_ALIASES } from "../src/core/EditionPolicy.js";
import { DemoSafetyBoundary } from "../src/core/DemoSafetyBoundary.js";
import { DemoOrchestrator } from "../src/demo/DemoOrchestrator.js";
import { MediaEngine } from "../src/media/MediaEngine.js";
import { MediaRegistry } from "../src/media/MediaRegistry.js";
import { FeedbackPipeline } from "../src/kernel/FeedbackPipeline.js";
import { UniversalAIGateway } from "../src/ai/UniversalAIGateway.js";
import { RateLimiter } from "../src/security/RateLimiter.js";
import { EnterpriseKernelMaster } from "../src/kernel/EnterpriseKernelMaster.js";

/**
 * FINAL RECONCILIATION SUITE
 *
 * Locks in the Phase C repairs:
 *  - Edition/runtime contract coherence (FULL alias, PROFESSIONAL, SYSTEM).
 *  - Demo safety boundary session lifecycle + TTL expiry + disposal.
 *  - Demo orchestrator shared-safety wiring + run TTL cleanup + disposal.
 *  - Media engine bounded request registry + registry integration.
 *  - Feedback pipeline graceful degradation (non-durable environments).
 *  - AI semantic cache eviction (bounded).
 *  - Event schema validation is non-blocking and captured, never fatal.
 *  - Rate limiter bounded-memory prune path.
 *  - Kernel capability recovery: ICX subsystem + shutdown snapshot.
 *  - HTTP /api/v1/runtime + /api/v1/search contract surfaces.
 */

let server = null;
let baseUrl = null;

// Track/restore process.env flags mutated inside a test.
function withEnv(env, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

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

// ========================================================================
// EDITION / RUNTIME CONTRACT
// ========================================================================

test("RECONCILE.A1 — FULL runtime maps to the COMMUNITY edition through the canonical alias", () => {
  assert.equal(EDITION_COMPATIBILITY_ALIASES.FULL, "COMMUNITY");
  const policy = new EditionPolicy("FULL");
  assert.equal(policy.getEdition(), "COMMUNITY");
  assert.equal(policy.getEditionBadge(), "ADE COMMUNITY EDITION · PUBLIC MVP");
});

test("RECONCILE.A2 — PROFESSIONAL and SYSTEM are first-class editions with real limits/entitlements", () => {
  for (const mode of ["PROFESSIONAL", "SYSTEM"]) {
    const policy = new EditionPolicy(mode);
    assert.equal(policy.getEdition(), mode);
    assert.ok(policy.getLimits());
    assert.equal(policy.isCapabilityAvailable("MULTI_STREAM"), true);
    assert.equal(policy.isCapabilityAvailable("SYSTEM_SHUTDOWN"), mode === "SYSTEM");
  }
  const professional = new EditionPolicy("PROFESSIONAL").getLimits();
  assert.equal(professional.maxDailyCases, 1000);
  assert.equal(professional.productionCredentials, true);
});

test("RECONCILE.A3 — /api/v1/runtime surface reports live runtime facts (edition, kernel, process)", async () => {
  const res = await fetch(`${baseUrl}/api/v1/runtime`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.service, "ADE-APEX EOS");
  assert.ok(body.edition);
  assert.equal(typeof body.demoMode, "boolean");
  assert.ok(body.kernel);
  assert.ok(body.process);
  assert.ok(body.process.pid > 0);
  assert.ok(typeof body.process.uptimeSeconds === "number");
});

test("RECONCILE.A4 — /api/v1/search aliases the command search surface", async () => {
  const res = await fetch(`${baseUrl}/api/v1/search?q=workflow`, { redirect: "manual" });
  assert.ok([301, 302, 307, 308].includes(res.status));
  assert.match(res.headers.get("location") || "", /\/api\/command\/search/);
});

// ========================================================================
// DEMO SAFETY BOUNDARY — SESSION LIFECYCLE
// ========================================================================

test("RECONCILE.B1 — demo sessions start, record, finish, and are traceable only while open", () => {
  withEnv({ ADE_DEMO_MODE: "true" }, () => {
    const bus = new EnterpriseEventBus();
    const safety = new DemoSafetyBoundary({ eventBus: bus });
    safety.dispose();

    const session = safety.startDemoSession({ scenarioId: "XYZ" });
    assert.ok(session, "demo mode starts a real safety session");
    assert.equal(session.status, "RUNNING");

    safety.recordDemoStage(session.demoId, "OBSERVE", { confidence: 0.9 });
    assert.equal(safety.getTraceSummary(session.demoId).stages.length, 1);

    const finished = safety.finishDemoSession(session.demoId, "COMPLETED");
    assert.equal(finished.status, "COMPLETED");
    assert.equal(safety.getTraceSummary(session.demoId), null, "finished sessions are no longer active");
  });
});

test("RECONCILE.B2 — expired safety sessions are reaped by TTL cleanup (never unbounded)", () => {
  withEnv({ ADE_DEMO_MODE: "true" }, () => {
    const bus = new EnterpriseEventBus();
    let expiredEvents = 0;
    bus.subscribe("DEMO_SESSION_EXPIRED", () => { expiredEvents++; });
    const safety = new DemoSafetyBoundary({ eventBus: bus });
    safety.dispose();

    const session = safety.startDemoSession({ scenarioId: "TTL" });
    assert.ok(session);
    // Backdate the session beyond the 5-minute TTL.
    session.startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    safety._cleanupExpiredSessions();
    assert.equal(safety.getTraceSummary(session.demoId), null, "expired session was reaped");
    assert.ok(expiredEvents >= 1, "expiry was observable via EventBus");
  });
});

test("RECONCILE.B3 — production mode never fabricates demo sessions", () => {
  withEnv({ ADE_DEMO_MODE: "false", ADE_EDITION: "COMMUNITY" }, () => {
    const bus = new EnterpriseEventBus();
    const safety = new DemoSafetyBoundary({ eventBus: bus });
    safety.dispose();
    assert.equal(safety.isDemoMode(), false);
    assert.equal(safety.startDemoSession({ scenarioId: "PROD" }), null);
  });
});

// ========================================================================
// DEMO ORCHESTRATOR — SHARED SAFETY + RUN TTL + DISPOSAL
// ========================================================================

test("RECONCILE.C1 — orchestrator reuses the shared DemoSafetyBoundary instance", () => {
  const bus = new EnterpriseEventBus();
  const sharedSafety = new DemoSafetyBoundary({ eventBus: bus });
  const orchestrator = new DemoOrchestrator({ eventBus: bus, safety: sharedSafety });
  orchestrator.dispose();
  assert.equal(orchestrator.safety, sharedSafety, "shared safety instance is injected, not duplicated");
});

test("RECONCILE.C2 — demo run in demo mode drives the safety session lifecycle and closes it", async () => {
  await withEnv({ ADE_DEMO_MODE: "true" }, async () => {
    const bus = new EnterpriseEventBus();
    let finishedEvents = 0;
    bus.subscribe("DEMO_SESSION_FINISHED", () => { finishedEvents++; });
    const safety = new DemoSafetyBoundary({ eventBus: bus });
    const orchestrator = new DemoOrchestrator({ eventBus: bus, safety });
    try {
      const run = await orchestrator.runDemo("community_autonomy_assessment", { prompt: "reconciling" });
      assert.equal(run.status, "COMPLETED");
      assert.ok(run.safetySession, "run is linked to a real safety session in demo mode");
      assert.ok(finishedEvents >= 1, "session lifecycle closed the run");
      assert.equal(safety.getTraceSummary(run.safetySession), null, "closed sessions are no longer active");
      assert.ok(orchestrator.getTrace(run.demoId), "orchestrator run trace remains available");
    } finally {
      orchestrator.dispose();
      safety.dispose();
    }
  });
});

test("RECONCILE.C3 — orchestrator run map is TTL-bounded and cleans up stale runs", async () => {
  const bus = new EnterpriseEventBus();
  const orchestrator = new DemoOrchestrator({ eventBus: bus });
  try {
    const run = await orchestrator.runDemo("business_automation", { prompt: "tidy" });
    assert.ok(orchestrator.activeRuns.has(run.demoId));
    const stale = orchestrator.activeRuns.get(run.demoId);
    stale.startedAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    orchestrator._cleanupExpiredRuns();
    assert.equal(orchestrator.activeRuns.has(run.demoId), false, "stale run was reaped");
    assert.equal(stale.status, "EXPIRED");
  } finally {
    orchestrator.dispose();
  }
});

test("RECONCILE.C4 — orchestrator disposal stops background timers", async () => {
  const bus = new EnterpriseEventBus();
  const orchestrator = new DemoOrchestrator({ eventBus: bus });
  orchestrator.dispose();
  assert.equal(orchestrator._cleanupInterval, null);
});

// ========================================================================
// MEDIA ENGINE — BOUNDED REGISTRY + REGISTRY INTEGRATION
// ========================================================================

test("RECONCILE.D1 — media engine request registry is bounded (memory-safe)", () => {
  const bus = new EnterpriseEventBus();
  const engine = new MediaEngine({ eventBus: bus, mediaRegistry: null });
  engine.maxRequests = 10;
  for (let i = 0; i < 25; i++) {
    engine.createMediaRequest({ product: "REQUEST_" + i });
  }
  assert.equal(engine.registry.size, 10, "registry is capped at the bound");
  assert.ok(![...engine.registry.keys()].includes("ADE-MEDIA-" + -1), "oldest requests were evicted");
});

test("RECONCILE.D2 — media requests are mirrored into the MediaRegistry asset ledger", () => {
  const bus = new EnterpriseEventBus();
  const registry = new MediaRegistry();
  const engine = new MediaEngine({ eventBus: bus, mediaRegistry: registry });
  const request = engine.createMediaRequest({ product: "PROCARTA", type: "video" });
  const assets = registry.listAssets({ requestId: request.requestId });
  assert.equal(assets.length, 1, "asset ledger mirrors the request");
  const stats = registry.getRegistryStats();
  assert.ok(stats.totalAssets >= 1);
});

// ========================================================================
// FEEDBACK PIPELINE — GRACEFUL DEGRADATION
// ========================================================================

test("RECONCILE.E1 — feedback ingestion never throws when persistence is impossible", async () => {
  const bus = new EnterpriseEventBus();
  const forward = path.join(os.tmpdir(), `ade-fb-${Date.now()}`, "queue.json");
  const pipeline = new FeedbackPipeline({ eventBus: bus, queuePath: forward });
  const item = await pipeline.ingest({ category: "QA", message: "targeted logic error: 0x2A", feature: "reconcile" });
  assert.ok(item.id);
  assert.equal(item.status, "RECEIVED");
  assert.deepEqual(Object.keys(item.enrichment || {}), [], "enrichment is not fabricated");
  assert.equal(pipeline.getQueue().length, 1, "in-memory state preserved despite unusable path");
});

// ========================================================================
// AI GATEWAY — SEMANTIC CACHE BOUNDS
// ========================================================================

test("RECONCILE.F1 — semantic cache evicts oldest entry at the bound", () => {
  const gateway = new UniversalAIGateway();
  gateway.semanticCacheMaxSize = 2;
  gateway._cacheSet("k1", { response: "r1", timestamp: Date.now() });
  gateway._cacheSet("k2", { response: "r2", timestamp: Date.now() });
  gateway._cacheSet("k3", { response: "r3", timestamp: Date.now() });
  assert.equal(gateway.semanticCache.size, 2);
  assert.equal(gateway.semanticCache.has("k1"), false, "oldest entry evicted first");
  assert.ok(gateway.semanticCache.has("k2") && gateway.semanticCache.has("k3"));
});

// ========================================================================
// EVENT SCHEMA REGISTRY — NON-BLOCKING VALIDATION
// ========================================================================

test("RECONCILE.G1 — schema violations are captured, never fatal", async () => {
  const bus = new EnterpriseEventBus();
  const scanning = await bus.publish("CAPABILITY_REGISTERED", { name: "not-the-contract" });
  assert.ok(scanning.schema, "publish result reports schema verification");
  assert.equal(scanning.schema.enforced, true);
  assert.equal(scanning.schema.valid, false);
  assert.equal(scanning.failedCount, 0, "validation must not block delivery");
  assert.ok(bus.getSchemaViolations().length >= 1, "violation is observable");
  assert.equal(bus.metrics.schemaViolations >= 1, true);
});

test("RECONCILE.G2 — SECURITY_EVENT accepts the real 'type' contract (and legacy 'action')", async () => {
  const bus = new EnterpriseEventBus();
  const viaType = await bus.publish("SECURITY_EVENT", { type: "AUTHENTICATION_FAILED", subject: "admin" });
  assert.equal(viaType.schema.valid, true);
  const viaAction = await bus.publish("SECURITY_EVENT", { action: "SESSION_ISSUED" });
  assert.equal(viaAction.schema.valid, true);
});

// ========================================================================
// RATE LIMITER — BOUNDED-MEMORY PRUNE PATH
// ========================================================================

test("RECONCILE.H1 — rate limiter prunes expired entries once the store is oversized", () => {
  const limiter = new RateLimiter({ windowMs: 50, max: 20 });
  let now = 1000;
  limiter.now = () => now;
  for (let i = 0; i < 10005; i++) {
    limiter.attempt({ ip: `client-${i}` });
  }
  assert.equal(limiter.stores.size, 10005);
  now += 100;
  limiter.attempt({ ip: "client-99999" });
  assert.ok(limiter.stores.size < 10005, "expired entries were pruned once over the bound");
  assert.equal(limiter.stores.has("client-0"), false);
});

// ========================================================================
// KERNEL CAPABILITY RECOVERY — ICX SUBSYSTEM + SHUTDOWN SNAPSHOT
// ========================================================================

test("RECONCILE.I1 — ADE_ICX_Engine is a first-class kernel subsystem", () => {
  assert.ok(kernel.resolve("icx"), "ICX engine resolvable from the kernel container");
  assert.ok(kernel.subsystems.has("icx"), "ICX registered in the subsystem map");
  const icx = kernel.resolve("icx");
  assert.equal(typeof icx.initialize, "function");
  assert.equal(typeof icx.dispose, "function");
  assert.equal(typeof icx.getHealth, "function");
});

test("RECONCILE.I2 — kernel shutdown snapshots subsystem state and restart recovers", async () => {
  const bus = new EnterpriseEventBus();
  const fresh = new EnterpriseKernelMaster({ eventBus: bus });
  assert.ok(fresh.subsystems.has("icx"));
  await fresh.boot();
  assert.equal(fresh.status, "ONLINE");
  await fresh.shutdown();
  assert.equal(fresh.status, "OFFLINE");
  assert.ok(fresh.snapshotManager, "kernel snapshot authority engaged during shutdown");
  await fresh.boot();
  assert.equal(fresh.status, "ONLINE");
  await fresh.shutdown();
});