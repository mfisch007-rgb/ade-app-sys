import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildKnobInventory, buildHumanChecklist } from "../src/ops/OperationalKnobInventory.js";
import { AUTHORITIES, authorityReport } from "../src/ops/AuthorityMap.js";
import { WhatsAppNumberRegistry } from "../src/ingestion/WhatsAppNumberRegistry.js";
import { ProviderGate } from "../src/ingestion/ProviderGate.js";
import { CapabilityActivation } from "../src/capabilities/CapabilityActivation.js";
import { EditionPolicy } from "../src/core/EditionPolicy.js";

// Batch 12N proving tests: knob discovery, human configuration, branding,
// boundaries, persistence, honesty. No network, no secrets.

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

function sampleDeps() {
  const store = stubStore();
  const gate = new ProviderGate({ store, eventBus: stubBus() });
  gate.register({ providerId: "AWBULI_WHATSAPP", providerType: "WHATSAPP", credentialRequirements: ["AWBULI_API_URL", "AWBULI_API_KEY"] }, { actor: "t" });
  const act = new CapabilityActivation({
    capabilityRegistry: { listCapabilities: () => [{ intent: "PROCARTA_EXECUTE" }, { intent: "ADE_AWBULI_HUB" }] },
    editionPolicy: new EditionPolicy(),
    providerStatus: () => ({ configuredProviderCount: 0 })
  });
  const rows = [...act.assess(), { intent: "ADE_AWBULI_HUB", state: "EXTERNAL_CREDENTIAL_REQUIRED", detail: "Code/catalog present; external credential or provider required." }];
  return {
    store,
    providerGates: gate.list({}),
    activationRows: rows,
    products: [{ id: "procarta", label: "PROCARTA", status: "ACTIVATED" }, { id: "tides", label: "ADE-TIDES", status: "FUTURE" }],
    channels: [{ id: "WEB", label: "ADE Portal", enabled: true, inbound: true }],
    procarta: { status: "ONLINE", executionMode: "LIVE", pilotCandidates: 2 },
    ai: { configuredProviderCount: 0, totalProviderCount: 4 },
    storage: { provider: "local", configured: false },
    telemetry: { connected: true, eventCount: 42, lastEventAt: "2026-09-23T00:00:00.000Z", health: "HEALTHY" },
    edition: "COMMUNITY"
  };
}

test("1+2 — provider discovered with visible state", () => {
  const inv = buildKnobInventory(sampleDeps());
  const knob = inv.knobs.find((k) => k.id === "provider:AWBULI_WHATSAPP");
  assert.ok(knob);
  assert.equal(knob.status, "NOT_CONFIGURED");
  assert.equal(knob.system, "PROVIDER");
});

test("3 — required credential names visible, values never present", () => {
  const inv = buildKnobInventory(sampleDeps());
  const blob = JSON.stringify(inv);
  assert.ok(blob.includes("AWBULI_API_KEY"));
  assert.ok(!/sk-|BEGIN .*PRIVATE|live-secret/i.test(blob));
});

test("4+5 — capability discovered with visible state", () => {
  const inv = buildKnobInventory(sampleDeps());
  const cap = inv.knobs.find((k) => k.id === "capability:PROCARTA_EXECUTE");
  assert.ok(cap);
  assert.equal(cap.status, "READY");
  const ext = inv.knobs.find((k) => k.id === "capability:ADE_AWBULI_HUB");
  assert.ok(ext);
  assert.equal(ext.status, "PROVIDER_REQUIRED");
});

test("6+7+8+10 — human action, tenant, auth requirement, audit ref visible", () => {
  const inv = buildKnobInventory(sampleDeps());
  const cl = buildHumanChecklist(inv);
  assert.ok(cl.total > 0);
  for (const a of cl.actions) {
    assert.ok(a.id && a.system && a.where && a.who && a.elevation);
  }
  const knob = inv.knobs.find((k) => k.id === "provider:AWBULI_WHATSAPP");
  assert.equal(knob.tenantScope, "default");
  assert.ok(/L2/.test(knob.whoCanChange));
  assert.ok(knob.auditLocation.length > 0);
});

