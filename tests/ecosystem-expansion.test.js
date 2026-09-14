import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectionFabric, gripMeter } from "../src/integrations/ConnectionFabric.js";
import { ConnectionManager } from "../src/integrations/ConnectionManager.js";
import { ProductRegistry } from "../src/products/ProductRegistry.js";
import { CapabilityExchange } from "../src/integrations/CapabilityExchange.js";
import { LearningCandidates } from "../src/learning/LearningCandidates.js";
import { PublicDataRegistry } from "../src/data/PublicDataRegistry.js";
import { VenueRegistry } from "../src/trading/VenueRegistry.js";
import { TradingEntitlements } from "../src/trading/TradingEntitlements.js";
import { SignalQualityGate } from "../src/trading/SignalQualityGate.js";
import { OracleFabric } from "../src/ai/OracleFabric.js";
import { LocalProvider } from "../src/ai/LocalProvider.js";

function stubStore() {
  const sections = {};
  return {
    readSection: (k) => sections[k] ?? null,
    writeSection: (k, v) => { sections[k] = v; },
    read: () => ({ ...sections }),
    write: (s, k, v) => { sections[s] = sections[s] || {}; sections[s][k] = v; }
  };
}

function fabric() {
  const secrets = { _m: new Map(), setSecret(k, v) { this._m.set(k, v); }, getSecret(k) { return this._m.get(k); } };
  const cm = new ConnectionManager({ secrets, store: stubStore() });
  const f = new ConnectionFabric({ connectionManager: cm, productRegistry: new ProductRegistry() });
  return { f, cm };
}

test("expansion: classify covers required detection vocabulary without false activation", () => {
  const { f } = fabric();
  const labels = ["awbuli", "procarta", "nexus", "eventos"].map((id) => f.classify(id).detectionLabel);
  const allowed = new Set(["ACTIVE", "CONNECTED", "OFFLINE", "REMOTE", "CONFIGURED", "CODE_SCHEMA_PRESENT", "NOT_INITIALIZED", "PARTIAL", "INCOMPATIBLE", "UNKNOWN"]);
  for (const l of labels) assert.ok(allowed.has(l), `bad label ${l}`);
  const unknown = f.classify("no-such-product-xyz");
  assert.equal(unknown.detectionLabel, "UNKNOWN");
  const refused = f.activate("no-such-product-xyz", {});
  assert.equal(refused.ok, false);
});

test("expansion: full pipeline report exposes DETECT→REPORT with grip meter", () => {
  const { f } = fabric();
  const r = f.report("awbuli");
  assert.deepEqual(r.pipeline, ["DETECT", "INSPECT", "CLASSIFY", "CONNECT", "INITIALIZE", "VERIFY", "REGISTER", "EXCHANGE", "ACTIVATE", "REPORT"]);
  assert.ok(r.gripMeter && typeof r.gripMeter.grip === "number");
  assert.ok(r.gripMeter.greenIntensity + r.gripMeter.redIntensity <= 1.01);
  assert.ok(Array.isArray(r.gripMeter.connected) && Array.isArray(r.gripMeter.unavailable));
  const gm = gripMeter({ grip: 75, connected: ["a"], partial: [], unavailable: ["b"], failureReason: "x", requiredAction: "y", alternative: "z" });
  assert.equal(gm.greenIntensity, 0.75);
  assert.equal(gm.redIntensity, 0.25);
});

test("expansion: capability exchange is bidirectional ADE↕PRODUCT with human action", () => {
  const { f } = fabric();
  const ex = new CapabilityExchange({ productRegistry: new ProductRegistry(), capabilityRegistry: { listCapabilities: () => [{ intent: "PING" }] }, connectionFabric: f });
  const c = ex.compare("awbuli");
  assert.equal(c.direction, "ADE↕PRODUCT");
  assert.ok(Array.isArray(c.productCapabilities) && Array.isArray(c.adeCapabilities));
  assert.ok(Array.isArray(c.overlap) && Array.isArray(c.missingCapabilities));
  assert.ok(Array.isArray(c.safeAugmentations));
  assert.ok(typeof c.requiredHumanAction === "string" || c.requiredHumanAction === null);
  assert.equal(c.activated, false);
});

test("expansion: learning candidates require human approval + handler, never silent", () => {
  const feedback = { getPatternReport: () => ({ patterns: [{ category: "SOMETHING_FAILED", count: 6, feature: "X" }] }) };
  const registry = { _caps: [], listCapabilities() { return this._caps; }, registerCapability(c) { this._caps.push(c); } };
  const lc = new LearningCandidates({ feedbackIntelligence: feedback, capabilityRegistry: registry });
  const derived = lc.deriveFromPatterns({ minCount: 5 });
  assert.equal(derived.length, 1);
  assert.equal(derived[0].state, "CANDIDATE");
  assert.throws(() => lc.decide(derived[0].id, { approved: true, decidedBy: "founder", reason: "looks good" }), /APPROVAL_HANDLER_REQUIRED/);
  const ok = lc.decide(derived[0].id, { approved: true, decidedBy: "founder", reason: "verified repeatable", handler: async () => ({ ok: true }), intent: "LEARNED_DEMO_CAP" });
  assert.equal(ok.state, "REGISTERED");
  assert.equal(registry._caps.length, 1);
});

