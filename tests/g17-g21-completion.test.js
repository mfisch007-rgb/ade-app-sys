import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { app, storageProvider } from "../src/app.js";
import EnterpriseEventBus from "../src/kernel/EnterpriseEventBus.js";
import EnterpriseKernelMaster from "../src/kernel/EnterpriseKernelMaster.js";
import KernelEventBus from "../src/core/EventBus.js";
import { WorkflowEngine } from "../src/kernel/SupportingEngines.js";
import { CaseManager } from "../src/intelligence/CaseManager.js";
import { RuntimeConfigStore } from "../src/admin/RuntimeConfigStore.js";
import { LocalStorageAdapter } from "../src/storage/LocalStorageAdapter.js";
import { ProviderDocumentStorageAdapter } from "../src/storage/ProviderDocumentStorageAdapter.js";
import { AuditStore } from "../src/storage/AuditStore.js";
import { PartnerRegistry } from "../src/integrations/PartnerRegistry.js";
import { FeedbackPipeline } from "../src/kernel/FeedbackPipeline.js";
import EngagementOrchestrator from "../src/engagement/EngagementOrchestrator.js";
import CapabilityRegistry from "../src/core/CapabilityRegistry.js";

/**
 * G17–G21 REALITY-AUDIT COMPLETION SUITE
 *
 * Proves the genuinely-missing G17–G21 behaviors are now closed with the
 * canonical runtime authorities (no second kernel, no fabricated state):
 *  - G17  provider-backed durable document storage + boot hydration
 *  - G18  unconfigured PIN auth -> 503 AUTH_NOT_CONFIGURED (not 500)
 *  - G18  durable, atomic audit persistence from canonical security events
 *  - G19  autonomous workflow executes on the canonical WorkflowEngine,
 *         incl. a full live ADE case execution through the orchestrator
 *  - G21  canonical EventBus wildcard ("*") delivery
 *  - G21  /api/v1/events/stream receives STREAM_CONNECTED then live events
 *  - G21  /api/v1/sse replays kernel telemetry (TELEMETRY_INIT)
 */

let server = null;
let baseUrl = null;

before(async () => {
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
// G17 — PROVIDER-BACKED DURABLE DOCUMENT STORAGE
// ========================================================================

test("G17.A — ProviderDocumentStorageAdapter round-trips through a StorageProvider and survives restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-g17-"));
  const backingFile = path.join(dir, "provider.json");
  const backing = new LocalStorageAdapter(backingFile);

  const primary = new ProviderDocumentStorageAdapter({
    provider: backing,
    key: "runtime-config",
    defaultValue: {}
  });

  assert.equal(primary.readSync({}).test, undefined, "not hydrated yet returns default");

  primary.writeSync({ test: "value", settings: { theme: "dark" } });
  await primary.write({
    test: "value",
    settings: { theme: "dark" },
    extra: [1, 2, 3]
  });

  assert.equal(backing.getSync("runtime-config").extra.length, 3, "write flushed to provider");

  const restart = new ProviderDocumentStorageAdapter({
    provider: backing,
    key: "runtime-config",
    defaultValue: {}
  });
  await restart.whenHydrated();
  assert.equal(restart.readSync({}).test, "value");
  assert.deepEqual(restart.readSync({}).extra, [1, 2, 3]);
});

test("G17.B — writes issued before hydration complete are buffered and never lost", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-g17b-"));
  const backingFile = path.join(dir, "provider.json");
  const backing = new LocalStorageAdapter(backingFile);

  const early = new ProviderDocumentStorageAdapter({
    provider: backing,
    key: "early",
    defaultValue: {}
  });

  early.writeSync({ buffered: true, version: 1 });
  const written = await early.write({ buffered: true, version: 2 });

  assert.equal(written.version, 2);
  await early.whenHydrated();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(backing.getSync("early").version, 2, "write-before-hydration was flushed");
});

test("G17.C — default runtime persistence stays on the local adapter unless a durable provider is configured", () => {
  const configuredDurable =
    String(process.env.ADE_STORAGE_PROVIDER || "local").trim().toLowerCase() !== "local";
  assert.equal(configuredDurable, false, "test environment has no durable provider configured");
  assert.ok(storageProvider, "app exposes its storage provider");
  assert.ok(
    storageProvider instanceof LocalStorageAdapter,
    "local/development runtime persists via LocalStorageAdapter"
  );
});

