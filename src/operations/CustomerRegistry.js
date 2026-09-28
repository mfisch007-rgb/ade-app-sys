/**
 * ADE CUSTOMER / LEAD REGISTRY (Community/MVP additive).
 *
 * Customers and leads participate in operational flows:
 * LEAD -> CONTACT -> QUALIFIED -> CASE -> SERVICE -> FOLLOW_UP -> RETAINED
 * (or LOST). Tenant-scoped, deduplicated by contact key, linkable to intake
 * cases and PROCARTA evidence. Not a CRM replacement — the operational
 * participation record. No cross-tenant visibility.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { assertTenantVisible } from "../governance/DataGovernance.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}
function str(v, max = 200) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

export const CUSTOMER_STATES = Object.freeze([
  "LEAD", "CONTACT", "QUALIFIED", "CASE", "SERVICE", "FOLLOW_UP", "RETAINED", "LOST"
]);

const TRANSITIONS = Object.freeze({
  LEAD: ["CONTACT", "LOST"],
  CONTACT: ["QUALIFIED", "LOST", "LEAD"],
  QUALIFIED: ["CASE", "LOST", "CONTACT"],
  CASE: ["SERVICE", "FOLLOW_UP", "LOST"],
  SERVICE: ["FOLLOW_UP", "RETAINED", "CASE"],
  FOLLOW_UP: ["RETAINED", "SERVICE", "CASE", "LOST"],
  RETAINED: ["SERVICE", "FOLLOW_UP"],
  LOST: ["LEAD"]
});

const SECTION = "customers";

export class CustomerRegistry {
  constructor({ store = null, eventBus = null, intake = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.intake = intake || null;
    this.customers = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) if (r?.customerId) this.customers.set(`${r.tenantScope}::${r.customerId}`, r);
    } catch {}
  }
  _persist() {
    try { this.store?.writeSection?.(SECTION, Object.fromEntries(this.customers)); } catch {}
  }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "CUSTOMERS", action, at: nowIso(), ...fields }); } catch {}
  }

  _contactKey({ name, phone, email }) {
    const p = String(phone || "").replace(/\D/g, "");
    const e = String(email || "").toLowerCase().trim();
    const n = String(name || "").toLowerCase().trim();
    return [p || "-", e || "-", n || "-"].join("|");
  }

  register({ name = "", phone = null, email = null, organization = null, unitId = null, source = "MANUAL", tenantScope = "default", actor = "SYSTEM" } = {}) {
    const label = str(name, 200);
    if (!label) throw fail("CUSTOMER_NAME_REQUIRED");
    const scope = String(tenantScope || "default").slice(0, 80);
    const key = this._contactKey({ name: label, phone, email });
    for (const c of this.customers.values()) {
      if (c.tenantScope === scope && c.contactKey === key) {
        return { ...c, duplicate: true };
      }
    }
    const customerId = `cus-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`;
    const rec = {
      customerId, name: label,
      phone: phone ? String(phone).slice(0, 40) : null,
      email: email ? String(email).slice(0, 200) : null,
      organization: str(organization, 200), unitId: unitId ? String(unitId).slice(0, 80) : null,
      source: str(source, 80) || "MANUAL", contactKey: key,
      state: "LEAD", caseIds: [], tenantScope: scope,
      history: [{ to: "LEAD", actor: String(actor).slice(0, 120), at: nowIso() }],
      createdAt: nowIso(), updatedAt: nowIso()
    };
    this.customers.set(`${scope}::${customerId}`, rec);
    this._persist();
    this._audit("CUSTOMER_REGISTERED", { customerId, tenantScope: scope, actor: rec.history[0].actor });
    try { this.eventBus?.publish?.("customer.registered", { customerId, tenantScope: scope }); } catch {}
    return { ...rec };
  }

  get(customerId, { tenantScope = "default" } = {}) {
    const r = this.customers.get(`${tenantScope}::${customerId}`);
    if (!r) return null;
    assertTenantVisible(r.tenantScope, tenantScope);
    return { ...r };
  }

  list({ tenantScope = null, state = null, limit = 200 } = {}) {
    const out = [];
    for (const r of this.customers.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      if (state && r.state !== String(state).toUpperCase()) continue;
      const { contactKey: _k, ...safe } = r;
      out.push(safe);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  transition(customerId, to, { tenantScope = "default", actor = "SYSTEM", reason = "", openCase = true } = {}) {
    const key = `${tenantScope}::${customerId}`;
    const r = this.customers.get(key);
    if (!r) throw fail("CUSTOMER_NOT_FOUND", customerId);
    const target = String(to || "").toUpperCase();
    if (!CUSTOMER_STATES.includes(target)) throw fail("CUSTOMER_STATE_INVALID", to);
    if (!(TRANSITIONS[r.state] || []).includes(target)) throw fail("CUSTOMER_TRANSITION_FORBIDDEN", `${r.state} -> ${target}`);
    if (!actor) throw fail("CUSTOMER_ACTOR_REQUIRED");
    const from = r.state;
    r.state = target;
    r.updatedAt = nowIso();
    r.history = [...(r.history || []), { from, to: target, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-50);
    // CASE state opens a canonical intake case (best-effort link, never a second case system).
    if (target === "CASE" && (openCase || openCase === undefined) && this.intake?.ingest) {
      try {
        const c = this.intake.ingest("API", {
          organization: r.organization, description: `Customer case for ${r.name}.`,
          contact: { name: r.name, phone: r.phone, email: r.email }, kind: "CUSTOMER_CASE"
        }, { source: "CUSTOMER_REGISTRY", authenticated: true });
        if (c?.case?.id) r.caseIds = [...(r.caseIds || []), c.case.id];
      } catch {}
    }
    this._persist();
    this._audit("CUSTOMER_TRANSITION", { customerId, from, to: target, tenantScope });
    try { this.eventBus?.publish?.("customer.transitioned", { customerId, from, to: target, tenantScope }); } catch {}
    return { ...r };
  }

  count({ tenantScope = "default" } = {}) {
    return this.list({ tenantScope, limit: 100000 }).length;
  }
}

export default CustomerRegistry;
