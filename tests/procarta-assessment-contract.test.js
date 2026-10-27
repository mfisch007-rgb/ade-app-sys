import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-procarta-assessment-"));
process.chdir(tmpRoot);
const { default: app } = await import("../src/app.js");

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

test("PROCARTA-ASSESSMENT-1: public assessment persists contact context and executes the canonical engine", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const email = "assessment-owner@example.test";
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/procarta/assessment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantScope: "caller-supplied-tenant",
      companyName: "Assessment Contract Co",
      organization: "Assessment Contract Co",
      industry: "Logistics",
      staffCount: "Small (21-100)",
      processes: "Manual order intake and approvals",
      contactEmail: email,
      email,
      quoteTotal: 150000,
      officers: [{ name: "Ada", role: "COO" }],
      consent: { accepted: true, at: new Date().toISOString(), termsVersion: "TEST" },
      signatureConfirmed: true
    })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.match(body.caseId, /^CASE-/);
  assert.equal(body.evidence.tenantScope, "default");
  assert.equal(body.contactPersisted, true);
  assert.equal(body.procartaError, null);
  assert.equal(body.procarta.executionMode, "LIVE");
  assert.equal(body.procarta.caseId, body.caseId);
  assert.equal(body.procarta.stored, true);
  assert.equal(body.procarta.audited, true);
  const persisted = filesUnder(tmpRoot).some((file) => {
    try { return fs.readFileSync(file, "utf8").includes(email); } catch { return false; }
  });
  assert.equal(persisted, true);
  const preview = await fetch(`http://127.0.0.1:${port}/api/v1/procarta/dossier/preview?caseId=${encodeURIComponent(body.caseId)}`);
  assert.equal(preview.status, 401);
});

test("PROCARTA-ASSESSMENT-3: duplicate identity is contact-scoped and companyName is accepted", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const base = {
    companyName: "Contact Scope Co",
    industry: "Logistics",
    processes: "Manual order intake and approvals"
  };
  async function submit(email) {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/procarta/assessment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, email })
    });
    return { status: response.status, body: await response.json() };
  }
  const first = await submit("first-owner@example.test");
  const second = await submit("second-owner@example.test");
  const repeat = await submit("first-owner@example.test");
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.evidence.organization, "Contact Scope Co");
  assert.notEqual(first.body.caseId, second.body.caseId);
  assert.equal(repeat.body.caseId, first.body.caseId);
});

test("PROCARTA-ASSESSMENT-2: onboarding and browser mirror do not claim verified payment or measured outcomes", () => {
  for (const relative of ["src/components/AdeProcarterContainer.jsx", "public/js/AdeProcarterContainer.jsx"]) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /amountKobo/);
    assert.match(source, /companyEmail/);
    assert.match(source, /PAYMENT_REQUEST_PREPARED/);
    assert.match(source, /payments\/availability/);
    assert.match(source, /paymentAvailable/);
    assert.doesNotMatch(source, /PAYMENT_CHECKOUT_INITIALIZED/);
    assert.doesNotMatch(source, /PAYMENT_RECEIVED/);
    assert.doesNotMatch(source, /AUTHORIZE PAYMENT OF/);
    assert.doesNotMatch(source, /SECURE PAYMENT GATEWAY/);
    assert.doesNotMatch(source, /38%/);
    assert.doesNotMatch(source, /GENERATE AI PROCESS MAPS/);
  }
});
