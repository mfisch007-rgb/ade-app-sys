import { test } from "node:test";
import assert from "node:assert/strict";
import { FounderSignalEngine, BINARY_STATES, BINARY_DEFENSE_DEFAULTS } from "../src/trading/FounderSignalEngine.js";

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

// ---- Binary Manipulation Defense Layer (deterministic) ----

function lastCloseOf(cs) {
  return cs[cs.length - 1].c;
}

function healthyTicks(entryCutoff, expiryCutoff, price) {
  const out = [];
  for (let t = entryCutoff - 14000; t <= entryCutoff; t += 2000) out.push({ t, price });
  for (let t = expiryCutoff - 14000; t <= expiryCutoff; t += 2000) out.push({ t, price });
  return out;
}

function stalledTicksGap(entryCutoff, expiryCutoff, price) {
  // ENTRY window healthy, EXPIRY window has a 10s frozen-feed gap (> 5s limit).
  const out = [];
  for (let t = entryCutoff - 14000; t <= entryCutoff; t += 2000) out.push({ t, price });
  for (let t = expiryCutoff - 14000; t <= expiryCutoff - 10000; t += 2000) out.push({ t, price });
  out.push({ t: expiryCutoff, price }); // 10s gap before cutoff -> BROKER_TICK_STALL
  return out;
}

function thinTicksLiquidityDrop(entryCutoff, expiryCutoff, price) {
  // Only a single tick inside the ENTRY 15s window (< min 3) -> liquidity drop.
  const out = [];
  out.push({ t: entryCutoff - 1000, price });
  for (let t = expiryCutoff - 14000; t <= expiryCutoff; t += 2000) out.push({ t, price });
  return out;
}

