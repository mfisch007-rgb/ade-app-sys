export const EngagementEvents = Object.freeze({
  CASE_CREATED: "engagement.case.created",
  CASE_UPDATED: "engagement.case.updated",
  CASE_TRANSITIONED: "engagement.case.transitioned",

  DISCOVERY_STARTED: "engagement.discovery.started",
  DISCOVERY_COMPLETED: "engagement.discovery.completed",
  DISCOVERY_FAILED: "engagement.discovery.failed",

  KNOWLEDGE_INGESTED: "engagement.knowledge.ingested",
  DECISION_REQUESTED: "engagement.decision.requested",
  DECISION_COMPLETED: "engagement.decision.completed",

  CAPABILITY_EVALUATED: "engagement.capability.evaluated",
  CAPABILITY_AVAILABLE: "engagement.capability.available",
  CAPABILITY_GAP: "engagement.capability.gap",

  PARTNER_MATCH_REQUESTED: "engagement.partner.match.requested",
  PARTNER_RECOMMENDED: "engagement.partner.recommended",

  WORKFLOW_STARTED: "engagement.workflow.started",
  WORKFLOW_COMPLETED: "engagement.workflow.completed",
  WORKFLOW_FAILED: "engagement.workflow.failed",

  HUMAN_ESCALATION_REQUIRED: "human.escalation.required",

  FEEDBACK_RECEIVED: "engagement.feedback.received",
  CASE_CLOSED: "engagement.case.closed"
});

export default EngagementEvents;
