export class ChannelRegistry {
  constructor() { this.channels = new Map(); }
  register(id, config = {}) { this.channels.set(id.toUpperCase(), { id:id.toUpperCase(), enabled: config.enabled !== false, inbound: config.inbound !== false, outbound: Boolean(config.outbound), configured: Boolean(config.configured), label: config.label || id }); return this.channels.get(id.toUpperCase()); }
  list() { return Array.from(this.channels.values()); }
  set(id, patch) { const key=id.toUpperCase(); const current=this.channels.get(key) || this.register(key); const next={...current,...patch,id:key}; this.channels.set(key,next); return next; }
}
