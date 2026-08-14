import KernelEventBus from "./EventBus.js";

export class CapabilityRegistry {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.capabilities = new Map();
    this.subsystems = new Map();
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
      sourceModule: "CORE",
      handler: (params) => `Subscribed to asset stream: ${params.asset}`
    });

    this.registerCapability({
      intent: "TELEMETRY_SSE",
      rbacLevel: 1,
      sourceModule: "CORE",
      handler: (params) => `Telemetry stream initialized on channel: ${params.channel}`
    });

    this.registerCapability({
      intent: "UNIVERSAL_AI_GATEWAY",
      rbacLevel: 1,
      sourceModule: "CORE",
      handler: (params) => `AI Gateway dispatch executed: ${params.prompt}`
    });

    this.registerCapability({
      intent: "MULTI_STREAM",
      rbacLevel: 2,
      sourceModule: "CORE",
      handler: (params) => `Multi-stream routing unlocked for ${params.count} streams`
    });

    this.registerCapability({
      intent: "SYSTEM_SHUTDOWN",
      rbacLevel: 4,
      sourceModule: "CORE",
      handler: () => `SYSTEM EXECUTION: Core shutdown initiated.`
    });
  }

  registerCapability(capabilityOrExtension, intent, handlerOrLevel, rbacLevel = 1) {
    let cap;

    // Existing Batch 1.2 object contract
    if (
      capabilityOrExtension &&
      typeof capabilityOrExtension === "object" &&
      !Array.isArray(capabilityOrExtension)
    ) {
      cap = {
        ...capabilityOrExtension,
        rbacLevel: capabilityOrExtension.rbacLevel || 1,
        sourceModule: capabilityOrExtension.sourceModule || "EXTERNAL_SUBSYSTEM"
      };
    }
    // Extension convenience contract: registerCapability(extensionId, intent, handler, rbacLevel)
    else if (
      typeof capabilityOrExtension === "string" &&
      typeof intent === "string" &&
      typeof handlerOrLevel === "function"
    ) {
      cap = {
        extensionId: capabilityOrExtension,
        intent,
        handler: handlerOrLevel,
        rbacLevel,
        sourceModule: capabilityOrExtension
      };
    }
    else {
      throw new Error(
        "Invalid Capability registration: expected object contract or (extensionId, intent, handler, rbacLevel)."
      );
    }

    if (!cap.intent || typeof cap.handler !== "function") {
      throw new Error(
        "Invalid Capability registration: 'intent' and 'handler' are required."
      );
    }

    const capabilityRecord = {
      rbacLevel: cap.rbacLevel || 1,
      sourceModule: cap.sourceModule || "EXTERNAL_SUBSYSTEM",
      extensionId: cap.extensionId || null,
      handler: cap.handler,
      registeredAt: new Date().toISOString()
    };

    this.capabilities.set(cap.intent, capabilityRecord);

    this.eventBus.publish("CAPABILITY_REGISTERED", {
      intent: cap.intent,
      rbacLevel: capabilityRecord.rbacLevel,
      source: capabilityRecord.sourceModule,
      extensionId: capabilityRecord.extensionId
    });

    return capabilityRecord;
  }

  verifyCapability(extensionId, intent) {
    const capability = this.capabilities.get(intent);

    if (!capability) {
      return false;
    }

    if (capability.extensionId && capability.extensionId !== extensionId) {
      return false;
    }

    return true;
  }

  getCapability(intent) {
    return this.capabilities.get(intent);
  }

  listCapabilities() {
    return Array.from(this.capabilities.entries()).map(([intent, cap]) => ({
      intent,
      rbacLevel: cap.rbacLevel,
      sourceModule: cap.sourceModule,
      extensionId: cap.extensionId
    }));
  }

  registerSubsystem(moduleName, capabilitiesManifest) {
    if (!Array.isArray(capabilitiesManifest)) {
      throw new Error(
        `Registration failed: capabilities manifest for subsystem '${moduleName}' must be an array.`
      );
    }

    for (const cap of capabilitiesManifest) {
      this.registerCapability({
        ...cap,
        sourceModule: moduleName
      });
    }

    this.subsystems.set(moduleName, {
      registeredAt: new Date().toISOString(),
      capabilityCount: capabilitiesManifest.length
    });

    this.eventBus.publish("SUBSYSTEM_REGISTERED", {
      moduleName,
      count: capabilitiesManifest.length
    });
  }
}

export default CapabilityRegistry;
