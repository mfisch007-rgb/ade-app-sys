/**
 * ADE SPORTYBET ADAPTER — Sports data from SportyBet.
 *
 * Supports: fixtures, odds, statistics, live scores.
 * Execution: NOT_SUPPORTED (data only).
 */

import { MarketDataAdapter } from "../MarketDataAdapter.js";

export class SportyBetAdapter extends MarketDataAdapter {
  constructor(config = {}) {
    super({
      providerId: "sportybet",
      providerName: "SportyBet",
      providerKind: "SPORTSBOOK",
      config: {
        SPORTYBET_API_URL: config.SPORTYBET_API_URL || process.env.SPORTYBET_API_URL,
        SPORTYBET_API_KEY: config.SPORTYBET_API_KEY || process.env.SPORTYBET_API_KEY,
        SPORTYBET_FEED_URL: config.SPORTYBET_FEED_URL || process.env.SPORTYBET_FEED_URL,
        ...config
      }
    });
    this.capabilities = {
      data: ["FIXTURES", "ODDS", "STATISTICS", "LIVE_SCORES", "MARKETS"],
      execution: [],
      timeframes: [],
      symbols: [],
      authMethods: ["API_KEY", "PUBLIC_FEED"]
    };
    this._fixtureCache = new Map();
  }

  async _doConnect() {
    const creds = this.loadCredentials();

    if (creds.SPORTYBET_API_KEY && creds.SPORTYBET_API_URL) {
      const ok = await this._testAPI(creds.SPORTYBET_API_KEY);
      if (ok) {
        this.state.connection = "AUTHENTICATED";
        this.state.authStatus = "API_VERIFIED";
        return { authenticated: true };
      }
    }

    if (creds.SPORTYBET_FEED_URL) {
      const ok = await this._testFeed(creds.SPORTYBET_FEED_URL);
      if (ok) {
        this.state.connection = "CONNECTED";
        this.state.authStatus = "PUBLIC_FEED";
        return { authenticated: false };
      }
    }

    await this._loadPublicData();
    return { authenticated: false };
  }

  async _testAPI(key) {
    try {
      const res = await fetch(`${this.config.SPORTYBET_API_URL}/health`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      return res.ok;
    } catch { return false; }
  }

  async _testFeed(url) {
    try {
      const res = await fetch(url);
      return res.ok;
    } catch { return false; }
  }

  async _loadPublicData() {
    try {
      await this.initBrowserContext({ headless: true });
      const page = await this.newPage();
      if (!page) return;

      await page.goto("https://www.sportybet.com/ng/sport/football", { waitUntil: "networkidle2", timeout: 30000 });

      const fixtures = await page.evaluate(() => {
        const events = document.querySelectorAll('[data-match], .match-item, .event-row');
        return Array.from(events).map(el => ({
          fixtureId: el.getAttribute('data-match-id') || `SPORTYBET-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sport: "FOOTBALL",
          competition: el.querySelector('.league, .tournament')?.textContent?.trim(),
          homeTeam: el.querySelector('.home-team, .team-home')?.textContent?.trim(),
          awayTeam: el.querySelector('.away-team, .team-away')?.textContent?.trim(),
          startTime: el.querySelector('.match-time, .time')?.textContent?.trim(),
          source: "sportybet-web"
        })).filter(f => f.homeTeam && f.awayTeam);
      });

      for (const f of fixtures) {
        this._fixtureCache.set(f.fixtureId, f);
      }
      this.capabilities.symbols = [...new Set(fixtures.map(f => `${f.homeTeam} v ${f.awayTeam}`))];
    } catch (err) {
      this.state.lastError = `Public data load failed: ${err.message}`;
    }
  }

  async _doDisconnect() {
    await this.closeBrowserContext();
  }

  async _doFetchFixtures(params = {}) {
    if (this.config.SPORTYBET_API_KEY && this.config.SPORTYBET_API_URL) {
      try {
        const res = await fetch(`${this.config.SPORTYBET_API_URL}/fixtures?status=${params.status || "SCHEDULED"}`, {
          headers: { Authorization: `Bearer ${this.config.SPORTYBET_API_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeFixtures(data.fixtures || data);
        }
      } catch {}
    }

    return [...this._fixtureCache.values()].slice(0, params.limit || 100);
  }

  async _doFetchOdds(fixtureIds) {
    if (this.config.SPORTYBET_API_KEY && this.config.SPORTYBET_API_URL) {
      try {
        const res = await fetch(`${this.config.SPORTYBET_API_URL}/odds?fixtures=${fixtureIds.join(",")}`, {
          headers: { Authorization: `Bearer ${this.config.SPORTYBET_API_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeOdds(data.odds || data);
        }
      } catch {}
    }

    return [];
  }

  async _doFetchStatistics(fixtureId) {
    if (this.config.SPORTYBET_API_KEY && this.config.SPORTYBET_API_URL) {
      try {
        const res = await fetch(`${this.config.SPORTYBET_API_URL}/statistics/${fixtureId}`, {
          headers: { Authorization: `Bearer ${this.config.SPORTYBET_API_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeStatistics(data);
        }
      } catch {}
    }
    return null;
  }

  liveEligibility() {
    return { eligible: false, mode: "NOT_SUPPORTED", reason: "SportyBet: data-only provider. No automated execution API." };
  }

  async executeOrder(order) {
    return { success: false, mode: "NOT_SUPPORTED", reason: "SportyBet does not support automated execution via ADE.", order };
  }
}

export default SportyBetAdapter;