/**
 * ADE FINANCIAL INFORMATION PIPELINE (§3 — additive orchestrator).
 *
 * AUTHORIZED SOURCE -> INGEST -> AUTHENTICATE -> VERIFY SIGNATURE ->
 * NORMALIZE -> TENANT -> PROVIDER -> TRANSACTION -> DEDUPE -> VALIDATE ->
 * CANONICAL EVENT -> RECONCILIATION -> RULES -> CONFIDENCE -> RISK ->
 * DECISION -> AUTHORIZED RESPONSE -> AUDIT -> EXPERIENCE/LEARNING.
 *
 * Compatible with the ADE event architecture: publishes on the canonical
 * EventBus, persists via FinancialLedger, routes through existing
 * DecisionEngine/ConfidenceModel, bridges findings to PROCARTA via
 * canonical events. No new bus/engine/registry/gate.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { buildTransactionIdentity, fingerprintFinancialEvent, sha256Hex, maskFinancial } from "./FinancialEventModel.js";
import { reconcileOne } from "./ReconciliationEngine.js";
import { financialAudit, newCorrelationId } from "./FinancialAudit.js";
import { assertTenantVisible } from "../governance/DataGovernance.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export class FinancialPipeline {
  constructor({ adapters = null, ledger = null, riskEngine = null, reconEngine = null, settlement = null, balance = null, investigations = null, health = null, eventBus = null } = {}) {
    this.adapters = adapters;
    this.ledger = ledger;
    this.riskEngine = riskEngine;
    this.reconEngine = reconEngine;
    this.settlement = settlement;
    this.balance = balance;
    this.investigations = investigations;
    this.health = health;
    this.eventBus = eventBus;
  }

  _emit(topic, payload) {
    try { this.eventBus?.publish?.(topic, payload); } catch {}
  }

  /**
   * Ingest one authorized financial payload. `verified` must come from the
   * provider adapter's verifyWebhook (signature-first). Raw webhooks that
   * fail verification never reach normalization.
   */
  async ingestWebhook({ provider = "", tenantScope = "default", rawBody = "", signature = "", actor = "SYSTEM", correlationId = null } = {}) {
    const scope = String(tenantScope || "default");
    const corr = correlationId || newCorrelationId("fin");
    const t0 = Date.now();
    const adapter = this.adapters?.get?.(provider, { tenantScope: scope });
    if (!adapter) throw fail("FIN_ADAPTER_MISSING", provider);
    let verified = null;
    try {
      verified = adapter.verifyWebhook({ rawBody, signature });
    } catch (e) {
      try { this.health?.record?.({ provider, tenantScope: scope, event: "SIGNATURE_FAILURE", errorCategory: e.code || "SIGNATURE_FAILURE", actor }); } catch {}
      this._emit("finance.webhook.signature_failed", { provider, tenantScope: scope, at: nowIso() });
      financialAudit(this.eventBus, { action: "WEBHOOK_SIGNATURE_FAILURE", actor, tenantScope: scope, object: provider, newState: "REJECTED", correlationId: corr });
      throw e;
    }
    const normalized = adapter.normalizeWebhook(verified, { tenantScope: scope });
    return this.ingestNormalized({ ...normalized, tenantScope: scope, actor, correlationId: corr, rawHash: verified.rawHash, latencyMs: Date.now() - t0 });
  }

  /** Ingest an already-normalized transaction (exports, statements, ERP feeds). */
  async ingestNormalized({ transaction = null, kind = "PAYMENT", tenantScope = "default", actor = "SYSTEM", correlationId = null, rawHash = null, latencyMs = null, eventId = null, eventType = null } = {}) {
    if (!transaction) throw fail("FIN_TX_REQUIRED");
    const scope = String(transaction.tenantScope || tenantScope || "default");
    assertTenantVisible(scope, tenantScope);
    const corr = correlationId || transaction.correlationId || newCorrelationId("fin");
    const masked = maskFinancial(transaction);
    const tx = { ...masked.value, tenantScope: scope, correlationId: corr };

    // DEDUPE: fingerprint = provider + env + identity (+ event id when present).
    // A prior final outcome replays verbatim — nothing re-executes.
    const fp = fingerprintFinancialEvent({
      provider: tx.provider, environment: tx.environment,
      eventId: eventId || tx.providerTxId || "", eventType: eventType || kind,
      providerTxId: tx.providerTxId || "", rawBodyHash: rawHash || sha256Hex(JSON.stringify(masked.value))
    });
    try {
      const priorOutcome = this.ledger?.getEvent?.(fp, { tenantScope: scope });
      if (priorOutcome) {
        this._emit("finance.event.duplicate", { fingerprint: tx.fingerprint, tenantScope: scope });
        return { duplicate: true, fingerprint: tx.fingerprint, outcome: priorOutcome, correlationId: corr };
      }
    } catch {}

    // VALIDATE + persist canonical transaction. The ledger write IS the
    // internal ADE record, so internalTx is always present from here on:
    // a provider-confirmed ingest self-reconciles to MATCHED, while an
    // unconfirmed ingest stays PENDING (awaiting provider), never a false
    // mismatch.
    const canonical = buildTransactionIdentity({ ...tx, correlationId: corr });
    const prior = this.ledger?.getTransaction?.(canonical.fingerprint, { tenantScope: scope });
    const impossibleTransition = prior && prior.status !== canonical.status
      ? this._checkTransition(prior.status, canonical.status) : null;
    const { record } = this.ledger?.upsertTransaction?.(canonical, { actor }) || { record: canonical };

    // RECONCILIATION (EXPECTED vs PROVIDER vs INTERNAL).
    const confirmed = ["PROVIDER_CONFIRMED", "HUMAN_CONFIRMED"].includes(canonical.provenance?.grade);
    const recon = reconcileOne({
      providerTx: confirmed ? canonical : null,
      internalTx: canonical,
      previousStatus: prior?.status || null
    });

    // RISK (rules -> confidence -> recommendation).
    let risk = null;
    try {
      risk = await this.riskEngine?.evaluate?.(canonical, {
        actor, isDuplicate: false, isReplay: false,
        impossibleTransition,
        kind,
        correlationId: corr
      }) || null;
    } catch { risk = null; }

    // DECISION-gated response: only REVIEW/ESCALATE-class actions flow
    // automatically; HOLD/BLOCK needs explicit policy + human (route layer).
    const outcome = {
      duplicate: false, fingerprint: canonical.fingerprint, adeTransactionId: canonical.adeTransactionId,
      status: canonical.status, reconOutcome: recon.outcome, reconFindings: recon.findings,
      riskBand: risk?.band || "NORMAL", riskScore: risk?.score ?? 0,
      recommendedAction: risk?.recommendedAction || "ALLOW",
      correlationId: corr
    };
    try { this.ledger?.recordEvent?.(fp, outcome, { tenantScope: scope }); } catch {}

    const topic = canonical.status === "SUCCESS" ? "finance.payment.verified"
      : canonical.status === "FAILED" ? "finance.payment.failed"
      : canonical.status === "REVERSED" ? "finance.payment.reversed"
      : kind === "REFUND" ? "finance.refund.received"
      : kind === "DISPUTE" ? "finance.dispute.received"
      : kind === "TRANSFER" ? "finance.transfer.received"
      : "finance.event.received";
    this._emit(topic, { ...outcome, tenantScope: scope, provider: canonical.provider });
    this._emit("finance.payment.received", { ...outcome, tenantScope: scope, provider: canonical.provider });
    try { this.health?.record?.({ provider: canonical.provider, tenantScope: scope, environment: canonical.environment, event: "WEBHOOK_OK", latencyMs, actor }); } catch {}
    financialAudit(this.eventBus, {
      action: "TRANSACTION_VERIFIED", actor, tenantScope: scope, object: canonical.fingerprint,
      previousState: prior?.status || null, newState: canonical.status, source: canonical.source, correlationId: corr
    });

    // Auto-open investigation on HIGH band (human workflow follows).
    if (risk && (risk.band === "HIGH_RISK_SIGNAL" || risk.band === "REQUIRES_REVIEW") && this.investigations) {
      try {
        const inv = this.investigations.open({
          tenantScope: scope, fingerprint: canonical.fingerprint, riskRecord: risk,
          actor: "FINANCE_ENGINE", reason: `auto-opened: ${risk.band} (${risk.score})`
        });
        outcome.investigationId = inv.investigationId;
        this._emit("finance.investigation.opened", { investigationId: inv.investigationId, tenantScope: scope });
      } catch {}
    }
    return outcome;
  }

  _checkTransition(from, to) {
    const terminal = new Set(["SUCCESS", "FAILED", "REVERSED", "REFUNDED", "CANCELLED", "ABANDONED"]);
    if (terminal.has(from) && from !== to && !((from === "SUCCESS" && ["REVERSED", "REFUNDED", "DISPUTED"].includes(to)))) {
      return { from, to };
    }
    return null;
  }
}

export default FinancialPipeline;
