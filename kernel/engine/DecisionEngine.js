export default class DecisionEngine {
    constructor(bus = null, config = {}) {
        this.bus = bus;
        this.config = config;
        this.policies = new Map();
        this.status = "STOPPED";
    }

    register(policyName, evaluatorFn) {
        this.policies.set(policyName, evaluatorFn);
    }

    initialize() { this.status = "INITIALIZED"; return true; }
    start() { this.status = "RUNNING"; return true; }
    pause() { this.status = "PAUSED"; return true; }
    resume() { this.status = "RUNNING"; return true; }
    shutdown() { this.policies.clear(); this.status = "STOPPED"; return true; }

    health() { return { status: this.status, activePolicies: this.policies.size }; }
    metrics() { return { activePolicies: this.policies.size }; }
    events() { return ["decision.evaluated"]; }
    config(newConfig = {}) { this.config = { ...this.config, ...newConfig }; }

    evaluateDecision(policyName, context = {}) {
        if (this.status !== "RUNNING") throw new Error("DECISION_ENGINE_NOT_RUNNING");
        const policy = this.policies.get(policyName);
        if (!policy) return { approved: false, reason: `POLICY_NOT_FOUND: ${policyName}` };
        
        const result = policy(context);
        const decisionPayload = {
            decisionId: "DEC-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            policyName,
            result,
            timestamp: Date.now()
        };
        if (this.bus) this.bus.publish("decision.evaluated", decisionPayload);
        return decisionPayload;
    }
}
