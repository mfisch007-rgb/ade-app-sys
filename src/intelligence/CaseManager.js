import crypto from 'crypto';

export class CaseManager {
  constructor({ eventBus, store } = {}) {
    this.eventBus = eventBus;
    this.store = store;
    this.cases = new Map();
    try { for (const c of (store?.read?.().cases || [])) this.cases.set(c.id, c); } catch (_) {}
  }

  createCase(input) {
    const id = `CASE-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const record = {
      id,
      status: 'DISCOVERY_REQUIRED',
      source: input.source || 'UNKNOWN',
      channel: input.channel || 'UNKNOWN',
      organization: input.organization || null,
      contact: input.contact || null,
      request: input.request || {},
      confidence: input.confidence ?? 0,
      authorization: input.authorization || { publicAnalysis: false, connectedSystems: false },
      nextAction: input.nextAction || 'DISCOVERY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.cases.set(id, record);
    if (this.store) this.store.write('cases', Array.from(this.cases.values()));
    this.publish('case.created', record);
    return record;
  }

  list() { return Array.from(this.cases.values()).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  get(id) { return this.cases.get(id) || null; }

  update(id, patch) {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.cases.set(id, next);
    if (this.store) this.store.write('cases', this.list());
    this.publish('case.updated', next);
    return next;
  }

  publish(type, payload) {
    try { this.eventBus?.publish?.(type, payload); } catch (_) {}
  }
}
