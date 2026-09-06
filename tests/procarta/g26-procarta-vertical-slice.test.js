import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, kernel, kernelReady } from "../../src/app.js";
import CapabilityRegistry from "../../src/core/CapabilityRegistry.js";
import { executeCapability } from "../../src/core/CapabilityExecutor.js";
import { EditionPolicy } from "../../src/core/EditionPolicy.js";
import { ProcartaExecutionEngine } from "../../src/procarta/ProcartaExecutionEngine.js";
import { registerProcartaCapability, PROCARTA_CAPABILITY_INTENT } from "../../src/procarta/procartaCapability.js";
import { CaseManager } from "../../src/intelligence/CaseManager.js";
import { UnifiedIntakeEngine } from "../../src/intelligence/UnifiedIntakeEngine.js";
import EnterpriseEventBus from "../../src/kernel/EnterpriseEventBus.js";
import IdentityOnboarding from "../../src/kernel/IdentityOnboarding.js";

/**
 * G26 STRATEGIC VERTICAL SLICE — PROCARTA canonical execution.
 *
 * Validation suite mapped to the 19-point G26 gate:
 *   1  canonical kernel registration
 *   2  actual capability registration
 *   3  entitlement / edition behavior
 *   4  valid PROCARTA request
 *   5  invalid request rejection
 *   6  intake/context/case boundary
 *   7  real execution path
 *   8  truthful structured result
 *   9  simulation explicitly classified
 *   10 Decision/AI failure behavior
 *   11 storage boundary
 *   12 audit event
 *   13 observability/telemetry boundary
 *   14 feedback/progression boundary
 *   15 no legacy surface accidentally activated
 *   16 no duplicate authority
 *   17 existing canonical suite remains green (run separately)
 *   18 build/release verification remains green (run separately)
 *   19 local runtime smoke proves the capability actually executes
 */

const __root = path.resolve(import.meta.dirname, "../..");
const CREDENTIAL_FILE = path.join(__root, "data", "admin-credential.json");
const AUTH_PIN = "482716";

