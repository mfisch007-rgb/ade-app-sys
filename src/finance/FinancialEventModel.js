/**
 * ADE PROVIDER-NEUTRAL FINANCIAL EVENT MODEL (additive domain layer).
 *
 * Never hard-codes ADE around one PSP. Only entities required by the
 * reconciliation / risk / settlement machinery are implemented; no extra
 * database complexity. Evidence grading separates OBSERVED_FACT from
 * INFERENCE from RISK_SIGNAL from PROVIDER_CONFIRMED from HUMAN_CONFIRMED.
 * Nothing here ever labels a transaction "fraud" — use SUSPECTED /
 * ANOMALOUS / REQUIRES_REVIEW / HIGH_RISK_SIGNAL / PROVIDER_CONFIRMED /
 * HUMAN_CONFIRMED.
 */

import crypto from "node:crypto";
import { nowIso, redactSecrets } from "../capabilities/CapabilityRecord.js";

export const TX_STATES = Object.freeze([
  "CREATED", "INITIATED", "PENDING", "PROCESSING", "SUCCESS", "FAILED",
  "ABANDONED", "REVERSED", "REFUND_PENDING", "REFUNDED", "DISPUTED",
  "CANCELLED", "UNKNOWN"
]);

export const RECON_OUTCOMES = Object.freeze([
  "MATCHED", "PARTIALLY_MATCHED", "UNMATCHED", "MISMATCH",
  "PENDING", "INSUFFICIENT_DATA", "REQUIRES_REVIEW"
]);

export const EVIDENCE_GRADES = Object.freeze([
  "OBSERVED_FACT", "INFERENCE", "RISK_SIGNAL", "PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"
]);

export const RISK_LABELS = Object.freeze([
  "NORMAL", "SUSPECTED", "ANOMALOUS", "REQUIRES_REVIEW", "HIGH_RISK_SIGNAL",
  "PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"
]);

export const FIN_RISK_VERSION = "FIN-RISK-v1";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function str(v, max = 300) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

/** Provider state -> ADE canonical state. Provider raw is always preserved. */
export function normalizeTxState(providerState) {
  const s = String(providerState || "unknown").toLowerCase().replace(/[\s-]+/g, "_");
  const map = {
    success: "SUCCESS", successful: "SUCCESS", paid: "SUCCESS", settled: "SUCCESS",
    failed: "FAILED", failure: "FAILED", declined: "FAILED", error: "FAILED",
    pending: "PENDING", queued: "PENDING", ongoing: "PROCESSING", processing: "PROCESSING",
    initiated: "INITIATED", created: "CREATED", new: "CREATED",
    abandoned: "ABANDONED", cancelled: "CANCELLED", canceled: "CANCELLED",
    reversed: "REVERSED", reversal: "REVERSED", refunded: "REFUNDED", refund: "REFUNDED",
    refund_pending: "REFUND_PENDING", disputed: "DISPUTED", dispute: "DISPUTED",
    chargeback: "DISPUTED"
  };
  return map[s] || "UNKNOWN";
}

/**
 * Provider-neutral transaction identity. Never assumes one provider's id is
 * globally unique: canonical key is provider + environment + provider identity.
 */
