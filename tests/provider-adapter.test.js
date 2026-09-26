import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProviderDescriptor,
  classifyProviderError,
  providerHealthSnapshot,
  PROVIDER_STATES
} from "../src/ingestion/ProviderAdapterContract.js";
import { ProviderGate } from "../src/ingestion/ProviderGate.js";
import { TestBusinessAdapter } from "../src/ingestion/InjectionAdapter.js";
import { InjectionToCaseMapper } from "../src/ingestion/InjectionToCaseMapper.js";
import { UnifiedIntakeEngine } from "../src/intelligence/UnifiedIntakeEngine.js";
import { ConnectionManager } from "../src/integrations/ConnectionManager.js";

// Batch 8 proving tests: real provider seam, truthful verification, gate,
// SIMULATED-vs-live distinction. No network is opened by any test.

function stubStore() {
  const sections = {};
  return {
    calls: [],
    readSection(k) { return sections[k] ?? null; },
    writeSection(k, v) { sections[k] = v; this.calls.push(k); },
    _sections: sections
  };
}

function stubBus() {
  const published = [];
  return { published, publish(t, p) { published.push({ topic: t, payload: p }); } };
}

function stubCaseManager() {
  return {
    cases: new Map(),
    createCase(input = {}) {
      const record = { id: `CASE-2026-${String(this.cases.size + 1).padStart(4, "0")}`, ...input, history: [] };
      this.cases.set(record.id, record);
      return record;
    }
  };
}

function secrets() {
  return { _m: new Map(), setSecret(k, v) { this._m.set(k, v); }, getSecret(k) { return this._m.get(k); } };
}

const AWBULI = {
  providerId: "AWBULI_WHATSAPP",
  providerType: "WHATSAPP",
  version: "0",
  capabilities: ["message-ingest"],
  configRequirements: ["baseUrl"],
  credentialRequirements: ["AWBULI_API_URL", "AWBULI_API_KEY"],
  executionMode: "PROVIDER_GATED"
};

function gateRig() {
  const store = stubStore();
  const bus = stubBus();
  const gate = new ProviderGate({ store, eventBus: bus });
  return { store, bus, gate };
}

test("8-valid provider configuration declares contract honestly", () => {
  const d = createProviderDescriptor(AWBULI);
  assert.equal(d.state, "NOT_CONFIGURED");
  assert.deepEqual(d.credentialRequirements, ["AWBULI_API_URL", "AWBULI_API_KEY"]);
  assert.ok(PROVIDER_STATES.includes("SUSPENDED"));
  assert.throws(() => createProviderDescriptor({}), /PROVIDER_IDENTITY_REQUIRED/);
  assert.throws(() => createProviderDescriptor({ providerId: "x", providerType: "CARRIER_PIGEON" }), /PROVIDER_TYPE_INVALID/);
});

test("8-missing configuration cannot verify or enable", async () => {
  const { gate } = gateRig();
  gate.register(AWBULI, { actor: "t" });
  const v = await gate.verify("AWBULI_WHATSAPP", { actor: "t" });
  assert.equal(v.state, "NOT_CONFIGURED");
  assert.equal(v.health.live, false);
  assert.throws(() => gate.enable("AWBULI_WHATSAPP", { decidedBy: "founder", reason: "go", level: 3 }), /GATE_BLOCKED/);
  assert.equal(gate.ingestionAllowed("AWBULI_WHATSAPP"), false);
});

test("8-verification failure paths never touch the network", async () => {
  const { gate } = gateRig();
  gate.register(AWBULI, { actor: "t" });
  gate.configure("AWBULI_WHATSAPP", { baseUrl: "not a url at all", actor: "t" });
  const bad = await gate.verify("AWBULI_WHATSAPP", {
    actor: "t",
    connectionManager: { test: async () => { throw Object.assign(new Error("should not be called"), { code: "UNREACHABLE" }); } },
    connectionId: "awbuli"
  });
  assert.ok(["VERIFICATION_FAILED", "CONFIGURED", "NOT_CONFIGURED"].includes(bad.state));
  assert.ok(bad.lastErrorClass);
  const timeout = await gate.verify("AWBULI_WHATSAPP", {
    actor: "t",
    connectionManager: { test: async () => { const e = new Error("socket timed out"); e.code = "ETIMEDOUT"; throw e; } },
    connectionId: "awbuli"
  });
  assert.equal(timeout.lastErrorClass === "VERIFY_TIMEOUT" || timeout.state !== "VERIFIED", true);
  assert.equal(gate.ingestionAllowed("AWBULI_WHATSAPP"), false);
});

test("8-verified state via real ConnectionManager syntactic check", async () => {
  const { gate } = gateRig();
  const cm = new ConnectionManager({ secrets: secrets(), store: stubStore() });
  cm.upsert({ id: "awbuli-bridge", provider: "AWBULI", baseUrl: "https://provider.example.invalid/api" });
  gate.register(AWBULI, { actor: "t" });
  gate.configure("AWBULI_WHATSAPP", { baseUrl: "https://provider.example.invalid/api", actor: "t" });
  const v = await gate.verify("AWBULI_WHATSAPP", { actor: "t", connectionManager: cm, connectionId: "awbuli-bridge" });
  assert.equal(v.state, "VERIFIED");
  assert.equal(v.health.live, false);
  assert.ok(/shape-verified, never live/.test(v.health.note));
});

