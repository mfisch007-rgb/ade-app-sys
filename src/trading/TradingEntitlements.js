/**
 * ADE TRADING ENTITLEMENTS — Founder-gated selective access (expansion batch).
 *
 * Founder/Admin dashboard grants selective users selective options:
 *   trading only | gaming only | both | none
 * with a few clicks. Enforcement is surrounding (never inside
 * FounderSignalEngine). Durable via RuntimeConfigStore section
 * "tradingEntitlements" so Supabase durability applies automatically.
 *
 * Record shape: { userId, trading: bool, gaming: bool, grantedBy, grantedAt }
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
   */
  grant(userId, { trading = false, gaming = false, grantedBy = "founder" } = {}) {
    const id = String(userId || "").trim().slice(0, 120);
    if (!id) { const e = new Error("USER_ID_REQUIRED"); e.code = "USER_ID_REQUIRED"; throw e; }
    const map = this._all();
    map[id] = { userId: id, trading: Boolean(trading), gaming: Boolean(gaming), grantedBy, grantedAt: new Date().toISOString() };
    this._save(map);
    try { this.eventBus?.publish?.("trading.entitlement.granted", { userId: id, trading: map[id].trading, gaming: map[id].gaming }); } catch {}
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
    return this._all()[String(userId || "")] || { userId: String(userId || ""), trading: false, gaming: false };
  }

  list() {
    return Object.values(this._all());
  }

  can(userId, feature) {
    const rec = this.get(userId);
    if (feature === "trading") return rec.trading === true;
    if (feature === "gaming") return rec.gaming === true;
    return false;
  }
}

export default TradingEntitlements;