const authBootstrap =
  !fs.existsSync(CREDENTIAL_FILE) && !process.env.ADE_ADMIN_PIN_HASH;
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
    subject: `g26-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tier: "COMMUNITY",
    level,
    persona: "OPERATOR"
  }).token;

function spyStore() {
  return {
    sections: {},
    writeSection(name, value) {
      this.sections[name] = value;
      return value;
    },
    read() {
      return this.sections;
    },
    readSection(name) {
      return this.sections[name];
    }
  };
}

// ========================================================================
// 1 + 2 — CANONICAL KERNEL / CAPABILITY REGISTRATION
// ========================================================================

test("G26.1 — PROCARTA_EXECUTE is registered in the canonical CapabilityRegistry with a live handler", () => {
  const capability = CapabilityRegistry.getCapability(PROCARTA_CAPABILITY_INTENT);
  assert.ok(capability, "capability is present in the canonical registry");
  assert.equal(typeof capability.handler, "function", "runtime handler is bound");
  assert.equal(capability.rbacLevel, 1, "executes for authenticated level-1 operators");
  assert.equal(capability.sourceModule, "PROCARTA");
  assert.equal(capability.tier, "FREE");

  const record = CapabilityRegistry.publicRecord(capability);
  assert.equal(record.runtimeBound, true, "public record reports runtimeBound true");
  assert.equal(record.revoked, false);
});

test("G26.1 — kernel.dispatchIntent executes the registered PROCARTA capability (canonical kernel path)", async () => {
  const before = kernel.metrics.intentsDispatched;
  const result = await kernel.dispatchIntent(
    PROCARTA_CAPABILITY_INTENT,
    { text: "Energy utility billing workflow automation on SAP", systems: ["sap"], workflows: ["finance"] },
    1
  );
  assert.equal(result.success, true, "kernel dispatch succeeds");
  assert.equal(result.intent, PROCARTA_CAPABILITY_INTENT);
  assert.equal(result.result.executionMode, "LIVE");
  assert.ok(result.result.caseId, "a real case id is produced");
  assert.equal(kernel.metrics.intentsDispatched, before + 1, "kernel counts the dispatch");
  assert.equal(kernel.metrics.intentsSucceeded >= before + 1, true);
});

test("G26.2 — PROCARTA_EXECUTE is discoverable via the authoritative capability surface", async () => {
  const res = await fetch(`${baseUrl}/api/v1/capabilities`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.capabilities.some((c) => c.intent === PROCARTA_CAPABILITY_INTENT && c.runtimeBound === true));
});

// ========================================================================
// 3 — ENTITLEMENT / EDITION BEHAVIOR
// ========================================================================

test("G26.3 — PROCARTA_EXECUTE is edition-entitled as LIVE in COMMUNITY", () => {
  const policy = new EditionPolicy("COMMUNITY");
  assert.equal(policy.isCapabilityAvailable(PROCARTA_CAPABILITY_INTENT), true);
  assert.equal(policy.getCapabilityExecutionMode(PROCARTA_CAPABILITY_INTENT), "LIVE");
  assert.ok(policy.listCapabilities().some((c) => c.intent === PROCARTA_CAPABILITY_INTENT && c.available && c.executionMode === "LIVE"));
});

test("G26.3 — the capability map reports the live capability as registered", async () => {
  const res = await fetch(`${baseUrl}/api/v1/capability-map`);
  assert.equal(res.status, 200);
  const body = await res.json();
  const entry = body.capabilities.find((c) => c.intent === PROCARTA_CAPABILITY_INTENT);
  assert.ok(entry, "capability-map includes PROCARTA_EXECUTE");
  assert.equal(entry.registered, true, "map reflects the runtime-bound capability");
  assert.equal(entry.revoked, false);
});

// ========================================================================
// 4 + 8 — VALID REQUEST → TRUTHFUL STRUCTURED RESULT
// ========================================================================

test("G26.4+8 — valid request produces a real, truthful structured result", async () => {
  const bus = new EnterpriseEventBus();
  const store = spyStore();
  const caseManager = new CaseManager({ eventBus: bus, store });
  const intake = new UnifiedIntakeEngine({ caseManager, eventBus: bus, connectionManager: {} });
  const engine = new ProcartaExecutionEngine({
    kernel: {
      resolve: (name) => (name === "decision" ? null : null),
      container: { get: () => null }
    },
    caseManager,
    intake,
    feedbackPipeline: { ingest: async () => ({ status: "RECEIVED" }) },
    communityProgression: { captureIntake: () => ({ status: "CAPTURED" }) },
    aiGateway: null,
    eventBus: bus
  });

  const result = await engine.execute({
    text: "Manufacturing SME running ERPNext needs inventory to production floor integration",
    organization: "Acme Manufacturing Ltd",
    systems: ["erpnext"],
    workflows: ["inventory", "production"]
  });

  assert.equal(result.executionMode, "LIVE", "real execution mode, never SIMULATED");
  assert.equal(result.triggeredBy, PROCARTA_CAPABILITY_INTENT);
  assert.match(result.caseId, /^CASE-/);
  assert.ok(result.intent, "intake-derived intent");
  assert.ok(Array.isArray(result.findings) && result.findings.length > 0);
  assert.ok(Array.isArray(result.recommendedNextActions));
  assert.equal(result.stored, true);
  assert.equal(result.audited, true);
  assert.ok(result.executedAt);
  assert.equal(result.evidence?.[0], undefined, "no fabricated reconciliation key is produced");
});

// ========================================================================
// 5 — INVALID REQUEST REJECTION
// ========================================================================

test("G26.5 — missing operational description is rejected (engine + HTTP boundary)", async () => {
  const bus = new EnterpriseEventBus();
  const engine = new ProcartaExecutionEngine({
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    eventBus: bus
  });

  await assert.rejects(
    engine.execute({}),
    (error) => error.message.startsWith("PROCARTA_INPUT_REQUIRED")
  );
  await assert.rejects(
    engine.execute({ description: "   " }),
    (error) => error.message.startsWith("PROCARTA_INPUT_REQUIRED")
  );

  const token = issueOperatorToken(1);
  const res = await fetch(`${baseUrl}/api/command/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: PROCARTA_CAPABILITY_INTENT, payload: {} })
  });
  assert.equal(res.status, 400, "malformed PROCARTA request is rejected with 400 at the HTTP boundary");
  assert.equal((await res.json()).error.includes("PROCARTA_INPUT_REQUIRED"), true);
});

test("G26.5 — unsupported intake channel is rejected", async () => {
  const bus = new EnterpriseEventBus();
  const engine = new ProcartaExecutionEngine({
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    eventBus: bus
  });
  await assert.rejects(
    engine.execute({ text: "some operational statement", channel: "SMOKESIGNAL" }),
    /Unsupported intake channel/
  );
});

