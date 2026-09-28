/**
 * ADE ORGANIZATION-UNIT REGISTRY (Community/MVP additive).
 *
 * First-class operational contexts: ORGANIZATION -> BRANCH -> DEPARTMENT ->
 * TEAM. Tenant-scoped, hierarchical (parent links), durable over the existing
 * store abstraction. Workforce, customers, tasks, transactions and cases
 * reference unit ids; nothing here duplicates identity or case systems.
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

export const UNIT_TYPES = Object.freeze(["ORGANIZATION", "BRANCH", "DEPARTMENT", "TEAM"]);
const SECTION = "orgUnits";

export class OrgUnitRegistry {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.units = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) if (r?.unitId) this.units.set(`${r.tenantScope}::${r.unitId}`, r);
    } catch {}
  }
  _persist() {
    try { this.store?.writeSection?.(SECTION, Object.fromEntries(this.units)); } catch {}
  }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "ORG_UNITS", action, at: nowIso(), ...fields }); } catch {}
  }

  create({ type = "BRANCH", name = "", parentId = null, tenantScope = "default", actor = "SYSTEM", metadata = {} } = {}) {
    const t = String(type).toUpperCase();
    if (!UNIT_TYPES.includes(t)) throw fail("ORG_UNIT_TYPE_INVALID", type);
    const label = str(name, 200);
    if (!label) throw fail("ORG_UNIT_NAME_REQUIRED");
    const scope = String(tenantScope || "default").slice(0, 80);
    if (parentId) {
      const parent = this.units.get(`${scope}::${parentId}`);
      if (!parent) throw fail("ORG_PARENT_NOT_FOUND", parentId);
      const order = { ORGANIZATION: 0, BRANCH: 1, DEPARTMENT: 2, TEAM: 3 };
      if (order[t] <= order[parent.type]) throw fail("ORG_HIERARCHY_VIOLATION", `${t} cannot sit under ${parent.type}`);
    } else if (t !== "ORGANIZATION") {
      throw fail("ORG_PARENT_REQUIRED", `${t} requires a parent unit`);
    }
    const unitId = `unit-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`;
    const rec = {
      unitId, type: t, name: label, parentId: parentId || null, tenantScope: scope,
      status: "ACTIVE", metadata: metadata && typeof metadata === "object" ? metadata : {},
      createdBy: String(actor).slice(0, 120), createdAt: nowIso(), updatedAt: nowIso()
    };
    this.units.set(`${scope}::${unitId}`, rec);
    this._persist();
    this._audit("ORG_UNIT_CREATED", { unitId, type: t, tenantScope: scope, actor: rec.createdBy });
    return { ...rec };
  }

  get(unitId, { tenantScope = "default" } = {}) {
    const r = this.units.get(`${tenantScope}::${unitId}`);
    if (!r) return null;
    assertTenantVisible(r.tenantScope, tenantScope);
    return { ...r };
  }

  list({ tenantScope = null, type = null, parentId = undefined, includeInactive = false } = {}) {
    const out = [];
    for (const r of this.units.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      if (type && r.type !== String(type).toUpperCase()) continue;
      if (parentId !== undefined && r.parentId !== parentId) continue;
      if (!includeInactive && r.status !== "ACTIVE") continue;
      out.push({ ...r });
    }
    return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  /** Full ancestry chain for a unit (organization context resolution). */
  ancestry(unitId, { tenantScope = "default" } = {}) {
    const chain = [];
    let cur = this.get(unitId, { tenantScope });
    let guard = 0;
    while (cur && guard++ < 10) {
      chain.unshift({ unitId: cur.unitId, type: cur.type, name: cur.name });
      cur = cur.parentId ? this.get(cur.parentId, { tenantScope }) : null;
    }
    return chain;
  }

  setStatus(unitId, to, { tenantScope = "default", actor = "SYSTEM", reason = "" } = {}) {
    const key = `${tenantScope}::${unitId}`;
    const r = this.units.get(key);
    if (!r) throw fail("ORG_UNIT_NOT_FOUND", unitId);
    if (!["ACTIVE", "SUSPENDED"].includes(to)) throw fail("ORG_STATUS_INVALID", to);
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    const from = r.status;
    r.status = to;
    r.updatedAt = nowIso();
    this._persist();
    this._audit("ORG_UNIT_STATUS", { unitId, from, to, tenantScope, actor: String(actor).slice(0, 120) });
    return { ...r };
  }

  count({ tenantScope = "default" } = {}) {
    return this.list({ tenantScope }).length;
  }
}

export default OrgUnitRegistry;
