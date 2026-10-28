import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import AccessAdministration from "../src/commerce/AccessAdministration.js";
import CommercialEntitlement from "../src/commerce/CommercialEntitlement.js";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ade-gate2-"));
const previousCwd = process.cwd();
const previousCredentialStore = process.env.ADE_CREDENTIAL_STORE_FILE;
const previousPinHash = process.env.ADE_ADMIN_PIN_HASH;
process.chdir(sandbox);
process.env.ADE_CREDENTIAL_STORE_FILE = path.join(sandbox, "admin-credential.json");
delete process.env.ADE_ADMIN_PIN_HASH;

const { app, kernelReady, accessAdministration } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

const tenantScope = `gate2-runtime-${Date.now()}`;
const accountId = `gate2-operator-${Date.now()}`;
const founder = { id: "WRF-GATE2-FOUNDER", username: "gate2-founder", role: "FOUNDER" };

let server = null;
let baseUrl = null;

function memoryStore() {
  const sections = {};
  return {
    readSection(name) {
      return sections[name];
    },
    writeSection(name, value) {
      sections[name] = structuredClone(value);
    }
  };
}

function operatorToken() {
  return IdentityOnboarding.getInstance().issueSession({
    subject: accountId,
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR",
    metadata: { tenantId: tenantScope }
  }).token;
}

async function createUnit(token, body) {
  const res = await fetch(`${baseUrl}/api/v1/org/units`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  return { res, body: await res.json() };
}

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      server.keepAliveTimeout = 120000;
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  process.chdir(previousCwd);
  if (previousCredentialStore === undefined) delete process.env.ADE_CREDENTIAL_STORE_FILE;
  else process.env.ADE_CREDENTIAL_STORE_FILE = previousCredentialStore;
  if (previousPinHash === undefined) delete process.env.ADE_ADMIN_PIN_HASH;
  else process.env.ADE_ADMIN_PIN_HASH = previousPinHash;
  fs.rmSync(sandbox, { recursive: true, force: true });
});

test("GATE2 — a persisted PROCARTA trial grant is reloaded by a fresh entitlement authority", async () => {
  const store = memoryStore();
  const first = new AccessAdministration({ store });
  await first.grant({
    tenantScope,
    account: { id: accountId, username: accountId, role: "OPERATOR" },
    product: "PROCARTA",
    tier: "TRIAL",
    days: 7,
    actor: founder,
    reason: "Gate 2 durable entitlement proof"
  });

  const entitlement = new CommercialEntitlement({
    accessAdministration: new AccessAdministration({ store })
  });
  const beforeGrant = entitlement.check({ tenantScope, capability: "branches", usage: 3 });
  assert.equal(beforeGrant.allowed, false, "edition baseline still enforces the community branch limit");

  const resolved = await entitlement.resolveRuntimeTier({
    tenantScope,
    accountId,
    capability: "branches"
  });
  assert.equal(resolved.tier, "TRIAL");
  assert.equal(resolved.source, "ADMIN_ENTITLEMENT");
  assert.ok(resolved.grantId, "the runtime tier points at the persisted grant");

  const afterGrant = entitlement.check({
    tenantScope,
    capability: "branches",
    usage: 3,
    tier: resolved.tier
  });
  assert.equal(afterGrant.allowed, true);
  assert.equal(afterGrant.tier, "TRIAL");
});

test("GATE2 — admin grant changes real protected branch access, and revocation restores the gate", async () => {
  const token = operatorToken();

  const runtimeBefore = await fetch(`${baseUrl}/api/v1/account/runtime-entitlement`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(runtimeBefore.status, 200);
  const beforeBody = await runtimeBefore.json();
  assert.equal(beforeBody.products.PROCARTA.tier, "COMMUNITY");

  const org = await createUnit(token, { type: "ORGANIZATION", name: "Gate 2 Org" });
  assert.equal(org.res.status, 201);
  const branchOne = await createUnit(token, {
    type: "BRANCH",
    name: "Branch One",
    parentId: org.body.unit.unitId
  });
  assert.equal(branchOne.res.status, 201);
  const branchTwo = await createUnit(token, {
    type: "BRANCH",
    name: "Branch Two",
    parentId: org.body.unit.unitId
  });
  assert.equal(branchTwo.res.status, 201);

  const blocked = await createUnit(token, {
    type: "BRANCH",
    name: "Branch Three",
    parentId: org.body.unit.unitId
  });
  assert.equal(blocked.res.status, 403);
  assert.equal(blocked.body.error, "USAGE_LIMIT");

  const grant = await accessAdministration.grant({
    tenantScope,
    account: { id: accountId, username: accountId, role: "OPERATOR" },
    product: "PROCARTA",
    tier: "TRIAL",
    days: 7,
    actor: founder,
    reason: "Gate 2 protected runtime proof"
  });
  assert.equal(grant.tier, "TRIAL");

  const runtimeAfter = await fetch(`${baseUrl}/api/v1/account/runtime-entitlement`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(runtimeAfter.status, 200);
  const afterBody = await runtimeAfter.json();
  assert.equal(afterBody.products.PROCARTA.tier, "TRIAL");
  assert.equal(afterBody.products.PROCARTA.grantId, grant.id);

  const allowed = await createUnit(token, {
    type: "BRANCH",
    name: "Branch Three",
    parentId: org.body.unit.unitId
  });
  assert.equal(allowed.res.status, 201, "the persisted grant raises the real commercial branch gate");

  await accessAdministration.revoke({
    tenantScope,
    grantId: grant.id,
    actor: founder,
    reason: "Gate 2 revocation proof"
  });

  const blockedAgain = await createUnit(token, {
    type: "BRANCH",
    name: "Branch Four",
    parentId: org.body.unit.unitId
  });
  assert.equal(blockedAgain.res.status, 403);
  assert.equal(blockedAgain.body.error, "USAGE_LIMIT");
});