test("expansion: oracle zero-provider + sensitive privacy stays honest", async () => {
  const zero = new OracleFabric({ gateway: { getProviderStatus: () => ({ providers: [] }), dispatchPrompt: async () => { throw new Error("no provider"); } } });
  const r = await zero.query({ prompt: "hello", privacy: "internal" });
  assert.equal(r.ok, true);
  assert.equal(r.advisoryOnly, true);
  const s = await zero.query({ prompt: "secret", privacy: "sensitive" });
  const model = s.fragments.find((x) => x.source === "MODEL_OPINION");
  assert.ok(model.content.includes("Withheld") || model.route === "WITHHELD_OR_UNWIRED");
  const local = new LocalProvider();
  assert.notEqual(local.status().state, "ONLINE");
});

test("expansion: public data sources carry provenance and degrade honestly", async () => {
  const reg = new PublicDataRegistry({ fetchImpl: async () => { throw new Error("offline"); } });
  const catalog = reg.catalog();
  assert.ok(catalog.length >= 6);
  for (const s of catalog) assert.ok(s.id && s.license && s.access);
  const r = await reg.retrieve("frankfurter", { base: "EUR", symbols: "NGN" });
  assert.equal(r.ok, false);
  assert.ok(r.provenance && r.provenance.source === "frankfurter" && r.provenance.freshness);
  const okReg = new PublicDataRegistry({ fetchImpl: async () => ({ ok: true, json: async () => ({ base: "EUR", date: "2026-01-01", rates: { NGN: 1700 } }) }) });
  const ok = await okReg.retrieve("frankfurter", {});
  assert.equal(ok.ok, true);
  assert.equal(ok.provenance.classification, "EXTERNAL_PUBLIC_DATA");
});

test("expansion: venue registry is flexible (no hardcode) and live-gated", () => {
  const vr = new VenueRegistry({ store: stubStore() });
  assert.ok(vr.list("BINARY_BROKER").length >= 4);
  assert.ok(vr.list("GAMING_BOOKIE").length >= 6);
  const added = vr.registerVenue({ name: "Future Broker X", kind: "BINARY_BROKER", requiredFields: ["FUTURE_X_TOKEN"] });
  assert.ok(added.id.includes("future-broker"));
  const before = vr.liveEligibility(added.id);
  assert.equal(before.eligible, false);
  assert.equal(before.mode, "PAPER_ONLY");
  vr.setConfigured(added.id, { configured: true, verified: true });
  assert.equal(vr.liveEligibility(added.id).eligible, true);
});

test("expansion: entitlements are selective per user, founder-gated at route", () => {
  const ent = new TradingEntitlements({ store: stubStore() });
  assert.equal(ent.can("alice", "trading"), false);
  ent.grant("alice", { trading: true, gaming: false, grantedBy: "founder" });
  assert.equal(ent.can("alice", "trading"), true);
  assert.equal(ent.can("alice", "gaming"), false);
  ent.grant("bob", { trading: true, gaming: true, grantedBy: "founder" });
  assert.equal(ent.can("bob", "gaming"), true);
});

test("expansion: signal gate never mutates engine, blocks weak/manipulated, paper-default", () => {
  const ent = new TradingEntitlements({ store: stubStore() });
  ent.grant("alice", { trading: true, gaming: false, grantedBy: "founder" });
  const vr = new VenueRegistry({ store: stubStore() });
  const gate = new SignalQualityGate({ entitlements: ent, venueRegistry: vr, signalEngine: { getStatus: () => ({ emergencyStop: false }) } });
  const weak = gate.gate({ state: "WATCH", confidence: 0.1 }, { userId: "alice" });
  assert.equal(weak.pass, false);
  const manip = gate.gate({ state: "REJECTED_BROKER_MANIPULATION" }, { userId: "alice" });
  assert.equal(manip.pass, false);
  const unentitled = gate.gate({ state: "CONFIRMED", confidence: 0.9 }, { userId: "nobody" });
  assert.equal(unentitled.pass, false);
  const good = gate.gate({ state: "CONFIRMED", confidence: 0.9 }, { userId: "alice" });
  assert.equal(good.pass, true);
  assert.equal(good.mode, "PAPER_CANDIDATE");
  const auto = gate.autoMode({ userId: "alice", feature: "trading", targetAmount: 100 });
  assert.equal(auto.allowed, true);
  assert.equal(auto.mode, "PAPER_AUTO");
});
