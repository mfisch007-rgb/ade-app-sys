/**
 * ADE CAPABILITY RECORD STORE (Batch 6D-2)
 *
 * Durable service over the EXISTING storage abstraction
 * (RuntimeConfigStore readSection/writeSection — same primitive used by
 * CaseManager, CommunityProgression, FeedbackIntelligence).
 *
 * Owns NOTHING else: registration stays with CapabilityRegistry,
 * activation stays with CapabilityActivation, approval rules mirror
 * LearningCandidates (identity + reason + real handler). Comparison stays
 * analysis: recording a decision NEVER activates anything.
 */

import {
  createCapabilityRecord,
  createDecisionRecord,
  transitionRecord,
  isProtectedIntent,
  nowIso
} from "./CapabilityRecord.js";

const RECORDS_SECTION = "capabilityRecords";
const DECISIONS_SECTION = "integrationDecisions";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export class CapabilityRecordStore {
  constructor({ store = null, eventBus = null, capabilityRegistry = null, capabilityActivation = null, maxRecords = 2000 } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.capabilityRegistry = capabilityRegistry;
    this.capabilityActivation = capabilityActivation;
    this.maxRecords = Number.isFinite(Number(maxRecords)) ? Math.max(100, Number(maxRecords)) : 2000;
    this.records = new Map();
    this.decisions = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(RECORDS_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) {
        if (r && r.capabilityId) this.records.set(r.capabilityId, r);
      }
    } catch {}
    try {
      const saved = this.store?.readSection?.(DECISIONS_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const d of rows) {
        if (d && d.decisionId) this.decisions.set(d.decisionId, d);
      }
    } catch {}
  }

  _persist() {
    try {
      this.store?.writeSection?.(RECORDS_SECTION, Object.fromEntries(this.records));
    } catch {}
    try {
      this.store?.writeSection?.(DECISIONS_SECTION, Object.fromEntries(this.decisions));
    } catch {}
  }

  _trim() {
    for (const [map] of [[this.records], [this.decisions]]) {
      if (map.size <= this.maxRecords) continue;
      const entries = [...map.entries()].sort((a, b) => String(a[1].createdAt || "").localeCompare(String(b[1].createdAt || "")));
      for (const [k] of entries.slice(0, map.size - this.maxRecords)) map.delete(k);
    }
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "CAPABILITY_RECORD", action, at: nowIso(), ...fields });
    } catch {}
  }

  _tenantOf(record, callerScope) {
    const scope = String(callerScope || "default").slice(0, 80);
    if (record.tenantScope !== "default" && record.tenantScope !== scope) {
      throw fail("TENANT_MISMATCH", `record tenant '${record.tenantScope}' is not visible to '${scope}'.`);
    }
    return scope;
  }

  /**
   * CREATE / REGISTER. Protected intents (trading/Forex/Binary/Gaming/vendor
   * execution) require an elevated caller; everyone else gets a clean reject.
   */
  register(input = {}, { actor = "SYSTEM", tenantScope = "default", elevated = false } = {}) {
    const scope = String(tenantScope || input.tenantScope || "default").slice(0, 80);
    const record = createCapabilityRecord({ ...input, tenantScope: input.tenantScope || scope });
    if (isProtectedIntent(record.intent) && !elevated) {
      throw fail("PROTECTED_CAPABILITY", `${record.intent} is excluded from non-elevated integration paths.`);
    }
    if (this.records.has(record.capabilityId)) {
      throw fail("CAPABILITY_RECORD_EXISTS", record.capabilityId);
    }
    this.records.set(record.capabilityId, record);
    this._trim();
    this._persist();
    this._audit("RECORD_REGISTERED", { capabilityId: record.capabilityId, intent: record.intent, tenantScope: record.tenantScope, actor: String(actor).slice(0, 120) });
    try {
      this.eventBus?.publish?.("capability.record.registered", { capabilityId: record.capabilityId, intent: record.intent });
    } catch {}
    return { ...record };
  }

  get(capabilityId, { tenantScope = "default" } = {}) {
    const record = this.records.get(String(capabilityId || ""));
    if (!record) return null;
    this._tenantOf(record, tenantScope);
    return { ...record };
  }

  list({ tenantScope = "default", status = null, integrationMethod = null } = {}) {
    const scope = String(tenantScope || "default");
    const out = [];
    for (const record of this.records.values()) {
      if (record.tenantScope !== "default" && record.tenantScope !== scope) continue;
      if (status && record.status !== String(status).toUpperCase()) continue;
      if (integrationMethod && record.integrationMethod !== String(integrationMethod).toUpperCase()) continue;
      out.push({ ...record });
    }
    return out.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }

  updateState(capabilityId, to, { actor = "SYSTEM", reason = "", tenantScope = "default", elevated = false } = {}) {
    const record = this.records.get(String(capabilityId || ""));
    if (!record) throw fail("CAPABILITY_RECORD_NOT_FOUND", String(capabilityId));
    if (!elevated) this._tenantOf(record, tenantScope);
    const updated = transitionRecord(record, to, { actor, reason });
    this.records.set(updated.capabilityId, updated);
    this._persist();
    this._audit("RECORD_STATE_CHANGED", { capabilityId: updated.capabilityId, from: record.status, to: updated.status, actor: String(actor).slice(0, 120) });
    return { ...updated };
  }

  /**
   * Part E linkage: fold a CapabilityExchange.compare() output into a
   * canonical record. Comparison stays analysis — the record lands at
   * MATCHED with method UNKNOWN until a human decides.
   */
  recordFromExchange({ productId = "", compare = null, actor = "SYSTEM", tenantScope = "default" } = {}) {
    if (!compare || typeof compare !== "object") throw fail("COMPARE_OUTPUT_REQUIRED");
    const id = String(productId || compare.id || "unknown").toLowerCase();
    const evidence = [
      `productCapabilities: ${(compare.productCapabilities || []).join(" | ").slice(0, 800)}`,
      `overlap: ${(compare.overlap || []).map((o) => `${o.product}~${o.ade}`).join(" | ").slice(0, 800)}`,
      `missing: ${(compare.missingCapabilities || []).join(" | ").slice(0, 800)}`,
      `requiredHumanAction: ${String(compare.requiredHumanAction || "none").slice(0, 300)}`
    ];
    return this.register({
      intent: `PRODUCT_${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 60)}`,
      name: String(compare.product || id),
      description: `CapabilityExchange comparison for product '${id}' (direction ${compare.direction || "ADE↕PRODUCT"}).`,
      sourceSystem: `PRODUCT:${id}`,
      sourceVersion: "0",
      sourceReference: `CapabilityExchange.compare(${id})`,
      discoveryMethod: "MANIFEST_EXCHANGE",
      evidenceReferences: [],
      dependencies: [],
      permissions: { minLevel: 2, roles: [] },
      tenantScope,
      executionMode: "UNKNOWN",
      providerRequirements: [],
      sideEffects: ["NONE_DECLARED"],
      integrationMethod: "UNKNOWN",
      confidence: 0,
      evidence,
      status: "MATCHED",
      owner: "OPERATOR"
    }, { actor, tenantScope });
  }

  recordDecision(input = {}, { actor = "SYSTEM" } = {}) {
    if (!this.records.has(String(input.capabilityId || ""))) {
      throw fail("DECISION_CAPABILITY_UNKNOWN", String(input.capabilityId));
    }
    const decision = createDecisionRecord(input);
    if (this.decisions.has(decision.decisionId)) throw fail("DECISION_EXISTS", decision.decisionId);
    this.decisions.set(decision.decisionId, decision);
    this._trim();
    this._persist();
    this._audit("DECISION_RECORDED", { decisionId: decision.decisionId, capabilityId: decision.capabilityId, method: decision.method, actor: String(actor).slice(0, 120) });
    try {
      this.eventBus?.publish?.("capability.decision.recorded", { decisionId: decision.decisionId, capabilityId: decision.capabilityId, method: decision.method });
    } catch {}
    return { ...decision };
  }

  getDecision(decisionId, { tenantScope = "default" } = {}) {
    const decision = this.decisions.get(String(decisionId || ""));
    if (!decision) return null;
    const scope = String(tenantScope || "default");
    if (decision.tenantScope !== "default" && decision.tenantScope !== scope) {
      throw fail("TENANT_MISMATCH", "decision is not visible to this tenant.");
    }
    return { ...decision };
  }

  listDecisions({ tenantScope = "default", capabilityId = null } = {}) {
    const scope = String(tenantScope || "default");
    const out = [];
    for (const decision of this.decisions.values()) {
      if (decision.tenantScope !== "default" && decision.tenantScope !== scope) continue;
      if (capabilityId && decision.capabilityId !== String(capabilityId)) continue;
      out.push({ ...decision });
    }
    return out.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }

  /**
   * Authorization is explicit and human-identified — mirrors the
   * LearningCandidates rule. Authorizing NEVER activates.
   */
  authorizeDecision(decisionId, { approved, decidedBy, reason = "" } = {}) {
    const decision = this.decisions.get(String(decisionId || ""));
    if (!decision) throw fail("DECISION_NOT_FOUND", String(decisionId));
    if (decision.authorization.state !== "PENDING") throw fail("DECISION_NOT_PENDING", decisionId);
    if (!decidedBy || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    decision.authorization = {
      state: approved ? "APPROVED" : "REJECTED",
      decidedBy: String(decidedBy).slice(0, 120),
      reason: String(reason).slice(0, 500),
      decidedAt: nowIso()
    };
    decision.updatedAt = nowIso();
    this._persist();
    this._audit(approved ? "DECISION_APPROVED" : "DECISION_REJECTED", { decisionId, capabilityId: decision.capabilityId, decidedBy: decision.authorization.decidedBy });
    return { ...decision };
  }

  recordOutcome(decisionId, { outcome = "", validated = false, detail = "" } = {}) {
    const decision = this.decisions.get(String(decisionId || ""));
    if (!decision) throw fail("DECISION_NOT_FOUND", String(decisionId));
    decision.outcome = String(outcome).slice(0, 1000);
    decision.validation = { state: validated ? "VALIDATED" : "INVALID", detail: String(detail).slice(0, 1000) || null, validatedAt: nowIso() };
    decision.execution.state = validated ? "SUCCEEDED" : decision.execution.state;
    decision.updatedAt = nowIso();
    this._persist();
    this._audit("DECISION_OUTCOME_RECORDED", { decisionId, capabilityId: decision.capabilityId, validated });
    return { ...decision };
  }

  /**
   * Part F linkage: the ONLY path from a decision into the live registry.
   * Requires an APPROVED decision (or explicit elevated authorization) AND a
   * real handler supplied by the caller — same rule as LearningCandidates
   * and CapabilityActivation. Comparison/analysis can never reach this.
   */
  authorizedActivate({ decisionId = null, capabilityId = null, intent = null, handler = null, decidedBy = null, reason = "", rbacLevel = 1, elevated = false } = {}) {
    if (typeof handler !== "function" || !intent) throw fail("APPROVAL_HANDLER_REQUIRED", "intent + handler from an authorized adapter are required.");
    if (isProtectedIntent(intent) && !elevated) throw fail("PROTECTED_CAPABILITY", `${intent} cannot be activated through integration paths.`);
    let decision = null;
    if (decisionId) {
      decision = this.decisions.get(String(decisionId));
      if (!decision) throw fail("DECISION_NOT_FOUND", String(decisionId));
      if (decision.authorization.state !== "APPROVED") throw fail("DECISION_NOT_APPROVED", String(decisionId));
      if (capabilityId && decision.capabilityId !== String(capabilityId)) throw fail("DECISION_CAPABILITY_MISMATCH");
    } else if (!elevated || !decidedBy || !reason) {
      throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    }
    if (!this.capabilityRegistry?.registerCapability) throw fail("REGISTRY_UNAVAILABLE");
    const record = this.capabilityRegistry.registerCapability(
      { intent: String(intent).toUpperCase(), name: String(intent).toUpperCase(), handler, sourceModule: "CAPABILITY_RECORD", rbacLevel },
      { persist: false }
    );
    if (decision) {
      decision.execution = { state: "SUCCEEDED", detail: `Activated as ${record.intent} via CapabilityRegistry.`, executedAt: nowIso() };
      decision.validation = { state: "VALIDATED", detail: "Registry reports runtime-bound handler.", validatedAt: nowIso() };
      decision.updatedAt = nowIso();
      this._persist();
    }
    this._audit("RECORD_ACTIVATED", { capabilityId: capabilityId || decision?.capabilityId || null, intent: record.intent, decidedBy: String(decidedBy || decision?.authorization?.decidedBy || "SYSTEM").slice(0, 120) });
    try {
      this.eventBus?.publish?.("capability.record.activated", { intent: record.intent });
    } catch {}
    return { intent: record.intent, runtimeBound: typeof record.handler === "function" };
  }
}

export default CapabilityRecordStore;
