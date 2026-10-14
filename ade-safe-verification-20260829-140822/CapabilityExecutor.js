/**
 * Canonical capability execution boundary.
 *
 * Resolves an intent from CapabilityRegistry and executes only a
 * runtime-bound, non-revoked capability handler.
 */
export function executeCapability(registry, intent, payload = {}) {
  if (!registry || typeof registry.getCapability !== "function") {
    return {
      executed: false,
      reason: "CAPABILITY_REGISTRY_UNAVAILABLE",
      intent
    };
  }

  const capability = registry.getCapability(intent);

  if (!capability) {
    return {
      executed: false,
      reason: "CAPABILITY_NOT_FOUND_OR_REVOKED",
      intent
    };
  }

  if (typeof capability.handler !== "function") {
    return {
      executed: false,
      reason: "CAPABILITY_RUNTIME_HANDLER_NOT_BOUND",
      intent
    };
  }

  const result = capability.handler(payload);

  return {
    executed: true,
    intent,
    capability: registry.publicRecord
      ? registry.publicRecord(capability)
      : { id: capability.id, intent: capability.intent },
    result
  };
}
