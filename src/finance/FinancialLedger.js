/**
 * ADE FINANCIAL LEDGER (additive domain store over the existing store abstraction).
 *
 * Durable, tenant-scoped records for transactions, normalized events (with
 * idempotent replay — a duplicate webhook replays the PRIOR outcome and never
 * re-executes value), settlements, balance snapshots, investigations and
 * reconciliation runs. No new storage engine: uses RuntimeConfigStore
 * sections like every other ADE domain module.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { assertTenantVisible } from "../governance/DataGovernance.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

const SECTIONS = Object.freeze({
  transactions: "financeTransactions",
  events: "financeEvents",
  settlements: "financeSettlements",
  balances: "financeBalances",
  investigations: "financeInvestigations",
  reconRuns: "financeReconRuns",
  health: "financeProviderHealth"
});

export class FinancialLedger {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.maps = {};
    for (const [k, section] of Object.entries(SECTIONS)) {
      this.maps[k] = new Map();
      try {
        const saved = this.store?.readSection?.(section);
        const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
        for (const r of rows) {
          const key = r?.fingerprint || r?.adeTransactionId || r?.settlementId || r?.investigationId || r?.runId || r?.scopedKey;
          if (key) this.maps[k].set(r?.tenantScope ? `${r.tenantScope}::${key}` : String(key), r);
        }
      } catch {}
    }
  }

  _persist(kind) {
    try { this.store?.writeSection?.(SECTIONS[kind], Object.fromEntries(this.maps[kind])); } catch {}
  }

  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "FINANCE", action, at: nowIso(), ...fields }); } catch {}
  }

  _scoped(tenantScope, key) {
    return `${String(tenantScope || "default")}::${String(key)}`;
  }

  // ---- transactions ----
  upsertTransaction(tx, { actor = "SYSTEM" } = {}) {
    if (!tx?.fingerprint) throw fail("FIN_TX_REQUIRED");
    assertTenantVisible(tx.tenantScope, tx.tenantScope);
    const key = this._scoped(tx.tenantScope, tx.fingerprint);
    const prior = this.maps.transactions.get(key);
    const record = { ...tx, firstSeenAt: prior?.firstSeenAt || nowIso(), updatedAt: nowIso(), version: (prior?.version || 0) + 1 };
    this.maps.transactions.set(key, record);
    this._persist("transactions");
    return { record: { ...record }, created: !prior };
  }

  getTransaction(fingerprint, { tenantScope = "default" } = {}) {
    const r = this.maps.transactions.get(this._scoped(tenantScope, fingerprint));
    if (!r) return null;
    assertTenantVisible(r.tenantScope, tenantScope);
    return { ...r };
  }

  listTransactions({ tenantScope = null, provider = null, status = null, limit = 100 } = {}) {
    const out = [];
    for (const r of this.maps.transactions.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      if (provider && r.provider !== String(provider).toUpperCase()) continue;
      if (status && r.status !== String(status).toUpperCase()) continue;
      out.push({ ...r });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")));
  }

  // ---- normalized events (idempotent) ----
  /** Returns { duplicate, outcome } — duplicates replay, never re-execute. */
  recordEvent(fingerprint, outcome, { tenantScope = "default" } = {}) {
    const key = this._scoped(tenantScope, fingerprint);
    const prior = this.maps.events.get(key);
    if (prior) {
      this._audit("FIN_EVENT_DUPLICATE_REPLAY_SAFE", { fingerprint, tenantScope, priorOutcome: prior.outcome });
      return { duplicate: true, outcome: { ...prior.outcome } };
    }
    const rec = { fingerprint, tenantScope: String(tenantScope || "default"), outcome: { ...outcome }, at: nowIso() };
    this.maps.events.set(key, rec);
    this._persist("events");
    return { duplicate: false, outcome: { ...outcome } };
  }

  hasEvent(fingerprint, { tenantScope = "default" } = {}) {
    return this.maps.events.has(this._scoped(tenantScope, fingerprint));
  }

  getEvent(fingerprint, { tenantScope = "default" } = {}) {
    const r = this.maps.events.get(this._scoped(tenantScope, fingerprint));
    return r ? { ...r.outcome } : null;
  }

  // ---- settlements / balances / investigations / runs (tenant-scoped CRUD) ----
  put(kind, id, record, { tenantScope = "default", auditAction = null } = {}) {
    if (!["settlements", "balances", "investigations", "reconRuns", "health"].includes(kind)) throw fail("FIN_KIND_INVALID", kind);
    if (!id) throw fail("FIN_ID_REQUIRED");
    const scope = record?.tenantScope || tenantScope;
    const rec = { ...record, tenantScope: String(scope || "default"), updatedAt: nowIso() };
    this.maps[kind].set(this._scoped(rec.tenantScope, id), rec);
    this._persist(kind);
    if (auditAction) this._audit(auditAction, { id: String(id), tenantScope: rec.tenantScope });
    return { ...rec };
  }

  get(kind, id, { tenantScope = "default" } = {}) {
    const r = this.maps[kind]?.get(this._scoped(tenantScope, id));
    if (!r) return null;
    assertTenantVisible(r.tenantScope, tenantScope);
    return { ...r };
  }

  list(kind, { tenantScope = null, limit = 100 } = {}) {
    const out = [];
    for (const r of (this.maps[kind] || new Map()).values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      out.push({ ...r });
      if (out.length >= limit) break;
    }
    return out;
  }
}

export default FinancialLedger;
