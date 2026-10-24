import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const originalCwd = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-awbuli-public-"));
process.chdir(tmpRoot);

const { app, kernelReady } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const adminToken = () =>
  IdentityOnboarding.getInstance().issueSession({
    subject: "awbuli-public-admin",
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR",
    metadata: { pinVerified: true }
  }).token;

const call = async (method, url, body, token) => {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

test("awbuli public entry: unconfigured is truthful and has no number", async () => {
  const publicEntry = await call("GET", "/api/v1/awbuli/entry");
  assert.equal(publicEntry.status, 200);
  assert.equal(publicEntry.body.entry.configured, false);
  assert.equal(publicEntry.body.entry.number, null);
  assert.equal(publicEntry.body.entry.live, false);
  assert.equal(publicEntry.body.entry.source, null);
  assert.equal(publicEntry.body.entry.approvalState, "NOT_PUBLISHED");
});

test("awbuli public entry: explicit Admin approval publishes a usable public line without claiming live", async () => {
  const token = adminToken();
  const invalid = await call("POST", "/api/v1/admin/awbuli/public-entry", { number: "12" }, token);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "AWBULI_PUBLIC_NUMBER_INVALID");

  const published = await call("POST", "/api/v1/admin/awbuli/public-entry", { number: "+234 703 827 2792" }, token);
  assert.equal(published.status, 200);
  assert.equal(published.body.entry.number, "+2347038272792");
  assert.equal(published.body.entry.source, "ADMIN_SETTINGS");
  assert.equal(published.body.entry.approvalState, "ADMIN_APPROVED");
  assert.equal(published.body.entry.live, false);

  const publicEntry = await call("GET", "/api/v1/awbuli/entry");
  assert.equal(publicEntry.status, 200);
  assert.equal(publicEntry.body.entry.number, "+2347038272792");
  assert.equal(publicEntry.body.entry.display, "+2347038272792");
  assert.equal(publicEntry.body.entry.configured, true);
  assert.equal(publicEntry.body.entry.source, "ADMIN_SETTINGS");
  assert.equal(publicEntry.body.entry.live, false);

  const adminEntry = await call("GET", "/api/v1/admin/awbuli/public-entry", null, token);
  assert.equal(adminEntry.status, 200);
  assert.equal(adminEntry.body.entry.approvedBy, "awbuli-public-admin");
  assert.ok(adminEntry.body.entry.approvedAt);
});

test("awbuli public entry: unpublish removes the public link and preserves the registry masks", async () => {
  const token = adminToken();
  const removed = await call("DELETE", "/api/v1/admin/awbuli/public-entry", null, token);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.entry.configured, false);
  assert.equal(removed.body.entry.number, null);
  assert.equal(removed.body.entry.approvalState, "NOT_PUBLISHED");

  const publicEntry = await call("GET", "/api/v1/awbuli/entry");
  assert.equal(publicEntry.body.entry.number, null);
  assert.equal(publicEntry.body.entry.live, false);
});
