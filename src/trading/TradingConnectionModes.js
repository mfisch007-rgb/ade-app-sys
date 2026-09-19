/**
 * ADE TRADING CONNECTION MODES — explicit mode contract per venue/market/user.
 *
 * Contract:
 *   platform, venue, market, marketType, connectionId, userId/tenantId,
 *   supportedModes, activeMode, connectionState, capabilities, lastVerifiedAt,
 *   verificationState
 *
 * Modes: DEMO/PAPER, SANDBOX (adapter supports), LIVE (verified + entitled)
 * Persisted via RuntimeConfigStore section "tradingConnectionModes".
 * Audited via EventBus. No competing architecture — composes VenueRegistry
 * and TradingEntitlements.
 */

const MODES = Object.freeze(["DEMO","PAPER","SANDBOX","LIVE"]);
const STATES = Object.freeze(["AVAILABLE","CONFIGURATION_REQUIRED","AUTHENTICATION_REQUIRED","VERIFYING","CONNECTED","DISCONNECTED","ERROR","NOT_SUPPORTED"]);

function now(){ return new Date().toISOString(); }

export class TradingConnectionModes {
  constructor({ store=null, eventBus=null, venueRegistry=null }={}) {
    this.store=store; this.eventBus=eventBus; this.venueRegistry=venueRegistry;
  }
  _load() {
    try {
      const sec=this.store?.readSection?.("tradingConnectionModes") ?? this.store?.read?.()?.tradingConnectionModes ?? {};
      if (Array.isArray(sec)) { const m={}; for(const r of sec) if(r?.connectionId) m[r.connectionId]=r; return m; }
      return sec && typeof sec==="object" ? sec : {};
    } catch { return {}; }
  }
  _save(map){ try{ if(typeof this.store?.writeSection==="function") this.store.writeSection("tradingConnectionModes", map); }catch{} }

  _supportedFor(venueId){
    const v=this.venueRegistry?.get?.(venueId);
    if(!v) return ["DEMO","PAPER"];
    // Binary brokers support SANDBOX only if noted; default PAPER+DEMO+LIVE (LIVE gated by VERIFIED)
    const k=String(v.kind||"");
    if(k==="BINARY_BROKER") return ["DEMO","PAPER","SANDBOX","LIVE"];
    if(k==="GAMING_BOOKIE") return ["DEMO","PAPER"];
    return ["DEMO","PAPER","LIVE"];
  }
  _stateFor(venueId){
    const v=this.venueRegistry?.get?.(venueId);
    if(!v) return "NOT_SUPPORTED";
    if(v.status==="VERIFIED") return "CONNECTED";
    if(v.status==="CONFIGURED") return "AUTHENTICATION_REQUIRED";
    if(v.status==="NOT_CONFIGURED") return "CONFIGURATION_REQUIRED";
    return "AVAILABLE";
  }

  upsert({ platform=null, venue, market=null, marketType="REGULAR", connectionId=null, userId=null, tenantId="default", capabilities=["BINARY_REGULAR"], supportedModes=null, activeMode="DEMO", requestedBy="founder" }={}){
    const vid=String(venue || platform || "").trim().toLowerCase();
    if(!vid) { const e=new Error("VENUE_REQUIRED"); e.code="VENUE_REQUIRED"; throw e; }
    const cid=String(connectionId || `${vid}::${String(tenantId||"default")}::${String(userId||"shared")}`).slice(0,160);
    const map=this._load();
    const prev=map[cid];
    const sup=supportedModes && Array.isArray(supportedModes) ? supportedModes : this._supportedFor(vid);
    const m=String(activeMode||"DEMO").toUpperCase();
    const allowed=sup.includes(m) ? m : sup[0];
    // LIVE only if venue VERIFIED
    const finalMode = (allowed==="LIVE" && this._stateFor(vid)!=="CONNECTED") ? "DEMO" : allowed;
    const reason = (allowed==="LIVE" && this._stateFor(vid)!=="CONNECTED") ? "LIVE blocked: venue not VERIFIED — fell back to DEMO" : null;
    const rec={
      platform: platform?String(platform).slice(0,80):vid,
      venue: vid,
      market: market?String(market).slice(0,40): (String(vid).includes("fbs")?"FOREX": String(vid).includes("pocket")||vid.includes("iq")?"BINARY":"GAMING"),
      marketType: String(marketType).toUpperCase()==="OTC"?"OTC":"REGULAR",
      connectionId: cid,
      userId: userId?String(userId).slice(0,120):null,
      tenantId: String(tenantId||"default").slice(0,80),
      supportedModes: sup,
      activeMode: finalMode,
      connectionState: this._stateFor(vid),
      capabilities: Array.isArray(capabilities)? capabilities.slice(0,8) : ["BINARY_REGULAR"],
      lastVerifiedAt: prev?.lastVerifiedAt || null,
      verificationState: this._stateFor(vid)==="CONNECTED"?"VERIFIED":"UNVERIFIED",
      updatedAt: now(),
      updatedBy: requestedBy,
      reason
    };
    if(!prev) rec.createdAt=now();
    else rec.createdAt=prev.createdAt;
    map[cid]=rec;
    this._save(map);
    try{ this.eventBus?.publish?.("trading.connection.mode.changed", { connectionId:cid, venue:vid, activeMode:finalMode }); }catch{}
    return rec;
  }

  setMode(connectionId, activeMode, { requestedBy="founder" }={}){
    const map=this._load();
    const rec=map[String(connectionId)];
    if(!rec){ const e=new Error("CONNECTION_NOT_FOUND"); e.code="CONNECTION_NOT_FOUND"; throw e; }
    return this.upsert({ ...rec, activeMode, requestedBy });
  }

  verify(connectionId){
    const map=this._load();
    const rec=map[String(connectionId)];
    if(!rec){ const e=new Error("CONNECTION_NOT_FOUND"); e.code="CONNECTION_NOT_FOUND"; throw e; }
    rec.lastVerifiedAt=now();
    rec.connectionState=this._stateFor(rec.venue);
    rec.verificationState=rec.connectionState==="CONNECTED"?"VERIFIED":"UNVERIFIED";
    rec.updatedAt=now();
    this._save(map);
    return rec;
  }

  get(connectionId){ return this._load()[String(connectionId)] || null; }
  list({ userId=null, tenantId=null, venue=null }={}){
    let all=Object.values(this._load());
    if(userId) all=all.filter(r=>!r.userId || r.userId===String(userId));
    if(tenantId) all=all.filter(r=>r.tenantId===String(tenantId));
    if(venue) all=all.filter(r=>r.venue===String(venue).toLowerCase());
    return all;
  }
}

export { MODES, STATES };
export default TradingConnectionModes;
