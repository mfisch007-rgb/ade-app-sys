/**
 * ADE SPORTS DATA BUS — normalized multi-source sports data aggregation.
 *
 * Consolidates fixtures, live events, odds, and statistics from multiple
 * sportsbook adapters. Implements deterministic identity resolution for
 * cross-provider event matching.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";
import { MarketDataRegistry } from "./MarketDataRegistry.js";

const MATCH_THRESHOLD = 0.85;

function slug(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80); }
function normalizeTeam(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(fc|sc|utd|united|city|town|fc)\b/g, "").trim(); }

export class SportsDataBus {
  constructor({ marketDataRegistry = null, eventBus = null } = {}) {
    this.registry = marketDataRegistry || new MarketDataRegistry();
    this.eventBus = eventBus || EnterpriseEventBus.getInstance();
    this.fixtures = new Map(); // fixtureId -> normalized fixture
    this.liveEvents = new Map(); // fixtureId -> live event state
    this.oddsCache = new Map(); // fixtureId -> odds[]
    this.statsCache = new Map(); // fixtureId -> stats
    this._refreshInterval = null;
    this._identityCache = new Map(); // providerFixtureId -> canonicalFixtureId
  }

  async refreshAll({ sportsbooks = null } = {}) {
    const adapters = this.registry.listAdapters("SPORTSBOOK")
      .map(a => this.registry.getAdapter(a.providerId))
      .filter(a => a && ["CONNECTED", "AUTHENTICATED", "DATA_FLOWING"].includes(a.state.connection));
    if (sportsbooks?.length) {
      const allowed = new Set(sportsbooks.map(s => s.toLowerCase()));
      adapters.filter(a => allowed.has(a.getId()));
    }
    const results = { fixtures: 0, odds: 0, stats: 0, errors: [] };
    for (const adapter of adapters) {
      try {
        const fRes = await this._refreshFixtures(adapter);
        results.fixtures += fRes.count;
        const oRes = await this._refreshOdds(adapter);
        results.odds += oRes.count;
        const sRes = await this._refreshStats(adapter);
        results.stats += sRes.count;
      } catch (err) {
        results.errors.push({ providerId: adapter.getId(), error: err.message });
      }
    }
    this.eventBus?.publish?.("sports.data.refreshed", results);
    return results;
  }

  async _refreshFixtures(adapter) {
    try {
      const fixtures = await adapter.fetchFixtures({ status: "SCHEDULED" });
      let count = 0;
      for (const f of fixtures) {
        const canonicalId = this._resolveFixtureIdentity(f, adapter.getId());
        if (canonicalId) {
          const existing = this.fixtures.get(canonicalId);
          this.fixtures.set(canonicalId, { ...existing, ...f, source: existing?.source ? [existing.source, adapter.getId()].flat() : [adapter.getId()], lastUpdated: new Date().toISOString() });
        } else {
          this.fixtures.set(f.fixtureId, { ...f, source: [adapter.getId()], createdAt: new Date().toISOString() });
          count++;
        }
        this._identityCache.set(`${adapter.getId()}:${f.fixtureId}`, f.fixtureId);
      }
      return { count };
    } catch (err) { throw err; }
  }

  async _refreshOdds(adapter) {
    try {
      const allFixtures = [...this.fixtures.values()].map(f => f.fixtureId);
      if (!allFixtures.length) return { count: 0 };
      const odds = await adapter.fetchOdds(allFixtures);
      let count = 0;
      for (const o of odds) {
        const canonicalId = this._identityCache.get(`${adapter.getId()}:${o.fixtureId}`) || o.fixtureId;
        const arr = this.oddsCache.get(canonicalId) || [];
        const existingIdx = arr.findIndex(x => x.market === o.market && x.selection === o.selection && x.providerId === adapter.getId());
        if (existingIdx >= 0) arr[existingIdx] = { ...o, providerId: adapter.getId(), receivedAt: new Date().toISOString() };
        else arr.push({ ...o, providerId: adapter.getId(), receivedAt: new Date().toISOString() });
        this.oddsCache.set(canonicalId, arr);
        count++;
      }
      return { count };
    } catch (err) { throw err; }
  }

  async _refreshStats(adapter) {
    try {
      const allFixtures = [...this.fixtures.values()].map(f => f.fixtureId);
      let count = 0;
      for (const fid of allFixtures) {
        try {
          const stats = await adapter.fetchStatistics(fid);
          if (stats) { this.statsCache.set(fid, { ...stats, providerId: adapter.getId(), receivedAt: new Date().toISOString() }); count++; }
        } catch {}
      }
      return { count };
    } catch (err) { throw err; }
  }

  _resolveFixtureIdentity(fixture, providerId) {
    const key = `${providerId}:${fixture.fixtureId}`;
    if (this._identityCache.has(key)) return this._identityCache.get(key);
    const sport = fixture.sport;
    const comp = slug(fixture.competition);
    const home = normalizeTeam(fixture.homeTeam);
    const away = normalizeTeam(fixture.awayTeam);
    const time = fixture.startTime ? new Date(fixture.startTime).getTime() : null;
    let bestMatch = null;
    let bestScore = 0;
    for (const [cid, existing] of this.fixtures) {
      if (existing.sport !== sport) continue;
      const score = this._similarity(sport, comp, home, away, time, existing);
      if (score > bestScore && score >= MATCH_THRESHOLD) { bestScore = score; bestMatch = cid; }
    }
    if (bestMatch) { this._identityCache.set(key, bestMatch); return bestMatch; }
    const newId = fixture.fixtureId || `FIX-${crypto.randomBytes(6).toString("hex")}`;
    this._identityCache.set(key, newId);
    return newId;
  }

  _similarity(sport, comp, home, away, time, existing) {
    let score = 0;
    if (existing.sport === sport) score += 0.3;
    if (slug(existing.competition) === comp) score += 0.3;
    if (normalizeTeam(existing.homeTeam) === home) score += 0.2;
    if (normalizeTeam(existing.awayTeam) === away) score += 0.2;
    if (time && existing.startTime) {
      const dt = Math.abs(time - new Date(existing.startTime).getTime());
      if (dt < 5 * 60 * 1000) score += 0.3;
      else if (dt < 30 * 60 * 1000) score += 0.1;
    }
    return score;
  }

  // --- Query API ---

  getFixtures({ sport, competition, status, limit = 100 } = {}) {
    let results = [...this.fixtures.values()];
    if (sport) results = results.filter(f => f.sport === sport.toUpperCase());
    if (competition) results = results.filter(f => slug(f.competition) === slug(competition));
    if (status) results = results.filter(f => f.status === status.toUpperCase());
    results.sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));
    return results.slice(0, limit);
  }

  getFixture(fixtureId) { return this.fixtures.get(fixtureId) || null; }

  getOdds(fixtureId) { return this.oddsCache.get(fixtureId) || []; }

  getBestOdds(fixtureId, market = "MATCH_WINNER") {
    const odds = this.getOdds(fixtureId).filter(o => o.market === market.toUpperCase());
    const bySelection = new Map();
    for (const o of odds) {
      const cur = bySelection.get(o.selection);
      if (!cur || o.odds > cur.odds) bySelection.set(o.selection, o);
    }
    return [...bySelection.values()];
  }

  getStatistics(fixtureId) { return this.statsCache.get(fixtureId) || null; }

  getLiveEvent(fixtureId) { return this.liveEvents.get(fixtureId) || null; }

  updateLiveEvent(fixtureId, update) {
    const existing = this.liveEvents.get(fixtureId) || { fixtureId, updatedAt: new Date().toISOString() };
    this.liveEvents.set(fixtureId, { ...existing, ...update, updatedAt: new Date().toISOString() });
    this.eventBus?.publish?.("sports.live.updated", { fixtureId, update });
    return this.liveEvents.get(fixtureId);
  }

  startAutoRefresh(intervalMs = 60000) {
    if (this._refreshInterval) return;
    this._refreshInterval = setInterval(() => this.refreshAll().catch(() => {}), intervalMs);
    this._refreshInterval.unref?.();
  }

  stopAutoRefresh() { if (this._refreshInterval) { clearInterval(this._refreshInterval); this._refreshInterval = null; } }

  getStatus() {
    return {
      fixtures: this.fixtures.size,
      liveEvents: this.liveEvents.size,
      oddsEntries: [...this.oddsCache.values()].reduce((sum, arr) => sum + arr.length, 0),
      statsEntries: this.statsCache.size,
      connectedSportsbooks: this.registry.getDataFlowingAdapters().filter(a => a.providerKind === "SPORTSBOOK").length,
      adapters: this.registry.listAdapters("SPORTSBOOK").map(a => a.providerId)
    };
  }
}

export default SportsDataBus;