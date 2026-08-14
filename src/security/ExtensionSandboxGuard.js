import CapabilityRegistry from "../core/CapabilityRegistry.js";
import KernelEventBus from "../core/EventBus.js";

export class ExtensionSandboxGuard {
  constructor() {
    this.capabilityRegistry = CapabilityRegistry.getInstance();
    this.eventBus = KernelEventBus.getInstance();
  }

  static getInstance() {
    if (!global.__extensionSandboxGuardInstance) {
      global.__extensionSandboxGuardInstance = new ExtensionSandboxGuard();
    }
    return global.__extensionSandboxGuardInstance;
  }

  executeInSandbox(extensionId, intent, payload, handler) {
    // Capability & RBAC Check
    const allowed = this.capabilityRegistry.verifyCapability(extensionId, intent);
    
    if (!allowed) {
      this.eventBus.publish("SANDBOX_VIOLATION", { extensionId, intent });
      throw new Error(`[SANDBOX VIOLATION]: Extension ${extensionId} unauthorized for intent: ${intent}`);
    }

    this.eventBus.publish("SANDBOX_EXECUTION_STARTED", { extensionId, intent });
    
    // Isolated Execution
    try {
      const result = handler(payload);
      this.eventBus.publish("SANDBOX_EXECUTION_SUCCESS", { extensionId, intent });
      return result;
    } catch (err) {
      this.eventBus.publish("SANDBOX_EXECUTION_FAILED", { extensionId, intent, error: err.message });
      throw err;
    }
  }
}

export default ExtensionSandboxGuard;
