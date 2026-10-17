import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// This file runs in its own node:test process. Delete ambient overrides
// BEFORE importing modules whose defaults are captured at import time.
for (const k of [
  "ADE_CREDENTIAL_STORE_FILE",
  "ADE_DEMO_MODE",
  "ADE_EDITION",
  "ADE_RUNTIME_MODE",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_KEY",
  "SUPABASE_STORAGE_TABLE",
]) delete process.env[k];

const { default: CredentialLifecycleStore } = await import(
  "../src/security/CredentialLifecycleStore.js"
);
const { SupabaseStorageAdapter } = await import(
  "../src/storage/SupabaseStorageAdapter.js"
);
const { isDemoModeActive } = await import("../lib/core/demoGuard.js");
const { EditionPolicy } = await import("../src/core/EditionPolicy.js");
const { SecurityGate } = await import("../src/security/SecurityGate.js");
const { ResendEmailConnector } = await import(
  "../src/notification/ResendEmailConnector.js"
);

function snapshotEnv(keys) {
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  return prev;
}
function restoreEnv(prev) {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
const SUPA_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_KEY",
  "SUPABASE_STORAGE_TABLE",
];

// --- Fix 1: credential-store default path --------------------------------
test("contract: code default credential-store path is data/admin-credential.json and docs agree", () => {
  const store = new CredentialLifecycleStore(undefined, null);
  assert.ok(
    store.filePath.endsWith(path.join("data", "admin-credential.json")),
    `unexpected default store path: ${store.filePath}`
  );
  const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /ADE_CREDENTIAL_STORE_FILE=data\/admin-credential\.json/);
  assert.doesNotMatch(example, /\.ade_credential_lifecycle\.json/);
});

// --- Fix 2: Supabase key alias precedence ---------------------------------
test("contract: SUPABASE_SECRET_KEY wins over SERVICE_ROLE over STORAGE_KEY", () => {
  const prev = snapshotEnv(SUPA_KEYS);
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_STORAGE_TABLE = "ade_kv_store";
    process.env.SUPABASE_SECRET_KEY = "secret-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.SUPABASE_STORAGE_KEY = "legacy-key";
    assert.equal(new SupabaseStorageAdapter().config.key, "secret-key");
    delete process.env.SUPABASE_SECRET_KEY;
    assert.equal(new SupabaseStorageAdapter().config.key, "service-key");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(new SupabaseStorageAdapter().config.key, "legacy-key");
  } finally {
    restoreEnv(prev);
  }
});

test("contract: missing Supabase key fails closed naming SECRET_KEY without leaking values", () => {
  const prev = snapshotEnv(SUPA_KEYS);
  try {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_STORAGE_KEY;
    delete process.env.SUPABASE_STORAGE_TABLE;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const a = new SupabaseStorageAdapter();
    assert.equal(a.isConfigured(), false);
    const msg = a.configurationError().message;
    assert.match(msg, /STORAGE_NOT_CONFIGURED/);
    assert.match(msg, /SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(msg, /eyJ|sb_secret_|sk-live|Bearer /i);
  } finally {
    restoreEnv(prev);
  }
});

test("contract: legacy supabaseClient mirrors the canonical key precedence and stays non-canonical", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src", "config", "supabaseClient.js"),
    "utf8"
  );
  assert.match(src, /SUPABASE_SECRET_KEY/);
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(src, /NON-CANONICAL/);
  const appSrc = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");
  assert.doesNotMatch(appSrc, /config\/supabaseClient/);
});

// --- Fix 3: unified ADE_DEMO_MODE parsing ---------------------------------
test("contract: ADE_DEMO_MODE is case-insensitive 'true'-only across JS and TS", async () => {
  const prev = snapshotEnv(["ADE_DEMO_MODE"]);
  try {
    process.env.ADE_DEMO_MODE = "TRUE";
    assert.equal(isDemoModeActive(), true);
    process.env.ADE_DEMO_MODE = "True";
    assert.equal(isDemoModeActive(), true);
    for (const v of ["false", "1", "yes", "", "truthy"]) {
      process.env.ADE_DEMO_MODE = v;
      assert.equal(isDemoModeActive(), false, `value ${JSON.stringify(v)}`);
    }
    delete process.env.ADE_DEMO_MODE;
    assert.equal(isDemoModeActive(), false);
  } finally {
    restoreEnv(prev);
  }
  const tsSrc = fs.readFileSync(
    path.join(ROOT, "lib", "core", "demoGuard.ts"),
    "utf8"
  );
  assert.match(tsSrc, /toLowerCase\(\)/);
  assert.match(tsSrc, /=== 'true'/);
});

