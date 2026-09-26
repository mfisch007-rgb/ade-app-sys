/**
 * ADE AUTHORITY MAP (Batch 12L)
 *
 * ONE authority per domain. Canonical entries point at the live module;
 * known lookalikes are classified LEGACY (dead/unmounted), REFERENCE
 * (complementary, different job), or DUPLICATE-CANDIDATE (never merged
 * here — removal is a later explicit decision).
 */

export const AUTHORITIES = Object.freeze({
  AUTH: { canonical: "HttpSecurityBoundary + IdentityOnboarding", file: "src/security/HttpSecurityBoundary.js", status: "CANONICAL", lookalikes: [{ name: "SecurityGate (JWT verify helper)", status: "REFERENCE" }, { name: "SecurityGateway (role gate)", status: "REFERENCE" }] },
  EVENTS: { canonical: "EnterpriseEventBus", file: "src/kernel/EnterpriseEventBus.js", status: "CANONICAL", lookalikes: [{ name: "VerifiedEventBus (opt-in strict bus)", status: "REFERENCE" }] },
  CAPABILITIES: { canonical: "CapabilityRegistry", file: "src/core/CapabilityRegistry.js", status: "CANONICAL", lookalikes: [] },
  DECISIONS: { canonical: "DecisionEngine", file: "src/kernel/SupportingEngines.js", status: "CANONICAL", lookalikes: [] },
  KNOWLEDGE: { canonical: "KnowledgeEngine", file: "src/kernel/SupportingEngines.js", status: "CANONICAL", lookalikes: [] },
  CASES: { canonical: "CaseManager + CaseStateMachine", file: "src/intelligence/CaseManager.js", status: "CANONICAL", lookalikes: [] },
  STORAGE: { canonical: "StorageProvider + RuntimeConfigStore", file: "src/admin/RuntimeConfigStore.js", status: "CANONICAL", lookalikes: [] },
  AUDIT: { canonical: "AuditStore + audit.log.created topic", file: "src/storage/AuditStore.js", status: "CANONICAL", lookalikes: [] },
  TENANT: { canonical: "tenantScope fields + CROSS_TENANT_BLOCKED (inbox/trading)", file: "src/messaging/InboxManager.js", status: "CANONICAL", lookalikes: [] },
  SECURITY: { canonical: "SecurityGate + RBAC levels + tenant checks", file: "src/security/SecurityGate.js", status: "CANONICAL", lookalikes: [{ name: "AffiliateLockGuard / LicensingMiddleware (scope guards)", status: "REFERENCE" }] },
  LEARNING: { canonical: "LearningCandidates + LearningLoop", file: "src/learning/LearningCandidates.js", status: "CANONICAL", lookalikes: [] },
  EVENT_SCHEMA: { canonical: "EventSchemaRegistry (events)", file: "src/events/EventSchemaRegistry.js", status: "CANONICAL", lookalikes: [{ name: "core/EventSchemaRegistry.js (second copy)", status: "DUPLICATE-CANDIDATE" }] },
  SANDBOX: { canonical: "PluginSandbox (timeout+sanitize) + ExtensionSandboxGuard (RBAC-verified)", file: "src/plugins/PluginSandbox.js", status: "CANONICAL", lookalikes: [{ name: "Two sandbox helpers coexist; converging them is a later decision", status: "REFERENCE" }] },
  TRADING: { canonical: "FounderSignalEngine + VenueRegistry + entitlements (LOCKED)", file: "src/trading/FounderSignalEngine.js", status: "PROTECTED", lookalikes: [] }
});

export function authorityReport() {
  return {
    generatedAt: new Date().toISOString(),
    domains: Object.keys(AUTHORITIES).length,
    authorities: Object.entries(AUTHORITIES).map(([domain, a]) => ({ domain, ...a }))
  };
}

export default AUTHORITIES;