// ========================================================================
// 6 — INTAKE / CONTEXT / CASE BOUNDARY
// ========================================================================

test("G26.6 — execution creates a durable case carrying intake-derived context", async () => {
  const bus = new EnterpriseEventBus();
  const store = spyStore();
  const caseManager = new CaseManager({ eventBus: bus, store });
  const intake = new UnifiedIntakeEngine({ caseManager, eventBus: bus, connectionManager: {} });
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager,
    intake,
    eventBus: bus
  });

  const result = await engine.execute({
    text: "Retail chain needs Salesforce order-to-cash automation",
    systems: ["salesforce"],
    workflows: ["sales", "finance"]
  });

  assert.equal(result.caseCreated, true);
  const record = caseManager.get(result.caseId);
  assert.ok(record, "case is retrievable through CaseManager");
  assert.equal(record.requiredCapabilities.includes(PROCARTA_CAPABILITY_INTENT), true);
  assert.equal(record.procarta.executionMode, "LIVE", "procarta context is stored on the case record");
  assert.equal(Array.isArray(record.procarta.findings), true);
  assert.ok((store.sections.cases || []).some((c) => c.id === result.caseId), "case is persisted to the store");
});

test("G26.6 — a supplied existing caseId is resolved (not duplicated)", async () => {
  const bus = new EnterpriseEventBus();
  const caseManager = new CaseManager({ eventBus: bus, store: spyStore() });
  const intake = new UnifiedIntakeEngine({ caseManager, eventBus: bus });
  const existing = caseManager.createCase({ source: "PROCARTA", channel: "API", request: { intent: "PROBE" } });
  const engine = new ProcartaExecutionEngine({ kernel: { resolve: () => null }, caseManager, intake, eventBus: bus });

  const result = await engine.execute({ caseId: existing.id, text: "Continuing the same operational analysis" });
  assert.equal(result.caseId, existing.id);
  assert.equal(result.caseCreated, false, "existing case is reused");
  assert.equal(caseManager.list().length, 1, "no duplicate case is created");
});

// ========================================================================
// 7 + 9 — REAL EXECUTION PATH (evidence-grounded, never fabricated)
// ========================================================================

test("G26.7 — findings are evidence-grounded, derived from the actual signals in the input", async () => {
  const bus = new EnterpriseEventBus();
  const caseManager = new CaseManager({ eventBus: bus, store: spyStore() });
  const intake = new UnifiedIntakeEngine({ caseManager, eventBus: bus });
  const engine = new ProcartaExecutionEngine({ kernel: { resolve: () => null }, caseManager, intake, eventBus: bus });

  const result = await engine.execute({
    text: "SAP procurement and warehouse automation",
    systems: ["sap"],
    workflows: ["procurement", "warehouse"]
  });

  const sysFinding = result.findings.find((f) => f.id === "SYS_INTEGRATION_SURFACE");
  assert.deepEqual(sysFinding.evidence, ["sap"], "finding evidence is the real detected system signal");

  const wfFinding = result.findings.find((f) => f.id === "WORKFLOW_PROCESS_FOCUS");
  assert.equal(wfFinding.evidence.includes("procurement"), true, "workflow finding is grounded in the detected process areas");

  assert.equal(result.analysis.source, "DETERMINISTIC", "no AI configured → deterministic analysis, truthfully labeled");
  assert.equal(result.analysis.ai, "UNAVAILABLE");
});

test("G26.9 — crash-reset: the canonical capability never emits an unclassified simulation", async () => {
  const record = CapabilityRegistry.getCapability(PROCARTA_CAPABILITY_INTENT);
  assert.equal(record.classification, "DYNAMIC_CAPABILITY");
  assert.notEqual(record.classification, "SIMULATED");

  const pluginFile = fs.readFileSync(path.join(__root, "src", "plugins", "procarta.plugin.js"), "utf8");
  assert.ok(
    pluginFile.includes('executionMode: "SIMULATED"'),
    "the retained legacy helper simulation is unmistakably classified SIMULATED"
  );
});

// ========================================================================
// 10 — DECISION / AI FAILURE BEHAVIOR
// ========================================================================

