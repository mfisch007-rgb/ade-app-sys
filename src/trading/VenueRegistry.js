/**
 * ADE VENUE REGISTRY — flexible broker/bookie connection boundary (expansion batch).
 *
 * Covers BINARY BROKERS (e.g. Pocket Option, IQ Option, ExpertOption, Quotex)
 * and GAMING BOOKIES (e.g. SportyBet, BangBet, BetPawa, BetKing, BetWay, BetNaija)
 * WITHOUT hard-coding a closed list: new venues register at runtime via
 * registerVenue(). Seeded entries are catalog data only (no connectivity implied).
 *
 * Hardening (surrounding boundary only — FounderSignalEngine is never modified):
 * - Credentials are never stored here (only required field names + env key names).
 * - Live data enters only via operator-supplied official API/feed or manual
 *   upload. No browser-extraction, no fingerprint spoofing, no anti-bot evasion.
 * - Every connection attempt is audited via EventBus; rate-limited by the caller.
 *
 * EXPLICIT NON-GOALS (refused by policy/ToS):
 * - No "SSID Browser Extraction matrix", no undetectable automation, no
 *   anti-detection / anti-fingerprint evasion, no human-typing/mouse mimicry
 *   to defeat bot detection. Automation uses official, rate-limited APIs with
 *   explicit user consent and full audit. Anything requiring ToS evasion stays
 *   BLOCKED with REQUIRED_HUMAN_ACTION.
 */

const VENUE_KINDS = Object.freeze(["BINARY_BROKER", "GAMING_BOOKIE", "FOREX_BROKER"]);

const SEED_VENUES = Object.freeze([
  { id: "fbs", name: "FBS (MT4/MT5)", kind: "FOREX_BROKER", authMethods: ["API_TOKEN", "MT5_CREDENTIALS"], requiredFields: ["FBS_API_TOKEN", "FBS_MT5_LOGIN", "FBS_MT5_SERVER"], note: "Forex via FBS — official MT5 web/REST path. MT5 desktop/mobile is the client surface; ADE connects via official broker protocol only. Credentials via env, LIVE only if VERIFIED." },
  { id: "deriv", name: "Deriv", kind: "FOREX_BROKER", authMethods: ["API_TOKEN"], requiredFields: ["DERIV_API_TOKEN"], note: "Secondary — official Deriv API only. Demo/virtual/real modes map to Deriv account modes. Not an MT5 broker." },
  { id: "pocket-option", name: "Pocket Option", kind: "BINARY_BROKER", authMethods: ["API_TOKEN"], requiredFields: ["POCKET_OPTION_API_TOKEN"], note: "Official API only; no credential harvesting." },
  { id: "iq-option", name: "IQ Option", kind: "BINARY_BROKER", authMethods: ["API_TOKEN"], requiredFields: ["IQ_OPTION_API_TOKEN"], note: "Official API only." },
  { id: "expert-option", name: "ExpertOption", kind: "BINARY_BROKER", authMethods: ["API_TOKEN"], requiredFields: ["EXPERT_OPTION_API_TOKEN"], note: "Official API only." },
  { id: "quotex", name: "Quotex", kind: "BINARY_BROKER", authMethods: ["API_TOKEN"], requiredFields: ["QUOTEX_API_TOKEN"], note: "Official API only." },
  { id: "sportybet", name: "SportyBet", kind: "GAMING_BOOKIE", authMethods: ["OPERATOR_FEED"], requiredFields: ["SPORTYBET_FEED_URL"], note: "Manual/official feed only; no scraping, no automation against ToS." },
  { id: "bangbet", name: "BangBet", kind: "GAMING_BOOKIE", authMethods: ["OPERATOR_FEED"], requiredFields: ["BANGBET_FEED_URL"], note: "Manual/official feed only." },
  { id: "betpawa", name: "betPawa", kind: "GAMING_BOOKIE", authMethods: ["OPERATOR_FEED"], requiredFields: ["BETPAWA_FEED_URL"], note: "Manual/official feed only." },
  { id: "betking", name: "BetKing", kind: "GAMING_BOOKIE", authMethods: ["OPERATOR_FEED"], requiredFields: ["BETKING_FEED_URL"], note: "Manual/official feed only." },
  { id: "betway", name: "Betway", kind: "GAMING_BOOKIE", authMethods: ["OPERATOR_FEED"], requiredFields: ["BETWAY_FEED_URL"], note: "Manual/official feed only." },
  { id: "betnaija", name: "BetNaija", kind: "GAMING_BOOKIE", authMethods: ["OPERATOR_FEED"], requiredFields: ["BETNAIJA_FEED_URL"], note: "Manual/official feed only." }
]);

