import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { app, kernelReady } from "../src/app.js";
import { CaseManager } from "../src/intelligence/CaseManager.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";

/**
 * Case continuity — canonical case-to-account linkage.
 *
 * Rule Zero: no new authority, no new route, no POST /api/cases/claim.
 * The canonical mechanism is CaseManager.attachCaseToAccount(), invoked
 * through the EXISTING PATCH /api/v1/cases/:id route with
 * {attachToAccount:true}. The account is derived server-side from the
 * verified session; client-supplied accountIds are ignored.
 */

const __root = path.resolve(import.meta.dirname, "..");
const CREDENTIAL_FILE = path.join(__root, "data", "admin-credential.json");
const authBootstrap =
  !fs.existsSync(CREDENTIAL_FILE) && !process.env.ADE_ADMIN_PIN_HASH;
if (authBootstrap) {
  process.env.ADE_ADMIN_PIN_HASH = process.env.ADE_ADMIN_PIN_HASH || "REGENERATE_AFTER_TEST";
}

let server = null;
let baseUrl = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (authBootstrap) {
    delete process.env.ADE_ADMIN_PIN_HASH;
    fs.rmSync(CREDENTIAL_FILE, { force: true });
  }
});

function spyStore() {
  return {
    sections: {},
    writeSection(name, value) { this.sections[name] = value; return value; },
    readSection(name) { return this.sections[name]; }
  };
}

const adminToken = () =>
  IdentityOnboarding.getInstance().issueSession({
    subject: "admin",
    tier: "COMMUNITY",
    level: 2,
    persona: "ADMIN"
  }).token;

// --- unit: attachCaseToAccount on the canonical authority ---

test("attachCaseToAccount binds accountId with an audit trail and leaves status untouched", () => {
  const cm = new CaseManager({ store: spyStore() });
  const c = cm.createCase({ source: "TEST", channel: "API", request: { intent: "PROBE" } });
  assert.equal(c.accountId, undefined);
  const next = cm.attachCaseToAccount(c.id, "acct-1", { actor: "tester" });
  assert.equal(next.accountId, "acct-1");
  assert.equal(next.status, c.status);
  const last = next.history[next.history.length - 1];
  assert.equal(last.reason, "CASE_ATTACHED_TO_ACCOUNT");
  assert.equal(last.actor, "tester");
});

test("attachCaseToAccount is idempotent for the owning account", () => {
  const cm = new CaseManager({ store: spyStore() });
  const c = cm.createCase({ source: "TEST" });
  cm.attachCaseToAccount(c.id, "acct-1", {});
  const again = cm.attachCaseToAccount(c.id, "acct-1", {});
  assert.equal(again.accountId, "acct-1");
  assert.equal(again.history.filter((h) => h.reason === "CASE_ATTACHED_TO_ACCOUNT").length, 1);
});

test("attachCaseToAccount refuses to steal a case attached elsewhere", () => {
  const cm = new CaseManager({ store: spyStore() });
  const c = cm.createCase({ source: "TEST" });
  cm.attachCaseToAccount(c.id, "acct-1", {});
  assert.throws(() => cm.attachCaseToAccount(c.id, "acct-2", {}), /CASE_ALREADY_ATTACHED/);
});

test("attachCaseToAccount rejects unknown cases and missing ids", () => {
  const cm = new CaseManager({ store: spyStore() });
  assert.throws(() => cm.attachCaseToAccount("CASE-NOPE", "acct-1", {}), /CASE_NOT_FOUND/);
  assert.throws(() => cm.attachCaseToAccount("", "acct-1", {}), /CASE_ID_REQUIRED/);
  assert.throws(() => cm.attachCaseToAccount("CASE-X", "", {}), /ACCOUNT_ID_REQUIRED/);
});

// --- http: existing PATCH route carries the claim, no /claim route exists ---

test("POST /api/cases/claim does not exist", async () => {
  const res = await fetch(`${baseUrl}/api/cases/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
    body: JSON.stringify({ caseId: "CASE-X" })
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "API_ENDPOINT_NOT_FOUND");
});

test("PATCH /api/v1/cases/:id {attachToAccount:true} attaches the session account end-to-end", async () => {
  const intake = await fetch(`${baseUrl}/api/v1/intake/WEB`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "IMPLEMENTATION_NEED", organization: "Attach Probe Ltd", description: "claim flow probe" })
  });
  assert.equal(intake.status, 201);
  const created = await intake.json();
  const caseId = created.case.id;
  assert.match(caseId, /^CASE-/);

  const token = adminToken();
  const attach = await fetch(`${baseUrl}/api/v1/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ attachToAccount: true })
  });
  assert.equal(attach.status, 200);
  const attached = await attach.json();
  assert.equal(attached.success, true);
  assert.equal(attached.attached, true);
  assert.equal(attached.case.accountId, "admin");

  const read = await fetch(`${baseUrl}/api/v1/cases/${encodeURIComponent(caseId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).case.accountId, "admin");
});

test("attach ignores client-supplied accountId and requires auth", async () => {
  const intake = await fetch(`${baseUrl}/api/v1/intake/WEB`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "IMPLEMENTATION_NEED", organization: "Spoof Probe Ltd", description: "spoof probe" })
  });
  const caseId = (await intake.json()).case.id;

  const spoof = await fetch(`${baseUrl}/api/v1/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
    body: JSON.stringify({ attachToAccount: true, accountId: "mallory" })
  });
  assert.equal(spoof.status, 200);
  assert.equal((await spoof.json()).case.accountId, "admin");

  const anon = await fetch(`${baseUrl}/api/v1/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachToAccount: true })
  });
  assert.equal(anon.status, 401);
});
