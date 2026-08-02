export default class MemoryEngine {
    constructor(bus = null, storageEngine = null, config = {}) {
        this.bus = bus;
        this.storageEngine = storageEngine;
        this.config = config;
        this.store = new Map();
        this.status = "STOPPED";
    }

    register() { return true; }
    initialize() { this.status = "INITIALIZED"; return true; }
    start() { this.status = "RUNNING"; return true; }
    pause() { this.status = "PAUSED"; return true; }
    resume() { this.status = "RUNNING"; return true; }
    shutdown() { this.store.clear(); this.status = "STOPPED"; return true; }

    health() { return { status: this.status, totalRecords: this.store.size }; }
    metrics() { return { totalRecords: this.store.size }; }
    events() { return ["memory.remembered", "memory.forgotten"]; }
    config(newConfig = {}) { this.config = { ...this.config, ...newConfig }; }

    async remember(key, value, ttlMs = null) {
        const record = {
            value,
            expiresAt: ttlMs ? Date.now() + ttlMs : null,
            createdAt: Date.now()
        };
        this.store.set(key, record);
        if (this.storageEngine) {
            await this.storageEngine.set(key, record);
        }
        if (this.bus) this.bus.publish("memory.remembered", { key, record });
        return true;
    }

    recall(key) {
        const record = this.store.get(key);
        if (!record) return null;
        if (record.expiresAt && record.expiresAt < Date.now()) {
            this.store.delete(key);
            return null;
        }
        return record.value;
    }

    forget(key) {
        const deleted = this.store.delete(key);
        if (deleted && this.bus) this.bus.publish("memory.forgotten", { key });
        return deleted;
    }
}
