export default class ResilienceGuard {
    constructor(maxFailures = 3, resetTimeoutMs = 10000) {
        this.maxFailures = maxFailures;
        this.resetTimeoutMs = resetTimeoutMs;
        this.failureCount = 0;
        this.state = "CLOSED"; // CLOSED = Normal, OPEN = Tripped, HALF_OPEN = Testing
        this.lastStateChange = Date.now();
    }

    async execute(actionFn, fallbackFn = null) {
        if (this.state === "OPEN") {
            if (Date.now() - this.lastStateChange > this.resetTimeoutMs) {
                this.state = "HALF_OPEN";
            } else {
                if (fallbackFn) return await fallbackFn(new Error("CIRCUIT_OPEN"));
                throw new Error("CIRCUIT_OPEN: Action blocked due to previous failures.");
            }
        }

        try {
            const result = await actionFn();
            if (this.state === "HALF_OPEN") {
                this.state = "CLOSED";
                this.failureCount = 0;
            }
            return result;
        } catch (err) {
            this.failureCount++;
            if (this.failureCount >= this.maxFailures) {
                this.state = "OPEN";
                this.lastStateChange = Date.now();
            }
            if (fallbackFn) return await fallbackFn(err);
            throw err;
        }
    }
}
