import EventEmitter from "node:events";

export default class EnterpriseEventBus extends EventEmitter {
    constructor() {
        super();
        this.modules = new Map();
        this.dlq = [];
        this.metrics = { published: 0, failed: 0, retried: 0 };
    }

    registerModule(name, meta = {}) {
        this.modules.set(name, { status: "ACTIVE", meta, registeredAt: Date.now() });
        return true;
    }

    isRegistered(name) {
        return this.modules.has(name);
    }

    publish(event, payload, retries = 1) {
        this.metrics.published++;
        const listeners = this.listeners(event);
        if (listeners.length === 0) return true;

        let hasError = false;
        for (const listener of listeners) {
            try {
                listener(payload);
            } catch (err) {
                hasError = true;
                if (retries > 0) {
                    this.metrics.retried++;
                } else {
                    this.metrics.failed++;
                }
                this.dlq.push({ event, payload, error: err.message, failedAt: Date.now() });
            }
        }
        return !hasError;
    }

    subscribe(event, listener) {
        this.on(event, listener);
    }
}
