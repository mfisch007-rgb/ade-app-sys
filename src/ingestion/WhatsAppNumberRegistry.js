/**
 * ADE WHATSAPP NUMBER REGISTRY (Batch 12F)
 *
 * Easy human configuration for WhatsApp sender identities WITHOUT a live
 * provider: add / edit / soft-disable / verify-metadata / set-default /
 * tenant+purpose assignment / enable / suspend. Numbers are identifiers, not
 * secrets — but only MASKED form + fingerprint persist (minimal PII).
 * Removal is soft-disable (history preserved). Every mutation is audited.
 * Enablement still requires the provider gate path (L2+, verified bridge);
 * this registry alone never makes anything live.
 */

import crypto from "node:crypto";

const NUMBERS_SECTION = "whatsappNumbers";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeE164(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw fail("NUMBER_INVALID", "expected 7–15 digits (E.164-ish).");
  return `+${digits}`;
}

function maskE164(e164) {
  const d = e164.replace(/\D/g, "");
  if (d.length <= 4) return `+${"*".repeat(d.length)}`;
  return `+${d.slice(0, 3)}…${d.slice(-4)}`;
}

function fingerprint(e164, tenantScope) {
  try {
    return `fp-${crypto.createHash("sha256").update(`${tenantScope}::${e164}`).digest("hex").slice(0, 16)}`;
  } catch {
    return `fp-${e164.replace(/\D/g, "").slice(-8)}`;
  }
}

function globalFingerprint(e164) {
  try {
    return `gfp-${crypto.createHash("sha256").update(String(e164)).digest("hex").slice(0, 24)}`;
  } catch {
    return `gfp-${e164.replace(/\D/g, "").slice(-8)}`;
  }
}

export class WhatsAppNumberRegistry {
  constructor({ store = null, eventBus = null, orgUnits = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.orgUnits = orgUnits || null;
    this.numbers = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(NUMBERS_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const n of rows) {
        if (n && n.id) this.numbers.set(n.id, n);
      }
    } catch {}
  }