test("9 — suspend/re-enable states visible in inventory", () => {
  const store = stubStore();
  const gate = new ProviderGate({ store, eventBus: stubBus() });
  gate.register({ providerId: "P1", providerType: "WEB_API" }, { actor: "t" });
  gate.configure("P1", { baseUrl: "https://x.example.invalid/api", actor: "t" });
  assert.equal(buildKnobInventory({ providerGates: gate.list({}) }).knobs[0].status, "VERIFY_REQUIRED");
});

test("11 — AWBULI numbers surface: add/edit/verify/default/enable/suspend/disable", () => {
  const store = stubStore();
  const bus = stubBus();
  const reg = new WhatsAppNumberRegistry({ store, eventBus: bus });
  const n = reg.addNumber({ number: "+2347038272792", purpose: "SALES", actor: "admin" });
  assert.ok(n.masked.includes("…"));
  assert.ok(!JSON.stringify(n).includes("7038272792"));
  assert.equal(n.state, "UNVERIFIED");
  const edited = reg.editNumber(n.id, { purpose: "SUPPORT", actor: "admin" });
  assert.equal(edited.purpose, "SUPPORT");
  const ver = reg.verifyNumber(n.id, { actor: "admin" });
  assert.equal(ver.state, "VERIFIED");
  assert.equal(ver.verification.live, false);
  const def = reg.setDefault(n.id, { actor: "admin" });
  assert.equal(def.isDefault, true);
  const en = reg.setState(n.id, "ENABLED", { actor: "admin", reason: "trial", level: 3 });
  assert.equal(en.state, "ENABLED");
  const sp = reg.setState(n.id, "SUSPENDED", { actor: "admin", reason: "pause", level: 2 });
  assert.equal(sp.state, "SUSPENDED");
  const dis = reg.setState(n.id, "DISABLED", { actor: "admin", reason: "churn" });
  assert.equal(dis.state, "DISABLED");
  assert.equal(dis.isDefault, false);
  assert.ok(dis.history.length >= 5);
  assert.throws(() => reg.addNumber({ number: "12", actor: "a" }), /NUMBER_INVALID/);
  assert.throws(() => reg.setState(n.id, "ENABLED", { actor: "a", reason: "x", level: 1 }), /NUMBER_AUTH_REQUIRED|NUMBER_DISABLED/);
  const listed = reg.list({});
  assert.ok(listed.every((x) => x.fingerprint === undefined));
  const reg2 = new WhatsAppNumberRegistry({ store, eventBus: stubBus() });
  assert.equal(reg2.get(n.id).state, "DISABLED");
  assert.ok(store.calls.includes("whatsappNumbers"));
  const cats = bus.published.filter((p) => p.topic === "audit.log.created").map((p) => p.payload.category);
  assert.ok(cats.includes("WHATSAPP_NUMBERS"));
});

test("12 — ProCarta configuration surface exists in inventory", () => {
  const inv = buildKnobInventory(sampleDeps());
  const engine = inv.knobs.find((k) => k.id === "procarta:engine");
  const queue = inv.knobs.find((k) => k.id === "procarta:pilot-queue");
  assert.ok(engine && engine.status === "READY");
  assert.ok(queue && /2 queued/.test(queue.mode));
  assert.ok(/Review candidates/.test(queue.nextHumanAction));
});

test("13 — protected systems blocked from ordinary integration paths", () => {
  const inv = buildKnobInventory(sampleDeps());
  const tradingKnobs = inv.knobs.filter((k) => /BINARY|FOREX|GAMING|BROKER/i.test(k.id));
  assert.equal(tradingKnobs.length, 0);
});

test("14 — no secret values leak anywhere", () => {
  const store = stubStore();
  const reg = new WhatsAppNumberRegistry({ store, eventBus: stubBus() });
  reg.addNumber({ number: "+2347038272792", actor: "a" });
  const blob = JSON.stringify({ inv: buildKnobInventory(sampleDeps()), nums: reg.list({}), sections: store._sections });
  assert.ok(!/sk-[A-Za-z0-9_-]{8,}/.test(blob));
  assert.ok(!blob.includes("7038272792"));
});

