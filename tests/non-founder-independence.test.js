import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// NON-FOUNDER RUNTIME INDEPENDENCE — Founder authority is additive/exceptional,
// never a runtime prerequisite. These tests prove Admin/Worker/Viewer operate
// fully while Founder is logged out, that invitations use only real roles,
// and that Founder login/logout neither grants nor revokes others' sessions.

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

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-nofounder-"));
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
  const credentialStore = {
    getCredentialVersion: () => 1,
    ensureInitialized: async () => {},
    verifyPin: async () => false
  };
  const identity = new IdentityOnboarding({ credentialStore, eventBus: { publish() {} } });
  registerIdentityRoutes({ app, identity, workforce, announcements: { list: async () => [], stats: async () => ({ total: 0 }) }, auditStore: { query: () => [] }, runtimeMode: "COMMUNITY" });
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

const ADMIN = { fullName: "Ada Admin", username: "adaadmin", password: "AdminPass!1", pin: "111111" };
const OPERATOR = { fullName: "Ola Operator", username: "olaop", password: "OperatorPass!1", pin: "222222" };
const VIEWER = { fullName: "Vic Viewer", username: "vicview", password: "ViewerPass!1", pin: "333333" };

async function onboardThree(t, request, workforce) {
  const prov = await request(null, "POST", "/api/v1/workforce/provision-founder",
    { fullName: "F Founder", username: "founder", password: "FounderPass!1", pin: "123456" });
  assert.equal(prov.status, 201);
  const fl = await request(null, "POST", "/api/v1/account/login", { username: "founder", password: "FounderPass!1" });
  const fe = await request(fl.body.token, "POST", "/api/v1/account/pin", { pin: "123456" });
  const founderElevated = fe.body.token;
  for (const [person, role] of [[ADMIN, "ADMIN"], [OPERATOR, "OPERATOR"], [VIEWER, "VIEWER"]]) {
    const inv = await request(founderElevated, "POST", "/api/v1/workforce/invite",
      { fullName: person.fullName, role, expiresInDays: 7 });
    assert.equal(inv.status, 201, `Founder invites ${role}`);
    const acc = await workforce.acceptInvitation({
      code: inv.body.inviteCode, fullName: person.fullName,
      username: person.username, password: person.password, pin: person.pin
    });
    assert.equal(acc.role, role);
  }
  return founderElevated;
}

async function loginPerson(request, username, password) {
  const r = await request(null, "POST", "/api/v1/account/login", { username, password });
  assert.equal(r.status, 200);
  return r.body.token;
}

test("NOF-1 — Admin operates fully while Founder is logged out (invite, roster, agents, announcements)", async (t) => {
  const ctx = await boot(t);
  const founderElevated = await onboardThree(t, ctx.request, ctx.workforce);
  // Founder logs out: every Founder token revoked. Founder is now offline.
  const fl = await ctx.request(null, "POST", "/api/v1/account/login", { username: "founder", password: "FounderPass!1" });
  await ctx.request(fl.body.token, "POST", "/api/v1/account/logout");
  await ctx.request(founderElevated, "POST", "/api/v1/account/logout");
  const deadFounder = await ctx.request(founderElevated, "GET", "/api/v1/account/session");
  assert.equal(deadFounder.status, 401);
  // Admin authenticates alone and operates: roster, invite, agent.
  const adminBase = await loginPerson(ctx.request, ADMIN.username, ADMIN.password);
  const adminElev = await ctx.request(adminBase, "POST", "/api/v1/account/pin", { pin: ADMIN.pin });
  assert.equal(adminElev.status, 200);
  const adminTok = adminElev.body.token;
  const roster = await ctx.request(adminTok, "GET", "/api/v1/workforce");
  assert.equal(roster.status, 200);
  assert.ok(roster.body.persons.length >= 4);
  const inv = await ctx.request(adminTok, "POST", "/api/v1/workforce/invite", { fullName: "Extra Hand", role: "OPERATOR", expiresInDays: 7 });
  assert.equal(inv.status, 201);
  assert.ok(inv.body.inviteCode);
  const agent = await ctx.request(adminTok, "POST", "/api/v1/workforce/agents", { name: "settle-bot", purpose: "reconciliation" });
  assert.equal(agent.status, 201);
  const ann = await ctx.request(adminTok, "GET", "/api/v1/announcements/admin");
  assert.equal(ann.status, 200);
});

test("NOF-2 — Worker and Viewer hold valid base sessions with correctly gated (not destroyed) access", async (t) => {
  const ctx = await boot(t);
  await onboardThree(t, ctx.request, ctx.workforce);
  const opTok = await loginPerson(ctx.request, OPERATOR.username, OPERATOR.password);
  const vwTok = await loginPerson(ctx.request, VIEWER.username, VIEWER.password);
  for (const tok of [opTok, vwTok]) {
    const s = await ctx.request(tok, "GET", "/api/v1/account/session");
    assert.equal(s.status, 200);
    assert.equal(s.body.claims.pinVerified, false);
    const gated = await ctx.request(tok, "GET", "/api/v1/workforce");
    assert.equal(gated.status, 403);
    // The denial must NOT destroy the valid base session.
    const still = await ctx.request(tok, "GET", "/api/v1/account/session");
    assert.equal(still.status, 200);
  }
  const ann = await ctx.request(opTok, "GET", "/api/v1/announcements");
  assert.equal(ann.status, 200);
});

test("NOF-3 — invitation classes are limited to the real authorization model; Founder can never be granted", async (t) => {
  const ctx = await boot(t);
  const founderElevated = await onboardThree(t, ctx.request, ctx.workforce);
  for (const bad of ["FOUNDER", "PARTNER", "PILOT", "SUPERADMIN", ""]) {
    const r = await ctx.request(founderElevated, "POST", "/api/v1/workforce/invite", { fullName: "Bad Actor", role: bad, expiresInDays: 7 });
    assert.ok([400, 403].includes(r.status), `role ${bad || "(empty)"} must be refused, got ${r.status}`);
  }
  // Unauthenticated invitation creation is rejected, not silently allowed.
  const anon = await ctx.request(null, "POST", "/api/v1/workforce/invite", { fullName: "Anon", role: "OPERATOR" });
  assert.ok([401, 403].includes(anon.status));
});

test("NOF-4 — Founder login/elevation neither grants others nor revokes them on logout", async (t) => {
  const ctx = await boot(t);
  await onboardThree(t, ctx.request, ctx.workforce);
  const opTok = await loginPerson(ctx.request, OPERATOR.username, OPERATOR.password);
  // Founder elevates elsewhere; Operator session claims are unchanged.
  const fl = await loginPerson(ctx.request, "founder", "FounderPass!1");
  const fe = await ctx.request(fl, "POST", "/api/v1/account/pin", { pin: "123456" });
  assert.equal(fe.status, 200);
  const opSession = await ctx.request(opTok, "GET", "/api/v1/account/session");
  assert.equal(opSession.status, 200);
  assert.equal(opSession.body.person.role, "OPERATOR");
  assert.equal(opSession.body.claims.pinVerified, false);
  // Founder logout revokes only Founder tokens; Operator session survives.
  await ctx.request(fl, "POST", "/api/v1/account/logout");
  await ctx.request(fe.body.token, "POST", "/api/v1/account/logout");
  const opAlive = await ctx.request(opTok, "GET", "/api/v1/account/session");
  assert.equal(opAlive.status, 200);
  assert.equal(opAlive.body.person.username, OPERATOR.username);
});
