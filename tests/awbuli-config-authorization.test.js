import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * AWBULI / WHATSAPP + PROVIDER/CHANNEL CONFIG AUTHORIZATION (Batch 4).
 *
 * Isolated full-app boot: CWD points at a fresh tmp dir BEFORE importing
 * src/app.js, so data/runtime-config/admin.json, data/audit_ledger.json and
 * all .ade_* stores start empty and the repo working tree is never dirtied.
 *
 * Pins the Batch 4 contract without weakening any existing assertion:
 * - AWBULI/WhatsApp + provider mutations require L2 + identity-bound
 *   six-digit PIN step-up (403 ELEVATED_PIN_REQUIRED otherwise).
 * - State actions (enable/suspend) additionally require an attributable
 *   workforce or legacy-ADMIN identity (403 INSUFFICIENT_AUTHORIZATION).
 * - Reads stay at their intended level; channel-configure keeps its pinned
 *   L2 contract (see tests/channel-config-baseurl.test.js) and gains a
 *   durable audit record.
 * - Every mutation is durably audited (actor/action/target/outcome/time)
 *   with no PIN, token, key or secret value anywhere in the ledger.
 * - Nothing here activates a provider: health.live stays false and the
 *   product-surface AWBULI row stays CONFIGURATION_REQUIRED.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-awbuli-auth-"));
process.chdir(tmpRoot);

const { app } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

let server = null;
let base = null;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const call = async (token, method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, body: await r.json().catch(() => ({})), text: await r.text().catch(() => "") };
};

const FOUNDER = { fullName: "Awbuli Auth Founder", username: "awbuliauth", password: "AwbuliPass!4", pin: "445566" };
const FAKE_NUMBER = "+15550001111";
const FAKE_NUMBER_2 = "+15550002222";
const APIKEY_PROBE = "sk-awbuli-probe-key-9f8e7d";
const SECRET_PROBE = "whsec-awbuli-probe-1a2b3c";

