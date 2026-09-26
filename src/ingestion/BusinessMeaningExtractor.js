/**
 * ADE BUSINESS MEANING EXTRACTOR (Batch 9A)
 *
 * Deterministic interpretation of a normalized envelope (+ optional intake
 * assessment) into structured operational meaning. Pure module.
 * Never invents: absent fields stay null, confidence stays truthful.
 */

const QUANTITY_RE = /(\d+(?:\.\d+)?)\s*(cartons?|boxes?|crates?|bags?|units?|pieces?|packs?|bottles?|kg|kilos?|grams?|litres?|liters?|tonnes?|tons?|dozens?)/i;
const ITEM_AFTER_QTY_RE = /(?:cartons?|boxes?|crates?|bags?|units?|pieces?|packs?|bottles?|kg|kilos?|grams?|litres?|liters?|tonnes?|tons?|dozens?)\s+of\s+([a-z][a-z\s]{1,40})/i;

function str(v, max = 300) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

export function extractQuantity(text) {
  const m = QUANTITY_RE.exec(String(text || ""));
  if (!m) return { value: null, unit: null, raw: null };
  return { value: Number(m[1]), unit: m[2].toLowerCase(), raw: m[0] };
}

export function extractItem(text) {
  const m = ITEM_AFTER_QTY_RE.exec(String(text || ""));
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 80) || null;
}

/** Area is not a top-level assessment field; recover it honestly from evidence strings. */
export function deriveAreaFromAssessment(assessment) {
  const list = Array.isArray(assessment?.evidence) ? assessment.evidence : [];
  for (const e of list) {
    const m = /business area identified:\s*([a-z][a-z_ ]*)/i.exec(String(e || ""));
    if (m) return m[1].replace(/\s+/g, "_").trim().toUpperCase().slice(0, 60);
  }
  return null;
}

export function extractBusinessMeaning(envelope = {}, assessment = null) {
  if (!envelope || typeof envelope !== "object" || !envelope.eventId) {
    const e = new Error("MEANING_ENVELOPE_REQUIRED: a validated envelope is required.");
    e.code = "MEANING_ENVELOPE_REQUIRED";
    throw e;
  }
  const text = envelope.payload?.text || "";
  const quantity = extractQuantity(text);
  const item = extractItem(text);
  const party = str(envelope.actor?.organization || envelope.payload?.organization, 200);
  const evidence = [];
  if (quantity.value !== null) evidence.push(`quantity parsed: ${quantity.raw}.`);
  else evidence.push("no parseable quantity in the text.");
  if (item) evidence.push(`item parsed: ${item}.`);
  else evidence.push("no item identified in the text.");
  if (party) evidence.push(`stated party: ${party}.`);
  else evidence.push("no party/organization stated.");
  if (assessment?.area) evidence.push(`intake area: ${assessment.area}.`);
  const derivedArea = deriveAreaFromAssessment(assessment);
  if (envelope.eventType) evidence.push(`event type: ${envelope.eventType}.`);

  const present = [quantity.value !== null, Boolean(item), Boolean(party)].filter(Boolean).length;
  const confidence = present >= 3 ? 0.85 : present === 2 ? 0.6 : present === 1 ? 0.35 : 0.15;
  const t = text.toLowerCase();
  return {
    eventId: envelope.eventId,
    eventKind: envelope.eventType || "GENERAL_BUSINESS_EVENT",
    category: /supplier|deliver|purchase|procurement/.test(t) ? "SUPPLY" : /payment|invoice|paid|debt/.test(t) ? "FINANCE" : /stock|inventory|warehouse/.test(t) ? "INVENTORY" : "GENERAL",
    quantity,
    item,
    party,
    tenantScope: envelope.tenantScope || "default",
    occurredAt: envelope.occurredAt || null,
    receivedAt: envelope.receivedAt || null,
    caseRef: null,
    assessmentArea: assessment?.area || derivedArea,
    assessmentConfidence: Number.isFinite(Number(assessment?.confidence)) ? Number(assessment.confidence) : null,
    confidence,
    evidence,
    unknownFields: ["multimodal content", "exact GPS fix", "counterparty identity verification", "price/currency amounts"],
    generatedBy: "DETERMINISTIC_BUSINESS_EXTRACTOR",
    aiUsed: false
  };
}
