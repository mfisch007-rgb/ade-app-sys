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
const BINARY_STATES = Object.freeze(["WATCH", "PRE-ALERT", "SETUP", "CONFIRMED_CALL", "CONFIRMED_PUT", "INVALIDATED", "PAPER", "EXPIRED", "RESULT", "NO_TRADE"]);

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
      paperBalance: num(config.paperBalance) ?? 10000
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
      liveExecution: "BROKER_NOT_CONFIGURED",
      paperBalance: this.config.paperBalance,
      risk: { ...this.config, dailyLoss: this._state.risk.dailyLoss, consecutiveLosses: this._state.risk.consecutiveLosses, emergencyStop: this._state.risk.emergencyStop, openPositions: open },
      ledgerSize: this._state.ledger.length,
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

  analyzeForex({ instrument, candles, accountBalance, riskPercent, now = Date.now() } = {}) {
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
    return {
      instrument: symbol, market: "FOREX", state, direction, regime,
      entry: +entry.toFixed(5), entryZone: [+Math.min(entry, e20).toFixed(5), +Math.max(entry, e20).toFixed(5)],
      stopLoss: +structSL.toFixed(5), riskDistance: +slDist.toFixed(5),
      tp1: +tps[0].toFixed(5), tp2: +tps[1].toFixed(5), tp3: +tps[2].toFixed(5),
      riskReward: rr, positionSize, riskAmount, riskPercent: riskPct,
      trailing: { mode: "STRUCTURE_PLUS_ATR", trailDistance: +(1.0 * a).toFixed(5), activateAfter: "+tp1", note: "Move stop to breakeven at TP1, then trail 1.0xATR behind structure." },
      invalidation: direction === "LONG" ? `Sustained close below ${(+structSL.toFixed(5))}` : `Sustained close above ${(+structSL.toFixed(5))}`,
      preAlert: state === "PRE-ALERT" ? { triggered: true, why: "Price near entry zone but confirmation below threshold.", expiresAt: new Date(now + this.config.cooldownMs).toISOString() } : { triggered: false },
      confirmation: { required: `confidence >= ${this.config.confirmConfidence}`, observed: +confidence.toFixed(2), factors },
      confidence: +confidence.toFixed(2), duplicateSuppressed: !fresh, fingerprint: fp,
      atr: +a.toFixed(5),
      evidence: this._evidence(symbol, cs, { regime, atr: a, ema20: e20, ema50: e50 })
    };
  }

  analyzeBinary({ pair, marketType = "REGULAR", candles, timeframe = "M5", now = Date.now() } = {}) {
    const symbol = String(pair || "").trim().toUpperCase();
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
    let direction = null;
    const factors = [];
    if (z <= -threshold && momentum > 0) { direction = "CALL"; factors.push(`z=${z.toFixed(2)}<=${-threshold}`, "up-momentum"); }
    else if (z >= threshold && momentum < 0) { direction = "PUT"; factors.push(`z=${z.toFixed(2)}>=${threshold}`, "down-momentum"); }
    const confidence = direction ? Math.min(0.85, 0.4 + Math.abs(z - (direction === "CALL" ? -threshold : threshold)) * 0.08 + 0.1) : 0;
    const volPct = (a / last.c) * 100;
    const baseMin = { M1: 1, M5: 5, M15: 15, H1: 30 }[String(timeframe).toUpperCase()] ?? 5;
    const estimatedExpiryMin = Math.max(1, Math.round(baseMin * (volPct > 0.2 ? 1 : 2)));
    if (!direction) {
      return { instrument: symbol, market: "BINARY", marketType: mt, state: "WATCH", direction: null, zScore: +z.toFixed(2), reason: "No confirmed edge. Watching.", evidence: { candles: cs.length, atr: +a.toFixed(5), threshold } };
    }
    const state = confidence >= this.config.confirmConfidence ? (direction === "CALL" ? "CONFIRMED_CALL" : "CONFIRMED_PUT") : "PRE-ALERT";
    return {
      instrument: symbol, market: "BINARY", marketType: mt, state, direction,
      timeframe: String(timeframe).toUpperCase(),
      entryWindow: { from: new Date(now).toISOString(), until: new Date(now + 2 * 60 * 1000).toISOString(), note: "Next 2 minutes on the connected platform clock." },
      expiry: { estimatedMinutes: estimatedExpiryMin, label: "ESTIMATED EXPIRY", note: "Estimate from volatility/timeframe only. Actual platform expiry must be confirmed on the broker platform — no broker is connected." },
      zScore: +z.toFixed(2), confidence: +confidence.toFixed(2), factors,
      invalidation: `Opposite ${(direction === "CALL" ? "PUT" : "CALL")} confirmation or |z| < 1.0 before entry window closes.`,
      preAlert: state === "PRE-ALERT" ? { triggered: true, why: "Edge forming below confirmation threshold.", expiresAt: new Date(now + this.config.cooldownMs).toISOString() } : { triggered: false },
      evidence: { candles: cs.length, atr: +a.toFixed(5), threshold, otc: mt === "OTC" }
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

  executePaper({ signal, riskAmount, actor = "founder", now = Date.now() } = {}) {
    if (!signal || typeof signal !== "object") throw new Error("SIGNAL_REQUIRED: a prior analyze result is required.");
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
      actor: String(actor),
      signalState: signal.state,
      confidence: signal.confidence ?? null,
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

  listLedger(limit = 50) {
    return this._state.ledger.slice(-Math.max(1, Math.min(200, limit))).reverse();
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

export { FOREX_STATES, BINARY_STATES };
export default FounderSignalEngine;
