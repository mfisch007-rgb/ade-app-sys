/**
 * ADE OPERATIONAL LEDGER ROUTER (Batch 9B)
 *
 * Routes a business event to EXISTING durable records only:
 * case (via mapper receipt), audit (via mapper audit), knowledge (only
 * through an injected sink), feedback (RECOMMEND — human feedback is never
 * auto-written), measurement (RECOMMEND — the measurements surface is
 * auth-gated and in-memory; this router proposes the payload shape).
 * No "AWBULI Ledger 2". Tenant carried on every leg.
 */

function nowIso() {
  return new Date().toISOString();
}

export function routeLedger({ envelope = null, meaning = null, caseRef = null, sinks = {}, eventBus = null } = {}) {
  if (!envelope || !envelope.eventId) {
    const e = new Error("LEDGER_ENVELOPE_REQUIRED");
    e.code = "LEDGER_ENVELOPE_REQUIRED";
    throw e;
  }
  const tenantScope = envelope.tenantScope || "default";
  const legs = [];
  legs.push({
    destination: "CASE",
    action: caseRef ? "RECORD" : "SKIP",
    ref: caseRef,
    reason: caseRef ? "business event persisted as ADE case via injection mapper" : "no case reference supplied"
  });
  legs.push({
    destination: "AUDIT",
    action: "RECORD",
    ref: null,
    reason: "mapper emits audit.log.created for map + replay"
  });
  let knowledgeRef = null;
  if (sinks.knowledge && typeof sinks.knowledge.ingest === "function" && meaning) {
    try {
      knowledgeRef = sinks.knowledge.ingest(`injection:${envelope.eventId}`, JSON.stringify({ eventId: envelope.eventId, meaning })) ?? null;
    } catch {
      knowledgeRef = null;
    }
  }
  legs.push({
    destination: "KNOWLEDGE",
    action: knowledgeRef !== null || !sinks.knowledge ? (sinks.knowledge ? "RECORD" : "SKIP") : "SKIP",
    ref: knowledgeRef,
    reason: sinks.knowledge ? "business meaning ingested to knowledge" : "no knowledge sink injected"
  });
  legs.push({
    destination: "FEEDBACK",
    action: "RECOMMEND",
    ref: null,
    reason: "human feedback is never auto-written; operator may file follow-up"
  });
  const measurementProposal = meaning && meaning.quantity && meaning.quantity.value !== null ? {
    caseId: caseRef,
    metricName: "SUPPLY_DELIVERY_QUANTITY",
    baselineValue: null,
    afterValue: meaning.quantity.value,
    evidence: `delivery event ${envelope.eventId}: ${meaning.quantity.raw || ""} ${meaning.item || ""}`.slice(0, 500),
    confidence: meaning.confidence ?? null
  } : null;
  legs.push({
    destination: "MEASUREMENT",
    action: measurementProposal ? "RECOMMEND" : "SKIP",
    ref: null,
    proposal: measurementProposal,
    reason: measurementProposal ? "auth-gated in-memory surface; payload proposed, not written" : "no quantifiable observation"
  });
  const plan = {
    eventId: envelope.eventId,
    tenantScope,
    legs,
    routedAt: nowIso()
  };
  try {
    eventBus?.publish?.("audit.log.created", { category: "INJECTION", action: "LEDGER_ROUTED", eventId: envelope.eventId, caseId: caseRef, tenantScope, at: plan.routedAt });
  } catch {}
  return plan;
}
