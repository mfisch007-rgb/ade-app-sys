export class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map();
    this.initializeDefaults();
  }

  initializeDefaults() {
    const defaults = [
      { id: 'cap-oracle', name: 'Oracle Intelligence Engine', category: 'Supervisory', description: 'Real-time telemetry and decision confidence synthesis' },
      { id: 'cap-guardian', name: 'Guardian Risk Governor', category: 'Security', description: 'RBAC policy enforcement and threat auditing' },
      { id: 'cap-telemetry', name: 'System Telemetry Core', category: 'Kernel', description: 'Uptime and subsystem metrics' },
      { id: 'cap-sse', name: 'SSE Event Stream', category: 'Networking', description: 'Real-time server-sent events stream' }
    ];
    defaults.forEach(c => this.register(c));
  }

  register(capability) {
    if (!capability || !capability.id) {
      throw new Error('Capability must have a valid id');
    }
    this.capabilities.set(capability.id, capability);
    return capability;
  }

  getAll() {
    return Array.from(this.capabilities.values());
  }

  getById(id) {
    return this.capabilities.get(id);
  }

  search(query) {
    if (!query) return this.getAll();
    const q = query.toLowerCase();
    return this.getAll().filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.category.toLowerCase().includes(q) || 
      (c.description && c.description.toLowerCase().includes(q))
    );
  }
}