  _persist() {
    try {
      this.store?.writeSection?.(NUMBERS_SECTION, Object.fromEntries(this.numbers));
    } catch {}
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "WHATSAPP_NUMBERS", action, at: nowIso(), ...fields });
    } catch {}
  }

  // Response redaction (single authority, mirrors list()): the fingerprint
  // is an internal dedup key derived from the number — API responses carry
  // the masked form only, never the fingerprint.
  attachOrgUnits(orgUnits) {
    this.orgUnits = orgUnits || null;
    return this;
  }

  _safe(n) {
    if (!n || typeof n !== "object") return n;
    const { fingerprint: _fp, globalFingerprint: _gfp, ...safe } = n;
    return safe;
  }

  /** Resolve an organization/branch unit and its ancestry. Never crosses
   *  tenant boundaries. Optional: callers without org units keep working. */
  _resolveUnit(unitId, tenantScope) {
    if (!unitId) return null;
    if (!this.orgUnits || typeof this.orgUnits.get !== "function") {
      throw fail("ORG_UNIT_REGISTRY_UNAVAILABLE", "number assignment requires the organization-unit registry.");
    }
    const unit = this.orgUnits.get(String(unitId), { tenantScope: String(tenantScope || "default") });
    if (!unit) throw fail("ORG_UNIT_NOT_FOUND", String(unitId));
    if (unit.status && unit.status !== "ACTIVE") throw fail("ORG_UNIT_INACTIVE", String(unitId));
    let path = [];
    try { path = this.orgUnits.ancestry(unit.unitId, { tenantScope: unit.tenantScope }) || []; } catch {}
    const root = path[0] || null;
    return {
      unitId: unit.unitId,
      unitType: unit.type,
      unitPath: path.map((p) => `${p.type}:${p.name}`).slice(0, 10),
      organization: root?.name || null
    };
  }

  _conflict(globalFp, exceptId = null) {
    for (const n of this.numbers.values()) {
      if (n.id === exceptId) continue;
      if (n.globalFingerprint === globalFp && n.state !== "DISABLED") return n;
    }
    return null;
  }

  _touch(n, to, { actor = "SYSTEM", reason = "" } = {}) {
    n.state = to;
    n.updatedAt = nowIso();
    n.history = [...(n.history || []), { to, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-50);
    this._persist();
    return n;
  }

  addNumber({ number = null, provider = "AWBULI", tenantScope = "default", purpose = "GENERAL", label = null, unitId = null, organization = null, actor = "SYSTEM" } = {}) {
    if (!number) throw fail("NUMBER_REQUIRED");
    const e164 = normalizeE164(number);
    const scope = String(tenantScope || "default").slice(0, 80);
    const fp = fingerprint(e164, scope);
    for (const n of this.numbers.values()) {
      if (n.fingerprint === fp && n.state !== "DISABLED") throw fail("NUMBER_EXISTS", maskE164(e164));
    }
    const gfp = globalFingerprint(e164);
    if (this._conflict(gfp)) throw fail("NUMBER_ALREADY_REGISTERED", "this number is already an active sender identity on another tenant or record.");
    const unit = this._resolveUnit(unitId, scope);
    const rec = {
      id: `WA-${Date.now().toString(36).toUpperCase()}-${fp.slice(3, 7).toUpperCase()}`,
      masked: maskE164(e164),
      fingerprint: fp,
      globalFingerprint: gfp,
      provider: String(provider || "AWBULI").slice(0, 80),
      tenantScope: scope,
      purpose: String(purpose || "GENERAL").slice(0, 120),
      label: label ? String(label).slice(0, 120) : null,
      unitId: unit?.unitId || null,
      unitType: unit?.unitType || null,
      unitPath: unit?.unitPath || null,
      organization: organization ? String(organization).slice(0, 200) : (unit?.organization || null),
      isDefault: false,
      state: "UNVERIFIED",
      activation: null,
      verification: null,
      lastActivityAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      history: [{ to: "UNVERIFIED", actor: String(actor).slice(0, 120), reason: "registered (metadata only, no live traffic)", at: nowIso() }]
    };
    this.numbers.set(rec.id, rec);
    this._persist();
    this._audit("NUMBER_ADDED", { id: rec.id, masked: rec.masked, tenantScope: scope, unitId: rec.unitId || null });
    return this._safe({ ...rec });
  }

  get(id) {
    const n = this.numbers.get(String(id || ""));
    return n ? this._safe({ ...n }) : null;
  }

  list({ tenantScope = null } = {}) {
    const out = [];
    for (const n of this.numbers.values()) {
      if (tenantScope && n.tenantScope !== String(tenantScope) && n.tenantScope !== "default") continue;
      out.push(this._safe(n));
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  editNumber(id, { label, purpose, tenantScope, unitId, organization, actor = "SYSTEM" } = {}) {
    const n = this.numbers.get(String(id || ""));
    if (!n) throw fail("NUMBER_NOT_FOUND", String(id));
    if (label !== undefined) n.label = label ? String(label).slice(0, 120) : null;
    if (purpose !== undefined) n.purpose = String(purpose || "GENERAL").slice(0, 120);
    if (tenantScope !== undefined) {
      const nextScope = String(tenantScope || "default").slice(0, 80);
      if (nextScope !== n.tenantScope) {
        // The full number is never persisted, so its tenant-scoped
        // fingerprint cannot be recomputed safely. Moving a sender identity
        // across tenants therefore requires a fresh registration (and a
        // fresh verification) rather than silent reassignment.
        throw fail("NUMBER_TENANT_IMMUTABLE", "re-register the number for the target tenant; history stays with the original tenant.");
      }
    }
    if (unitId !== undefined) {
      const unit = this._resolveUnit(unitId, n.tenantScope);
      n.unitId = unit?.unitId || null;
      n.unitType = unit?.unitType || null;
      n.unitPath = unit?.unitPath || null;
      if (unit?.organization) n.organization = unit.organization;
    }
    if (organization !== undefined) n.organization = organization ? String(organization).slice(0, 200) : null;
    n.updatedAt = nowIso();
    this._persist();
    this._audit("NUMBER_EDITED", { id: n.id, masked: n.masked, actor: String(actor).slice(0, 120), unitId: n.unitId || null });
    return this._safe({ ...n });
  }

  /** Owner-facing aggregate for public/readiness surfaces. Counts only; no
   *  numbers, fingerprints or tenant records leak. */
  summary({ tenantScope = null } = {}) {
    const rows = this.list({ tenantScope });
    const states = {};
    for (const r of rows) states[r.state] = (states[r.state] || 0) + 1;
    return {
      total: rows.length,
      states,
      verified: (states.VERIFIED || 0) + (states.ENABLED || 0) + (states.SUSPENDED || 0),
      enabled: states.ENABLED || 0,
      active: rows.filter((r) => r.state === "ENABLED" && r.activation?.state === "ACTIVE").length,
      blocked: rows.filter((r) => r.activation?.state === "BLOCKED").length,
      defaultConfigured: rows.some((r) => r.isDefault === true),
      live: false
    };
  }

  /** Metadata verification only: records evidence of ownership checks performed
   *  out-of-band by a human. Asserts NOTHING live. */
  verifyNumber(id, { method = "HUMAN_ATTESTATION", evidenceRef = null, actor = "SYSTEM" } = {}) {
    const n = this.numbers.get(String(id || ""));
    if (!n) throw fail("NUMBER_NOT_FOUND", String(id));
    if (n.state === "DISABLED") throw fail("NUMBER_DISABLED");
    n.verification = { method: String(method).slice(0, 120), evidenceRef: evidenceRef ? String(evidenceRef).slice(0, 300) : null, by: String(actor).slice(0, 120), at: nowIso(), live: false };
    this._touch(n, "VERIFIED", { actor, reason: "metadata verification recorded (not a live handshake)" });
    this._audit("NUMBER_VERIFIED", { id: n.id, masked: n.masked });
    return this._safe({ ...n });
  }

  setDefault(id, { actor = "SYSTEM" } = {}) {
    const n = this.numbers.get(String(id || ""));
    if (!n) throw fail("NUMBER_NOT_FOUND", String(id));
    if (n.state === "DISABLED") throw fail("NUMBER_DISABLED");
    for (const o of this.numbers.values()) {
      if (o.tenantScope === n.tenantScope) o.isDefault = o.id === n.id;
    }
    n.updatedAt = nowIso();
    this._persist();
    this._audit("NUMBER_DEFAULT_SET", { id: n.id, tenantScope: n.tenantScope });
    return this._safe({ ...n });
  }

  setActivation(id, { state = null, transportId = null, reason = "", note = "", missing = [], actor = "SYSTEM" } = {}) {
    const n = this.numbers.get(String(id || ""));
    if (!n) throw fail("NUMBER_NOT_FOUND", String(id));
    const next = String(state || "").toUpperCase();
    if (!["ACTIVE", "BLOCKED"].includes(next)) throw fail("NUMBER_ACTIVATION_STATE_INVALID", String(state));
    if (next === "ACTIVE") {
      if (!transportId) throw fail("NUMBER_TRANSPORT_REQUIRED");
      if (n.state === "DISABLED") throw fail("NUMBER_DISABLED");
      if (!["VERIFIED", "SUSPENDED", "ENABLED"].includes(n.state)) throw fail("NUMBER_NOT_VERIFIED");
      if (!n.verification) throw fail("NUMBER_NOT_VERIFIED", "metadata verification evidence is required before activation.");
      n.activation = {
        state: "ACTIVE",
        transportId: String(transportId).slice(0, 120),
        reason: "AUTHORIZED_TRANSPORT_BOUND",
        note: note ? String(note).slice(0, 500) : (reason ? String(reason).slice(0, 500) : null),
        missing: [],
        actor: String(actor).slice(0, 120),
        at: nowIso()
      };
      this._touch(n, "ENABLED", { actor, reason: reason || `activated on authorized transport ${n.activation.transportId}` });
    } else {
      n.activation = {
        state: "BLOCKED",
        transportId: transportId ? String(transportId).slice(0, 120) : null,
        reason: String(reason || "TRANSPORT_UNAVAILABLE").slice(0, 120),
        note: note ? String(note).slice(0, 500) : null,
        missing: Array.isArray(missing) ? missing.map((m) => String(m).slice(0, 200)).slice(0, 20) : [],
        actor: String(actor).slice(0, 120),
        at: nowIso()
      };
      n.updatedAt = nowIso();
      this._persist();
    }
    this._audit(`NUMBER_ACTIVATION_${next}`, { id: n.id, masked: n.masked, transportId: n.activation.transportId, reason: n.activation.reason });
    return this._safe({ ...n });
  }

  findActiveByAddress(rawNumber, { tenantScope = "default" } = {}) {
    let e164;
    try {
      e164 = normalizeE164(rawNumber);
    } catch {
      return null;
    }
    const scope = String(tenantScope || "default").slice(0, 80);
    const fp = fingerprint(e164, scope);
    for (const n of this.numbers.values()) {
      if (n.tenantScope !== scope) continue;
      if (n.fingerprint !== fp) continue;
      if (n.state !== "ENABLED") continue;
      if (n.activation?.state !== "ACTIVE") continue;
      return this._safe({ ...n });
    }
    return null;
  }

  setState(id, to, { actor = "SYSTEM", reason = "", level = 0 } = {}) {
    const n = this.numbers.get(String(id || ""));
    if (!n) throw fail("NUMBER_NOT_FOUND", String(id));
    const next = String(to || "").toUpperCase();
    if (!["ENABLED", "SUSPENDED", "DISABLED"].includes(next)) throw fail("NUMBER_STATE_INVALID", String(to));
    if ((next === "ENABLED" || next === "SUSPENDED") && (!Number.isFinite(Number(level)) || Number(level) < 2)) {
      throw fail("NUMBER_AUTH_REQUIRED", "enable/suspend requires L2 or higher.");
    }
    if (!reason && next !== "DISABLED") throw fail("NUMBER_REASON_REQUIRED", "a reason is required.");
    if (next === "ENABLED" && n.state !== "VERIFIED" && n.state !== "SUSPENDED") {
      throw fail("NUMBER_NOT_VERIFIED", `current state ${n.state}; verify metadata first.`);
    }
    if (next === "DISABLED") n.isDefault = false;
    if ((next === "SUSPENDED" || next === "DISABLED") && n.activation) {
      n.activation = {
        ...n.activation,
        state: next,
        reason: `NUMBER_${next}`,
        actor: String(actor).slice(0, 120),
        at: nowIso()
      };
    }
    this._touch(n, next, { actor, reason });
    this._audit(`NUMBER_${next}`, { id: n.id, masked: n.masked });
    return this._safe({ ...n });
  }
}

export default WhatsAppNumberRegistry;
