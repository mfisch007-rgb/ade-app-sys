/**
 * ADE BET9JA ADAPTER — Sports data from Bet9ja Nigeria.
 *
 * Supports: fixtures, odds, statistics, virtual sports metadata.
 * Execution: NOT_SUPPORTED (data only).
 */

import { MarketDataAdapter } from "../MarketDataAdapter.js";

export class Bet9jaAdapter extends MarketDataAdapter {
  constructor(config = {}) {
    super({
      providerId: "bet9ja",
      providerName: "Bet9ja",
      providerKind: "SPORTSBOOK",
      config: {
        BET9JA_API_URL: config.BET9JA_API_URL || process.env.BET9JA_API_URL,
        BET9JA_API_KEY: config.BET9JA_API_KEY || process.env.BET9JA_API_KEY,
        BET9JA_FEED_URL: config.BET9JA_FEED_URL || process.env.BET9JA_FEED_URL,
        ...config
      }
    });
    this.capabilities = {
      data: ["FIXTURES", "ODDS", "STATISTICS", "LIVE_SCORES", "VIRTUAL_SPORTS", "MARKETS"],
      execution: [],
      timeframes: [],
      symbols: [],
      authMethods: ["API_KEY", "PUBLIC_FEED"]
    };
    this._fixtureCache = new Map();
    this._virtualCache = new Map();
  }

  async _doConnect() {
    const creds = this.loadCredentials();

    if (creds.BET9JA_API_KEY && creds.BET9JA_API_URL) {
      const ok = await this._testAPI(creds.BET9JA_API_KEY);
      if (ok) {
        this.state.connection = "AUTHENTICATED";
        this.state.authStatus = "API_VERIFIED";
        return { authenticated: true };
      }
    }

    if (creds.BET9JA_FEED_URL) {
      const ok = await this._testFeed(creds.BET9JA_FEED_URL);
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
      const res = await fetch(`${this.config.BET9JA_API_URL}/health`, {
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

      // Regular sports
      await page.goto("https://www.bet9ja.com/sports", { waitUntil: "networkidle2", timeout: 30000 });

      const fixtures = await page.evaluate(() => {
        const events = document.querySelectorAll('[data-event], .match-item, .event-row');
        return Array.from(events).map(el => ({
          fixtureId: el.getAttribute('data-event-id') || `BET9JA-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sport: "FOOTBALL",
          competition: el.querySelector('.league, .competition')?.textContent?.trim(),
          homeTeam: el.querySelector('.home, [data-home]')?.textContent?.trim(),
          awayTeam: el.querySelector('.away, [data-away]')?.textContent?.trim(),
          startTime: el.querySelector('.time, [data-time]')?.textContent?.trim(),
          source: "bet9ja-web"
        })).filter(f => f.homeTeam && f.awayTeam);
      });

      for (const f of fixtures) {
        this._fixtureCache.set(f.fixtureId, f);
      }

      // Virtual sports
      try {
        await page.goto("https://www.bet9ja.com/virtuals", { waitUntil: "networkidle2", timeout: 20000 });
        const virtuals = await page.evaluate(() => {
          const events = document.querySelectorAll('[data-virtual], .virtual-match, .virtual-event');
          return Array.from(events).map(el => ({
            fixtureId: el.getAttribute('data-event-id') || `BET9JA-VIRT-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sport: "VIRTUAL_FOOTBALL",
            competition: "VIRTUAL LEAGUE",
            homeTeam: el.querySelector('.home, .team-home')?.textContent?.trim(),
            awayTeam: el.querySelector('.away, .team-away')?.textContent?.trim(),
            startTime: el.querySelector('.time, [data-time]')?.textContent?.trim(),
            source: "bet9ja-virtual",
            isVirtual: true
          })).filter(f => f.homeTeam && f.awayTeam);
        });

        for (const v of virtuals) {
          this._virtualCache.set(v.fixtureId, v);
        }
      } catch {}

      this.capabilities.symbols = [
        ...new Set([
          ...fixtures.map(f => `${f.homeTeam} v ${f.awayTeam}`),
          ...Array.from(this._virtualCache.values()).map(v => `${v.homeTeam} v ${v.awayTeam}`)
        ])
      ];
    } catch (err) {
      this.state.lastError = `Public data load failed: ${err.message}`;
    }
  }

  async _doDisconnect() {
    await this.closeBrowserContext();
  }

  async _doFetchFixtures(params = {}) {
    if (this.config.BET9JA_API_KEY && this.config.BET9JA_API_URL) {
      try {
        const res = await fetch(`${this.config.BET9JA_API_URL}/fixtures?status=${params.status || "SCHEDULED"}&includeVirtual=${params.includeVirtual || false}`, {
          headers: { Authorization: `Bearer ${this.config.BET9JA_API_KEY}` }
        });
        if (res.ok) {
          const data = await res.json();
          return this._normalizeFixtures(data.fixtures || data);
        }
      } catch {}
    }

    const all = [...this._fixtureCache.values(), ...this._virtualCache.values()];
    return all.slice(0, params.limit || 100);
  }

  async _doFetchOdds(fixtureIds) {
    if (this.config.BET9JA_API_KEY && this.config.BET9JA_API_URL) {
      try {
        const res = await fetch(`${this.config.BET9JA_API_URL}/odds?fixtures=${fixtureIds.join(",")}`, {
          headers: { Authorization: `Bearer ${this.config.BET9JA_API_KEY}` }
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
    if (this.config.BET9JA_API_KEY && this.config.BET9JA_API_URL) {
      try {
        const res = await fetch(`${this.config.BET9JA_API_URL}/statistics/${fixtureId}`, {
          headers: { Authorization: `Bearer ${this.config.BET9JA_API_KEY}` }
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
    return { eligible: false, mode: "NOT_SUPPORTED", reason: "Bet9ja: data-only provider. No automated execution API." };
  }

  async executeOrder(order) {
    return { success: false, mode: "NOT_SUPPORTED", reason: "Bet9ja does not support automated execution via ADE.", order };
  }
}

export default Bet9jaAdapter;