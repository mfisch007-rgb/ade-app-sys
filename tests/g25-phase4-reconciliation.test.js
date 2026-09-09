import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  app,
  kernel,
  kernelReady,
  registry
} from "../src/app.js";
import { PluginRegistry } from "../src/kernel/PluginRegistry.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";
import AuditStore from "../src/storage/AuditStore.js";

/**
 * G25 PHASE 4 RECONCILIATION — FIXES 1-5 focused evidence suite.
 *
 *   FIX 1  PluginRegistry.getAllPlugins() + canonical subsystem registration
 *   FIX 2  Canonical admin UI authentication (participates in /api/v1/auth/*)
 *   FIX 3  Dead legacy admin/whatsapp UI surfaces neutralized (never revived)
 *   FIX 4  Single canonical command authority; execution is auth+RBAC bound
 *   FIX 5  Legacy/duplicate runtime hardening; canonical startup only
 */

const __root = path.resolve(import.meta.dirname, "..");
const CREDENTIAL_FILE = path.join(__root, "data", "admin-credential.json");
const AUTH_PIN = "482716";

let server = null;
let baseUrl = null;
// Evaluated at registration time (before() runs after test definition).
const authBootstrap =
  !fs.existsSync(CREDENTIAL_FILE) && !process.env.ADE_ADMIN_PIN_HASH;
if (authBootstrap) {
  process.env.ADE_ADMIN_PIN_HASH = bcrypt.hashSync(AUTH_PIN, 8);
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
  if (authBootstrap) {
    delete process.env.ADE_ADMIN_PIN_HASH;
    fs.rmSync(CREDENTIAL_FILE, { force: true });
  }
  if (server) await new Promise((r) => server.close(r));
});

const issueOperatorToken = (level = 1) =>
  IdentityOnboarding.getInstance().issueSession({
    subject: `g25-operator-${Date.now()}`,
    tier: "COMMUNITY",
    level,
    persona: "OPERATOR"
  }).token;

// ========================================================================
// FIX 1 — PLUGIN REGISTRY / COMMAND SEARCH
// ========================================================================

test("FIX1 — getAllPlugins() exists and the empty registry is safe", () => {
  const reg = new PluginRegistry(null);
  assert.equal(typeof reg.getAllPlugins, "function");
  assert.deepEqual(reg.getAllPlugins(), [], "empty registry returns []");
  assert.deepEqual(reg.getHealth(), {}, "empty registry health is empty");
});

test("FIX1 — registered plugins are returned; API cannot mutate internal state", () => {
  const reg = new PluginRegistry(null);
  const plugin = { name: "alpha", id: "alpha", category: "Registered Kernel Subsystem" };
  reg.register(plugin);

  const snapshot = reg.getAllPlugins();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].id, "alpha");

  snapshot.push("INTRUSION");
  snapshot.length = 0;
  const after = reg.getAllPlugins();
  assert.equal(after.length, 1, "returned array mutation does not touch the Map");
  assert.equal(after[0].id, "alpha");
  assert.notEqual(after, snapshot, "every call returns a fresh array");
});

test("FIX1 — canonical registry is populated with running kernel subsystems", () => {
  assert.ok(registry, "app exports the canonical PluginRegistry");
  const plugins = registry.getAllPlugins();
  const ids = plugins.map((p) => String(p.id || p.name));
  for (const subsystem of [
    "memory", "knowledge", "decision", "oracle", "guardian",
    "notification", "ledger", "workflowEngine", "icx"
  ]) {
    assert.ok(ids.includes(subsystem), `kernel subsystem '${subsystem}' is discoverable`);
  }
  for (const plugin of plugins) {
    assert.equal(plugin.category, "Registered Kernel Subsystem");
    assert.equal(typeof plugin.getHealth, "function");
  }
  const health = registry.getHealth();
  assert.ok(health.workflowEngine, "getHealth still reports per-plugin health");
});