// ========================================================================
// G18 — AUTH NOT CONFIGURED IS 503, NOT 500
// ========================================================================

test("G18.A — unconfigured PIN auth returns 503 AUTH_NOT_CONFIGURED (never 500)", {
  skip:
    Boolean(process.env.ADE_ADMIN_PIN_HASH) ||
    fs.existsSync(path.resolve("data/admin-credential.json"))
      ? "environment has auth configured; cannot prove first-run state"
      : false
}, async () => {
  const previous = process.env.ADE_ADMIN_PIN_HASH;
  delete process.env.ADE_ADMIN_PIN_HASH;
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "123456" })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "AUTH_NOT_CONFIGURED");
  } finally {
    if (previous === undefined) delete process.env.ADE_ADMIN_PIN_HASH;
    else process.env.ADE_ADMIN_PIN_HASH = previous;
  }
});

// ========================================================================
// G18 — DURABLE AUDIT PERSISTENCE
// ========================================================================

test("G18.B — AuditStore persists security events durably and atomically (restart survives)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-g18b-"));
  const file = path.join(dir, "audit.json");

  const store = new AuditStore({ file });
  store.append({ topic: "SECURITY_EVENT", payload: { type: "AUTHENTICATION_FAILED" } });
  store.append({ topic: "audit.log.created", payload: { action: "LOGIN" } });

  const reloaded = new AuditStore({ file });
  const logs = reloaded.query(10);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].topic, "SECURITY_EVENT");
  assert.equal(logs[1].topic, "audit.log.created");

  const leftoverTmp = fs.readdirSync(dir).filter(f => f.includes(".tmp"));
  assert.equal(leftoverTmp.length, 0, "no temporary files remain after atomic writes");
});

test("G18.C — SECURITY_EVENT published on the canonical bus is persisted by the wired AuditStore", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-g18c-"));
  const file = path.join(dir, "audit.json");

  const bus = new EnterpriseEventBus();
  const store = new AuditStore({ file });
  bus.subscribe("SECURITY_EVENT", (payload, envelope) => {
    store.append({ topic: "SECURITY_EVENT", eventId: envelope?.eventId, payload });
  });

  await bus.publish("SECURITY_EVENT", { type: "PIN_VERIFIED" });
  const logs = new AuditStore({ file }).query(10);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].topic, "SECURITY_EVENT");
  assert.equal(logs[0].payload.type, "PIN_VERIFIED");
});

// ========================================================================
// G19 — AUTONOMOUS WORKFLOW EXECUTION (CANONICAL ENGINE)
// ========================================================================

