/**
 * ADE AVIATOR / CRASH ANALYTICS ENGINE — educational risk analytics, NOT prediction.
 *
 * TRUTH BOUNDARY (enforced):
 *  Aviator / Spribe / Crash games are server-side RNG / provably-fair outcomes
 *  with a fixed house edge. No client-side indicator, candle, or AI model can
 *  predict the next crash multiplier. Any system claiming to do so is fraudulent.
 *
 *  This engine therefore NEVER predicts the next multiplier. It provides:
 *   - historical distribution analysis over SUPPLIED multipliers only
 *   - bust-probability tables P(crash > cashout) under the observed empirical
 *     distribution + under the canonical exponential model (provably-fair)
 *   - expected value / house-edge estimation per cashout target
 *   - Kelly fraction / bankroll-at-risk math (pure arithmetic)
 *   - Monte Carlo ruin simulation (offline, deterministic seed)
 *   - streak / run diagnostics with explicit "gambler's fallacy" warnings
 *
 *  COMPOSITION (no heavy rebuilds — reuses ADE ground truth):
 *   - ZScoreEngine  : streak z-score (diagnostic only, not predictive)
 *   - FounderSignalEngine defense philosophy: pip-edge / stall / feed guards
 *     adapted as multiplier-edge / history-staleness / cross-venue checks
 *   - Quality rating (HIGH/USABLE/WEAK/NO_EDGE) from FounderSignalEngine
 *   - VenueRegistry / MarketDataRegistry: venue is metadata only, never live
 *
 *  INPUT: caller-supplied multipliers only (e.g. operator-pasted history or
 *  official export). The engine never scrapes, never extracts browser SSIDs,
 *  never evades detection. Stale history is rejected (maxHistoryAgeMs).
 *
 *  OUTPUT: { state: "ANALYZED" | "NO_TRADE" | "INSUFFICIENT_DATA" } plus
 *  honest disclaimers. There is no CONFIRMED_CALL/PUT — there is no call.
 */

import { ZScoreEngine } from "./ZScoreEngine.js";

// House model: Spribe-style provably-fair uses truncated exponential-ish tails.
// Empirical house edge is typically 0.03–0.07; we ESTIMATE it from supplied
// history rather than assuming, and show both empirical and 0.03 baseline tables.
const DEFAULTS = Object.freeze({
  minHistory: 30,
  maxHistoryAgeMs: 24 * 60 * 60 * 1000, // 24h default — crash history ages fast
  houseEdgeBaseline: 0.03,
  kellyFractionCap: 0.25, // never recommend >25% Kelly even if math says so
  bustTargets: [1.2, 1.5, 2.0, 3.0, 5.0, 10.0],
  maxTargets: 8
});

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function qualityRating(confidence) {
  const c = Number(confidence) || 0;
  const percent = Math.round(Math.min(0.99, Math.max(0, c)) * 100);
  const band = percent >= 75 ? "HIGH" : percent >= 60 ? "USABLE" : percent >= 40 ? "WEAK" : "NO_EDGE";
  return { percent, band };
}

function sanitizeMultipliers(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "MULTIPLIERS_REQUIRED: supply an array of crash multipliers (e.g. [1.23, 2.01, 8.4]) with at least 1 entry." };
  }
  const out = [];
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i];
    const v = num(raw?.multiplier ?? raw?.m ?? raw?.crash ?? raw?.value ?? raw);
    const t = raw?.t != null ? num(raw.t) : null;
    if (v === null || v < 1.0) {
      return { error: `MULTIPLIER_INVALID at index ${i}: each entry must be numeric >= 1.0 (got ${JSON.stringify(raw)}).` };
    }
    if (v > 1000) return { error: `MULTIPLIER_INVALID at index ${i}: multiplier ${v} exceeds sane cap 1000x.` };
    out.push({ multiplier: v, t: t != null && Number.isFinite(t) ? t : null, raw });
  }
  return { history: out };
}

// Deterministic xorshift32 for Monte Carlo (no Math.random reliance)
function xorshift32(seed) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };
}