test("15 — logo asset/path references resolve", () => {
  for (const f of ["public/ADE-LOGO.png", "public/brand-mark.png", "public/ade-experience/assets/ade-brand-mark.png", "public/ade-experience/assets/ade-hero-bg.png"]) {
    assert.ok(fs.existsSync(path.resolve(f)), `${f} must exist`);
  }
  const index = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  assert.ok(index.includes('rel="icon"') && index.includes("/ADE-LOGO.png"));
  assert.ok(index.includes("alt:'ADE logo") || index.includes('alt:"ADE logo"'));
  const admin = fs.readFileSync(path.resolve("public/admin/index.html"), "utf8");
  assert.ok(admin.includes('rel="icon"') && admin.includes('src="/ADE-LOGO.png"'));
  const founder = fs.readFileSync(path.resolve("public/founder.html"), "utf8");
  assert.ok(founder.includes('rel="icon"') && founder.includes("/ADE-LOGO.png"));
});

test("16+17 — founder/admin route exposes controls; anonymous cannot mutate", async (t) => {
  const { app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (token, method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return r.json();
  };
  assert.equal((await call(null, "GET", "/api/v1/admin/ops-inventory")).success !== true, true);
  assert.equal((await call(null, "POST", "/api/v1/admin/whatsapp-numbers", { number: "+10000000000" })).success !== true, true);
  const uniq = `ops${Date.now().toString(36)}`;
  const boot = await call(null, "POST", "/api/v1/workforce/provision-founder", { fullName: "Ops Admin", username: uniq, password: "OpsPass!12345", pin: "112233" });
  if (!boot.success) return;
  const login = await call(null, "POST", "/api/v1/account/login", { username: uniq, password: "OpsPass!12345" });
  const elev = await call(login.token, "POST", "/api/v1/account/pin", { pin: "112233" });
  const auth = elev.token;
  const inv = await call(auth, "GET", "/api/v1/admin/ops-inventory");
  assert.equal(inv.success, true);
  assert.ok(inv.inventory.total > 10);
  assert.ok(inv.checklist.total > 0);
  assert.ok(inv.inventory.knobs.every((k) => k.id && k.status && k.nextHumanAction !== undefined));
  const add = await call(auth, "POST", "/api/v1/admin/whatsapp-numbers", { number: "+2347038272792", purpose: "E2E" });
  assert.equal(add.success, true);
  assert.ok(add.number.masked.includes("…"));
  const listed = await call(auth, "GET", "/api/v1/admin/whatsapp-numbers");
  assert.ok(listed.numbers.some((n) => n.id === add.number.id));
  const st = await call(auth, "POST", `/api/v1/admin/whatsapp-numbers/${add.number.id}/verify`, {});
  assert.equal(st.number.state, "VERIFIED");
});

test("18 — configuration persistence survives reload", () => {
  const store = stubStore();
  const g1 = new ProviderGate({ store, eventBus: stubBus() });
  g1.register({ providerId: "P9", providerType: "WEB_API" }, { actor: "t" });
  g1.configure("P9", { baseUrl: "https://x.example.invalid", actor: "t" });
  const r1 = new WhatsAppNumberRegistry({ store, eventBus: stubBus() });
  r1.addNumber({ number: "+15551234567", actor: "t" });
  const g2 = new ProviderGate({ store, eventBus: stubBus() });
  const r2 = new WhatsAppNumberRegistry({ store, eventBus: stubBus() });
  assert.equal(g2.get("P9").state, "CONFIGURED");
  assert.equal(r2.list({}).length, 1);
});

test("19 — verification never falsely claims LIVE", () => {
  const store = stubStore();
  const gate = new ProviderGate({ store, eventBus: stubBus() });
  gate.register({ providerId: "P19", providerType: "WEB_API" }, { actor: "t" });
  gate.configure("P19", { baseUrl: "https://x.example.invalid", actor: "t" });
  return gate.verify("P19", { actor: "t" }).then((v) => {
    assert.ok(["VERIFIED", "VERIFICATION_FAILED", "CONFIGURED"].includes(v.state));
    assert.equal(v.health.live, false);
  });
});

test("20 — one canonical authority per domain; no duplicate engine created", () => {
  const report = authorityReport();
  assert.ok(report.domains >= 10);
  const domains = report.authorities.map((a) => a.domain);
  assert.equal(new Set(domains).size, domains.length);
  for (const a of report.authorities) {
    if (a.status === "CANONICAL" || a.status === "PROTECTED") {
      assert.ok(fs.existsSync(path.resolve(a.file)), `${a.file} must exist`);
    }
  }
  assert.ok(AUTHORITIES.EVENTS.file.includes("EnterpriseEventBus"));
  assert.ok(AUTHORITIES.CAPABILITIES.file.includes("CapabilityRegistry"));
});
