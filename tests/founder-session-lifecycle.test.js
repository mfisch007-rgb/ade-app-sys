import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// FOUNDER SESSION LIFECYCLE — §4 cross-auth runtime tests H/I/J (+B supplement).
// Real HTTP against registerIdentityRoutes with isolated stores. Complements
// founder-elevation-persistence (A–G) and founder-identity-closure.
// H: a stale BASE token arriving after elevation must NOT destroy the fresh
//    elevated session (server revokes base; elevated stays authoritative).
// I: logout clears BOTH base and elevated session state.
// J: reload after logout (no token) yields no session.
// B+: the bootstrap ADMIN PIN value is rejected at the Founder step-up.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-sess-life-"));
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
  const identity = new IdentityOnboarding({ eventBus: { publish() {} } });
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
  return { request };
}

test("SESS-H — stale BASE token after elevation does not destroy the elevated session", async (t) => {
  const { request } = await boot(t);
  const prov = await request(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  assert.equal(prov.status, 201);
  const login = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(login.status, 200);
  const base = login.body.token;
  const elev = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  assert.equal(elev.status, 200);
  assert.equal(elev.body.elevated, true);
  const elevated = elev.body.token;
  // Stale base arrives late (single-session rotation revoked it) → 401.
  const stale = await request(base, "GET", "/api/v1/account/session");
  assert.equal(stale.status, 401);
  // The fresh elevated session is untouched and authoritative.
  const s = await request(elevated, "GET", "/api/v1/account/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.person.role, "FOUNDER");
  assert.equal(s.body.person.level, 3);
  assert.equal(s.body.claims.pinVerified, true);
});

test("SESS-I — logout clears both base and elevated Founder session state", async (t) => {
  const { request } = await boot(t);
  await request(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  const login = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  const base = login.body.token;
  const elev = await request(base, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
  const elevated = elev.body.token;
  const out = await request(elevated, "POST", "/api/v1/account/logout", {});
  assert.equal(out.status, 200);
  assert.equal((await request(elevated, "GET", "/api/v1/account/session")).status, 401);
  assert.equal((await request(base, "GET", "/api/v1/account/session")).status, 401);
});

test("SESS-J — reload after logout (no token) yields no session", async (t) => {
  const { request } = await boot(t);
  await request(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  const s = await request(null, "GET", "/api/v1/account/session");
  assert.equal(s.status, 401);
});

test("SESS-B — bootstrap ADMIN PIN value is rejected at Founder step-up", async (t) => {
  const { request } = await boot(t);
  await request(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
  const login = await request(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(login.status, 200);
  // A non-founder PIN (the bootstrap ADMIN value used in test rigs) must not elevate.
  const bad = await request(login.body.token, "POST", "/api/v1/account/pin", { pin: ADMIN_PIN });
  assert.equal(bad.status, 403);
  assert.equal(bad.body.error, "INVALID_PIN");
  // Base session itself is unaffected and still identifies the Founder.
  const s = await request(login.body.token, "GET", "/api/v1/account/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.person.role, "FOUNDER");
  assert.equal(s.body.claims.pinVerified, false);
});