export class AviatorAnalyticsEngine {
  constructor({ store = null, eventBus = null, config = {} } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.config = {
      minHistory: Number.isInteger(config.minHistory) ? config.minHistory : DEFAULTS.minHistory,
      maxHistoryAgeMs: num(config.maxHistoryAgeMs) ?? DEFAULTS.maxHistoryAgeMs,
      houseEdgeBaseline: num(config.houseEdgeBaseline) ?? DEFAULTS.houseEdgeBaseline,
      kellyFractionCap: num(config.kellyFractionCap) ?? DEFAULTS.kellyFractionCap
    };
  }

  getStatus() {
    return {
      mode: "ANALYTICS_ONLY",
      predictsNextCrash: false,
      truth: "Crash/Aviator outcomes are server-side RNG with house edge. This engine does NOT predict the next multiplier — it analyses supplied history for risk education only.",
      notSupported: ["LIVE_PREDICTION", "AUTO_BETTING", "SSID_EXTRACTION", "BOT_EVASION"],
      supported: ["DISTRIBUTION_ANALYSIS", "BUST_PROBABILITY_TABLE", "EXPECTED_VALUE_PER_TARGET", "KELLY_BANKROLL_MATH", "MONTE_CARLO_RUIN_SIM", "STREAK_DIAGNOSTICS"],
      defaults: { ...DEFAULTS, ...this.config },
      defense: "Reuses FounderSignalEngine philosophy: stale-history guard + cross-venue consistency check + minimum-edge (no trade on thin history). No session extraction."
    };
  }

