import crypto from 'crypto';

export class ConnectionManager {
  constructor({ secrets } = {}) { this.secrets = secrets; this.connections = new Map(); }
  sanitize(c) { const { secret, apiKey, accessToken, clientSecret, password, ...safe } = c; return { ...safe, secretConfigured: Boolean(secret || apiKey || accessToken || clientSecret || password) }; }
  upsert(input = {}) {
    if (!input.provider) throw new Error('provider is required');
    const id = input.id || `conn_${crypto.randomBytes(6).toString('hex')}`;
    const secret = input.secret || input.apiKey || input.accessToken || input.clientSecret || input.password;
    if (secret && this.secrets?.setSecret) this.secrets.setSecret(`ADE_CONN_${id}`, secret);
    const record = { id, provider: input.provider, type: input.type || 'REST_API', baseUrl: input.baseUrl || '', authType: input.authType || 'API_KEY', scopes: input.scopes || [], status: 'CONFIGURED', secretConfigured: Boolean(secret), updatedAt: new Date().toISOString() };
    this.connections.set(id, record); return this.sanitize(record);
  }
  list() { return Array.from(this.connections.values()).map(c => this.sanitize(c)); }
  get(id) { const c = this.connections.get(id); return c ? this.sanitize(c) : null; }
  async test(id) { const c = this.connections.get(id); if (!c) return { success:false, error:'Connection not found' }; if (!c.baseUrl) return { success:false, id, status:'INCOMPLETE', error:'Base URL is required' }; try { const u = new URL(c.baseUrl); if (!['http:','https:'].includes(u.protocol)) throw new Error('Only HTTP(S) connections are supported'); return { success:true, id, status:'READY', provider:c.provider, checkedAt:new Date().toISOString() }; } catch (e) { return { success:false, id, status:'INVALID', error:e.message }; } }
}
