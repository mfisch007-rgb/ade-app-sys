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
    this.lastPersistError = null;
  }

  #normalize(sec) {
    if (Array.isArray(sec)) {
      const map = {};
      for (const row of sec) if (row?.userId) map[row.userId] = row;
      return map;
    }
    return sec && typeof sec === "object" ? sec : {};
  }

  _all() {
    try {
      const sec = this.store?.readSection?.("tradingEntitlements") ?? this.store?.read?.()?.tradingEntitlements ?? {};
      return this.#normalize(sec);
    } catch {
      return {};
    }
  }

  // Mutation reads must not fall back to an empty snapshot: writing that
  // would erase grants whenever the backing read fails. Let the error surface.
  _allOrThrow() {
    const sec = this.store?.readSection?.("tradingEntitlements") ?? this.store?.read?.()?.tradingEntitlements ?? {};
    return this.#normalize(sec);
  }

  async _allFresh() {
    if (typeof this.store?.readSectionStrictAsync === "function") {
      return this.#normalize(await this.store.readSectionStrictAsync("tradingEntitlements"));
    }
    if (typeof this.store?.readSectionAsync === "function") {
      return this.#normalize(await this.store.readSectionAsync("tradingEntitlements"));
    }
    return this._all();
  }

  _save(map) {
    try {
      if (typeof this.store?.writeSection === "function") this.store.writeSection("tradingEntitlements", map);
      else if (typeof this.store?.write === "function") {
        for (const [k, v] of Object.entries(map)) this.store.write("tradingEntitlements", k, v);
      }
      this.lastPersistError = null;
    } catch (error) {
      this.lastPersistError = error;
      throw error;
    }
  }

  async _saveAsync(map) {
    try {
      if (typeof this.store?.writeSectionAsync === "function") await this.store.writeSectionAsync("tradingEntitlements", map);
      else this._save(map);
      this.lastPersistError = null;
    } catch (error) {
      this.lastPersistError = error;
      throw error;
    }
  }

  #record(userId, { trading = false, gaming = false, capabilities = null, modes = null, grantedBy = "founder" } = {}) {
    const id = String(userId || "").trim().slice(0, 120);
    if (!id) { const e = new Error("USER_ID_REQUIRED"); e.code = "USER_ID_REQUIRED"; throw e; }
    const caps = capabilities && typeof capabilities === "object"
      ? {
          BINARY_REGULAR: Boolean(capabilities.BINARY_REGULAR ?? capabilities.binaryRegular ?? trading),
          BINARY_OTC: Boolean(capabilities.BINARY_OTC ?? capabilities.binaryOtc ?? trading),
          FOREX: Boolean(capabilities.FOREX ?? capabilities.forex ?? trading),
          GAMING: Boolean(capabilities.GAMING ?? capabilities.gaming ?? gaming),
        }
      : { BINARY_REGULAR: Boolean(trading), BINARY_OTC: Boolean(trading), FOREX: Boolean(trading), GAMING: Boolean(gaming) };
    const normModes = modes && typeof modes === "object" ? modes : null;
    return { id, caps, normModes, record: { userId: id, trading: Boolean(trading) || caps.BINARY_REGULAR || caps.BINARY_OTC || caps.FOREX, gaming: Boolean(gaming) || caps.GAMING, capabilities: caps, modes: normModes, grantedBy, grantedAt: new Date().toISOString() } };
  }

  #keyFor(map, id) {
    return Object.keys(map).find((k) => k.toLowerCase() === id.toLowerCase()) || id;
  }

  #publishGranted(record) {
    try {
      this.eventBus?.publish?.("trading.entitlement.granted", {
        userId: record.userId,
        trading: record.trading,
        gaming: record.gaming,
        capabilities: record.capabilities
      });
    } catch {}
  }

  #publishRevoked(userId, revokedBy) {
    try {
      this.eventBus?.publish?.("trading.entitlement.revoked", { userId, revokedBy });
    } catch {}
  }

  /**
   * Grant/replace entitlement. Caller (route) must enforce L2 Founder/Admin.
   * Supports legacy {trading,gaming} and granular {capabilities: {BINARY_REGULAR, BINARY_OTC, FOREX, GAMING}}.
   */
  grant(userId, options = {}) {
    const { id, record } = this.#record(userId, options);
    const map = this._allOrThrow();
    const key = this.#keyFor(map, id);
    map[key] = { ...record, userId: key };
    this._save(map);
    this.#publishGranted(map[key]);
    return map[key];
  }

  async grantAsync(userId, options = {}) {
    const { id, record } = this.#record(userId, options);
    const map = await this._allFresh();
    const key = this.#keyFor(map, id);
    map[key] = { ...record, userId: key };
    await this._saveAsync(map);
    this.#publishGranted(map[key]);
    return map[key];
  }

  revoke(userId, { revokedBy = "founder" } = {}) {
    const id = String(userId || "").trim();
    const map = this._allOrThrow();
    const key = Object.keys(map).find((k) => k.toLowerCase() === id.toLowerCase()) || id;
    if (!map[key]) return null;
    delete map[key];
    this._save(map);
    this.#publishRevoked(key, revokedBy);
    return { userId: key, revoked: true };
  }

  async revokeAsync(userId, { revokedBy = "founder" } = {}) {
    const id = String(userId || "").trim();
    const map = await this._allFresh();
    const key = Object.keys(map).find((k) => k.toLowerCase() === id.toLowerCase()) || id;
    if (!map[key]) return null;
    delete map[key];
    await this._saveAsync(map);
    this.#publishRevoked(key, revokedBy);
    return { userId: key, revoked: true };
  }

  async refresh() {
    if (typeof this.store?.readSectionStrictAsync === "function") {
      await this.store.readSectionStrictAsync("tradingEntitlements");
    } else if (typeof this.store?.readSectionAsync === "function") {
      await this.store.readSectionAsync("tradingEntitlements");
    }
    return this._all();
  }

  _resolveKey(userId) {
    // Alias-aware: callers may pass a single id OR a candidate array
    // [personId, username, ...] because grants are recorded under the string
    // the Founder typed (usually the username) while sessions present the
    // opaque person id first. First case-insensitive hit wins; miss stays
    // fail-closed (default deny record).
    const candidates = Array.isArray(userId) ? userId : [userId];
    const map = this._all();
    for (const candidate of candidates) {
      const raw = String(candidate || "").trim();
      if (!raw) continue;
      if (map[raw]) return raw;
      const lower = raw.toLowerCase();
      for (const k of Object.keys(map)) {
        if (k.toLowerCase() === lower) return k;
      }
    }
    const first = String(candidates.find((c) => String(c || "").trim()) || "").trim();
    return first;
  }

  get(userId) {
    const key = this._resolveKey(userId);
    const rec = key ? this._all()[key] : null;
    if (rec) {
      // backfill capabilities for legacy records
      if (!rec.capabilities) rec.capabilities = { BINARY_REGULAR: Boolean(rec.trading), BINARY_OTC: Boolean(rec.trading), FOREX: Boolean(rec.trading), GAMING: Boolean(rec.gaming) };
      return rec;
    }
    const label = Array.isArray(userId)
      ? String(userId.find((c) => String(c || "").trim()) || "")
      : String(userId || "");
    return { userId: label, trading: false, gaming: false, capabilities: { BINARY_REGULAR: false, BINARY_OTC: false, FOREX: false, GAMING: false }, modes: null };
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
