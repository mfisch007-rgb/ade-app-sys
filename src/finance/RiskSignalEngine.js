/**
 * ADE RISK-SIGNAL ENGINE (additive, provider-neutral, explainable).
 *
 * Deterministic server-side signal detectors + bounded, versioned,
 * auditable scoring (FIN-RISK-v1, 0–100). Signals are RISK SIGNALS — never
 * "fraud". Confidence comes from the existing ConfidenceModel bands;
 * recommendations map through the existing DecisionEngine policy where
 * wired. Autonomous money-freezing is PROHIBITED by default: HOLD/BLOCK
 * recommendations require an explicit product policy flag
 * (allowFinancialHold) plus L2 human authorization at the route layer.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { confidenceBand } from "../ingestion/ConfidenceModel.js";
import { FIN_RISK_VERSION } from "./FinancialEventModel.js";
import { financialAudit } from "./FinancialAudit.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const RISK_RULES = Object.freeze([
  { id: "SIG_DUPLICATE_ATTEMPT", weight: 25, describe: "same fingerprint seen more than once (replay, not new value)" },
  { id: "SIG_RAPID_REPEAT", weight: 20, describe: ">=4 attempts from same customer reference within 10 minutes" },
  { id: "SIG_UNUSUAL_AMOUNT", weight: 15, describe: "amount >=10x tenant median confirmed amount" },
  { id: "SIG_AMOUNT_MANIPULATION", weight: 20, describe: "requested amount differs from actual amount" },
  { id: "SIG_CURRENCY_INCONSISTENCY", weight: 15, describe: "currency differs from tenant majority currency" },
  { id: "SIG_REFERENCE_REUSE", weight: 20, describe: "merchant reference already used by a different provider transaction" },
  { id: "SIG_SIGNATURE_FAILURE", weight: 40, describe: "webhook signature failed verification (high-confidence security signal)" },
  { id: "SIG_REPLAY_ATTEMPT", weight: 30, describe: "event id already processed (duplicate delivery)" },
  { id: "SIG_IMPOSSIBLE_TRANSITION", weight: 25, describe: "terminal state moved unexpectedly" },
  { id: "SIG_UNEXPECTED_REVERSAL", weight: 20, describe: "reversal after success without dispute/refund record" },
  { id: "SIG_UNEXPECTED_REFUND", weight: 15, describe: "refund without matching original transaction" },
  { id: "SIG_REFUND_EXCEEDS", weight: 25, describe: "refund total exceeds original amount" },
  { id: "SIG_CHARGEBACK_PATTERN", weight: 30, describe: ">=2 disputes/chargebacks for one customer in 30 days" },
  { id: "SIG_SETTLEMENT_ANOMALY", weight: 20, describe: "settlement variance beyond tolerance" },
  { id: "SIG_BALANCE_ANOMALY", weight: 20, describe: "balance variance flagged for the tenant" },
  { id: "SIG_VELOCITY", weight: 15, describe: ">=10 transactions in 5 minutes for one tenant+provider" },
  { id: "SIG_ODD_HOUR", weight: 5, describe: "transaction outside 05:00–23:00 local window (weak signal)" },
  { id: "SIG_NEW_BENEFICIARY", weight: 10, describe: "transfer destination not previously observed for tenant" }
]);

export const RISK_BANDS = Object.freeze([
  { min: 70, band: "HIGH_RISK_SIGNAL" },
  { min: 40, band: "REQUIRES_REVIEW" },
  { min: 15, band: "SUSPECTED" },
  { min: 1, band: "ANOMALOUS" },
  { min: 0, band: "NORMAL" }
]);

export function bandFor(score) {
  for (const b of RISK_BANDS) if (score >= b.min) return b.band;
  return "NORMAL";
}

/** Pure detection over a transaction + ledger context. Returns triggered signals. */
export function detectSignals(tx, ctx = {}) {
  const signals = [];
  const push = (id, evidence) => {
    const rule = RISK_RULES.find((r) => r.id === id);
    if (rule) signals.push({ rule: id, weight: rule.weight, describe: rule.describe, evidence: evidence || null });
  };
  const txs = Array.isArray(ctx.recentTransactions) ? ctx.recentTransactions : [];
  const inWindow = (ms) => {
    const t0 = Date.parse(tx?.occurredAt || tx?.receivedAt || "");
    if (!Number.isFinite(t0)) return [];
    return txs.filter((t) => {
      const tt = Date.parse(t.occurredAt || t.receivedAt || "");
      return Number.isFinite(tt) && Math.abs(t0 - tt) <= ms && t.fingerprint !== tx.fingerprint;
    });
  };
  if (ctx.isDuplicate) push("SIG_DUPLICATE_ATTEMPT", { fingerprint: tx?.fingerprint });
  if (ctx.isReplay) push("SIG_REPLAY_ATTEMPT", { eventId: ctx.eventId });
  if (ctx.signatureFailed) push("SIG_SIGNATURE_FAILURE", { provider: tx?.provider });
  const sameCustomer = tx?.customerReference ? txs.filter((t) => t.customerReference === tx.customerReference) : [];
  if (tx?.customerReference && inWindow(600000).filter((t) => t.customerReference === tx.customerReference).length >= 3) {
    push("SIG_RAPID_REPEAT", { customerReference: "[MASKED]", count: sameCustomer.length });
  }
  const confirmedAmounts = txs.filter((t) => ["PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"].includes(t.provenance?.grade) && num(t.actualAmount ?? t.amount) !== null)
    .map((t) => num(t.actualAmount ?? t.amount));
  if (confirmedAmounts.length >= 3 && num(tx?.actualAmount ?? tx?.amount) !== null) {
    const sorted = [...confirmedAmounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0 && num(tx.actualAmount ?? tx.amount) >= median * 10) push("SIG_UNUSUAL_AMOUNT", { median });
  }
  if (tx?.requestedAmount !== null && tx?.requestedAmount !== undefined && tx?.actualAmount !== null && tx?.actualAmount !== undefined
    && num(tx.requestedAmount) !== num(tx.actualAmount)) push("SIG_AMOUNT_MANIPULATION", null);
  const currencies = txs.map((t) => t.currency).filter(Boolean);
  if (tx?.currency && currencies.length >= 3) {
    const counts = {};
    for (const c of currencies) counts[c] = (counts[c] || 0) + 1;
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    if (tx.currency !== majority) push("SIG_CURRENCY_INCONSISTENCY", { majority });
  }
  if (ctx.referenceReused) push("SIG_REFERENCE_REUSE", { merchantReference: tx?.merchantReference });
  if (ctx.impossibleTransition) push("SIG_IMPOSSIBLE_TRANSITION", ctx.impossibleTransition);
  if (tx?.status === "REVERSED" && !ctx.hasDisputeOrRefund) push("SIG_UNEXPECTED_REVERSAL", null);
  if ((tx?.status === "REFUNDED" || ctx.kind === "REFUND") && ctx.missingOriginal) push("SIG_UNEXPECTED_REFUND", null);
  if (ctx.refundExceeds) push("SIG_REFUND_EXCEEDS", ctx.refundExceeds);
  const disputes = sameCustomer.filter((t) => t.status === "DISPUTED");
  if (disputes.length >= 2) push("SIG_CHARGEBACK_PATTERN", { count: disputes.length });
  if (ctx.settlementVariance) push("SIG_SETTLEMENT_ANOMALY", ctx.settlementVariance);
  if (ctx.balanceVariance) push("SIG_BALANCE_ANOMALY", ctx.balanceVariance);
  if (inWindow(300000).length >= 9) push("SIG_VELOCITY", { windowMs: 300000 });
  if (tx?.occurredAt) {
    const h = new Date(tx.occurredAt).getUTCHours();
    if (h < 4 || h >= 22) push("SIG_ODD_HOUR", null);
  }
  if (ctx.kind === "TRANSFER" && ctx.newBeneficiary) push("SIG_NEW_BENEFICIARY", null);
  return signals;
}

