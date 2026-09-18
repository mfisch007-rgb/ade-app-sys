import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const { ProductSurfaceMatrix } = await import(
  pathToFileURL(path.resolve("src/products/ProductSurfaceMatrix.js")).href
);
const { ProductRegistry } = await import(
  pathToFileURL(path.resolve("src/products/ProductRegistry.js")).href
);
const { CapabilityActivation } = await import(
  pathToFileURL(path.resolve("src/capabilities/CapabilityActivation.js")).href
);
const { EditionPolicy } = await import(
  pathToFileURL(path.resolve("src/core/EditionPolicy.js")).href
);

function buildMatrix() {
  const editionPolicy = new EditionPolicy("COMMUNITY");
  const capabilityRegistry = {
    _caps: [
      { intent: "PING" },
      { intent: "PUBLIC_INFO" },
      { intent: "SYSTEM_HEALTH" },
      { intent: "UNIVERSAL_AI_GATEWAY" },
      { intent: "PROCARTA_EXECUTE" }
    ],
    listCapabilities() { return this._caps; }
  };
  const capabilityActivation = new CapabilityActivation({
    capabilityRegistry,
    editionPolicy,
    providerStatus: () => ({ configuredProviderCount: 0 })
  });
  const connectionFabric = {
    inventory() {
      return [
        { id: "procarta", product: "PROCARTA", grip: 100, state: "CONNECTED" },
        { id: "awbuli", product: "AWBULI", grip: 67, state: "PARTIALLY_CONNECTED", requiredAction: "Configure the external bridge credential." },
        { id: "nexus", product: "NEXUS", grip: 0, state: "DISCOVERED" },
        { id: "eventos", product: "EVENTOS", grip: 0, state: "DISCOVERED" }
      ];
    }
  };
  const matrix = new ProductSurfaceMatrix({
    productRegistry: new ProductRegistry(),
    capabilityActivation,
    connectionFabric,
    editionPolicy,
    capabilityRegistry,
    storageProvider: { constructor: { name: "LocalStorageAdapter" }, isConfigured: () => true },
    builtinCatalog: [
      { action: "ADE_AWBULI_HUB", label: "AWBULI hub", pluginRequired: true },
      { action: "PROCARTA_WORKFLOW", label: "Procarta", pluginRequired: false }
    ]
  });
  return matrix.build();
}

