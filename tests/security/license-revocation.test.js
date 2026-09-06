import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import CommunityEditionGuard from "../../src/security/CommunityEditionGuard.js";

/**
 * G30 — ENTERPRISE LICENSE LIFECYCLE: revocation closure.
 *
 * generateLicenseKey / verifyLicenseKey already exist (signature + expiry).
 * Revocation was genuinely missing. Tests prove: a validly-issued license
 * verifies; after revoke it verifies as revoked; malformed / already-invalid
 * keys cannot be revoked; the RBAC guard surface remains intact.
 */

const __root = path.resolve(import.meta.dirname, "../..");
const CREDENTIAL_FILE = path.join(__root, "data", "admin-credential.json");

const authBootstrap = !fs.existsSync(CREDENTIAL_FILE) && !process.env.ADE_ADMIN_PIN_HASH;
if (authBootstrap) {
  process.env.ADE_ADMIN_PIN_HASH = process.env.ADE_ADMIN_PIN_HASH || "REGENERATE_AFTER_TEST";
}

let guard = null;

before(async () => {
  guard = CommunityEditionGuard.getInstance();
});

after(async () => {
  if (authBootstrap) {
    delete process.env.ADE_ADMIN_PIN_HASH;
    fs.rmSync(CREDENTIAL_FILE, { force: true });
  }
});

test("G30 — a validly-issued enterprise license verifies before revocation", () => {
  const key = guard.generateLicenseKey("ENTERPRISE", 86400000, "TEST-ISSUER");
  const result = guard.verifyLicenseKey(key);
  assert.equal(result.valid, true);
  assert.equal(result.tier, "ENTERPRISE");
  assert.equal(result.issuer, "TEST-ISSUER");
});

test("G30 — revocation invalidates a previously valid license", () => {
  const key = guard.generateLicenseKey("COMMUNITY", 86400000, "TEST-ISSUER");
  assert.equal(guard.verifyLicenseKey(key).valid, true);

  const revoke = guard.revokeLicenseKey(key);
  assert.equal(revoke.revoked, true);

  assert.equal(guard.isLicenseRevoked(key), true);
  const after = guard.verifyLicenseKey(key);
  assert.equal(after.valid, false, "revoked license no longer verifies");
  assert.equal(after.reason, "License key has been revoked.");

  const again = guard.revokeLicenseKey(key);
  assert.equal(again.revoked, false, "a revoked key cannot be revoked a second time");
});

test("G30 — malformed or already-invalid keys are never accepted for revocation", () => {
  assert.equal(guard.revokeLicenseKey("not-a-key").revoked, false);
  assert.equal(guard.revokeLicenseKey("").revoked, false);
  assert.equal(guard.revokeLicenseKey(null).revoked, false);
});

test("G30 — revocation does not disturb the RBAC guard surface", () => {
  assert.equal(guard.assertCapabilityAllowed("PROCARTA_EXECUTE", 1), true);
  assert.throws(
    () => guard.assertCapabilityAllowed("MULTI_STREAM", 1),
    /denied for RBAC Level 1/
  );
});