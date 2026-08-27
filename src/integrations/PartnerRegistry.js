import crypto from 'crypto';
export class PartnerRegistry {
  constructor() { this.partners = new Map(); }
  upsert(input={}) { const id=input.id || `partner_${crypto.randomBytes(5).toString('hex')}`; const p={id,name:input.name||'Unnamed Partner',status:input.status||'EVALUATION',capabilities:input.capabilities||[],contact:input.contact||{},priority:input.priority||'STANDARD',updatedAt:new Date().toISOString()}; this.partners.set(id,p); return p; }
  list(){return Array.from(this.partners.values());}
  match(capabilities=[]){ const need=new Set(capabilities.map(x=>String(x).toLowerCase())); return this.list().map(p=>({...p,score:p.capabilities.filter(x=>need.has(String(x).toLowerCase())).length/Math.max(need.size,1)})).sort((a,b)=>b.score-a.score); }
}
