/**
 * ADE FINANCIAL RECONCILIATION ENGINE (additive domain capability).
 *
 * Compares EXPECTED vs PROVIDER vs INTERNAL ADE vs SETTLEMENT vs STATEMENT
 * where data exists. Deterministic server-side rules (no UI hard-coding).
 * Never manufactures certainty: INSUFFICIENT_DATA / PENDING /
 * REQUIRES_REVIEW are first-class outcomes. Emits canonical events for
 * telemetry, PROCARTA bridging (repeated patterns -> process findings),
 * and learning hooks. No new bus/engine/registry.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { RECON_OUTCOMES } from "./FinancialEventModel.js";
import { financialAudit, newCorrelationId } from "./FinancialAudit.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Deterministic recon rules. Each returns null (no finding) or a finding. */
export const RECON_RULES = Object.freeze([
  {
    id: "AMOUNT_MISMATCH",
    describe: "provider amount differs from internal record",
    check({ providerTx = null, internalTx = null }) {
      const a = num(providerTx?.actualAmount ?? providerTx?.amount);
      const b = num(internalTx?.actualAmount ?? internalTx?.amount);
      if (a === null || b === null) return null;
      if (a !== b) return { severity: "MISMATCH", detail: `provider ${a} vs internal ${b}` };
      return null;
    }
  },
  {
    id: "CURRENCY_MISMATCH",
    describe: "currency codes differ across sources",
    check({ providerTx = null, internalTx = null, expected = null }) {
      const set = new Set([providerTx?.currency, internalTx?.currency, expected?.currency].filter(Boolean).map((c) => String(c).toUpperCase()));
      if (set.size > 1) return { severity: "MISMATCH", detail: `currencies: ${[...set].join(",")}` };
      return null;
    }
  },
  {
    id: "STATUS_MISMATCH",
    describe: "provider status disagrees with internal status",
    check({ providerTx = null, internalTx = null }) {
      if (!providerTx?.status || !internalTx?.status) return null;
      const terminal = new Set(["SUCCESS", "FAILED", "REVERSED", "REFUNDED", "CANCELLED"]);
      if (providerTx.status !== internalTx.status && (terminal.has(providerTx.status) || terminal.has(internalTx.status))) {
        return { severity: "MISMATCH", detail: `provider ${providerTx.status} vs internal ${internalTx.status}` };
      }
      return null;
    }
  },
  {
    id: "MISSING_PROVIDER_TX",
    describe: "internal record has no matching provider transaction",
    // Fires only during explicit cross-source comparison (expectProvider):
    // a unified ingest always writes the internal record itself, so absence
    // of provider data there means PENDING (awaiting provider), not review.
    check({ providerTx = null, internalTx = null, expectProvider = false }) {
      if (expectProvider && internalTx && !providerTx) return { severity: "REQUIRES_REVIEW", detail: "internal record without provider counterpart" };
      return null;
    }
  },
  {
    id: "MISSING_INTERNAL_TX",
    describe: "provider reports a transaction ADE never recorded",
    // Same: only during explicit cross-source comparison (expectInternal).
    check({ providerTx = null, internalTx = null, expectInternal = false }) {
      if (expectInternal && providerTx && !internalTx) return { severity: "REQUIRES_REVIEW", detail: "provider transaction without internal record" };
      return null;
    }
  },
  {
    id: "UNMATCHED_SETTLEMENT_ITEM",
    describe: "confirmed successful transaction has no settlement item after the settlement window",
    check({ providerTx = null, settled = false, ageMs = 0, settlementWindowMs = 86400000 }) {
      if (providerTx?.status === "SUCCESS" && !settled && ageMs > settlementWindowMs) {
        return { severity: "REQUIRES_REVIEW", detail: "no settlement item within the settlement window" };
      }
      return null;
    }
  },
  {
    id: "DUPLICATE_REFERENCE",
    describe: "same merchant reference maps to multiple provider transactions",
    check({ siblings = [] }) {
      if (Array.isArray(siblings) && siblings.length > 1) {
        return { severity: "MISMATCH", detail: `${siblings.length} provider transactions share one merchant reference` };
      }
      return null;
    }
  },
  {
    id: "REFUND_EXCEEDS_ORIGINAL",
    describe: "total refunded exceeds the original amount",
    check({ providerTx = null, refunds = [] }) {
      const orig = num(providerTx?.actualAmount ?? providerTx?.amount);
      if (orig === null || !refunds.length) return null;
      const total = refunds.reduce((s, r) => s + (num(r.amount) || 0), 0);
      if (total > orig) return { severity: "MISMATCH", detail: `refunded ${total} exceeds original ${orig}` };
      return null;
    }
  },
  {
    id: "UNEXPECTED_STATE_TRANSITION",
    describe: "terminal state moved (e.g. SUCCESS then FAILED; reversed after success is tracked separately)",
    check({ previousStatus = null, nextStatus = null }) {
      const terminal = new Set(["SUCCESS", "FAILED", "REVERSED", "REFUNDED", "CANCELLED", "ABANDONED"]);
      if (previousStatus && nextStatus && terminal.has(previousStatus) && previousStatus !== nextStatus
        && !((previousStatus === "SUCCESS" && ["REVERSED", "REFUNDED", "DISPUTED"].includes(nextStatus)))) {
        return { severity: "MISMATCH", detail: `${previousStatus} -> ${nextStatus}` };
      }
      return null;
    }
  },
  {
    id: "TIMING_MISMATCH",
    describe: "provider and internal timestamps diverge beyond tolerance",
    check({ providerTx = null, internalTx = null, toleranceMs = 3600000 }) {
      const a = Date.parse(providerTx?.occurredAt || "");
      const b = Date.parse(internalTx?.occurredAt || internalTx?.receivedAt || "");
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (Math.abs(a - b) > toleranceMs) return { severity: "REQUIRES_REVIEW", detail: `timestamps diverge by ${Math.round(Math.abs(a - b) / 60000)}m` };
      return null;
    }
  }
]);

