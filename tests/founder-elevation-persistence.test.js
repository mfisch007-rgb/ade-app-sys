import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// FOUNDER ELEVATION PERSISTENCE — regression tests for the production defect:
// base login + correct personal PIN reported "elevation success" but the
// session subsequently restored as BASE / Not elevated, while the global
// ADMIN PIN still produced Administrator L2. These tests pin the full
// state machine: issue → persist → restore → refresh → authorize.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-elev-persist-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return new LocalStorageAdapter(file);
}

async function boot(t, { credentialVersion = 1 } = {}) {
  const { default: expressMod } = await import("express");
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));
  const workforce = new WorkforceManager({ store: tempStore(t) });
  let liveVersion = credentialVersion;
  const credentialStore = {
    getCredentialVersion: () => liveVersion,
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
  return { request, identity, workforce, rotateAdmin: () => { liveVersion += 1; } };
}

async function provisionAndLogin(request) {
  const prov = await request(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  assert.equal(prov.status, 201);
  const login = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  return login.body.token;
}

test("ELEV-PERSIST-1 — elevated Founder session restores as FOUNDER L3 pinVerified across repeated reads (refresh survival)", async (t) => {
  const { request } = await boot(t);
  const base = await provisionAndLogin(request);
  const elev = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(elev.status, 200);
  assert.equal(elev.body.elevated, true);
  assert.ok(elev.body.token);
  // Simulate navigation + refresh: the SAME elevated token must restore elevated every time.
  for (let i = 0; i < 3; i += 1) {
    const s = await request(elev.body.token, "GET", "/api/v1/account/session");
    assert.equal(s.status, 200);
    assert.equal(s.body.person.role, "FOUNDER");
    assert.equal(s.body.person.level, 3);
    assert.equal(s.body.person.username, FOUNDER.username);
    assert.equal(s.body.claims.persona, "WORKFORCE");
    assert.equal(s.body.claims.pinVerified, true);
    assert.ok(s.body.person.id, "person id must survive restore");
  }
  // Elevated token authorizes the Founder Command Center surface.
  const wf = await request(elev.body.token, "GET", "/api/v1/workforce");
  assert.equal(wf.status, 200);
});

test("ELEV-PERSIST-2 — changed Founder PIN elevates on a fresh base session; old PIN stays rejected", async (t) => {
  const { request } = await boot(t);
  const base = await provisionAndLogin(request);
  const set = await request(base, "POST", "/api/v1/account/change-pin", { currentPassword: FOUNDER.password, newPin: "999999" });
  assert.equal(set.status, 200);
  const fresh = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(fresh.status, 200);
  const oldPin = await request(fresh.body.token, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(oldPin.status, 403);
  const elevated = await request(fresh.body.token, "POST", "/api/v1/account/pin", { pin: "999999" });
  assert.equal(elevated.status, 200);
  assert.equal(elevated.body.elevated, true);
  const s = await request(elevated.body.token, "GET", "/api/v1/account/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.claims.pinVerified, true);
  assert.equal(s.body.person.role, "FOUNDER");
});

test("ELEV-PERSIST-3 — rejection matrix: wrong PIN, ADMIN PIN, cross-person, unauthenticated", async (t) => {
  const { request, workforce } = await boot(t);
  const base = await provisionAndLogin(request);
  // Wrong Founder PIN → 403 INVALID_PIN, no elevation.
  const wrong = await request(base, "POST", "/api/v1/account/pin", { pin: "000000" });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error, "INVALID_PIN");
  const stillBase = await request(base, "GET", "/api/v1/account/session");
  assert.equal(stillBase.status, 200);
  assert.equal(stillBase.body.claims.pinVerified, false);
  // Global ADMIN PIN at the workforce step-up → 403, never Founder elevation.
  const adminAtStepUp = await request(base, "POST", "/api/v1/account/pin", { pin: ADMIN_PIN });
  assert.equal(adminAtStepUp.status, 403);
  // Cross-person: invite a second person, accept, then try their PIN on the Founder session.
  const invite = await workforce.invite({ fullName: "Second Operator", role: "OPERATOR", createdBy: "founder" });
  const accepted = await workforce.acceptInvitation({ code: invite.inviteCode, fullName: "Second Operator", username: "operator2", password: "OperatorPass!2", pin: "222222" });
  assert.equal(accepted.role, "OPERATOR");
  const cross = await request(base, "POST", "/api/v1/account/pin", { pin: "222222" });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.error, "INVALID_PIN");
  // Unauthenticated step-up → 401, never 500.
  const anon = await request(null, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(anon.status, 401);
});

test("ELEV-PERSIST-4 — legacy ADMIN session is ADMINISTRATOR L2 only and can never satisfy Founder step-up", async (t) => {
  const { request, identity } = await boot(t);
  await provisionAndLogin(request);
  const adminToken = identity.issueSession({ subject: "admin", tier: "COMMUNITY", level: 2, persona: "ADMIN", edition: "COMMUNITY", metadata: {} }).token;
  const s = await request(adminToken, "GET", "/api/v1/account/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.person.role, "ADMIN");
  assert.equal(s.body.person.level, 2);
  assert.equal(String(s.body.claims.persona).toUpperCase(), "ADMIN");
  // Founder predicate (WORKFORCE + FOUNDER) is false for the ADMIN session.
  const isFounder = String(s.body.claims.persona).toUpperCase() === "WORKFORCE" && String(s.body.person.role).toUpperCase() === "FOUNDER";
  assert.equal(isFounder, false);
  // ADMIN session at the workforce PIN endpoint → truthful 403, never elevation.
  const r = await request(adminToken, "POST", "/api/v1/account/pin", { pin: ADMIN_PIN });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "WORKFORCE_SESSION_REQUIRED");
});

test("ELEV-PERSIST-5 — workforce (Founder) sessions survive ADMIN credential rotation", async (t) => {
  const { request, rotateAdmin } = await boot(t);
  const base = await provisionAndLogin(request);
  const elev = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(elev.status, 200);
  rotateAdmin(); // ADMIN PIN rotated / lifecycle bumped on another instance.
  const sBase = await request(base, "GET", "/api/v1/account/session");
  // Base was revoked at elevation regardless; the elevated session must survive rotation.
  const s = await request(elev.body.token, "GET", "/api/v1/account/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.claims.pinVerified, true);
  assert.equal(s.body.person.role, "FOUNDER");
  assert.ok(sBase.status === 401, "revoked base stays revoked");
});

// ---- Static client guards: the exact browser defects must stay fixed.

const ROOT = path.resolve(".");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("ELEV-PERSIST-6 — founder client never discards a valid session on 403 authorization denials", () => {
  const html = read("public/founder.html");
  // The data-fetch helper must not call clearSession() on every 401/403.
  assert.ok(!html.includes("if(r.status===401||r.status===403)"), "blanket 401/403 session wipe is forbidden");
  assert.ok(html.includes("ELEVATED_PIN_REQUIRED"), "authorization denials must be named, not treated as session death");
  // Elevation must be mirrored to the shared Account token so /Account never shows stale BASE.
  assert.ok(html.includes("ade_token"), "founder elevation must mirror the shared ade_token key");
});

test("ELEV-PERSIST-7 — SSE contract: public stream route, connected frame, truthful empty state", () => {
  const app = read("src/app.js");
  assert.ok(app.includes('/api/v1/events/stream'), "canonical SSE route required");
  assert.ok(app.includes("STREAM_CONNECTED"), "initial connected frame required");
  const founder = read("public/founder.html");
  assert.ok(founder.includes("Waiting for live events"), "truthful empty/live-waiting state required");
  assert.ok(founder.includes("EventSource('/api/v1/events/stream')"), "browser listener must target the canonical route");
});
