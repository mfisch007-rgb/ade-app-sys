import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { app, kernelReady } from "../../src/app.js";
import IdentityOnboarding from "../../src/kernel/IdentityOnboarding.js";

/**
 * G28 — PARTNER ECOSYSTEM (public catalog surface).
 *
 * The canonical partner machinery already exists (PartnerRegistry, admin
 * partner routes, PARTNER_REGISTRATION entitlement, PARTNER_RECOMMENDED case
 * status, partner-match events). What was missing is a truthful public surface.
 * Tests prove: the catalog is authenticated, exposes no sensitive fields
 * (contact/priority), reports SIMULATED availability until a real external
 * integration is validated, and honors the PARTNER_REGISTRATION entitlement.
 */

const __root = path.resolve(import.meta.dirname, "../..");
const CREDENTIAL_FILE = path.join(__root, "data", "admin-credential.json");

const authBootstrap = !fs.existsSync(CREDENTIAL_FILE) && !process.env.ADE_ADMIN_PIN_HASH;
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

const issueOperatorToken = (level = 1) =>
  IdentityOnboarding.getInstance().issueSession({
    subject: `g28-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tier: "COMMUNITY",
    level,
    persona: "OPERATOR"
  }).token;

test("G28 — public partner catalog requires authentication", async () => {
  const res = await fetch(`${baseUrl}/api/v1/partners`);
  assert.equal(res.status, 401);
});

test("G28 — registered partners are listed truthfully: SIMULATED availability, no sensitive fields", async () => {
  const token2 = issueOperatorToken(2);

  const register = await fetch(`${baseUrl}/api/v1/admin/partners`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      id: "A2MPRO",
      name: "A2MPro Integrations",
      status: "EVALUATION",
      capabilities: ["PROCUREMENT", "MARKETPLACE"],
      contact: { email: "secret-billing@a2m.example", phone: "+256-000-000019" },
      priority: "LOW"
    })
  });
  assert.ok([200, 201].includes(register.status), "admin partner register works");

  const catalog = await fetch(`${baseUrl}/api/v1/partners`, {
    headers: { Authorization: `Bearer ${issueOperatorToken(1)}` }
  });
  assert.equal(catalog.status, 200);
  const body = await catalog.json();
  assert.equal(body.success, true);
  assert.equal(body.catalogAvailable, true, "PARTNER_REGISTRATION is entitled in COMMUNITY");

  const entry = body.partners.find((p) => p.id === "A2MPRO");
  assert.ok(entry, "registered partner is visible in the public catalog");
  assert.equal(entry.name, "A2MPro Integrations");
  assert.equal(entry.status, "EVALUATION");
  assert.deepEqual(entry.capabilities, ["PROCUREMENT", "MARKETPLACE"]);
  assert.equal(entry.availability, "SIMULATED", "unvalidated partners report SIMULATED, never LIVE");

  const raw = JSON.stringify(entry);
  assert.ok(!raw.includes("a2m.example"), "contact fields are never exposed publicly");
  assert.ok(!raw.includes("priority"), "internal priority is not exposed publicly");
});

test("G28 — availability never claims LIVE without an explicit validated status", async () => {
  const token1 = issueOperatorToken(1);
  const catalog = await fetch(`${baseUrl}/api/v1/partners`, {
    headers: { Authorization: `Bearer ${token1}` }
  });
  const body = await catalog.json();
  for (const partner of body.partners) {
    const isLive = partner.availability === "LIVE";
    if (isLive) {
      assert.equal(partner.status, "ACTIVE", "LIVE availability requires an explicitly ACTIVE status");
    }
  }
});