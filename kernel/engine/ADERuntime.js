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

    boot() {
        for (const [key, engine] of Object.entries(this.engines)) {
            if (engine.initialize) engine.initialize();
            if (engine.start) engine.start();
        }
        this.status = "RUNNING";
        if (this.bus) this.bus.publish("system.runtime.booted", { status: this.status });
        return true;
    }

    shutdown() {
        for (const [key, engine] of Object.entries(this.engines)) {
            if (engine.shutdown) engine.shutdown();
        }
        this.status = "STOPPED";
        if (this.bus) this.bus.publish("system.runtime.shutdown", { status: this.status });
        return true;
    }
}
