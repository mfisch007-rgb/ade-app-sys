import crypto from 'crypto';
export class PartnerRegistry {
  constructor({ store = null } = {}) { this.store = store; this.partners = new Map(); this._hydrate(); }
  _hydrate(){ try{ const rows=this.store?.readSection?.('partners'); if(Array.isArray(rows)) for(const r of rows) if(r?.id) this.partners.set(r.id, r); }catch{} }
  _persist(){ try{ this.store?.writeSection?.('partners', Array.from(this.partners.values())); }catch(e){ console.warn(`[PartnerRegistry] persist failed: ${e.message}`);} }
  upsert(input={}) { const id=input.id || `partner_${crypto.randomBytes(5).toString('hex')}`; const p={id,name:input.name||'Unnamed Partner',status:input.status||'EVALUATION',capabilities:input.capabilities||[],contact:input.contact||{},priority:input.priority||'STANDARD',updatedAt:new Date().toISOString(),createdAt:input.createdAt||new Date().toISOString()}; this.partners.set(id,p); this._persist(); return p; }
  list(){return Array.from(this.partners.values());}
  match(capabilities=[]){ const need=new Set(capabilities.map(x=>String(x).toLowerCase())); return this.list().map(p=>({...p,score:p.capabilities.filter(x=>need.has(String(x).toLowerCase())).length/Math.max(need.size,1)})).sort((a,b)=>b.score-a.score); }
}
