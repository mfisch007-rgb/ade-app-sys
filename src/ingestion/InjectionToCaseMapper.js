/**
 * ADE INJECTION → CASE MAPPER (Batch 7C)
 *
 * NORMALIZED EVENT → UNIFIED INTAKE → ADE CASE → (existing decision flow) → AUDIT.
 * No AWBULI ledger, no parallel schema, no second case system.
 *
 * - Intake path reused verbatim: intake.ingest("WEBHOOK", …).
 * - Provenance rides on the case `source` tag plus a durable receipt
 *   (section `injectionReceipts`) linking idempotencyKey ↔ caseId ↔ eventId.
 * - Idempotency: same scoped key twice → replay-safe duplicate result,
 *   zero new business records. Scoped per tenant.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";

const RECEIPTS_SECTION = "injectionReceipts";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export class InjectionToCaseMapper {
  constructor({ intake = null, store = null, eventBus = null } = {}) {
    this.intake = intake;
    this.store = store;
    this.eventBus = eventBus;
    this.receipts = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(RECEIPTS_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) {
        if (r && r.scopedKey) this.receipts.set(r.scopedKey, r);
      }
    } catch {}
  }

  _persist() {
    try {
      this.store?.writeSection?.(RECEIPTS_SECTION, Object.fromEntries(this.receipts));
    } catch {}
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "INJECTION", action, at: nowIso(), ...fields });
    } catch {}
  }

  scopedKey(envelope) {
    return `${envelope.tenantScope}::${envelope.idempotencyKey}`;
  }

  /**
   * Map a validated envelope to an ADE case. Returns
   * { duplicate, caseId, intakeId, receipt }.
   */
  map(envelope, { tenantScope = "default", actor = "SYSTEM" } = {}) {
    if (!envelope || typeof envelope !== "object" || !envelope.eventId) {
      throw fail("INJECTION_ENVELOPE_REQUIRED", "a validated normalized envelope is required.");
    }
    const scope = String(tenantScope || "default");
    if (envelope.tenantScope !== "default" && envelope.tenantScope !== scope) {
      throw fail("TENANT_MISMATCH", `event tenant '${envelope.tenantScope}' is not visible to '${scope}'.`);
    }
    if (!this.intake?.ingest) throw fail("INTAKE_UNAVAILABLE");
    const key = this.scopedKey(envelope);
    const prior = this.receipts.get(key);
    if (prior) {
      this._audit("EVENT_DUPLICATE_REPLAY_SAFE", {
        eventId: envelope.eventId,
        caseId: prior.caseId,
        adapter: envelope.provenance?.adapter || "UNKNOWN",
        tenantScope: envelope.tenantScope
      });
      return { duplicate: true, caseId: prior.caseId, intakeId: prior.intakeId, receipt: { ...prior } };
    }
    const adapter = envelope.provenance?.adapter || "UNKNOWN";
    const result = this.intake.ingest("WEBHOOK", {
      organization: envelope.actor?.organization || envelope.payload?.organization || null,
      description: envelope.payload.text,
      contact: { name: envelope.actor?.displayName || null },
      kind: "BUSINESS_EVENT"
    }, { source: `INJECTION:${adapter}`, authenticated: false });
    const receipt = {
      scopedKey: key,
      idempotencyKey: envelope.idempotencyKey,
      eventId: envelope.eventId,
      correlationId: envelope.correlationId,
      adapter,
      sourceType: envelope.sourceType,
      executionMode: envelope.executionMode,
      tenantScope: envelope.tenantScope,
      caseId: result?.case?.id || null,
      intakeId: result?.intake?.intakeId || null,
      actor: String(actor).slice(0, 120),
      at: nowIso()
    };
    this.receipts.set(key, receipt);
    this._persist();
    this._audit("EVENT_MAPPED_TO_CASE", {
      eventId: envelope.eventId,
      caseId: receipt.caseId,
      adapter,
      sourceType: envelope.sourceType,
      executionMode: envelope.executionMode,
      tenantScope: envelope.tenantScope
    });
    try {
      this.eventBus?.publish?.("injection.case.mapped", { eventId: envelope.eventId, caseId: receipt.caseId });
    } catch {}
    return { duplicate: false, caseId: receipt.caseId, intakeId: receipt.intakeId, receipt: { ...receipt } };
  }

  receiptFor(idempotencyKey, { tenantScope = "default" } = {}) {
    const key = `${String(tenantScope || "default")}::${String(idempotencyKey || "")}`;
    const receipt = this.receipts.get(key);
    return receipt ? { ...receipt } : null;
  }
}

export default InjectionToCaseMapper;
