import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, kernelReady } from "../src/app.js";
import IdentityOnboarding from "../src/kernel/IdentityOnboarding.js";
import { FounderSignalEngine } from "../src/trading/FounderSignalEngine.js";

// Paper-mode trading: deterministic analytics on supplied candles only.
// No live broker, no invented prices, no fake fills.

function candles(n, start, step, spread = 0.001) {
  const out = [];
  let p = start;
  const base = Date.now() - n * 60000;
  for (let i = 0; i < n; i += 1) {
    const o = p;
    const c = p + step;
    out.push({ t: base + i * 60000, o, h: Math.max(o, c) + spread, l: Math.min(o, c) - spread, c });
    p = c;
  }
  return out;
}

const FRESH = Date.now();

test("forex: trending candles produce structured plan with SL/TPs", () => {
  const eng = new FounderSignalEngine({});
  const r = eng.analyzeForex({ instrument: "EURUSD", candles: candles(60, 1.08, 0.0004), now: FRESH });
  assert.ok(["CONFIRMED", "SETUP", "PRE-ALERT", "WATCH"].includes(r.state), `unexpected ${r.state}`);
  if (r.direction) {
    assert.ok(r.entry > 0 && r.stopLoss > 0 && r.tp1 > 0 && r.tp2 > 0 && r.tp3 > 0);
    assert.ok(r.invalidation && r.trailing);
    assert.ok(r.evidence.dataWarning.includes("caller-supplied"));
  }
});

test("forex: flat candles produce WATCH or NO_TRADE, never fake CONFIRMED riches", () => {
  const eng = new FounderSignalEngine({});
  const flat = candles(60, 1.08, 0).map((c) => ({ ...c, h: c.o + 0.00001, l: c.o - 0.00001 }));
  const r = eng.analyzeForex({ instrument: "EURUSD", candles: flat, now: FRESH });
  assert.ok(["WATCH", "NO_TRADE", "SETUP", "PRE-ALERT"].includes(r.state));
});

test("forex: stale candles produce NO_TRADE STALE_DATA", () => {
  const eng = new FounderSignalEngine({});
  const old = candles(30, 1.08, 0.0002).map((c, i, a) => (i === a.length - 1 ? { ...c, t: Date.now() - 3600000 } : c));
  const r = eng.analyzeForex({ instrument: "EURUSD", candles: old, now: Date.now() });
  assert.equal(r.state, "NO_TRADE");
  assert.ok(r.reason.includes("STALE"));
});

test("forex: too few or invalid candles rejected", () => {
  const eng = new FounderSignalEngine({});
  assert.equal(eng.analyzeForex({ instrument: "X", candles: [] }).state, "NO_TRADE");
  assert.equal(eng.analyzeForex({ instrument: "", candles: candles(30, 1, 1) }).state, "NO_TRADE");
  assert.equal(eng.analyzeForex({ instrument: "X", candles: [{ o: 1 }] }).state, "NO_TRADE");
});

test("binary: regular and OTC both analyze with honest expiry labels", () => {
  const eng = new FounderSignalEngine({});
  // sharp drop then bounce: mean-reversion CALL setup for regular threshold
  const cs = candles(40, 1.1, -0.0008);
  for (const mt of ["REGULAR", "OTC"]) {
    const r = eng.analyzeBinary({ pair: "EURUSD", marketType: mt, candles: cs, timeframe: "M5", now: FRESH });
    assert.ok(["WATCH", "PRE-ALERT", "CONFIRMED_CALL", "CONFIRMED_PUT", "NO_TRADE"].includes(r.state), mt + ":" + r.state);
    if (r.expiry) {
      assert.equal(r.expiry.label, "ESTIMATED EXPIRY");
      assert.ok(r.expiry.note.includes("broker"));
    }
  }
});

test("risk: rejects over-limit, allows paper, duplicate suppressed, close works", () => {
  const eng = new FounderSignalEngine({ config: { maxRiskPerTrade: 2, consecutiveLossLimit: 1 } });
  const sig = { instrument: "EURUSD", market: "FOREX", state: "CONFIRMED", direction: "LONG", entry: 1.08, stopLoss: 1.07, tp1: 1.095, tp2: 1.105, tp3: 1.12, riskAmount: 50, confidence: 0.7 };
  assert.ok(!eng.authorizePaper({ riskAmount: 5000 }).ok, "over-limit risk rejected");
  const rec = eng.executePaper({ signal: sig, riskAmount: 50, actor: "t" });
  assert.equal(rec.executionState, "FILLED");
  assert.equal(rec.executionMode, "PAPER");
  assert.throws(() => eng.executePaper({ signal: sig, riskAmount: 50, actor: "t" }), /DUPLICATE_SUPPRESSED/);
  assert.throws(() => eng.executePaper({ signal: { ...sig, state: "WATCH" }, riskAmount: 1 }), /SIGNAL_NOT_CONFIRMED/);
  const closed = eng.closePaper({ id: rec.id, outcome: "MANUAL", pnl: -10 });
  assert.equal(closed.result.pnl, -10);
  assert.throws(() => eng.closePaper({ id: rec.id }), /PAPER_ALREADY_CLOSED/);
});