export function scoreSignals(signals) {
  const total = Math.min(100, signals.reduce((s, g) => s + (g.weight || 0), 0));
  return { score: total, band: bandFor(total), version: FIN_RISK_VERSION };
}

export function recommendFor(band, { allowFinancialHold = false } = {}) {
  // Autonomous holds/blocks are prohibited without explicit product policy.
  switch (band) {
    case "HIGH_RISK_SIGNAL": return allowFinancialHold ? "HOLD_FOR_REVIEW" : "ESCALATE";
    case "REQUIRES_REVIEW": return "OPEN_INVESTIGATION";
    case "SUSPECTED": return "REVIEW";
    case "ANOMALOUS": return "RECONCILE";
    default: return "ALLOW";
  }
}

export class RiskSignalEngine {
  constructor({ ledger = null, eventBus = null, decisionEngine = null, allowFinancialHold = false } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
    this.decisionEngine = decisionEngine || null;
    this.allowFinancialHold = allowFinancialHold === true;
  }

  async evaluate(tx, ctx = {}) {
    const tenantScope = tx?.tenantScope || "default";
    let recent = [];
    try { recent = this.ledger?.listTransactions?.({ tenantScope, limit: 200 }) || []; } catch {}
    const signals = detectSignals(tx, { ...ctx, recentTransactions: recent });
    const { score, band, version } = scoreSignals(signals);
    const confidence = signals.length ? Math.min(0.95, 0.35 + signals.length * 0.12 + (score / 100) * 0.3) : 0.9;
    const confidenceBand = confidenceBand(confidence);
    const recommendedAction = recommendFor(band, { allowFinancialHold: this.allowFinancialHold });
    let decision = null;
    try {
      if (this.decisionEngine?.evaluate) {
        decision = await this.decisionEngine.evaluate({
          confidence,
          hold: recommendedAction === "HOLD_FOR_REVIEW" || recommendedAction === "ESCALATE",
          reject: false
        });
      }
    } catch { decision = null; }
    const record = {
      fingerprint: tx?.fingerprint || null,
      tenantScope, provider: tx?.provider || null,
      score, band, signals, confidence: Math.round(confidence * 100) / 100, confidenceBand,
      rulesTriggered: signals.map((s) => s.rule),
      modelVersion: version, at: nowIso(),
      recommendedAction, decision: decision?.decision || null,
      evidenceGrade: "RISK_SIGNAL",
      lineage: { transactionRef: tx?.fingerprint || null, provider: tx?.provider || null, source: tx?.source || null, timestamp: nowIso() }
    };
    financialAudit(this.eventBus, {
      action: "RISK_SIGNAL", actor: ctx.actor || "SYSTEM", tenantScope,
      object: tx?.fingerprint, newState: `${band} (${score})`, source: tx?.source || "FINANCE",
      correlationId: tx?.correlationId || null,
      extra: { rules: record.rulesTriggered }
    });
    if (band === "HIGH_RISK_SIGNAL" || band === "REQUIRES_REVIEW") {
      try { this.eventBus?.publish?.("finance.risk.signal", { ...record }); } catch {}
    }
    return record;
  }
}

export default RiskSignalEngine;
