/**
 * ADE EXTERNAL CONNECTOR MODEL L6 (NEXT enablement — additive).
 *
 * Extensible connector model for ERP / CRM / accounting / inventory / HR /
 * logistics / support systems. No vendor is hard-coded as required: vendors
 * register into this model over the EXISTING ProviderGate + ConnectionManager
 * seam. Adding a vendor never requires a new core engine.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

const SYSTEM_CLASSES = Object.freeze(["ERP", "CRM", "ACCOUNTING", "INVENTORY", "HR", "LOGISTICS", "SUPPORT", "OTHER"]);

export class ExternalConnectorModel {
  constructor({ providerGate = null, connectionManager = null, eventBus = null } = {}) {
    this.providerGate = providerGate;
    this.connectionManager = connectionManager;
    this.eventBus = eventBus;
    this.vendors = new Map(); // vendorKey -> { vendor, systemClass, ... }
  }

  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "EXTERNAL_CONNECTOR", action, at: nowIso(), ...fields }); } catch {}
  }

  registerVendor({ vendor = "", systemClass = "OTHER", capabilities = [], tenantScope = "default", actor = "SYSTEM" } = {}) {
    const key = String(vendor || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 60);
    if (!key) throw fail("CONNECTOR_VENDOR_REQUIRED");
    const cls = String(systemClass || "OTHER").toUpperCase();
    if (!SYSTEM_CLASSES.includes(cls)) throw fail("CONNECTOR_CLASS_UNSUPPORTED", systemClass);
    if (this.vendors.has(`${tenantScope}::${key}`)) throw fail("CONNECTOR_VENDOR_EXISTS", vendor);
    const record = {
      vendor: key,
      label: String(vendor).slice(0, 120),
      systemClass: cls,
      capabilities: Array.isArray(capabilities) ? capabilities.map((c) => String(c).slice(0, 80)).slice(0, 30) : [],
      tenantScope: String(tenantScope || "default"),
      connectionId: null,
      state: "REGISTERED",
      registeredBy: String(actor).slice(0, 120),
      registeredAt: nowIso()
    };
    // Mirror into the canonical provider gate so verification/enablement reuse it.
    try {
      this.providerGate?.register?.(
        { providerId: `EXTERNAL_${key}`, tenantScope: record.tenantScope, version: "NEXT.1" },
        { actor, tenantScope: record.tenantScope }
      );
    } catch (e) { if (e?.code !== "PROVIDER_GATE_EXISTS") throw e; }
    this.vendors.set(`${record.tenantScope}::${key}`, record);
    this._audit("CONNECTOR_REGISTERED", { vendor: key, systemClass: cls, tenantScope: record.tenantScope });
    return { ...record };
  }

  attachConnection(vendor, connectionId, { tenantScope = "default" } = {}) {
    const key = String(vendor || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 60);
    const rec = this.vendors.get(`${tenantScope}::${key}`);
    if (!rec) throw fail("CONNECTOR_VENDOR_NOT_FOUND", vendor);
    const conn = this.connectionManager?.get?.(connectionId);
    if (!conn) throw fail("CONNECTOR_CONNECTION_NOT_FOUND", connectionId);
    rec.connectionId = connectionId;
    rec.state = "ATTACHED";
    this._audit("CONNECTOR_ATTACHED", { vendor: key, connectionId, tenantScope });
    return { ...rec };
  }

  status({ tenantScope = null } = {}) {
    const out = [];
    for (const rec of this.vendors.values()) {
      if (tenantScope && rec.tenantScope !== String(tenantScope) && rec.tenantScope !== "default") continue;
      let gate = null;
      try { gate = this.providerGate?.get?.(`EXTERNAL_${rec.vendor}`, { tenantScope: rec.tenantScope }) || null; } catch { gate = null; }
      out.push({ ...rec, providerState: gate?.state || "NOT_CONFIGURED", live: gate?.state === "ENABLED" });
    }
    return out.sort((a, b) => String(a.vendor).localeCompare(String(b.vendor)));
  }

  /** Canonical evidence normalization for external-system rows. */
  normalizeRow(vendor, row = {}, { tenantScope = "default" } = {}) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw fail("CONNECTOR_ROW_INVALID");
    const flat = {};
    for (const [k, v] of Object.entries(row).slice(0, 50)) {
      flat[String(k).slice(0, 120)] = typeof v === "string" ? v.slice(0, 2000) : v;
    }
    return {
      tenantScope: String(tenantScope || "default"),
      vendor: String(vendor).toUpperCase().slice(0, 60),
      data: flat,
      text: Object.entries(flat).slice(0, 12).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join("; ").slice(0, 2000)
    };
  }
}

export default ExternalConnectorModel;
