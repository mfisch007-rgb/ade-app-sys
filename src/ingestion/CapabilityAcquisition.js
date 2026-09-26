/**
 * ADE CAPABILITY ACQUISITION (Batch 11A–11D)
 *
 * Controlled acquisition from an APPROVED canonical record. Never executes
 * arbitrary foreign code. Kinds:
 * - LOCAL: bind an EXISTING live ADE handler by intent (invoke, no new code)
 * - SIMULATED: inert test binding, clearly labelled, never live
 * - PROVIDER_GATED: inert descriptor until the provider gate enables it
 * - METADATA / ADAPTER: record an adapter contract reference (no code exec)
 *
 * Registration reuses CapabilityRecordStore.authorizedApprove→authorizedActivate
 * (11C). Reuse resolves through the live registry (11D).
 */

import { isProtectedIntent } from "../capabilities/CapabilityRecord.js";

export const ACQUISITION_KINDS = Object.freeze(["LOCAL", "SIMULATED", "PROVIDER_GATED", "METADATA", "ADAPTER"]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

function audit(bus, action, fields = {}) {
  try {
    bus?.publish?.("audit.log.created", { category: "CAPABILITY_ACQUISITION", action, at: nowIso(), ...fields });
  } catch {}
}

/**
 * Acquire execution rights/structure from an approved decision.
 * Returns an inert acquisition descriptor; execution happens only through
 * authorizedActivate (registry) or the labelled SIMULATED path.
 */
export function acquireCapability({ record = null, decision = null, kind = "SIMULATED", handler = null, intent = null, contractRef = null, actor = "SYSTEM", tenantScope = "default", capabilityRegistry = null, eventBus = null } = {}) {
  const k = String(kind || "").toUpperCase();
  if (!ACQUISITION_KINDS.includes(k)) throw fail("ACQUISITION_KIND_INVALID", `must be one of ${ACQUISITION_KINDS.join(",")}.`);
  if (!record?.capabilityId) throw fail("ACQUISITION_RECORD_REQUIRED");
  if (!decision || decision.authorization?.state !== "APPROVED") throw fail("ACQUISITION_NOT_APPROVED", "an APPROVED decision is required.");
  if (String(decision.capabilityId) !== String(record.capabilityId)) throw fail("ACQUISITION_DECISION_MISMATCH");
  const targetIntent = String(intent || record.intent || "").toUpperCase();
  if (!targetIntent) throw fail("ACQUISITION_INTENT_REQUIRED");
  if (isProtectedIntent(targetIntent)) throw fail("PROTECTED_CAPABILITY", `${targetIntent} cannot be acquired through the generic path.`);
  const scope = String(tenantScope || record.tenantScope || "default").slice(0, 80);

  let binding = null;
  if (k === "LOCAL") {
    const live = capabilityRegistry?.getCapability?.(targetIntent);
    if (!live) throw fail("ACQUISITION_LOCAL_MISSING", `${targetIntent} is not live in ADE; cannot invoke.`);
    binding = { type: "LOCAL", intent: targetIntent, runtimeBound: true, note: "invokes the existing live ADE handler; no new code." };
  } else if (k === "SIMULATED") {
    binding = { type: "SIMULATED", intent: targetIntent, runtimeBound: false, note: "inert test binding; never live, never mutating." };
  } else if (k === "PROVIDER_GATED") {
    const reqs = Array.isArray(record.providerRequirements) ? record.providerRequirements : [];
    binding = { type: "PROVIDER_GATED", intent: targetIntent, runtimeBound: false, providerRequirements: reqs, note: "inert until the provider gate enables it." };
  } else {
    if (!contractRef) throw fail("ACQUISITION_CONTRACT_REQUIRED", `${k} acquisition needs a contractRef; foreign code is never executed.`);
    binding = { type: k, intent: targetIntent, runtimeBound: false, contractRef: String(contractRef).slice(0, 500), note: "contract recorded; no code executed." };
  }
  const acquisition = {
    acquisitionId: `ACQ-${Date.now().toString(36).toUpperCase()}-${String(Math.floor(Math.random() * 1296)).padStart(2, "0").toUpperCase()}`,
    capabilityId: record.capabilityId,
    decisionId: decision.decisionId || null,
    kind: k,
    binding,
    tenantScope: scope,
    actor: String(actor).slice(0, 120),
    acquiredAt: nowIso()
  };
  audit(eventBus, "CAPABILITY_ACQUIRED", { acquisitionId: acquisition.acquisitionId, capabilityId: record.capabilityId, kind: k, intent: targetIntent });
  return acquisition;
}

/**
 * Reuse (11D): resolve a live capability through the existing registry and
 * describe how to invoke it. SIMULATED/PROVIDER_GATED bindings stay labelled.
 */
export function reuseCapability({ capabilityRegistry = null, intent = null, binding = null } = {}) {
  const target = String(intent || binding?.intent || "").toUpperCase();
  if (!target) throw fail("REUSE_INTENT_REQUIRED");
  if (binding && binding.type !== "LOCAL") {
    return { intent: target, runtimeBound: false, mode: binding.type, note: `${binding.type} binding: selection path proven, live execution not claimed.` };
  }
  const live = capabilityRegistry?.getCapability?.(target);
  if (!live) throw fail("REUSE_NOT_REGISTERED", `${target} is not live; register first.`);
  return { intent: target, runtimeBound: true, mode: "LOCAL", note: "resolved through the live registry; invoke via existing dispatch." };
}
