import CommunityEditionGuard from "../security/CommunityEditionGuard.js";
import CapabilityRegistry from "./CapabilityRegistry.js";
import KernelEventBus from "./EventBus.js";

export class CommandPaletteEngine {
  constructor() {
    this.guard = CommunityEditionGuard.getInstance();
    this.eventBus = KernelEventBus.getInstance();
    this.capabilityRegistry = CapabilityRegistry.getInstance();
  }

  executeCommand(intentName, params = {}, sessionToken = null) {
    const capability = this.capabilityRegistry.getCapability(intentName);
    if (!capability) {
      throw new Error(`Command '${intentName}' is not registered in dynamic CapabilityRegistry.`);
    }

    let userLevel = 1;
    if (sessionToken) {
      const session = this.guard.verifySession(sessionToken);
      userLevel = session.level;
    }

    // Gate D Authorization check against dynamic capability
    this.guard.assertCapabilityAllowed(intentName, userLevel);

    if (userLevel < capability.rbacLevel) {
      throw new Error(`Command '${intentName}' requires RBAC Level ${capability.rbacLevel}, user level is ${userLevel}.`);
    }

    const executionResult = {
      status: "SUCCESS",
      intent: intentName,
      executedAt: new Date().toISOString(),
      result: capability.handler(params)
    };

    // Broadcast execution to EventBus
    this.eventBus.publish("COMMAND_EXECUTED", executionResult);

    return executionResult;
  }
}

export default CommandPaletteEngine;
