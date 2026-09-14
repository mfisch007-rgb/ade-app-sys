/**
 * ADE BETKING / BETAGY ADAPTER — Sports data from BetKing/Betagy.
 *
 * Supports: fixtures, odds, statistics (B2B feed or public).
 * Execution: NOT_SUPPORTED (data only).
 */

import { MarketDataAdapter } from "../MarketDataAdapter.js";

export class BetKingAdapter extends MarketDataAdapter {
  constructor(config = {}) {
    super({
      providerId: "betking",
      providerName: "BetKing",
      providerKind: "SPORTSBOOK",
      config: {
        BETKING_API_URL: config.BETKING_API_URL || process.env.BETKING_API_URL,
        BETKING_API_KEY: config.BETKING_API_KEY || process.env.BETKING_API_KEY,
        BETKING_B2B_URL: config.BETKING_B2B_URL || process.env.BETKING_B2B_URL,
        BETKING_B2B_KEY: config.BETKING_B2B_KEY || process.env.BETKING_B2B_KEY,
        ...config
      }
    });
    this.capabilities = {
      data: ["FIXTURES", "ODDS", "STATISTICS", "LIVE_SCORES", "MARKETS"],
      execution: [],
      timeframes: [],
      symbols: [],
      authMethods: ["B2B_API_KEY", "PUBLIC_FEED"]
    };
    this._fixtureCache = new Map();
    this._isB2B = false;
  }

  async _doConnect() {
    const creds = this.loadCredentials();

    // Try B2B API first (operator level)
    if (creds.BETKING_B2B_KEY && creds.BETKING_B2B_URL) {
      const ok = await this._testB2B(creds.BETKING_B2B_KEY, creds.BETKING_B2B_URL);
      if (ok) {
        this._isB2B = true;
        this.state.connection = "AUTHENTICATED";
        this.state.authStatus = "B2B_VERIFIED";
        return { authenticated: true };
      }
    }

    // Try standard API
    if (creds.BETKING_API_KEY && creds.BETKING_API_URL) {
      const ok = await this._testAPI(creds.BETKING_API_KEY);
      if (ok) {
        this.state.connection = "AUTHENTICATED";
        this.state.authStatus = "API_VERIFIED";
        return { authenticated: true };
      }
    }

    // Public website scraping
    await this._loadPublicData();
    return { authenticated: false };
  }

  async _testB2B(key, url) {
    try {
      const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${key}` } });
      return res.ok;
    } catch { return false; }
  }

  async _testAPI(key) {
    try {
      const res = await fetch(`${this.config.BETKING_API_URL}/health`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      return res.ok;
    } catch { return false; }
  }

  async _loadPublicData() {
    try {
      await this.initBrowserContext({ headless: true });
      const page = await this.newPage();
      if (!page) return;

      await page.goto("https://www.betking.com/sports", { waitUntil: "networkidle2", timeout: 30000 });

      const fixtures = await page.evaluate(() => {
        const events = document.querySelectorAll('[data-event], .match-row, .event-item');
        return Array.from(events).map(el => ({
          fixtureId: el.getAttribute('data-event-id') || `BETKING-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sport: "FOOTBALL",
          competition: el.querySelector('.league, .competition')?.textContent?.trim(),
          homeTeam: el.querySelector('.home, [data-home]')?.textContent?.trim(),
          awayTeam: el.querySelector('.away, [data-away]')?.textContent?.trim(),
          startTime: el.querySelector('.time, [data-time]')?.textContent?.trim(),
          source: "betking-web"
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
    if (this._isB2B && this.config.BETKING_B2B_KEY) {
      try {
        const res = await fetch(`${this.config.BETKING_B2B_URL}/fixtures`, {
          headers: { Authorization: `Bearer ${this.config.BETKING_B2B_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeFixtures(data.fixtures || data);
        }
      } catch {}
    }

    if (this.config.BETKING_API_KEY) {
      try {
        const res = await fetch(`${this.config.BETKING_API_URL}/fixtures`, {
          headers: { Authorization: `Bearer ${this.config.BETKING_API_KEY}` }
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
    if (this._isB2B && this.config.BETKING_B2B_KEY) {
      try {
        const res = await fetch(`${this.config.BETKING_B2B_URL}/odds?fixtures=${fixtureIds.join(",")}`, {
          headers: { Authorization: `Bearer ${this.config.BETKING_B2B_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeOdds(data.odds || data);
        }
      } catch {}
    }

    if (this.config.BETKING_API_KEY) {
      try {
        const res = await fetch(`${this.config.BETKING_API_URL}/odds?fixtures=${fixtureIds.join(",")}`, {
          headers: { Authorization: `Bearer ${this.config.BETKING_API_KEY}` }
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
    if (this.config.BETKING_API_KEY) {
      try {
        const res = await fetch(`${this.config.BETKING_API_URL}/statistics/${fixtureId}`, {
          headers: { Authorization: `Bearer ${this.config.BETKING_API_KEY}` }
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
    return { eligible: false, mode: "NOT_SUPPORTED", reason: "BetKing: data-only provider. B2B API does not grant retail account execution." };
  }

  async executeOrder(order) {
    return { success: false, mode: "NOT_SUPPORTED", reason: "BetKing B2B API is for data feeds only. No retail execution.", order };
  }
}

export default BetKingAdapter;