// Collect every registered API route from the existing authorities.
function registeredRoutes() {
  const files = ["src/app.js", "src/routes/identityRoutes.js"];
  const found = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.resolve(f), "utf8");
    const re = /(app\.(get|post|patch|delete|use)|router\.(get|post|patch|delete|use))\s*\(\s*["'`]([^"'`]+)["'`]/g;
    let m;
    while ((m = re.exec(src))) found.add(m[4]);
  }
  return [...found];
}

function routeMatches(registered, declared) {
  const pathOnly = String(declared).replace(/^[A-Z]+\s+/, "").trim();
  if (registered.includes(pathOnly)) return true;
  return registered.some((r) => {
    const rx = new RegExp("^" + r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:([^/]+)/g, "[^/]+") + "$");
    return rx.test(pathOnly);
  });
}

test("product-surface: every surface proves the full chain (no catalogue without route, no nav without action)", () => {
  const surfaces = buildMatrix();
  assert.ok(surfaces.length >= 20, `expected >=20 surfaces, got ${surfaces.length}`);
  for (const s of surfaces) {
    for (const k of ["id", "label", "icon", "declaration", "catalogue", "activation", "entitlement", "role", "frontendRoute", "navSection", "iconButton", "click", "api", "status", "result", "errorRecovery"]) {
      assert.ok(s[k] !== undefined && s[k] !== null, `${s.id}: missing chain field ${k}`);
    }
    assert.ok(s.cataloguePresent === true, `${s.id}: catalogue entry without catalogue`);
    assert.ok(s.iconButton && s.iconButton.label && s.iconButton.action, `${s.id}: visible surface without button action`);
    assert.ok(Array.isArray(s.api) && s.api.length > 0, `${s.id}: clickable surface without backend API`);
    assert.ok(s.click.backendActionExists === true, `${s.id}: click without backend action`);
    assert.ok(s.result.loadingState && s.result.successState && s.result.failureState, `${s.id}: missing result states`);
  }
});

test("product-surface: every declared API route exists in app.js or identityRoutes.js (no dead routes)", () => {
  const registered = registeredRoutes();
  assert.ok(registered.length > 50, "route inventory unexpectedly small");
  for (const s of buildMatrix()) {
    for (const a of s.api) {
      assert.ok(routeMatches(registered, a.route), `${s.id}: dead route ${a.route}`);
    }
  }
});

test("product-surface: no fake activation (enabled-looking status never hides a credential blocker)", () => {
  for (const s of buildMatrix()) {
    if (s.status === "AVAILABLE" || s.status === "ACTIVATED") {
      assert.notEqual(s.activation.state, "EXTERNAL_CREDENTIAL_REQUIRED", `${s.id}: AVAILABLE hides credential blocker`);
      assert.notEqual(s.activation.state, "PARTNER_REQUIRED", `${s.id}: AVAILABLE hides partner blocker`);
      assert.notEqual(s.activation.state, "OFFLINE", `${s.id}: AVAILABLE hides offline`);
    }
    if (s.status === "CONFIGURATION_REQUIRED" || s.status === "PARTNER_REQUIRED") {
      assert.ok(s.errorRecovery && s.errorRecovery.length > 10, `${s.id}: blocked state without actionable recovery`);
    }
  }
});

test("product-surface: matrix exposes no secrets", () => {
  const json = JSON.stringify(buildMatrix());
  assert.ok(!/SUPABASE_(SECRET|SERVICE_ROLE|STORAGE)_KEY\s*[:=]/.test(json), "secret key material in matrix");
  assert.ok(!/Bearer eyJ/.test(json), "bearer token in matrix");
  assert.ok(!/sk-[A-Za-z0-9]{8}/.test(json), "provider secret in matrix");
});

test("product-surface: homepage renders the matrix, invitation and recovery surfaces", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  for (const marker of [
    "product-surface-matrix",
    "/api/v1/product-surface",
    "accept-invitation-form",
    "/api/v1/account/accept-invitation",
    "forgot-password-form",
    "/api/v1/account/forgot-password",
    "SUPABASE_STORAGE_WRITE_FAILED",
    "Contact ADE"
  ]) {
    assert.ok(html.includes(marker), `homepage missing: ${marker}`);
  }
  // Every HOME suite card keeps a real button (TIDES included).
  const tidesIdx = html.indexOf("ADE-TIDES");
  assert.ok(tidesIdx > 0, "TIDES card missing");
  const tidesSlice = html.slice(tidesIdx, tidesIdx + 1200);
  assert.ok(tidesSlice.includes("<button") || tidesSlice.includes("'button'") || tidesSlice.includes('"button"') || tidesSlice.includes("btn sm"), "TIDES card without a real button");
});

// --- Auth/workforce lignage (uses the existing route authority) ---

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-surface-test-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  return file;
}

async function bootRoutes(t) {
  const { default: expressMod } = await import("express");
  const storeFile = tempStore(t);
  const storeFile2 = tempStore(t);
  const { LocalStorageAdapter } = await import(
    pathToFileURL(path.resolve("src/storage/LocalStorageAdapter.js")).href
  );
  const { WorkforceManager } = await import(
    pathToFileURL(path.resolve("src/identity/WorkforceManager.js")).href
  );
  const { AnnouncementsManager } = await import(
    pathToFileURL(path.resolve("src/identity/AnnouncementsManager.js")).href
  );
  const { IdentityOnboarding } = await import(
    pathToFileURL(path.resolve("src/kernel/IdentityOnboarding.js")).href
  );
  const { registerIdentityRoutes } = await import(
    pathToFileURL(path.resolve("src/routes/identityRoutes.js")).href
  );
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));
  const workforce = new WorkforceManager({ store: new LocalStorageAdapter(storeFile) });
  const announcements = new AnnouncementsManager({ store: new LocalStorageAdapter(storeFile2) });
  const identity = new IdentityOnboarding({ credentialStore: { getCredentialVersion: () => 1, ensureInitialized: async () => {}, verifyPin: async () => false }, eventBus: { publish() {} } });
  registerIdentityRoutes({ app, identity, workforce, announcements, auditStore: { query: () => [] }, runtimeMode: "COMMUNITY" });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (token, method, url, body) =>
    fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
  const session = (opts) => identity.issueSession(opts).token;
  return { request, session };
}

test("product-surface: second founder provision is a truthful 409, never a hang", { timeout: 90000 }, async (t) => {
  const { request, session } = await bootRoutes(t);
  const first = await request(null, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Ade Founder", username: "founder", password: "FounderPass!1", pin: "123456"
  });
  assert.equal(first.status, 201);
  // Unauthenticated repeat must not hang: 401 from the admin guard.
  const anon = await request(null, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Eve", username: "eve", password: "EvePass!123", pin: "111111"
  });
  assert.equal(anon.status, 401);
  // Authenticated admin repeat must be a truthful conflict, not a hang.
  const login = await (await request(null, "POST", "/api/v1/account/login", { username: "founder", password: "FounderPass!1" })).json();
  const elev = await (await request(login.token, "POST", "/api/v1/account/pin", { pin: "123456" })).json();
  const second = await request(elev.token, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Eve", username: "eve", password: "EvePass!123", pin: "111111"
  });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "FOUNDER_ALREADY_PROVISIONED");
  void session;
});

test("product-surface: elevated non-admin role cannot invite, suspend or revoke (RBAC enforced)", { timeout: 90000 }, async (t) => {
  const { request, session } = await bootRoutes(t);
  await request(null, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Ade Founder", username: "founder", password: "FounderPass!1", pin: "123456"
  });
  const login = await (await request(null, "POST", "/api/v1/account/login", { username: "founder", password: "FounderPass!1" })).json();
  const elev = await (await request(login.token, "POST", "/api/v1/account/pin", { pin: "123456" })).json();
  const invite = await (await request(elev.token, "POST", "/api/v1/workforce/invite", { fullName: "Ade Analyst", role: "ANALYST", expiresInDays: 7 })).json();
  const accepted = await (await request(null, "POST", "/api/v1/account/accept-invitation", {
    code: invite.inviteCode, fullName: "Ade Analyst", username: "analyst", password: "AnalystPass!2", pin: "654321"
  })).json();
  const analystElevated = session({
    subject: "analyst", persona: "WORKFORCE", level: 1, edition: "COMMUNITY",
    metadata: { role: "ANALYST", personId: accepted.person.id, pinVerified: true }
  });
  const blockedInvite = await request(analystElevated, "POST", "/api/v1/workforce/invite", { fullName: "Nope", role: "OPERATOR" });
  assert.equal(blockedInvite.status, 403);
  const blockedSuspend = await request(analystElevated, "POST", `/api/v1/workforce/${accepted.person.id}/suspend`, {});
  assert.equal(blockedSuspend.status, 403);
  const blockedRevoke = await request(analystElevated, "POST", `/api/v1/workforce/${accepted.person.id}/revoke`, {});
  assert.equal(blockedRevoke.status, 403);
});

test("workspace: role workspaces expose every required module with a destination (no blank workspace)", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  const required = {
    founder: ["overview", "products", "access", "workforce", "invitations", "agents", "operations", "workflows", "knowledge", "decisions", "audit", "notifications", "settings", "account"],
    admin: ["overview", "products", "workforce", "invitations", "agents", "announcements", "operations", "workflows", "audit", "notifications", "account"],
    worker: ["overview", "products", "work", "announcements", "notifications", "account"],
    pilot: ["poverview", "request", "diagnostic", "evidence", "products", "implementation", "contact", "account"],
    partner: ["paroverview", "partnership", "integrations", "products", "implementation", "contact", "account"]
  };
  for (const [role, modules] of Object.entries(required)) {
    for (const m of modules) {
      assert.ok(html.includes(`id:'${m}'`), `${role}: workspace module '${m}' missing from WS_MODULES`);
    }
  }
  for (const marker of ["ws-module-", "ws-panel", "wsGrid", "ROLE WORKSPACE"]) {
    assert.ok(html.includes(marker), `workspace shell missing: ${marker}`);
  }
  // Workspace is a routed section, not a dead anchor.
  assert.ok(html.includes("Sec('Workspace',WS())"), "Workspace section not mounted");
  assert.ok(html.includes("'Workspace'"), "Workspace missing from navigation sections");
});

test("workspace: every module action maps to an existing API or real navigation (no dead controls)", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  const apiCalls = [
    "/api/v1/workforce'", "/api/v1/workforce/invite", "/api/v1/workforce/agents",
    "/api/v1/audit", "/api/v1/announcements", "/api/v1/capabilities/activation",
    "/api/v1/admin/trading/entitlements", "/api/v1/cases", "/api/v1/notifications/recent",
    "/api/v1/community/progression", "/api/v1/partners", "/api/v1/connectivity/inventory"
  ];
  for (const a of apiCalls) assert.ok(html.includes(a), `workspace never calls ${a}`);
  // Loading / error states are rendered inline, never silent.
  for (const s of ["Loading…", "fieldErr", "formOk", "emptyState", "Retry"]) {
    assert.ok(html.includes(s), `workspace missing UI state: ${s}`);
  }
  // No module silently does nothing: the grid renders one button per module definition.
  const wsStart = html.indexOf("const WS_MODULES={");
  const wsEnd = html.indexOf("const wsModules=WS_MODULES");
  assert.ok(wsStart > 0 && wsEnd > wsStart, "WS_MODULES block missing");
  const modIds = (html.slice(wsStart, wsEnd).match(/\{id:'[a-z]+'/g) || []).length;
  assert.ok(modIds >= 40, `expected >=40 module definitions across roles, found ${modIds}`);
  assert.ok(html.includes("onClick:()=>{if(m.id==='account')"), "module buttons must wire click actions");
});

test("workspace: mobile navigation exposes all permitted destinations with touch targets", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  assert.ok(html.includes("mobileMenu"), "mobile menu missing");
  assert.ok(html.includes("visibleNav.map"), "mobile menu not driven by permitted nav");
  assert.ok(html.includes("min-height:44px") || html.includes("min-height:48px"), "touch targets missing");
  assert.ok(html.includes("overflow-x:clip") || html.includes("overflow-x:hidden"), "page overflow guard missing");
  assert.ok(html.includes("max-height:min(72vh,640px)"), "mobile menu scroll bound missing");
  assert.ok(html.includes("tableScroll"), "table scroll container missing (page would overflow on small screens)");
  assert.ok(!html.includes("min-height:40px"), "sub-44px touch target regression");
});

test("workspace: privileged actions are gated in UI and truthfully labelled (no fake AVAILABLE)", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  assert.ok(html.includes("canWorkforceAdmin"), "workforce admin gate missing in workspace");
  assert.ok(html.includes("requires a Founder, Admin or elevated Operator session"), "honest elevation notice missing");
  assert.ok(html.includes("Password/PIN resets live in the Admin Console") || html.includes("Admin Console"), "reset path must point at the real console, not a fake control");
  // Management controls that need secrets (password/PIN reset prompts) stay in /admin; workspace exposes only real endpoints.
  assert.ok(!html.includes("/reset-password',{"), "workspace must not half-wire password resets");
});

test("connective: duplicate homepage section removed, palette/media/cases/storage surfaces wired", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  assert.equal((html.match(/h\('p',null,'Register your interest to progress to Pilot or Enterprise\.'\)/g) || []).length, 0, "duplicate HOME register block still present");
  for (const marker of [
    "palSearch", "/api/command/search", "SERVER CATALOG", "palRunServer",
    "media-request-form", "/api/v1/media/request", "REQUEST LOGGED",
    "Include demos", "includeDemo", "DEMO · synthetic", "demoExcluded",
    "/api/v1/admin/storage/verify", "STORAGE VERIFY", "READ-ONLY PROBE",
    "ws-module-", "ws-panel", "tableScroll"
  ]) {
    assert.ok(html.includes(marker), `connective surface missing: ${marker}`);
  }
});

test("connective: PIN elevation revokes the base token (single live session)", { timeout: 90000 }, async (t) => {
  const { request } = await bootRoutes(t);
  await request(null, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Session Founder", username: "sessfounder", password: "SessPass!1", pin: "121212"
  });
  const login = await (await request(null, "POST", "/api/v1/account/login", { username: "sessfounder", password: "SessPass!1" })).json();
  const base = login.token;
  assert.ok((await request(base, "GET", "/api/v1/account/session")).status === 200);
  const elev = await (await request(base, "POST", "/api/v1/account/pin", { pin: "121212" })).json();
  assert.equal(elev.elevated, true);
  const stale = await request(base, "GET", "/api/v1/account/session");
  assert.equal(stale.status, 401, "base token must be revoked after elevation");
  assert.equal((await request(elev.token, "GET", "/api/v1/account/session")).status, 200);
});

test("connective: demo cases excluded from human views, available on opt-in", { timeout: 120000 }, async (t) => {
  const { app, kernelReady } = await import(pathToFileURL(path.resolve("src/app.js")).href);
  await kernelReady;
  const { default: IdentityOnboarding } = await import(pathToFileURL(path.resolve("src/kernel/IdentityOnboarding.js")).href);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = IdentityOnboarding.getInstance().issueSession({ subject: "ct-op", tier: "COMMUNITY", level: 2, persona: "OPERATOR" }).token;
  const H = tok ? { Authorization: `Bearer ${tok}` } : {};
  const scenarios = await (await fetch(`${base}/api/v1/demo/scenarios`)).json();
  assert.ok((scenarios.scenarios || []).length > 0, "no demo scenarios");
  const run = await (await fetch(`${base}/api/v1/demo/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioId: scenarios.scenarios[0].id, input: { prompt: "connective test", type: "DEMO" } }) })).json();
  assert.equal(run.success, true);
  const def = await (await fetch(`${base}/api/v1/cases`, { headers: H })).json();
  assert.equal(def.success, true);
  assert.ok(!(def.cases || []).some((c) => c.source === "DEMO_ORCHESTRATOR"), "demo case leaked into default view");
  assert.ok(Number(def.demoExcluded || 0) >= 1, "demoExcluded not reported");
  const opt = await (await fetch(`${base}/api/v1/cases?includeDemo=true`, { headers: H })).json();
  assert.ok((opt.cases || []).some((c) => c.source === "DEMO_ORCHESTRATOR"), "opt-in view missing demo case");
  if (run.demo && run.demo.caseId) {
    const deep = await (await fetch(`${base}/api/v1/cases/${run.demo.caseId}`, { headers: H })).json();
    assert.equal(deep.success, true, "demo result caseId must stay directly addressable");
  }
});

test("connective: storage verify is read-only and truthful; backend search serves the palette", { timeout: 120000 }, async (t) => {
  const { app, kernelReady } = await import(pathToFileURL(path.resolve("src/app.js")).href);
  await kernelReady;
  const { default: IdentityOnboarding } = await import(pathToFileURL(path.resolve("src/kernel/IdentityOnboarding.js")).href);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = IdentityOnboarding.getInstance().issueSession({ subject: "ct-op2", tier: "COMMUNITY", level: 2, persona: "OPERATOR" }).token;
  const probe = await (await fetch(`${base}/api/v1/admin/storage/verify`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  assert.equal(probe.success, true);
  assert.ok(["OK", "FAILED"].includes(probe.probe) || probe.probe === "NOT_RUN", "unexpected probe state");
  assert.ok(String(probe.hint || "").toLowerCase().includes("no data was written"), "probe must disclose no-write");
  const search = await (await fetch(`${base}/api/command/search?q=procarta`)).json();
  assert.equal(search.success, true);
  assert.ok(Array.isArray(search.commands) && search.commands.length > 0, "backend search empty");
  assert.ok(search.commands.every((c) => c.action && c.label), "search hit missing action/label");
});
