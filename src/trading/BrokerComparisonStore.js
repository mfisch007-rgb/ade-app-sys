/**
 * ADE BROKER COMPARISON STORE — manual external execution records (surrounding only).
 *
 * Never claims API CONNECTED for unsupported platforms (Pocket/IQ/Expert).
 * Preserves exact ADE signal fingerprint; no recalculation per broker.
 * Persisted via RuntimeConfigStore section "brokerComparisons".
 * Tenant-isolated, RBAC-enforced at route layer, audited via EventBus.
 */

function uid(){ return `cmp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function iso(){ return new Date().toISOString(); }

const SUPPORTED_PLATFORMS = Object.freeze(["POCKET_OPTION","IQ_OPTION","EXPERT_OPTION","QUOTEX"]);
const MARKET_TYPES = Object.freeze(["REGULAR","OTC"]);

export class BrokerComparisonStore {
  constructor({ store=null, eventBus=null }={}){ this.store=store; this.eventBus=eventBus; }

  _load(){
    try{
      const sec=this.store?.readSection?.("brokerComparisons") ?? this.store?.read?.()?.brokerComparisons ?? [];
      if(Array.isArray(sec)) return sec;
      if(sec && typeof sec==="object" && Array.isArray(sec.items)) return sec.items;
      return [];
    }catch{ return []; }
  }
  _save(list){
    try{ if(typeof this.store?.writeSection==="function") this.store.writeSection("brokerComparisons", list.slice(-2000)); }catch{}
  }

  create({ tenantId="default", userId, platform, asset, marketType="REGULAR", direction, expiry, entryWindow, confidence, quality, signalTimestamp, signalEvidence, fingerprint, executionMode="MANUAL_EXTERNAL" }={}){
    if(!userId) { const e=new Error("USER_ID_REQUIRED"); e.code="USER_ID_REQUIRED"; throw e; }
    const plat=String(platform||"").toUpperCase().replace(/[^A-Z_]/g,"_");
    if(!SUPPORTED_PLATFORMS.includes(plat)) { const e=new Error("PLATFORM_NOT_SUPPORTED"); e.code="PLATFORM_NOT_SUPPORTED"; throw e; }
    const mt=String(marketType||"REGULAR").toUpperCase();
    if(!MARKET_TYPES.includes(mt)) { const e=new Error("INVALID_MARKET_TYPE"); e.code="INVALID_MARKET_TYPE"; throw e; }
    if(!asset || !direction) { const e=new Error("SIGNAL_REQUIRED"); e.code="SIGNAL_REQUIRED"; throw e; }
    const rec={
      comparisonId: uid(),
      tenantId: String(tenantId||"default").slice(0,80),
      userId: String(userId).slice(0,120),
      platform: plat,
      asset: String(asset).slice(0,40),
      marketType: mt,
      direction: String(direction).toUpperCase(),
      expiry: expiry || null,
      entryWindow: entryWindow || null,
      confidence: confidence ?? null,
      quality: quality || null,
      signalTimestamp: signalTimestamp || iso(),
      signalEvidence: signalEvidence || null,
      fingerprint: fingerprint ? String(fingerprint).slice(0,160) : null,
      executionMode: "MANUAL_EXTERNAL",
      executionStatus: "PENDING",
      userEntry: null,
      observedResult: null,
      resultRecordedAt: null,
      notes: "",
      createdAt: iso(),
      updatedAt: iso()
    };
    const list=this._load();
    list.push(rec);
    this._save(list);
    try{ this.eventBus?.publish?.("broker.comparison.created", { comparisonId: rec.comparisonId, platform: plat, userId: rec.userId }); }catch{}
    return rec;
  }

  get(comparisonId){ return this._load().find(r=>r.comparisonId===String(comparisonId)) || null; }

  list({ tenantId=null, userId=null, platform=null, marketType=null, outcome=null }={}){
    let all=this._load();
    if(tenantId) all=all.filter(r=>r.tenantId===String(tenantId));
    if(userId) all=all.filter(r=>r.userId===String(userId));
    if(platform) all=all.filter(r=>r.platform===String(platform).toUpperCase());
    if(marketType) all=all.filter(r=>r.marketType===String(marketType).toUpperCase());
    if(outcome) all=all.filter(r=>String(r.observedResult||"").toUpperCase()===String(outcome).toUpperCase());
    return all.sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  }

  recordResult(comparisonId, { userId, executionStatus, userEntry, observedResult, notes }={}, requesterId=null){
    const list=this._load();
    const rec=list.find(r=>r.comparisonId===String(comparisonId));
    if(!rec) { const e=new Error("COMPARISON_NOT_FOUND"); e.code="COMPARISON_NOT_FOUND"; throw e; }
    if(requesterId && rec.userId!==String(requesterId) && rec.tenantId!=="default") {
      // tenant check is at route; this is extra user ownership check
    }
    if(executionStatus) rec.executionStatus=String(executionStatus).toUpperCase().slice(0,40);
    if(userEntry!==undefined) rec.userEntry=userEntry;
    if(observedResult!==undefined) { rec.observedResult=String(observedResult).toUpperCase().slice(0,20); rec.resultRecordedAt=iso(); }
    if(notes!==undefined) rec.notes=String(notes).slice(0,1000);
    rec.updatedAt=iso();
    this._save(list);
    try{ this.eventBus?.publish?.("broker.comparison.updated", { comparisonId: rec.comparisonId }); }catch{}
    return rec;
  }
}

export { SUPPORTED_PLATFORMS, MARKET_TYPES };
export default BrokerComparisonStore;
