import test from "node:test";
import assert from "node:assert/strict";

import { MarketDataAdapter } from "../src/trading/MarketDataAdapter.js";
import { MarketDataRegistry } from "../src/trading/MarketDataRegistry.js";
import { SportsDataBus } from "../src/trading/SportsDataBus.js";
import { FBSAdapter } from "../src/trading/adapters/FBSAdapter.js";
import { PocketOptionAdapter } from "../src/trading/adapters/PocketOptionAdapter.js";
import { IQOptionAdapter } from "../src/trading/adapters/IQOptionAdapter.js";
import { ExpertOptionAdapter } from "../src/trading/adapters/ExpertOptionAdapter.js";
import { BetPawaAdapter } from "../src/trading/adapters/BetPawaAdapter.js";
import { BetKingAdapter } from "../src/trading/adapters/BetKingAdapter.js";
import { Bet9jaAdapter } from "../src/trading/adapters/Bet9jaAdapter.js";
import { SportyBetAdapter } from "../src/trading/adapters/SportyBetAdapter.js";
import EnterpriseEventBus from "../src/kernel/EnterpriseEventBus.js";

function makeBus() { return new EnterpriseEventBus(); }

test("MarketDataAdapter: base class enforces NOT_IMPLEMENTED", async () => {
  const bus = makeBus();
  class TestAdapter extends MarketDataAdapter {
    constructor() { super({ providerId: "test", providerName: "Test", providerKind: "DATA_FEED", eventBus: bus }); }
  }
  const a = new TestAdapter();
  await assert.rejects(() => a._doConnect(), /NOT_IMPLEMENTED/);
  await assert.rejects(() => a._doFetchCandles("EURUSD", "M1", 10), /NOT_IMPLEMENTED/);
  await assert.rejects(() => a._doFetchQuotes(["EURUSD"]), /NOT_IMPLEMENTED/);
});

