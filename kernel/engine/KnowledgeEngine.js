export default class KnowledgeEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.graph = new Map();
    }

    async linkEntities(sourceId, targetId, relationType) {
        const link = { sourceId, targetId, relationType, timestamp: Date.now() };
        
        if (!this.graph.has(sourceId)) {
            this.graph.set(sourceId, []);
        }
        this.graph.get(sourceId).push(link);

        if (this.bus) {
            await this.bus.publish("knowledge.entity.linked", { entityId: sourceId, targetId, relationType }).catch(err => console.error('[EventBus Async Error]', err));
        }

        return link;
    }

  async boot() {
    this.status = 'booting';
    if (typeof this.init === 'function') await this.init();
    this.status = 'booted';
  }

  async ready() {
    this.status = 'ready';
  }

  async shutdown() {
    this.status = 'shutting_down';
  }

  async dispose() {
    this.status = 'disposed';
  }
}