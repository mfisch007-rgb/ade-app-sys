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
