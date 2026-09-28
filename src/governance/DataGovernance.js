/**
 * ADE DATA GOVERNANCE BOUNDARY (NEXT enablement — additive).
 *
 * Product/data-governance boundary, not an informal note:
 * - Customer data belongs to / is controlled for that organization.
 * - Used to serve that organization; tenant-isolated by default.
 * - Cross-organization analytics require explicit authorization +
 *   aggregation/anonymization/governance approval.
 * - Every evidence item retains source/org/tenant/user/channel/timestamp/
 *   event type/confidence/validation/processing state/capability/action/audit ref.
 */

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export const DEFAULT_DATA_POLICY = Object.freeze({
  owner: "CUSTOMER_ORGANIZATION",
  crossCustomerUse: "DENIED_BY_DEFAULT",
  crossOrgAnalyticsRequires: ["EXPLICIT_CONTRACT", "AGGREGATION", "ANONYMIZATION", "GOVERNANCE_APPROVAL"],
  retention: "TENANT_SCOPED"
});

export function stampProvenance(evidence = {}, ctx = {}) {
  return {
    source: ctx.source || evidence.source || "UNKNOWN",
    organization: ctx.organization || evidence.organization || null,
    tenant: ctx.tenantScope || evidence.tenantScope || "default",
    user: ctx.actor || evidence.actor || null,
    channel: ctx.channel || evidence.channel || null,
    timestamp: ctx.at || evidence.at || new Date().toISOString(),
    eventType: ctx.eventType || evidence.eventType || null,
    confidence: ctx.confidence ?? evidence.confidence ?? null,
    validationState: ctx.validationState || evidence.validationState || "UNVALIDATED",
    processingState: ctx.processingState || evidence.processingState || "RECEIVED",
    capabilityUsed: ctx.capabilityUsed || evidence.capabilityUsed || null,
    resultingAction: ctx.resultingAction || evidence.resultingAction || null,
    auditReference: ctx.auditReference || evidence.auditReference || null
  };
}

export function assertTenantVisible(recordTenant, callerTenant) {
  const r = String(recordTenant || "default");
  const c = String(callerTenant || "default");
  if (r !== "default" && r !== c) {
    throw fail("TENANT_MISMATCH", `record tenant '${r}' is not visible to '${c}'.`);
  }
  return true;
}

export function assertCrossOrgAuthorized({ authorized = false, aggregated = false, anonymized = false, governed = false } = {}) {
  if (authorized && aggregated && anonymized && governed) return true;
  throw fail("CROSS_ORG_DENIED", "cross-organization use requires contract + aggregation + anonymization + governance approval.");
}

export class DataGovernance {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus || null;
  }
  checkPurpose({ purpose = null } = {}) {
    // Authorized purposes are configured per-tenant; default-allow operational
    // purposes, default-deny cross-customer analytics without approval.
    if (!purpose) return true;
    const p = String(purpose).toUpperCase();
    if (p.includes("CROSS_CUSTOMER") || p.includes("BENCHMARK")) return false;
    return true;
  }
  policy() { return { ...DEFAULT_DATA_POLICY }; }
}

export default DataGovernance;
