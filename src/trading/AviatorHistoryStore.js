/**
 * ADE AVIATOR HISTORY STORE — automatic rolling observation buffer.
 *
 * Fills the gap between "paste history manually" and "automatic live-data ingestion":
 *  - Maintains a rolling buffer of crash multipliers with deduplication + staleness guards
 *  - Persists via the canonical RuntimeConfigStore (durable when Supabase is configured)
 *  - Accepts rounds from ANY legitimate source: webhook, polling, manual push, or operator feed
 *  - Never scrapes, never extracts SSIDs, never evades detection
 *  - Composes AviatorAnalyticsEngine for analysis — this store is OBSERVE→NORMALIZE→HISTORY only
 *
 * Pipeline: OBSERVE (ingest) → NORMALIZE → VALIDATE → HISTORY → ANALYZE → PAPER → OUTCOME → EVALUATE
 */

const DEFAULTS = Object.freeze({
  maxHistory: 500,
  dedupeWindowMs: 2000,
  maxAgeMs: 24 * 60 * 60 * 1000
});

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export class AviatorHistoryStore {
  constructor({ store = null, eventBus = null, config = {} } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.config = {
      maxHistory: Number.isInteger(config.maxHistory) ? config.maxHistory : DEFAULTS.maxHistory,
      dedupeWindowMs: num(config.dedupeWindowMs) ?? DEFAULTS.dedupeWindowMs,
      maxAgeMs: num(config.maxAgeMs) ?? DEFAULTS.maxAgeMs
    };
    this._history = [];
    this._lastIngestAt = null;
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.("aviatorHistory") || this.store?.read?.()?.aviatorHistory || null;
      if (Array.isArray(saved)) this._history = saved.filter(x => x && typeof x.multiplier === "number" && x.multiplier >= 1.0).slice(-this.config.maxHistory);
      else if (saved?.history && Array.isArray(saved.history)) this._history = saved.history.slice(-this.config.maxHistory);
    } catch {}
  }

  _persist() {
    try {
      if (typeof this.store?.writeSection === "function") this.store.writeSection("aviatorHistory", this._history.slice(-this.config.maxHistory));
    } catch {}
  }

  /**
   * Ingest one or more crash rounds from a legitimate source.
   * @param {Array<{multiplier:number, t?:number, venue?:string, roundId?:string}>|{multiplier:number}} rounds
   * @param {string} venue - venue label metadata
   * @param {string} source - legitimate source label (WEBHOOK, POLL, MANUAL, OPERATOR_FEED)
   */
  ingest(rounds, { venue = "SPRIBE", source = "MANUAL" } = {}) {
    const vLabel = String(venue || "SPRIBE").trim().toUpperCase().slice(0, 32) || "SPRIBE";
    const src = String(source || "MANUAL").trim().toUpperCase().slice(0, 32) || "MANUAL";
    const arr = Array.isArray(rounds) ? rounds : [rounds];
    let added = 0, deduped = 0, rejected = 0;
    const now = Date.now();
    for (const r of arr) {
      const m = num(r?.multiplier ?? r?.m ?? r?.crash ?? r?.value ?? r);
      if (m === null || m < 1.0 || m > 1000) { rejected += 1; continue; }
      const t = num(r?.t) ?? now;
      const roundId = r?.roundId ? String(r.roundId).slice(0, 64) : null;
      // Deduplication: same roundId OR same multiplier+t within dedupe window
      let isDupe = false;
      if (roundId) {
        isDupe = this._history.some(h => h.roundId === roundId);
      }
      if (!isDupe) {
        isDupe = this._history.some(h => h.multiplier === m && Math.abs((h.t ?? 0) - t) < this.config.dedupeWindowMs);
      }
      if (isDupe) { deduped += 1; continue; }
      this._history.push({ multiplier: m, t, venue: vLabel, source: src, roundId, ingestedAt: now });
      if (this._history.length > this.config.maxHistory) this._history.shift();
      added += 1;
    }
    if (added) {
      this._lastIngestAt = now;
      this._persist();
      try { this.eventBus?.publish?.("gaming.aviator.history.ingested", { venue: vLabel, added, deduped, rejected, total: this._history.length, source: src }); } catch {}
    }
    return { added, deduped, rejected, total: this._history.length, venue: vLabel, source: src };
  }

  list({ venue = null, limit = 100, since = null } = {}) {
    let out = [...this._history];
    if (venue) out = out.filter(h => h.venue === String(venue).toUpperCase());
    if (since != null) out = out.filter(h => (h.t ?? 0) >= Number(since));
    // Prune stale
    const now = Date.now();
    out = out.filter(h => now - (h.t ?? now) <= this.config.maxAgeMs * 2);
    return out.slice(-Math.min(500, Math.max(1, Number(limit) || 100)));
  }

  getStatus() {
    const now = Date.now();
    const last = this._history.length ? this._history[this._history.length - 1] : null;
    const stale = last ? (now - (last.t ?? now) > this.config.maxAgeMs) : true;
    return {
      total: this._history.length,
      maxHistory: this.config.maxHistory,
      lastIngestAt: this._lastIngestAt ? new Date(this._lastIngestAt).toISOString() : null,
      lastRoundAt: last?.t ? new Date(last.t).toISOString() : null,
      lastMultiplier: last?.multiplier ?? null,
      stale,
      venues: [...new Set(this._history.map(h => h.venue))],
      sources: [...new Set(this._history.map(h => h.source))],
      dedupeWindowMs: this.config.dedupeWindowMs,
      note: this._history.length < 30 ? "Collecting history — need >=30 rounds for analytics." : stale ? "History is stale — supply fresh rounds via ingest." : "Rolling history is live."
    };
  }

  clear() {
    this._history = [];
    this._lastIngestAt = null;
    this._persist();
    try { this.eventBus?.publish?.("gaming.aviator.history.cleared", {}); } catch {}
    return { cleared: true };
  }

  /** Analyze via AviatorAnalyticsEngine using current rolling history */
  analyzeWith(engine, opts = {}) {
    if (!engine || typeof engine.analyze !== "function") throw new Error("ENGINE_REQUIRED");
    const history = this.list({ limit: this.config.maxHistory });
    return engine.analyze({ history, ...opts });
  }
}

export default AviatorHistoryStore;
