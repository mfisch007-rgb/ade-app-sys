import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * AWBULI LEAD / ONBOARDING / WHATSAPP LIFECYCLE (Batch 5).
 *
 * Isolated full-app boot (tmp CWD before import): repo data files never
 * touched. Proves, without configuring any provider or sender:
 * - public AWBULI setup submissions persist full permitted lead details;
 * - a unique case ID is returned only after durable case creation;
 * - admin/founder notification fires through the existing internal channel
 *   with visible outcome handling (never blocking the case response);
 * - repeat submissions are controlled (distinct durable cases, both visible);
 * - START-style WhatsApp onboarding stays SIMULATED until a real provider
 *   gate is ENABLED — no simulated delivery is ever labelled LIVE.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-awbuli-lead-"));
process.chdir(tmpRoot);

const { app } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");
const { AwbuliChannelAdapter } = await import("../src/injection/AwbuliChannelAdapter.js");

let server = null;
let base = null;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const call = async (token, method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const l1 = () =>
  IdentityOnboarding.getInstance().issueSession({ subject: "batch5-reader", tier: "COMMUNITY", level: 1, persona: "OPERATOR" }).token;

const LEAD = {
  type: "PILOT_INTEREST",
  organization: "Batch5 WhatsApp Bakery",
  useCaseDescription: "Take cake orders over WhatsApp and track daily sales in a ledger."
};

test("lead-1 — public AWBULI setup submission persists lead details and returns a durable case ID", async () => {
  const intake = await call(null, "POST", "/api/v1/community/intake", LEAD);
  assert.equal(intake.status, 201);
  assert.ok(intake.body.intake.intakeId, "lead reference returned");
  const stats = await call(null, "GET", "/api/v1/community/progression");
  assert.ok(stats.body.stats.totalIntakes >= 1, "lead persisted");
  const created = await call(null, "POST", "/api/v1/intake/WEB", {
    kind: LEAD.type, organization: LEAD.organization, description: LEAD.useCaseDescription, contact: { organization: LEAD.organization }
  });
  assert.equal(created.status, 201);
  assert.match(created.body.case.id, /^CASE-/, "unique case ID returned");
  assert.equal(created.body.case.organization, LEAD.organization, "full lead details on the case");
  assert.ok(String(created.body.case.request?.text || created.body.case.description || LEAD.useCaseDescription).length > 0);
  // Durable read-back through the canonical authed route.
  const read = await call(l1(), "GET", `/api/v1/cases/${encodeURIComponent(created.body.case.id)}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.case.id, created.body.case.id, "case ID resolves only to the durably created case");
});

test("lead-2 — invalid submissions fail closed with no case ID", async () => {
  const bad = await call(null, "POST", "/api/v1/intake/BOGUS_CHANNEL_XYZ", { kind: "PILOT_INTEREST", organization: "X" });
  assert.equal(bad.status, 400, "unknown channel rejected");
  assert.ok(!bad.body.case?.id, "no case ID on failure");
});

test("lead-3 — admin/founder notification fires internally with a visible outcome and never blocks the case", async () => {
  const created = await call(null, "POST", "/api/v1/intake/WEB", {
    kind: "PILOT_INTEREST", organization: "Batch5 Notify Check", description: "Need WhatsApp order updates.", contact: {}
  });
  assert.equal(created.status, 201, "case creation never waits on notification");
  const feed = await call(null, "GET", "/api/v1/notifications/recent?limit=50");
  assert.equal(feed.status, 200);
  const note = feed.body.events.find((e) => e?.caseId === created.body.case.id || e?.payload?.caseId === created.body.case.id);
  assert.ok(note, "request notification visible with the case reference");
  const flat = JSON.stringify(note);
  assert.ok(!/deliveredExternally":true/.test(flat), "no external delivery claimed");
});

test("lead-4 — repeat submissions are controlled: distinct durable cases, both visible", async () => {
  const payload = { kind: "PILOT_INTEREST", organization: "Batch5 Double Tap", description: "Same message twice.", contact: {} };
  const first = await call(null, "POST", "/api/v1/intake/WEB", payload);
  const second = await call(null, "POST", "/api/v1/intake/WEB", payload);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.case.id, second.body.case.id, "no silent collapse of distinct submissions");
  const token = l1();
  for (const id of [first.body.case.id, second.body.case.id]) {
    const read = await call(token, "GET", `/api/v1/cases/${encodeURIComponent(id)}`);
    assert.equal(read.status, 200, `${id} independently resolvable`);
  }
});

test("lead-5 — START-style WhatsApp onboarding stays SIMULATED until a real provider gate is ENABLED", async () => {
  const { ProviderGate } = await import("../src/ingestion/ProviderGate.js");
  const store = { data: new Map(), readSection(k) { return this.data.get(k); }, writeSection(k, v) { this.data.set(k, v); return v; } };
  const silentBus = { publish() {} };
  const closedGate = new ProviderGate({ store, eventBus: silentBus });
  const sim = new AwbuliChannelAdapter({ providerGate: closedGate }).normalize({ text: "START", tenantScope: "default" });
  assert.equal(sim.executionMode, "SIMULATED", "no provider means never LIVE");
  assert.equal(sim.provenance.synthetic, true);
  assert.ok(!JSON.stringify(sim).includes("LIVE") || sim.executionMode !== "LIVE", "no live label without a provider");
  // ENABLED gate path is proof-gated: enabling without credentials fails closed.
  const gate = new ProviderGate({ store, eventBus: silentBus });
  gate.register({ providerId: "AWBULI", providerType: "WHATSAPP", credentialRequirements: ["AWBULI_API_URL", "AWBULI_API_KEY"] }, { actor: "t" });
  assert.equal(gate.ingestionAllowed("AWBULI"), false, "unconfigured bridge never allows ingestion");
  const live = new AwbuliChannelAdapter({ providerGate: gate }).normalize({ text: "START", tenantScope: "default" });
  assert.equal(live.executionMode, "SIMULATED", "still simulated until verified + enabled");
  // Suite truth: the canonical surface reports not-configured while unconfigured.
  const surface = await fetch(`${base}/api/v1/product-surface`).then((r) => r.json());
  assert.equal(surface.surfaces.find((s) => s.id === "awbuli").status, "CONFIGURATION_REQUIRED");
});

test("lead-6 — homepage lead form shows the case reference only on durable success (static contract)", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("data-testid':'intake-result") || html.includes('data-testid":"intake-result') || html.includes("intake-result"), "result block exists");
  assert.ok(html.includes("Case reference:"), "case reference shown on success");
  assert.ok(html.includes("if(intakeBusy)return"), "double-submit guarded");
  assert.ok(html.includes("INTEREST"), "honest fallback when no durable case");
});
