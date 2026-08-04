export default class GodModeEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.overrideActive = false;
    }

    async enableOverride(reason = "SYSTEM_ADMIN_OVERRIDE") {
        this.overrideActive = true;
        const payload = { active: true, reason, timestamp: Date.now() };

        if (this.bus) {
            await this.bus.publish("GODMODE_EVENT", payload).catch(err => console.error('[EventBus Async Error]', err));
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