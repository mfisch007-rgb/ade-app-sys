import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import LocalStorageAdapter from "../src/storage/LocalStorageAdapter.js";
import WorkforceManager from "../src/identity/WorkforceManager.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";
import AccessAdministration from "../src/commerce/AccessAdministration.js";
import { registerIdentityRoutes } from "../src/routes/identityRoutes.js";

function accessStore() {
  const sections = {};
  return {
    readSection(key) {
      return sections[key] ?? null;
    },
    async readSectionStrictAsync(key) {
      return sections[key] ?? null;
    },
    writeSection(key, value) {
      sections[key] = structuredClone(value);
    },
    async writeSectionAsync(key, value) {
      sections[key] = structuredClone(value);
    }
  };
}

async function request(base, urlPath, { method = "GET", token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== null) headers["content-type"] = "application/json";
  const response = await fetch(base + urlPath, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  let json = null;
  try {
    json = await response.json();
  } catch {}
  return { status: response.status, body: json };
}

test("access administration routes enforce elevation, role policy and tenant-safe grants", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ade-access-routes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const storage = new LocalStorageAdapter(path.join(dir, "storage.json"));
  const workforce = new WorkforceManager({ store: storage });
  await workforce.initialize();
  const identity = new IdentityOnboarding();
  const access = new AccessAdministration({ store: accessStore() });
  const announcements = {
    list: () => [],
    get: () => null,
    create: (value) => value,
    update: (id, value) => value,
    remove: () => true
  };
  workforce.announcements = announcements;

  const founder = await workforce.provisionFounder({
    fullName: "Founder One",
    username: "founder.one",
    password: "Founder#2026Pass",
    pin: "246810"
  });
  const founderActor = await workforce.getPersonRecord(founder.id);
  const inviteOne = await workforce.invite({
    fullName: "Operator One",
    role: "OPERATOR",
    actor: founderActor
  });
  const operatorOne = await workforce.acceptInvitation({
    code: inviteOne.inviteCode,
    fullName: "Operator One",
    username: "operator.one",
    password: "Operator#2026Pass",
    pin: "135790"
  });
  const inviteTwo = await workforce.invite({
    fullName: "Operator Two",
    role: "OPERATOR",
    actor: founderActor
  });
  await workforce.acceptInvitation({
    code: inviteTwo.inviteCode,
    fullName: "Operator Two",
    username: "operator.two",
    password: "Operator#2026Pass",
    pin: "135791"
  });

  const app = express();
  app.use(express.json());
  registerIdentityRoutes({
    app,
    identity,
    workforce,
    announcements,
    accessAdministration: access,
    runtimeMode: "COMMUNITY"
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const founderBase = await request(base, "/api/v1/account/login", {
    method: "POST",
    body: { username: "founder.one", password: "Founder#2026Pass" }
  });
  assert.equal(founderBase.status, 200);
  const founderElevated = await request(base, "/api/v1/account/pin", {
    method: "POST",
    token: founderBase.body.token,
    body: { pin: "246810" }
  });
  assert.equal(founderElevated.status, 200);
  const founderToken = founderElevated.body.token;

  const operatorBase = await request(base, "/api/v1/account/login", {
    method: "POST",
    body: { username: "operator.one", password: "Operator#2026Pass" }
  });
  assert.equal(operatorBase.status, 200);
  const anon = await request(base, "/api/v1/admin/access/grants");
  assert.equal(anon.status, 401);
  const baseOnly = await request(base, "/api/v1/admin/access/grants", {
    token: operatorBase.body.token
  });
  assert.equal(baseOnly.status, 403);
  assert.equal(baseOnly.body.error, "ELEVATED_PIN_REQUIRED");
  const operatorElevated = await request(base, "/api/v1/account/pin", {
    method: "POST",
    token: operatorBase.body.token,
    body: { pin: "135790" }
  });
  assert.equal(operatorElevated.status, 200);
  const operatorToken = operatorElevated.body.token;

  const founderList = await request(base, "/api/v1/admin/access/grants", { token: founderToken });
  assert.equal(founderList.status, 200);
  assert.deepEqual(founderList.body.grants, []);

  const noReason = await request(base, "/api/v1/admin/access/grants", {
    method: "POST",
    token: founderToken,
    body: { account: "operator.one", product: "AWBULI", tier: "TRIAL", days: 7 }
  });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.error, "REASON_REQUIRED");

  const granted = await request(base, "/api/v1/admin/access/grants", {
    method: "POST",
    token: founderToken,
    body: {
      account: "operator.one",
      product: "AWBULI",
      tier: "TRIAL",
      days: 7,
      reason: "pilot evaluation"
    }
  });
  assert.equal(granted.status, 201);
  assert.equal(granted.body.grant.accountId, operatorOne.id);
  assert.equal(granted.body.grant.tier, "TRIAL");
  assert.equal(granted.body.grant.via, "ADMIN_ENTITLEMENT");
  assert.equal(granted.body.grant.paymentReference, null);

  const selfAccess = await request(base, "/api/v1/account/access", { token: operatorToken });
  assert.equal(selfAccess.status, 200);
  assert.equal(selfAccess.body.effective.AWBULI.tier, "TRIAL");
  assert.equal(selfAccess.body.effective.PROCARTA.tier, "COMMUNITY");

  const paidAttempt = await request(base, "/api/v1/admin/access/grants", {
    method: "POST",
    token: operatorToken,
    body: {
      account: "operator.two",
      product: "AWBULI",
      tier: "PAID",
      days: 7,
      reason: "operator tries paid tier"
    }
  });
  assert.equal(paidAttempt.status, 403);
  assert.equal(paidAttempt.body.error, "ACCESS_TIER_NOT_PERMITTED");

  const selfGrant = await request(base, "/api/v1/admin/access/grants", {
    method: "POST",
    token: operatorToken,
    body: {
      account: "operator.one",
      product: "AWBULI",
      tier: "TRIAL",
      days: 7,
      reason: "self grant attempt"
    }
  });
  assert.equal(selfGrant.status, 403);
  assert.equal(selfGrant.body.error, "SELF_GRANT_FORBIDDEN");

  const crossRole = await request(
    base,
    `/api/v1/admin/access/grants/${encodeURIComponent(granted.body.grant.id)}/revoke`,
    {
      method: "POST",
      token: operatorToken,
      body: { reason: "operator cannot revoke founder grant" }
    }
  );
  assert.equal(crossRole.status, 403);
  assert.equal(crossRole.body.error, "INSUFFICIENT_AUTHORIZATION");

  const extended = await request(
    base,
    `/api/v1/admin/access/grants/${encodeURIComponent(granted.body.grant.id)}/extend`,
    {
      method: "POST",
      token: founderToken,
      body: { days: 2, reason: "extend pilot" }
    }
  );
  assert.equal(extended.status, 200);
  assert.equal(extended.body.grant.status, "ACTIVE");

  const revoked = await request(
    base,
    `/api/v1/admin/access/grants/${encodeURIComponent(granted.body.grant.id)}/revoke`,
    {
      method: "POST",
      token: founderToken,
      body: { reason: "pilot complete" }
    }
  );
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.grant.status, "REVOKED");

  const afterRevoke = await request(base, "/api/v1/account/access", { token: operatorToken });
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.body.effective.AWBULI.tier, "COMMUNITY");
});
