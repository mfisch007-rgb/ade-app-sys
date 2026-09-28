/**
 * ADE BALANCE CONSISTENCY INTELLIGENCE (additive).
 *
 * EXPECTED = opening + confirmed inflows − confirmed outflows ± adjustments
 *            − fees − refunds/reversals. Compared against provider-reported /
 *            accounting / statement balances where ADE legitimately holds
 *            them. Flags unexplained variance. NEVER manufactures a balance:
 *            without an opening snapshot + flows the outcome is
 *            INSUFFICIENT_DATA, never a number presented as fact.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeExpectedBalance({ openingBalance = null, inflows = [], outflows = [], adjustments = [], fees = [], refunds = [] } = {}) {
  // Explicit null/undefined check first: Number(null) === 0 would fake an opening balance.
  const open = (openingBalance === null || openingBalance === undefined) ? null : num(openingBalance);
  if (open === null) {
    return { computable: false, outcome: "INSUFFICIENT_DATA", reason: "no opening balance snapshot", expectedBalance: null };
  }
  const sum = (list) => list.reduce((s, v) => s + (num(typeof v === "object" ? v.amount : v) || 0), 0);
  const expected = open + sum(inflows) - sum(outflows) + sum(adjustments) - sum(fees) - sum(refunds);
  return {
    computable: true, expectedBalance: Math.round(expected * 100) / 100,
    components: {
      openingBalance: open, inflowTotal: sum(inflows), outflowTotal: sum(outflows),
      adjustmentTotal: sum(adjustments), feeTotal: sum(fees), refundTotal: sum(refunds)
    }
  };
}

export function compareBalance(expected, reported, { tolerance = 0.01, label = "PROVIDER" } = {}) {
  if (expected === null || expected === undefined || reported === null || reported === undefined) {
    return { outcome: "INSUFFICIENT_DATA", variance: null };
  }
  const variance = Math.round((Number(reported) - Number(expected)) * 100) / 100;
  if (Math.abs(variance) <= tolerance) return { outcome: "MATCHED", variance };
  return { outcome: "MISMATCH", variance, against: label };
}

export class BalanceIntelligence {
  constructor({ ledger = null, eventBus = null } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
  }

  /**
   * Reconcile a balance snapshot. inflows/outflows derive ONLY from
   * provider-confirmed or human-confirmed ledger transactions unless the
   * caller explicitly includes weaker grades (documented in the result).
   */
  reconcile({ tenantScope = "default", currency = null, openingBalance = null, reportedBalances = {}, includeUnconfirmed = false, actor = "SYSTEM" } = {}) {
    const scope = String(tenantScope || "default");
    const txs = (this.ledger?.listTransactions?.({ tenantScope: scope, limit: 1000 }) || [])
      .filter((t) => !currency || !t.currency || String(t.currency).toUpperCase() === String(currency).toUpperCase());
    const confirmed = txs.filter((t) => ["PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"].includes(t.provenance?.grade));
    const used = includeUnconfirmed ? txs : confirmed;
    const inflows = used.filter((t) => t.status === "SUCCESS").map((t) => t.actualAmount ?? t.amount ?? 0);
    const outflows = used.filter((t) => ["REVERSED", "REFUNDED"].includes(t.status)).map((t) => t.actualAmount ?? t.amount ?? 0);
    const computed = computeExpectedBalance({ openingBalance, inflows, outflows });
    const comparisons = {};
    for (const [label, value] of Object.entries(reportedBalances || {})) {
      comparisons[label] = computed.computable ? compareBalance(computed.expectedBalance, value, { label }) : { outcome: "INSUFFICIENT_DATA", variance: null };
    }
    const result = {
      tenantScope: scope, currency: currency ? String(currency).toUpperCase() : null,
      at: new Date().toISOString(), actor: String(actor).slice(0, 120),
      transactionsConsidered: used.length, confirmedCount: confirmed.length,
      includeUnconfirmed: Boolean(includeUnconfirmed),
      ...computed, comparisons,
      outcome: !computed.computable ? "INSUFFICIENT_DATA"
        : Object.values(comparisons).some((c) => c.outcome === "MISMATCH") ? "MISMATCH"
        : Object.keys(comparisons).length ? "MATCHED" : "PENDING"
    };
    try { this.eventBus?.publish?.("audit.log.created", { category: "FINANCE", action: "BALANCE_RECONCILED", tenantScope: scope, at: nowIso(), outcome: result.outcome }); } catch {}
    if (result.outcome === "MISMATCH") {
      try { this.eventBus?.publish?.("finance.balance.mismatch", { tenantScope: scope, comparisons, at: nowIso() }); } catch {}
    }
    return result;
  }
}

export default BalanceIntelligence;