test("G19.A — executeAutonomousWorkflow completes the full pipeline on the live kernel", async () => {
  const kernel = EnterpriseKernelMaster.getInstance();
  await kernel.boot();
  const engine = kernel.resolve("workflowEngine");
  assert.ok(engine instanceof WorkflowEngine);
  assert.equal(typeof engine.executeAutonomousWorkflow, "function");

  const before = kernel.metrics.workflowExecutions;

  const result = await engine.executeAutonomousWorkflow("CASE-G19A", {
    case: {
      request: { intent: "AUTOMATE" },
      organization: { name: "G19A" },
      confidence: 0.95
    }
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.workflowId, "CASE-G19A");
  assert.equal(result.decision.decision, "APPROVE");
  assert.ok(result.ledger.id >= 1, "ledger transaction recorded");
  assert.equal(result.decision.confidence, 0.95);
  assert.ok(kernel.metrics.workflowExecutions >= before + 1);

  const history = kernel.eventBus.getHistory(100);
  assert.ok(
    history.some(h => h.topic === "engagement.workflow.started" && h.payload.workflowId === "CASE-G19A"),
    "workflow.started was published"
  );
  assert.ok(
    history.some(h => h.topic === "engagement.workflow.completed" && h.payload.workflowId === "CASE-G19A"),
    "workflow.completed was published"
  );
});

test("G19.B — low-confidence workflows are rejected instead of executing", async () => {
  const kernel = EnterpriseKernelMaster.getInstance();
  const engine = kernel.resolve("workflowEngine");

  // Confidence below the decision engine's hold threshold (0.5) -> REJECT.
  await assert.rejects(
    engine.executeAutonomousWorkflow("CASE-G19B", {
      case: { request: {}, organization: {}, confidence: 0.3 }
    }),
    /WORKFLOW_REJECTED/
  );
});

test("G19.C — full ADE case execution: intake -> ADE_EXECUTION -> FEEDBACK_PENDING -> CLOSED (live kernel)", async () => {
  const kernel = EnterpriseKernelMaster.getInstance();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-g19c-"));

  const store = new RuntimeConfigStore(path.join(dir, "case-config.json"));
  const cases = new CaseManager({ eventBus: kernel.eventBus, store });
  const feedback = new FeedbackPipeline({
    eventBus: kernel.eventBus,
    queuePath: path.join(dir, "fb.json")
  });
  const orchestrator = new EngagementOrchestrator({
    caseManager: cases,
    partnerRegistry: new PartnerRegistry(),
    capabilityRegistry: CapabilityRegistry,
    feedbackPipeline: feedback,
    publicDiscovery: null,
    kernel,
    eventBus: kernel.eventBus
  });

  let c = cases.createCase({
    request: { intent: "AUTOMATE_ORDERS" },
    organization: { name: "G19C" },
    confidence: 0.92,
    requiredCapabilities: ["PING"]
  });

  c = await orchestrator.process(c.id);
  assert.equal(c.status, "ADE_EXECUTION", "decision routed to ADE execution");

  c = await orchestrator.executeCase(c.id);
  assert.equal(c.status, "FEEDBACK_PENDING", "workflow completed and dropped out of ADE_EXECUTION");
  assert.equal(c.workflow.status, "COMPLETED");

  c = await orchestrator.ingestFeedback(c.id, { text: "delivered as designed" });
  assert.equal(c.status, "CLOSED");
  assert.equal(c.feedback.length, 1);
});

// ========================================================================
// G21 — WILDCARD BUS DELIVERY + LIVE SSE STREAMS
// ========================================================================

test("G21.A — canonical bus delivers a wildcard meta-event to '*' subscribers", async () => {
  const bus = new EnterpriseEventBus();
  const received = [];
  const unsub = bus.subscribe("*", (record) => received.push(record));

  const published = await bus.publish("CUSTOM_META_TOPIC", { hello: "wildcard" });
  assert.equal(published.handlerCount, 0, "no topic-scoped handler was invoked");
  assert.equal(published.deliveredCount, 1, "wildcard delivery counted");

  unsub();
  assert.equal(received.length, 1);
  assert.equal(received[0].topic, "CUSTOM_META_TOPIC");
  assert.deepEqual(received[0].payload, { hello: "wildcard" });
});

test("G21.B — /api/v1/events/stream sends a default-type STREAM_CONNECTED then live bus events", async () => {
  const res = await fetch(`${baseUrl}/api/v1/events/stream`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/event-stream/);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const readUntil = async (needle, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    let buffer = "";
    while (Date.now() < deadline) {
      if (buffer.includes(needle)) break;
      const chunk = await Promise.race([
        reader.read().then(({ value, done }) => ({ value, done })),
        new Promise((resolve) =>
          setTimeout(() => resolve({ value: null, done: false }), 300)
        )
      ]);
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
      if (chunk.done) break;
    }
    return buffer;
  };

  const initial = await readUntil("STREAM_CONNECTED");
  assert.match(initial, /data: \{"type":"STREAM_CONNECTED"/, "initial frame is a default-type data message");

  await KernelEventBus.getInstance().publish("G21_STREAM_PROBE", { probe: true });
  const after = await readUntil("G21_STREAM_PROBE");
  assert.ok(after.includes("G21_STREAM_PROBE"), "live canonical event reached the stream");

  reader.releaseLock();
  await res.body.cancel();
});

test("G21.C — /api/v1/sse registers a TelemetryEventHub client with init buffer replay", async () => {
  const res = await fetch(`${baseUrl}/api/v1/sse`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/event-stream/);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline && !buffer.includes("TELEMETRY_INIT")) {
    const chunk = await Promise.race([
      reader.read().then(({ value, done }) => ({ value, done })),
      new Promise((resolve) =>
        setTimeout(() => resolve({ value: null, done: false }), 300)
      )
    ]);
    if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
    if (chunk.done) break;
  }

  assert.ok(buffer.includes("retry: 5000"), "retry directive present");
  assert.ok(buffer.includes("TELEMETRY_INIT"), "kernel telemetry buffer replayed on connect");

  reader.releaseLock();
  await res.body.cancel();
});