/**
 * ADE FRAUD/ANOMALY INVESTIGATION WORKFLOW (additive).
 *
 * RISK SIGNAL -> CASE -> EVIDENCE -> ANALYSIS -> HUMAN REVIEW -> RESOLUTION
 * -> AUDIT -> EXPERIENCE. States: OPEN, UNDER_REVIEW, ESCALATED, RESOLVED,
 * DISMISSED, CONFIRMED, FALSE_POSITIVE. Evidence is never destroyed.
 * Links to a canonical intake case for human workflow where available.
 * Resolutions emit learning-ready events; tenant financial history is never
 * exposed cross-tenant. No autonomous money action: HOLD requires explicit
 * policy + L2 human at the route layer.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { financialAudit, newCorrelationId } from "./FinancialAudit.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export const INVESTIGATION_STATES = Object.freeze([
  "OPEN", "UNDER_REVIEW", "ESCALATED", "RESOLVED", "DISMISSED", "CONFIRMED", "FALSE_POSITIVE"
]);

const TRANSITIONS = Object.freeze({
  OPEN: ["UNDER_REVIEW", "ESCALATED", "DISMISSED"],
  UNDER_REVIEW: ["ESCALATED", "RESOLVED", "DISMISSED", "CONFIRMED", "FALSE_POSITIVE", "OPEN"],
  ESCALATED: ["UNDER_REVIEW", "RESOLVED", "CONFIRMED", "FALSE_POSITIVE", "DISMISSED"],
  RESOLVED: [],
  DISMISSED: ["OPEN"],
  CONFIRMED: [],
  FALSE_POSITIVE: []
});

export class InvestigationWorkflow {
  constructor({ ledger = null, eventBus = null, intake = null } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
    this.intake = intake || null;
  }

  open({ tenantScope = "default", fingerprint = null, riskRecord = null, actor = "SYSTEM", reason = "" } = {}) {
    const scope = String(tenantScope || "default");
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    const investigationId = newCorrelationId("inv");
    const rec = {
      investigationId, tenantScope: scope,
      fingerprint: fingerprint || riskRecord?.fingerprint || null,
      provider: riskRecord?.provider || null,
      riskBand: riskRecord?.band || null, riskScore: riskRecord?.score ?? null,
      signals: riskRecord?.signals || [],
      state: "OPEN", history: [{ to: "OPEN", actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }],
      evidence: [], linkedCaseId: null,
      openedBy: String(actor).slice(0, 120), openedAt: nowIso(), updatedAt: nowIso()
    };
    // Link a canonical human-workflow case (best-effort; investigation stands alone if intake unavailable).
    try {
      if (this.intake?.ingest) {
        const c = this.intake.ingest("API", {
          organization: null,
          description: `Financial investigation ${investigationId}: ${rec.riskBand || "review"} signal on ${rec.fingerprint || "unknown transaction"}.`,
          kind: "INVESTIGATION"
        }, { source: "FINANCIAL_INVESTIGATION", authenticated: true });
        rec.linkedCaseId = c?.case?.id || null;
      }
    } catch {}
    const saved = this.ledger?.put?.("investigations", investigationId, rec, { tenantScope: scope, auditAction: "INVESTIGATION_OPENED" });
    try { this.eventBus?.publish?.("finance.investigation.opened", { investigationId, tenantScope: scope, fingerprint: rec.fingerprint }); } catch {}
    return saved || rec;
  }

  attachEvidence(investigationId, evidence = {}, { tenantScope = "default", actor = "SYSTEM" } = {}) {
    const rec = this.ledger?.get?.("investigations", investigationId, { tenantScope });
    if (!rec) throw fail("INVESTIGATION_NOT_FOUND", investigationId);
    if (["RESOLVED", "CONFIRMED", "FALSE_POSITIVE"].includes(rec.state)) throw fail("INVESTIGATION_CLOSED", rec.state);
    rec.evidence = [...(rec.evidence || []), { ...evidence, attachedBy: String(actor).slice(0, 120), attachedAt: nowIso() }].slice(-100);
    rec.updatedAt = nowIso();
    return this.ledger?.put?.("investigations", investigationId, rec, { tenantScope: rec.tenantScope }) || rec;
  }

  transition(investigationId, to, { tenantScope = "default", actor = "SYSTEM", reason = "", resolution = null } = {}) {
    const rec = this.ledger?.get?.("investigations", investigationId, { tenantScope });
    if (!rec) throw fail("INVESTIGATION_NOT_FOUND", investigationId);
    const target = String(to || "").toUpperCase();
    if (!INVESTIGATION_STATES.includes(target)) throw fail("INVESTIGATION_STATE_INVALID", to);
    if (!(TRANSITIONS[rec.state] || []).includes(target)) throw fail("INVESTIGATION_TRANSITION_FORBIDDEN", `${rec.state} -> ${target}`);
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    const from = rec.state;
    rec.state = target;
    rec.updatedAt = nowIso();
    rec.history = [...(rec.history || []), { from, to: target, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-50);
    if (["RESOLVED", "CONFIRMED", "FALSE_POSITIVE", "DISMISSED"].includes(target)) {
      rec.resolution = resolution || { outcome: target, at: nowIso(), by: String(actor).slice(0, 120) };
    }
    const saved = this.ledger?.put?.("investigations", investigationId, rec, { tenantScope: rec.tenantScope, auditAction: target === "ESCALATED" ? "INVESTIGATION_ESCALATED" : "INVESTIGATION_UPDATED" });
    financialAudit(this.eventBus, { action: "INVESTIGATION_TRANSITION", actor, tenantScope: rec.tenantScope, object: investigationId, previousState: from, newState: target, correlationId: rec.fingerprint });
    if (["RESOLVED", "CONFIRMED", "FALSE_POSITIVE"].includes(target)) {
      // Learning-ready event for the Experience Store (tenant-scoped, no raw PII).
      try {
        this.eventBus?.publish?.("finance.investigation.resolved", {
          investigationId, tenantScope: rec.tenantScope, outcome: target,
          signals: (rec.signals || []).map((s) => s.rule || s), riskBand: rec.riskBand,
          evidenceCount: (rec.evidence || []).length, at: nowIso()
        });
      } catch {}
    }
    return saved || rec;
  }

  get(investigationId, { tenantScope = "default" } = {}) {
    return this.ledger?.get?.("investigations", investigationId, { tenantScope }) || null;
  }

  list({ tenantScope = null, state = null, limit = 100 } = {}) {
    let rows = this.ledger?.list?.("investigations", { tenantScope, limit: 1000 }) || [];
    if (state) rows = rows.filter((r) => r.state === String(state).toUpperCase());
    return rows.slice(0, limit);
  }
}

export default InvestigationWorkflow;