async function founderElevated() {
  if (!globalThis.__batch4Founder) {
    const boot = await call(null, "POST", "/api/v1/workforce/provision-founder", FOUNDER);
    assert.equal(boot.status, 201, "pristine tmp store provisions founder");
    const login = await call(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
    assert.equal(login.status, 200);
    const elev = await call(login.body.token, "POST", "/api/v1/account/pin", { pin: FOUNDER.pin });
    assert.equal(elev.status, 200);
    // Single-live-session: elevation revokes the pre-elevation base token.
    globalThis.__batch4Founder = { elevatedToken: elev.body.token, revokedBase: login.body.token };
  }
  const freshLogin = await call(null, "POST", "/api/v1/account/login", { username: FOUNDER.username, password: FOUNDER.password });
  assert.equal(freshLogin.status, 200, "fresh base login works after elevation");
  return { baseToken: freshLogin.body.token, elevatedToken: globalThis.__batch4Founder.elevatedToken, revokedBase: globalThis.__batch4Founder.revokedBase };
}

const bareL2 = () =>
  IdentityOnboarding.getInstance().issueSession({ subject: "batch4-bare", tier: "COMMUNITY", level: 2, persona: "OPERATOR" }).token;

const pinnedNonWorkforce = () =>
  IdentityOnboarding.getInstance().issueSession({ subject: "batch4-pinned", tier: "COMMUNITY", level: 2, persona: "OPERATOR", metadata: { pinVerified: true } }).token;

const auditLog = () =>
  JSON.parse(fs.readFileSync(path.join(tmpRoot, "data", "audit_ledger.json"), "utf8"));

test("awbuli-auth-1 — anonymous mutations are rejected (401), reads stay gated as before", async () => {
  assert.equal((await call(null, "POST", "/api/v1/admin/whatsapp-numbers", { number: FAKE_NUMBER })).status, 401);
  assert.equal((await call(null, "POST", "/api/v1/admin/providers", { providerId: "X" })).status, 401);
  assert.equal((await call(null, "POST", "/api/v1/connect/channels/configure", { channelId: "WHATSAPP" })).status, 401);
  // Reads keep their intended level: numbers list is L2, channel-states is L1 (session still required).
  assert.equal((await call(null, "GET", "/api/v1/admin/whatsapp-numbers")).status, 401);
  assert.equal((await call(null, "GET", "/api/v1/connect/channel-states")).status, 401);
});

test("awbuli-auth-2 — L2 without PIN step-up is denied 403 ELEVATED_PIN_REQUIRED on every mutation", async () => {
  const t = bareL2();
  for (const [method, url, body] of [
    ["POST", "/api/v1/admin/whatsapp-numbers", { number: FAKE_NUMBER }],
    ["PATCH", "/api/v1/admin/whatsapp-numbers/WA-NOPE", { label: "x" }],
    ["POST", "/api/v1/admin/whatsapp-numbers/WA-NOPE/verify", {}],
    ["POST", "/api/v1/admin/whatsapp-numbers/WA-NOPE/state", { to: "ENABLED", reason: "x" }],
    ["POST", "/api/v1/admin/providers", { providerId: "P", providerType: "WEB_API" }],
    ["POST", "/api/v1/admin/providers/P/configure", { baseUrl: "https://example.invalid" }],
    ["POST", "/api/v1/admin/providers/P/verify", {}],
    ["POST", "/api/v1/admin/providers/P/enable", { reason: "x" }],
    ["POST", "/api/v1/admin/providers/P/suspend", { reason: "x" }]
  ]) {
    const r = await call(t, method, url, body);
    assert.equal(r.status, 403, `${method} ${url} must deny bare L2`);
    assert.equal(r.body.error, "ELEVATED_PIN_REQUIRED", `${method} ${url} must name the step-up`);
  }
});

test("awbuli-auth-3 — base session denied, PIN-elevated permitted, read-back is truthful", async () => {
  const { baseToken, elevatedToken, revokedBase } = await founderElevated();
  const dead = await call(revokedBase, "POST", "/api/v1/admin/whatsapp-numbers", { number: FAKE_NUMBER });
  assert.equal(dead.status, 401, "pre-elevation base was revoked at step-up");
  const denied = await call(baseToken, "POST", "/api/v1/admin/whatsapp-numbers", { number: FAKE_NUMBER });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "ELEVATED_PIN_REQUIRED");
  const add = await call(elevatedToken, "POST", "/api/v1/admin/whatsapp-numbers", { number: FAKE_NUMBER, purpose: "BATCH4" });
  assert.equal(add.status, 201);
  assert.ok(add.body.number.id);
  assert.ok(String(add.body.number.masked).includes("…"), "masked form only");
  assert.ok(!("fingerprint" in add.body.number), "no fingerprint leaves the server");
  const listed = await call(elevatedToken, "GET", "/api/v1/admin/whatsapp-numbers");
  const row = listed.body.numbers.find((n) => n.id === add.body.number.id);
  assert.ok(row, "durable read-back finds the number");
  assert.ok(!("fingerprint" in row), "read-back carries no fingerprint");
  assert.ok(!JSON.stringify(row).includes("5550001111"), "full number never persisted readably");
  const ver = await call(elevatedToken, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/verify`, {});
  assert.equal(ver.body.number.state, "VERIFIED");
  assert.equal(ver.body.number.verification.live, false, "verification is metadata-only");
});

test("awbuli-auth-4 — action-specific: PIN'd non-workforce token registers but cannot change state; legacy ADMIN can", async () => {
  const { elevatedToken } = await founderElevated();
  const pinned = pinnedNonWorkforce();
  const add = await call(pinned, "POST", "/api/v1/admin/whatsapp-numbers", { number: FAKE_NUMBER_2 });
  assert.equal(add.status, 201, "metadata tier allows any PIN'd L2");
  const state = await call(pinned, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/state`, { to: "ENABLED", reason: "probe" });
  assert.equal(state.status, 403, "state tier denies non-workforce identity");
  assert.equal(state.body.error, "INSUFFICIENT_AUTHORIZATION");
  // Legacy ADMIN (PIN-proven at POST /api/v1/auth/pin issuance) keeps its
  // existing access. A pristine store has no admin credential lifecycle, so
  // no legacy session can be minted here — the guard matrix below pins the
  // branch deterministically instead (same condition as the canonical
  // workforce guards in src/routes/identityRoutes.js).
  const { HttpSecurityBoundary } = await import("../src/security/HttpSecurityBoundary.js");
  const runGuard = (identity, action = "register") =>
    new Promise((resolve) => {
      const req = { identity };
      const res = { status: (code) => ({ json: (body) => resolve({ code, body }) }) };
      new HttpSecurityBoundary({}).requireConfigAction(action)(req, res, () => resolve({ code: 200 }));
    });
  assert.equal((await runGuard(null)).code, 403, "no identity denied");
  assert.equal((await runGuard({ level: 2, persona: "OPERATOR" })).body.error, "ELEVATED_PIN_REQUIRED", "bare L2 denied");
  assert.equal((await runGuard({ level: 2, persona: "OPERATOR" })).body.error, "ELEVATED_PIN_REQUIRED", "bare L2 denied");
  assert.equal((await runGuard({ level: 2, persona: "WORKFORCE", pinVerified: false })).body.error, "ELEVATED_PIN_REQUIRED", "non-elevated workforce denied");
  assert.equal((await runGuard({ level: 3, persona: "WORKFORCE", pinVerified: true })).code, 200, "elevated founder metadata op allowed");
  assert.equal((await runGuard({ level: 2, persona: "WORKFORCE", metadata: { pinVerified: true } })).code, 200, "metadata-carried PIN accepted");
  assert.equal((await runGuard({ level: 2, persona: "ADMIN" })).code, 200, "legacy ADMIN metadata op preserved");
  assert.equal((await runGuard({ level: 2, persona: "OPERATOR", pinVerified: true }, "enable")).body.error, "INSUFFICIENT_AUTHORIZATION", "state op denies non-workforce");
  assert.equal((await runGuard({ level: 2, persona: "WORKFORCE", pinVerified: true }, "enable")).code, 200, "state op allows elevated workforce");
  assert.equal((await runGuard({ level: 2, persona: "ADMIN" }, "suspend")).code, 200, "legacy ADMIN state op preserved");
  assert.equal((await runGuard({ level: 1, persona: "WORKFORCE", pinVerified: true })).code, 200, "level floor stays with requireLevel (401/403 there)");
  // Elevated founder completes the state flow with validation enforced.
  const noReason = await call(elevatedToken, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/state`, { to: "SUSPENDED" });
  assert.equal(noReason.status, 400, "reason is mandatory");
  const susp = await call(elevatedToken, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/state`, { to: "SUSPENDED", reason: "batch4" });
  assert.equal(susp.body.number.state, "SUSPENDED");
  const dis = await call(elevatedToken, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/state`, { to: "DISABLED", reason: "batch4 teardown" });
  assert.equal(dis.body.number.state, "DISABLED", "soft-disable preserves history");
});

test("awbuli-auth-5 — enable requires verified state first (fail-closed validation)", async () => {
  const { elevatedToken } = await founderElevated();
  const add = await call(elevatedToken, "POST", "/api/v1/admin/whatsapp-numbers", { number: "+15550004444" });
  assert.equal(add.status, 201);
  const early = await call(elevatedToken, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/state`, { to: "ENABLED", reason: "too soon" });
  assert.equal(early.status, 400, "UNVERIFIED number cannot be enabled");
  await call(elevatedToken, "POST", `/api/v1/admin/whatsapp-numbers/${add.body.number.id}/state`, { to: "DISABLED", reason: "batch4 teardown" });
});

