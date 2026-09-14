/**
 * ADE LEARNING CANDIDATES — autonomous capability evolution (expansion batch).
 *
 * Extends the existing OBSERVE → EXTRACT → STRUCTURE → VALIDATE → EXECUTE →
 * EVALUATE → LEARN → STORE → REUSE pipeline (FeedbackIntelligence patterns)
 * with a lightweight, human-gated promotion path:
 *
 *   OBSERVED PATTERN → CANDIDATE → HUMAN APPROVAL → REGISTER/ACTIVATE →
 *   MONITOR → REUSE
 *
 * Rules:
 * - Never silently creates consequential capabilities.
 * - Human approval is the final authority (L2 Founder/operator only).
 * - Candidates carry evidence (pattern counts, affected features) and expire.
 * - Registration requires a real handler supplied at approval time.
 */

import crypto from "node:crypto";

const CANDIDATE_STATES = Object.freeze([
  "CANDIDATE",
  "APPROVED",
  "REJECTED",
  "REGISTERED",
  "MONITORED",
  "EXPIRED"
]);

export class LearningCandidates {
  constructor({ feedbackIntelligence = null, capabilityRegistry = null, eventBus = null } = {}) {
    this.feedback = feedbackIntelligence;
    this.capabilityRegistry = capabilityRegistry;
    this.eventBus = eventBus;
    this.candidates = new Map(); // id -> record
  }

  /**
   * OBSERVED PATTERN → CANDIDATE. Derives candidates from
   * FeedbackIntelligence pattern report (no new observation system).
   */
  deriveFromPatterns({ minCount = 5 } = {}) {
    let report = null;
    try { report = this.feedback?.getPatternReport?.() || null; } catch { report = null; }
    if (!report) return [];
    const out = [];
    for (const p of report.patterns || []) {
      const count = Number(p.count || 0);
      if (count < minCount) continue;
      const key = `${p.category || p.feature || "pattern"}:${count}`;
      const exists = [...this.candidates.values()].some((c) => c.evidenceKey === key && c.state === "CANDIDATE");
      if (exists) continue;
      const rec = {
        id: `LC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        state: "CANDIDATE",
        title: p.category ? `Recurring ${String(p.category).replace(/_/g, " ").toLowerCase()} (${count} reports)` : `Feature pattern: ${p.feature} (${count})`,
        evidenceKey: key,
        evidence: p,
        proposedCapability: null,
        createdAt: new Date().toISOString(),
        decidedBy: null,
        decidedAt: null,
        useCount: 0
      };
      this.candidates.set(rec.id, rec);
      out.push(rec);
    }
    try { this.eventBus?.publish?.("learning.candidates.derived", { count: out.length }); } catch {}
    return out;
  }

  list(state = null) {
    const all = [...this.candidates.values()];
    return state ? all.filter((c) => c.state === state) : all;
  }

  get(id) {
    return this.candidates.get(id) || null;
  }

  /**
   * HUMAN APPROVAL — the only path to REGISTER/ACTIVATE. Requires an
   * explicit approver identity plus reason. Rejection is recorded, never deleted.
   */
  decide(id, { approved, decidedBy, reason, handler = null, intent = null } = {}) {
    const rec = this.candidates.get(id);
    if (!rec) { const e = new Error("CANDIDATE_NOT_FOUND"); e.code = "CANDIDATE_NOT_FOUND"; throw e; }
    if (rec.state !== "CANDIDATE") { const e = new Error("CANDIDATE_NOT_PENDING"); e.code = "CANDIDATE_NOT_PENDING"; throw e; }
    if (!decidedBy || !reason) { const e = new Error("APPROVAL_IDENTITY_AND_REASON_REQUIRED"); e.code = "APPROVAL_IDENTITY_AND_REASON_REQUIRED"; throw e; }
    if (!approved) {
      rec.state = "REJECTED";
      rec.decidedBy = decidedBy;
      rec.decidedAt = new Date().toISOString();
      rec.decisionReason = String(reason).slice(0, 500);
      try { this.eventBus?.publish?.("learning.candidate.rejected", { id }); } catch {}
      return rec;
    }
    // Approval → register only with a real handler (never fabricated).
    if (typeof handler !== "function" || !intent) {
      const e = new Error("APPROVAL_HANDLER_REQUIRED");
      e.code = "APPROVAL_HANDLER_REQUIRED";
      e.detail = "Approval alone does not create executable code. Supply intent + handler from an authorized adapter.";
      throw e;
    }
    try {
      this.capabilityRegistry?.registerCapability?.({ intent: String(intent).toUpperCase(), name: rec.title, handler, sourceModule: "LEARNING_CANDIDATE" }, { persist: false });
    } catch (e) {
      const err = new Error(`CANDIDATE_REGISTER_FAILED: ${e?.message || e}`);
      err.code = "CANDIDATE_REGISTER_FAILED";
      throw err;
    }
    rec.state = "REGISTERED";
    rec.decidedBy = decidedBy;
    rec.decidedAt = new Date().toISOString();
    rec.decisionReason = String(reason).slice(0, 500);
    rec.proposedCapability = String(intent).toUpperCase();
    try { this.eventBus?.publish?.("learning.candidate.approved", { id, intent: rec.proposedCapability }); } catch {}
    return rec;
  }

  /**
   * MONITOR → REUSE. Records reuse; monitored after 3 reuses.
   */
  recordReuse(id) {
    const rec = this.candidates.get(id);
    if (!rec) return null;
    rec.useCount += 1;
    rec.lastUsedAt = new Date().toISOString();
    if (rec.state === "REGISTERED" && rec.useCount >= 3) rec.state = "MONITORED";
    return rec;
  }
}

export { CANDIDATE_STATES };
export default LearningCandidates;