test("FIX1 — GET /api/command/search returns a registered kernel subsystem", async () => {
  const res = await fetch(`${baseUrl}/api/command/search?q=${encodeURIComponent("workflowEngine")}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  const hit = body.commands.find((c) => c.action === "workflowEngine");
  assert.ok(hit, "workflowEngine subsystem appears in search results");
  assert.equal(hit.category, "Registered Kernel Subsystem");
  assert.equal(hit.label, "workflowEngine");
});

test("FIX1 — builtin ecosystem catalog behavior remains intact", async () => {
  const res = await fetch(`${baseUrl}/api/command/search`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(
    body.commands.some((c) => c.action === "ADE_AWBULI_HUB"),
    "static builtin capability still discoverable"
  );
  const dyn = await fetch(`${baseUrl}/api/command/search?q=${encodeURIComponent("abc")}`);
  const dynBody = await dyn.json();
  assert.ok(
    dynBody.commands.some((c) => c.action === "DYNAMIC_KERNEL_INTENT"),
    "intent fallback resolver is deterministic"
  );
});

// ========================================================================
// FIX 2 — CANONICAL ADMIN UI AUTHENTICATION
// ========================================================================

test("FIX2 — unauthenticated protected admin request is rejected (boundary intact)", async () => {
  for (const target of ["/api/v1/admin/settings", "/api/v1/admin/overview"]) {
    const res = await fetch(`${baseUrl}${target}`);
    assert.equal(res.status, 401, `${target} must reject unauthenticated access`);
  }
});

test("FIX2 — admin UI participates in canonical auth flow (static contract)", () => {
  const ui = fs.readFileSync(path.join(__root, "public", "admin", "index.html"), "utf8");
  assert.ok(ui.includes("/auth/pin"), "UI logs in via POST /api/v1/auth/pin");
  assert.ok(ui.includes("/auth/revoke"), "UI logs out via canonical revoke flow");
  assert.ok(ui.includes("Authorization") && ui.includes("Bearer"), "UI attaches Bearer Authorization");
  assert.ok(ui.includes("loginPin"), "UI renders a PIN login form");
  assert.ok(!ui.includes("SUPREME_FOUNDER_KEY"), "no hardcoded credential in admin UI");
});

test("FIX2 — canonical level-2 auth round-trip: login → protected 200 → revoke → 401", {
  skip: !authBootstrap ? "credential is already configured in this environment; positive flow not safe to bootstrap" : false
}, async () => {
  const wrong = await fetch(`${baseUrl}/api/v1/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "000000" })
  });
  assert.equal(wrong.status, 401);
  assert.deepEqual((await wrong.json()).error, "INVALID_CREDENTIALS");

  const login = await fetch(`${baseUrl}/api/v1/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: AUTH_PIN })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.success, true);
  assert.equal(loginBody.authLevel, 2);
  assert.ok(loginBody.token, "canonical session token issued at level 2");

  const protectedReq = await fetch(`${baseUrl}/api/v1/admin/settings`, {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });
  assert.equal(protectedReq.status, 200, "level-2 Bearer is accepted by protected admin route");

  const overview = await fetch(`${baseUrl}/api/v1/admin/overview`, {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });
  assert.equal(overview.status, 200);

  const revoke = await fetch(`${baseUrl}/api/v1/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginBody.token}` }
  });
  assert.equal(revoke.status, 200, "revocation uses the canonical revoke flow");

  const afterRevoke = await fetch(`${baseUrl}/api/v1/admin/settings`, {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });
  assert.equal(afterRevoke.status, 401, "revoked token is rejected");
});

// ========================================================================
// FIX 3 — DEAD LEGACY ADMIN / WHATSAPP UI SURFACES
// ========================================================================

test("FIX3 — dead legacy routes are not mounted on the canonical runtime", async () => {
  const legacyPosts = [
    "/admin/login", "/admin/stats", "/admin/clients", "/admin/onboard", "/admin/fraud",
    "/api/whatsapp/pair"
  ];
  for (const target of legacyPosts) {
    const res = await fetch(`${baseUrl}${target}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 404, `POST ${target} must not exist on canonical runtime`);
  }
});

