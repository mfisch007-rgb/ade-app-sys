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

export class WhatsAppNumberRegistry {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
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

  _touch(n, to, { actor = "SYSTEM", reason = "" } = {}) {
    n.state = to;
    n.updatedAt = nowIso();
    n.history = [...(n.history || []), { to, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-50);
    this._persist();
    return n;
  }

  addNumber({ number = null, provider = "AWBULI", tenantScope = "default", purpose = "GENERAL", label = null, actor = "SYSTEM" } = {}) {
    if (!number) throw fail("NUMBER_REQUIRED");
    const e164 = normalizeE164(number);
    const scope = String(tenantScope || "default").slice(0, 80);
    const fp = fingerprint(e164, scope);
    for (const n of this.numbers.values()) {
      if (n.fingerprint === fp && n.state !== "DISABLED") throw fail("NUMBER_EXISTS", maskE164(e164));
    }
    const rec = {
      id: `WA-${Date.now().toString(36).toUpperCase()}-${fp.slice(3, 7).toUpperCase()}`,
      masked: maskE164(e164),
      fingerprint: fp,
      provider: String(provider || "AWBULI").slice(0, 80),
      tenantScope: scope,
      purpose: String(purpose || "GENERAL").slice(0, 120),
      label: label ? String(label).slice(0, 120) : null,
      isDefault: false,
      state: "UNVERIFIED",
      verification: null,
      lastActivityAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      history: [{ to: "UNVERIFIED", actor: String(actor).slice(0, 120), reason: "registered (metadata only, no live traffic)", at: nowIso() }]
    };
    this.numbers.set(rec.id, rec);
    this._persist();
    this._audit("NUMBER_ADDED", { id: rec.id, masked: rec.masked, tenantScope: scope });
    return { ...rec };
  }

  get(id) {
    const n = this.numbers.get(String(id || ""));
    return n ? { ...n } : null;
  }

  list({ tenantScope = null } = {}) {
    const out = [];
    for (const n of this.numbers.values()) {
      if (tenantScope && n.tenantScope !== String(tenantScope) && n.tenantScope !== "default") continue;
      const { fingerprint: _fp, ...safe } = n;
      out.push(safe);
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  editNumber(id, { label, purpose, tenantScope, actor = "SYSTEM" } = {}) {
    const n = this.numbers.get(String(id || ""));
    if (!n) throw fail("NUMBER_NOT_FOUND", String(id));
    if (label !== undefined) n.label = label ? String(label).slice(0, 120) : null;
    if (purpose !== undefined) n.purpose = String(purpose || "GENERAL").slice(0, 120);
    if (tenantScope !== undefined) n.tenantScope = String(tenantScope || "default").slice(0, 80);
    n.updatedAt = nowIso();
    this._persist();
    this._audit("NUMBER_EDITED", { id: n.id, masked: n.masked, actor: String(actor).slice(0, 120) });
    return { ...n };
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
    return { ...n };
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
    return { ...n };
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
    this._touch(n, next, { actor, reason });
    this._audit(`NUMBER_${next}`, { id: n.id, masked: n.masked });
    return { ...n };
  }
}

export default WhatsAppNumberRegistry;
