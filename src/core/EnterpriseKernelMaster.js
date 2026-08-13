import KernelEventBus from "./EventBus.js";
import CapabilityRegistry from "./CapabilityRegistry.js";

export class EnterpriseKernelMaster {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.capabilityRegistry = CapabilityRegistry.getInstance();
    this.isBooted = false;
  }

  static getInstance() {
    if (!global.__enterpriseKernelMasterInstance) {
      global.__enterpriseKernelMasterInstance = new EnterpriseKernelMaster();
    }
    return global.__enterpriseKernelMasterInstance;
  }

  boot() {
    if (this.isBooted) return { status: "ALREADY_RUNNING" };
    this.isBooted = true;
    const timestamp = new Date().toISOString();

    const bootPayload = {
      event: "KERNEL_BOOT_COMPLETE",
      status: "ONLINE",
      timestamp
    };

    this.eventBus.publish("KERNEL_STATUS_CHANGE", bootPayload);
    return bootPayload;
  }

  shutdown() {
    if (!this.isBooted) return { status: "ALREADY_OFFLINE" };
    this.isBooted = false;
    const timestamp = new Date().toISOString();

    const shutdownPayload = {
      event: "KERNEL_SHUTDOWN_COMPLETE",
      status: "OFFLINE",
      timestamp
    };

    this.eventBus.publish("KERNEL_STATUS_CHANGE", shutdownPayload);
    return shutdownPayload;
  }
}

export default EnterpriseKernelMaster;
