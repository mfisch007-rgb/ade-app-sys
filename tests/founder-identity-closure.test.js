import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// FOUNDER REALITY CLOSURE — regression tests for user-observed production defects:
// Founder PIN vs ADMIN PIN separation, workforce resolution across reload,
// truthful loading vs genuine not-provisioned, and role-correct surfaces.

const { LocalStorageAdapter } = await import(
  pathToFileURL(path.resolve("src/storage/LocalStorageAdapter.js")).href
);
const { WorkforceManager } = await import(
  pathToFileURL(path.resolve("src/identity/WorkforceManager.js")).href
);
const { IdentityOnboarding } = await import(
  pathToFileURL(path.resolve("src/kernel/IdentityOnboarding.js")).href
);
const { registerIdentityRoutes } = await import(
  pathToFileURL(path.resolve("src/routes/identityRoutes.js")).href
);

const FOUNDER = { fullName: "Ade Founder", username: "founder", password: "FounderPass!1", pin: "123456" };
const ADMIN_PIN = "654321";

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-founder-closure-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return new LocalStorageAdapter(file);
}

async function boot(t) {
  const { default: expressMod } = await import("express");
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));
  const workforce = new WorkforceManager({ store: tempStore(t) });
  // Credential store stub: only the generic ADMIN_PIN verifies here.
  const credentialStore = {
    getCredentialVersion: () => 1,
    ensureInitialized: async () => {},
    verifyPin: async (pin) => pin === ADMIN_PIN
  };
  const identity = new IdentityOnboarding({ credentialStore, eventBus: { publish() {} } });
  registerIdentityRoutes({ app, identity, workforce, announcements: { list: async () => [] }, auditStore: { query: () => [] }, runtimeMode: "COMMUNITY" });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (token, method, url, body) =>
    fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  return { request, identity, workforce };
}

async function provisionAndLogin(request) {
  const prov = await request(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  assert.equal(prov.status, 201);
  const login = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  return login.body.token;
}

test("FOUNDER-CLOSURE-1 — login resolves to the FOUNDER workforce record and survives reload-equivalent restore", async (t) => {
  const { request } = await boot(t);
  const base = await provisionAndLogin(request);
  // Fresh "reload": same token, new request → authoritative person + role.
  const s1 = await request(base, "GET", "/api/v1/account/session");
  assert.equal(s1.status, 200);
  assert.equal(s1.body.person.username, FOUNDER.username);
  assert.equal(s1.body.person.role, "FOUNDER");
  assert.equal(s1.body.person.level, 3);
  assert.equal(s1.body.claims.pinVerified, false);
  const s2 = await request(base, "GET", "/api/v1/account/session");
  assert.equal(s2.body.person.id, s1.body.person.id);
  assert.ok(!("passwordHash" in s1.body.person) && !("pinHash" in s1.body.person));
});

test("FOUNDER-CLOSURE-2 — wrong Founder PIN rejected; correct per-user PIN elevates with pinVerified", async (t) => {
  const { request } = await boot(t);
  const base = await provisionAndLogin(request);
  const bad = await request(base, "POST", "/api/v1/account/pin", { pin: "000000" });
  assert.equal(bad.status, 403);
  assert.equal(bad.body.error, "INVALID_PIN");
  const good = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(good.status, 200);
  assert.equal(good.body.elevated, true);
  const s = await request(good.body.token, "GET", "/api/v1/account/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.claims.pinVerified, true);
  assert.equal(s.body.person.role, "FOUNDER");
  // Base token was revoked on elevation: single live session.
  const stale = await request(base, "GET", "/api/v1/account/session");
  assert.equal(stale.status, 401);
});

test("FOUNDER-CLOSURE-3 — generic ADMIN PIN cannot satisfy the Founder step-up path", async (t) => {
  const { request, workforce } = await boot(t);
  const base = await provisionAndLogin(request);
  // Per-user verifyPin rejects the generic admin PIN for the Founder record.
  const person = await workforce.getPersonByUsername(FOUNDER.username);
  assert.equal(await workforce.verifyPin(person.id, ADMIN_PIN), false);
  assert.equal(await workforce.verifyPin(person.id, FOUNDER.pin), true);
  // And over HTTP the admin PIN is not accepted at the workforce endpoint.
  const viaHttp = await request(base, "POST", "/api/v1/account/pin", { pin: ADMIN_PIN });
  assert.equal(viaHttp.status, 403);
});

test("FOUNDER-CLOSURE-4 — legacy ADMIN session gets truthful 403 (not 500) at the workforce PIN endpoint", async (t) => {
  const { request, identity } = await boot(t);
  await provisionAndLogin(request);
  const adminToken = identity.issueSession({ subject: "admin", tier: "COMMUNITY", level: 2, persona: "ADMIN", edition: "COMMUNITY", metadata: {} }).token;
  const r = await request(adminToken, "POST", "/api/v1/account/pin", { pin: ADMIN_PIN });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "WORKFORCE_SESSION_REQUIRED");
});

test("FOUNDER-CLOSURE-5 — stale personId still resolves via the username bridge; unknown identity is an authoritative 401", async (t) => {
  const { request, identity } = await boot(t);
  await provisionAndLogin(request);
  const bridged = identity.issueSession({ subject: FOUNDER.username, tier: "COMMUNITY", level: 3, persona: "WORKFORCE", edition: "COMMUNITY", metadata: { role: "FOUNDER" } }).token;
  const ok = await request(bridged, "GET", "/api/v1/account/session");
  assert.equal(ok.status, 200);
  assert.equal(ok.body.person.username, FOUNDER.username);
  const ghost = identity.issueSession({ subject: "nobody", tier: "COMMUNITY", level: 3, persona: "WORKFORCE", edition: "COMMUNITY", metadata: { role: "FOUNDER" } }).token;
  const miss = await request(ghost, "GET", "/api/v1/account/session");
  assert.equal(miss.status, 401);
  assert.equal(miss.body.error, "PERSON_NOT_FOUND");
});

test("FOUNDER-CLOSURE-6 — elevation gate: base session blocked from workforce admin, elevated session admitted", async (t) => {
  const { request } = await boot(t);
  const base = await provisionAndLogin(request);
  const blocked = await request(base, "GET", "/api/v1/workforce");
  assert.equal(blocked.status, 403);
  const elevated = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  const admitted = await request(elevated.body.token, "GET", "/api/v1/workforce");
  assert.equal(admitted.status, 200);
  assert.ok(Array.isArray(admitted.body.persons));
});

// ---- Static source-assertion guards: the exact client defects must stay fixed.

const ROOT = path.resolve(".");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("FOUNDER-CLOSURE-7 — founder page validates boot server-side and never labels the admin PIN as Founder", () => {
  const html = read("public/founder.html");
  assert.ok(html.includes("/api/v1/account/session"), "boot must validate the stored token against the server");
  assert.ok(html.includes("Verifying Founder workforce identity"), "truthful loading state required");
  assert.ok(!html.includes("FOUNDER SESSION AUTHENTICATED"), "generic admin PIN must never be labeled a Founder session");
  assert.ok(html.includes("not Founder step-up"), "admin recovery path must be labeled honestly");
  assert.ok(html.includes("/api/v1/account/login"), "workforce username/password login required");
  assert.ok(!html.includes("persona==='ADMIN'&&Number(identity.level)>=2"), "ADMIN L2 must not imply Founder tabs");
});

test("FOUNDER-CLOSURE-8 — index session machine distinguishes unreachable from not-provisioned", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("sessionState"), "explicit session state machine required");
  assert.ok(html.includes("Service unreachable"), "unreachable must not render as not-provisioned");
  assert.ok(html.includes("the server confirms this session has no workforce record"), "genuine negative must cite the server");
  assert.ok(html.includes("ADMIN recovery PIN"), "admin PIN login must be labeled honestly");
});

