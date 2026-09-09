import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import CredentialLifecycleStore from "../../src/security/CredentialLifecycleStore.js";

function storePath() {
  return path.join(
    fs.mkdtempSync(
      path.join(os.tmpdir(), "ade-g18-14-")
    ),
    "credential.json"
  );
}

test("existing PIN hash can initialize without recovery", async () => {
  const store = new CredentialLifecycleStore(storePath());
  const pinHash = await bcrypt.hash("246813", 12);

  const result =
    await store.initialize(pinHash, null);

  assert.equal(result.credentialVersion, 1);
  assert.equal(
    await store.verifyPin("246813"),
    true
  );
});

test("PIN rotation increments credential version", async () => {
  const store = new CredentialLifecycleStore(storePath());
  const pinHash = await bcrypt.hash("246813", 12);

  await store.initialize(pinHash, null);

  const result =
    await store.rotatePin("135790");

  assert.equal(result.credentialVersion, 2);
  assert.equal(
    await store.verifyPin("246813"),
    false
  );
  assert.equal(
    await store.verifyPin("135790"),
    true
  );
});

test("recovery is explicitly unavailable when unconfigured", async () => {
  const store = new CredentialLifecycleStore(storePath());
  const pinHash = await bcrypt.hash("246813", 12);

  await store.initialize(pinHash, null);

  await assert.rejects(
    () =>
      store.recoverPin(
        "ANY-RECOVERY-KEY",
        "975310"
      ),
    /RECOVERY_NOT_CONFIGURED/
  );
});
