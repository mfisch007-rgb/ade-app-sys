import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ade-gate7-"));
const previousCwd = process.cwd();
const previousCredentialStore = process.env.ADE_CREDENTIAL_STORE_FILE;
const previousPinHash = process.env.ADE_ADMIN_PIN_HASH;
process.chdir(sandbox);
process.env.ADE_CREDENTIAL_STORE_FILE = path.join(sandbox, "admin-credential.json");
delete process.env.ADE_ADMIN_PIN_HASH;

const { app, kernelReady } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

const stamp = Date.now();
const tenantA = `gate7-tenant-a-${stamp}`;
const tenantB = `gate7-tenant-b-${stamp}`;
const capabilityKey = `GATE7_${stamp}`;

let server = null;
let baseUrl = null;

function tokenFor(tenantId) {
  return IdentityOnboarding.getInstance().issueSession({
    subject: `gate7-operator-${tenantId}`,
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR",
    metadata: { tenantId }
  }).token;
}

async function request(method, url, body, token) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createOrganization(token, name) {
  return request("POST", "/api/v1/org/units", { type: "ORGANIZATION", name }, token);
}

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
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

test("GATE7 — authenticated tenant overrides query and body tenant hints on protected routes", async () => {
  const tokenA = tokenFor(tenantA);
  const tokenB = tokenFor(tenantB);
  const nameA = `Tenant A Org ${stamp}`;
  const nameB = `Tenant B Org ${stamp}`;

  const createdA = await createOrganization(tokenA, nameA);
  assert.equal(createdA.status, 201);
  assert.equal(createdA.body.unit.tenantScope, tenantA);

  const createdB = await createOrganization(tokenB, nameB);
  assert.equal(createdB.status, 201);
  assert.equal(createdB.body.unit.tenantScope, tenantB);

  const defaultList = await request("GET", "/api/v1/org/units", null, tokenA);
  assert.equal(defaultList.status, 200);
  assert.ok(defaultList.body.units.some((unit) => unit.name === nameA));
  assert.equal(defaultList.body.units.some((unit) => unit.name === nameB), false, "no implicit global tenant read");

  const spoofedList = await request(
    "GET",
    `/api/v1/org/units?tenant=${encodeURIComponent(tenantB)}`,
    null,
    tokenA
  );
  assert.equal(spoofedList.status, 200);
  assert.ok(spoofedList.body.units.some((unit) => unit.name === nameA));
  assert.equal(spoofedList.body.units.some((unit) => unit.name === nameB), false, "query tenant cannot cross the authenticated boundary");

  const situation = `Gate 7 body-spoof proof ${stamp}`;
  const recorded = await request("POST", "/api/v1/experience", {
    situation,
    action: "Attempted cross-tenant write",
    result: "Stored under the authenticated tenant",
    outcome: "CONTAINED",
    lesson: "Caller-supplied tenant fields never override the session tenant",
    confidence: 0.9,
    capabilityKey,
    tenantScope: tenantB,
    tenant: tenantB,
    tenantId: tenantB
  }, tokenA);
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.experience.tenantScope, tenantA);

  const crossTenantRead = await request(
    "GET",
    `/api/v1/experience?tenant=${encodeURIComponent(tenantB)}&capability=${capabilityKey}`,
    null,
    tokenB
  );
  assert.equal(crossTenantRead.status, 200);
  assert.equal(crossTenantRead.body.experience.some((row) => row.situation === situation), false);

  const ownerRead = await request(
    "GET",
    `/api/v1/experience?tenant=${encodeURIComponent(tenantA)}&capability=${capabilityKey}`,
    null,
    tokenA
  );
  assert.equal(ownerRead.status, 200);
  assert.ok(ownerRead.body.experience.some((row) => row.situation === situation));
});
