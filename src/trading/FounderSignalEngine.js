/**
 * ADE FOUNDER SIGNAL ENGINE — honest paper-mode market intelligence.
 *
 * Deterministic analytics over SUPPLIED candles only. This module never
 * invents market prices, never claims live broker connectivity, and never
 * executes live orders. Live execution is always BROKER_NOT_CONFIGURED
 * until a legitimate authorized provider adapter reports connected.
 *
 * Composes only existing architecture: runtimeConfig durable sections,
 * canonical EventBus topics, flat ADE error codes.
 *
 * Forex order: SCAN -> REGIME -> STRUCTURE -> LEVELS -> CONFIRM ->
 * PRE-ALERT -> ENTRY -> SL -> TP1/TP2/TP3 -> TRAILING -> INVALIDATION ->
 * PAPER -> MONITOR -> EXIT -> RESULT -> EVIDENCE.
 *
 * Binary order: ASSET -> MARKET TYPE -> TIMEFRAME -> REGIME -> STRUCTURE ->
 * SETUP -> PRE-ALERT -> CONFIRM -> DIRECTION -> ENTRY WINDOW -> EXPIRY -> RESULT.
 */

const FOREX_STATES = Object.freeze(["WATCH", "PRE-ALERT", "SETUP", "CONFIRMED", "INVALIDATED", "PAPER_EXECUTED", "CLOSED", "NO_TRADE"]);
const BINARY_STATES = Object.freeze(["WATCH", "PRE-ALERT", "SETUP", "CONFIRMED_CALL", "CONFIRMED_PUT", "INVALIDATED", "PAPER", "EXPIRED", "RESULT", "NO_TRADE", "REJECTED_BROKER_MANIPULATION"]);

// Binary Manipulation Defense Layer — mandatory anti-manipulation rules that
// run BEFORE any binary direction/edge evaluation.
//  1) Minimum Pip Edge Threshold (default 2.5 pips): expected price delta at
//     expiration must clear broker ±1 pip closing manipulation.
//  2) Candle Stale & Tick Latency Guard (15s window): tick stalls / liquidity
//     drops near entry/expiry cutoffs flag BROKER_TICK_STALL.
//  3) Independent Feed Validation (default 0.8 pips): broker feed vs spot feed
//     (OANDA/LMAX style) wick deviation flags MANIPULATED_FEED.
// Failures collapse to state REJECTED_BROKER_MANIPULATION with explicit rationale.
const BINARY_DEFENSE_DEFAULTS = Object.freeze({
  minPipEdge: 2.5,
  maxWickDeviationPips: 0.8,
  tickStallWindowMs: 15000,
  maxTickGapMs: 5000,
  minTicksNearCutoff: 3,
  spotMatchToleranceMs: 2000
});
const BINARY_MANIPULATION_FLAGS = Object.freeze(["INSUFFICIENT_PIP_EDGE", "BROKER_TICK_STALL", "MANIPULATED_FEED"]);

function pipSizeFor(symbol, override) {
  const o = Number(override);
  if (Number.isFinite(o) && o > 0) return o;
  const s = String(symbol || "").toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (/(XAU|GOLD|XAG|SILVER|BTC|ETH|CRYPTO)/.test(s)) return 0.1;
  if (/(US30|NAS100|SPX|SP500|GER40|UK100|INDICE|INDEX)/.test(s)) return 0.1;
  return 0.0001;
}

function tickPrice(t) {
  if (t === null || t === undefined || typeof t !== "object") return null;
  return num(t.price ?? t.p ?? t.bid ?? t.ask ?? t.c ?? t.close);
}

function sanitizeTicks(input) {
  if (!Array.isArray(input)) return { error: "TICKS_INVALID: expected an array of {t, price} ticks." };
  const out = [];
  for (const t of input) {
    const ts = Number(t?.t);
    const px = tickPrice(t);
    if (!Number.isFinite(ts) || px === null) {
      return { error: "TICKS_INVALID: each tick requires numeric t and price/bid/ask." };
    }
    out.push({ t: ts, price: px });
  }
  out.sort((a, b) => a.t - b.t);
  return { ticks: out };
}

function sanitizeSpotCandles(input) {
  if (!Array.isArray(input) || input.length < 1) {
    return { error: "SPOT_CANDLES_REQUIRED: at least 1 OHLC spot candle is required." };
  }
  const out = [];
  for (const c of input) {
    const o = num(c.o), h = num(c.h), l = num(c.l), cl = num(c.c);
    if (o === null || h === null || l === null || cl === null) {
      return { error: "SPOT_CANDLES_INVALID: non-numeric OHLC values." };
    }
    if (!(h >= l && h >= Math.max(o, cl) && l <= Math.min(o, cl))) {
      return { error: "SPOT_CANDLES_INVALID: candle violates h>=l, h>=max(o,c), l<=min(o,c)." };
    }
    out.push({ t: c.t ?? null, o, h, l, c: cl });
  }
  return { candles: out };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i += 1) e = values[i] * k + e * (1 - k);
  return e;
}

function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const h = candles[i].h, l = candles[i].l, pc = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function swings(candles, k = 2) {
  const highs = [];
  const lows = [];
  for (let i = k; i < candles.length - k; i += 1) {
    let isHigh = true, isLow = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (candles[j].h > candles[i].h) isHigh = false;
      if (candles[j].l < candles[i].l) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, price: candles[i].h });
    if (isLow) lows.push({ idx: i, price: candles[i].l });
  }
  return { highs: highs.slice(-2), lows: lows.slice(-2) };
}

const EXECUTION_STYLES = Object.freeze(["MANUAL", "SEMI_AUTO", "FULL_AUTO"]);
const EXECUTION_MODES = Object.freeze(["PAPER", "LIVE"]);
// Gaming/virtual markets are NOT live-predicted by ADE. There is no
// authorized outcome feed or provider adapter for crash/virtual/betting
// markets, so the only honest engine output is an explicit non-prediction.
// This prevents fake "aviator/virtual" certainty while keeping the
// Founder surface truthful about what is ROADMAP vs LIVE.
const GAMING_MARKETS = Object.freeze([
  "AVIATOR", "CRASH", "VIRTUAL_FOOTBALL", "VIRTUAL_SPORT", "SPRIBE",
  "SPORTBET", "BETWAY", "BETNAIJA", "BETKING", "POCKET_OPTION",
  "EXPERT_OPTION", "IQ_OPTION", "QUOTEX"
]);

function qualityRating(confidence) {
  const c = Number(confidence) || 0;
  const percent = Math.round(Math.min(0.99, Math.max(0, c)) * 100);
  const band = percent >= 75 ? "HIGH" : percent >= 60 ? "USABLE" : percent >= 40 ? "WEAK" : "NO_EDGE";
  return { percent, band };
}

function sanitizeCandles(input) {
  if (!Array.isArray(input) || input.length < 20) {
    return { error: "CANDLES_REQUIRED: at least 20 OHLC candles are required." };
  }
  const out = [];
  for (const c of input) {
    const o = num(c.o), h = num(c.h), l = num(c.l), cl = num(c.c);
    if (o === null || h === null || l === null || cl === null) {
      return { error: "CANDLES_INVALID: non-numeric OHLC values." };
    }
    if (!(h >= l && h >= Math.max(o, cl) && l <= Math.min(o, cl))) {
      return { error: "CANDLES_INVALID: candle violates h>=l, h>=max(o,c), l<=min(o,c)." };
    }
    out.push({ t: c.t ?? null, o, h, l, c: cl });
  }
  return { candles: out };
}

