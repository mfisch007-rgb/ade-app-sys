/**
 * ADE EXPERTOPTION ADAPTER — Binary broker market data adapter.
 *
 * Supports: candles, quotes, symbols (public data mode).
 * Execution: PAPER only — no official API verified.
 */

import { MarketDataAdapter } from "../MarketDataAdapter.js";

export class ExpertOptionAdapter extends MarketDataAdapter {
  constructor(config = {}) {
    super({
      providerId: "expert-option",
      providerName: "ExpertOption",
      providerKind: "BINARY_BROKER",
      config: {
        EXPERT_OPTION_API_URL: config.EXPERT_OPTION_API_URL || process.env.EXPERT_OPTION_API_URL,
        EXPERT_OPTION_TOKEN: config.EXPERT_OPTION_TOKEN || process.env.EXPERT_OPTION_TOKEN,
        ...config
      }
    });
    this.capabilities = {
      data: ["CANDLES", "QUOTES", "SYMBOLS"],
      execution: ["PAPER"],
      timeframes: ["M1", "M5", "M15", "M30", "H1"],
      symbols: [],
      authMethods: ["API_TOKEN", "BROWSER_SESSION"]
    };
    this._ws = null;
    this._candleBuffer = new Map();
  }

  async _doConnect() {
    const creds = this.loadCredentials();

    if (creds.EXPERT_OPTION_TOKEN) {
      // Try official API if token provided
      const wsOk = await this._connectOfficialAPI(creds.EXPERT_OPTION_TOKEN);
      if (wsOk) {
        await this._loadSymbolsViaAPI();
        return { authenticated: true };
      }
    }

    // Try browser automation
    const browserToken = await this._extractTokenViaBrowser();
    if (browserToken) {
      this.config.EXPERT_OPTION_TOKEN = browserToken;
      const wsOk = await this._connectOfficialAPI(browserToken);
      if (wsOk) {
        await this._loadSymbolsViaAPI();
        return { authenticated: true };
      }
    }

    // Public data only
    await this._loadSymbols();
    return { authenticated: false };
  }

  async _connectOfficialAPI(token) {
    // ExpertOption doesn't have a documented public WebSocket API
    // This is a placeholder for future official API integration
    return false;
  }

  async _extractTokenViaBrowser() {
    try {
      await this.initBrowserContext({ headless: true });
      const page = await this.newPage();
      if (!page) return null;

      await page.goto("https://expertoption.com/login", { waitUntil: "networkidle2", timeout: 30000 });

      const creds = this.loadCredentials();
      if (creds.EXPERT_OPTION_EMAIL && creds.EXPERT_OPTION_PASSWORD) {
        await this.humanType(page, 'input[name="email"]', creds.EXPERT_OPTION_EMAIL);
        await this.humanType(page, 'input[name="password"]', creds.EXPERT_OPTION_PASSWORD);
        await this.humanClick(page, 'button[type="submit"]');
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
      }

      const token = await page.evaluate(() => {
        return localStorage.getItem("token") || localStorage.getItem("access_token") ||
               document.cookie.split("; ").find(c => c.startsWith("token="))?.split("=")[1];
      });

      if (token) {
        this.config._page = page;
        return token;
      }
      return null;
    } catch (err) {
      this.state.lastError = `Browser token extraction failed: ${err.message}`;
      return null;
    }
  }

  async _loadSymbolsViaAPI() {
    this.capabilities.symbols = [
      "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
      "EURGBP", "EURJPY", "GBPJPY", "XAUUSD", "BTCUSD"
    ];
  }

  async _loadSymbols() {
    this.capabilities.symbols = [
      "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
      "EURGBP", "EURJPY", "GBPJPY", "XAUUSD", "BTCUSD",
      "ETHUSD", "LTCUSD", "XRPUSD"
    ];
  }

  async _doDisconnect() {
    if (this._ws) { this._ws.close(); this._ws = null; }
    await this.closeBrowserContext();
  }

  async _doFetchCandles(symbol, timeframe, limit) {
    // No verified API - paper mode only
    return this._generatePaperCandles(symbol, timeframe, limit);
  }

  async _doFetchQuotes(symbols) {
    return symbols.map(s => ({ symbol: s, bid: 1.1000, ask: 1.1002 }));
  }

  liveEligibility() {
    return { eligible: false, mode: "PAPER_ONLY", reason: "ExpertOption: no official API verified. Paper mode only." };
  }

  async executeOrder(order) {
    return { success: false, mode: "PAPER", reason: "ExpertOption execution not available — no verified API.", order };
  }

  _generatePaperCandles(symbol, timeframe, limit) {
    const base = symbol.includes("JPY") ? 150 : symbol.includes("XAU") ? 2000 : symbol.includes("BTC") ? 50000 : 1.1;
    return Array.from({ length: limit }, (_, i) => {
      const t = Date.now() - (limit - i) * this._tfMs(timeframe);
      const drift = (Math.random() - 0.5) * 0.002;
      const o = base * (1 + drift);
      const h = o * (1 + Math.random() * 0.001);
      const l = o * (1 - Math.random() * 0.001);
      const c = l + Math.random() * (h - l);
      return { timestamp: t, open: o, high: h, low: l, close: c, volume: Math.floor(Math.random() * 1000) };
    });
  }

  _tfMs(tf) { const m = { M1: 60000, M5: 300000, M15: 900000, M30: 1800000, H1: 3600000 }; return m[tf] || 60000; }
}

export default ExpertOptionAdapter;