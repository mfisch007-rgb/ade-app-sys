import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectionFabric, CONNECTION_STATES } from "../src/integrations/ConnectionFabric.js";
import { ConnectionManager } from "../src/integrations/ConnectionManager.js";
import { ProductRegistry } from "../src/products/ProductRegistry.js";
import { CapabilityActivation } from "../src/capabilities/CapabilityActivation.js";
import { EditionPolicy } from "../src/core/EditionPolicy.js";

function stubStore() {
  const sections = {};
  return {
    readSection: (k) => sections[k] ?? null,
    writeSection: (k, v) => { sections[k] = v; }
  };
}

function fabric() {
  const secrets = { _m: new Map(), setSecret(k, v) { this._m.set(k, v); }, getSecret(k) { return this._m.get(k); } };
  const cm = new ConnectionManager({ secrets, store: stubStore() });
  return { fabric: new ConnectionFabric({ connectionManager: cm, productRegistry: new ProductRegistry() }), cm, secrets };
}

test("connectivity: discovery finds in-repo product manifests", () => {
  const { fabric: f } = fabric();
  const found = f.discover().map((d) => d.id).sort();
  for (const id of ["awbuli", "procarta", "nexus", "eventos"]) {
    assert.ok(found.includes(id), `missing ${id}`);
  }
  assert.ok(CONNECTION_STATES.includes("CONNECTED") && CONNECTION_STATES.includes("PARTIALLY_CONNECTED"));
});

test("connectivity: AWBULI reports partial grip without fabricating a bridge", () => {
  const savedUrl = process.env.AWBULI_API_URL;
  const savedKey = process.env.AWBULI_API_KEY;
  delete process.env.AWBULI_API_URL;
  delete process.env.AWBULI_API_KEY;
  try {
    const { fabric: f } = fabric();
    const r = f.inspect("awbuli");
    assert.equal(r.id, "awbuli");
    assert.equal(r.state, "PARTIALLY_CONNECTED");
    assert.equal(r.grip, 67); // 2 of 3 required (local engine), bridge missing
    assert.ok(r.gripLabel.includes("67%"));
    assert.ok((r.requiredAction || "").includes("AWBULI_API_URL"));
    assert.ok(r.alternative && r.alternative.length > 5);
    const leaked = JSON.stringify(r);
    assert.ok(!leaked.includes("sk-") && !leaked.includes("BEGIN PRIVATE"));
  } finally {
    if (savedUrl !== undefined) process.env.AWBULI_API_URL = savedUrl;
    if (savedKey !== undefined) process.env.AWBULI_API_KEY = savedKey;
  }
});

test("connectivity: PROCARTA canonical slice reports connected", () => {
  const { fabric: f } = fabric();
  const r = f.inspect("procarta");
  assert.equal(r.state, "CONNECTED");
  assert.equal(r.grip, 100);
});

test("connectivity: generic record never claims CONNECTED from syntax alone", () => {
  const { fabric: f, cm } = fabric();
  const rec = cm.upsert({ provider: "ODOO", baseUrl: "https://odoo.example.com", authType: "API_KEY" });
  const before = f.inspect("odoo");
  assert.notEqual(before.state, "CONNECTED");
  assert.ok(before.grip < 100);
  assert.ok(before.nextAction === "VERIFY");
  // With credential but no handshake: AUTH_REQUIRED at most.
  cm.upsert({ id: rec.id, provider: "ODOO", baseUrl: "https://odoo.example.com", apiKey: "secret-123" });
  const authed = f.inspect("odoo");
  assert.equal(authed.state, "AUTH_REQUIRED");
  const leaked = JSON.stringify(authed);
  assert.ok(!leaked.includes("secret-123"));
});

test("connectivity: verify with mocked transport can complete a generic handshake", async () => {
  const { fabric: f, cm } = fabric();
  const rec = cm.upsert({ provider: "ACME", baseUrl: "https://acme.example.com", apiKey: "k" });
  assert.ok(rec.secretConfigured === true);
  const out = await f.verify("acme", { fetchImpl: async () => ({ ok: true, status: 200 }) });
  assert.equal(out.verify.transportReachable, true);
  assert.equal(out.state, "CONNECTED");
  assert.equal(out.grip, 100);
  const fail = await f.verify("acme", { fetchImpl: async () => { throw new Error("down"); } });
  assert.equal(fail.verify.transportReachable, false);
  assert.ok(fail.verify.error.length > 0);
});

test("connectivity: AWBULI verify without credentials stays AUTH_REQUIRED", async () => {
  const savedUrl = process.env.AWBULI_API_URL;
  const savedKey = process.env.AWBULI_API_KEY;
  delete process.env.AWBULI_API_URL;
  delete process.env.AWBULI_API_KEY;
  try {
    const { fabric: f } = fabric();
    const out = await f.verify("awbuli", { fetchImpl: async () => ({ ok: true, status: 200 }) });
    assert.equal(out.verify.state, "AUTH_REQUIRED");
    assert.notEqual(out.state, "CONNECTED");
  } finally {
    if (savedUrl !== undefined) process.env.AWBULI_API_URL = savedUrl;
    if (savedKey !== undefined) process.env.AWBULI_API_KEY = savedKey;
  }
});

test("activation: truthful states, safe-local activate, blocked external without handler", () => {
  const registry = { _caps: [{ intent: "PING" }], listCapabilities() { return this._caps; }, registerCapability(intent, def) { this._caps.push({ intent, ...def }); } };
  const act = new CapabilityActivation({ capabilityRegistry: registry, editionPolicy: new EditionPolicy(), providerStatus: () => ({ configuredProviderCount: 0 }) });
  const map = act.assess();
  assert.ok(Array.isArray(map) && map.length > 0);
  assert.ok(map.every((c) => ["AVAILABLE", "ACTIVATED", "CONFIGURATION_REQUIRED", "PARTNER_REQUIRED", "EXTERNAL_CREDENTIAL_REQUIRED", "PREVIEW", "OFFLINE", "UNAVAILABLE"].includes(c.state)));
  const blocked = act.activate("WHATSAPP_GATEWAY", {});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.state, "EXTERNAL_CREDENTIAL_REQUIRED");
  const local = act.activate("LOCAL_SAFE_DEMO_CAP", { handler: async () => ({ ok: true }) });
  assert.equal(local.ok, true);
  assert.equal(local.state, "ACTIVATED");
  const again = act.activate("LOCAL_SAFE_DEMO_CAP", {});
  assert.equal(again.ok, true); // idempotent: already registered
});