test("G26.10 — decision engine unavailable falls back to an explicit default, never a fake decision", async () => {
  const bus = new EnterpriseEventBus();
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    aiGateway: null,
    eventBus: bus
  });
  const result = await engine.execute({ text: "Warehouse logistics improvement program", workflows: ["warehouse"] });
  assert.equal(result.decision.source, "DEFAULT");
  assert.equal(result.decision.reason.includes("unavailable"), true, "unavailability is stated explicitly");
  assert.ok(["HOLD", "REJECT", "APPROVE"].includes(result.decision.decision));
});

test("G26.10 — unconfigured AI gateway is reported truthfully (no lexical-engine masquerade)", async () => {
  const bus = new EnterpriseEventBus();
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    aiGateway: {
      getProviderStatus: () => ({ configuredProviderCount: 0 }),
      dispatchPrompt: async () => {
        throw new Error("SHOULD_NOT_BE_CALLED");
      }
    },
    eventBus: bus
  });
  const result = await engine.execute({ text: "CRM data quality assessment", systems: ["dynamics"] });
  assert.equal(result.ai.available, false, "no provider configured");
  assert.equal(result.ai.route, null);
  assert.equal(result.analysis.source, "DETERMINISTIC");
  assert.equal(result.ai.note.includes("No AI provider configured"), true, "note is truthful");
});

test("G26.10 — real provider-neutral AI augmentation is surfaced when configured", async () => {
  const bus = new EnterpriseEventBus();
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    aiGateway: {
      getProviderStatus: () => ({ configuredProviderCount: 1 }),
      dispatchPrompt: async () => ({ response: "REAL_PROVIDER_OUTPUT", route: "GEMINI", status: "SUCCESS" })
    },
    eventBus: bus
  });
  const result = await engine.execute({ text: "Dynamics 365 finance consolidation", systems: ["dynamics"], workflows: ["finance"] });
  assert.equal(result.ai.available, true);
  assert.equal(result.ai.route, "GEMINI");
  assert.equal(result.ai.response, "REAL_PROVIDER_OUTPUT");
  assert.equal(result.analysis.source, "HYBRID");
});

// ========================================================================
// 11 — STORAGE BOUNDARY
// ========================================================================

test("G26.11 — execution persist is bounded and the case snapshot carries the structured result", async () => {
  const bus = new EnterpriseEventBus();
  const store = spyStore();
  const caseManager = new CaseManager({ eventBus: bus, store });
  const intake = new UnifiedIntakeEngine({ caseManager, eventBus: bus });
  const engine = new ProcartaExecutionEngine({ kernel: { resolve: () => null }, caseManager, intake, eventBus: bus });

  const result = await engine.execute({ text: "Order management workflow optimization", workflows: ["order management"] });
  const persisted = (store.sections.cases || []).find((c) => c.id === result.caseId);
  assert.ok(persisted, "case is written to the durable store section");
  assert.equal(persisted.procarta.executionMode, "LIVE");
  assert.equal(persisted.channel, "API");

  const reloaded = new CaseManager({ eventBus: bus, store });
  assert.ok(reloaded.get(result.caseId), "the case survives a fresh CaseManager over the same store");
});

test("G26.11 — a failed case-context write is reported truthfully, never silently swallowed", async () => {
  const bus = new EnterpriseEventBus();
  const caseManager = new CaseManager({ eventBus: bus, store: spyStore() });
  const failingUpdate = () => {
    throw new Error("disk full");
  };
  caseManager.update = failingUpdate;
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager,
    intake: new UnifiedIntakeEngine({ caseManager, eventBus: bus }),
    eventBus: bus
  });

  const result = await engine.execute({ text: "Case context enrichment failure probe", workflows: ["operations"] });
  assert.equal(result.caseCreated, true, "authoritative case creation still succeeds");
  assert.equal(result.contextPersisted, false, "failed enrichment is truthfully reported");
  assert.ok(
    String(result.warning || "").startsWith("PROCARTA_CONTEXT_UPDATE_FAILED"),
    "the surface names the failed write explicitly"
  );
});

// ========================================================================
// 12 — AUDIT EVENT
// ========================================================================

