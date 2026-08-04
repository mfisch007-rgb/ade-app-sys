export default class ADERuntime {
    constructor(bus) {
        this.bus = bus;
        this.engines = {};
        this.plugins = new Map();
        this.status = "STOPPED";
    }

    registerEngine(key, engineInstance) {
        this.engines[key] = engineInstance;
    }

    registerPlugin(plugin) {
        plugin.attachRuntime(this);
        this.plugins.set(plugin.name, plugin);
    }

    async boot() {
        for (const [key, engine] of Object.entries(this.engines)) {
            if (engine.initialize) await engine.initialize();
            if (engine.start) await engine.start();
        }
        this.status = "RUNNING";
        if (this.bus) {
            await this.bus.publish("system.runtime.booted", { status: this.status }).catch(err => console.error('[EventBus Async Error]', err));
        }
        return true;
    }

    async shutdown() {
        for (const [key, engine] of Object.entries(this.engines)) {
            if (engine.shutdown) await engine.shutdown();
        }
        this.status = "STOPPED";
        if (this.bus) {
            await this.bus.publish("system.runtime.shutdown", { status: this.status }).catch(err => console.error('[EventBus Async Error]', err));
        }
        return true;
    }
}