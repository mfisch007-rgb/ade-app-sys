/**
 * ADE EXPERIENCE STORE (Community/MVP additive facade).
 *
 * Unifies the existing learning fragments — LearningLoop loops, learning
 * candidates, feedback intelligence, finance investigation resolutions —
 * into queryable SITUATION -> ACTION -> RESULT -> OUTCOME -> LESSON ->
 * CONFIDENCE -> REUSE-CONDITIONS records. Tenant-scoped; no cross-tenant
 * exposure. This facade REUSES the existing stores (no replacement, no
 * second learning system) and bridges resolved experience into the
 * Knowledge Engine where a knowledge instance is provided.
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

const SECTION = "experienceRecords";

export class ExperienceStore {
  constructor({ store = null, eventBus = null, learningLoop = null, knowledge = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.learningLoop = learningLoop || null;
    this.knowledge = knowledge || null;
    this.records = new Map();
    this._hydrate();
    this._subscribe();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) if (r?.experienceId) this.records.set(`${r.tenantScope}::${r.experienceId}`, r);
    } catch {}
  }
  _persist() {
    try { this.store?.writeSection?.(SECTION, Object.fromEntries(this.records)); } catch {}
  }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "EXPERIENCE", action, at: nowIso(), ...fields }); } catch {}
  }

  _subscribe() {
    // Ingest finance investigation resolutions as experience (best-effort).
    try {
      this.eventBus?.subscribe?.("finance.investigation.resolved", (payload) => {
        try {
          this.record({
            situation: `Investigation ${payload.investigationId} (${payload.riskBand || "signal"})`,
            action: "Human-reviewed investigation workflow",
            result: `Outcome ${payload.outcome} with ${payload.evidenceCount ?? 0} evidence items`,
            outcome: payload.outcome, lesson: `Signal set [${(payload.signals || []).join(", ")}] resolved as ${payload.outcome}`,
            confidence: payload.outcome === "FALSE_POSITIVE" ? 0.4 : 0.7,
            reuseConditions: "similar signal set on same provider",
            capabilityKey: "FINANCIAL_INVESTIGATION",
            tenantScope: payload.tenantScope || "default",
            source: "FINANCE_RESOLUTION", actor: "EXPERIENCE_STORE"
          });
        } catch {}
      });
    } catch {}
  }

  record({ situation = "", action = "", result = "", outcome = "", lesson = "", confidence = 0.5, reuseConditions = "", capabilityKey = "GENERAL", tenantScope = "default", source = "MANUAL", actor = "SYSTEM" } = {}) {
    if (!str(situation, 2000) || !str(lesson, 2000)) throw fail("EXPERIENCE_CONTENT_REQUIRED", "situation and lesson are required");
    const scope = String(tenantScope || "default").slice(0, 80);
    const experienceId = `exp-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`;
    const rec = {
      experienceId,
      situation: str(situation, 2000), action: str(action, 2000), result: str(result, 2000),
      outcome: str(outcome, 200), lesson: str(lesson, 2000),
      confidence: Math.max(0, Math.min(1, Number(confidence ?? 0.5))),
      reuseConditions: str(reuseConditions, 1000),
      capabilityKey: String(capabilityKey).slice(0, 160),
      tenantScope: scope, source: str(source, 120) || "MANUAL",
      recordedBy: String(actor).slice(0, 120),
      createdAt: nowIso()
    };
    this.records.set(`${scope}::${experienceId}`, rec);
    this._persist();
    this._audit("EXPERIENCE_RECORDED", { experienceId, capabilityKey: rec.capabilityKey, tenantScope: scope });
    // Knowledge bridge: resolved experience becomes tenant-scoped knowledge (best-effort).
    try {
      this.knowledge?.ingest?.(`exp:${experienceId}`, `${rec.situation} Lesson: ${rec.lesson}`, {
        tenantScope: scope, kind: "EXPERIENCE", capabilityKey: rec.capabilityKey, confidence: rec.confidence
      });
    } catch {}
    try { this.eventBus?.publish?.("experience.recorded", { experienceId, capabilityKey: rec.capabilityKey, tenantScope: scope }); } catch {}
    return { ...rec };
  }

  /** Import a completed reusable LearningLoop loop as experience. */
  fromLearningLoop(loop, { actor = "SYSTEM" } = {}) {
    if (!loop || loop.reusable !== true) throw fail("EXPERIENCE_LOOP_NOT_REUSABLE");
    const stages = (loop.stages || []).map((s) => `${s.stage}: ${JSON.stringify(s.data).slice(0, 300)}`).join(" | ");
    return this.record({
      situation: `Capability ${loop.capabilityKey}: ${stages}`.slice(0, 2000),
      action: `Learning loop ${loop.loopId}`,
      result: String(loop.outcome || "completed").slice(0, 2000),
      outcome: loop.outcome || "COMPLETED",
      lesson: `Reusable pattern from ${loop.loopId}`,
      confidence: 0.6, reuseConditions: `capability ${loop.capabilityKey}`,
      capabilityKey: loop.capabilityKey, tenantScope: loop.tenantScope || "default",
      source: "LEARNING_LOOP", actor
    });
  }

  query({ tenantScope = null, capabilityKey = null, minConfidence = 0, limit = 100 } = {}) {
    const out = [];
    for (const r of this.records.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      if (capabilityKey && r.capabilityKey !== String(capabilityKey)) continue;
      if (Number(r.confidence) < Number(minConfidence)) continue;
      out.push({ ...r });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  count({ tenantScope = "default" } = {}) {
    return this.query({ tenantScope, limit: 100000 }).length;
  }
}

export default ExperienceStore;
