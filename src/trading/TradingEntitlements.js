/**
 * ADE TRADING ENTITLEMENTS — Founder-gated selective access (expansion batch).
 *
 * Founder/Admin dashboard grants selective users selective options:
 *   trading only | gaming only | both | none
 * with a few clicks. Enforcement is surrounding (never inside
 * FounderSignalEngine). Durable via RuntimeConfigStore section
 * "tradingEntitlements" so Supabase durability applies automatically.
 *
 * Granular capabilities (additive, preserves legacy trading/gaming bools):
 *   binaryRegular, binaryOtc, forex, gaming
 * Record shape: { userId, trading: bool, gaming: bool,
 *   capabilities: {BINARY_REGULAR, BINARY_OTC, FOREX, GAMING},
 *   modes: {DEMO,PAPER,SANDBOX,LIVE} per capability (entitlement), grantedBy, grantedAt }
 */

export class TradingEntitlements {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
  }

  _all() {
    try {
      const sec = this.store?.readSection?.("tradingEntitlements") ?? this.store?.read?.()?.tradingEntitlements ?? {};
      if (Array.isArray(sec)) {
        const m = {};
        for (const r of sec) if (r?.userId) m[r.userId] = r;
        return m;
      }
      return sec && typeof sec === "object" ? sec : {};
    } catch { return {}; }
  }

  _save(map) {
    try {
      if (typeof this.store?.writeSection === "function") this.store.writeSection("tradingEntitlements", map);
      else if (typeof this.store?.write === "function") {
        for (const [k, v] of Object.entries(map)) this.store.write("tradingEntitlements", k, v);
      }
    } catch {}
  }

  /**
   * Grant/replace entitlement. Caller (route) must enforce L2 Founder/Admin.
   * Supports legacy {trading,gaming} and granular {capabilities: {BINARY_REGULAR, BINARY_OTC, FOREX, GAMING}}.
   */
  grant(userId, { trading = false, gaming = false, capabilities = null, modes = null, grantedBy = "founder" } = {}) {
    const id = String(userId || "").trim().slice(0, 120);
    if (!id) { const e = new Error("USER_ID_REQUIRED"); e.code = "USER_ID_REQUIRED"; throw e; }
    const map = this._all();
    const caps = capabilities && typeof capabilities === "object"
      ? {
          BINARY_REGULAR: Boolean(capabilities.BINARY_REGULAR ?? capabilities.binaryRegular ?? trading),
          BINARY_OTC: Boolean(capabilities.BINARY_OTC ?? capabilities.binaryOtc ?? trading),
          FOREX: Boolean(capabilities.FOREX ?? capabilities.forex ?? trading),
          GAMING: Boolean(capabilities.GAMING ?? capabilities.gaming ?? gaming),
        }
      : { BINARY_REGULAR: Boolean(trading), BINARY_OTC: Boolean(trading), FOREX: Boolean(trading), GAMING: Boolean(gaming) };
    const normModes = modes && typeof modes === "object" ? modes : null;
    map[id] = { userId: id, trading: Boolean(trading) || caps.BINARY_REGULAR || caps.FOREX, gaming: Boolean(gaming) || caps.GAMING, capabilities: caps, modes: normModes, grantedBy, grantedAt: new Date().toISOString() };
    this._save(map);
    try { this.eventBus?.publish?.("trading.entitlement.granted", { userId: id, trading: map[id].trading, gaming: map[id].gaming, capabilities: caps }); } catch {}
    return map[id];
  }

  revoke(userId, { revokedBy = "founder" } = {}) {
    const id = String(userId || "").trim();
    const map = this._all();
    if (!map[id]) return null;
    delete map[id];
    this._save(map);
    try { this.eventBus?.publish?.("trading.entitlement.revoked", { userId: id, revokedBy }); } catch {}
    return { userId: id, revoked: true };
  }

  get(userId) {
    const rec = this._all()[String(userId || "")];
    if (rec) {
      // backfill capabilities for legacy records
      if (!rec.capabilities) rec.capabilities = { BINARY_REGULAR: Boolean(rec.trading), BINARY_OTC: Boolean(rec.trading), FOREX: Boolean(rec.trading), GAMING: Boolean(rec.gaming) };
      return rec;
    }
    return { userId: String(userId || ""), trading: false, gaming: false, capabilities: { BINARY_REGULAR: false, BINARY_OTC: false, FOREX: false, GAMING: false }, modes: null };
  }

  list() {
    return Object.values(this._all()).map(r=> this.get(r.userId));
  }

  can(userId, feature) {
    const rec = this.get(userId);
    const f = String(feature||"").toUpperCase();
    if (f === "TRADING") return rec.trading === true;
    if (f === "GAMING") return rec.gaming === true;
    if (f === "BINARY_REGULAR" || f === "BINARY-REGULAR") return Boolean(rec.capabilities?.BINARY_REGULAR);
    if (f === "BINARY_OTC" || f === "BINARY-OTC") return Boolean(rec.capabilities?.BINARY_OTC);
    if (f === "FOREX") return Boolean(rec.capabilities?.FOREX);
    // legacy trading maps to forex+binary; preserve
    return false;
  }
}

export default TradingEntitlements;
