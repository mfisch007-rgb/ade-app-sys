/**
 * ADE AVAILABILITY MAP (Community/MVP additive lens).
 *
 * Unifies the split availability vocabularies into one honest label per
 * capability:
 *   COMMUNITY ......... usable now, no provider needed
 *   EXPERIMENTAL ...... works via controlled/test/simulated inputs
 *   PROVIDER_REQUIRED . live operation needs an external provider
 *   ENTERPRISE ........ needs contract/credential/governance activation
 *
 * Sources (all optional, graceful): EditionPolicy tiers, CommercialEntitlement
 * gates, ProviderGate states, static classification table. Never claims LIVE.
 */

export const AVAILABILITY = Object.freeze(["COMMUNITY", "EXPERIMENTAL", "PROVIDER_REQUIRED", "ENTERPRISE"]);

// Static classification for capabilities not derivable from gates.
const STATIC_CLASS = Object.freeze({
  // Live transports / feeds — provider-gated by nature.
  AWBULI_LIVE_TRANSPORT: "PROVIDER_REQUIRED",
  WHATSAPP_LIVE: "PROVIDER_REQUIRED",
  PAYSTACK_LIVE: "PROVIDER_REQUIRED",
  LIVE_PSP_FEEDS: "PROVIDER_REQUIRED",
  LIVE_BANK_FEEDS: "PROVIDER_REQUIRED",
  LIVE_SETTLEMENT_FEEDS: "PROVIDER_REQUIRED",
  LIVE_ERP: "PROVIDER_REQUIRED",
  LIVE_SMS: "PROVIDER_REQUIRED",
  // Controlled/test operation.
  AWBULI_SIMULATED: "EXPERIMENTAL",
  WEBHOOK_FIXTURES: "EXPERIMENTAL",
  FINANCIAL_FIXTURES: "EXPERIMENTAL",
  AI_OPERATING_AGENTS: "EXPERIMENTAL",
  ADVANCED_AUTOMATION: "EXPERIMENTAL",
  // Contract/governance-gated.
  MAJOR_PSP: "ENTERPRISE",
  BANKING_INTEGRATION: "ENTERPRISE",
  ENTERPRISE_ERP: "ENTERPRISE",
  ADVANCED_FRAUD_OPS: "ENTERPRISE",
  ENTERPRISE_SETTLEMENT: "ENTERPRISE",
  HIGH_VOLUME_EVENTS: "ENTERPRISE",
  CUSTOM_ENTERPRISE_AGENTS: "ENTERPRISE",
  ADVANCED_API: "ENTERPRISE"
});

export class AvailabilityMap {
  constructor({ editionPolicy = null, commercialEntitlement = null, providerGate = null } = {}) {
    this.editionPolicy = editionPolicy || null;
    this.commercialEntitlement = commercialEntitlement || null;
    this.providerGate = providerGate || null;
  }

  classify(capability, { tenantScope = "default" } = {}) {
    const key = String(capability || "").toUpperCase();
    if (STATIC_CLASS[key]) {
      return { capability: key, availability: STATIC_CLASS[key], reason: "contract classification", tenantScope };
    }
    // Provider-gate truth: an ENABLED gate means configured path exists.
    try {
      const gates = this.providerGate?.list?.({ tenantScope }) || [];
      const hit = gates.find((g) => String(g.providerId || "").toUpperCase() === key || key.includes(String(g.providerId || "").toUpperCase()));
      if (hit) {
        if (hit.state === "ENABLED") return { capability: key, availability: "PROVIDER_REQUIRED", live: true, reason: `provider gate ${hit.state}`, tenantScope };
        return { capability: key, availability: "PROVIDER_REQUIRED", live: false, reason: `provider gate ${hit.state}`, tenantScope };
      }
    } catch {}
    // Entitlement truth: gated-off at this tier.
    try {
      const check = this.commercialEntitlement?.check?.({ tenantScope, capability: key.toLowerCase() });
      if (check && check.allowed === false) {
        return { capability: key, availability: "ENTERPRISE", reason: check.reason || "tier gated", tier: check.tier, tenantScope };
      }
    } catch {}
    // Default: community-usable core.
    return { capability: key, availability: "COMMUNITY", reason: "core operational capability", tenantScope };
  }

  map(capabilities = [], opts = {}) {
    return capabilities.map((c) => this.classify(c, opts));
  }

  /** Full catalog: static entries + live provider gates + entitlement gates. */
  catalog({ tenantScope = "default" } = {}) {
    const keys = new Set(Object.keys(STATIC_CLASS));
    try {
      for (const g of this.providerGate?.list?.({ tenantScope }) || []) {
        if (g.providerId) keys.add(String(g.providerId).toUpperCase());
      }
    } catch {}
    for (const k of ["USERS", "ORGANIZATIONALUNITS", "WORKFLOWS", "AUTOMATION", "MESSAGING", "ASSESSMENTS", "DOCUMENTS", "KNOWLEDGE", "EXPERIENCE", "AI_WORKERS", "FIELD_TASKS", "CUSTOMERS", "BRANCHES", "RECONCILIATION", "RISK_SIGNALS", "AUDIT", "TELEMETRY"]) keys.add(k);
    return this.map([...keys].sort(), { tenantScope });
  }
}

export default AvailabilityMap;