export function buildTransactionIdentity(input = {}) {
  const provider = String(input.provider || "").toUpperCase().slice(0, 40);
  if (!provider) throw fail("FIN_PROVIDER_REQUIRED");
  const environment = String(input.environment || "TEST").toUpperCase();
  const providerTxId = str(input.providerTxId || input.providerReference || input.id, 160);
  const merchantRef = str(input.merchantReference || input.reference, 160);
  if (!providerTxId && !merchantRef) throw fail("FIN_TX_IDENTITY_REQUIRED", "provider transaction id or merchant reference is required.");
  const canonicalKey = [provider, environment, providerTxId || `ref:${merchantRef}`].join("|");
  let fingerprint = null;
  try {
    fingerprint = `fintx-${crypto.createHash("sha256").update(canonicalKey).digest("hex").slice(0, 24)}`;
  } catch { fingerprint = `fintx-${Date.now().toString(36)}`; }
  const amount = Number.isFinite(Number(input.amount)) ? Number(input.amount) : null;
  return {
    adeTransactionId: str(input.adeTransactionId, 80) || fingerprint,
    fingerprint,
    canonicalKey,
    provider,
    providerTxId,
    providerReference: str(input.providerReference, 160),
    merchantReference: merchantRef,
    tenantScope: str(input.tenantScope, 80) || "default",
    organization: str(input.organization, 200),
    currency: input.currency ? String(input.currency).toUpperCase().slice(0, 8) : null,
    amount,
    requestedAmount: Number.isFinite(Number(input.requestedAmount)) ? Number(input.requestedAmount) : null,
    actualAmount: Number.isFinite(Number(input.actualAmount)) ? Number(input.actualAmount) : amount,
    status: TX_STATES.includes(String(input.status).toUpperCase()) ? String(input.status).toUpperCase() : "UNKNOWN",
    providerStatusRaw: str(input.providerStatusRaw ?? input.providerStatus, 120),
    channel: str(input.channel, 80),
    customerReference: str(input.customerReference, 160),
    source: str(input.source, 120) || "AUTHORIZED_FEED",
    environment,
    occurredAt: str(input.occurredAt, 60),
    receivedAt: nowIso(),
    correlationId: str(input.correlationId, 160),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    provenance: {
      // Preserve an existing provenance stamp across rebuilds (masking,
      // re-ingest); explicit evidenceGrade wins, then prior grade, else fact.
      adapter: str(input.provenanceAdapter, 120) || str(input.provenance?.adapter, 120) || "FINANCIAL_LEDGER",
      grade: EVIDENCE_GRADES.includes(input.evidenceGrade) ? input.evidenceGrade
        : EVIDENCE_GRADES.includes(input.provenance?.grade) ? input.provenance.grade
        : "OBSERVED_FACT"
    }
  };
}

/** Canonical event fingerprint for idempotency (provider/event identity). */
export function fingerprintFinancialEvent({ provider = "", environment = "TEST", eventId = "", eventType = "", providerTxId = "", rawBodyHash = "" } = {}) {
  const core = [provider, environment, eventId, eventType, providerTxId, rawBodyHash].map((x) => String(x ?? "")).join("|");
  try {
    return `finevt-${crypto.createHash("sha256").update(core).digest("hex").slice(0, 24)}`;
  } catch { return `finevt-${String(eventId || Date.now()).slice(0, 40)}`; }
}

export function sha256Hex(s) {
  try { return crypto.createHash("sha256").update(String(s ?? "")).digest("hex"); }
  catch { return ""; }
}

/** Mask PANs / account numbers / secrets; never expose full card numbers or CVV. */
export function maskFinancial(value) {
  const scanned = redactSecrets(value && typeof value === "object" ? value : { value });
  const out = scanned.value || {};
  const maskPan = (s) => {
    const digits = String(s || "").replace(/\D/g, "");
    if (digits.length >= 12 && digits.length <= 19) {
      return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
    }
    return s;
  };
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const o = {};
      for (const [k, v] of Object.entries(node)) {
        if (/^(cvv|cvc|pin|secret|private_key|api_key)$/i.test(k)) o[k] = "[REDACTED]";
        else if (/card|pan|account_number|accountnumber/i.test(k) && typeof v === "string") o[k] = maskPan(v);
        else o[k] = walk(v);
      }
      return o;
    }
    return node;
  };
  return { value: walk(out), redacted: scanned.redacted };
}

export default {
  TX_STATES, RECON_OUTCOMES, EVIDENCE_GRADES, RISK_LABELS, FIN_RISK_VERSION,
  normalizeTxState, buildTransactionIdentity, fingerprintFinancialEvent, sha256Hex, maskFinancial
};
