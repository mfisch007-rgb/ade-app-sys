/**
 * ADE CONFIDENCE MODEL (Batch 9D)
 *
 * Bands: HIGH / MEDIUM / LOW / UNKNOWN from numeric confidence.
 * Action modes: AUTO / ASSISTED / HUMAN_REVIEW / PROVIDER_REQUIRED / REJECT.
 * Consequential categories ALWAYS floor at HUMAN_REVIEW — confidence never
 * auto-executes consequential, financial, identity, health/government,
 * trading, destructive, credential, or external-mutation actions.
 */

export const CONFIDENCE_BANDS = Object.freeze(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export const ACTION_MODES = Object.freeze(["AUTO", "ASSISTED", "HUMAN_REVIEW", "PROVIDER_REQUIRED", "REJECT"]);

export const CONSEQUENTIAL_CATEGORIES = Object.freeze([
  "FINANCIAL",
  "IDENTITY",
  "HEALTH",
  "GOVERNMENT",
  "TRADING",
  "DESTRUCTIVE",
  "CREDENTIALS",
  "EXTERNAL_MUTATION"
]);

export function confidenceBand(score) {
  if (!Number.isFinite(Number(score))) return "UNKNOWN";
  const n = Number(score);
  if (n >= 0.75) return "HIGH";
  if (n >= 0.5) return "MEDIUM";
  if (n >= 0.3) return "LOW";
  return "UNKNOWN";
}

export function actionMode({ category = "GENERAL", confidence = 0, providerRequired = false, rejected = false } = {}) {
  if (rejected) return "REJECT";
  if (providerRequired) return "PROVIDER_REQUIRED";
  const cat = String(category || "GENERAL").toUpperCase();
  if (CONSEQUENTIAL_CATEGORIES.includes(cat)) return "HUMAN_REVIEW";
  const band = confidenceBand(confidence);
  if (band === "HIGH") return "AUTO";
  if (band === "MEDIUM") return "ASSISTED";
  return "HUMAN_REVIEW";
}

export function reviewReason({ category = "GENERAL", confidence = 0 } = {}) {
  const cat = String(category || "GENERAL").toUpperCase();
  if (CONSEQUENTIAL_CATEGORIES.includes(cat)) return `consequential category ${cat} always requires human review`;
  const band = confidenceBand(confidence);
  if (band === "HIGH") return "high confidence, non-consequential action may proceed automatically";
  if (band === "MEDIUM") return "medium confidence: assisted execution with human oversight";
  return "low/unknown confidence: human review required";
}