// --- Fix 4: runtime mode / edition precedence ------------------------------
test("contract: edition precedence is explicit > ADE_EDITION > ADE_RUNTIME_MODE > COMMUNITY", () => {
  const prev = snapshotEnv(["ADE_EDITION", "ADE_RUNTIME_MODE"]);
  try {
    delete process.env.ADE_EDITION;
    delete process.env.ADE_RUNTIME_MODE;
    assert.equal(new EditionPolicy().getEdition(), "COMMUNITY");
    process.env.ADE_RUNTIME_MODE = "PILOT";
    assert.equal(new EditionPolicy().getEdition(), "PILOT");
    process.env.ADE_EDITION = "ENTERPRISE";
    assert.equal(new EditionPolicy().getEdition(), "ENTERPRISE");
    assert.equal(
      new EditionPolicy("SYSTEM").getEdition(),
      "SYSTEM",
      "explicit arg wins"
    );
  } finally {
    restoreEnv(prev);
  }
});

test("contract: FULL aliases to COMMUNITY and unknown editions fall back to COMMUNITY", () => {
  const prev = snapshotEnv(["ADE_EDITION", "ADE_RUNTIME_MODE"]);
  try {
    delete process.env.ADE_EDITION;
    process.env.ADE_RUNTIME_MODE = "FULL";
    assert.equal(new EditionPolicy().getEdition(), "COMMUNITY");
    process.env.ADE_RUNTIME_MODE = "full";
    assert.equal(new EditionPolicy().getEdition(), "COMMUNITY");
    process.env.ADE_RUNTIME_MODE = "BOGUS_EDITION";
    assert.equal(new EditionPolicy().getEdition(), "COMMUNITY");
  } finally {
    restoreEnv(prev);
  }
});

test("contract: boot layer strictly validates ADE_RUNTIME_MODE values", () => {
  const appSrc = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");
  for (const v of [
    '"FULL"',
    '"COMMUNITY"',
    '"PILOT"',
    '"PROFESSIONAL"',
    '"ENTERPRISE"',
    '"SYSTEM"',
    '"DEMO"',
  ]) {
    assert.ok(appSrc.includes(v), `contract missing ${v}`);
  }
  assert.match(appSrc, /Invalid ADE_RUNTIME_MODE/);
});

// --- Fix 5: legacy paths fail closed --------------------------------------
test("contract: legacy SecurityGate fails closed without a secret", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const secret = `test-secret-${Date.now()}`;
  const token = jwt.sign({ authLevel: 3 }, secret, { expiresIn: "1h" });
  const open = new SecurityGate(secret);
  assert.ok(open.verifyToken(token));
  const closed = new SecurityGate(null);
  assert.equal(closed.verifyToken(token), null);
  assert.equal(closed.verifyToken(""), null);
  const denied = await new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status(code) {
        resolve(code);
        return { json() {} };
      },
    };
    closed.enforceLevel(1)(req, res, () => resolve("next"));
  });
  assert.equal(denied, 403);
});

test("contract: no hardcoded fallback secrets remain in legacy paths and admin router stays unmounted", () => {
  const gateSrc = fs.readFileSync(
    path.join(ROOT, "src", "security", "SecurityGate.js"),
    "utf8"
  );
  assert.doesNotMatch(gateSrc, /ade_apex_jwt_secret_key_2026/);
  const adminSrc = fs.readFileSync(
    path.join(ROOT, "src", "routes", "admin.js"),
    "utf8"
  );
  assert.doesNotMatch(adminSrc, /ADE_PIN_2026/);
  assert.match(adminSrc, /NOT mounted/);
  const appSrc = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");
  assert.doesNotMatch(appSrc, /routes\/admin/);
});

// --- Fix 7: Resend boundaries (no live send) -------------------------------
test("contract: Resend connector stays server-side honest without network", async () => {
  const c = new ResendEmailConnector({ apiKey: null });
  assert.equal(c.isConfigured(), false);
  await assert.rejects(
    () => c.send({ to: "a@b.co", subject: "x", text: "y" }),
    /EMAIL_NOT_CONFIGURED/
  );
  let called = false;
  const spy = async () => {
    called = true;
    return { ok: true, json: async () => ({}) };
  };
  const c2 = new ResendEmailConnector({ apiKey: "test-key", fetchImpl: spy });
  await assert.rejects(
    () =>
      c2.send({ to: "a@b.co", subject: "x", text: "y", from: "x@gmail.com" }),
    /EMAIL_SENDER_NOT_VERIFIED/
  );
  assert.equal(called, false);
});