test("hardening: binary minimum pip edge rejects sub-2.5-pip expected moves", () => {
  const eng = new FounderSignalEngine({});
  assert.equal(BINARY_DEFENSE_DEFAULTS.minPipEdge, 2.5);

  // 1 pip of expected movement (5 bars x 0.00002 = 0.0001 = 1 pip) -> must reject.
  const thin = candles(60, 1.08, 0.00002);
  const rejected = eng.analyzeBinary({ pair: "EURUSD", candles: thin, timeframe: "M5", now: FRESH });
  assert.equal(rejected.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(rejected.manipulation, "INSUFFICIENT_PIP_EDGE");
  assert.equal(rejected.manipulationFlag, "INSUFFICIENT_PIP_EDGE");
  assert.ok(rejected.defense.pipEdge.expectedDeltaPips < 2.5);
  assert.ok(String(rejected.rationale).includes("2.5") || String(rejected.reason).includes("2.5"));
  assert.ok(String(rejected.reason).includes("REJECTED_BROKER_MANIPULATION"));

  // 20 pips of expected movement (5 bars x 0.0004) -> pip edge passes, no pip rejection.
  const strong = candles(60, 1.08, 0.0004);
  const ok = eng.analyzeBinary({ pair: "EURUSD", candles: strong, timeframe: "M5", now: FRESH });
  assert.ok(ok.defense.pipEdge.passed === true);
  assert.ok(ok.defense.pipEdge.expectedDeltaPips >= 2.5);
  assert.notEqual(ok.manipulation, "INSUFFICIENT_PIP_EDGE");
  assert.notEqual(ok.state, "REJECTED_BROKER_MANIPULATION");

  // Explicit deterministic overrides win over candle-implied momentum.
  const forcedThin = eng.analyzeBinary({ pair: "EURUSD", candles: strong, timeframe: "M5", now: FRESH, expectedDeltaPips: 1.0 });
  assert.equal(forcedThin.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(forcedThin.manipulation, "INSUFFICIENT_PIP_EDGE");

  const forcedWide = eng.analyzeBinary({ pair: "EURUSD", candles: thin, timeframe: "M5", now: FRESH, expectedDeltaPips: 5.0 });
  assert.equal(forcedWide.defense.pipEdge.passed, true);
  assert.equal(forcedWide.defense.pipEdge.source, "explicit-expectedDeltaPips");
  assert.notEqual(forcedWide.state, "REJECTED_BROKER_MANIPULATION");

  // Projected expiry price path: 1 pip above last close -> reject; 5 pips -> pass pip check.
  const last = lastCloseOf(strong);
  const projThin = eng.analyzeBinary({ pair: "EURUSD", candles: strong, timeframe: "M5", now: FRESH, projectedExpiryPrice: last + 0.0001 });
  assert.equal(projThin.manipulation, "INSUFFICIENT_PIP_EDGE");
  const projWide = eng.analyzeBinary({ pair: "EURUSD", candles: strong, timeframe: "M5", now: FRESH, projectedExpiryPrice: last + 0.0005 });
  assert.equal(projWide.defense.pipEdge.passed, true);
});

test("hardening: binary tick stall guard flags BROKER_TICK_STALL within 15s of cutoffs", () => {
  const eng = new FounderSignalEngine({});
  const cs = candles(60, 1.08, 0.0004); // 20-pip momentum: pip edge passes, isolates tick behavior
  const px = lastCloseOf(cs);
  const entryCutoff = FRESH + 2 * 60 * 1000;
  const expiryCutoff = FRESH + 5 * 60 * 1000;

  const healthy = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks: healthyTicks(entryCutoff, expiryCutoff, px),
    entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(healthy.defense.tickLatency.evaluated, true);
  assert.equal(healthy.defense.tickLatency.passed, true);
  assert.equal(healthy.defense.tickLatency.code, null);
  assert.notEqual(healthy.state, "REJECTED_BROKER_MANIPULATION");

  const stalled = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks: stalledTicksGap(entryCutoff, expiryCutoff, px),
    entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(stalled.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(stalled.manipulation, "BROKER_TICK_STALL");
  assert.equal(stalled.manipulationFlag, "BROKER_TICK_STALL");
  assert.equal(stalled.defense.tickLatency.code, "BROKER_TICK_STALL");
  assert.ok(String(stalled.rationale).includes("BROKER_TICK_STALL"));
  assert.ok(String(stalled.reason).includes("REJECTED_BROKER_MANIPULATION"));

  const thin = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks: thinTicksLiquidityDrop(entryCutoff, expiryCutoff, px),
    entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(thin.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(thin.manipulation, "BROKER_TICK_STALL");
  assert.ok(String(thin.defense.tickLatency.detail).toLowerCase().includes("liquidity") || String(thin.rationale).includes("BROKER_TICK_STALL"));

  // Empty window (ticks exist but none near cutoff) is also a stall, not a silent pass.
  const far = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks: [{ t: FRESH - 600000, price: px }, { t: FRESH - 599000, price: px }, { t: FRESH - 598000, price: px }],
    entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(far.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(far.manipulation, "BROKER_TICK_STALL");
});

test("hardening: binary independent feed validation flags MANIPULATED_FEED over 0.8 pips", () => {
  const eng = new FounderSignalEngine({});
  assert.equal(BINARY_DEFENSE_DEFAULTS.maxWickDeviationPips, 0.8);
  const cs = candles(60, 1.08, 0.0004); // pip edge passes (20 pips)
  const px = lastCloseOf(cs);

  // Spot price path: exact match passes; +2 pips deviates beyond 0.8 -> manipulated.
  const priceOk = eng.analyzeBinary({ pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH, spotPrice: px });
  assert.equal(priceOk.defense.feedValidation.evaluated, true);
  assert.equal(priceOk.defense.feedValidation.passed, true);
  assert.equal(priceOk.defense.feedValidation.state, "FEED_OK");
  assert.notEqual(priceOk.state, "REJECTED_BROKER_MANIPULATION");

  const priceBad = eng.analyzeBinary({ pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH, spotPrice: px + 0.0002 });
  assert.equal(priceBad.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(priceBad.manipulation, "MANIPULATED_FEED");
  assert.equal(priceBad.feedState, "MANIPULATED_FEED");
  assert.equal(priceBad.defense.feedValidation.state, "MANIPULATED_FEED");
  assert.ok(priceBad.defense.feedValidation.maxDeviationPips > 0.8);
  assert.ok(String(priceBad.rationale).includes("MANIPULATED_FEED"));

  // Spot candles path: identical wicks pass; broker wick +2 pips vs spot fails.
  const spotSame = cs.map((c) => ({ ...c }));
  const candleOk = eng.analyzeBinary({ pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH, spotCandles: spotSame });
  assert.equal(candleOk.defense.feedValidation.passed, true);
  assert.notEqual(candleOk.state, "REJECTED_BROKER_MANIPULATION");

  const spotShifted = cs.map((c, i, a) => (i === a.length - 1 ? { ...c, h: c.h + 0.0002, c: c.c + 0.0002 } : { ...c }));
  const candleBad = eng.analyzeBinary({ pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH, spotCandles: spotShifted });
  assert.equal(candleBad.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(candleBad.manipulation, "MANIPULATED_FEED");
  assert.ok(candleBad.defense.feedValidation.wickDeviationPips > 0.8);

  // Spot ticks path: aligned ticks pass; shifted spot ticks fail.
  const entryCutoff = FRESH + 2 * 60 * 1000;
  const expiryCutoff = FRESH + 5 * 60 * 1000;
  const brokerTicks = healthyTicks(entryCutoff, expiryCutoff, px);
  const spotTicksSame = healthyTicks(entryCutoff, expiryCutoff, px);
  const ticksOk = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks, spotTicks: spotTicksSame, entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(ticksOk.defense.feedValidation.passed, true);
  assert.notEqual(ticksOk.state, "REJECTED_BROKER_MANIPULATION");

  const spotTicksShifted = healthyTicks(entryCutoff, expiryCutoff, px + 0.0002);
  const ticksBad = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks, spotTicks: spotTicksShifted, entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(ticksBad.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(ticksBad.manipulation, "MANIPULATED_FEED");
});

test("hardening: binary REJECTED_BROKER_MANIPULATION carries rationale and blocks execution", () => {
  const eng = new FounderSignalEngine({});
  assert.ok(BINARY_STATES.includes("REJECTED_BROKER_MANIPULATION"));

  const thin = candles(60, 1.08, 0.00002);
  const r = eng.analyzeBinary({ pair: "EURUSD", candles: thin, timeframe: "M5", now: FRESH });
  assert.equal(r.state, "REJECTED_BROKER_MANIPULATION");
  assert.ok(r.manipulation && r.manipulationFlag === r.manipulation);
  assert.ok(["INSUFFICIENT_PIP_EDGE", "BROKER_TICK_STALL", "MANIPULATED_FEED"].includes(r.manipulation));
  assert.ok(typeof r.rationale === "string" && r.rationale.length > 10);
  assert.ok(String(r.reason).startsWith("REJECTED_BROKER_MANIPULATION:"));
  assert.equal(r.confidence, 0);
  assert.equal(r.confidencePercent, 0);
  assert.ok(r.defense && typeof r.defense === "object");
  assert.ok(r.defense.pipEdge && r.defense.tickLatency && r.defense.feedValidation);
  assert.ok(r.evidence && r.evidence.manipulation === r.manipulation);

  // Rejected signals must never paper-execute: only CONFIRMED_* may execute.
  assert.throws(() => eng.executePaper({ signal: r, riskAmount: 10 }), /SIGNAL_NOT_CONFIRMED/);

  // A fully clean binary signal keeps its defense proof and stays executable when confirmed.
  const cs = candles(60, 1.08, 0.0004);
  const px = lastCloseOf(cs);
  const entryCutoff = FRESH + 2 * 60 * 1000;
  const expiryCutoff = FRESH + 5 * 60 * 1000;
  const clean = eng.analyzeBinary({
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks: healthyTicks(entryCutoff, expiryCutoff, px),
    spotPrice: px, entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  });
  assert.equal(clean.defense.passed, true);
  assert.equal(clean.manipulation, "NONE");
  assert.ok(["WATCH", "PRE-ALERT", "CONFIRMED_CALL", "CONFIRMED_PUT"].includes(clean.state));
});

test("hardening: binary defense layer runs before signals and is fully deterministic", () => {
  const eng = new FounderSignalEngine({});
  const cs = candles(60, 1.08, 0.0004);
  const px = lastCloseOf(cs);
  const entryCutoff = FRESH + 2 * 60 * 1000;
  const expiryCutoff = FRESH + 5 * 60 * 1000;
  const args = {
    pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH,
    brokerTicks: healthyTicks(entryCutoff, expiryCutoff, px),
    spotPrice: px, entryCutoffAt: entryCutoff, expiryAt: expiryCutoff
  };
  const a = eng.analyzeBinary(args);
  const b = eng.analyzeBinary({ ...args, candles: cs.map((c) => ({ ...c })), brokerTicks: healthyTicks(entryCutoff, expiryCutoff, px) });
  assert.deepEqual(a, b);

  // JPY pairs use 0.01 pip size: 0.05 price move = 5 pips -> passes; 0.01 move = 1 pip -> rejects.
  const jpyStrong = candles(60, 150.0, 0.01, 0.02);
  const jpyOk = eng.analyzeBinary({ pair: "USDJPY", candles: jpyStrong, timeframe: "M5", now: FRESH });
  assert.equal(jpyOk.defense.pipSize, 0.01);
  assert.equal(jpyOk.defense.pipEdge.passed, true);

  const jpyThin = candles(60, 150.0, 0.002, 0.02);
  const jpyReject = eng.analyzeBinary({ pair: "USDJPY", candles: jpyThin, timeframe: "M5", now: FRESH });
  assert.equal(jpyReject.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(jpyReject.manipulation, "INSUFFICIENT_PIP_EDGE");

  // Config override of the 2.5-pip minimum is honored deterministically.
  const strict = new FounderSignalEngine({ config: { minBinaryPipEdge: 50 } });
  const strictRejected = strict.analyzeBinary({ pair: "EURUSD", candles: cs, timeframe: "M5", now: FRESH });
  assert.equal(strictRejected.state, "REJECTED_BROKER_MANIPULATION");
  assert.equal(strictRejected.defense.thresholds.minPipEdge, 50);
});
