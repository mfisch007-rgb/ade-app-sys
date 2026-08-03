export default class MemoryEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.memoryStore = new Map();
    }

    async remember(key, value) {
        this.memoryStore.set(key, value);
        
        if (this.bus) {
            await this.bus.publish("memory.remembered", { key, timestamp: Date.now() });
        }
    }

    async forget(key) {
        const existed = this.memoryStore.delete(key);
        
        if (existed && this.bus) {
            await this.bus.publish("memory.forgotten", { key, timestamp: Date.now() });
        }
        
        return existed;
    }
}