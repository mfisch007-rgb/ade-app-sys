import KernelEventBus from "./EventBus.js";
import CapabilityRegistry from "./CapabilityRegistry.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";

export class EnterpriseKernelMaster {
  constructor() {
    this.eventBus = KernelEventBus.getInstance();
    this.capabilityRegistry = CapabilityRegistry.getInstance();
    this.guard = CommunityEditionGuard.getInstance();
    this.isBooted = false;
    this.activeSubsystems = new Set();
    this.systemState = {
      status: "STOPPED",
      bootTime: null,
      activeConnections: 0,
      telemetryChannels: new Set(["SYS_HEALTH", "AUDIT_LOGS", "AI_GATEWAY"])
    };
  }

  static getInstance() {
    if (!global.__enterpriseKernelMasterInstance) {
      global.__enterpriseKernelMasterInstance = new EnterpriseKernelMaster();
    }
    return global.__enterpriseKernelMasterInstance;
  }

  boot() {
    if (this.isBooted) return { status: "ALREADY_RUNNING", state: this.getSystemState() };
    
    this.isBooted = true;
    this.systemState.status = "ONLINE";
    this.systemState.bootTime = new Date().toISOString();

    const bootPayload = {
      event: "KERNEL_BOOT_COMPLETE",
      status: "ONLINE",
      timestamp: this.systemState.bootTime,
      subsystemsLoaded: Array.from(this.activeSubsystems)
    };

    this.eventBus.publish("KERNEL_STATUS_CHANGE", bootPayload);
    this.guard.logAuditEvent({ type: "KERNEL_EVENT", action: "BOOT", status: "SUCCESS" });
    return bootPayload;
  }

  registerSubsystemToKernel(moduleName, capabilitiesManifest) {
    this.capabilityRegistry.registerSubsystem(moduleName, capabilitiesManifest);
    this.activeSubsystems.add(moduleName);
    
    this.eventBus.publish("KERNEL_SUBSYSTEM_ATTACHED", {
      moduleName,
      activeSubsystemsCount: this.activeSubsystems.size
    });
  }

  getSystemState() {
    return {
      isBooted: this.isBooted,
      status: this.systemState.status,
      bootTime: this.systemState.bootTime,
      activeSubsystems: Array.from(this.activeSubsystems),
      registeredCapabilitiesCount: this.capabilityRegistry.listCapabilities().length
    };
  }

  shutdown() {
    if (!this.isBooted) return { status: "ALREADY_OFFLINE" };
    
    this.isBooted = false;
    this.systemState.status = "OFFLINE";
    const timestamp = new Date().toISOString();

    const shutdownPayload = {
      event: "KERNEL_SHUTDOWN_COMPLETE",
      status: "OFFLINE",
      timestamp
    };

    this.eventBus.publish("KERNEL_STATUS_CHANGE", shutdownPayload);
    this.guard.logAuditEvent({ type: "KERNEL_EVENT", action: "SHUTDOWN", status: "SUCCESS" });
    return shutdownPayload;
  }
}

export default EnterpriseKernelMaster;
