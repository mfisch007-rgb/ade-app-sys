export default class ObservationEngine {
    constructor(bus = null, config = {}) {
        this.bus = bus;
        this.config = config;
        this.plugins = new Map();
        this.status = "STOPPED";
        this.observedCount = 0;
    }

    register(pluginName, pluginInstance) {
        this.plugins.set(pluginName, pluginInstance);
    }

    initialize() { this.status = "INITIALIZED"; return true; }
    start() { this.status = "RUNNING"; return true; }
    pause() { this.status = "PAUSED"; return true; }
    resume() { this.status = "RUNNING"; return true; }
    shutdown() { this.status = "STOPPED"; return true; }

    health() { return { status: this.status, registeredPlugins: this.plugins.size, totalObserved: this.observedCount }; }
    metrics() { return { totalObserved: this.observedCount }; }
    events() { return ["observation.recorded"]; }
    config(newConfig = {}) { this.config = { ...this.config, ...newConfig }; }

    observe(source, payload, metadata = {}) {
        if (this.status !== "RUNNING") throw new Error("OBSERVATION_ENGINE_NOT_RUNNING");
        this.observedCount++;
        const observation = {
            id: "OBS-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            source,
            payload,
            metadata,
            timestamp: Date.now()
        };
        if (this.bus) this.bus.publish("observation.recorded", observation);
        return observation;
    }
}
