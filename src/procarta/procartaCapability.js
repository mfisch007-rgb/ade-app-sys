/**
 * ADE CANONICAL PROCARTA CAPABILITY WIRING (G26)
 *
 * Registers the PROCARTA_EXECUTE capability into the canonical
 * CapabilityRegistry with a live runtime handler bound to the
 * ProcartaExecutionEngine. This makes the capability discoverable
 * (GET /api/v1/capabilities), executable (POST /api/command/execute and
 * kernel.dispatchIntent), RBAC-bound (level >= 1) and edition-aware
 * (see EditionPolicy.CAPABILITY_AVAILABILITY).
 */

export const PROCARTA_CAPABILITY_INTENT = "PROCARTA_EXECUTE";

export function createProcartaHandler(engine) {
  if (!engine) {
    throw new Error("PROCARTA_ENGINE_REQUIRED");
  }
  return (payload = {}, context = {}) => engine.execute(payload, context);
}

export function registerProcartaCapability({
  capabilityRegistry,
  engine,
  persist = true
} = {}) {
  if (
    !capabilityRegistry ||
    typeof capabilityRegistry.registerCapability !== "function"
  ) {
    throw new Error("PROCARTA_CAPABILITY_REGISTRY_UNAVAILABLE");
  }
  if (!engine || typeof engine.execute !== "function") {
    throw new Error("PROCARTA_ENGINE_REQUIRED");
  }

  return capabilityRegistry.registerCapability(
    {
      intent: PROCARTA_CAPABILITY_INTENT,
      name: "Procarta Workflow Execution",
      description:
        "Execute a Procarta business-process analysis slice through canonical intake, case lifecycle, decision engine and provider-neutral AI boundaries.",
      rbacLevel: 1,
      sourceModule: "PROCARTA",
      classification: "DYNAMIC_CAPABILITY",
      tier: "FREE",
      handler: createProcartaHandler(engine)
    },
    { persist }
  );
}

export default registerProcartaCapability;