test("risk: emergency stop blocks paper", () => {
  const eng = new FounderSignalEngine({});
  eng.setEmergencyStop(true);
  assert.ok(!eng.authorizePaper({ riskAmount: 10 }).ok);
  eng.setEmergencyStop(false);
  assert.ok(eng.authorizePaper({ riskAmount: 10 }).ok);
});

test("live: always BROKER_NOT_CONFIGURED", () => {
  const eng = new FounderSignalEngine({});
  assert.throws(() => eng.executeLive(), /BROKER_NOT_CONFIGURED/);
});

let server = null;
let baseUrl = null;
const opToken = () =>
  IdentityOnboarding.getInstance().issueSession({ subject: "trade-test", tier: "COMMUNITY", level: 2, persona: "OPERATOR" }).token;

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

test("trading routes: auth gating + paper lifecycle over HTTP", async () => {
  assert.equal((await fetch(`${baseUrl}/api/v1/trading/status`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/v1/trading/ledger`)).status, 401);
  const token = opToken();
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const st = await (await fetch(`${baseUrl}/api/v1/trading/status`, { headers: H })).json();
  assert.equal(st.trading.mode, "PAPER");
  assert.equal(st.trading.liveExecution, "BROKER_NOT_CONFIGURED");
  const body = { kind: "FOREX", instrument: "TUNIT", candles: candles(40, 1.08, 0.0003) };
  const an = await (await fetch(`${baseUrl}/api/v1/trading/analyze`, { method: "POST", headers: H, body: JSON.stringify(body) })).json();
  assert.ok(an.analysis && an.analysis.state);
  const live = await fetch(`${baseUrl}/api/v1/trading/live`, { method: "POST", headers: H, body: "{}" });
  assert.equal(live.status, 503);
  assert.equal((await live.json()).error, "BROKER_NOT_CONFIGURED");
});

test("trading routes: SignalQualityGate enforced server-side on paper execution", async () => {
  const token = opToken();
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const founderToken = IdentityOnboarding.getInstance().issueSession({ subject: "trade-founder", tier: "ENTERPRISE", level: 3, persona: "FOUNDER" }).token;
  const FH = { "Content-Type": "application/json", Authorization: `Bearer ${founderToken}` };
  const paper = (payload) => fetch(`${baseUrl}/api/v1/trading/paper`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const good = { instrument: "GATEOK", market: "FOREX", state: "CONFIRMED", direction: "LONG", entry: 1.0811, stopLoss: 1.07, tp1: 1.095, confidence: 0.9 };
  // Unentitled subject is blocked fail-closed (NOT_ENTITLED) before any fill.
  const denied = await paper({ signal: { ...good, instrument: "GATEDENY" }, riskAmount: 10 });
  assert.equal(denied.status, 422);
  assert.equal((await denied.json()).error, "QUALITY_THRESHOLD_BLOCKED");
  // Founder grants the trading entitlement to the operator subject.
  const grant = await fetch(`${baseUrl}/api/v1/admin/trading/entitlements`, { method: "POST", headers: FH, body: JSON.stringify({ userId: "trade-test", trading: true }) });
  assert.equal(grant.status, 201);
  // Below-threshold quality is blocked fail-closed with a gate verdict.
  const blocked = await paper({ signal: { ...good, instrument: "GATELOW" }, riskAmount: 10, minConfidence: 0.95 });
  assert.equal(blocked.status, 422);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.error, "QUALITY_THRESHOLD_BLOCKED");
  assert.equal(blockedBody.gate.pass, false);
  // Manipulated feed is blocked even at high nominal confidence.
  const manip = await paper({ signal: { ...good, instrument: "GATEMANIP", state: "REJECTED_BROKER_MANIPULATION", manipulationFlag: true }, riskAmount: 10 });
  assert.equal(manip.status, 422);
  assert.equal((await manip.json()).error, "QUALITY_THRESHOLD_BLOCKED");
  // Passing signal executes and carries the gate verdict alongside.
  const ok = await paper({ signal: good, riskAmount: 10 });
  assert.equal(ok.status, 201);
  const okBody = await ok.json();
  assert.equal(okBody.position.executionMode, "PAPER");
  assert.equal(okBody.signalGate.pass, true);
});
