import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

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

function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-route-test-"));
  const file = path.join(dir, "store.json");
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return new LocalStorageAdapter(file);
}

async function bootRoutes(t) {
  const { default: expressMod } = await import("express");
  const app = expressMod();
  app.use(expressMod.json({ limit: "1mb" }));

  const workforce = new WorkforceManager({ store: tempStore(t) });
  const announcements = new AnnouncementsManager({ store: tempStore(t) });
  const credentialStore = {
    getCredentialVersion: () => 1,
    ensureInitialized: async () => {},
    verifyPin: async () => false
  };
  const identity = new IdentityOnboarding({ credentialStore, eventBus: { publish() {} } });
  const auditStore = { query: (limit = 100) => [] };

  registerIdentityRoutes({
    app,
    identity,
    workforce,
    announcements,
    auditStore,
    runtimeMode: "COMMUNITY"
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const session = (opts) => identity.issueSession(opts).token;
  const request = (token, method, url, body) =>
    fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

  return { request, session };
}

test("identity-routes: nonelevated workforce viewer is rejected from invites", async (t) => {
  const { request, session } = await bootRoutes(t);
  const bootRes = await request(null, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Ade Founder",
    username: "founder",
    password: "FounderPass!1",
    pin: "123456"
  });
  const boot = await bootRes.json();
  assert.equal(bootRes.status, 201);
  const viewerToken = session({
    subject: "viewer",
    persona: "WORKFORCE",
    level: 1,
    edition: "COMMUNITY",
    metadata: { role: "VIEWER", personId: boot.person.id, pinVerified: false }
  });
  const res = await request(viewerToken, "POST", "/api/v1/workforce/invite", {
    fullName: "Nope",
    role: "OPERATOR"
  });
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error, "ELEVATED_PIN_REQUIRED");
});

test("identity-routes: anonymous access to protected surfaces is rejected", async (t) => {
  const { request } = await bootRoutes(t);
  const res = await request(null, "GET", "/api/v1/workforce");
  assert.equal(res.status, 401);
});

test("identity-routes: legacy level-2 admin PIN session is an elevated operator on the control plane", async (t) => {
  const { request, session } = await bootRoutes(t);
  const adminToken = session({ subject: "admin", persona: "ADMIN", level: 2, edition: "COMMUNITY" });

  const listRes = await request(adminToken, "GET", "/api/v1/workforce");
  const list = await listRes.json();
  assert.equal(listRes.status, 200);
  assert.equal(list.success, true);

  const inviteRes = await request(adminToken, "POST", "/api/v1/workforce/invite", {
    fullName: "Ade Operator",
    role: "OPERATOR",
    expiresInDays: 7
  });
  const invite = await inviteRes.json();
  assert.equal(inviteRes.status, 201);
  assert.equal(invite.status, "INVITATION_ISSUED");
  assert.match(invite.inviteCode, /^[A-Za-z0-9]{12}$/);

  const postRes = await request(adminToken, "POST", "/api/v1/announcements", {
    kind: "NEWS",
    title: "Maintenance window",
    body: "Scheduled maintenance tonight.",
    active: true
  });
  const post = await postRes.json();
  assert.equal(postRes.status, 201);
  assert.equal(post.announcement.kind, "NEWS");
  assert.equal(post.announcement.title, "Maintenance window");
});

test("identity-routes: elevated members manage workload roles, state and expiry", async (t) => {
  const { request } = await bootRoutes(t);
  const boot = await (await request(null, "POST", "/api/v1/workforce/provision-founder", {
    fullName: "Ade Founder",
    username: "founder",
    password: "FounderPass!1",
    pin: "123456"
  })).json();
  assert.equal(boot.person.role, "FOUNDER");

  const login = await (await request(null, "POST", "/api/v1/account/login", {
    username: "founder",
    password: "FounderPass!1"
  })).json();
  const elev = await (await request(login.token, "POST", "/api/v1/account/pin", { pin: "123456" })).json();

  const invite = await (await request(elev.token, "POST", "/api/v1/workforce/invite", {
    fullName: "Ade Operator",
    role: "OPERATOR",
    expiresInDays: 7
  })).json();

  const acceptedRes = await request(null, "POST", "/api/v1/account/accept-invitation", {
    code: invite.inviteCode,
    fullName: "Ade Operator",
    username: "opera",
    password: "OperaPass!2",
    pin: "654321"
  });
  const accepted = await acceptedRes.json();
  assert.ok(accepted.success && accepted.person, `accept-invitation failed: status=${acceptedRes.status} body=${JSON.stringify(accepted)}`);
  const opId = accepted.person.id;

  const promoted = await (await request(elev.token, "POST", `/api/v1/workforce/${opId}/promote`, {
    role: "ADMIN"
  })).json();
  assert.equal(promoted.success, true);
  assert.equal(promoted.person.role, "ADMIN");

  const demoted = await (await request(elev.token, "POST", `/api/v1/workforce/${opId}/demote`, {
    role: "ANALYST"
  })).json();
  assert.equal(demoted.person.role, "ANALYST");

  const suspended = await (await request(elev.token, "POST", `/api/v1/workforce/${opId}/suspend`, {})).json();
  assert.equal(suspended.person.status, "SUSPENDED");
  const activated = await (await request(elev.token, "POST", `/api/v1/workforce/${opId}/activate`, {})).json();
  assert.equal(activated.person.status, "ACTIVE");

  const expiry = await (await request(elev.token, "PATCH", `/api/v1/workforce/${opId}/expiry`, {
    accessExpiryAt: new Date(Date.now() + 30 * 86400000).toISOString()
  })).json();
  assert.ok(expiry.person.accessExpiryAt);

  const founderDemote = await request(elev.token, "POST", `/api/v1/workforce/${boot.person.id}/demote`, {
    role: "VIEWER"
  });
  assert.equal(founderDemote.status, 403);
  assert.equal((await founderDemote.json()).error, "FOUNDER_PROTECTED");
});

test("identity-routes: announcements publish ve publicly without auth", async (t) => {
  const { request, session } = await bootRoutes(t);
  const adminToken = session({ subject: "admin", persona: "ADMIN", level: 2, edition: "COMMUNITY" });
  await request(adminToken, "POST", "/api/v1/announcements", {
    kind: "BULLETIN",
    title: "Public bulletin",
    active: true
  });
  const res = await request(null, "GET", "/api/v1/announcements");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.announcements.some((a) => a.title === "Public bulletin"));
});