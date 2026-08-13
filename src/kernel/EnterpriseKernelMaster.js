import TelemetryEventHub from "../telemetry/TelemetryEventHub.js";
import CommunityEditionGuard from "../security/CommunityEditionGuard.js";
import UniversalAIGateway from "../ai/UniversalAIGateway.js";

export class EnterpriseKernelMaster {
  constructor() {
    this.status = "OFFLINE";
    this.hub = TelemetryEventHub.getInstance();
    this.guard = CommunityEditionGuard.getInstance();
    this.activeAssets = new Set();
    
    try {
      this.aiGateway = UniversalAIGateway.getInstance ? UniversalAIGateway.getInstance() : new UniversalAIGateway();
    } catch (e) {
      this.aiGateway = {
        complete: async (prompt, opts) => ({ provider: "kernel-offline-fallback", mode: "OFFLINE_FALLBACK" })
      };
    }
  }

  static getInstance() {
    if (!global.__kernelMaster) {
      global.__kernelMaster = new EnterpriseKernelMaster();
    }
    return global.__kernelMaster;
  }

  async boot() {
    this.status = "BOOTING";
    this.hub.broadcast("KERNEL_STATUS", { status: this.status });
    await new Promise(resolve => setTimeout(resolve, 50));
    this.status = "ONLINE";
    this.hub.broadcast("KERNEL_STATUS", { status: this.status });
  }

  dispatchIntent(intentName, payload, userTier = "COMMUNITY") {
    try {
      this.guard.assertCapabilityAllowed(intentName, userTier);

      if (payload && payload.symbol && intentName === "WATCH_ASSET") {
        this.activeAssets.add(payload.symbol);
        this.guard.validateAssetLimit(this.activeAssets.size, userTier);
      }

      this.hub.broadcast("KERNEL_INTENT", { intent: intentName, payload, userTier });
      return { success: true, intent: intentName };

    } catch (error) {
      if (payload && payload.symbol && intentName === "WATCH_ASSET") {
        this.activeAssets.delete(payload.symbol);
      }
      return { success: false, reason: error.message };
    }
  }
}

export default EnterpriseKernelMaster;
