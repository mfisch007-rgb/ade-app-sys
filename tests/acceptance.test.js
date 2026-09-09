import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CapabilityRegistry } from "../src/core/CapabilityRegistry.js";
import { IdentityOnboarding } from "../src/kernel/IdentityOnboarding.js";
import EnterpriseEventBus from "../src/kernel/EnterpriseEventBus.js";
import ScenarioEngine from "../src/kernel/ScenarioEngine.js";
import FeedbackPipeline from "../src/kernel/FeedbackPipeline.js";
import ADE_ICX_Engine from "../src/kernel/ADE_ICX_Engine.js";
import { assertSafeExecution } from "../lib/core/demoGuard.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ade-acceptance-"));

 test("Capability lifecycle and persistence", async () => {
  const store = path.join(tmp, "capabilities.json");
  const bus = new EnterpriseEventBus();
  const registry = new CapabilityRegistry({ storePath: store, eventBus: bus });
  registry.registerCapability({ intent: "TEST_DYNAMIC", name: "Test Dynamic", rbacLevel: 2, tier: "PRO", sourceModule: "TEST", handler: () => true });
  assert.equal(registry.verifyCapability("TEST", "TEST_DYNAMIC"), true);
  registry.revokeCapability("TEST_DYNAMIC");
  assert.equal(registry.getCapability("TEST_DYNAMIC"), undefined);
  registry.restoreCapability("TEST_DYNAMIC");
  assert.ok(registry.getCapability("TEST_DYNAMIC"));
  const second = new CapabilityRegistry({ storePath: store, eventBus: new EnterpriseEventBus() });
  assert.ok(second.getCapability("TEST_DYNAMIC"));
  second.bindCapabilityHandler("TEST_DYNAMIC", () => true);
  const kernel = {
    capabilityRegistry: second,
    guard: { assertCapabilityAllowed() {} },
    eventBus: new EnterpriseEventBus(),
    metrics: { intentsDispatched: 0, intentsSucceeded: 0, intentsFailed: 0, eventsDelivered: 0, eventsFailed: 0, errors: 0 },
    activeAssets: new Set(),
    _publish() {}
  };
  // The canonical kernel dispatch path must execute the registered handler, not merely emit an event.
  const original = (await import("../src/kernel/EnterpriseKernelMaster.js")).EnterpriseKernelMaster.prototype.dispatchIntent;
  const result = await original.call(kernel, "TEST_DYNAMIC", { ok: true }, 2);
  assert.equal(result.success, true);
  assert.equal(result.status, "EXECUTED");
});

test("Identity session is cryptographically verifiable and revocable", () => {
  const credentialStore = {
    getCredentialVersion: () => 1
  };

  const identity =
    new IdentityOnboarding({
      credentialStore
    });
  const session = identity.issueSession({ subject: "test-user", level: 3, tier: "ENTERPRISE", persona: "ADMIN" });
  const claims = identity.verifySession(session.token);
  assert.equal(claims.sub, "test-user");
  assert.equal(claims.level, 3);
  identity.revokeSession(session.token);
  assert.throws(() => identity.verifySession(session.token), /revoked/i);
});

test("Scenario boundary blocks destructive demo side effects", () => {
  const previous = process.env.ADE_DEMO_MODE;
  process.env.ADE_DEMO_MODE = "true";
  assert.throws(() => assertSafeExecution("REAL_PAYMENT_INITIATION"), /blocked/i);
  if (previous === undefined) delete process.env.ADE_DEMO_MODE; else process.env.ADE_DEMO_MODE = previous;
  const engine = new ScenarioEngine({ eventBus: new EnterpriseEventBus() });
  engine.start("demo", { mode: "SIMULATED" });
  assert.equal(engine.executeSideEffect("demo", "EXTERNAL_API_MUTATION", () => "never").status, "SIMULATED");
  engine.finish("demo");
  assert.equal(engine.listActive().length, 0);
});

test("Feedback pipeline sanitizes common PII and survives enrichment failure", async () => {
  const queue = path.join(tmp, "feedback.json");
  const pipeline = new FeedbackPipeline({ queuePath: queue, eventBus: new EnterpriseEventBus(), enrich: async () => { throw new Error("AI offline"); } });
  const result = await pipeline.ingest({ text: "Contact alice@example.com or +234 801 234 5678" });
  assert.match(result.payload.text, /\[REDACTED\]/);
  assert.equal(result.enrichmentStatus, "UNAVAILABLE");
  assert.ok(fs.existsSync(queue));
});

test("ADE-ICX rejects authenticated-session impersonation", () => {
  const icx = new ADE_ICX_Engine({ eventBus: new EnterpriseEventBus() });
  icx.upsertStaff({ id: "staff", fullName: "Staff", role: "Operational Staff", unit: "ADE Core", department: "Ops" });
  icx.upsertStaff({ id: "lead", fullName: "Lead", role: "Team Lead", unit: "ADE Core", department: "Ops" });
  assert.throws(() => icx.sendMessage({ senderId: "staff", recipientId: "lead", channel: "DIRECT", body: "x" }, { actorId: "lead", actorLevel: 2 }), /sender identity/i);
  assert.throws(() => icx.setPresence("staff", "ONLINE", { actorId: "lead", actorLevel: 2 }), /presence authorization/i);
});

test("ADE-ICX enforces organizational communication policy and escalation", () => {
  const icx = new ADE_ICX_Engine({ eventBus: new EnterpriseEventBus() });
  icx.upsertStaff({ id: "staff", fullName: "Staff", role: "Operational Staff", unit: "ADE Core", department: "Ops", teamId: "T1", managerId: "lead" });
  icx.upsertStaff({ id: "lead", fullName: "Lead", role: "Team Lead", unit: "ADE Core", department: "Ops", teamId: "T1", managerId: "manager" });
  icx.upsertStaff({ id: "founder", fullName: "Founder", role: "Founder", unit: "ADE Core", department: "Executive" });
  assert.equal(icx.canCommunicate("staff", "founder", "DIRECT"), false);
  assert.equal(icx.canCommunicate("staff", "lead", "TEAM"), true);
  const esc = icx.escalate({ requesterId: "staff", reason: "Security review" });
  assert.equal(esc.targetId, "lead");
});