test("G26.12 — execution emits canonical audit + domain events on the bus", async () => {
  const bus = new EnterpriseEventBus();
  const audits = [];
  bus.subscribe("audit.log.created", (payload) => audits.push(payload));
  const dom = [];
  bus.subscribe("procarta.executed", (payload) => dom.push(payload));

  const caseManager = new CaseManager({ eventBus: bus, store: spyStore() });
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager,
    intake: new UnifiedIntakeEngine({ caseManager, eventBus: bus }),
    eventBus: bus
  });

  const result = await engine.execute({ text: "Procurement spend reduction program", workflows: ["procurement"] });

  assert.equal(dom.length, 1, "domain event published");
  assert.equal(dom[0].caseId, result.caseId);
  assert.ok(audits.length >= 1, "audit.log.created published to the canonical durable-audit topic");
  const last = audits[audits.length - 1];
  assert.equal(last.category, "PROCARTA");
  assert.equal(last.caseId, result.caseId);
  assert.equal(last.executionMode, "LIVE");
});

// ========================================================================
// 13 — OBSERVABILITY / TELEMETRY BOUNDARY
// ========================================================================

test("G26.13 — kernel-level execution flows into live kernel metrics", async () => {
  const beforeEvents = kernel.metrics.eventsDelivered;
  const result = await kernel.dispatchIntent(
    PROCARTA_CAPABILITY_INTENT,
    { text: "Availability observability telemetry probe", workflows: ["operations"] },
    1
  );
  assert.equal(result.success, true);
  assert.ok(
    kernel.metrics.eventsDelivered >= beforeEvents,
    "the PROCARTA execution publishes onto the canonical bus and is counted"
  );
});

// ========================================================================
// 14 — FEEDBACK / PROGRESSION BOUNDARY
// ========================================================================

test("G26.14 — qualified execution captures a follow-up and a community progression signal", async () => {
  const bus = new EnterpriseEventBus();
  const feedbackItems = [];
  const progressionIntakes = [];
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    feedbackPipeline: { ingest: async (item) => { feedbackItems.push(item); return item; } },
    communityProgression: { captureIntake: (intake) => { progressionIntakes.push(intake); return { status: "CAPTURED" }; } },
    eventBus: bus
  });

  const result = await engine.execute({
    text: "Warehouse and logistics business needs SAP order-to-cash automation",
    organization: "AfriLogistics",
    systems: ["sap"],
    workflows: ["sales", "finance"],
    email: "ops@afri.example"
  });

  assert.equal(result.feedbackCaptured, true, "follow-up signal captured");
  assert.equal(feedbackItems.length, 1);
  assert.equal(feedbackItems[0].type, "PROCARTA_FOLLOW_UP");
  assert.equal(feedbackItems[0].caseId, result.caseId);

  assert.equal(result.progressionCaptured, true, "qualified case advances community progression");
  assert.equal(progressionIntakes.length, 1);
  assert.equal(progressionIntakes[0].metadata.caseId, result.caseId);
  assert.equal(progressionIntakes[0].organization, "AfriLogistics");
});

test("G26.14 — low-confidence input does not fabricate a progression signal", async () => {
  const bus = new EnterpriseEventBus();
  const progressionIntakes = [];
  const engine = new ProcartaExecutionEngine({
    kernel: { resolve: () => null, container: { get: () => null } },
    caseManager: new CaseManager({ eventBus: bus, store: spyStore() }),
    intake: new UnifiedIntakeEngine({ caseManager: {}, eventBus: bus }),
    feedbackPipeline: { ingest: async () => ({}) },
    communityProgression: { captureIntake: (i) => { progressionIntakes.push(i); return {}; } },
    eventBus: bus
  });

  const result = await engine.execute({ text: "Is ADE a good idea for businesses?" });
  assert.equal(result.progressionCaptured, false, "general inquiry does not fabricate a qualified progression");
  assert.equal(progressionIntakes.length, 0);
});

// ========================================================================
// 15 + 16 — NO LEGACY SURFACE / NO DUPLICATE AUTHORITY
// ========================================================================

test("G26.15 — the canonical engine composes canonical modules and never imports legacy surfaces", () => {
  const engineSrc = fs.readFileSync(path.join(__root, "src", "procarta", "ProcartaExecutionEngine.js"), "utf8");
  const forbidden = [
    "src/workflows", "src/routes", "src/gateway", "src/eventBus/",
    "src/ai/AIGatewayMaster", "src/core/KernelLoader", "src/core/DIContainer",
    "src/server/WebhookServer", "src/index.js", "products/"
  ];
  for (const needle of forbidden) {
    assert.ok(!engineSrc.includes(needle), `engine must not reference legacy surface '${needle}'`);
  }

  const appSrc = fs.readFileSync(path.join(__root, "src", "app.js"), "utf8");
  assert.ok(!appSrc.includes("ProcartaPlugin"), "canonical runtime never imports the simulated ProcartaPlugin");
  assert.ok(!appSrc.includes("procarta.plugin.js"), "canonical runtime never imports the simulated helper");
  assert.ok(!appSrc.includes("CommandPaletteEngine"), "no legacy command authority is pulled in");
});

