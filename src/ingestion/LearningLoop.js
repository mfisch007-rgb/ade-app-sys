/**
 * ADE LEARNING LOOP (Batch 9E)
 *
 * Bounded, auditable execution-trace loop:
 * OBSERVE → EXTRACT → STRUCTURE → VALIDATE → DECIDE → EXECUTE →
 * EVALUATE → LEARN → STORE → REUSE
 *
 * Complements (never duplicates) LearningCandidates: candidates are human
 * approval objects; loop records are persisted stage traces with a reuse
 * query. Durable in the existing store abstraction (section `learningLoop`).
 */

export const LOOP_STAGES = Object.freeze([
  "OBSERVE",
  "EXTRACT",
  "STRUCTURE",
  "VALIDATE",
  "DECIDE",
  "EXECUTE",
  "EVALUATE",
  "LEARN",
  "STORE",
  "REUSE"
]);

const LOOPS_SECTION = "learningLoop";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

export class LearningLoop {
  constructor({ store = null, eventBus = null, maxLoops = 500 } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.maxLoops = Number.isFinite(Number(maxLoops)) ? Math.max(50, Number(maxLoops)) : 500;
    this.loops = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(LOOPS_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const l of rows) {
        if (l && l.loopId) this.loops.set(l.loopId, l);
      }
    } catch {}
  }

  _persist() {
    try {
      this.store?.writeSection?.(LOOPS_SECTION, Object.fromEntries(this.loops));
    } catch {}
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "LEARNING_LOOP", action, at: nowIso(), ...fields });
    } catch {}
  }

  startLoop({ capabilityKey = "GENERAL", tenantScope = "default", actor = "SYSTEM" } = {}) {
    const loopId = `LOOP-${Date.now().toString(36).toUpperCase()}-${String(this.loops.size + 1).padStart(3, "0")}`;
    const loop = {
      loopId,
      capabilityKey: String(capabilityKey).slice(0, 160),
      tenantScope: String(tenantScope || "default").slice(0, 80),
      stages: [],
      outcome: null,
      reusable: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.loops.set(loopId, loop);
    if (this.loops.size > this.maxLoops) {
      const oldest = [...this.loops.entries()].sort((a, b) => String(a[1].createdAt).localeCompare(String(b[1].createdAt)))[0];
      if (oldest) this.loops.delete(oldest[0]);
    }
    this._persist();
    this._audit("LOOP_STARTED", { loopId, capabilityKey: loop.capabilityKey, actor: String(actor).slice(0, 120) });
    return { ...loop };
  }

  recordStage(loopId, stage, data = {}) {
    const loop = this.loops.get(String(loopId || ""));
    if (!loop) throw fail("LOOP_NOT_FOUND", String(loopId));
    const upper = String(stage || "").toUpperCase();
    if (!LOOP_STAGES.includes(upper)) throw fail("LOOP_STAGE_INVALID", String(stage));
    const lastIdx = loop.stages.length ? LOOP_STAGES.indexOf(loop.stages[loop.stages.length - 1].stage) : -1;
    if (LOOP_STAGES.indexOf(upper) < lastIdx) throw fail("LOOP_STAGE_REGRESSION", `${loop.stages[loop.stages.length - 1].stage} -> ${upper}`);
    const entry = {
      stage: upper,
      data: data && typeof data === "object" ? data : { value: data },
      at: nowIso()
    };
    loop.stages.push(entry);
    loop.updatedAt = nowIso();
    this._persist();
    return { ...loop };
  }

  completeLoop(loopId, { outcome = "", reusable = false, actor = "SYSTEM" } = {}) {
    const loop = this.loops.get(String(loopId || ""));
    if (!loop) throw fail("LOOP_NOT_FOUND", String(loopId));
    loop.outcome = String(outcome).slice(0, 1000);
    loop.reusable = Boolean(reusable);
    loop.updatedAt = nowIso();
    this._persist();
    this._audit("LOOP_COMPLETED", { loopId, reusable: loop.reusable, actor: String(actor).slice(0, 120) });
    return { ...loop };
  }

  findReusable({ capabilityKey = null, tenantScope = "default" } = {}) {
    const scope = String(tenantScope || "default");
    return [...this.loops.values()]
      .filter((l) => l.reusable && (!capabilityKey || l.capabilityKey === String(capabilityKey)))
      .filter((l) => l.tenantScope === "default" || l.tenantScope === scope)
      .map((l) => ({ ...l }))
      .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
  }

  get(loopId) {
    const loop = this.loops.get(String(loopId || ""));
    return loop ? { ...loop } : null;
  }
}

export default LearningLoop;
