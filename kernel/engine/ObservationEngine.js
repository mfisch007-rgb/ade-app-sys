export default class ObservationEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.observations = [];
    }

    async observe(source, metric, value) {
        const obs = { obsId: `obs_${Date.now()}`, source, metric, value, timestamp: Date.now() };
        this.observations.push(obs);

        if (this.bus) {
            await this.bus.publish("observation.recorded", obs).catch(err => console.error('[EventBus Async Error]', err));
        }

        return obs;
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