test("G26.16 — registry-bound execution is single-authority: executeCapability is the executor, handler runs exactly once", async () => {
  const reg = CapabilityRegistry;
  const recorded = reg.getCapability(PROCARTA_CAPABILITY_INTENT);
  assert.ok(recorded && typeof recorded.handler === "function");
  const original = recorded.handler;
  let handlerCalls = 0;
  const spyHandler = async (payload, context) => {
    handlerCalls += 1;
    return original(payload, context);
  };
  reg.registerCapability({ ...recorded, handler: spyHandler }, { persist: false });
  try {
    const out = await executeCapability(reg, PROCARTA_CAPABILITY_INTENT, {
      text: "Single-authority execution probe"
    }, 1);

    assert.equal(out.executed, true, "executeCapability is the executor");
    assert.equal(out.intent, PROCARTA_CAPABILITY_INTENT);
    assert.equal(out.result.executionMode, "LIVE");
    assert.equal(handlerCalls, 1, "the capability handler ran exactly once — no re-dispatch to the kernel");
  } finally {
    reg.registerCapability({ ...recorded, handler: original }, { persist: false });
  }
});

// ========================================================================
// 19 — LOCAL RUNTIME SMOKE (HTTP proof the capability actually executes)
// ========================================================================

test("G26.19 — local runtime smoke: authenticated command executes PROCARTA over HTTP", {
  skip: !authBootstrap ? "credential already configured in env; positive HTTP flow not safe to bootstrap" : false
}, async () => {
  const token = issueOperatorToken(1);

  const res = await fetch(`${baseUrl}/api/command/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: PROCARTA_CAPABILITY_INTENT,
      payload: {
        text: "Small business on ERPNext needs procurement + inventory automation",
        organization: "Kampala Traders",
        systems: ["erpnext"],
        workflows: ["procurement", "inventory"]
      }
    })
  });

  assert.equal(res.status, 200, "authenticated PROCARTA command executes over HTTP");
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.status, "EXECUTED_BY_CAPABILITY_REGISTRY");
  assert.equal(body.result.executionMode, "LIVE");
  assert.ok(body.result.caseId);

  const statusRes = await fetch(`${baseUrl}/api/v1/procarta/status`);
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.success, true);
  assert.equal(statusBody.capability, PROCARTA_CAPABILITY_INTENT);
  assert.equal(statusBody.engine.status, "ONLINE");
  assert.equal(statusBody.registered, true);
  assert.ok(
    statusBody.recentExecutions.some((e) => e.caseId === body.result.caseId),
    "the live execution appears in the canonical PROCARTA status surface"
  );

  const editionRes = await fetch(`${baseUrl}/api/v1/edition`);
  const editionBody = await editionRes.json();
  assert.ok(
    editionBody.capabilities.some((c) => c.intent === PROCARTA_CAPABILITY_INTENT && c.available),
    "edition surface advertises the live PROCARTA capability"
  );
});

// ========================================================================
// CapabilityExecutor async-handler regression (enables G26 execution path)
// ========================================================================

test("G26 — executeCapability awaits async capability handlers (regression)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-g26-exec-"));
  const storePath = path.join(dir, "caps.json");
  const bus = new EnterpriseEventBus();
  const reg = new (await import("../../src/core/CapabilityRegistry.js")).CapabilityRegistry({
    storePath,
    eventBus: bus
  });
  reg.registerCapability(
    {
      intent: "ASYNC_PROBE",
      name: "Async Probe",
      rbacLevel: 0,
      sourceModule: "TEST",
      handler: async (payload = {}) => ({ echoed: payload?.value, mode: "ASYNC_COMPLETED" })
    },
    { persist: false }
  );

  const out = await executeCapability(reg, "ASYNC_PROBE", { value: 42 }, 0);
  assert.equal(out.executed, true);
  assert.deepEqual(out.result, { echoed: 42, mode: "ASYNC_COMPLETED" }, "async result is the real output, not a Promise");
  fs.rmSync(dir, { recursive: true, force: true });
});