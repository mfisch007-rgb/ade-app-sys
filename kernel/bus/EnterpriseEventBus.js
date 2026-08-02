import { EventEmitter } from "events";

export class EnterpriseEventBus extends EventEmitter {
    constructor() {
        super();
        this.routes = new Map();
    }
    registerModule(name, instance) {
        this.routes.set(name, instance);
        console.log("[KERNEL BUS] Registered module:", name);
    }
    isRegistered(name) {
        return this.routes.has(name);
    }
    async publish(event, data) {
        console.log("[EVENT BUS] Broadcasting:", event);
        const listeners = this.listeners(event);
        for (const listener of listeners) {
            try {
                await listener(data);
            } catch (err) {
                console.error(`[KERNEL BUS WARN] Listener isolated fault on event "${event}":`, err.message);
            }
        }
    }
    subscribe(event, handler) {
        this.on(event, handler);
    }
    emitEvent(event, data) {
        this.publish(event, data);
    }
}

export default EnterpriseEventBus;