  /**
   * Core analytics over supplied crash multipliers.
   *
   * @param {number[]} opts.history - array of multipliers or {multiplier,t} objects
   * @param {string} opts.venue - venue label (e.g. SPIRBE, 1XBET, BETKING) — metadata only
   * @param {number[]} opts.targets - cashout targets to evaluate (default DEFAULTS.bustTargets)
   * @param {number} opts.bankroll - bankroll for Kelly / ruin sim (default 100)
   * @param {number} opts.stake - stake per round for EV/ruin sim (default 1)
   * @param {number} opts.now - timestamp for staleness check
   * @param {number[]} opts.spotHistory - optional second venue history for cross-venue consistency (like spot feed check)
   */
  analyze({ history, venue = "SPRIBE", targets, bankroll = 100, stake = 1, now = Date.now(), spotHistory, expectedEdgeThreshold } = {}) {
    const vLabel = String(venue || "SPRIBE").trim().toUpperCase().slice(0, 32) || "SPRIBE";
    const clean = sanitizeMultipliers(history);
    if (clean.error) return this._noTrade("DATA_INVALID", clean.error, { venue: vLabel });

    const hs = clean.history;
    if (hs.length < this.config.minHistory) {
      return {
        venue: vLabel, market: "GAMING", game: "AVIATOR",
        state: "INSUFFICIENT_DATA",
        reason: `INSUFFICIENT_DATA: need >= ${this.config.minHistory} multipliers for distribution analysis (got ${hs.length}). Supply more history.`,
        historyCount: hs.length, required: this.config.minHistory,
        disclaimer: this._disclaimer(),
        evidence: { venues: [vLabel], houseEdge: null }
      };
    }

    // Stale-history guard (mirrors CANDLE_STALE guard: 15m for candles -> 24h for crash)
    const timed = hs.filter(h => h.t !== null);
    if (timed.length) {
      const lastT = Math.max(...timed.map(h => h.t));
      if (now - lastT > this.config.maxHistoryAgeMs) {
        return this._noTrade("STALE_DATA", `Last crash at ${new Date(lastT).toISOString()} is older than ${Math.round(this.config.maxHistoryAgeMs / 60000)} minutes. Supply fresh history.`, { venue: vLabel, lastAt: lastT });
      }
    }

    const mults = hs.map(h => h.multiplier);
    const n = mults.length;
    const sorted = [...mults].sort((a, b) => a - b);
    const sum = mults.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const variance = n > 1 ? mults.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    const min = sorted[0], max = sorted[n - 1];
    const p95 = sorted[Math.floor(n * 0.95)] ?? max;
    const p50 = median;

    // Empirical bust stats
    const above1_5 = mults.filter(m => m >= 1.5).length / n;
    const above2 = mults.filter(m => m >= 2.0).length / n;
    const above5 = mults.filter(m => m >= 5.0).length / n;
    const bustUnder1_2 = mults.filter(m => m < 1.2).length / n; // instant busts

    // House edge estimate: under exponential model, E[mult] = 1 / edge_factor.
    // Empirical: compare observed mean to theoretical ~ 2..3 range. Simple bound:
    //  edge ~= 1 - ( (n - count_bust) / n ) * 1/profit ... use 1/mean proxy.
    // We report it honestly as "empirical proxy", never as certified.
    const empiricalEdgeProxy = mean > 0 ? Math.max(0, Math.min(0.15, 1 - (1 / mean) * 0.97)) : null;

    // Bust-probability tables: empirical P(crash >= target) + model baseline
    const cashTargets = (Array.isArray(targets) && targets.length ? targets : DEFAULTS.bustTargets).slice(0, DEFAULTS.maxTargets).map(num).filter(v => v !== null && v >= 1.0).sort((a, b) => a - b);
    const bustTable = cashTargets.map(target => {
      const empiricalP = mults.filter(m => m >= target).length / n;
      // Model baseline: exponential tail P >= x ~= 0.97/x  (Spribe-like with 3% edge truncation)
      const modelP = Math.max(0, Math.min(1, (1 - this.config.houseEdgeBaseline) / target));
      const evPerStake = empiricalP * (target - 1) - (1 - empiricalP) * 1; // profit if win = target-1, loss = -1 stake
      const modelEv = modelP * (target - 1) - (1 - modelP) * 1;
      // Kelly fraction for this target under empiricalP: f* = (bp - q)/b where b = target-1, p=empiricalP, q=1-p
      const b = target - 1;
      let kelly = 0;
      if (b > 0 && empiricalP > 0 && empiricalP < 1) kelly = (b * empiricalP - (1 - empiricalP)) / b;
      kelly = Math.max(0, Math.min(this.config.kellyFractionCap, kelly));
      return {
        target, empiricalHitRate: +empiricalP.toFixed(4), modelHitRate: +modelP.toFixed(4),
        empiricalEVPerStake: +evPerStake.toFixed(4), modelEVPerStake: +modelEv.toFixed(4),
        kellyFraction: +kelly.toFixed(4), kellyStakeForBankroll: +(kelly * bankroll).toFixed(4),
        verdict: evPerStake > 0 ? "POSITIVE_IN_SAMPLE_ONLY" : "NEGATIVE_OR_ZERO",
        warning: "In-sample EV is not predictive of future rounds. House edge persists."
      };
    });

    // Streak diagnostics via ZScoreEngine (diagnostic only)
    const zEng = new ZScoreEngine(20);
    for (const m of mults.slice(0, -1)) zEng.addPrice(m);
    const lastZ = zEng.getZScore(mults[mults.length - 1]);
    const recentLows = mults.slice(-10).filter(m => m < 1.5).length;
    const recentHighs = mults.slice(-10).filter(m => m >= 5).length;

    // Cross-venue consistency (mirrors MANIPULATED_FEED 0.8-pip check, but for crash)
    let crossVenue = { evaluated: false, passed: true, skipped: true, detail: "No spotHistory supplied — cross-venue check skipped (not a pass)." };
    if (spotHistory !== undefined && spotHistory !== null) {
      const spotClean = sanitizeMultipliers(spotHistory);
      if (spotClean.error) {
        crossVenue = { evaluated: true, passed: false, skipped: false, code: "CROSS_VENUE_MISMATCH", detail: `CROSS_VENUE_MISMATCH: spotHistory rejected: ${spotClean.error}` };
      } else {
        const spotMean = spotClean.history.reduce((a, h) => a + h.multiplier, 0) / spotClean.history.length;
        const meanDev = Math.abs(mean - spotMean);
        // >0.35 mean deviation across venues flags distribution mismatch (venue-specific RNG, not shared feed)
        const passed = meanDev <= 0.35;
        crossVenue = {
          evaluated: true, passed, skipped: false,
          code: passed ? null : "CROSS_VENUE_MISMATCH",
          detail: passed
            ? `Cross-venue OK: mean ${mean.toFixed(3)} vs spot ${spotMean.toFixed(3)} (dev ${meanDev.toFixed(3)} <= 0.35).`
            : `CROSS_VENUE_MISMATCH: venue mean ${mean.toFixed(3)} vs spot ${spotMean.toFixed(3)} (dev ${meanDev.toFixed(3)} > 0.35). Histories may be from different RNG pools — do not merge.`,
          venueMean: +mean.toFixed(4), spotMean: +spotMean.toFixed(4), deviation: +meanDev.toFixed(4)
        };
      }
    }

    // Minimum-edge guard: if n is technically enough but variance is near-zero
    // (e.g. all 1.01x), flag as NO_EDGE — same spirit as 2.5-pip edge for binaries
    const edgeThreshold = num(expectedEdgeThreshold) ?? 0.08; // sd/mean ratio floor
    const cv = mean > 0 ? sd / mean : 0;
    let edgeCheck = { passed: true, code: null, detail: `Distribution edge OK: CV ${cv.toFixed(3)} >= ${edgeThreshold}.` };
    if (cv < edgeThreshold) {
      edgeCheck = { passed: false, code: "INSUFFICIENT_DISTRIBUTION_EDGE", detail: `INSUFFICIENT_DISTRIBUTION_EDGE: CV ${cv.toFixed(3)} < ${edgeThreshold}. History is degenerate (near-constant crashes) — no diagnostic edge.` };
    }

    // Monte Carlo ruin simulation (deterministic seed from history hash)
    const mcSeed = mults.reduce((a, v, i) => (a + Math.floor(v * 100) * (i + 1)) >>> 0, 0x1337) >>> 0;
    const simStake = num(stake) != null && stake > 0 ? stake : 1;
    const simBankroll = num(bankroll) != null && bankroll > 0 ? bankroll : 100;
    const targetForSim = bustTable.length ? bustTable[Math.floor(bustTable.length / 2)].target : 2.0;
    const mc = this._monteCarloRuin({ multipliers: mults, bankroll: simBankroll, stake: simStake, target: targetForSim, seed: mcSeed, rounds: 500, trials: 2000 });

    const state = !crossVenue.passed || !edgeCheck.passed ? "NO_TRADE" : "ANALYZED";

    const out = {
      venue: vLabel, market: "GAMING", game: "AVIATOR",
      state,
      predictsNextCrash: false,
      reason: state === "ANALYZED"
        ? `ANALYZED: ${n} supplied crashes analysed. This is risk education, not a prediction — the next crash remains RNG.`
        : `NO_TRADE: ${!crossVenue.passed ? crossVenue.detail : edgeCheck.detail}`,
      historyCount: n,
      distribution: {
        mean: +mean.toFixed(4), median: +median.toFixed(4), sd: +sd.toFixed(4), cv: +cv.toFixed(4),
        min: +min.toFixed(4), max: +max.toFixed(4), p50, p95: +p95.toFixed(4),
        bustUnder1_2: +bustUnder1_2.toFixed(4), above1_5: +above1_5.toFixed(4), above2: +above2.toFixed(4), above5: +above5.toFixed(4)
      },
      houseEdge: {
        baseline: this.config.houseEdgeBaseline,
        empiricalProxy: empiricalEdgeProxy !== null ? +empiricalEdgeProxy.toFixed(4) : null,
        note: "empiricalProxy is an in-sample proxy from 1/mean — not a certified edge. Assume baseline edge persists."
      },
      bustTable,
      kellyNote: "Kelly fractions are capped and shown for position-sizing education. Full Kelly is aggressive; half-Kelly is standard practice.",
      streak: {
        lastZScore: lastZ?.ready ? +lastZ.zScore.toFixed(2) : 0, zReady: !!lastZ?.ready,
        recentLowsUnder1_5: recentLows, recentHighsOver5: recentHighs, windowLast10: mults.slice(-10),
        warning: "Streaks do not predict the next crash (gambler's fallacy). A run of lows does not make a high 'due'."
      },
      monteCarlo: { ...mc, note: "Offline Monte Carlo on empirical hit-rate — illustrates ruin risk, not future P&L." },
      defense: { crossVenue, edge: edgeCheck, staleGuard: { maxHistoryAgeMs: this.config.maxHistoryAgeMs, checked: timed.length > 0 } },
      bankroll: { bankroll: simBankroll, stakePerRound: simStake, targetForSim },
      disclaimer: this._disclaimer(),
      warnings: [
        "NEVER chase losses — crash games have negative expected value at every cashout target after house edge.",
        "No indicator, pattern, or AI prediction can determine the next crash. Provably-fair means server-seeded RNG.",
        "Use only disposable bankroll; set a hard stop-loss and stop-win before playing."
      ],
      evidence: { venues: [vLabel], n, mean: +mean.toFixed(4), sd: +sd.toFixed(4) }
    };

    try { this.eventBus?.publish?.("gaming.aviator.analyzed", { venue: vLabel, n, mean: out.distribution.mean }); } catch {}
    return out;
  }