test("MarketDataAdapter: normalization produces correct schema", () => {
  const bus = makeBus();
  class TestAdapter extends MarketDataAdapter {
    constructor() { super({ providerId: "test", providerName: "Test", providerKind: "DATA_FEED", eventBus: bus }); }
  }
  const a = new TestAdapter();
  const raw = [{ time: Date.now(), o: 1.1, h: 1.11, l: 1.09, c: 1.105, v: 100 }];
  const norm = a._normalizeCandles(raw, "EURUSD", "M1");
  assert.equal(norm.length, 1);
  const c = norm[0];
  assert.ok(c.timestamp);
  assert.ok(Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  assert.equal(c.symbol, "EURUSD");
  assert.equal(c.timeframe, "M1");
  assert.equal(c.venue, "test");
  assert.equal(c.dataQuality, "LIVE");
});

test("MarketDataAdapter: timeframe validation rejects invalid", async () => {
  const bus = makeBus();
  class TestAdapter extends MarketDataAdapter {
    constructor() { super({ providerId: "test", providerName: "Test", providerKind: "DATA_FEED", eventBus: bus }); }
    async _doFetchCandles() { return []; }
  }
  const a = new TestAdapter();
  await assert.rejects(() => a.fetchCandles("EURUSD", "INVALID", 10), /INVALID_TIMEFRAME/);
});

test("MarketDataRegistry: registers and lists adapters", () => {
  const bus = makeBus();
  const registry = new MarketDataRegistry({ eventBus: bus });
  class TestAdapter extends MarketDataAdapter {
    constructor() { super({ providerId: "test1", providerName: "Test 1", providerKind: "FOREX_BROKER", eventBus: bus }); }
  }
  const a1 = new TestAdapter();
  registry.registerAdapter(a1);
  assert.equal(registry.listAdapters().length, 1);
  assert.equal(registry.getAdapter("test1").getId(), "test1");
  assert.ok(!registry.getAdapter("nonexistent"));
});

test("MarketDataRegistry: getBestCandles returns from dataFlowing adapter", async () => {
  const bus = makeBus();
  const registry = new MarketDataRegistry({ eventBus: bus });
  class ConnectedAdapter extends MarketDataAdapter {
    constructor() { 
      super({ providerId: "connected", providerName: "Connected", providerKind: "FOREX_BROKER", eventBus: bus }); 
      this.capabilities.data = ["CANDLES"];
      this.capabilities.timeframes = ["M1", "M5", "H1"];
    }
    async _doConnect() { 
      this._setConnectionState("DATA_FLOWING"); 
      this.state.data = "DATA_FLOWING";  // Set data state for getBestCandles filter
      return { authenticated: true }; 
    }
    async _doFetchCandles(symbol, tf, limit) {
      return Array.from({ length: limit }, (_, i) => ({
        timestamp: Date.now() - i * 60000, open: 1.1, high: 1.11, low: 1.09, close: 1.105, volume: 100
      }));
    }
  }
  const a = new ConnectedAdapter();
  registry.registerAdapter(a);
  await a.connect();
  const result = await registry.getBestCandles("EURUSD", "M1", 5);
  assert.equal(result.providerId, "connected");
  assert.equal(result.candles.length, 5);
});

test("SportsDataBus: fixture identity resolution merges same event", async () => {
  const bus = makeBus();
  const registry = new MarketDataRegistry({ eventBus: bus });
  class MockSportsbook extends MarketDataAdapter {
    constructor(id, name) { super({ providerId: id, providerName: name, providerKind: "SPORTSBOOK", eventBus: bus }); }
    async _doConnect() { this._setConnectionState("DATA_FLOWING"); return { authenticated: false }; }
    async _doFetchFixtures() {
      return [{
        fixtureId: `${this.providerId}-fix1`,
        sport: "FOOTBALL",
        competition: "Premier League",
        homeTeam: "Manchester United",
        awayTeam: "Liverpool",
        startTime: new Date(Date.now() + 86400000).toISOString()
      }];
    }
    async _doFetchOdds() { return []; }
    async _doFetchStatistics() { return null; }
  }
  const a1 = new MockSportsbook("book1", "Book 1");
  const a2 = new MockSportsbook("book2", "Book 2");
  registry.registerAdapter(a1);
  registry.registerAdapter(a2);
  await a1.connect();
  await a2.connect();
  const sportsBus = new SportsDataBus({ marketDataRegistry: registry, eventBus: bus });
  await sportsBus.refreshAll();
  // Both providers should resolve to same canonical fixture
  assert.ok(sportsBus.fixtures.size === 1);
  const fixture = [...sportsBus.fixtures.values()][0];
  assert.ok(fixture.source.includes("book1"));
  assert.ok(fixture.source.includes("book2"));
});

test("FBSAdapter: paper mode generates valid candles", async () => {
  const a = new FBSAdapter();
  const candles = await a.fetchCandles("EURUSD", "M1", 10);
  assert.equal(candles.length, 10);
  for (const c of candles) {
    assert.ok(c.timestamp);
    assert.ok(Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
    assert.equal(c.symbol, "EURUSD");
    assert.equal(c.timeframe, "M1");
  }
});

test("FBSAdapter: liveEligibility returns PAPER_ONLY without creds", () => {
  const a = new FBSAdapter();
  const elig = a.liveEligibility();
  assert.equal(elig.eligible, false);
  assert.equal(elig.mode, "PAPER_ONLY");
});

test("PocketOptionAdapter: paper mode generates valid candles", async () => {
  const a = new PocketOptionAdapter();
  const candles = await a.fetchCandles("EURUSD", "M1", 5);
  assert.equal(candles.length, 5);
  for (const c of candles) {
    assert.ok(c.timestamp);
    assert.ok(Number.isFinite(c.open));
  }
});

test("IQOptionAdapter: paper mode generates valid candles", async () => {
  const a = new IQOptionAdapter();
  const candles = await a.fetchCandles("EURUSD", "M1", 5);
  assert.equal(candles.length, 5);
});

test("ExpertOptionAdapter: paper mode only, no live eligibility", async () => {
  const a = new ExpertOptionAdapter();
  const candles = await a.fetchCandles("EURUSD", "M1", 5);
  assert.equal(candles.length, 5);
  const elig = a.liveEligibility();
  assert.equal(elig.eligible, false);
  assert.equal(elig.mode, "PAPER_ONLY");
});

test("BetPawaAdapter: fetches fixtures (paper)", async () => {
  const a = new BetPawaAdapter();
  const fixtures = await a.fetchFixtures({});
  assert.ok(Array.isArray(fixtures));
  // Even without creds, should return empty or cached array
});

test("BetKingAdapter: fetches fixtures (paper)", async () => {
  const a = new BetKingAdapter();
  const fixtures = await a.fetchFixtures({});
  assert.ok(Array.isArray(fixtures));
});

test("Bet9jaAdapter: fetches fixtures (paper)", async () => {
  const a = new Bet9jaAdapter();
  const fixtures = await a.fetchFixtures({});
  assert.ok(Array.isArray(fixtures));
});

test("SportyBetAdapter: fetches fixtures (paper)", async () => {
  const a = new SportyBetAdapter();
  const fixtures = await a.fetchFixtures({});
  assert.ok(Array.isArray(fixtures));
});

test("All adapters: executeOrder returns PAPER/NOT_SUPPORTED without creds", async () => {
  const adapters = [
    new FBSAdapter(),
    new PocketOptionAdapter(),
    new IQOptionAdapter(),
    new ExpertOptionAdapter(),
    new BetPawaAdapter(),
    new BetKingAdapter(),
    new Bet9jaAdapter(),
    new SportyBetAdapter()
  ];
  for (const a of adapters) {
    const result = await a.executeOrder({ symbol: "EURUSD", side: "BUY", amount: 1 });
    assert.ok(result.mode === "PAPER" || result.mode === "NOT_SUPPORTED" || result.mode === "LIVE_IF_APPROVED");
    assert.equal(result.success, false);
  }
});