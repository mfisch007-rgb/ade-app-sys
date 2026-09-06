/**
 * ADE PILOT REGISTRY (G29 foundation) — governed pilot packages.
 *
 * A pilot package is the durable canonical object derived from a G27 approval.
 * It composes ONLY existing machinery:
 *   - the canonical storage store (RuntimeConfigStore section "pilots")
 *   - the canonical durable audit topic ("audit.log.created")
 *   - domain event topics ("pilot.record.created", "pilot.verdict.recorded")
 *
 * No evaluation policy is encoded: packages enter at the existing EVALUATION
 * status and only move to PROMOTED / ARCHIVED through an explicit operator
 * verdict with a mandatory reason. Nothing is executed or scored automatically;
 * the evidence and the verdict remain human-owned while the machinery that
 * records, lists and strictly transitions them is canonical and durable.
 */

import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

const VERDICT_STATES = Object.freeze({
  EVALUATION: "EVALUATION",
  PROMOTED: "PROMOTED",
  ARCHIVED: "ARCHIVED"
});

export class PilotRegistry {
  constructor({ store = null, eventBus = EnterpriseEventBus.getInstance(), maxRecords = 500 } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.maxRecords = maxRecords;
    this.records = this._hydrate();
  }

  _hydrate() {
    let rows = [];
    try {
      if (this.store && typeof this.store.readSection === "function") {
        rows = Array.isArray(this.store.readSection("pilots")) ? this.store.readSection("pilots") : [];
      }
    } catch {
      rows = [];
    }
    return new Map(rows.slice(-this.maxRecords).map((record) => [record.id, record]));
  }

  _persist() {
    try {
      if (this.store && typeof this.store.writeSection === "function") {
        this.store.writeSection("pilots", Array.from(this.records.values()));
      }
    } catch (error) {
      console.warn(`[PilotRegistry] durable persist failed: ${error.message}`);
    }
  }

  recordApproved(decision = {}) {
    const record = {
      id: decision.id,
      intakeId: decision.intakeId,
      caseId: decision.caseId,
      organization: String(decision.organization || ""),
      approvedBy: decision.approvedBy,
      reason: decision.reason,
      state: VERDICT_STATES.EVALUATION,
      decidedAt: decision.decidedAt,
      updatedAt: decision.decidedAt
    };
    this.records.set(record.id, record);
    if (this.records.size > this.maxRecords) {
      const keys = Array.from(this.records.keys());
      for (const key of keys.slice(0, this.records.size - this.maxRecords)) {
        this.records.delete(key);
      }
    }
    this._persist();

    if (this.eventBus && typeof this.eventBus.publish === "function") {
      this.eventBus.publish("audit.log.created", {
        category: "PILOT",
        action: "RECORD_CREATED",
        recordId: record.id,
        caseId: record.caseId,
        state: record.state
      });
      this.eventBus.publish("pilot.record.created", { ...record });
    }

    return record;
  }

  recordVerdict({ recordId, verdict, reason = "", decidedBy = "UNSPECIFIED" } = {}) {
    if (!recordId) {
      const error = new Error("PILOT_VERDICT_RECORD_REQUIRED: the pilot record id is required.");
      error.code = "PILOT_VERDICT_RECORD_REQUIRED";
      throw error;
    }
    if (!Object.values(VERDICT_STATES).includes(verdict) || verdict === VERDICT_STATES.EVALUATION) {
      const error = new Error("PILOT_VERDICT_INVALID: verdict must be PROMOTED or ARCHIVED.");
      error.code = "PILOT_VERDICT_INVALID";
      throw error;
    }
    const reasonText = String(reason || "").trim();
    if (!reasonText) {
      const error = new Error("PILOT_VERDICT_REASON_REQUIRED: an evidence-based verdict requires a reason.");
      error.code = "PILOT_VERDICT_REASON_REQUIRED";
      throw error;
    }

    const record = this.records.get(recordId);
    if (!record) {
      const error = new Error("PILOT_RECORD_NOT_FOUND: no pilot package exists for the given record id.");
      error.code = "PILOT_RECORD_NOT_FOUND";
      throw error;
    }
    if (record.state !== VERDICT_STATES.EVALUATION) {
      const error = new Error(`PILOT_VERDICT_TERMINAL: a ${record.state} pilot package cannot be re-verdict.`);
      error.code = "PILOT_VERDICT_TERMINAL";
      throw error;
    }

    record.state = verdict;
    record.verdictReason = reasonText;
    record.verdictBy = String(decidedBy);
    record.updatedAt = new Date().toISOString();
    this._persist();

    if (this.eventBus && typeof this.eventBus.publish === "function") {
      this.eventBus.publish("audit.log.created", {
        category: "PILOT",
        action: "VERDICT_RECORDED",
        recordId: record.id,
        caseId: record.caseId,
        verdict,
        verdictBy: record.verdictBy
      });
      this.eventBus.publish("pilot.verdict.recorded", { ...record });
    }

    return record;
  }

  list() {
    return Array.from(this.records.values());
  }

  get(recordId) {
    return this.records.get(recordId) || null;
  }

  stats() {
    const byState = {};
    for (const record of this.records.values()) {
      byState[record.state] = (byState[record.state] || 0) + 1;
    }
    return { records: this.records.size, byState };
  }
}

export { VERDICT_STATES };
export default PilotRegistry;