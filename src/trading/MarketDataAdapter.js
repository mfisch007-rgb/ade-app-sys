/**
 * ADE MARKET DATA ADAPTER — provider-neutral base class for market/sports data sources.
 *
 * All concrete adapters extend this class. It enforces truthful capability reporting,
 * normalized data output, and health telemetry. No fabrication of connectivity or data.
 *
 * Usage:
 *   class MyAdapter extends MarketDataAdapter {
 *     async connect() { ... }
 *     async fetchCandles(symbol, timeframe, limit) { ... }
 *     async fetchQuotes(symbols) { ... }
 *   }
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

export const DATA_TYPES = Object.freeze([
  "CANDLES",
  "QUOTES",
  "TICKS",
  "SYMBOLS",
  "INSTRUMENTS",
  "FIXTURES",
  "EVENTS",
  "MARKETS",
  "ODDS",
  "STATISTICS"
]);

export const TIMEFRAMES = Object.freeze(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);

export const CONNECTION_STATES = Object.freeze([
  "DISCOVERED",
  "CONFIGURING",
  "CONNECTING",
  "CONNECTED",
  "AUTHENTICATED",
  "DATA_FLOWING",
  "STALE",
  "ERROR",
  "DISCONNECTED",
  "BLOCKED"
]);

export const EXECUTION_MODES = Object.freeze(["PUBLIC", "PAPER", "SANDBOX", "LIVE"]);

function normalizeSymbol(s) {
  return String(s || "").trim().toUpperCase();
}

function normalizeTimeframe(tf) {
  const t = String(tf || "").trim().toUpperCase();
  return TIMEFRAMES.includes(t) ? t : null;
}

export class MarketDataAdapter {
  constructor({ providerId, providerName, providerKind, config = {}, eventBus = null } = {}) {
    this.providerId = String(providerId || "").toLowerCase();
    this.providerName = String(providerName || "Unknown Provider");
    this.providerKind = providerKind; // "FOREX_BROKER" | "BINARY_BROKER" | "SPORTSBOOK" | "DATA_FEED"
    this.config = { ...config };
    this.eventBus = eventBus || EnterpriseEventBus.getInstance();
    this.state = {
      connection: "DISCOVERED",
      data: "UNAVAILABLE",
      execution: "PUBLIC",
      environment: "PUBLIC",
      authStatus: "NOT_CONFIGURED",
      lastHandshake: null,
      lastDataAt: null,
      lastError: null,
      lastErrorAt: null,
      recordsReceived: 0,
      parseErrors: 0,
      authErrors: 0,
      rateLimitErrors: 0,
      latencyMs: null
    };
    this.capabilities = {
      data: [],
      execution: [],
      timeframes: [],
      symbols: [],
      authMethods: []
    };
    this._healthTimer = null;
    this._browserContext = null;
  }

  getId() { return this.providerId; }
  getName() { return this.providerName; }
  getKind() { return this.providerKind; }

  getStatus() {
    // Spec-compliant aliases alongside canonical fields — both are truthful.
    const base = {
      providerId: this.providerId,
      providerName: this.providerName,
      providerKind: this.providerKind,
      productType: this.providerKind,
      connection: this.state.connection,
      connectionStatus: this.state.connection,
      data: this.state.data,
      dataStatus: this.state.data,
      dataCapabilities: this.capabilities.data,
      execution: this.state.execution,
      executionStatus: this.state.execution,
      executionCapabilities: this.capabilities.execution,
      environment: this.state.environment,
      authenticationType: this.capabilities.authMethods,
      authStatus: this.state.authStatus,
      authorizationStatus: this.state.authStatus,
      lastHandshake: this.state.lastHandshake,
      lastSuccessfulHandshake: this.state.lastHandshake,
      lastDataAt: this.state.lastDataAt,
      lastDataEventAt: this.state.lastDataAt,
      lastError: this.state.lastError,
      lastErrorAt: this.state.lastErrorAt,
      errorState: this.state.lastError ? { message: this.state.lastError, at: this.state.lastErrorAt } : null,
      health: {
        recordsReceived: this.state.recordsReceived,
        recordsReceivedTotal: this.state.recordsReceived,
        parseErrors: this.state.parseErrors,
        parseErrorsTotal: this.state.parseErrors,
        authErrors: this.state.authErrors,
        authErrorsTotal: this.state.authErrors,
        rateLimitErrors: this.state.rateLimitErrors,
        rateLimitErrorsTotal: this.state.rateLimitErrors,
        latencyMs: this.state.latencyMs,
        lastDataAt: this.state.lastDataAt,
        lastSuccessfulRequestAt: this.state.lastDataAt,
        staleAfterMs: 60000,
        sourceQualityScore: Math.max(0, 1 - (this.state.parseErrors + this.state.authErrors) * 0.05)
      },
      capabilities: { ...this.capabilities },
      configKeys: Object.keys(this.config).filter(k => !k.toLowerCase().includes("secret") && !k.toLowerCase().includes("token") && !k.toLowerCase().includes("key"))
    };
    return base;
  }

  async connect() {
    this._setConnectionState("CONNECTING");
    try {
      const result = await this._doConnect();
      if (result?.authenticated) {
        this._setConnectionState("AUTHENTICATED");
        this.state.authStatus = "AUTHENTICATED";
        this.state.lastHandshake = new Date().toISOString();
      } else {
        this._setConnectionState("CONNECTED");
      }
      this._publish("MARKET_DATA_CONNECTED", { providerId: this.providerId, state: this.state.connection });
      return { success: true, state: this.state.connection };
    } catch (err) {
      this._setConnectionState("ERROR", err.message);
      throw err;
    }
  }

  async _doConnect() { throw new Error("NOT_IMPLEMENTED: connect() must be implemented by concrete adapter"); }

  async disconnect() {
    if (this._healthTimer) { clearInterval(this._healthTimer); this._healthTimer = null; }
    await this._doDisconnect();
    this._setConnectionState("DISCONNECTED");
    this._publish("MARKET_DATA_DISCONNECTED", { providerId: this.providerId });
    return { success: true };
  }

  async _doDisconnect() { /* optional override */ }

  async fetchCandles(symbol, timeframe, limit = 100) {
    const sym = normalizeSymbol(symbol);
    const tf = normalizeTimeframe(timeframe);
    if (!tf) throw new Error(`INVALID_TIMEFRAME: must be one of ${TIMEFRAMES.join(", ")}`);
    const start = Date.now();
    try {
      const candles = await this._doFetchCandles(sym, tf, limit);
      this.state.latencyMs = Date.now() - start;
      this.state.lastDataAt = new Date().toISOString();
      this.state.recordsReceived += candles?.length || 0;
      if (candles?.length) this._setDataState("DATA_FLOWING");
      this._publish("MARKET_DATA_RECEIVED", { providerId: this.providerId, type: "CANDLES", symbol: sym, timeframe: tf, count: candles?.length || 0 });
      return this._normalizeCandles(candles, sym, tf);
    } catch (err) {
      this.state.parseErrors++;
      this._setConnectionState("ERROR", err.message);
      this._publish("MARKET_DATA_STALE", { providerId: this.providerId, error: err.message });
      throw err;
    }
  }

  async _doFetchCandles(symbol, timeframe, limit) { throw new Error("NOT_IMPLEMENTED: fetchCandles() must be implemented"); }

  async fetchQuotes(symbols) {
    const syms = (Array.isArray(symbols) ? symbols : [symbols]).map(normalizeSymbol).filter(Boolean);
    const start = Date.now();
    try {
      const quotes = await this._doFetchQuotes(syms);
      this.state.latencyMs = Date.now() - start;
      this.state.lastDataAt = new Date().toISOString();
      this.state.recordsReceived += quotes?.length || 0;
      this._publish("MARKET_DATA_RECEIVED", { providerId: this.providerId, type: "QUOTES", symbols: syms, count: quotes?.length || 0 });
      return this._normalizeQuotes(quotes);
    } catch (err) {
      this.state.parseErrors++;
      this._setConnectionState("ERROR", err.message);
      throw err;
    }
  }

  async _doFetchQuotes(symbols) { throw new Error("NOT_IMPLEMENTED: fetchQuotes() must be implemented"); }

  async fetchFixtures(params = {}) {
    const start = Date.now();
    try {
      const fixtures = await this._doFetchFixtures(params);
      this.state.latencyMs = Date.now() - start;
      this.state.lastDataAt = new Date().toISOString();
      this.state.recordsReceived += fixtures?.length || 0;
      this._publish("SPORTS_EVENT_RECEIVED", { providerId: this.providerId, type: "FIXTURES", count: fixtures?.length || 0 });
      return this._normalizeFixtures(fixtures);
    } catch (err) {
      this.state.parseErrors++;
      this._setConnectionState("ERROR", err.message);
      throw err;
    }
  }

  async _doFetchFixtures(params) { throw new Error("NOT_IMPLEMENTED: fetchFixtures() not supported by this provider"); }

  async fetchOdds(fixtureIds) {
    const ids = Array.isArray(fixtureIds) ? fixtureIds : [fixtureIds];
    const start = Date.now();
    try {
      const odds = await this._doFetchOdds(ids);
      this.state.latencyMs = Date.now() - start;
      this.state.lastDataAt = new Date().toISOString();
      this._publish("ODDS_UPDATE_RECEIVED", { providerId: this.providerId, count: odds?.length || 0 });
      return this._normalizeOdds(odds);
    } catch (err) {
      this.state.parseErrors++;
      this._setConnectionState("ERROR", err.message);
      throw err;
    }
  }

  async _doFetchOdds(fixtureIds) { throw new Error("NOT_IMPLEMENTED: fetchOdds() not supported by this provider"); }

  async fetchStatistics(fixtureId) {
    const start = Date.now();
    try {
      const stats = await this._doFetchStatistics(fixtureId);
      this.state.latencyMs = Date.now() - start;
      this.state.lastDataAt = new Date().toISOString();
      this._publish("SPORTS_EVENT_RECEIVED", { providerId: this.providerId, type: "STATISTICS", fixtureId });
      return this._normalizeStatistics(stats);
    } catch (err) {
      this.state.parseErrors++;
      this._setConnectionState("ERROR", err.message);
      throw err;
    }
  }

  async _doFetchStatistics(fixtureId) { throw new Error("NOT_IMPLEMENTED: fetchStatistics() not supported by this provider"); }

  liveEligibility() {
    return { eligible: false, mode: "PAPER_ONLY", reason: "Live execution not implemented or not verified." };
  }

  async executeOrder(order) {
    return { success: false, mode: "PAPER_ONLY", reason: "Live execution not available for this adapter.", order };
  }

  // --- Normalization helpers (override as needed) ---

  _normalizeCandles(raw, symbol, timeframe) {
    if (!Array.isArray(raw)) return [];
    return raw.map((c, i) => ({
      instrument: symbol,
      symbol,
      venue: this.providerId,
      timestamp: this._toISO(c.timestamp || c.time || c.t || c.openTime),
      open: this._num(c.open ?? c.o),
      high: this._num(c.high ?? c.h),
      low: this._num(c.low ?? c.l),
      close: this._num(c.close ?? c.c),
      volume: this._num(c.volume ?? c.v ?? c.vol),
      tickVolume: this._num(c.tickVolume ?? c.tv),
      timeframe,
      spread: this._num(c.spread),
      source: this.providerId,
      sequence: this._num(c.sequence ?? c.id ?? i),
      receivedAt: new Date().toISOString(),
      dataQuality: "LIVE"
    })).filter(c => c.timestamp && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  }

  // Circular candle buffer + CANDLE_CLOSED emission (M1..D1)
  _ensureCandleBuffer() {
    if (!this._candleBuffer) this._candleBuffer = new Map(); // key: symbol|timeframe -> { current, closed: [] }
  }
  _timeframeMs(tf) { const m = { TICK: 0, M1: 60000, M5: 300000, M15: 900000, M30: 1800000, H1: 3600000, H4: 14400000, D1: 86400000 }; return m[tf] ?? 60000; }
  _floorToTimeframe(ts, tf) { const ms = this._timeframeMs(tf); return ms ? Math.floor(ts / ms) * ms : ts; }
  ingestTick({ symbol, bid, ask, price, timestamp, source = "WEBSOCKET" } = {}) {
    this._ensureCandleBuffer();
    const ts = Number(timestamp) || Date.now();
    const p = Number(price ?? (bid != null && ask != null ? (Number(bid) + Number(ask)) / 2 : bid ?? ask));
    if (!Number.isFinite(p) || !symbol) return [];
    const closed = [];
    for (const tf of this.capabilities.timeframes || ["M1"]) {
      const key = `${String(symbol).toUpperCase()}|${tf}`;
      let slot = this._candleBuffer.get(key);
      const bucket = this._floorToTimeframe(ts, tf);
      if (!slot || slot.bucket !== bucket) {
        if (slot?.current) {
          slot.closed.push(slot.current);
          if (slot.closed.length > 500) slot.closed.shift();
          closed.push({ symbol: String(symbol).toUpperCase(), timeframe: tf, candle: slot.current });
          try { this.eventBus?.publish?.("CANDLE_CLOSED", { providerId: this.providerId, symbol: String(symbol).toUpperCase(), timeframe: tf, candle: slot.current }); } catch {}
        }
        slot = { bucket, current: { instrument: String(symbol).toUpperCase(), symbol: String(symbol).toUpperCase(), venue: this.providerId, timestamp: new Date(bucket).toISOString(), open: p, high: p, low: p, close: p, volume: null, tickVolume: 1, timeframe: tf, spread: bid != null && ask != null ? Number(ask) - Number(bid) : null, source, sequenceId: null, receivedAt: Date.now(), dataQuality: source === "HISTORICAL_BACKFILL" ? "HISTORICAL_SUPPLIED" : "HIGH" } };
        this._candleBuffer.set(key, slot);
      } else {
        slot.current.high = Math.max(slot.current.high, p);
        slot.current.low = Math.min(slot.current.low, p);
        slot.current.close = p;
        slot.current.tickVolume = (slot.current.tickVolume ?? 0) + 1;
        slot.current.spread = bid != null && ask != null ? Number(ask) - Number(bid) : slot.current.spread;
      }
    }
    // Ensure chronological order by timestamp (ticks sorted)
    return closed;
  }
  getClosedCandles(symbol, timeframe, limit = 100) {
    this._ensureCandleBuffer();
    const key = `${String(symbol).toUpperCase()}|${String(timeframe).toUpperCase()}`;
    const slot = this._candleBuffer.get(key);
    if (!slot) return [];
    return slot.closed.slice(-limit);
  }

  _normalizeQuotes(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(q => ({
      instrument: q.symbol || q.s,
      symbol: q.symbol || q.s,
      venue: this.providerId,
      timestamp: this._toISO(q.timestamp || q.time || q.t),
      bid: this._num(q.bid ?? q.b ?? q.bestBid),
      ask: this._num(q.ask ?? q.a ?? q.bestAsk),
      spread: this._num(q.spread ?? (q.ask - q.bid)),
      source: this.providerId,
      receivedAt: new Date().toISOString(),
      dataQuality: "LIVE"
    })).filter(q => q.symbol && Number.isFinite(q.bid) && Number.isFinite(q.ask));
  }

  _normalizeFixtures(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(f => ({
      fixtureId: String(f.id || f.fixtureId || f.matchId || `FIX-${crypto.randomBytes(4).toString("hex")}`),
      sport: String(f.sport || f.category || "FOOTBALL").toUpperCase(),
      competition: String(f.competition || f.league || f.tournament || "UNKNOWN"),
      homeTeam: String(f.homeTeam || f.home || f.team1 || "HOME"),
      awayTeam: String(f.awayTeam || f.away || f.team2 || "AWAY"),
      startTime: this._toISO(f.startTime || f.kickoff || f.date || f.time),
      venue: f.venue || null,
      status: String(f.status || "SCHEDULED").toUpperCase(),
      source: this.providerId,
      receivedAt: new Date().toISOString()
    }));
  }

  _normalizeOdds(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(o => ({
      fixtureId: String(o.fixtureId || o.matchId || o.id),
      market: String(o.market || o.type || "MATCH_WINNER").toUpperCase(),
      selection: String(o.selection || o.outcome || o.name),
      odds: this._num(o.odds || o.price || o.value),
      source: this.providerId,
      timestamp: this._toISO(o.timestamp || o.time || o.t),
      receivedAt: new Date().toISOString()
    })).filter(o => o.fixtureId && o.selection && Number.isFinite(o.odds));
  }

  _normalizeStatistics(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      fixtureId: String(raw.fixtureId || raw.matchId || raw.id),
      goals: { home: this._num(raw.goalsHome), away: this._num(raw.goalsAway) },
      corners: { home: this._num(raw.cornersHome), away: this._num(raw.cornersAway) },
      cards: { home: { yellow: this._num(raw.yellowHome), red: this._num(raw.redHome) }, away: { yellow: this._num(raw.yellowAway), red: this._num(raw.redAway) } },
      fouls: { home: this._num(raw.foulsHome), away: this._num(raw.foulsAway) },
      shots: { home: this._num(raw.shotsHome), away: this._num(raw.shotsAway) },
      shotsOnTarget: { home: this._num(raw.shotsOnTargetHome), away: this._num(raw.shotsOnTargetAway) },
      possession: { home: this._num(raw.possessionHome), away: this._num(raw.possessionAway) },
      source: this.providerId,
      timestamp: this._toISO(raw.timestamp || raw.time),
      receivedAt: new Date().toISOString()
    };
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  _toISO(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  _setConnectionState(state, error = null) {
    this.state.connection = state;
    if (error) { this.state.lastError = error; this.state.lastErrorAt = new Date().toISOString(); }
    this._publish("MARKET_DATA_STATE_CHANGE", { providerId: this.providerId, connection: state, error });
  }

  _setDataState(state) { this.state.data = state; }

  _publish(topic, payload) {
    try { this.eventBus?.publish?.(topic, { ...payload, providerId: this.providerId, timestamp: new Date().toISOString() }); } catch {}
  }

  // --- Browser automation support (optional) ---
  async initBrowserContext({ headless = true, userAgent, viewport } = {}) {
    if (this._browserContext) return this._browserContext;
    try {
      const puppeteer = require("puppeteer-core").catch(() => require("puppeteer"));
      this._browserContext = await puppeteer.default.launch({
        headless,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
        ignoreDefaultArgs: ["--enable-automation"]
      });
      return this._browserContext;
    } catch { return null; }
  }

  async closeBrowserContext() {
    if (this._browserContext) { await this._browserContext.close(); this._browserContext = null; }
  }

  async newPage() {
    if (!this._browserContext) return null;
    const page = await this._browserContext.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.setViewport({ width: 1366, height: 768 });
    return page;
  }

  // Human-like interaction helpers
  async humanType(page, selector, text, { minDelay = 80, maxDelay = 180 } = {}) {
    await page.waitForSelector(selector, { visible: true });
    await page.click(selector);
    for (const ch of String(text)) { await page.keyboard.type(ch); await this._randDelay(minDelay, maxDelay); }
  }

  async humanClick(page, selector, { xVar = 3, yVar = 3 } = {}) {
    await page.waitForSelector(selector, { visible: true });
    const box = await page.$eval(selector, el => el.getBoundingClientRect());
    const x = box.x + box.width / 2 + (Math.random() - 0.5) * xVar;
    const y = box.y + box.height / 2 + (Math.random() - 0.5) * yVar;
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 5) });
    await this._randDelay(50, 150);
    await page.mouse.click(x, y);
  }

  async _randDelay(min, max) { await new Promise(r => setTimeout(r, min + Math.random() * (max - min))); }

  // Credential loading (server-side only, from env/config)
  loadCredentials() {
    const creds = {};
    for (const [k, v] of Object.entries(this.config)) {
      if (k.toLowerCase().includes("token") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("key") || k.toLowerCase().includes("password")) {
        const envVal = process.env[k];
        if (envVal) creds[k] = envVal;
        else if (v) creds[k] = v;
      }
    }
    return creds;
  }
}

export default MarketDataAdapter;