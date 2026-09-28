/**
 * ADE COMMERCIAL ENTITLEMENT RECONCILIATION (NEXT enablement — additive).
 *
 * Reconciles the canonical EditionPolicy editions (DEMO/COMMUNITY/PILOT/
 * PROFESSIONAL/ENTERPRISE/SYSTEM) with commercial language
 * (COMMUNITY-FREE / TRIAL / PAID / ENTERPRISE). Does not replace the
 * entitlement system: EditionPolicy remains the runtime authority; this
 * module is a read-only commercial lens + capability-gate helper.
 *
 * Rules:
 * - Never lock functionality ADE does not provide.
 * - Never charge for capabilities that are not actually available.
 * - TRIAL maps to PILOT (time-boxed evaluation), PAID maps to
 *   PROFESSIONAL, ENTERPRISE stays ENTERPRISE.
 */

import { EditionPolicy, EDITION_LIMITS } from "../core/EditionPolicy.js";

export const COMMERCIAL_TIERS = Object.freeze(["COMMUNITY", "TRIAL", "PAID", "ENTERPRISE"]);

export function editionToCommercialTier(edition) {
  const e = String(edition || "COMMUNITY").toUpperCase();
  if (e === "DEMO" || e === "COMMUNITY") return "COMMUNITY";
  if (e === "PILOT") return "TRIAL";
  if (e === "PROFESSIONAL") return "PAID";
  if (e === "ENTERPRISE" || e === "SYSTEM") return "ENTERPRISE";
  return "COMMUNITY";
}

export function commercialTierRank(tier) {
  return { COMMUNITY: 0, TRIAL: 1, PAID: 2, ENTERPRISE: 3 }[String(tier).toUpperCase()] ?? 0;
}

const COMMERCIAL_GATES = Object.freeze({
  users: { COMMUNITY: 3, TRIAL: 10, PAID: 50, ENTERPRISE: Infinity },
  organizationalUnits: { COMMUNITY: 1, TRIAL: 3, PAID: 20, ENTERPRISE: Infinity },
  workflows: { COMMUNITY: 2, TRIAL: 10, PAID: 100, ENTERPRISE: Infinity },
  automation: { COMMUNITY: false, TRIAL: true, PAID: true, ENTERPRISE: true },
  integrations: { COMMUNITY: false, TRIAL: true, PAID: true, ENTERPRISE: true },
  apiUsage: { COMMUNITY: 100, TRIAL: 1000, PAID: 50000, ENTERPRISE: Infinity },
  messaging: { COMMUNITY: false, TRIAL: true, PAID: true, ENTERPRISE: true },
  advancedAnalytics: { COMMUNITY: false, TRIAL: false, PAID: true, ENTERPRISE: true },
  operationalAssessments: { COMMUNITY: 1, TRIAL: 5, PAID: 50, ENTERPRISE: Infinity },
  documentProcessing: { COMMUNITY: 5, TRIAL: 50, PAID: 1000, ENTERPRISE: Infinity },
  externalConnectors: { COMMUNITY: 0, TRIAL: 2, PAID: 20, ENTERPRISE: Infinity },
  telemetry: { COMMUNITY: true, TRIAL: true, PAID: true, ENTERPRISE: true },
  branches: { COMMUNITY: 3, TRIAL: 10, PAID: 100, ENTERPRISE: Infinity },
  aiWorkers: { COMMUNITY: 2, TRIAL: 10, PAID: 100, ENTERPRISE: Infinity },
  customers: { COMMUNITY: 100, TRIAL: 1000, PAID: 50000, ENTERPRISE: Infinity },
  fieldTasks: { COMMUNITY: 100, TRIAL: 1000, PAID: 50000, ENTERPRISE: Infinity }
});

export class CommercialEntitlement {
  constructor({ editionPolicy = null, paymentService = null } = {}) {
    this.editionPolicy = editionPolicy || new EditionPolicy();
    this.paymentService = paymentService || null;
  }

  snapshot({ tenantScope = "default" } = {}) {
    const edition = this.editionPolicy.getEdition();
    const tier = editionToCommercialTier(edition);
    const paid = this.paymentService?.entitlementFor?.(tenantScope) || null;
    return {
      tenantScope: String(tenantScope || "default"),
      edition,
      commercialTier: tier,
      limits: EDITION_LIMITS[edition] || EDITION_LIMITS.COMMUNITY,
      paidEntitlement: paid,
      gates: Object.fromEntries(Object.entries(COMMERCIAL_GATES).map(([k, v]) => [k, v[tier]])),
      badge: this.editionPolicy.getEditionBadge()
    };
  }

  /** Capability gate check: returns { allowed, reason }. */
  check({ tenantScope = "default", capability = "", usage = 0 } = {}) {
    const snap = this.snapshot({ tenantScope });
    const gate = COMMERCIAL_GATES[capability];
    if (gate === undefined) return { allowed: false, reason: "UNKNOWN_CAPABILITY" };
    const allowance = gate[snap.commercialTier];
    if (typeof allowance === "boolean") {
      return allowance
        ? { allowed: true, tier: snap.commercialTier }
        : { allowed: false, reason: "TIER_GATED", tier: snap.commercialTier, upgrade: "TRIAL_OR_PAID" };
    }
    if (Number(usage) >= Number(allowance)) {
      return { allowed: false, reason: "USAGE_LIMIT", tier: snap.commercialTier, allowance };
    }
    return { allowed: true, tier: snap.commercialTier, allowance };
  }

  upgradePrompt({ tenantScope = "default", capability = "" } = {}) {
    const snap = this.snapshot({ tenantScope });
    if (snap.commercialTier === "ENTERPRISE") return null;
    const next = snap.commercialTier === "COMMUNITY" ? "TRIAL" : snap.commercialTier === "TRIAL" ? "PAID" : "ENTERPRISE";
    return {
      capability,
      currentTier: snap.commercialTier,
      suggestedTier: next,
      paymentAvailable: (() => {
        try { return this.paymentService?.availability?.({ tenantScope })?.showPayment || false; }
        catch { return false; }
      })()
    };
  }
}

export default CommercialEntitlement;
