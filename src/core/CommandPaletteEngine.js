/**
 * CommandPaletteEngine — SECONDARY / CLI-ONLY surface (G25 reconciliation).
 *
 * NOT wired into the canonical runtime (src/app.js). Used only by standalone
 * CLI/verification tooling: src/cli/verify_batch_1.js,
 * src/cli/verify_master_system.js, and the repo-root build.js scaffold.
 *
 * CANONICAL COMMAND AUTHORITY (single, no duplicate pipelines):
 *   - Command search  : GET /api/command/search  (src/app.js) over
 *                       canonical PluginRegistry.getAllPlugins() + the static
 *                       ecosystem capability catalog.
 *   - Capability maps : CapabilityRegistry (dynamic) + /api/v1/capabilities.
 *   - Plugin discovery: src/kernel/PluginRegistry.getAllPlugins().
 *   - Command execution: POST /api/command/execute (src/app.js), gated by
 *                       security.requireAuth() and CommunityEditionGuard RBAC,
 *                       dispatched through EnterpriseKernelMaster.dispatchIntent.
 *   - Intent fallback  : DYNAMIC_KERNEL_INTENT resolver on /api/command/search.
 *
 * CommandPaletteEngine must NOT be adopted into canonical routing; it bypasses
 * the canonical HTTP authentication surface.
 */
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