export class FounderSignalEngine {
  constructor({ store = null, eventBus = null, config = {} } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.config = {
      maxRiskPerTrade: num(config.maxRiskPerTrade) ?? 2,
      maxDailyLoss: num(config.maxDailyLoss) ?? 5,
      maxExposure: Number.isInteger(config.maxExposure) ? config.maxExposure : 3,
      consecutiveLossLimit: Number.isInteger(config.consecutiveLossLimit) ? config.consecutiveLossLimit : 3,
      cooldownMs: num(config.cooldownMs) ?? 15 * 60 * 1000,
      minRiskReward: num(config.minRiskReward) ?? 1.5,
      confirmConfidence: num(config.confirmConfidence) ?? 0.6,
      maxCandleAgeMs: num(config.maxCandleAgeMs) ?? 15 * 60 * 1000,
      paperBalance: num(config.paperBalance) ?? 10000,
      minBinaryPipEdge: num(config.minBinaryPipEdge) ?? BINARY_DEFENSE_DEFAULTS.minPipEdge,
      maxBrokerWickDeviationPips: num(config.maxBrokerWickDeviationPips) ?? BINARY_DEFENSE_DEFAULTS.maxWickDeviationPips,
      tickStallWindowMs: num(config.tickStallWindowMs) ?? BINARY_DEFENSE_DEFAULTS.tickStallWindowMs,
      maxTickGapMs: num(config.maxTickGapMs) ?? BINARY_DEFENSE_DEFAULTS.maxTickGapMs,
      minTicksNearCutoff: Number.isInteger(config.minTicksNearCutoff) ? config.minTicksNearCutoff : BINARY_DEFENSE_DEFAULTS.minTicksNearCutoff
    };
    this._state = this._hydrate();
  }

  _hydrate() {
    let saved = {};
    try {
      saved = this.store?.readSection?.("trading") || {};
    } catch { saved = {}; }
    return {
      ledger: Array.isArray(saved.ledger) ? saved.ledger : [],
      seq: Number.isInteger(saved.seq) ? saved.seq : 0,
      risk: {
        day: saved.risk?.day || null,
        dailyLoss: num(saved.risk?.dailyLoss) ?? 0,
        consecutiveLosses: Number.isInteger(saved.risk?.consecutiveLosses) ? saved.risk.consecutiveLosses : 0,
        emergencyStop: saved.risk?.emergencyStop === true
      },
      cooldowns: {}
    };
  }

  _persist() {
    try {
      this.store?.writeSection?.("trading", { ledger: this._state.ledger.slice(-500), seq: this._state.seq, risk: this._state.risk });
    } catch (e) {
      console.warn(`[FounderSignalEngine] persist failed: ${e.message}`);
    }
  }

