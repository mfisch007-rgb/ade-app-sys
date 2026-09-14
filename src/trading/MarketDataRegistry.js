/**
 * ADE MARKET DATA REGISTRY — manages all market/sports data adapters.
 *
 * Single authority for adapter registration, lifecycle, health monitoring,
 * and capability discovery. Integrates with existing VenueRegistry for
 * broker/bookie overlap. No duplicate registry.
 */

import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";
import { MarketDataAdapter } from "./MarketDataAdapter.js";
import { VenueRegistry } from "./VenueRegistry.js";

export class MarketDataRegistry {
  constructor({ store = null, eventBus = null, venueRegistry = null } = {}) {
    this.store = store;
    this.eventBus = eventBus || EnterpriseEventBus.getInstance();
    this.venueRegistry = venueRegistry;
    this.adapters = new Map();
    this._healthInterval = null;
  }

  registerAdapter(adapter) {
    if (!(adapter instanceof MarketDataAdapter)) {
      const e = new Error("ADAPTER_MUST_EXTEND_MarketDataAdapter");
      e.code = "ADAPTER_MUST_EXTEND_MarketDataAdapter";
      throw e;
    }
    const id = adapter.getId();
    if (this.adapters.has(id)) {
      return this.adapters.get(id);
    }
    this.adapters.set(id, adapter);
    this._persist();
    this.eventBus?.publish?.("market.adapter.registered", { providerId: id, providerName: adapter.getName(), kind: adapter.getKind() });
    return adapter;
  }

  unregisterAdapter(providerId) {
    const id = String(providerId || "").toLowerCase();
    const adapter = this.adapters.get(id);
    if (!adapter) return false;
    adapter.disconnect().catch(() => {});
    this.adapters.delete(id);
    this._persist();
    this.eventBus?.publish?.("market.adapter.unregistered", { providerId: id });
    return true;
  }

  getAdapter(providerId) {
    return this.adapters.get(String(providerId || "").toLowerCase()) || null;
  }

  listAdapters(kind = null) {
    const all = [...this.adapters.values()].map(a => a.getStatus());
    return kind ? all.filter(a => a.providerKind === kind) : all;
  }

  getConnectedAdapters() {
    return [...this.adapters.values()].filter(a => ["CONNECTED", "AUTHENTICATED", "DATA_FLOWING"].includes(a.state.connection));
  }

  getDataFlowingAdapters() {
    return [...this.adapters.values()].filter(a => a.state.data === "DATA_FLOWING");
  }

  async connectAll() {
    const results = [];
    for (const adapter of this.adapters.values()) {
      if (["DISCOVERED", "NOT_CONFIGURED", "DISCONNECTED", "ERROR"].includes(adapter.state.connection)) {
        try {
          const res = await adapter.connect();
          results.push({ providerId: adapter.getId(), success: true, ...res });
        } catch (err) {
          results.push({ providerId: adapter.getId(), success: false, error: err.message });
        }
      }
    }
    return results;
  }

  async disconnectAll() {
    const results = [];
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.disconnect();
        results.push({ providerId: adapter.getId(), success: true });
      } catch (err) {
        results.push({ providerId: adapter.getId(), success: false, error: err.message });
      }
    }
    return results;
  }

  startHealthMonitoring(intervalMs = 30000) {
    if (this._healthInterval) return;
    this._healthInterval = setInterval(() => this._healthCheck(), intervalMs);
    this._healthInterval.unref?.();
  }

  stopHealthMonitoring() {
    if (this._healthInterval) { clearInterval(this._healthInterval); this._healthInterval = null; }
  }

  _healthCheck() {
    const now = Date.now();
    const STALE_THRESHOLD = 60000; // 60s
    for (const adapter of this.adapters.values()) {
      if (adapter.state.lastDataAt) {
        const last = new Date(adapter.state.lastDataAt).getTime();
        if (now - last > STALE_THRESHOLD && adapter.state.data !== "STALE") {
          adapter._setDataState("STALE");
          this.eventBus?.publish?.("market.data.stale", { providerId: adapter.getId(), lastDataAt: adapter.state.lastDataAt });
        }
      }
      if (adapter.state.connection === "DATA_FLOWING" && !adapter.state.lastDataAt) {
        adapter._setConnectionState("STALE", "No data received since connection");
      }
    }
  }

  getHealthSummary() {
    const adapters = [...this.adapters.values()];
    return {
      total: adapters.length,
      connected: adapters.filter(a => ["CONNECTED", "AUTHENTICATED"].includes(a.state.connection)).length,
      dataFlowing: adapters.filter(a => a.state.data === "DATA_FLOWING").length,
      stale: adapters.filter(a => a.state.data === "STALE").length,
      error: adapters.filter(a => a.state.connection === "ERROR").length,
      byKind: this._countByKind(adapters),
      adapters: adapters.map(a => a.getStatus())
    };
  }

  _countByKind(adapters) {
    const counts = {};
    for (const a of adapters) {
      const k = a.providerKind || "UNKNOWN";
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }

  _persist() {
    try {
      const list = [...this.adapters.values()].map(a => ({
        providerId: a.getId(),
        providerName: a.getName(),
        providerKind: a.getKind(),
        configKeys: Object.keys(a.config),
        status: a.state.connection
      }));
      if (typeof this.store?.writeSection === "function") this.store.writeSection("marketDataRegistry", list);
    } catch {}
  }

  // Convenience: get best available candles for a symbol across all adapters
  async getBestCandles(symbol, timeframe, limit = 100) {
    const sym = String(symbol || "").trim().toUpperCase();
    const tf = String(timeframe || "").trim().toUpperCase();
    const candidates = this.getDataFlowingAdapters().filter(a => a.capabilities.data.includes("CANDLES") && a.capabilities.timeframes.includes(tf));
    for (const adapter of candidates) {
      try {
        const candles = await adapter.fetchCandles(sym, tf, limit);
        if (candles?.length) return { providerId: adapter.getId(), candles };
      } catch {}
    }
    return { providerId: null, candles: [], note: "No adapter could provide candles for this symbol/timeframe" };
  }

  // Convenience: get aggregated odds for a fixture across sportsbooks
  async getAggregatedOdds(fixtureId) {
    const adapters = this.getDataFlowingAdapters().filter(a => a.capabilities.data.includes("ODDS"));
    const allOdds = [];
    for (const adapter of adapters) {
      try {
        const odds = await adapter.fetchOdds([fixtureId]);
        if (odds?.length) allOdds.push(...odds.map(o => ({ ...o, providerId: adapter.getId() })));
      } catch {}
    }
    return allOdds;
  }
}

export default MarketDataRegistry;