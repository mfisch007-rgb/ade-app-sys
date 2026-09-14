/**
 * ADE BETPAWA ADAPTER — Sports data from BetPawa Nigeria.
 *
 * Supports: fixtures, odds, statistics, live scores.
 * Execution: NOT_SUPPORTED (data only).
 */

import { MarketDataAdapter } from "../MarketDataAdapter.js";

export class BetPawaAdapter extends MarketDataAdapter {
  constructor(config = {}) {
    super({
      providerId: "betpawa",
      providerName: "BetPawa",
      providerKind: "SPORTSBOOK",
      config: {
        BETPAWA_API_URL: config.BETPAWA_API_URL || process.env.BETPAWA_API_URL || "https://api.betpawa.ng",
        BETPAWA_API_KEY: config.BETPAWA_API_KEY || process.env.BETPAWA_API_KEY,
        BETPAWA_FEED_URL: config.BETPAWA_FEED_URL || process.env.BETPAWA_FEED_URL,
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
    this._oddsCache = new Map();
  }

  async _doConnect() {
    const creds = this.loadCredentials();

    if (creds.BETPAWA_API_KEY && creds.BETPAWA_API_URL) {
      const ok = await this._testAPI(creds.BETPAWA_API_KEY);
      if (ok) {
        this.state.connection = "AUTHENTICATED";
        this.state.authStatus = "AUTHENTICATED";
        return { authenticated: true };
      }
    }

    // Try public feed
    if (creds.BETPAWA_FEED_URL) {
      const ok = await this._testPublicFeed(creds.BETPAWA_FEED_URL);
      if (ok) {
        this.state.connection = "CONNECTED";
        this.state.authStatus = "PUBLIC_FEED";
        return { authenticated: false };
      }
    }

    // Scrape public website as fallback
    await this._loadPublicFixtures();
    return { authenticated: false };
  }

  async _testAPI(key) {
    try {
      const res = await fetch(`${this.config.BETPAWA_API_URL}/health`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      return res.ok;
    } catch { return false; }
  }

  async _testPublicFeed(url) {
    try {
      const res = await fetch(url);
      return res.ok;
    } catch { return false; }
  }

  async _loadPublicFixtures() {
    try {
      await this.initBrowserContext({ headless: true });
      const page = await this.newPage();
      if (!page) return;

      await page.goto("https://www.betpawa.ng/sports", { waitUntil: "networkidle2", timeout: 30000 });

      const fixtures = await page.evaluate(() => {
        const events = document.querySelectorAll('[data-event], .event-row, .match-item');
        return Array.from(events).map(el => ({
          fixtureId: el.getAttribute('data-event-id') || el.getAttribute('data-id'),
          sport: "FOOTBALL",
          competition: el.getAttribute('data-league') || el.querySelector('.league-name')?.textContent?.trim(),
          homeTeam: el.querySelector('.home-team, [data-home]')?.textContent?.trim() || el.getAttribute('data-home'),
          awayTeam: el.querySelector('.away-team, [data-away]')?.textContent?.trim() || el.getAttribute('data-away'),
          startTime: el.getAttribute('data-time') || el.querySelector('.match-time')?.textContent?.trim(),
          source: "betpawa-web"
        })).filter(f => f.homeTeam && f.awayTeam);
      });

      for (const f of fixtures) {
        this._fixtureCache.set(f.fixtureId || `BETPAWA-${Date.now()}-${Math.random().toString(36).slice(2)}`, f);
      }
      this.capabilities.symbols = [...new Set(fixtures.map(f => `${f.homeTeam} v ${f.awayTeam}`))];
    } catch (err) {
      this.state.lastError = `Public fixture load failed: ${err.message}`;
    }
  }

  async _doDisconnect() {
    await this.closeBrowserContext();
  }

  async _doFetchFixtures(params = {}) {
    if (this.config.BETPAWA_API_KEY && this.config.BETPAWA_API_URL) {
      try {
        const res = await fetch(`${this.config.BETPAWA_API_URL}/fixtures?status=${params.status || "SCHEDULED"}`, {
          headers: { Authorization: `Bearer ${this.config.BETPAWA_API_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeFixtures(data.fixtures || data);
        }
      } catch {}
    }

    // Return cached fixtures
    return [...this._fixtureCache.values()].slice(0, params.limit || 100);
  }

  async _doFetchOdds(fixtureIds) {
    if (this.config.BETPAWA_API_KEY && this.config.BETPAWA_API_URL) {
      try {
        const ids = fixtureIds.join(",");
        const res = await fetch(`${this.config.BETPAWA_API_URL}/odds?fixtures=${ids}`, {
          headers: { Authorization: `Bearer ${this.config.BETPAWA_API_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeOdds(data.odds || data);
        }
      } catch {}
    }

    // Try web scraping for odds
    if (this.config._page) {
      try {
        return await this.config._page.evaluate(async (ids) => {
          const results = [];
          for (const id of ids) {
            const el = document.querySelector(`[data-event-id="${id}"]`);
            if (el) {
              const odds = el.querySelectorAll('.odds-value, .odd-button');
              odds.forEach(o => {
                results.push({
                  fixtureId: id,
                  market: o.getAttribute('data-market') || "MATCH_WINNER",
                  selection: o.getAttribute('data-selection') || o.textContent?.trim(),
                  odds: parseFloat(o.getAttribute('data-odd') || o.textContent?.trim())
                });
              });
            }
          }
          return results;
        }, fixtureIds);
      } catch {}
    }

    return [];
  }

  async _doFetchStatistics(fixtureId) {
    if (this.config.BETPAWA_API_KEY && this.config.BETPAWA_API_URL) {
      try {
        const res = await fetch(`${this.config.BETPAWA_API_URL}/statistics/${fixtureId}`, {
          headers: { Authorization: `Bearer ${this.config.BETPAWA_API_KEY}` }
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
    return { eligible: false, mode: "NOT_SUPPORTED", reason: "BetPawa: data-only provider. No execution capability." };
  }

  async executeOrder(order) {
    return { success: false, mode: "NOT_SUPPORTED", reason: "BetPawa does not support automated execution via ADE.", order };
  }
}

export default BetPawaAdapter;