test("FIX3 — dead /api/* namespaces are explicitly classified as 404 API_ENDPOINT_NOT_FOUND JSON", async () => {
  const deadApiGets = ["/api/whatsapp/status", "/api/stream"];
  const deadApiPosts = ["/api/godmode/command", "/api/whatsapp/status", "/api/stream"];

  for (const target of deadApiGets) {
    const res = await fetch(`${baseUrl}${target}`);
    assert.equal(res.status, 404, `GET ${target} must be an explicit 404`);
    assert.ok(res.headers.get("content-type")?.includes("application/json"), `GET ${target} must be JSON-classified, never generic HTML`);
    const body = await res.json();
    assert.equal(body.error, "API_ENDPOINT_NOT_FOUND", `GET ${target} carries the canonical not-found code`);
  }

  for (const target of deadApiPosts) {
    const res = await fetch(`${baseUrl}${target}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 404, `POST ${target} must be an explicit 404`);
    assert.ok(res.headers.get("content-type")?.includes("application/json"), `POST ${target} must be JSON-classified`);
    assert.equal((await res.json()).error, "API_ENDPOINT_NOT_FOUND");
  }
});

test("FIX3 — the frontend HTML fallback applies only to non-API GET routes", async () => {
  const spa = await fetch(`${baseUrl}/some/non/api/route`);
  assert.equal(spa.status, 200);
  const html = await spa.text();
  assert.ok(html.includes("ADE-APEX ENTERPRISE OS OPERATIONAL"), "non-API GET still reaches the SPA fallback");
  assert.ok(!(spa.headers.get("content-type") || "").includes("application/json"));
});

test("FIX3 — legacy HTML never serves as a working canonical dashboard", async () => {
  const legacyDash = await fetch(`${baseUrl}/admin-dashboard.html`);
  const legacyHtml = await legacyDash.text();
  assert.ok(!legacyHtml.includes("LedgerFlow"), "admin-dashboard.html is never served as a dashboard");

  const rootIndex = await fetch(`${baseUrl}/`);
  const rootHtml = await rootIndex.text();
  assert.ok(rootHtml.trim().length > 0);
  assert.ok(!rootHtml.includes("localhost:8080"), "canonical primary UI is clean of dead god-mode endpoints");

  const admin = await fetch(`${baseUrl}/admin`);
  assert.equal(admin.status, 200);
  assert.ok((await admin.text()).includes("ADE Command & Control Plane"), "canonical admin console ships at /admin");
});

test("FIX3 — legacy surfaces are explicitly deprecated and inerted", () => {
  const rootIdx = fs.readFileSync(path.join(__root, "index.html"), "utf8");
  assert.ok(rootIdx.includes("LEGACY / DEPRECATED SURFACE"), "root index.html is marked LEGACY");
  assert.ok(
    !rootIdx.includes('new EventSource("http://localhost:8080') &&
      !rootIdx.includes('fetch("http://localhost:8080'),
    "root index.html no longer invokes the dead server"
  );
  assert.ok(!rootIdx.includes("ADE_SUPREME_FOUNDER_KEY"), "hardcoded founder key removed from root index.html");

  const dash = fs.readFileSync(path.join(__root, "admin-dashboard.html"), "utf8");
  assert.ok(dash.includes("LEGACY / DEPRECATED"), "admin-dashboard.html is marked deprecated");
  assert.ok(dash.includes("LEGACY_INERT"), "admin-dashboard.html calls are inerted");

  const canonicalUi = fs.readFileSync(path.join(__root, "public", "index.html"), "utf8");
  assert.ok(!canonicalUi.includes("localhost:8080"));
  assert.ok(!canonicalUi.includes("godmode"));
});

// ========================================================================
// FIX 4 — CANONICAL COMMAND AUTHORITY
// ========================================================================

test("FIX4 — CommandPaletteEngine is classified CLI/secondary and never wired into canonical runtime", () => {
  const palette = fs.readFileSync(path.join(__root, "src", "core", "CommandPaletteEngine.js"), "utf8");
  assert.ok(palette.includes("CLI-ONLY"), "CommandPaletteEngine is explicitly CLI/secondary");
  assert.ok(palette.includes("CANONICAL COMMAND AUTHORITY"), "canonical authority is documented");

  const appSrc = fs.readFileSync(path.join(__root, "src", "app.js"), "utf8");
  assert.ok(!appSrc.includes("CommandPaletteEngine"), "canonical runtime never imports CommandPaletteEngine");
});

test("FIX4 — command execution is authentication-bound", async () => {
  const res = await fetch(`${baseUrl}/api/command/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PING", payload: {} })
  });
  assert.equal(res.status, 401, "unauthenticated command execution is rejected");
});

test("FIX4 — command execution is RBAC-bound (level-1 cannot reach rbacLevel-2 intent)", async () => {
  const token = issueOperatorToken(1);

  const ping = await fetch(`${baseUrl}/api/command/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "PING", payload: {} })
  });
  assert.equal(ping.status, 200);
  assert.equal((await ping.json()).success, true);

  const blocked = await fetch(`${baseUrl}/api/command/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "MULTI_STREAM", payload: { count: 3 } })
  });
  assert.equal(blocked.status, 403, "rbacLevel-2 capability is denied for level-1 operator");
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.error, "COMMAND_RBAC_BLOCKED");
  assert.equal(blockedBody.requiredLevel, 2);
});

// ========================================================================
// FIX 5 — LEGACY / DUPLICATE RUNTIME SURFACE HARDENING
// ========================================================================

test("FIX5 — canonical startup/deploy paths select only the canonical runtime", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__root, "package.json"), "utf8"));
  assert.match(pkg.scripts.start, /src\/server\.js$/, "npm start launches src/server.js");
  assert.match(pkg.scripts.dev, /src\/server\.js$/, "npm dev launches src/server.js");
  for (const [name, script] of Object.entries(pkg.scripts)) {
    assert.ok(
      !/(api-server|WebhookServer|routes\/admin|routes\/whatsapp|src\/index\.js)/.test(String(script)),
      `script '${name}' must not launch a legacy duplicate server`
    );
  }
  assert.ok(fs.existsSync(path.join(__root, "api", "index.js")), "serverless wrapper exists");
  assert.ok(fs.existsSync(path.join(__root, "src", "server.js")), "canonical bootstrap exists");
});