test("awbuli-auth-6 — channel-configure keeps its pinned L2 contract and is now durably audited without secrets", async () => {
  const t = bareL2();
  const res = await call(t, "POST", "/api/v1/connect/channels/configure", { channelId: "BATCH4_CHAN", apiKey: APIKEY_PROBE, secret: SECRET_PROBE, baseUrl: "https://provider.example.invalid/api" });
  assert.equal(res.status, 200, "existing L2 contract preserved");
  assert.ok(!JSON.stringify(res.body).includes(APIKEY_PROBE), "secret never echoed");
  assert.ok(!JSON.stringify(res.body).includes(SECRET_PROBE), "secret never echoed");
  const ch = await call(t, "PATCH", "/api/v1/admin/channels/BATCH4_CHAN", { enabled: true });
  assert.equal(ch.status, 200);
  const conn = await call(t, "POST", "/api/v1/admin/connections", { provider: "batch4-prov", baseUrl: "https://example.invalid", secret: SECRET_PROBE });
  assert.equal(conn.status, 201);
  assert.ok(!JSON.stringify(conn.body).includes(SECRET_PROBE), "secret never echoed");
  const entries = auditLog();
  const configured = entries.filter((e) => e.payload?.action === "CHANNEL_CONFIGURED");
  assert.ok(configured.length >= 1, "channel configure is durably audited");
  assert.equal(configured[configured.length - 1].payload.channelId, "BATCH4_CHAN");
  assert.ok(configured[configured.length - 1].payload.by, "actor recorded");
  assert.ok(entries.some((e) => e.payload?.action === "CHANNEL_UPDATED"), "channel update audited");
  assert.ok(entries.some((e) => e.payload?.action === "CONNECTION_UPSERTED"), "connection upsert audited");
  const raw = fs.readFileSync(path.join(tmpRoot, "data", "audit_ledger.json"), "utf8");
  assert.ok(!raw.includes(APIKEY_PROBE), "api key never in audit ledger");
  assert.ok(!raw.includes(SECRET_PROBE), "secret never in audit ledger");
});

