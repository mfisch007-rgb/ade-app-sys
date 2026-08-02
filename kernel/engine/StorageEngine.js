export default class StorageEngine {
    constructor(bus = null, adapter = null, config = {}) {
        this.bus = bus;
        this.adapter = adapter || new Map();
        this.config = config;
        this.status = "STOPPED";
        this.writeCount = 0;
    }

    register() { return true; }
    initialize() { this.status = "INITIALIZED"; return true; }
    start() { this.status = "RUNNING"; return true; }
    pause() { this.status = "PAUSED"; return true; }
    resume() { this.status = "RUNNING"; return true; }
    shutdown() { this.status = "STOPPED"; return true; }

    health() { return { status: this.status, writeCount: this.writeCount }; }
    metrics() { return { writeCount: this.writeCount }; }
    events() { return ["storage.written", "storage.deleted"]; }
    config(newConfig = {}) { this.config = { ...this.config, ...newConfig }; }

    async get(key) {
        if (this.status !== "RUNNING") throw new Error("STORAGE_ENGINE_NOT_RUNNING");
        if (typeof this.adapter.get === "function") return await this.adapter.get(key);
        return this.adapter[key] || null;
    }

    async set(key, value) {
        if (this.status !== "RUNNING") throw new Error("STORAGE_ENGINE_NOT_RUNNING");
        this.writeCount++;
        if (typeof this.adapter.set === "function") await this.adapter.set(key, value);
        else this.adapter[key] = value;
        if (this.bus) this.bus.publish("storage.written", { key });
        return true;
    }
}
