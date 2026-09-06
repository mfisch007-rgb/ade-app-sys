/**
 * ADE PILOT GATE (G27) — governed pilot progression mechanism.
 *
 * Composes the existing canonical boundaries only:
 *   - CommunityProgression (captured intakes: USE_CASE / PILOT_INTEREST / …)
 *   - the PROCARTA engine's qualification signal (intake metadata.procarta=true,
 *     set only when the canonical engine reached confidence >= 0.6 AND the case
 *     required discovery — see ProcartaExecutionEngine)
 *   - the canonical durable audit topic ("audit.log.created")
 *   - a domain event topic ("pilot.candidate.approved")
 *
 * This module deliberately encodes NO qualification policy. Candidates are
 * exactly the PROCARTA engine-qualified intakes; promotion happens only through
 * an explicit level-2 OPERATOR decision with a mandatory reason. The mechanism,
 * not the policy, is automated. No platform, no parallel store, no fabricated
 * progression.
 */

import crypto from "node:crypto";
import EnterpriseEventBus from "../kernel/EnterpriseEventBus.js";

export class PilotGate {
  constructor({ eventBus = EnterpriseEventBus.getInstance(), progression = null } = {}) {
    this.eventBus = eventBus;
    this.progression = progression;
    this.decisions = [];
    this.maxDecisions = 500;
  }

  listCandidates() {
    if (!this.progression || typeof this.progression.listIntakes !== "function") {
      return [];
    }
    return this.progression
      .listIntakes()
      .filter((intake) => intake.metadata && intake.metadata.procarta === true)
      .map((intake) => ({
        intakeId: intake.id,
        caseId: intake.metadata?.caseId || null,
        organization: intake.organization,
        useCaseDescription: intake.useCaseDescription,
        intent: intake.metadata?.intent || null,
        receivedAt: intake.receivedAt
      }));
  }

  approveCandidate({ intakeId, approvedBy = "UNSPECIFIED", reason = "" } = {}) {
    if (!intakeId) {
      const error = new Error("PILOT_APPROVE_INTAKE_REQUIRED: the candidate intake id is required.");
      error.code = "PILOT_APPROVE_INTAKE_REQUIRED";
      throw error;
    }

    const reasonText = String(reason || "").trim();
    if (!reasonText) {
      const error = new Error(
        "PILOT_APPROVE_REASON_REQUIRED: an explicit operator reason is required for a governed pilot decision."
      );
      error.code = "PILOT_APPROVE_REASON_REQUIRED";
      throw error;
    }

    const candidate = this.listCandidates().find((item) => item.intakeId === intakeId);
    if (!candidate) {
      const error = new Error(
        "PILOT_CANDIDATE_NOT_FOUND: only engine-qualified PROCARTA intakes can be approved as pilot candidates."
      );
      error.code = "PILOT_CANDIDATE_NOT_FOUND";
      throw error;
    }

    const decision = {
      id: crypto.randomUUID(),
      intakeId,
      caseId: candidate.caseId,
      organization: candidate.organization,
      approvedBy: String(approvedBy),
      reason: reasonText,
      decidedAt: new Date().toISOString(),
      state: "APPROVED_TO_PILOT"
    };

    this.decisions.push(decision);
    if (this.decisions.length > this.maxDecisions) {
      this.decisions = this.decisions.slice(-this.maxDecisions);
    }

    if (this.eventBus && typeof this.eventBus.publish === "function") {
      this.eventBus.publish("audit.log.created", {
        category: "PILOT",
        action: "CANDIDATE_APPROVED",
        intakeId: decision.intakeId,
        caseId: decision.caseId,
        organization: decision.organization,
        approvedBy: decision.approvedBy,
        reason: decision.reason,
        decidedAt: decision.decidedAt,
        state: decision.state
      });
      this.eventBus.publish("pilot.candidate.approved", { ...decision });
    }

    return decision;
  }

  recentDecisions(limit = 25) {
    return this.decisions.slice(-Math.max(1, Math.min(100, limit)));
  }

  getStatus() {
    return {
      candidates: this.listCandidates().length,
      decisions: this.decisions.length,
      approvalState: "OPERATOR_GATED"
    };
  }
}

export default PilotGate;