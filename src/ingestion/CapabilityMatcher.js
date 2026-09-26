/**
 * ADE CAPABILITY MATCHER (Batch 10B + 10C)
 *
 * Connects discovery output to existing ADE understanding:
 * - CapabilityExchange.compare() for product-scoped evidence (REUSED)
 * - lexical intent overlap against live registry intents (same algorithm
 *   family as the exchange; honestly lexical, never claimed semantic)
 * - intake-style keyword signals are NOT re-implemented here
 *
 * Output per record: classification (duplicate/complementary/novel/
 * unsupported/provider-dependent/protected/private) + proposed method from
 * the controlled vocabulary + rationale + confidence + evidence.
 * No ranking, no winner selection.
 */

import { isProtectedIntent } from "../capabilities/CapabilityRecord.js";

export const MATCH_CLASSIFICATIONS = Object.freeze([
  "DUPLICATE",
  "COMPLEMENTARY",
  "NOVEL",
  "UNSUPPORTED",
  "PROVIDER_DEPENDENT",
  "PROTECTED_PRIVATE"
]);

function normIntent(x) {
  return String(x || "").toUpperCase();
}

function lexicalHit(candidate, adeIntent) {
  const c = normIntent(candidate);
  const a = normIntent(adeIntent);
  if (!c || !a) return false;
  return c.includes(a) || a.includes(c.split(":").pop().slice(0, 12)) || c.split("_").some((tok) => tok.length > 3 && a.includes(tok));
}

/**
 * Match ONE canonical-record input/object against ADE.
 * @param recordInput canonical record or record input (needs intent/name/evidence/providerRequirements)
 * @param adeIntents live registry intent strings
 * @param exchangeCompare optional CapabilityExchange.compare() output (product scope)
 */
export function matchCapability(recordInput = {}, { adeIntents = [], exchangeCompare = null } = {}) {
  const intent = normIntent(recordInput.intent || recordInput.capabilityId);
  if (!intent) {
    const e = new Error("MATCH_IDENTITY_REQUIRED: intent is required.");
    e.code = "MATCH_IDENTITY_REQUIRED";
    throw e;
  }
  const evidence = [];
  if (isProtectedIntent(intent)) {
    return {
      classification: "PROTECTED_PRIVATE",
      proposedMethod: "REJECT",
      rationale: `${intent} matches a protected execution surface; automatic integration is refused.`,
      confidence: 0.95,
      evidence: ["protected-intent pattern match"],
      matchedAde: []
    };
  }
  const providerRequirements = Array.isArray(recordInput.providerRequirements) ? recordInput.providerRequirements : [];
  const matchedAde = [];
  for (const ai of adeIntents || []) {
    if (lexicalHit(intent, ai) || lexicalHit(recordInput.name, ai)) matchedAde.push(normIntent(ai));
  }
  let exchangeOverlap = [];
  if (exchangeCompare && typeof exchangeCompare === "object") {
    exchangeOverlap = Array.isArray(exchangeCompare.overlap) ? exchangeCompare.overlap : [];
    for (const o of exchangeOverlap) {
      evidence.push(`exchange overlap: ${o.product} ~ ${o.ade}`);
      if (o.ade && !matchedAde.includes(normIntent(o.ade))) matchedAde.push(normIntent(o.ade));
    }
    if (Array.isArray(exchangeCompare.missingCapabilities) && exchangeCompare.missingCapabilities.length) {
      evidence.push(`exchange missing: ${exchangeCompare.missingCapabilities.slice(0, 5).join(" | ").slice(0, 300)}`);
    }
  }
  evidence.push(`lexical scan over ${(adeIntents || []).length} live intents${exchangeCompare ? " + exchange comparison" : ""}`);
  if (providerRequirements.length) {
    return {
      classification: "PROVIDER_DEPENDENT",
      proposedMethod: "PROVIDER_REQUIRED",
      rationale: `requires external provider(s): ${providerRequirements.join(", ")}.`,
      confidence: 0.8,
      evidence: [...evidence, `providerRequirements: ${providerRequirements.join(", ")}`],
      matchedAde
    };
  }
  if (matchedAde.length) {
    const exact = matchedAde.includes(intent);
    return {
      classification: exact ? "DUPLICATE" : "COMPLEMENTARY",
      proposedMethod: exact ? "REUSE" : "ADAPT",
      rationale: exact
        ? `${intent} already exists live in ADE; reuse the canonical owner.`
        : `${intent} overlaps live ${matchedAde.slice(0, 5).join(", ")}; adapt around the canonical owner, do not duplicate.`,
      confidence: exact ? 0.9 : 0.65,
      evidence,
      matchedAde
    };
  }
  const hasSubstance = (recordInput.description && String(recordInput.description).length > 0) ||
    (recordInput.inputs && Object.keys(recordInput.inputs).length > 0);
  if (!hasSubstance) {
    return {
      classification: "UNSUPPORTED",
      proposedMethod: "HUMAN_REVIEW",
      rationale: "insufficient evidence to classify; human review required, nothing invented.",
      confidence: 0.2,
      evidence,
      matchedAde
    };
  }
  return {
    classification: "NOVEL",
    proposedMethod: "REGISTER",
    rationale: `${intent} has no live equivalent; register only after authorization with a real handler.`,
    confidence: 0.55,
    evidence,
    matchedAde
  };
}
