/**
 * Canonical capability execution boundary.
 *
 * Resolves an intent from CapabilityRegistry and executes only a
 * runtime-bound, non-revoked capability handler. RBAC is enforced here
 * (matching EnterpriseKernelMaster.dispatchIntent): a capability whose
 * rbacLevel exceeds the caller's authenticated level is never executed.
 * Edition entitlement is also enforced: a capability not granted in the
 * active edition (EditionPolicy) is never executed regardless of RBAC level.
 * Async handlers are awaited so the result is the real execution output,
 * never a pending Promise serialized as an empty object.
 */
import EditionPolicy, { CAPABILITY_AVAILABILITY } from "./EditionPolicy.js";

export async function executeCapability(registry, intent, payload = {}, userLevel = Infinity) {
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

  if (Number.isFinite(Number(userLevel)) && Number(capability.rbacLevel) > Number(userLevel)) {
    return {
      executed: false,
      reason: "COMMAND_RBAC_BLOCKED",
      intent,
      requiredLevel: Number(capability.rbacLevel),
      userLevel: Number(userLevel)
    };
  }

  const editionTier = new EditionPolicy(process.env.ADE_EDITION || process.env.ADE_RUNTIME_MODE || "COMMUNITY").getEdition().toLowerCase();
  const editionEntry = CAPABILITY_AVAILABILITY[intent];
  if (editionEntry && !editionEntry[editionTier]) {
    return {
      executed: false,
      reason: "EDITION_GATED",
      intent,
      edition: editionTier.toUpperCase()
    };
  }

  const result = await capability.handler(payload);

  return {
    executed: true,
    intent,
    capability: registry.publicRecord
      ? registry.publicRecord(capability)
      : { id: capability.id, intent: capability.intent },
    result
  };
}