function slug(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "venue";
}

export class VenueRegistry {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.venues = new Map();
    for (const v of SEED_VENUES) {
      this.venues.set(v.id, { ...v, status: "NOT_CONFIGURED", addedAt: new Date().toISOString(), seeded: true });
    }
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.("venueRegistry") || this.store?.read?.()?.venueRegistry || null;
      const list = Array.isArray(saved) ? saved : saved?.venues || null;
      if (Array.isArray(list)) {
        for (const v of list) {
          if (v?.id && !this.venues.has(v.id)) this.venues.set(v.id, { ...v, seeded: false });
          else if (v?.id && this.venues.has(v.id) && v.status) {
            const cur = this.venues.get(v.id);
            this.venues.set(v.id, { ...cur, status: v.status });
          }
        }
      }
    } catch {}
  }

  _persist() {
    try {
      const list = [...this.venues.values()].map(({ requiredFields, ...rest }) => ({ ...rest, requiredFields }));
      if (typeof this.store?.writeSection === "function") this.store.writeSection("venueRegistry", list);
    } catch {}
  }

  /**
   * Register a new venue at runtime (Founder/operator). No closed enum.
   */
  registerVenue({ name, kind, authMethods = ["API_TOKEN"], requiredFields = [], note = "" } = {}) {
    if (!name || !VENUE_KINDS.includes(kind)) {
      const e = new Error("VENUE_NAME_AND_KIND_REQUIRED");
      e.code = "VENUE_NAME_AND_KIND_REQUIRED";
      throw e;
    }
    const id = slug(name);
    if (this.venues.has(id)) return this.venues.get(id);
    const rec = { id, name: String(name).slice(0, 80), kind, authMethods, requiredFields: requiredFields.slice(0, 8), note: String(note).slice(0, 300), status: "NOT_CONFIGURED", addedAt: new Date().toISOString(), seeded: false };
    this.venues.set(id, rec);
    this._persist();
    try { this.eventBus?.publish?.("venue.registered", { id, kind }); } catch {}
    return rec;
  }

  list(kind = null) {
    const all = [...this.venues.values()].map((v) => ({ ...v }));
    return kind ? all.filter((v) => v.kind === kind) : all;
  }

  get(id) {
    return this.venues.get(slug(id)) || null;
  }

  /**
   * Record operator-supplied connection metadata (never a secret value).
   * configured=true means the operator asserts fields are present; VERIFIED
   * only after an explicit verify step against the official API.
   */
  setConfigured(id, { configured, verified = false, configuredBy = "founder" } = {}) {
    const v = this.get(id);
    if (!v) { const e = new Error("VENUE_NOT_FOUND"); e.code = "VENUE_NOT_FOUND"; throw e; }
    v.status = verified ? "VERIFIED" : configured ? "CONFIGURED" : "NOT_CONFIGURED";
    v.lastConfiguredBy = configuredBy;
    v.lastConfiguredAt = new Date().toISOString();
    this._persist();
    try { this.eventBus?.publish?.("venue.configured", { id: v.id, status: v.status }); } catch {}
    return { ...v };
  }

  /**
   * Honest pre-execution check: live execution is allowed only for VERIFIED
   * venues with explicit entitlement; otherwise PAPER_ONLY with the blocker.
   */
  liveEligibility(id) {
    const v = this.get(id);
    if (!v) return { eligible: false, mode: "PAPER_ONLY", reason: "VENUE_NOT_FOUND" };
    if (v.status !== "VERIFIED") {
      return { eligible: false, mode: "PAPER_ONLY", reason: `VENUE_${v.status}: live execution blocked until the official API handshake is verified.`, requiredAction: `Supply ${v.requiredFields.join(", ") || "the venue credential"} via the official channel, then verify.` };
    }
    return { eligible: true, mode: "LIVE_IF_ENTITLED", venue: v.id };
  }
}

export { VENUE_KINDS, SEED_VENUES };
export default VenueRegistry;