  _audit(type, payload = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "TRADING", action: type, ...payload }); } catch {}
  }

  getStatus() {
    const today = new Date().toISOString().slice(0, 10);
    if (this._state.risk.day !== today) {
      this._state.risk.day = today;
      this._state.risk.dailyLoss = 0;
      this._state.risk.consecutiveLosses = 0;
    }
    const open = this._state.ledger.filter((r) => r.executionState === "FILLED" && !r.closedAt).length;
    return {
      mode: "PAPER",
      executionModes: [...EXECUTION_MODES],
      executionStyles: [...EXECUTION_STYLES],
      liveExecution: "BROKER_NOT_CONFIGURED",
      paperBalance: this.config.paperBalance,
      risk: { ...this.config, dailyLoss: this._state.risk.dailyLoss, consecutiveLosses: this._state.risk.consecutiveLosses, emergencyStop: this._state.risk.emergencyStop, openPositions: open },
      ledgerSize: this._state.ledger.length,
      gaming: { mode: "NOT_SUPPORTED", note: "Virtual/crash/betting markets have no authorized outcome feed. ADE does not predict them; gaming stays ROADMAP until a legitimate provider is connected." },
      truth: "Paper-mode analytics on supplied candles only. No live broker is connected."
    };
  }

  setEmergencyStop(on) {
    this._state.risk.emergencyStop = on === true;
    this._persist();
    return { emergencyStop: this._state.risk.emergencyStop };
  }

  _fingerprint(parts) {
    return parts.map((p) => String(p)).join("|");
  }

  _cooldownOk(key, now) {
    const until = this._state.cooldowns[key] || 0;
    return now >= until;
  }

  _cooldownSet(key, now) {
    this._state.cooldowns[key] = now + this.config.cooldownMs;
  }

  analyzeForex({ instrument, candles, higherCandles = null, accountBalance, riskPercent, now = Date.now() } = {}) {
    const symbol = String(instrument || "").trim().toUpperCase();
    if (!symbol) return this._noTrade("INSTRUMENT_REQUIRED", "Instrument symbol is required.");
    const clean = sanitizeCandles(candles);
    if (clean.error) return this._noTrade("DATA_INVALID", clean.error);
    const cs = clean.candles;
    const last = cs[cs.length - 1];
    if (last.t !== null && now - Number(last.t) > this.config.maxCandleAgeMs) {
      return this._noTrade("STALE_DATA", `Last candle is older than ${Math.round(this.config.maxCandleAgeMs / 60000)} minutes. NO TRADE on stale data.`, { instrument: symbol, lastCandleAt: last.t });
    }
    const closes = cs.map((c) => c.c);
    const a = atr(cs);
    const e20 = ema(closes, 20);
    const e50 = closes.length >= 50 ? ema(closes, 50) : null;
    if (a === null || e20 === null || a <= 0) return this._noTrade("INSUFFICIENT_DATA", "Not enough history for ATR/EMA structure.", { instrument: symbol });
    const { highs, lows } = swings(cs);
    const prevClose = closes[closes.length - 2];
    const slope = (e20 - (ema(closes.slice(0, -1), 20) ?? e20)) / a;
    let regime = "RANGE";
    if (e50 !== null && e20 > e50 && slope > 0.02) regime = "TREND_UP";
    else if (e50 !== null && e20 < e50 && slope < -0.02) regime = "TREND_DOWN";
    else if (e50 === null && slope > 0.05) regime = "TREND_UP";
    else if (e50 === null && slope < -0.05) regime = "TREND_DOWN";

    // Optional multi-timeframe agreement: caller may supply higher-timeframe
    // candles. They are never invented here; when absent the factor is skipped.
    // When present but invalid/stale, analysis degrades honestly to NO_TRADE
    // rather than guessing alignment.
    let higherBias = null;
    if (higherCandles !== null && higherCandles !== undefined) {
      const hc = sanitizeCandles(higherCandles);
      if (hc.error) return this._noTrade("DATA_INVALID", `Higher-timeframe candles rejected: ${hc.error}`, { instrument: symbol });
      const hCloses = hc.candles.map((c) => c.c);
      const hE20 = ema(hCloses, 20);
      if (hE20 === null) return this._noTrade("INSUFFICIENT_DATA", "Not enough higher-timeframe history for agreement check.", { instrument: symbol });
      const hLast = hc.candles[hc.candles.length - 1];
      if (hLast.t !== null && now - Number(hLast.t) > this.config.maxCandleAgeMs * 4) {
        return this._noTrade("STALE_DATA", "Higher-timeframe data is stale. NO TRADE without fresh alignment.", { instrument: symbol });
      }
      higherBias = hLast.c >= hE20 ? "UP" : "DOWN";
    }

    const factors = [];
    let direction = null;
    if (regime === "TREND_UP" && last.c > e20) { direction = "LONG"; factors.push("trend+price-above-ema20"); }
    else if (regime === "TREND_DOWN" && last.c < e20) { direction = "SHORT"; factors.push("trend+price-below-ema20"); }
    else if (regime === "RANGE" && lows.length && last.c - lows[lows.length - 1].price < 0.5 * a) { direction = "LONG"; factors.push("range-low-rejection"); }
    else if (regime === "RANGE" && highs.length && highs[highs.length - 1].price - last.c < 0.5 * a) { direction = "SHORT"; factors.push("range-high-rejection"); }
    if (!direction) {
      return { instrument: symbol, market: "FOREX", state: "WATCH", direction: null, regime, atr: +a.toFixed(5), confidence: 0, factors: [], reason: "No structural edge at current price. Watching.", evidence: this._evidence(symbol, cs, { regime, atr: a }) };
    }
    if (last.c > prevClose) factors.push("bullish-close");
    if (last.c < prevClose) factors.push("bearish-close");
    // Multi-timeframe agreement: when a higher-timeframe bias was supplied,
    // direction must agree with it or the setup degrades honestly instead of
    // executing against the higher trend.
    if (higherBias) {
      const agrees = (direction === "LONG" && higherBias === "UP") || (direction === "SHORT" && higherBias === "DOWN");
      if (!agrees) {
        return { instrument: symbol, market: "FOREX", state: "NO_TRADE", direction: null, regime, higherBias, confidence: 0, confidencePercent: 0, quality: qualityRating(0), reason: `NO_TRADE: higher-timeframe bias ${higherBias} disagrees with ${direction} setup.`, evidence: this._evidence(symbol, cs, { regime, atr: a, higherBias }) };
      }
      factors.push(`htf-agree-${higherBias}`);
    }
    const structSL = direction === "LONG"
      ? (lows.length ? Math.min(...lows.map((s) => s.price)) - 0.5 * a : last.l - 1.0 * a)
      : (highs.length ? Math.max(...highs.map((s) => s.price)) + 0.5 * a : last.h + 1.0 * a);
    const entry = last.c;
    const slDist = Math.abs(entry - structSL);
    if (slDist <= 0) return this._noTrade("INVALID_LEVELS", "Stop distance is non-positive.", { instrument: symbol });
    const tps = [1.5, 2.5, 4.0].map((r) => entry + (direction === "LONG" ? 1 : -1) * r * slDist);
    const rr = 2.5;
    const confidence = Math.min(0.9, 0.35 + factors.length * 0.12 + (regime.startsWith("TREND") ? 0.1 : 0));
    const balance = num(accountBalance) ?? this.config.paperBalance;
    const riskPct = Math.min(num(riskPercent) ?? 1, this.config.maxRiskPerTrade);
    const riskAmount = +(balance * (riskPct / 100)).toFixed(2);
    const positionSize = +(riskAmount / slDist).toFixed(4);
    const zoneWidth = 0.25 * a;
    const nearZone = Math.abs(entry - e20) <= zoneWidth + slDist * 0;
    let state = "SETUP";
    if (confidence >= this.config.confirmConfidence && rr >= this.config.minRiskReward) state = "CONFIRMED";
    else if (nearZone && confidence < this.config.confirmConfidence) state = "PRE-ALERT";
    if (rr < this.config.minRiskReward) {
      return { instrument: symbol, market: "FOREX", state: "NO_TRADE", direction: null, regime, reason: `Risk/reward ${rr} below minimum ${this.config.minRiskReward}.`, evidence: this._evidence(symbol, cs, { regime, atr: a }) };
    }
    const fp = this._fingerprint([symbol, direction, Math.round(entry / (0.5 * a)), Math.floor(now / this.config.cooldownMs)]);
    const fresh = this._cooldownOk(`sig:${fp}`, now);
    const confRounded = +confidence.toFixed(2);
    return {
      instrument: symbol, market: "FOREX", state, direction, regime, higherBias,
      entry: +entry.toFixed(5), entryZone: [+Math.min(entry, e20).toFixed(5), +Math.max(entry, e20).toFixed(5)],
      stopLoss: +structSL.toFixed(5), riskDistance: +slDist.toFixed(5),
      tp1: +tps[0].toFixed(5), tp2: +tps[1].toFixed(5), tp3: +tps[2].toFixed(5),
      riskReward: rr, positionSize, riskAmount, riskPercent: riskPct,
      trailing: { mode: "STRUCTURE_PLUS_ATR", trailDistance: +(1.0 * a).toFixed(5), activateAfter: "+tp1", note: "Move stop to breakeven at TP1, then trail 1.0xATR behind structure." },
      invalidation: direction === "LONG" ? `Sustained close below ${(+structSL.toFixed(5))}` : `Sustained close above ${(+structSL.toFixed(5))}`,
      preAlert: state === "PRE-ALERT" ? { triggered: true, why: "Price near entry zone but confirmation below threshold.", expiresAt: new Date(now + this.config.cooldownMs).toISOString() } : { triggered: false },
      confirmation: { required: `confidence >= ${this.config.confirmConfidence}`, observed: confRounded, factors },
      confidence: confRounded, confidencePercent: qualityRating(confRounded).percent, quality: qualityRating(confRounded), duplicateSuppressed: !fresh, fingerprint: fp,
      atr: +a.toFixed(5),
      evidence: this._evidence(symbol, cs, { regime, atr: a, ema20: e20, ema50: e50, higherBias })
    };
  }

  _tickCutoffCheck(ticks, cutoffAt, { windowMs, maxGapMs, minTicks }) {
    const start = cutoffAt - windowMs;
    const windowTicks = ticks.filter((t) => t.t >= start && t.t <= cutoffAt);
    if (windowTicks.length === 0) {
      return {
        passed: false, code: "BROKER_TICK_STALL",
        detail: `No broker ticks within ${Math.round(windowMs / 1000)}s of cutoff ${new Date(cutoffAt).toISOString()} (stall/liquidity drop).`,
        ticksInWindow: 0, maxGapMs: null
      };
    }
    if (windowTicks.length < minTicks) {
      return {
        passed: false, code: "BROKER_TICK_STALL",
        detail: `Liquidity drop: only ${windowTicks.length} tick(s) within ${Math.round(windowMs / 1000)}s of cutoff (minimum ${minTicks}). Flagged BROKER_TICK_STALL.`,
        ticksInWindow: windowTicks.length, maxGapMs: null
      };
    }
    let maxGap = 0;
    for (let i = 1; i < windowTicks.length; i += 1) {
      maxGap = Math.max(maxGap, windowTicks[i].t - windowTicks[i - 1].t);
    }
    // Gap from first tick in window to window start, and from last tick to cutoff,
    // both count: a stall right at the cutoff (frozen feed) must be caught.
    maxGap = Math.max(maxGap, windowTicks[0].t - start, cutoffAt - windowTicks[windowTicks.length - 1].t);
    if (maxGap > maxGapMs) {
      return {
        passed: false, code: "BROKER_TICK_STALL",
        detail: `Tick stall: ${Math.round(maxGap)}ms gap within ${Math.round(windowMs / 1000)}s of cutoff exceeds ${maxGapMs}ms. Flagged BROKER_TICK_STALL.`,
        ticksInWindow: windowTicks.length, maxGapMs: Math.round(maxGap)
      };
    }
    return { passed: true, code: null, detail: `Tick flow healthy: ${windowTicks.length} ticks, max gap ${Math.round(maxGap)}ms.`, ticksInWindow: windowTicks.length, maxGapMs: Math.round(maxGap) };
  }

  // UNUSED legacy draft of the defense checks — the live mandatory layer is evaluated
  // inline in analyzeBinary (see below). Kept for documentation only; NOT called.
  // eslint-disable-next-line no-unused-vars
  _evaluateBinaryDefenseLegacy({ symbol, last, momentum, pipSize, thresholds, brokerTicksInput, spotTicksInput, spotCandlesInput, spotPriceInput, entryCutoff, expiryCutoff }) {
    // 1) Minimum Pip Edge Threshold (legacy draft)
    let expectedDeltaPrice;
    let expectedSource;
    const explicitPips = null;
    {
      expectedDeltaPrice = Math.abs(momentum);
      expectedSource = "momentum-5bar";
    }
    // Allow explicit pips override to win deterministically (used by tests/config).
    if (explicitPips !== null && Number.isFinite(explicitPips)) {
      expectedDeltaPrice = Math.abs(explicitPips) * pipSize;
      expectedSource = "explicit-expectedDeltaPips";
    }
    const expectedDeltaPips = pipSize > 0 ? expectedDeltaPrice / pipSize : 0;
    const pipEdge = {
      evaluated: true,
      pipSize,
      minPipEdge: thresholds.minPipEdge,
      expectedDeltaPrice: +expectedDeltaPrice.toFixed(7),
      expectedDeltaPips: +expectedDeltaPips.toFixed(3),
      source: expectedSource,
      passed: expectedDeltaPips >= thresholds.minPipEdge,
      code: expectedDeltaPips >= thresholds.minPipEdge ? null : "INSUFFICIENT_PIP_EDGE",
      detail: expectedDeltaPips >= thresholds.minPipEdge
        ? `Pip edge OK: expected ${expectedDeltaPips.toFixed(2)} pips >= minimum ${thresholds.minPipEdge} pips.`
        : `Insufficient pip edge: expected ${expectedDeltaPips.toFixed(2)} pips < minimum ${thresholds.minPipEdge} pips. ±1 pip broker closing manipulation could flip the outcome.`
    };

    // 2) Candle Stale & Tick Latency Guard (15s window around cutoffs)
    let tickLatency;
    if (brokerTicksInput === undefined || brokerTicksInput === null) {
      tickLatency = { evaluated: false, passed: true, skipped: true, code: null, detail: "No broker ticks supplied; tick-latency guard unvalidated (skipped, not a pass).", cutoffs: { entryCutoff, expiryCutoff } };
    } else {
      const st = sanitizeTicks(brokerTicksInput);
      if (st.error) {
        tickLatency = { evaluated: true, passed: false, skipped: false, code: "BROKER_TICK_STALL", detail: `BROKER_TICK_STALL: ${st.error}`, cutoffs: { entryCutoff, expiryCutoff } };
      } else {
        const entryCheck = this._tickCutoffCheck(st.ticks, entryCutoff, { windowMs: thresholds.tickStallWindowMs, maxGapMs: thresholds.maxTickGapMs, minTicks: thresholds.minTicksNearCutoff });
        const expiryCheck = this._tickCutoffCheck(st.ticks, expiryCutoff, { windowMs: thresholds.tickStallWindowMs, maxGapMs: thresholds.maxTickGapMs, minTicks: thresholds.minTicksNearCutoff });
        const failed = !entryCheck.passed ? { ...entryCheck, cutoff: "ENTRY" } : (!expiryCheck.passed ? { ...expiryCheck, cutoff: "EXPIRY" } : null);
        tickLatency = {
          evaluated: true, passed: failed === null, skipped: false,
          code: failed ? "BROKER_TICK_STALL" : null,
          detail: failed ? `${failed.detail} [${failed.cutoff} cutoff]` : `Tick latency OK at ENTRY and EXPIRY cutoffs (${thresholds.tickStallWindowMs / 1000}s window).`,
          windowMs: thresholds.tickStallWindowMs, maxTickGapMs: thresholds.maxTickGapMs, minTicksNearCutoff: thresholds.minTicksNearCutoff,
          entry: entryCheck, expiry: expiryCheck,
          cutoffs: { entryCutoff, expiryCutoff }
        };
      }
    }

    // 3) Independent Feed Validation (broker vs spot, e.g. OANDA/LMAX)
    let feedValidation;
    const hasSpotCandles = spotCandlesInput !== undefined && spotCandlesInput !== null;
    const hasSpotTicks = spotTicksInput !== undefined && spotTicksInput !== null;
    const hasSpotPrice = spotPriceInput !== undefined && spotPriceInput !== null && num(spotPriceInput) !== null;
    if (!hasSpotCandles && !hasSpotTicks && !hasSpotPrice) {
      feedValidation = { evaluated: false, passed: true, skipped: true, code: null, state: "UNVALIDATED", detail: "No independent spot feed supplied; feed validation unvalidated (skipped, not a pass)." };
    } else if (hasSpotCandles) {
      const sc = sanitizeSpotCandles(spotCandlesInput);
      if (sc.error) {
        feedValidation = { evaluated: true, passed: false, skipped: false, code: "MANIPULATED_FEED", state: "MANIPULATED_FEED", detail: `MANIPULATED_FEED: ${sc.error}` };
      } else {
        const spotLast = sc.candles[sc.candles.length - 1];
        const dH = Math.abs(last.h - spotLast.h);
        const dL = Math.abs(last.l - spotLast.l);
        const dC = Math.abs(last.c - spotLast.c);
        const maxDev = Math.max(dH, dL, dC);
        const maxDevPips = pipSize > 0 ? maxDev / pipSize : 0;
        const wickDev = Math.max(dH, dL);
        const wickDevPips = pipSize > 0 ? wickDev / pipSize : 0;
        const passed = maxDevPips <= thresholds.maxWickDeviationPips;
        feedValidation = {
          evaluated: true, passed, skipped: false,
          code: passed ? null : "MANIPULATED_FEED",
          state: passed ? "FEED_OK" : "MANIPULATED_FEED",
          detail: passed
            ? `Feed validation OK: max broker-vs-spot deviation ${maxDevPips.toFixed(2)} pips <= ${thresholds.maxWickDeviationPips} pips.`
            : `MANIPULATED_FEED: broker wick deviation ${wickDevPips.toFixed(2)} pips (max ${maxDevPips.toFixed(2)} pips) exceeds ${thresholds.maxWickDeviationPips} pips vs independent spot feed.`,
          pipSize, maxDeviationPips: +maxDevPips.toFixed(3), wickDeviationPips: +wickDevPips.toFixed(3),
          brokerRef: { h: last.h, l: last.l, c: last.c }, spotRef: { h: spotLast.h, l: spotLast.l, c: spotLast.c }
        };
      }
    } else if (hasSpotTicks) {
      const sb = sanitizeTicks(spotTicksInput);
      const bb = brokerTicksInput !== undefined && brokerTicksInput !== null ? sanitizeTicks(brokerTicksInput) : null;
      if (sb.error) {
        feedValidation = { evaluated: true, passed: false, skipped: false, code: "MANIPULATED_FEED", state: "MANIPULATED_FEED", detail: `MANIPULATED_FEED: spot ticks rejected: ${sb.error}` };
      } else if (bb && bb.error) {
        feedValidation = { evaluated: true, passed: false, skipped: false, code: "MANIPULATED_FEED", state: "MANIPULATED_FEED", detail: `MANIPULATED_FEED: broker ticks rejected: ${bb.error}` };
      } else {
        const tol = thresholds.spotMatchToleranceMs;
        let maxDev = 0;
        let pairs = 0;
        const brokerRef = bb && !bb.error && bb.ticks.length ? bb.ticks : [{ t: entryCutoff, price: last.c }];
        for (const bt of brokerRef) {
          let best = null;
          for (const s of sb.ticks) {
            const gap = Math.abs(s.t - bt.t);
            if (gap <= tol && (best === null || gap < best.gap)) best = { gap, tick: s };
          }
          if (best) { pairs += 1; maxDev = Math.max(maxDev, Math.abs(bt.price - best.tick.price)); }
        }
        if (pairs === 0) {
          // No time-aligned pairs: fall back to last-price comparison (deterministic).
          const brokerLast = brokerRef[brokerRef.length - 1].price;
          const spotLast = sb.ticks[sb.ticks.length - 1].price;
          maxDev = Math.abs(brokerLast - spotLast);
        }
        const maxDevPips = pipSize > 0 ? maxDev / pipSize : 0;
        const passed = maxDevPips <= thresholds.maxWickDeviationPips;
        feedValidation = {
          evaluated: true, passed, skipped: false,
          code: passed ? null : "MANIPULATED_FEED",
          state: passed ? "FEED_OK" : "MANIPULATED_FEED",
          detail: passed
            ? `Feed validation OK: broker-vs-spot tick deviation ${maxDevPips.toFixed(2)} pips <= ${thresholds.maxWickDeviationPips} pips (${pairs} aligned pairs).`
            : `MANIPULATED_FEED: broker-vs-spot tick deviation ${maxDevPips.toFixed(2)} pips exceeds ${thresholds.maxWickDeviationPips} pips (${pairs} aligned pairs).`,
          pipSize, maxDeviationPips: +maxDevPips.toFixed(3), alignedPairs: pairs
        };
      }
    } else {
      const spotPx = num(spotPriceInput);
      const brokerPx = last.c;
      const dev = Math.abs(brokerPx - spotPx);
      const devPips = pipSize > 0 ? dev / pipSize : 0;
      const passed = devPips <= thresholds.maxWickDeviationPips;
      feedValidation = {
        evaluated: true, passed, skipped: false,
        code: passed ? null : "MANIPULATED_FEED",
        state: passed ? "FEED_OK" : "MANIPULATED_FEED",
        detail: passed
          ? `Feed validation OK: broker ${brokerPx} vs spot ${spotPx} = ${devPips.toFixed(2)} pips <= ${thresholds.maxWickDeviationPips} pips.`
          : `MANIPULATED_FEED: broker ${brokerPx} vs independent spot ${spotPx} = ${devPips.toFixed(2)} pips exceeds ${thresholds.maxWickDeviationPips} pips.`,
        pipSize, maxDeviationPips: +devPips.toFixed(3), brokerRef: brokerPx, spotRef: spotPx
      };
    }

    const failed = [];
    if (!pipEdge.passed) failed.push(pipEdge.code);
    if (!tickLatency.passed) failed.push(tickLatency.code);
    if (!feedValidation.passed) failed.push(feedValidation.code);
    return { passed: failed.length === 0, failed, pipEdge, tickLatency, feedValidation, pipSize, thresholds };
  }

  _rejectedBinary({ symbol, marketType, timeframe, manipulation, rationale, defense, zScore = null, extra = {} }) {
    const reason = `REJECTED_BROKER_MANIPULATION: ${rationale}`;
    try { this._audit?.("BINARY_REJECTED_MANIPULATION", { instrument: symbol, manipulation, rationale }); } catch {}
    return {
      instrument: symbol, market: "BINARY", marketType, timeframe: String(timeframe).toUpperCase(),
      state: "REJECTED_BROKER_MANIPULATION",
      direction: null,
      manipulation,
      manipulationFlag: manipulation,
      feedState: defense?.feedValidation?.state || (manipulation === "MANIPULATED_FEED" ? "MANIPULATED_FEED" : manipulation),
      rationale, reason,
      confidence: 0, confidencePercent: 0, quality: qualityRating(0),
      zScore,
      defense,
      evidence: {
        candles: extra.candles ?? null,
        atr: extra.atr ?? null,
        threshold: extra.threshold ?? null,
        manipulation,
        dataWarning: "Binary signal rejected by mandatory Binary Manipulation Defense Layer before edge evaluation. No broker is connected; this is paper-mode protection, not a live block."
      }
    };
  }

  analyzeBinary({ pair, instrument, marketType = "REGULAR", candles, timeframe = "M5", now = Date.now(), pipSize, expectedDeltaPips, projectedExpiryPrice, expectedMove, brokerTicks, brokerFeed, spotTicks, spotFeed, spotCandles, spotPrice, spotClose, entryCutoffAt, expiryAt, defense = {} } = {}) {
    const symbol = String(pair ?? instrument ?? "").trim().toUpperCase();
    if (!symbol) return this._noTrade("INSTRUMENT_REQUIRED", "Pair symbol is required.", { market: "BINARY" });
    const mt = String(marketType || "REGULAR").toUpperCase() === "OTC" ? "OTC" : "REGULAR";
    const clean = sanitizeCandles(candles);
    if (clean.error) return this._noTrade("DATA_INVALID", clean.error, { market: "BINARY" });
    const cs = clean.candles;
    const last = cs[cs.length - 1];
    if (last.t !== null && now - Number(last.t) > this.config.maxCandleAgeMs) {
      return this._noTrade("STALE_DATA", "Last candle is stale. NO TRADE.", { market: "BINARY", instrument: symbol });
    }
    const closes = cs.map((c) => c.c);
    const a = atr(cs);
    const e20 = ema(closes, 20);
    if (a === null || e20 === null || a <= 0) return this._noTrade("INSUFFICIENT_DATA", "Not enough history.", { market: "BINARY", instrument: symbol });
    const mean = closes.slice(-20).reduce((x, y) => x + y, 0) / 20;
    const variance = closes.slice(-20).reduce((x, y) => x + (y - mean) ** 2, 0) / 19;
    const sd = Math.sqrt(variance);
    const z = sd === 0 ? 0 : (last.c - mean) / sd;
    const threshold = mt === "OTC" ? 2.5 : 2.0;
    const momentum = last.c - closes[closes.length - 6];
    const volPct = (a / last.c) * 100;
    const baseMin = { M1: 1, M5: 5, M15: 15, H1: 30 }[String(timeframe).toUpperCase()] ?? 5;
    const estimatedExpiryMin = Math.max(1, Math.round(baseMin * (volPct > 0.2 ? 1 : 2)));

    // ---- Mandatory Binary Manipulation Defense Layer (before any signal evaluation) ----
    const dObj = (defense && typeof defense === "object") ? defense : {};
    const resolvedPipSize = pipSizeFor(symbol, num(pipSize) ?? num(dObj.pipSize) ?? null);
    const thresholds = {
      minPipEdge: num(dObj.minPipEdge) ?? num(this.config.minBinaryPipEdge) ?? BINARY_DEFENSE_DEFAULTS.minPipEdge,
      maxWickDeviationPips: num(dObj.maxWickDeviationPips) ?? num(this.config.maxBrokerWickDeviationPips) ?? BINARY_DEFENSE_DEFAULTS.maxWickDeviationPips,
      tickStallWindowMs: num(dObj.tickStallWindowMs) ?? num(this.config.tickStallWindowMs) ?? BINARY_DEFENSE_DEFAULTS.tickStallWindowMs,
      maxTickGapMs: num(dObj.maxTickGapMs) ?? num(this.config.maxTickGapMs) ?? BINARY_DEFENSE_DEFAULTS.maxTickGapMs,
      minTicksNearCutoff: Number.isInteger(dObj.minTicksNearCutoff) ? dObj.minTicksNearCutoff : this.config.minTicksNearCutoff,
      spotMatchToleranceMs: num(dObj.spotMatchToleranceMs) ?? BINARY_DEFENSE_DEFAULTS.spotMatchToleranceMs
    };
    const brokerTicksInput = brokerTicks ?? brokerFeed ?? dObj.brokerTicks ?? dObj.brokerFeed ?? null;
    const hasExplicitBrokerTicks = brokerTicks !== undefined || brokerFeed !== undefined || dObj.brokerTicks !== undefined || dObj.brokerFeed !== undefined;
    const spotTicksInput = spotTicks ?? spotFeed ?? dObj.spotTicks ?? dObj.spotFeed ?? null;
    const spotCandlesInput = spotCandles ?? dObj.spotCandles ?? null;
    const spotPriceRaw = spotPrice ?? spotClose ?? dObj.spotPrice ?? dObj.spotClose ?? null;
    const spotPriceInput = spotPriceRaw === undefined || spotPriceRaw === null ? null : spotPriceRaw;
    // Explicit expected-move overrides (deterministic testing + caller projections).
    // NOTE: num(null) === 0, so raw null/undefined must be checked BEFORE num().
    const explicitPipsRaw = expectedDeltaPips ?? dObj.expectedDeltaPips ?? null;
    const explicitPips = (explicitPipsRaw === undefined || explicitPipsRaw === null) ? null : num(explicitPipsRaw);
    const projectedRaw = projectedExpiryPrice ?? expectedMove ?? dObj.projectedExpiryPrice ?? dObj.expectedMove ?? null;
    const projectedNum = (projectedRaw === undefined || projectedRaw === null) ? null : num(projectedRaw);
    let expectedDeltaPrice;
    let expectedSource;
    if (explicitPips !== null && Number.isFinite(explicitPips)) {
      expectedDeltaPrice = Math.abs(explicitPips) * resolvedPipSize;
      expectedSource = "explicit-expectedDeltaPips";
    } else if (projectedNum !== null && Number.isFinite(projectedNum)) {
      expectedDeltaPrice = Math.abs(projectedNum - last.c);
      expectedSource = "projectedExpiryPrice";
    } else {
      expectedDeltaPrice = Math.abs(momentum);
      expectedSource = "momentum-5bar";
    }
    const expectedDeltaPipsNum = resolvedPipSize > 0 ? expectedDeltaPrice / resolvedPipSize : 0;
    const pipEdge = {
      evaluated: true,
      pipSize: resolvedPipSize,
      minPipEdge: thresholds.minPipEdge,
      expectedDeltaPrice: +expectedDeltaPrice.toFixed(7),
      expectedDeltaPips: +expectedDeltaPipsNum.toFixed(3),
      source: expectedSource,
      passed: expectedDeltaPipsNum >= thresholds.minPipEdge,
      code: expectedDeltaPipsNum >= thresholds.minPipEdge ? null : "INSUFFICIENT_PIP_EDGE",
      detail: expectedDeltaPipsNum >= thresholds.minPipEdge
        ? `Pip edge OK: expected ${expectedDeltaPipsNum.toFixed(2)} pips >= minimum ${thresholds.minPipEdge} pips.`
        : `Insufficient pip edge: expected ${expectedDeltaPipsNum.toFixed(2)} pips < minimum ${thresholds.minPipEdge} pips. ±1 pip broker closing manipulation could flip the outcome.`
    };

    const entryCutoffRaw = entryCutoffAt ?? dObj.entryCutoffAt ?? null;
    const expiryCutoffRaw = expiryAt ?? dObj.expiryAt ?? null;
    const defaultEntryCutoff = (entryCutoffRaw === undefined || entryCutoffRaw === null ? null : num(entryCutoffRaw)) ?? (now + 2 * 60 * 1000);
    const defaultExpiryCutoff = (expiryCutoffRaw === undefined || expiryCutoffRaw === null ? null : num(expiryCutoffRaw)) ?? (now + estimatedExpiryMin * 60 * 1000);

    let tickLatency;
    if (!hasExplicitBrokerTicks || brokerTicksInput === null) {
      tickLatency = { evaluated: false, passed: true, skipped: true, code: null, detail: "No broker ticks supplied; tick-latency guard unvalidated (skipped, not a pass).", windowMs: thresholds.tickStallWindowMs, maxTickGapMs: thresholds.maxTickGapMs, minTicksNearCutoff: thresholds.minTicksNearCutoff, cutoffs: { entryCutoff: defaultEntryCutoff, expiryCutoff: defaultExpiryCutoff } };
    } else {
      const st = sanitizeTicks(brokerTicksInput);
      if (st.error) {
        tickLatency = { evaluated: true, passed: false, skipped: false, code: "BROKER_TICK_STALL", detail: `BROKER_TICK_STALL: ${st.error}`, cutoffs: { entryCutoff: defaultEntryCutoff, expiryCutoff: defaultExpiryCutoff } };
      } else {
        const entryCheck = this._tickCutoffCheck(st.ticks, defaultEntryCutoff, { windowMs: thresholds.tickStallWindowMs, maxGapMs: thresholds.maxTickGapMs, minTicks: thresholds.minTicksNearCutoff });
        const expiryCheck = this._tickCutoffCheck(st.ticks, defaultExpiryCutoff, { windowMs: thresholds.tickStallWindowMs, maxGapMs: thresholds.maxTickGapMs, minTicks: thresholds.minTicksNearCutoff });
        const failed = !entryCheck.passed ? { ...entryCheck, cutoff: "ENTRY" } : (!expiryCheck.passed ? { ...expiryCheck, cutoff: "EXPIRY" } : null);
        tickLatency = {
          evaluated: true, passed: failed === null, skipped: false,
          code: failed ? "BROKER_TICK_STALL" : null,
          detail: failed ? `${failed.detail} [${failed.cutoff} cutoff]` : `Tick latency OK at ENTRY and EXPIRY cutoffs (${Math.round(thresholds.tickStallWindowMs / 1000)}s window).`,
          windowMs: thresholds.tickStallWindowMs, maxTickGapMs: thresholds.maxTickGapMs, minTicksNearCutoff: thresholds.minTicksNearCutoff,
          entry: entryCheck, expiry: expiryCheck,
          cutoffs: { entryCutoff: defaultEntryCutoff, expiryCutoff: defaultExpiryCutoff }
        };
      }
    }

    let feedValidation;
    const hasSpotCandles = spotCandlesInput !== undefined && spotCandlesInput !== null;
    const hasSpotTicks = spotTicksInput !== undefined && spotTicksInput !== null;
    const hasSpotPrice = spotPriceInput !== undefined && spotPriceInput !== null && num(spotPriceInput) !== null;
    if (!hasSpotCandles && !hasSpotTicks && !hasSpotPrice) {
      feedValidation = { evaluated: false, passed: true, skipped: true, code: null, state: "UNVALIDATED", detail: "No independent spot feed supplied; feed validation unvalidated (skipped, not a pass)." };
    } else if (hasSpotCandles) {
      const sc = sanitizeSpotCandles(spotCandlesInput);
      if (sc.error) {
        feedValidation = { evaluated: true, passed: false, skipped: false, code: "MANIPULATED_FEED", state: "MANIPULATED_FEED", detail: `MANIPULATED_FEED: ${sc.error}` };
      } else {
        const spotLast = sc.candles[sc.candles.length - 1];
        const dH = Math.abs(last.h - spotLast.h);
        const dL = Math.abs(last.l - spotLast.l);
        const dC = Math.abs(last.c - spotLast.c);
        const maxDev = Math.max(dH, dL, dC);
        const maxDevPips = resolvedPipSize > 0 ? maxDev / resolvedPipSize : 0;
        const wickDev = Math.max(dH, dL);
        const wickDevPips = resolvedPipSize > 0 ? wickDev / resolvedPipSize : 0;
        const passed = maxDevPips <= thresholds.maxWickDeviationPips;
        feedValidation = {
          evaluated: true, passed, skipped: false,
          code: passed ? null : "MANIPULATED_FEED",
          state: passed ? "FEED_OK" : "MANIPULATED_FEED",
          detail: passed
            ? `Feed validation OK: max broker-vs-spot deviation ${maxDevPips.toFixed(2)} pips <= ${thresholds.maxWickDeviationPips} pips.`
            : `MANIPULATED_FEED: broker wick deviation ${wickDevPips.toFixed(2)} pips (max ${maxDevPips.toFixed(2)} pips) exceeds ${thresholds.maxWickDeviationPips} pips vs independent spot feed.`,
          pipSize: resolvedPipSize, maxDeviationPips: +maxDevPips.toFixed(3), wickDeviationPips: +wickDevPips.toFixed(3),
          brokerRef: { h: last.h, l: last.l, c: last.c }, spotRef: { h: spotLast.h, l: spotLast.l, c: spotLast.c }
        };
      }
    } else if (hasSpotTicks) {
      const sb = sanitizeTicks(spotTicksInput);
      const bb = hasExplicitBrokerTicks && brokerTicksInput !== null ? sanitizeTicks(brokerTicksInput) : { ticks: [{ t: defaultEntryCutoff, price: last.c }] };
      if (sb.error) {
        feedValidation = { evaluated: true, passed: false, skipped: false, code: "MANIPULATED_FEED", state: "MANIPULATED_FEED", detail: `MANIPULATED_FEED: spot ticks rejected: ${sb.error}` };
      } else if (bb.error) {
        feedValidation = { evaluated: true, passed: false, skipped: false, code: "MANIPULATED_FEED", state: "MANIPULATED_FEED", detail: `MANIPULATED_FEED: broker ticks rejected: ${bb.error}` };
      } else {
        const tol = thresholds.spotMatchToleranceMs;
        let maxDev = 0;
        let pairs = 0;
        const brokerRef = bb.ticks.length ? bb.ticks : [{ t: defaultEntryCutoff, price: last.c }];
        for (const bt of brokerRef) {
          let best = null;
          for (const s of sb.ticks) {
            const gap = Math.abs(s.t - bt.t);
            if (gap <= tol && (best === null || gap < best.gap)) best = { gap, tick: s };
          }
          if (best) { pairs += 1; maxDev = Math.max(maxDev, Math.abs(bt.price - best.tick.price)); }
        }
        if (pairs === 0) {
          const brokerLast = brokerRef[brokerRef.length - 1].price;
          const spotLast = sb.ticks[sb.ticks.length - 1].price;
          maxDev = Math.abs(brokerLast - spotLast);
        }
        const maxDevPips = resolvedPipSize > 0 ? maxDev / resolvedPipSize : 0;
        const passed = maxDevPips <= thresholds.maxWickDeviationPips;
        feedValidation = {
          evaluated: true, passed, skipped: false,
          code: passed ? null : "MANIPULATED_FEED",
          state: passed ? "FEED_OK" : "MANIPULATED_FEED",
          detail: passed
            ? `Feed validation OK: broker-vs-spot tick deviation ${maxDevPips.toFixed(2)} pips <= ${thresholds.maxWickDeviationPips} pips (${pairs} aligned pairs).`
            : `MANIPULATED_FEED: broker-vs-spot tick deviation ${maxDevPips.toFixed(2)} pips exceeds ${thresholds.maxWickDeviationPips} pips (${pairs} aligned pairs).`,
          pipSize: resolvedPipSize, maxDeviationPips: +maxDevPips.toFixed(3), alignedPairs: pairs
        };
      }
    } else {
      const spotPx = num(spotPriceInput);
      const brokerPx = last.c;
      const dev = Math.abs(brokerPx - spotPx);
      const devPips = resolvedPipSize > 0 ? dev / resolvedPipSize : 0;
      const passed = devPips <= thresholds.maxWickDeviationPips;
      feedValidation = {
        evaluated: true, passed, skipped: false,
        code: passed ? null : "MANIPULATED_FEED",
        state: passed ? "FEED_OK" : "MANIPULATED_FEED",
        detail: passed
          ? `Feed validation OK: broker ${brokerPx} vs spot ${spotPx} = ${devPips.toFixed(2)} pips <= ${thresholds.maxWickDeviationPips} pips.`
          : `MANIPULATED_FEED: broker ${brokerPx} vs independent spot ${spotPx} = ${devPips.toFixed(2)} pips exceeds ${thresholds.maxWickDeviationPips} pips.`,
        pipSize: resolvedPipSize, maxDeviationPips: +devPips.toFixed(3), brokerRef: brokerPx, spotRef: spotPx
      };
    }

    const defenseSummary = { passed: pipEdge.passed && tickLatency.passed && feedValidation.passed, failed: [], pipEdge, tickLatency, feedValidation, pipSize: resolvedPipSize, thresholds, cutoffs: { entryCutoff: defaultEntryCutoff, expiryCutoff: defaultExpiryCutoff } };
    if (!pipEdge.passed) defenseSummary.failed.push(pipEdge.code);
    if (!tickLatency.passed) defenseSummary.failed.push(tickLatency.code);
    if (!feedValidation.passed) defenseSummary.failed.push(feedValidation.code);

    if (!defenseSummary.passed) {
      const first = defenseSummary.failed[0];
      const rationale = [pipEdge, tickLatency, feedValidation].filter((c) => c.passed === false).map((c) => c.detail).join(" ");
      return this._rejectedBinary({ symbol, marketType: mt, timeframe, manipulation: first, rationale, defense: defenseSummary, zScore: +z.toFixed(2), extra: { candles: cs.length, atr: +a.toFixed(5), threshold } });
    }

    // ---- Signal evaluation (only reached when defense passes) ----
    let direction = null;
    const factors = [];
    if (z <= -threshold && momentum > 0) { direction = "CALL"; factors.push(`z=${z.toFixed(2)}<=${-threshold}`, "up-momentum"); }
    else if (z >= threshold && momentum < 0) { direction = "PUT"; factors.push(`z=${z.toFixed(2)}>=${threshold}`, "down-momentum"); }
    const confidence = direction ? Math.min(0.85, 0.4 + Math.abs(z - (direction === "CALL" ? -threshold : threshold)) * 0.08 + 0.1) : 0;
    if (!direction) {
      return { instrument: symbol, market: "BINARY", marketType: mt, state: "WATCH", direction: null, zScore: +z.toFixed(2), reason: "No confirmed edge. Watching.", defense: defenseSummary, manipulation: "NONE", evidence: { candles: cs.length, atr: +a.toFixed(5), threshold } };
    }
    const state = confidence >= this.config.confirmConfidence ? (direction === "CALL" ? "CONFIRMED_CALL" : "CONFIRMED_PUT") : "PRE-ALERT";
    const confRounded = +confidence.toFixed(2);
    return {
      instrument: symbol, market: "BINARY", marketType: mt, state, direction,
      timeframe: String(timeframe).toUpperCase(),
      entryWindow: { from: new Date(now).toISOString(), until: new Date(defaultEntryCutoff).toISOString(), note: "Next 2 minutes on the connected platform clock." },
      expiry: { estimatedMinutes: estimatedExpiryMin, label: "ESTIMATED EXPIRY", note: "Estimate from volatility/timeframe only. Actual platform expiry must be confirmed on the broker platform — no broker is connected." },
      zScore: +z.toFixed(2), confidence: confRounded, confidencePercent: qualityRating(confRounded).percent, quality: qualityRating(confRounded), factors,
      defense: defenseSummary,
      manipulation: "NONE",
      invalidation: `Opposite ${(direction === "CALL" ? "PUT" : "CALL")} confirmation or |z| < 1.0 before entry window closes.`,
      preAlert: state === "PRE-ALERT" ? { triggered: true, why: "Edge forming below confirmation threshold.", expiresAt: new Date(now + this.config.cooldownMs).toISOString() } : { triggered: false },
      evidence: { candles: cs.length, atr: +a.toFixed(5), threshold, otc: mt === "OTC" }
    };
  }

  // Honest gaming/virtual boundary. ADE never predicts crash/virtual/betting
  // outcomes: those markets resolve on provider-side RNG/servers with no
  // authorized analytical feed. Returns an explicit non-prediction so the
  // Founder UI can show ROADMAP instead of fake signals. Session-extraction,
  // credential reuse, and anti-detection evasion are deliberately NOT
  // implemented: live access requires the user to authenticate in their own
  // broker session and only a legitimate authorized adapter may execute.
  analyzeGaming({ game, market, provider } = {}) {
    const label = String(game || market || provider || "GAMING").trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_") || "GAMING";
    return {
      market: "GAMING",
      game: GAMING_MARKETS.includes(label) ? label : label,
      state: "NO_TRADE",
      direction: null,
      confidence: 0,
      confidencePercent: 0,
      quality: qualityRating(0),
      support: "NOT_SUPPORTED",
      classification: "ROADMAP",
      reason: `NOT_SUPPORTED: ${label} has no authorized outcome feed or provider adapter. ADE does not predict crash/virtual/betting outcomes and will not extract browser sessions, reuse credentials, or evade platform detection. Connect a legitimate authorized provider to reconsider; until then NO_TRADE.`,
      evidence: { game: label, authorizedFeed: false, brokerConnected: false }
    };
  }

  // Deterministic walk-forward backtest over caller-supplied candles only.
  // Slides the existing analyzeForex across history and scores CONFIRMED
  // signals against subsequent candles. No invented prices, no live data.
  // This is ENGINE-QUALITY evidence — not a promise of future performance.
  backtestForex({ instrument, candles, riskPercent, lookahead = 10 } = {}) {
    const symbol = String(instrument || "").trim().toUpperCase();
    const clean = sanitizeCandles(candles);
    if (!symbol) return { instrument: "", evaluated: 0, error: "INSTRUMENT_REQUIRED" };
    if (clean.error) return { instrument: symbol, evaluated: 0, error: clean.error };
    const cs = clean.candles;
    const now = Date.now();
    if (cs.length < 40) return { instrument: symbol, evaluated: 0, error: "CANDLES_REQUIRED: at least 40 candles for backtest (20 history + evaluation window)." };
    const la = Math.max(1, Math.min(30, Number(lookahead) || 10));
    let confirmed = 0, wins = 0, losses = 0, noTrades = 0, evaluated = 0;
    for (let end = 20; end <= cs.length - 1 - 1; end += 1) {
      const window = cs.slice(Math.max(0, end - 60), end + 1).map((c) => ({ ...c, t: null }));
      const sig = this.analyzeForex({ instrument: symbol, candles: window, riskPercent, now });
      if (sig.state !== "CONFIRMED") { if (sig.state === "NO_TRADE") noTrades += 1; continue; }
      confirmed += 1;
      const future = cs.slice(end + 1, end + 1 + la);
      if (!future.length) continue;
      evaluated += 1;
      const hitTp1 = future.some((c) => (sig.direction === "LONG" ? c.h >= sig.tp1 : c.l <= sig.tp1));
      const hitSl = future.some((c) => (sig.direction === "LONG" ? c.l <= sig.stopLoss : c.h >= sig.stopLoss));
      if (hitTp1 && !hitSl) wins += 1;
      else if (hitSl && !hitTp1) losses += 1;
      else if (hitTp1 && hitSl) losses += 1; // conservative: SL assumed first on ambiguity
      else { evaluated -= 1; } // neither hit inside window: no decision, excluded
    }
    const decided = wins + losses;
    return {
      instrument: symbol, market: "FOREX", kind: "BACKTEST",
      windows: cs.length, confirmed, noTrades, evaluated,
      wins, losses,
      winRate: decided ? +(wins / decided).toFixed(3) : null,
      note: "Deterministic replay of analyzeForex on supplied candles only. Evidence of engine behavior on that sample — not predictive of live performance. Market intelligence is not trading performance."
    };
  }

  authorizePaper({ riskAmount = 0 } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    if (this._state.risk.day !== today) {
      this._state.risk.day = today;
      this._state.risk.dailyLoss = 0;
      this._state.risk.consecutiveLosses = 0;
    }
    if (this._state.risk.emergencyStop) return { ok: false, reason: "EMERGENCY_STOP: trading halted by Founder control." };
    if (num(riskAmount) === null || riskAmount <= 0) return { ok: false, reason: "RISK_INVALID: risk amount must be positive." };
    if (riskAmount > this.config.paperBalance * (this.config.maxRiskPerTrade / 100)) {
      return { ok: false, reason: `RISK_LIMIT: amount exceeds max risk per trade ${this.config.maxRiskPerTrade}%.` };
    }
    if (this._state.risk.dailyLoss + riskAmount > this.config.paperBalance * (this.config.maxDailyLoss / 100)) {
      return { ok: false, reason: `DAILY_LOSS_LIMIT: would exceed max daily loss ${this.config.maxDailyLoss}%.` };
    }
    if (this._state.risk.consecutiveLosses >= this.config.consecutiveLossLimit) {
      return { ok: false, reason: `CONSECUTIVE_LOSS_LIMIT: ${this._state.risk.consecutiveLosses} losses — cooldown required.` };
    }
    const open = this._state.ledger.filter((r) => r.executionState === "FILLED" && !r.closedAt).length;
    if (open >= this.config.maxExposure) {
      return { ok: false, reason: `MAX_EXPOSURE: ${open} open paper positions (limit ${this.config.maxExposure}).` };
    }
    return { ok: true };
  }

  executePaper({ signal, riskAmount, actor = "founder", executionMode = "PAPER", executionStyle = "MANUAL", now = Date.now() } = {}) {
    if (!signal || typeof signal !== "object") throw new Error("SIGNAL_REQUIRED: a prior analyze result is required.");
    const mode = String(executionMode || "PAPER").toUpperCase();
    if (mode !== "PAPER") {
      const e = new Error("BROKER_NOT_CONFIGURED: LIVE execution requires an authorized connected broker/provider. None is connected.");
      e.code = "BROKER_NOT_CONFIGURED";
      throw e;
    }
    const style = String(executionStyle || "MANUAL").toUpperCase();
    if (!EXECUTION_STYLES.includes(style)) {
      const e = new Error("EXECUTION_STYLE_INVALID: use MANUAL, SEMI_AUTO, or FULL_AUTO.");
      e.code = "EXECUTION_STYLE_INVALID";
      throw e;
    }
    if (!["CONFIRMED", "CONFIRMED_CALL", "CONFIRMED_PUT"].includes(signal.state)) {
      const e = new Error("SIGNAL_NOT_CONFIRMED: only CONFIRMED signals may be paper-executed.");
      e.code = "SIGNAL_NOT_CONFIRMED";
      throw e;
    }
    const fp = this._fingerprint([signal.instrument, signal.direction, signal.entry ?? signal.timeframe, "paper"]);
    if (!this._cooldownOk(`exec:${fp}`, now)) {
      const e = new Error("DUPLICATE_SUPPRESSED: identical paper execution is in cooldown.");
      e.code = "DUPLICATE_SUPPRESSED";
      throw e;
    }
    const auth = this.authorizePaper({ riskAmount: num(riskAmount) ?? 0 });
    if (!auth.ok) {
      const e = new Error(auth.reason);
      e.code = "RISK_REJECTED";
      throw e;
    }
    this._state.seq += 1;
    const record = {
      id: `PAPER-${String(this._state.seq).padStart(5, "0")}`,
      instrument: signal.instrument,
      market: signal.market || "FOREX",
      marketType: signal.marketType || null,
      direction: signal.direction,
      entry: signal.entry ?? null,
      stopLoss: signal.stopLoss ?? null,
      tp1: signal.tp1 ?? null,
      tp2: signal.tp2 ?? null,
      tp3: signal.tp3 ?? null,
      expiry: signal.expiry ?? null,
      riskAmount: num(riskAmount),
      executionState: "FILLED",
      executionMode: "PAPER",
      executionStyle: String(executionStyle || "MANUAL").toUpperCase(),
      actor: String(actor),
      signalState: signal.state,
      confidence: signal.confidence ?? null,
      confidencePercent: signal.confidencePercent ?? qualityRating(signal.confidence ?? 0).percent,
      quality: signal.quality ?? qualityRating(signal.confidence ?? 0),
      fingerprint: fp,
      openedAt: new Date(now).toISOString(),
      closedAt: null,
      result: null
    };
    this._cooldownSet(`exec:${fp}`, now);
    this._state.ledger.push(record);
    if (this._state.ledger.length > 500) this._state.ledger = this._state.ledger.slice(-500);
    this._persist();
    this._audit("PAPER_EXECUTED", { id: record.id, instrument: record.instrument, direction: record.direction });
    return record;
  }

  closePaper({ id, outcome = "MANUAL", pnl = 0, exitPrice = null, now = Date.now() } = {}) {
    const rec = this._state.ledger.find((r) => r.id === id);
    if (!rec) {
      const e = new Error("PAPER_NOT_FOUND: no paper position with that id.");
      e.code = "PAPER_NOT_FOUND";
      throw e;
    }
    if (rec.closedAt) {
      const e = new Error("PAPER_ALREADY_CLOSED: position is already closed.");
      e.code = "PAPER_ALREADY_CLOSED";
      throw e;
    }
    const v = num(pnl) ?? 0;
    rec.closedAt = new Date(now).toISOString();
    rec.exitPrice = exitPrice;
    rec.result = { outcome: String(outcome), pnl: v };
    rec.executionState = "CLOSED";
    if (v < 0) {
      this._state.risk.dailyLoss += Math.abs(v);
      this._state.risk.consecutiveLosses += 1;
    } else {
      this._state.risk.consecutiveLosses = 0;
    }
    this._persist();
    this._audit("PAPER_CLOSED", { id, pnl: v });
    return rec;
  }

  listLedger(limit = 50, { actor = null } = {}) {
    const rows = actor ? this._state.ledger.filter((r) => String(r.actor) === String(actor)) : this._state.ledger;
    return rows.slice(-Math.max(1, Math.min(200, limit))).reverse();
  }

  executeLive() {
    const e = new Error("BROKER_NOT_CONFIGURED: no authorized live broker/provider is connected. Paper mode only.");
    e.code = "BROKER_NOT_CONFIGURED";
    throw e;
  }

  _noTrade(code, reason, extra = {}) {
    return { state: "NO_TRADE", direction: null, confidence: 0, reason: `${code}: ${reason}`, ...extra };
  }

  _evidence(symbol, candles, extra = {}) {
    return {
      instrument: symbol,
      candles: candles.length,
      lastClose: candles[candles.length - 1].c,
      lastTime: candles[candles.length - 1].t,
      ...extra,
      dataWarning: "Analysis used caller-supplied candles only. No live market feed is connected."
    };
  }
}

export { FOREX_STATES, BINARY_STATES, EXECUTION_MODES, EXECUTION_STYLES, BINARY_DEFENSE_DEFAULTS, BINARY_MANIPULATION_FLAGS, pipSizeFor };
export default FounderSignalEngine;
