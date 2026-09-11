import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Production-ephemeral fail-safe gate. VERCEL=1 with no Supabase vars must be
// set BEFORE importing the app so the module-level readiness resolves ephemeral.
process.env.VERCEL = process.env.VERCEL || "1";
delete process.env.ADE_STORAGE_PROVIDER;

const { app, kernelReady } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

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
});

const opToken = () =>
  IdentityOnboarding.getInstance().issueSession({
    subject: "prod-safety-op",
    tier: "COMMUNITY",
    level: 2,
    persona: "OPERATOR"
  }).token;

const post = (url, body, token) =>
  fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });

const get = (url, token) =>
  fetch(`${baseUrl}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

test("production-ephemeral: reads and auth stay operational", async () => {
  assert.equal((await get("/api/v1/health")).status, 200);
  assert.equal((await get("/api/v1/runtime")).status, 200);
  assert.equal((await get("/api/v1/community/progression")).status, 200);
  const token = opToken();
  assert.equal((await get("/api/v1/admin/partners", token)).status, 200);
  assert.equal((await get("/api/v1/attention", token)).status, 200);
  const diag = await (await get("/api/v1/system/diagnostics", token)).json();
  assert.equal(diag.diagnostics.storage.durable, false);
});

test("production-ephemeral: business mutations fail safe with 503 and create no state", async () => {
  const token = opToken();
  const before = (await (await get("/api/v1/community/progression")).json()).stats.totalIntakes;
  const cases = [
    ["intake", () => post("/api/v1/community/intake", { type: "PILOT_INTEREST", organization: "SafetyOrg", useCaseDescription: "x" })],
    ["partners", () => post("/api/v1/admin/partners", { name: "SafetyPartner" }, token)],
    ["connections", () => post("/api/v1/admin/connections", { provider: "safety-prov" }, token)],
    ["approve", () => post("/api/v1/procarta/pilot/approve", { intakeId: "x", reason: "y" }, token)],
    ["verdict", () => post("/api/v1/procarta/pilot/verdict", { recordId: "x", verdict: "PROMOTED", reason: "y" }, token)],
    ["feedback", () => post("/api/v1/feedback", { category: "OTHER", message: "x" })],
    ["execute", () => post("/api/command/execute", { action: "PING", payload: {} }, token)]
  ];
  // Workforce routes use loadAuthenticated (WORKFORCE-persona or legacy ADMIN only):
  // an OPERATOR-persona token is rejected 401 BEFORE the durability gate runs.
  // This proves auth-first ordering; the same gate middleware protects these
  // routes for fully authenticated founders (verified in local chain tests).
  for (const [name, fn] of [
    ["agents", () => post("/api/v1/workforce/agents", { name: "safety-agent", purpose: "x" }, token)],
    ["invite", () => post("/api/v1/workforce/invite", { fullName: "Safety Person", role: "OPERATOR" }, token)]
  ]) {
    const r = await fn();
    assert.equal(r.status, 401, `${name} must be 401 for non-workforce persona before gate`);
  }
  for (const [name, fn] of cases) {
    const r = await fn();
    assert.equal(r.status, 503, `${name} must be 503 when ephemeral`);
    const body = await r.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "STORAGE_NOT_CONFIGURED");
    assert.ok(body.message, `${name} must carry a human-readable message`);
  }
  const after = (await (await get("/api/v1/community/progression")).json()).stats.totalIntakes;
  assert.equal(after, before, "blocked intake must create no state");
});

test("production-ephemeral: anonymous protected routes still 401 (not 503)", async () => {
  // Auth middleware runs before the durability gate.
  assert.equal((await get("/api/v1/admin/partners")).status, 401);
  assert.equal((await get("/api/v1/attention")).status, 401);
  assert.equal((await post("/api/v1/community/intake", { type: "USE_CASE" })).status, 503);
});