test("FOUNDER-CLOSURE-9 — admin plane gates workforce surfaces on server-truth role", () => {
  const html = read("public/admin/index.html");
  assert.ok(html.includes("/account/session") && html.includes("canWorkforce"), "role must be resolved from the server session");
  assert.ok(html.includes("canProvisionFounder"), "provision-founder affordance must be role-gated");
});

test("FOUNDER-CLOSURE-10 — logo asset truth: valid PNG, sane weight, stable path, immutable caching", () => {
  const buf = fs.readFileSync(path.join(ROOT, "public/ADE-LOGO.png"));
  assert.ok(buf.length > 10000, "logo must be non-trivial");
  assert.ok(buf.length < 1000000, "logo must stay mobile-sane (<1MB)");
  assert.ok(buf[0] === 0x89 && buf[1] === 0x50, "PNG magic bytes required");
  for (const page of ["public/index.html", "public/founder.html", "public/admin/index.html"]) {
    assert.ok(read(page).includes('src="/ADE-LOGO.png"') || read(page).includes('href="/ADE-LOGO.png"'), `${page} must reference /ADE-LOGO.png`);
  }
  assert.ok(read("src/app.js").includes("immutable"), "static image assets must be served immutable");
});

test("FOUNDER-CLOSURE-11 — password-authenticated self-service PIN set (the stuck-Founder resolution path)", async (t) => {
  const { request } = await boot(t);
  const base = await provisionAndLogin(request);
  // Wrong password cannot change the PIN.
  const badPw = await request(base, "POST", "/api/v1/account/change-pin", { currentPassword: "WrongPass!9", newPin: "999999" });
  assert.equal(badPw.status, 401);
  // Correct password sets a new per-user PIN; the new PIN elevates, the old one does not.
  const set = await request(base, "POST", "/api/v1/account/change-pin", { currentPassword: FOUNDER.password, newPin: "999999" });
  assert.equal(set.status, 200);
  const oldPin = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(oldPin.status, 403);
  const fresh = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  const elevated = await request(fresh.body.token, "POST", "/api/v1/account/pin", { pin: "999999" });
  assert.equal(elevated.status, 200);
  assert.equal(elevated.body.elevated, true);
});

test("FOUNDER-CLOSURE-12 — founder page offers self-service PIN setup; Africa map asset truth", () => {
  const founder = read("public/founder.html");
  assert.ok(founder.includes("/api/v1/account/change-pin"), "founder PIN screen must offer password-authenticated PIN setup");
  assert.ok(founder.includes("Set your own PIN with your password") || founder.includes("SET MY PIN"), "setup affordance must be visible");
  const index = read("public/index.html");
  assert.ok(index.includes("src:'/brand-mark.png'") || index.includes('src="/brand-mark.png"'), "public footer must reference the Africa tech-hub map");
  const buf = fs.readFileSync(path.join(ROOT, "public/brand-mark.png"));
  assert.ok(buf.length > 10000, "map asset must be non-trivial");
  assert.ok(buf[0] === 0x89 && buf[1] === 0x50, "map PNG magic bytes required");
});
