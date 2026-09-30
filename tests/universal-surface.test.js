import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const readPublic = (f) => fs.readFileSync(path.join(root, "public", f), "utf8");

// Isolate the full-app boot: point CWD at a fresh tmp dir BEFORE importing
// src/app.js, so .ade_storage.json / data/* / capability store start empty
// (founder bootstrap open) and repo runtime files are never dirtied.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-univ-surface-"));
process.chdir(tmpRoot);

let app;
let base;
async function boot() {
  if (base) return base;
  ({ app } = await import("../src/app.js"));
  const srv = app.listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  base = `http://127.0.0.1:${srv.address().port}`;
  return base;
}
const api = (token, method, url, body) =>
  fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const FOUNDER = { fullName: "Graph Founder", username: "graphfounder", password: "GraphPass!1", pin: "112233" };
async function founderTokens() {
  await boot();
  const prov = await api(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  const login = await api(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(login.status, 200, "founder login works");
  const elev = await api(login.body.token, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(elev.status, 200, "founder elevation works");
  // Elevation revokes the pre-elevation base token by design (stale BASE
  // tokens must never authenticate). Mint a fresh BASE token for BASE asserts.
  const base2 = await api(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(base2.status, 200, "fresh base login works");
  return { baseToken: base2.body.token, elevatedToken: elev.body.token };
}

// Phase 1 — graph spine is a public, never-401 discovery index.
test("GRAPH-1 — public ops graph resolves modules, products, groups, counts", async () => {
  await boot();
  const r = await api(null, "GET", "/api/v1/ops/graph");
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.version, 1);
  assert.ok(Array.isArray(r.body.modules) && r.body.modules.length > 5, "modules indexed");
  assert.ok(Array.isArray(r.body.products) && r.body.products.length > 5, "products indexed");
  assert.ok(Array.isArray(r.body.groups) && r.body.groups.length > 0, "groups indexed");
  assert.ok(r.body.counts && typeof r.body.counts.cases === "number", "live counts present");
  const ids = r.body.modules.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate module ids");
  for (const m of r.body.modules) {
    assert.ok(m.id && m.label && m.group && m.route, `module ${m.id} has identity+route`);
    assert.ok(Array.isArray(m.children), `module ${m.id} has children array`);
    for (const c of m.children) assert.ok(c.access && (c.route || c.api || c.module || c.product), `child ${c.id} resolvable`);
  }
});

// Phase 1+14 — same graph, role-aware access: BASE vs ELEVATED founder.
test("GRAPH-2 — founder BASE sees modules; elevation unlocks protected ops", async () => {
  const { baseToken, elevatedToken } = await founderTokens();
  const b = await api(baseToken, "GET", "/api/v1/ops/graph");
  assert.equal(b.status, 200);
  assert.equal(b.body.identity.role, "FOUNDER");
  assert.equal(b.body.identity.elevated, false);
  const wfB = b.body.modules.find((m) => m.id === "workflows");
  assert.ok(wfB, "BASE founder sees Workflows module");
  assert.equal(wfB.children.find((c) => c.id === "wf-process").access, "ELEVATION_REQUIRED");
  const e = await api(elevatedToken, "GET", "/api/v1/ops/graph");
  assert.equal(e.body.identity.elevated, true);
  assert.equal(e.body.modules.find((m) => m.id === "workflows").children.find((c) => c.id === "wf-process").access, "ALLOWED");
  const ag = e.body.modules.find((m) => m.id === "agents");
  assert.ok(ag.children.some((c) => c.id === "ag-icx"), "ICX truth node reachable from AI Workers");
});

// Phase 19 — future-product auto-fit: every surfaced product carries drill children.
test("GRAPH-3 — every product carries drill children (auto-fit contract)", async () => {
  await boot();
  const r = await api(null, "GET", "/api/v1/ops/graph");
  for (const p of r.body.products) {
    assert.ok(Array.isArray(p.children) && p.children.length > 0, `product ${p.id} auto-fitted with drill children`);
    assert.ok(p.children.some((c) => c.route), `product ${p.id} has an open route`);
  }
  const awbuli = r.body.products.find((p) => p.id === "awbuli");
  assert.ok(awbuli, "AWBULI in product graph");
  assert.ok(awbuli.status && awbuli.status !== "LIVE", `AWBULI honestly not LIVE (got ${awbuli.status})`);
});

// Phase 20 — no duplicate authorities introduced by the graph layer.
test("GRAPH-4 — graph layer creates no competing registry/bus/gate", () => {
  const src = fs.readFileSync(path.join(root, "src/operations/OperationalGraph.js"), "utf8");
  assert.ok(!/new CapabilityRegistry|new EnterpriseEventBus|new SecurityGate|new DecisionEngine|new EventBus/.test(src), "adapter only, no new authorities");
  assert.ok(/registerModule/.test(src), "future-product registration entry exists");
});

// Phase 12 — ICX truth: gated, implemented, kernel-internal, no HTTP execution.
test("ICX-1 — ICX status is L2-gated and truthful", async () => {
  await boot();
  const anon = await api(null, "GET", "/api/v1/icx/status");
  assert.equal(anon.status, 401, "anonymous ICX inspection rejected");
  const { elevatedToken } = await founderTokens();
  const r = await api(elevatedToken, "GET", "/api/v1/icx/status");
  assert.equal(r.status, 200);
  assert.equal(r.body.icx.implemented, true);
  assert.equal(r.body.icx.httpExecutionSurface, false, "no fabricated ICX execution surface");
  assert.ok(r.body.icx.channels.length > 0 && r.body.icx.roles.length > 0, "channels + roles disclosed");
  assert.ok(/AgentRegistry/.test(r.body.icx.canonicalSurface), "canonical surface named");
});

// Golden Path B — AWBULI simulated inbound via canonical public path creates a case.
test("AWBULI-1 — simulated AWBULI/WhatsApp inbound creates a canonical case", async () => {
  await boot();
  const r = await api(null, "POST", "/api/v1/intake/WHATSAPP", {
    kind: "INTEREST", organization: "AWBULI-E2E", description: "WhatsApp inquiry about supply restock and delivery delays."
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.case?.id, "simulated inbound yields a real case id");
});

// Golden Path D — invitation accept rejects bad codes without crashing; hub is public.
test("INVITE-1 — invitation accept validates codes; onboarding hub is public", async () => {
  await boot();
  const bad = await api(null, "POST", "/api/v1/account/accept-invitation", { code: "NOT-A-CODE", fullName: "X", username: "x1", password: "Password!1", pin: "123456" });
  assert.ok([400, 404].includes(bad.status), `invalid code rejected (got ${bad.status})`);
  const index = readPublic("index.html");
  assert.ok(index.includes("data-testid':'invitation-hub") || index.includes('data-testid":"invitation-hub') || index.includes("invitation-hub"), "invitation hub present");
  assert.ok(index.includes("I HAVE AN INVITATION"), "invite pathway visible");
});

// Phases 2-7 — universal surface static contracts in the workspace shell.
test("SURFACE-1 — grouped IA keeps every module reachable with stable testids", () => {
  const index = readPublic("index.html");
  assert.ok(index.includes("WS_GROUPS"), "grouped IA declared");
  for (const g of ["COMMAND", "BUSINESS", "PEOPLE", "INTELLIGENCE", "PLATFORM"]) assert.ok(index.includes(g), `group ${g} rendered`);
  assert.ok(index.includes("ws-module-"), "module testids preserved");
  assert.ok(index.includes("ws-identity-line"), "dense identity line present");
  assert.ok(index.includes("data-testid':'ops-explorer") || index.includes("ops-explorer"), "graph explorer surface present");
  assert.ok(index.includes("Explore ▸"), "explorer entry action present");
  assert.ok(index.includes("data-testid':'icx-truth") || index.includes("icx-truth"), "ICX truth card present");
  assert.ok(index.includes("data-testid':'procarta-case-drill") || index.includes("procarta-case-drill"), "PROCARTA case drill present");
  for (const k of ["opact-invite", "opact-cases", "opact-whatsapp", "opact-audit", "opact-assess"]) assert.ok(index.includes(k), `palette action ${k} discoverable`);
});

// Phase 5 — Founder Console is subordinate, route preserved.
test("SURFACE-2 — /founder is Advanced Founder Controls, workspace link matches", () => {
  const founder = readPublic("founder.html");
  assert.ok(founder.includes("ADVANCED FOUNDER CONTROLS"), "console retitled as subordinate");
  assert.ok(!founder.includes("FOUNDER COMMAND CENTER"), "no competing command-center title remains");
  assert.ok(founder.includes("Advanced Founder Controls ·"), "breadcrumb names the subordinate surface");
  const index = readPublic("index.html");
  assert.ok(index.includes("Advanced Founder Controls") && index.includes("ws-founder-console"), "workspace links the subordinate surface");
  assert.ok(index.includes("href:'/founder'") || index.includes('href:"/founder"') || index.includes("href:'/founder'"), "compat route preserved");
});
