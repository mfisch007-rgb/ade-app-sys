/**
 * ADE SETTLEMENT INTELLIGENCE (additive, provider-neutral).
 *
 * Settlement records with transaction items, fees, deductions, net amounts,
 * status/date/account. Payment-to-settlement trace graph:
 * CUSTOMER PAYMENT -> TRANSACTION -> PROVIDER EVENT -> INTERNAL RECORD
 * -> SETTLEMENT ITEM -> SETTLEMENT -> DESTINATION. Missing links are
 * visible, never silently filled. Variances become REQUIRES_REVIEW —
 * never an assumption of fraud.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v, max = 200) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

export function buildSettlement(input = {}) {
  if (!input.settlementId) throw fail("FIN_SETTLEMENT_ID_REQUIRED");
  const items = Array.isArray(input.items) ? input.items.slice(0, 500) : [];
  const gross = items.reduce((s, it) => s + (num(it.amount) || 0), 0);
  const feeTotal = num(input.feeTotal) ?? items.reduce((s, it) => s + (num(it.fee) || 0), 0);
  const deductionTotal = num(input.deductionTotal) ?? items.reduce((s, it) => s + (num(it.deduction) || 0), 0);
  const net = num(input.netAmount) ?? Math.round((gross - feeTotal - deductionTotal) * 100) / 100;
  return {
    settlementId: str(input.settlementId, 120),
    provider: String(input.provider || "").toUpperCase().slice(0, 40) || null,
    environment: String(input.environment || "TEST").toUpperCase(),
    tenantScope: str(input.tenantScope, 80) || "default",
    organization: str(input.organization, 200),
    currency: input.currency ? String(input.currency).toUpperCase().slice(0, 8) : null,
    status: str(input.status, 40) || "PENDING",
    settlementDate: str(input.settlementDate, 60),
    destinationAccount: input.destinationAccount ? "****" + String(input.destinationAccount).replace(/\D/g, "").slice(-4) : null,
    grossAmount: Math.round(gross * 100) / 100,
    feeTotal: Math.round(feeTotal * 100) / 100,
    deductionTotal: Math.round(deductionTotal * 100) / 100,
    netAmount: Math.round(net * 100) / 100,
    items: items.map((it) => ({
      fingerprint: str(it.fingerprint, 80),
      providerTxId: str(it.providerTxId, 160),
      amount: num(it.amount),
      fee: num(it.fee),
      deduction: num(it.deduction),
      netAmount: it.netAmount !== undefined ? num(it.netAmount) : (num(it.amount) !== null ? Math.round(((num(it.amount) || 0) - (num(it.fee) || 0) - (num(it.deduction) || 0)) * 100) / 100 : null)
    })),
    source: str(input.source, 120) || "AUTHORIZED_FEED",
    receivedAt: nowIso()
  };
}

/** Reconcile one transaction against its settlement item (the ₦100,000 example generalized). */
export function reconcileSettlementItem(tx, item, { documentedFeeRate = null } = {}) {
  const gross = num(tx?.actualAmount ?? tx?.amount);
  const settledNet = num(item?.netAmount);
  if (gross === null || settledNet === null) return { outcome: "INSUFFICIENT_DATA", findings: [] };
  const itemFee = (num(item.fee) || 0) + (num(item.deduction) || 0);
  const expectedNet = documentedFeeRate !== null && num(documentedFeeRate) !== null
    ? Math.round((gross - gross * Number(documentedFeeRate)) * 100) / 100
    : Math.round((gross - itemFee) * 100) / 100;
  const variance = Math.round((settledNet - expectedNet) * 100) / 100;
  if (Math.abs(variance) < 0.01) {
    return { outcome: "MATCHED", expectedNet, settledNet, variance, findings: [] };
  }
  return {
    outcome: "MISMATCH", expectedNet, settledNet, variance,
    findings: [{ rule: "SETTLEMENT_VARIANCE", detail: `expected net ${expectedNet}, settled ${settledNet} (variance ${variance})` }]
  };
}

export class SettlementIntelligence {
  constructor({ ledger = null, eventBus = null } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
  }

  recordSettlement(input, { tenantScope = "default", actor = "SYSTEM" } = {}) {
    const rec = buildSettlement({ ...input, tenantScope: input.tenantScope || tenantScope });
    const saved = this.ledger?.put?.("settlements", rec.settlementId, rec, { tenantScope: rec.tenantScope, auditAction: "SETTLEMENT_RECEIVED" });
    try { this.eventBus?.publish?.("finance.settlement.received", { settlementId: rec.settlementId, tenantScope: rec.tenantScope }); } catch {}
    return saved || rec;
  }

  /** Trace graph with visible missing links. */
  trace(fingerprint, { tenantScope = "default" } = {}) {
    const tx = this.ledger?.getTransaction?.(fingerprint, { tenantScope });
    const links = {
      customerPayment: tx ? "OBSERVED" : "MISSING",
      transaction: tx ? "OBSERVED" : "MISSING",
      providerEvent: tx && ["PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"].includes(tx.provenance?.grade) ? "OBSERVED" : (tx ? "UNCONFIRMED" : "MISSING"),
      internalRecord: tx ? "OBSERVED" : "MISSING",
      settlementItem: "MISSING",
      settlement: "MISSING",
      destination: "MISSING"
    };
    let settlementHit = null;
    try {
      const settlements = this.ledger?.list?.("settlements", { tenantScope }) || [];
      for (const s of settlements) {
        const item = (s.items || []).find((it) => it.fingerprint === fingerprint || (tx?.providerTxId && it.providerTxId === tx.providerTxId));
        if (item) {
          settlementHit = { settlementId: s.settlementId, item };
          links.settlementItem = "OBSERVED";
          links.settlement = "OBSERVED";
          if (s.destinationAccount) links.destination = "OBSERVED_MASKED";
          break;
        }
      }
    } catch {}
    const missing = Object.entries(links).filter(([, v]) => v === "MISSING").map(([k]) => k);
    return {
      fingerprint, tenantScope: String(tenantScope || "default"),
      transaction: tx, settlement: settlementHit, links, missingLinks: missing,
      complete: missing.length === 0, at: nowIso()
    };
  }
}

export default SettlementIntelligence;
