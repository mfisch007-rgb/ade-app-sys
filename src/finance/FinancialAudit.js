/**
 * ADE FINANCIAL AUDIT HELPER (additive).
 *
 * Standardized audit entries for sensitive financial actions with actor,
 * tenant, timestamp, action, object, previous/new state, source and
 * correlation ID. Emits on the CANONICAL EventBus (audit.log.created) —
 * no second audit system. Also builds data-lineage chains:
 * CONCLUSION -> SIGNAL -> DATA -> PROVIDER -> TRANSACTION/EVENT -> SOURCE -> TIMESTAMP.
 */

import crypto from "node:crypto";
import { nowIso } from "../capabilities/CapabilityRecord.js";

export function financialAudit(eventBus, { action = "", actor = "SYSTEM", tenantScope = "default", object = null, previousState = null, newState = null, source = "FINANCE", correlationId = null, extra = {} } = {}) {
  const entry = {
    category: "FINANCE", action, actor: String(actor).slice(0, 120),
    tenantScope: String(tenantScope || "default"), at: nowIso(),
    object: object ? String(object).slice(0, 200) : null,
    previousState: previousState ?? null, newState: newState ?? null,
    source: String(source).slice(0, 120),
    correlationId: correlationId ? String(correlationId).slice(0, 160) : null,
    ...extra
  };
  try { eventBus?.publish?.("audit.log.created", entry); } catch {}
  return entry;
}

export function buildLineage({ conclusion = null, signal = null, data = null, provider = null, transaction = null, event = null, source = null, timestamp = null } = {}) {
  return {
    conclusion: conclusion || null,
    signal: signal || null,
    dataRef: data || null,
    provider: provider || null,
    transactionRef: transaction || null,
    eventRef: event || null,
    source: source || null,
    timestamp: timestamp || nowIso()
  };
}

export function newCorrelationId(prefix = "fin") {
  try {
    return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}

export default { financialAudit, buildLineage, newCorrelationId };
