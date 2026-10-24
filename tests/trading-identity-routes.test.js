import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ade-trading-identity-"));
process.chdir(tmpRoot);

const { app, kernelReady } = await import("../src/app.js");
const { default: IdentityOnboarding } = await import("../src/kernel/IdentityOnboarding.js");

let server = null;
let base = null;

before(async () => {
  await kernelReady;
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

const issue = (subject, level, persona) =>
  IdentityOnboarding.getInstance().issueSession({ subject, tier: "ENTERPRISE", level, persona }).token;

async function call(token, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test("trading identity: JWT sessions resolve person identity for modes and comparisons", async () => {
  const founder = issue("trade-identity-founder", 3, "FOUNDER");
  const operator = issue("trade-identity", 2, "OPERATOR");

  const granted = await call(founder, "POST", "/api/v1/admin/trading/entitlements", {
    userId: "trade-identity",
    trading: true
  });
  assert.equal(granted.status, 201);

  const modes = await call(operator, "GET", "/api/v1/trading/connection-modes");
  assert.equal(modes.status, 200);
  assert.equal(modes.body.success, true);
  assert.equal(modes.body.isL2, true, "L2 JWT claims must be read from req.identity");

  const created = await call(operator, "POST", "/api/v1/trading/broker-comparisons", {
    platform: "POCKET_OPTION",
    asset: "EURUSD",
    marketType: "REGULAR",
    direction: "CALL",
    confidence: 0.7
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.comparison.userId, "trade-identity");
  assert.equal(created.body.comparison.executionMode, "MANUAL_EXTERNAL");
  assert.equal(created.body.comparison.executionStatus, "PENDING");
  assert.equal(created.body.comparison.observedResult, null);

  const listed = await call(operator, "GET", "/api/v1/trading/broker-comparisons");
  assert.equal(listed.status, 200);
  assert.ok(listed.body.comparisons.some((row) => row.comparisonId === created.body.comparison.comparisonId));

  const fetched = await call(operator, "GET", `/api/v1/trading/broker-comparisons/${created.body.comparison.comparisonId}`);
  assert.equal(fetched.status, 200);

  const recorded = await call(operator, "PATCH", `/api/v1/trading/broker-comparisons/${created.body.comparison.comparisonId}/result`, {
    executionStatus: "MANUAL_EXECUTED",
    observedResult: "WIN",
    notes: "external ticket observed"
  });
  assert.equal(recorded.status, 200);
  assert.equal(recorded.body.comparison.executionStatus, "MANUAL_EXECUTED");
  assert.equal(recorded.body.comparison.observedResult, "WIN");
});

test("trading identity: unauthenticated comparisons stay closed", async () => {
  assert.equal((await call(null, "GET", "/api/v1/trading/broker-comparisons")).status, 401);
  assert.equal((await call(null, "GET", "/api/v1/trading/connection-modes")).status, 401);
});

test("trading authority: grants, paper ownership, handoff ownership, and scoped routes stay isolated", async () => {
  const founder = issue("iso-founder", 3, "FOUNDER");
  const alice = issue("iso-alice", 2, "OPERATOR");
  const bob = issue("iso-bob", 2, "OPERATOR");

  const otc = await call(founder, "POST", "/api/v1/admin/trading/entitlements", {
    userId: "iso-alice",
    capabilities: { BINARY_OTC: true }
  });
  assert.equal(otc.status, 201);
  assert.equal(otc.body.entitlement.trading, true);
  assert.equal(otc.body.entitlement.capabilities.BINARY_OTC, true);
  const me = await call(alice, "GET", "/api/v1/trading/entitlements/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.entitlement.trading, true);

  const grantAlice = await call(founder, "POST", "/api/v1/admin/trading/entitlements", {
    userId: "iso-alice",
    trading: true
  });
  assert.equal(grantAlice.status, 201);
  const grantBob = await call(founder, "POST", "/api/v1/admin/trading/entitlements", {
    userId: "iso-bob",
    trading: true
  });
  assert.equal(grantBob.status, 201);

  const opened = await call(alice, "POST", "/api/v1/trading/paper", {
    signal: {
      instrument: "ISOALICE",
      market: "FOREX",
      state: "CONFIRMED",
      direction: "LONG",
      entry: 1.0811,
      stopLoss: 1.07,
      tp1: 1.095,
      confidence: 0.9
    },
    riskAmount: 10
  });
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  const paperId = opened.body.position.id;

  const bobLedger = await call(bob, "GET", "/api/v1/trading/ledger");
  assert.equal(bobLedger.status, 200);
  assert.equal(bobLedger.body.positions.some((p) => p.id === paperId), false);
  const foreignLedger = await call(bob, "GET", "/api/v1/trading/ledger?actor=iso-alice");
  assert.equal(foreignLedger.status, 403);
  const foreignClose = await call(bob, "POST", `/api/v1/trading/paper/${paperId}/close`, { outcome: "MANUAL" });
  assert.equal(foreignClose.status, 403);
  assert.equal(foreignClose.body.error, "PAPER_NOT_AUTHORIZED");
  const ownClose = await call(alice, "POST", `/api/v1/trading/paper/${paperId}/close`, { outcome: "MANUAL" });
  assert.equal(ownClose.status, 200);

  const aliceMode = await call(alice, "POST", "/api/v1/trading/connection-modes", {
    venue: "fbs",
    activeMode: "DEMO"
  });
  assert.equal(aliceMode.status, 201, JSON.stringify(aliceMode.body));
  const aliceConnectionId = aliceMode.body.mode.connectionId;
  const foreignMode = await call(bob, "PATCH", `/api/v1/trading/connection-modes/${encodeURIComponent(aliceConnectionId)}`, {
    activeMode: "LIVE"
  });
  assert.equal(foreignMode.status, 403);
  const foreignVerify = await call(bob, "POST", `/api/v1/trading/connection-modes/${encodeURIComponent(aliceConnectionId)}/verify`);
  assert.equal(foreignVerify.status, 403);
  const foreignModeCreate = await call(bob, "POST", "/api/v1/trading/connection-modes", {
    venue: "fbs",
    userId: "iso-alice",
    activeMode: "DEMO"
  });
  assert.equal(foreignModeCreate.status, 403);
  const foreignHandoff = await call(bob, "POST", "/api/v1/trading/fbs/signal-handoff", {
    signal: { instrument: "EURUSD", direction: "LONG", state: "CONFIRMED", confidence: 0.72 },
    connectionId: aliceConnectionId,
    confirmed: true
  });
  assert.equal(foreignHandoff.status, 403);
  assert.equal(foreignHandoff.body.error, "CONNECTION_NOT_OWNED");

  const comparison = await call(alice, "POST", "/api/v1/trading/broker-comparisons", {
    platform: "POCKET_OPTION",
    asset: "EURUSD",
    marketType: "REGULAR",
    direction: "CALL",
    confidence: 0.7
  });
  assert.equal(comparison.status, 201);
  const comparisonId = comparison.body.comparison.comparisonId;
  const bobList = await call(bob, "GET", "/api/v1/trading/broker-comparisons");
  assert.equal(bobList.status, 200);
  assert.equal(bobList.body.comparisons.some((row) => row.comparisonId === comparisonId), false);
  assert.equal((await call(bob, "GET", `/api/v1/trading/broker-comparisons/${comparisonId}`)).status, 403);
  assert.equal((await call(bob, "PATCH", `/api/v1/trading/broker-comparisons/${comparisonId}/result`, {
    executionStatus: "MANUAL_EXECUTED",
    observedResult: "WIN"
  })).status, 403);

  assert.equal((await call(bob, "POST", "/api/v1/trading/emergency-stop", { on: false })).status, 403);
  assert.equal((await call(founder, "POST", "/api/v1/trading/emergency-stop", { on: false })).status, 200);

  const gateForeign = await call(bob, "POST", "/api/v1/trading/signal-gate", {
    userId: "iso-alice",
    analysis: { market: "FOREX", state: "CONFIRMED", confidence: 0.9 }
  });
  assert.equal(gateForeign.status, 403);
  const autoForeign = await call(bob, "POST", "/api/v1/trading/auto-mode", {
    userId: "iso-alice",
    targetAmount: 10
  });
  assert.equal(autoForeign.status, 403);

  const forexOnly = issue("iso-forex-only", 2, "OPERATOR");
  const forexGrant = await call(founder, "POST", "/api/v1/admin/trading/entitlements", {
    userId: "iso-forex-only",
    capabilities: { FOREX: true }
  });
  assert.equal(forexGrant.status, 201);
  const binaryBypass = await call(forexOnly, "POST", "/api/v1/trading/paper", {
    signal: {
      instrument: "ISOBINARY",
      market: "BINARY",
      marketType: "OTC",
      state: "CONFIRMED_CALL",
      direction: "CALL",
      confidence: 0.9
    },
    gateFeature: "FOREX",
    riskAmount: 10
  });
  assert.equal(binaryBypass.status, 422);
  assert.match(binaryBypass.body.gate.reason, /NOT_ENTITLED/);
  const gateBypass = await call(forexOnly, "POST", "/api/v1/trading/signal-gate", {
    feature: "FOREX",
    analysis: { market: "BINARY", marketType: "OTC", state: "CONFIRMED_CALL", confidence: 0.9 }
  });
  assert.equal(gateBypass.status, 200);
  assert.equal(gateBypass.body.pass, false);
  assert.match(gateBypass.body.reason, /NOT_ENTITLED/);
  const autoBypass = await call(forexOnly, "POST", "/api/v1/trading/auto-mode", {
    feature: "FOREX",
    targetAmount: 10,
    analysis: { market: "BINARY", marketType: "OTC", state: "CONFIRMED_CALL", confidence: 0.9 }
  });
  assert.equal(autoBypass.status, 200);
  assert.equal(autoBypass.body.allowed, false);
  assert.match(autoBypass.body.reason, /NOT_ENTITLED/);
});
