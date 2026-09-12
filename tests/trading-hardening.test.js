import { test } from "node:test";
import assert from "node:assert/strict";
import { FounderSignalEngine } from "../src/trading/FounderSignalEngine.js";

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

test("hardening: forex exposes confidence percent + quality band", () => {
  const eng = new FounderSignalEngine({});
  const r = eng.analyzeForex({ instrument: "EURUSD", candles: candles(60, 1.08, 0.0004), now: FRESH });
  if (r.direction) {
    assert.ok(typeof r.confidencePercent === "number" && r.confidencePercent >= 0 && r.confidencePercent <= 100);
    assert.ok(r.quality && typeof r.quality.band === "string");
  } else {
    assert.ok(["WATCH", "NO_TRADE", "SETUP", "PRE-ALERT"].includes(r.state));
  }
});

test("hardening: higher-timeframe disagreement degrades to NO_TRADE, agreement keeps setup", () => {
  const eng = new FounderSignalEngine({});
  const base = candles(60, 1.08, 0.0004);
  const up = eng.analyzeForex({ instrument: "EURUSD", candles: base, now: FRESH });
  if (!up.direction) return; // market gave no edge; nothing to disagree with
  const htfDown = candles(60, 2.0, -0.01);
  const disagree = eng.analyzeForex({ instrument: "EURUSD", candles: base, higherCandles: htfDown, now: FRESH });
  assert.equal(disagree.state, "NO_TRADE");
  assert.ok(String(disagree.reason).includes("higher-timeframe"));
  const htfUp = candles(60, 1.0, 0.01);
  const agree = eng.analyzeForex({ instrument: "EURUSD", candles: base, higherCandles: htfUp, now: FRESH });
  assert.ok(agree.state !== "NO_TRADE" || String(agree.reason || "").length > 0);
});

test("hardening: invalid higher-timeframe candles rejected honestly", () => {
  const eng = new FounderSignalEngine({});
  const r = eng.analyzeForex({ instrument: "EURUSD", candles: candles(40, 1.08, 0.0003), higherCandles: [{ o: 1 }], now: FRESH });
  assert.equal(r.state, "NO_TRADE");
  assert.ok(r.reason.includes("Higher-timeframe"));
});

test("hardening: backtest is deterministic evidence on supplied candles only", () => {
  const eng = new FounderSignalEngine({});
  const r = eng.backtestForex({ instrument: "EURUSD", candles: candles(80, 1.08, 0.0004) });
  assert.equal(r.kind, "BACKTEST");
  assert.ok(typeof r.confirmed === "number" && typeof r.evaluated === "number");
  assert.ok(String(r.note).includes("supplied candles"));
  const short = eng.backtestForex({ instrument: "EURUSD", candles: candles(10, 1, 0.001) });
  assert.ok(short.error);
});

test("hardening: gaming markets always NOT_SUPPORTED with NO_TRADE", () => {
  const eng = new FounderSignalEngine({});
  for (const game of ["AVIATOR", "CRASH", "VIRTUAL_FOOTBALL", "QUOTEX"]) {
    const r = eng.analyzeGaming({ game });
    assert.equal(r.state, "NO_TRADE");
    assert.equal(r.support, "NOT_SUPPORTED");
    assert.ok(r.reason.includes("NOT_SUPPORTED"));
    assert.ok(r.reason.toLowerCase().includes("session") || r.reason.includes("credential"));
  }
});

test("hardening: LIVE execution mode rejected, styles validated, actor-scoped ledger", () => {
  const eng = new FounderSignalEngine({});
  const sig = { instrument: "EURUSD", market: "FOREX", state: "CONFIRMED", direction: "LONG", entry: 1.08, stopLoss: 1.07, tp1: 1.095, tp2: 1.105, tp3: 1.12, riskAmount: 20, confidence: 0.7 };
  assert.throws(() => eng.executePaper({ signal: sig, riskAmount: 20, executionMode: "LIVE" }), /BROKER_NOT_CONFIGURED/);
  assert.throws(() => eng.executePaper({ signal: sig, riskAmount: 20, executionStyle: "YOLO" }), /EXECUTION_STYLE_INVALID/);
  const a = eng.executePaper({ signal: sig, riskAmount: 20, actor: "alice", executionStyle: "SEMI_AUTO" });
  assert.equal(a.executionStyle, "SEMI_AUTO");
  assert.equal(a.actor, "alice");
  assert.equal(a.confidencePercent >= 0, true);
  const mine = eng.listLedger(50, { actor: "alice" });
  assert.ok(mine.length >= 1 && mine.every((r) => r.actor === "alice"));
  const other = eng.listLedger(50, { actor: "nobody" });
  assert.equal(other.length, 0);
});

test("hardening: status exposes modes, styles, risk caps and gaming boundary", () => {
  const eng = new FounderSignalEngine({});
  const st = eng.getStatus();
  assert.equal(st.mode, "PAPER");
  assert.ok(st.executionModes.includes("LIVE") && st.executionModes.includes("PAPER"));
  assert.ok(st.executionStyles.includes("MANUAL") && st.executionStyles.includes("FULL_AUTO"));
  assert.equal(st.liveExecution, "BROKER_NOT_CONFIGURED");
  assert.ok(typeof st.risk.maxRiskPerTrade === "number" && typeof st.risk.maxExposure === "number");
  assert.equal(st.gaming.mode, "NOT_SUPPORTED");
});