test("awbuli-auth-7 — provider mutations need PIN; elevated flow works; nothing goes live", async () => {
  const { elevatedToken } = await founderElevated();
  const reg = await call(elevatedToken, "POST", "/api/v1/admin/providers", { providerId: "BATCH4_PROBE", providerType: "WEB_API", credentialRequirements: ["BATCH4_KEY"] });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.provider.state, "NOT_CONFIGURED");
  const conf = await call(elevatedToken, "POST", "/api/v1/admin/providers/BATCH4_PROBE/configure", { baseUrl: "https://provider.example.invalid/api" });
  assert.equal(conf.body.provider.state, "CONFIGURED");
  const ver = await call(elevatedToken, "POST", "/api/v1/admin/providers/BATCH4_PROBE/verify", {});
  assert.ok(["VERIFIED", "VERIFICATION_FAILED"].includes(ver.body.provider.state));
  assert.equal(ver.body.provider.health.live, false, "verification never claims live");
  const surface = await fetch(`${base}/api/v1/product-surface`).then((r) => r.json());
  assert.equal(surface.surfaces.find((s) => s.id === "awbuli").status, "CONFIGURATION_REQUIRED", "suite untouched by config tests");
});

test("awbuli-auth-8 — audit ledger carries actor/action/target/outcome/time and no sensitive values", async () => {
  const entries = auditLog();
  const added = entries.filter((e) => e.payload?.action === "NUMBER_ADDED");
  assert.ok(added.length >= 1, "number registration audited");
  const last = added[added.length - 1];
  assert.ok(last.timestamp, "timestamp present");
  assert.ok(last.payload.id, "target present");
  assert.ok(String(last.payload.masked || "").includes("…"), "masked identifier only");
  const raw = fs.readFileSync(path.join(tmpRoot, "data", "audit_ledger.json"), "utf8");
  assert.ok(!raw.includes(FOUNDER.pin), "PIN never in audit ledger");
  assert.ok(!raw.includes(APIKEY_PROBE), "api key never in audit ledger");
  assert.ok(!raw.includes(SECRET_PROBE), "secret never in audit ledger");
  assert.ok(!raw.includes("5550001111"), "full sender number never in audit ledger");
});
