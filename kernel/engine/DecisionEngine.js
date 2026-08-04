export default class DecisionEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.decisionLog = [];
    }

    async evaluateOptions(contextId, options = []) {
        const bestOption = options.sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
        
        const payload = {
            decisionId: `dec_${Date.now()}`,
            contextId,
            selectedOption: bestOption,
            timestamp: Date.now()
        };

        this.decisionLog.push(payload);

        if (this.bus) {
            await this.bus.publish("decision.evaluated", payload).catch(err => console.error('[EventBus Async Error]', err));
        }

        return payload;
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