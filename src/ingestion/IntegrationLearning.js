/**
 * ADE INTEGRATION LEARNING BRIDGE (Batch 11E)
 *
 * Maps a completed integration outcome onto the existing LearningLoop stage
 * vocabulary (OBSERVE→…→REUSE). Bounded + auditable; complements (never
 * duplicates) LearningCandidates approval objects. No autonomous
 * self-modification: reuse is retrieval, promotion stays human-gated.
 */

function nowIso() {
  return new Date().toISOString();
}

export function recordIntegrationLearning({ loop = null, decision = null, acquisition = null, outcome = "", validated = false, actor = "SYSTEM" } = {}) {
  if (!loop?.startLoop) {
    const e = new Error("LEARNING_LOOP_REQUIRED");
    e.code = "LEARNING_LOOP_REQUIRED";
    throw e;
  }
  if (!decision?.capabilityId) {
    const e = new Error("LEARNING_DECISION_REQUIRED");
    e.code = "LEARNING_DECISION_REQUIRED";
    throw e;
  }
  const started = loop.startLoop({ capabilityKey: String(decision.capabilityId).slice(0, 160), tenantScope: decision.tenantScope || "default", actor });
  const stages = {
    OBSERVE: { decisionId: decision.decisionId || null, method: decision.method },
    EXTRACT: { matchClassification: decision.matchClassification || null, matchEvidence: decision.matchEvidence || [] },
    STRUCTURE: { acquisitionId: acquisition?.acquisitionId || null, kind: acquisition?.kind || null },
    VALIDATE: { validated: Boolean(validated) },
    DECIDE: { authorization: decision.authorization || null },
    EXECUTE: { execution: decision.execution || null },
    EVALUATE: { outcome: String(outcome).slice(0, 500) },
    LEARN: { reusableEvidence: validated ? (decision.matchEvidence || []) : [] },
    STORE: { persisted: true },
    REUSE: { reusable: Boolean(validated) }
  };
  for (const [stage, data] of Object.entries(stages)) loop.recordStage(started.loopId, stage, data);
  return loop.completeLoop(started.loopId, { outcome, reusable: Boolean(validated), actor });
}