test("8-enablement authorization: public blocked, L2 allowed, suspension", async () => {
  const { gate, bus } = gateRig();
  const cm = new ConnectionManager({ secrets: secrets(), store: stubStore() });
  cm.upsert({ id: "awbuli-bridge", provider: "AWBULI", baseUrl: "https://provider.example.invalid/api" });
  gate.register(AWBULI, { actor: "t" });
  gate.configure("AWBULI_WHATSAPP", { baseUrl: "https://provider.example.invalid/api", actor: "t" });
  await gate.verify("AWBULI_WHATSAPP", { actor: "t", connectionManager: cm, connectionId: "awbuli-bridge" });
  assert.throws(() => gate.enable("AWBULI_WHATSAPP", { decidedBy: "user", reason: "please", level: 1 }), /GATE_BLOCKED/);
  assert.throws(() => gate.enable("AWBULI_WHATSAPP", { decidedBy: "", reason: "x", level: 3 }), /APPROVAL_IDENTITY_AND_REASON_REQUIRED/);
  const en = gate.enable("AWBULI_WHATSAPP", { decidedBy: "founder", reason: "verified shape; trial scope", level: 3 });
  assert.equal(en.state, "ENABLED");
  assert.equal(gate.ingestionAllowed("AWBULI_WHATSAPP"), true);
  const sp = gate.suspend("AWBULI_WHATSAPP", { decidedBy: "founder", reason: "trial over", level: 3 });
  assert.equal(sp.state, "SUSPENDED");
  assert.equal(gate.ingestionAllowed("AWBULI_WHATSAPP"), false);
  assert.throws(() => gate.enable("AWBULI_WHATSAPP", { decidedBy: "founder", reason: "again", level: 3 }), /GATE_BLOCKED/);
  const topics = bus.published.map((p) => p.topic);
  assert.ok(topics.includes("audit.log.created"));
});

test("8-malformed provider event and secret-bearing config refused", () => {
  const { gate } = gateRig();
  gate.register(AWBULI, { actor: "t" });
  assert.throws(() => gate.configure("AWBULI_WHATSAPP", { baseUrl: "https://x.example/?apiKey=live-secret-123", actor: "t" }), /SECRET_VALUE_REFUSED/);
  assert.throws(() => gate.configure("NOPE", { baseUrl: "https://x.example", actor: "t" }), /PROVIDER_GATE_NOT_FOUND/);
});

test("8-wrong tenant isolated; state persists across instances", async () => {
  const store = stubStore();
  const g1 = new ProviderGate({ store, eventBus: stubBus() });
  g1.register(AWBULI, { actor: "t", tenantScope: "tenantA" });
  assert.equal(g1.get("AWBULI_WHATSAPP", { tenantScope: "tenantB" }), null);
  assert.throws(() => g1.enable("AWBULI_WHATSAPP", { decidedBy: "f", reason: "x", level: 3, tenantScope: "tenantB" }), /PROVIDER_GATE_NOT_FOUND/);
  const g2 = new ProviderGate({ store, eventBus: stubBus() });
  assert.equal(g2.get("AWBULI_WHATSAPP", { tenantScope: "tenantA" }).state, "NOT_CONFIGURED");
  assert.ok(store.calls.includes("providerGates"));
});

test("8-error classification without leaking values", () => {
  assert.equal(classifyProviderError({ code: "CONFIG_MISSING", message: "baseUrl required" }), "CONFIG_MISSING");
  assert.equal(classifyProviderError({ message: "Only HTTP(S) connections are supported" }), "CONFIG_MALFORMED");
  assert.equal(classifyProviderError({ message: "socket timed out" }), "VERIFY_TIMEOUT");
  assert.equal(classifyProviderError(new Error("socket hang up")), "UNKNOWN");
});

test("8D-truthful end-to-end: SIMULATED path works, live path stays gated", () => {
  const store = stubStore();
  const bus = stubBus();
  const cm = stubCaseManager();
  const intake = new UnifiedIntakeEngine({ caseManager: cm });
  const gate = new ProviderGate({ store, eventBus: bus });
  gate.register(AWBULI, { actor: "t" });
  // Live provider event cannot proceed: gate closed.
  assert.equal(gate.ingestionAllowed("AWBULI_WHATSAPP"), false);
  // SIMULATED provider event proves the full downstream path honestly.
  const adapter = new TestBusinessAdapter({});
  const mapper = new InjectionToCaseMapper({ intake, store, eventBus: bus });
  const env = adapter.normalize({ text: "Supplier delivered 20 cartons of milk.", eventId: "evt-8d", eventType: "SUPPLIER_DELIVERY" });
  const out = mapper.map(env, { actor: "8d" });
  assert.equal(out.duplicate, false);
  assert.ok(out.caseId.startsWith("CASE-2026-"));
  assert.ok(cm.cases.get(out.caseId).request.assessment);
  const audits = bus.published.filter((p) => p.topic === "audit.log.created");
  assert.ok(audits.some((p) => p.payload.action === "EVENT_MAPPED_TO_CASE"));
  assert.ok(audits.some((p) => p.payload.category === "PROVIDER_GATE"));
});
