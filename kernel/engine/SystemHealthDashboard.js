export default class SystemHealthDashboard {
    constructor(runtime) {
        this.runtime = runtime;
    }

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            runtimeStatus: this.runtime.status,
            engineHealth: {},
            aggregatedMetrics: {}
        };

        for (const [key, engine] of Object.entries(this.runtime.engines)) {
            if (engine.health) report.engineHealth[key] = engine.health();
            if (engine.metrics) report.aggregatedMetrics[key] = engine.metrics();
        }

        return report;
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
