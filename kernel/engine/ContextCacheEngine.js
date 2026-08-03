export default class ContextCacheEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.cache = new Map();
    }

    async set(key, value, ttlMs = 3600000) {
        const record = { value, expiresAt: Date.now() + ttlMs };
        this.cache.set(key, record);
        
        if (this.bus) {
            await this.bus.publish("cache.created", { key, ttlMs, timestamp: Date.now() });
        }
    }

    async get(key) {
        const record = this.cache.get(key);
        if (!record) return null;

        if (Date.now() > record.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        if (this.bus) {
            await this.bus.publish("cache.hit", { key, timestamp: Date.now() });
        }

        return record.value;
    }
}