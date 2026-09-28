/**
 * ADE PROVIDER HEALTH MONITOR (additive).
 *
 * Per-provider, per-tenant integration state: CONNECTED, VERIFIED, HEALTHY,
 * DEGRADED, AUTH_FAILED, SIGNATURE_FAILURE, RATE_LIMITED, UNAVAILABLE,
 * DISABLED, NOT_CONFIGURED. Records last success/failure request/webhook,
 * latency where available, error category, environment. Org-specific
 * comparison metrics (success/failure/reversal/refund/dispute rates,
 * settlement delay, fee patterns, recon variance, availability) — never a
 * universal "best provider" ranking.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { financialAudit } from "./FinancialAudit.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export const PROVIDER_HEALTH_STATES = Object.freeze([
  "CONNECTED", "VERIFIED", "HEALTHY", "DEGRADED", "AUTH_FAILED",
  "SIGNATURE_FAILURE", "RATE_LIMITED", "UNAVAILABLE", "DISABLED", "NOT_CONFIGURED"
]);

export class ProviderHealth {
  constructor({ ledger = null, eventBus = null } = {}) {
    this.ledger = ledger;
    this.eventBus = eventBus;
  }

  _key(provider, tenantScope) {
    return `${String(tenantScope || "default")}::${String(provider).toUpperCase()}`;
  }

  report({ provider = "", tenantScope = "default", environment = "TEST" } = {}) {
    if (!provider) throw fail("FIN_PROVIDER_REQUIRED");
    const rec = this.ledger?.get?.("health", this._key(provider, tenantScope), { tenantScope });
    if (rec) return { ...rec };
    return {
      provider: String(provider).toUpperCase(), tenantScope: String(tenantScope || "default"),
      environment: String(environment).toUpperCase(), state: "NOT_CONFIGURED",
      lastSuccessAt: null, lastWebhookAt: null, lastFailureAt: null,
      lastErrorCategory: null, latencyMs: null, counters: {}
    };
  }

  record({ provider = "", tenantScope = "default", environment = "TEST", event = "SUCCESS", errorCategory = null, latencyMs = null, actor = "SYSTEM" } = {}) {
    if (!provider) throw fail("FIN_PROVIDER_REQUIRED");
    const scope = String(tenantScope || "default");
    const prior = this.report({ provider, tenantScope: scope, environment });
    const at = nowIso();
    const counters = { ...(prior.counters || {}) };
    counters[event] = (counters[event] || 0) + 1;
    const rec = { ...prior, environment: String(environment).toUpperCase(), counters };
    const ev = String(event).toUpperCase();
    if (ev === "SUCCESS" || ev === "WEBHOOK_OK") {
      rec.lastSuccessAt = at;
      if (ev === "WEBHOOK_OK") rec.lastWebhookAt = at;
      if (["AUTH_FAILED", "SIGNATURE_FAILURE", "UNAVAILABLE", "RATE_LIMITED"].includes(prior.state)) rec.state = "DEGRADED";
      else if (prior.state === "NOT_CONFIGURED") rec.state = "CONNECTED";
      else if (prior.state !== "DISABLED") rec.state = "HEALTHY";
    } else {
      rec.lastFailureAt = at;
      rec.lastErrorCategory = errorCategory ? String(errorCategory).slice(0, 120) : ev;
      if (ev === "SIGNATURE_FAILURE" || errorCategory === "SIGNATURE_FAILURE") rec.state = "SIGNATURE_FAILURE";
      else if (ev === "AUTH_FAILED") rec.state = "AUTH_FAILED";
      else if (ev === "RATE_LIMITED") rec.state = "RATE_LIMITED";
      else if (ev === "PROVIDER_OUTAGE" || ev === "UNAVAILABLE") rec.state = "UNAVAILABLE";
      else if (prior.state !== "DISABLED") rec.state = "DEGRADED";
    }
    if (Number.isFinite(Number(latencyMs))) rec.latencyMs = Number(latencyMs);
    rec.updatedAt = at;
    const saved = this.ledger?.put?.("health", this._key(provider, scope), rec, { tenantScope: scope });
    if (["SIGNATURE_FAILURE", "AUTH_FAILED", "UNAVAILABLE"].includes(rec.state)) {
      try { this.eventBus?.publish?.("finance.provider.degraded", { provider: rec.provider, tenantScope: scope, state: rec.state, at }); } catch {}
    }
    financialAudit(this.eventBus, { action: "PROVIDER_HEALTH", actor, tenantScope: scope, object: rec.provider, previousState: prior.state, newState: rec.state, source: "PROVIDER_HEALTH" });
    return saved || rec;
  }

  setState({ provider = "", tenantScope = "default", to = "DISABLED", actor = "SYSTEM", reason = "" } = {}) {
    if (!provider) throw fail("FIN_PROVIDER_REQUIRED");
    const target = String(to).toUpperCase();
    if (!PROVIDER_HEALTH_STATES.includes(target)) throw fail("FIN_HEALTH_STATE_INVALID", to);
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    const scope = String(tenantScope || "default");
    const prior = this.report({ provider, tenantScope: scope });
    const rec = { ...prior, state: target, updatedAt: nowIso() };
    const saved = this.ledger?.put?.("health", this._key(provider, scope), rec, { tenantScope: scope, auditAction: target === "DISABLED" ? "PROVIDER_DISABLED" : "PROVIDER_STATE_CHANGED" });
    return saved || rec;
  }

  /** Org-specific comparison across that org's connected providers only. */
  compare({ tenantScope = "default", ledger = null } = {}) {
    const scope = String(tenantScope || "default");
    const txs = (ledger || this.ledger)?.listTransactions?.({ tenantScope: scope, limit: 2000 }) || [];
    const byProvider = {};
    for (const t of txs) {
      const p = t.provider || "UNKNOWN";
      if (!byProvider[p]) byProvider[p] = { provider: p, total: 0, success: 0, failed: 0, reversed: 0, refunded: 0, disputed: 0, currencyMismatches: 0 };
      const m = byProvider[p];
      m.total += 1;
      if (t.status === "SUCCESS") m.success += 1;
      if (t.status === "FAILED") m.failed += 1;
      if (t.status === "REVERSED") m.reversed += 1;
      if (t.status === "REFUNDED") m.refunded += 1;
      if (t.status === "DISPUTED") m.disputed += 1;
    }
    return Object.values(byProvider).map((m) => ({
      ...m,
      successRate: m.total ? Math.round((m.success / m.total) * 1000) / 10 : null,
      failureRate: m.total ? Math.round((m.failed / m.total) * 1000) / 10 : null,
      reversalRate: m.total ? Math.round((m.reversed / m.total) * 1000) / 10 : null,
      refundRate: m.total ? Math.round((m.refunded / m.total) * 1000) / 10 : null,
      disputeRate: m.total ? Math.round((m.disputed / m.total) * 1000) / 10 : null,
      scope: "ORGANIZATION_ONLY",
      note: "Operational metrics for this organization only; not a universal provider ranking."
    }));
  }
}

export default ProviderHealth;