export function reconcileOne({ expected = null, providerTx = null, internalTx = null, settlementItem = null, statementLine = null, refunds = [], siblings = [], previousStatus = null, expectProvider = false, expectInternal = false, settled = false, ageMs = 0, settlementWindowMs = 86400000 } = {}) {
  const findings = [];
  for (const rule of RECON_RULES) {
    try {
      const f = rule.check({ expected, providerTx, internalTx, settlementItem, statementLine, refunds, siblings, previousStatus, nextStatus: providerTx?.status || internalTx?.status, expectProvider, expectInternal, settled, ageMs, settlementWindowMs });
      if (f) findings.push({ rule: rule.id, describe: rule.describe, ...f });
    } catch {}
  }
  const sources = [expected, providerTx, internalTx, settlementItem, statementLine].filter(Boolean).length;
  let outcome = "MATCHED";
  if (sources === 0) outcome = "INSUFFICIENT_DATA";
  else if (findings.some((f) => f.severity === "MISMATCH")) outcome = "MISMATCH";
  else if (findings.some((f) => f.severity === "REQUIRES_REVIEW")) outcome = "REQUIRES_REVIEW";
  else if (sources < 2) outcome = "PENDING";
  else if (settlementItem && providerTx && num(settlementItem.netAmount) !== null && num(providerTx.actualAmount ?? providerTx.amount) !== null
    && num(settlementItem.netAmount) !== num(providerTx.actualAmount ?? providerTx.amount) && !settlementItem.feeExplained) {
    outcome = "PARTIALLY_MATCHED";
  }
  else if (!providerTx || !internalTx) outcome = "UNMATCHED";
  return { outcome, findings, sources, at: nowIso() };
}

export class ReconciliationEngine {
  constructor({ ledger = null, eventBus = null } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
  }

  _emit(topic, payload) {
    try { this.eventBus?.publish?.(topic, payload); } catch {}
  }

  /**
   * Batch/manual reconciliation over a tenant scope. Real-time webhook paths
   * call reconcileOne directly. Never polls providers; works on authorized
   * data already in the ledger.
   */
  runBatch({ tenantScope = "default", actor = "SYSTEM", limit = 200 } = {}) {
    const scope = String(tenantScope || "default");
    const correlationId = newCorrelationId("recon");
    const txs = this.ledger?.listTransactions?.({ tenantScope: scope, limit }) || [];
    const byMerchant = new Map();
    for (const t of txs) {
      if (!t.merchantReference) continue;
      if (!byMerchant.has(t.merchantReference)) byMerchant.set(t.merchantReference, []);
      byMerchant.get(t.merchantReference).push(t);
    }
    const results = [];
    const now = Date.now();
    let settlements = [];
    try { settlements = this.ledger?.list?.("settlements", { tenantScope: scope, limit: 500 }) || []; } catch {}
    const settledPrints = new Set();
    for (const s of settlements) {
      for (const it of s.items || []) {
        if (it.fingerprint) settledPrints.add(it.fingerprint);
      }
    }
    for (const t of txs) {
      const siblings = (byMerchant.get(t.merchantReference) || []).filter((s) => s.fingerprint !== t.fingerprint);
      // The ledger record is the internal counterpart; provider side counts
      // only when confirmed. Settlement linkage is checked for aged,
      // confirmed successes (delayed settlement stays PENDING via window).
      const confirmed = ["PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"].includes(t.provenance?.grade);
      const occurred = Date.parse(t.occurredAt || t.receivedAt || "");
      const result = reconcileOne({
        providerTx: confirmed ? t : null, internalTx: t, siblings,
        settled: settledPrints.has(t.fingerprint),
        ageMs: Number.isFinite(occurred) ? Math.max(0, now - occurred) : 0
      });
      results.push({ fingerprint: t.fingerprint, ...result });
    }
    const summary = {
      runId: correlationId, tenantScope: scope, at: nowIso(), actor: String(actor).slice(0, 120),
      checked: results.length,
      matched: results.filter((r) => r.outcome === "MATCHED").length,
      mismatch: results.filter((r) => r.outcome === "MISMATCH").length,
      review: results.filter((r) => r.outcome === "REQUIRES_REVIEW").length,
      pending: results.filter((r) => ["PENDING", "UNMATCHED", "INSUFFICIENT_DATA", "PARTIALLY_MATCHED"].includes(r.outcome)).length
    };
    try { this.ledger?.put?.("reconRuns", correlationId, { runId: correlationId, ...summary, results: results.slice(0, 200) }, { tenantScope: scope, auditAction: "RECONCILIATION_RUN" }); } catch {}
    financialAudit(this.eventBus, { action: "RECONCILIATION_RUN", actor, tenantScope: scope, object: correlationId, newState: `${summary.matched}/${summary.checked} matched`, correlationId });
    this._emit("finance.reconciliation.completed", { ...summary });
    // PROCARTA bridge: repeated mismatch/review patterns become process findings (no island).
    const problemCount = summary.mismatch + summary.review;
    if (problemCount >= 3) {
      this._emit("procarta.evidence.received", {
        source: "FINANCIAL_RECONCILIATION", tenantScope: scope, category: "PAYMENT_PROCESS",
        finding: `${problemCount} transactions need review — possible payment-process bottleneck.`,
        runId: correlationId, at: nowIso()
      });
    }
    return { ...summary, results };
  }
}

export default ReconciliationEngine;
