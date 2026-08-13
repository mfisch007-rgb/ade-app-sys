import CommunityEditionGuard from "../security/CommunityEditionGuard.js";
import KernelEventBus from "./EventBus.js";

export class CommandPaletteEngine {
  constructor() {
    this.guard = CommunityEditionGuard.getInstance();
    this.eventBus = KernelEventBus.getInstance();
    this.registeredCommands = new Map();
    this.initDefaultCommands();
  }

  initDefaultCommands() {
    this.registerCommand("WATCH_ASSET", (params) => `Subscribed to asset stream: ${params.asset}`, 1);
    this.registerCommand("TELEMETRY_SSE", (params) => `Telemetry stream initialized on channel: ${params.channel}`, 1);
    this.registerCommand("UNIVERSAL_AI_GATEWAY", (params) => `AI Gateway dispatch executed: ${params.prompt}`, 1);
    this.registerCommand("MULTI_STREAM", (params) => `Multi-stream routing unlocked for ${params.count} streams`, 2);
    this.registerCommand("SYSTEM_SHUTDOWN", (params) => `SYSTEM EXECUTION: Core shutdown initiated.`, 4);
  }

  registerCommand(intentName, handler, requiredRbacLevel = 1) {
    this.registeredCommands.set(intentName, { handler, requiredRbacLevel });
    this.eventBus.publish("COMMAND_REGISTERED", { intentName, requiredRbacLevel });
  }

  executeCommand(intentName, params = {}, sessionToken = null) {
    const cmd = this.registeredCommands.get(intentName);
    if (!cmd) {
      throw new Error(`Command '${intentName}' is not registered in Universal API Contract.`);
    }

    let userLevel = 1;
    if (sessionToken) {
      const session = this.guard.verifySession(sessionToken);
      if (session.tier === "ENTERPRISE") userLevel = 3;
    }

    // Gate D Authorization check
    this.guard.assertCapabilityAllowed(intentName, userLevel);

    if (userLevel < cmd.requiredRbacLevel) {
      throw new Error(`Command '${intentName}' requires RBAC Level ${cmd.requiredRbacLevel}, user level is ${userLevel}.`);
    }

    const executionResult = {
      status: "SUCCESS",
      intent: intentName,
      executedAt: new Date().toISOString(),
      result: cmd.handler(params)
    };

    // Broadcast command execution through EventBus
    this.eventBus.publish("COMMAND_EXECUTED", executionResult);

    return executionResult;
  }
}

export default CommandPaletteEngine;