  /**
   * Simulate a single round outcome under the empirical distribution (resampling).
   * Purely illustrative — resamples supplied history uniformly.
   */
  simulateRound({ history, venue, seed = 0xC0FFEE } = {}) {
    const clean = sanitizeMultipliers(history);
    if (clean.error) return { error: clean.error };
    const mults = clean.history.map(h => h.multiplier);
    const rng = xorshift32(seed >>> 0);
    const idx = Math.floor(rng() * mults.length);
    return {
      venue: String(venue || "SPRIBE").toUpperCase(),
      simulatedMultiplier: mults[idx],
      source: "RESAMPLED_HISTORY_UNIFORM",
      note: "Simulated by uniform resample of supplied history — not a prediction of the live RNG.",
      warning: "Resampled simulation cannot reproduce the provider's server seed."
    };
  }

  _monteCarloRuin({ multipliers, bankroll, stake, target, seed, rounds, trials }) {
    const n = multipliers.length;
    const hitRate = multipliers.filter(m => m >= target).length / n;
    const b = target - 1;
    const rng = xorshift32(seed);
    let busts = 0, maxDrawdowns = [];
    let totalProfit = 0;
    for (let t = 0; t < trials; t += 1) {
      let bal = bankroll;
      let peak = bal;
      let maxDD = 0;
      let profit = 0;
      for (let r = 0; r < rounds; r += 1) {
        const win = rng() < hitRate;
        if (win) { bal += stake * b; profit += stake * b; }
        else { bal -= stake; profit -= stake; }
        if (bal <= 0) { busts += 1; break; }
        if (bal > peak) peak = bal;
        maxDD = Math.max(maxDD, peak > 0 ? (peak - bal) / peak : 0);
      }
      maxDrawdowns.push(maxDD);
      totalProfit += profit;
    }
    maxDrawdowns.sort((a, b) => a - b);
    const p50 = maxDrawdowns[Math.floor(trials * 0.5)] ?? 0;
    const p95 = maxDrawdowns[Math.floor(trials * 0.95)] ?? 0;
    return {
      target, roundsPerTrial: rounds, trials,
      hitRate: +hitRate.toFixed(4),
      bustRate: +(busts / trials).toFixed(4),
      medianMaxDrawdown: +p50.toFixed(4),
      p95MaxDrawdown: +p95.toFixed(4),
      avgProfitPerTrial: +(totalProfit / trials).toFixed(2),
      seed: seed >>> 0
    };
  }

  _disclaimer() {
    return "EDUCATIONAL ONLY — This analysis does NOT predict the next Aviator/Crash multiplier. Outcomes are server-side RNG / provably-fair with a house edge. No signal, bot, or AI can determine the next crash. Use for risk education and bankroll discipline only. If you gamble, you will lose in expectation.";
  }

  _noTrade(code, detail, extra = {}) {
    return {
      venue: extra.venue || "SPRIBE", market: "GAMING", game: "AVIATOR",
      state: "NO_TRADE",
      predictsNextCrash: false,
      reason: `${code}: ${detail}`,
      code, detail,
      disclaimer: this._disclaimer(),
      evidence: { n: extra.n ?? null }
    };
  }
}

export default AviatorAnalyticsEngine;
