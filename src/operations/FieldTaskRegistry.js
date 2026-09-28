/**
 * ADE FIELD TASK REGISTRY (Community/MVP additive).
 *
 * Reusable operational primitives for work outside headquarters — visits,
 * tasks, deliveries, collections, sales, inspections, evidence capture —
 * assignable to HUMAN workforce members or capability-bound AI agents.
 * Lifecycle: OPEN -> CLAIMED -> IN_PROGRESS -> SUBMITTED -> VERIFIED ->
 * CLOSED (or CANCELLED). Outcomes become canonical events for knowledge /
 * PROCARTA / audit. Location is optional, purpose-flagged, privacy-aware;
 * never assumed.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { assertTenantVisible } from "../governance/DataGovernance.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}
function str(v, max = 2000) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

export const TASK_KINDS = Object.freeze([
  "VISIT", "TASK", "DELIVERY", "COLLECTION", "SALE", "INSPECTION", "EVIDENCE", "SUPPORT"
]);

export const TASK_STATES = Object.freeze([
  "OPEN", "CLAIMED", "IN_PROGRESS", "SUBMITTED", "VERIFIED", "CLOSED", "CANCELLED"
]);

const TRANSITIONS = Object.freeze({
  OPEN: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["IN_PROGRESS", "CANCELLED", "OPEN"],
  IN_PROGRESS: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["VERIFIED", "IN_PROGRESS"],
  VERIFIED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: ["OPEN"]
});

const SECTION = "fieldTasks";

export class FieldTaskRegistry {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.tasks = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) if (r?.taskId) this.tasks.set(`${r.tenantScope}::${r.taskId}`, r);
    } catch {}
  }
  _persist() {
    try { this.store?.writeSection?.(SECTION, Object.fromEntries(this.tasks)); } catch {}
  }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "FIELD_TASKS", action, at: nowIso(), ...fields }); } catch {}
  }

  create({ kind = "TASK", title = "", detail = null, unitId = null, customerId = null, assignee = null, dueAt = null, tenantScope = "default", actor = "SYSTEM", privacy = {} } = {}) {
    const k = String(kind).toUpperCase();
    if (!TASK_KINDS.includes(k)) throw fail("TASK_KIND_INVALID", kind);
    const label = str(title, 300);
    if (!label) throw fail("TASK_TITLE_REQUIRED");
    const scope = String(tenantScope || "default").slice(0, 80);
    let who = null;
    if (assignee) {
      const ak = String(assignee.kind || "").toUpperCase();
      if (!["HUMAN", "AI_AGENT"].includes(ak)) throw fail("TASK_ASSIGNEE_KIND_INVALID");
      if (!assignee.id) throw fail("TASK_ASSIGNEE_ID_REQUIRED");
      who = { kind: ak, id: String(assignee.id).slice(0, 120) };
    }
    const taskId = `tsk-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`;
    const rec = {
      taskId, kind: k, title: label, detail: str(detail, 5000),
      unitId: unitId ? String(unitId).slice(0, 80) : null,
      customerId: customerId ? String(customerId).slice(0, 80) : null,
      assignee: who, state: "OPEN", outcome: null,
      // Privacy-aware: location only when explicitly supplied with a purpose.
      location: privacy?.location && privacy?.purpose
        ? { label: str(privacy.location, 300), purpose: str(privacy.purpose, 200) }
        : null,
      dueAt: dueAt ? String(dueAt).slice(0, 60) : null,
      tenantScope: scope,
      history: [{ to: "OPEN", actor: String(actor).slice(0, 120), at: nowIso() }],
      createdAt: nowIso(), updatedAt: nowIso()
    };
    this.tasks.set(`${scope}::${taskId}`, rec);
    this._persist();
    this._audit("TASK_CREATED", { taskId, kind: k, tenantScope: scope });
    try { this.eventBus?.publish?.("field.task.created", { taskId, kind: k, tenantScope: scope }); } catch {}
    return { ...rec };
  }

  get(taskId, { tenantScope = "default" } = {}) {
    const r = this.tasks.get(`${tenantScope}::${taskId}`);
    if (!r) return null;
    assertTenantVisible(r.tenantScope, tenantScope);
    return { ...r };
  }

  list({ tenantScope = null, state = null, assigneeId = null, unitId = null, limit = 200 } = {}) {
    const out = [];
    for (const r of this.tasks.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      if (state && r.state !== String(state).toUpperCase()) continue;
      if (assigneeId && r.assignee?.id !== String(assigneeId)) continue;
      if (unitId && r.unitId !== String(unitId)) continue;
      out.push({ ...r });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  transition(taskId, to, { tenantScope = "default", actor = "SYSTEM", actorKind = "HUMAN", reason = "", outcome = null } = {}) {
    const key = `${tenantScope}::${taskId}`;
    const r = this.tasks.get(key);
    if (!r) throw fail("TASK_NOT_FOUND", taskId);
    const target = String(to || "").toUpperCase();
    if (!TASK_STATES.includes(target)) throw fail("TASK_STATE_INVALID", to);
    if (!(TRANSITIONS[r.state] || []).includes(target)) throw fail("TASK_TRANSITION_FORBIDDEN", `${r.state} -> ${target}`);
    if (!actor) throw fail("TASK_ACTOR_REQUIRED");
    // Assignee binding: CLAIMED sets the assignee when unassigned; afterwards
    // only the assignee (or a supervisor path with recorded reason) advances work.
    const claimId = String(actor);
    const ak = String(actorKind).toUpperCase() === "AI_AGENT" ? "AI_AGENT" : "HUMAN";
    if (target === "CLAIMED" && !r.assignee) {
      r.assignee = { kind: ak, id: claimId.slice(0, 120) };
    } else if (["CLAIMED", "IN_PROGRESS", "SUBMITTED"].includes(target) && r.assignee) {
      if (target === "CLAIMED") r.assignee = { kind: ak, id: claimId.slice(0, 120) };
      else if (r.assignee.id !== claimId && !reason) throw fail("TASK_NOT_ASSIGNEE", "only the assignee may advance this task without a recorded supervisor reason");
    }
    const from = r.state;
    r.state = target;
    r.updatedAt = nowIso();
    if (outcome && ["SUBMITTED", "VERIFIED", "CLOSED"].includes(target)) {
      r.outcome = {
        summary: str(outcome.summary, 2000), result: str(outcome.result, 200) || "REPORTED",
        evidence: Array.isArray(outcome.evidence) ? outcome.evidence.map((e) => String(e).slice(0, 500)).slice(0, 20) : [],
        customerEffect: str(outcome.customerEffect, 1000), at: nowIso()
      };
    }
    r.history = [...(r.history || []), { from, to: target, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-50);
    this._persist();
    this._audit("TASK_TRANSITION", { taskId, from, to: target, tenantScope });
    try {
      this.eventBus?.publish?.("field.task.transitioned", {
        taskId, kind: r.kind, from, to: target, tenantScope,
        assignee: r.assignee, customerId: r.customerId, unitId: r.unitId,
        outcome: r.outcome, actor: String(actor).slice(0, 120)
      });
    } catch {}
    return { ...r };
  }

  count({ tenantScope = "default" } = {}) {
    return this.list({ tenantScope, limit: 100000 }).length;
  }
}

export default FieldTaskRegistry;
