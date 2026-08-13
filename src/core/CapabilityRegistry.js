import KernelEventBus from "./EventBus.js";

export class CapabilityRegistry {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.capabilities = new Map();
    this.initCoreCapabilities();
  }

  static getInstance() {
    if (!global.__capabilityRegistryInstance) {
      global.__capabilityRegistryInstance = new CapabilityRegistry();
    }
    return global.__capabilityRegistryInstance;
  }

  initCoreCapabilities() {
    this.registerCapability({
      intent: "WATCH_ASSET",
      rbacLevel: 1,
      handler: (params) => `Subscribed to asset stream: ${params.asset}`
    });
    this.registerCapability({
      intent: "TELEMETRY_SSE",
      rbacLevel: 1,
      handler: (params) => `Telemetry stream initialized on channel: ${params.channel}`
    });
    this.registerCapability({
      intent: "UNIVERSAL_AI_GATEWAY",
      rbacLevel: 1,
      handler: (params) => `AI Gateway dispatch executed: ${params.prompt}`
    });
    this.registerCapability({
      intent: "MULTI_STREAM",
      rbacLevel: 2,
      handler: (params) => `Multi-stream routing unlocked for ${params.count} streams`
    });
    this.registerCapability({
      intent: "SYSTEM_SHUTDOWN",
      rbacLevel: 4,
      handler: (params) => `SYSTEM EXECUTION: Core shutdown initiated.`
    });
  }

  registerCapability(cap) {
    if (!cap.intent || !cap.handler) {
      throw new Error("Invalid Capability registration: 'intent' and 'handler' are required.");
    }
    this.capabilities.set(cap.intent, {
      rbacLevel: cap.rbacLevel || 1,
      handler: cap.handler,
      registeredAt: new Date().toISOString()
    });
    this.eventBus.publish("CAPABILITY_REGISTERED", { intent: cap.intent, rbacLevel: cap.rbacLevel });
  }

  getCapability(intent) {
    return this.capabilities.get(intent);
  }

  listCapabilities() {
    return Array.from(this.capabilities.entries()).map(([intent, cap]) => ({
      intent,
      rbacLevel: cap.rbacLevel
    }));
  }
}

export default CapabilityRegistry;