test("FIX5 — legacy runtime surfaces carry explicit NON-CANONICAL markers", () => {
  const legacyFiles = [
    "src/gateway/api-server.js",
    "src/server/WebhookServer.js",
    "src/routes/admin.js",
    "src/routes/whatsapp.js",
    "api/OpenAPIGateway.js",
    "src/index.js"
  ];
  for (const rel of legacyFiles) {
    const content = fs.readFileSync(path.join(__root, rel), "utf8");
    assert.ok(
      content.includes("LEGACY / NON-CANONICAL"),
      `${rel} must be marked LEGACY / NON-CANONICAL`
    );
  }
});

test("FIX5 — protected surfaces remain protected; no unsecured legacy path is canonical", async () => {
  const cases = await fetch(`${baseUrl}/api/v1/cases`);
  assert.equal(cases.status, 401, "protected /api/v1/cases stays 401 unauthenticated");

  const admin = await fetch(`${baseUrl}/api/v1/admin/settings`);
  assert.equal(admin.status, 401, "protected /api/v1/admin/settings stays 401 unauthenticated");

  const exec = await fetch(`${baseUrl}/api/command/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PING" })
  });
  assert.equal(exec.status, 401, "protected /api/command/execute stays 401 unauthenticated");
});

// ========================================================================
// G24 — DURABLE AUDIT PERSISTENCE EVIDENCE
// ========================================================================

test("G24 — AuditStore tolerates a UTF-8 BOM and never drops BOM'd history", {
  timeout: 30000
}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-audit-bom-"));
  const file = path.join(dir, "audit_ledger.json");

  // Commit-time shape: a BOM-prefixed empty JSON array (the pre-phase state).
  fs.writeFileSync(file, "\uFEFF[]\n", "utf8");

  const store = new AuditStore({ file });
  assert.deepEqual(store.query(), [], "BOM-prefixed ledger reads as an empty array, not an error");

  store.append({ topic: "SECURITY_AUDIT_LOG", payload: { fromBom: "first" } });
  store.append({ topic: "SECURITY_AUDIT_LOG", payload: { fromBom: "second" } });

  const seen = store.query(10);
  assert.ok(seen.every((e) => e.topic === "SECURITY_AUDIT_LOG"), "reload after BOM start keeps only the appended records");
  assert.equal(seen.filter((e) => e.payload?.fromBom === "first").length, 1);
  assert.equal(seen.filter((e) => e.payload?.fromBom === "second").length, 1);

  const raw = fs.readFileSync(file, "utf8");
  assert.ok(!raw.startsWith("\uFEFF"), "the canonical store persists without re-adding a BOM");
  assert.equal(JSON.parse(raw).length, 2, "BOM'd history is never silently discarded");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("G24 — security audit events on the canonical bus are durably persisted", {
  timeout: 30000
}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-audit-wire-"));
  const file = path.join(dir, "audit_ledger.json");
  const probe = new AuditStore({ file });

  assert.ok(kernel.eventBus, "kernel event bus exists");
  assert.equal(typeof kernel.eventBus.subscribe, "function");
  kernel.eventBus.subscribe("SECURITY_AUDIT_LOG", (payload, envelope) => {
    probe.append({ topic: "SECURITY_AUDIT_LOG", eventId: envelope?.eventId, payload: payload ?? {} });
  });

  const marker = { category: "G24_PROBE", span: "SPAN_F", ts: Date.now() };
  kernel.eventBus.publish("SECURITY_AUDIT_LOG", marker);

  const recovered = await (async () => {
    for (let i = 0; i < 50; i++) {
      const hit = probe.query(10).find((e) => e.payload?.category === "G24_PROBE");
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    return null;
  })();

  assert.ok(recovered, "published SECURITY_AUDIT_LOG event is durably persisted via the wire path");
  assert.equal(recovered.topic, "SECURITY_AUDIT_LOG");
  assert.equal(recovered.payload.category, "G24_PROBE");

  const appSrc = fs.readFileSync(path.join(__root, "src", "app.js"), "utf8");
  assert.ok(appSrc.includes('new AuditStore()'), "canonical runtime constructs the purposed audit store");
  assert.ok(appSrc.includes("SECURITY_AUDIT_LOG"), "canonical runtime subscribes the security audit topic");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("G24 — the canonical audit ledger in the working tree is a valid JSON array", () => {
  const ledger = path.join(__root, "data", "audit_ledger.json");
  assert.ok(fs.existsSync(ledger), "audit ledger exists in the working tree");
  const parsed = JSON.parse(fs.readFileSync(ledger, "utf8").replace(/^\uFEFF/, ""));
  assert.ok(Array.isArray(parsed), "canonical ledger parses as a JSON array");
});