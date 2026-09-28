/**
 * ADE AI WORKER / OPERATING AGENT REGISTRY (Community/MVP additive).
 *
 * Capability-bound digital actors. Binds a WorkforceManager agent identity
 * to: allowed capability intents, scope (tenant + units), execution limits,
 * confidence requirements and escalation path. Execution runs ONLY through
 * CapabilityRegistry handlers — agents never gain authority by being AI.
 * Every run is logged with actor identity, capability, authorization,
 * triggering event, correlation ID, timestamp, result and audit record.
 * Agents never silently impersonate humans: runs are tagged agent identity.
 */

import { nowIso } from "../capabilities/CapabilityRecord.js";
import { assertTenantVisible } from "../governance/DataGovernance.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}
function str(v, max = 300) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max).trim();
  return s || null;
}

const SECTION = "aiWorkerBindings";
const RUN_SECTION = "agentRuns";

export class AgentRegistry {
  constructor({ store = null, eventBus = null, workforce = null, capabilityRegistry = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.workforce = workforce || null;
    this.capabilityRegistry = capabilityRegistry || null;
    this.bindings = new Map();
    this.runs = [];
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) if (r?.agentId) this.bindings.set(`${r.tenantScope}::${r.agentId}`, r);
    } catch {}
    try {
      const runs = this.store?.readSection?.(RUN_SECTION);
      const rows = Array.isArray(runs) ? runs : runs && typeof runs === "object" ? Object.values(runs) : [];
      this.runs = rows.filter((r) => r?.runId).slice(-500);
    } catch {}
  }
  _persist() {
    try { this.store?.writeSection?.(SECTION, Object.fromEntries(this.bindings)); } catch {}
    try {
      const obj = {};
      for (const r of this.runs.slice(-500)) obj[`${r.tenantScope}::${r.runId}`] = r;
      this.store?.writeSection?.(RUN_SECTION, obj);
    } catch {}
  }
  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "AI_WORKERS", action, at: nowIso(), ...fields }); } catch {}
  }

  /** Bind an existing workforce agent identity to capabilities + scope. */
  async bind({ agentId = "", capabilities = [], tenantScope = "default", unitIds = [], maxRunsPerDay = 100, minConfidence = 0.5, escalation = null, actor = "SYSTEM" } = {}) {
    if (!agentId) throw fail("AGENT_ID_REQUIRED");
    const scope = String(tenantScope || "default").slice(0, 80);
    // Identity must pre-exist in the workforce system (no shadow identities).
    let identity = null;
    try {
      const agents = await this.workforce?.listAgents?.();
      identity = (agents || []).find((a) => String(a.id) === String(agentId)) || null;
    } catch {}
    if (!identity && this.workforce) throw fail("AGENT_IDENTITY_NOT_FOUND", agentId);
    if (identity && identity.status !== "ACTIVE") throw fail("AGENT_IDENTITY_SUSPENDED", agentId);
    const caps = [...new Set((capabilities || []).map((c) => String(c).toUpperCase().slice(0, 80)))].slice(0, 30);
    if (!caps.length) throw fail("AGENT_CAPABILITIES_REQUIRED");
    // Capabilities must exist in the registry (no invented authority).
    if (this.capabilityRegistry?.getCapability) {
      for (const c of caps) {
        const found = this.capabilityRegistry.getCapability(c) || this.capabilityRegistry.getCapability?.(c.toLowerCase?.());
        if (!found && this.capabilityRegistry.listCapabilities) {
          const all = this.capabilityRegistry.listCapabilities() || [];
          const ok = all.some((x) => String(x.intent || x.id || "").toUpperCase() === c);
          if (!ok) throw fail("AGENT_CAPABILITY_UNKNOWN", c);
        }
      }
    }
    const rec = {
      agentId: String(agentId), name: identity?.name || String(agentId),
      capabilities: caps, tenantScope: scope,
      unitIds: (unitIds || []).map((u) => String(u).slice(0, 80)).slice(0, 50),
      maxRunsPerDay: Math.max(1, Math.min(10000, Number(maxRunsPerDay) || 100)),
      minConfidence: Math.max(0, Math.min(1, Number(minConfidence ?? 0.5))),
      escalation: escalation ? { to: str(escalation.to, 120), on: str(escalation.on, 200) } : null,
      status: "ACTIVE", boundBy: String(actor).slice(0, 120),
      boundAt: nowIso(), updatedAt: nowIso()
    };
    this.bindings.set(`${scope}::${agentId}`, rec);
    this._persist();
    this._audit("AGENT_BOUND", { agentId, tenantScope: scope, capabilities: caps.join(",") });
    return { ...rec };
  }

  get(agentId, { tenantScope = "default" } = {}) {
    const r = this.bindings.get(`${tenantScope}::${agentId}`);
    if (!r) return null;
    assertTenantVisible(r.tenantScope, tenantScope);
    return { ...r };
  }

  list({ tenantScope = null } = {}) {
    const out = [];
    for (const r of this.bindings.values()) {
      if (tenantScope && r.tenantScope !== String(tenantScope) && r.tenantScope !== "default") continue;
      out.push({ ...r });
    }
    return out;
  }

  setStatus(agentId, to, { tenantScope = "default", actor = "SYSTEM", reason = "" } = {}) {
    const key = `${tenantScope}::${agentId}`;
    const r = this.bindings.get(key);
    if (!r) throw fail("AGENT_BINDING_NOT_FOUND", agentId);
    if (!["ACTIVE", "SUSPENDED"].includes(to)) throw fail("AGENT_STATUS_INVALID", to);
    if (!actor || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    r.status = to;
    r.updatedAt = nowIso();
    this._persist();
    this._audit("AGENT_STATUS", { agentId, to, tenantScope });
    return { ...r };
  }

  _runsToday(agentId, tenantScope) {
    const day = nowIso().slice(0, 10);
    return this.runs.filter((r) => r.agentId === agentId && r.tenantScope === tenantScope && String(r.startedAt || r.completedAt || "").slice(0, 10) === day).length;
  }

  /** Execute one capability as the agent. Authorization-bound, fully logged. */
  async run({ agentId = "", capability = "", input = {}, tenantScope = "default", actor = "SYSTEM", triggeringEvent = null, correlationId = null, confidence = null } = {}) {
    const scope = String(tenantScope || "default");
    const binding = this.bindings.get(`${scope}::${agentId}`);
    if (!binding) throw fail("AGENT_BINDING_NOT_FOUND", agentId);
    if (binding.status !== "ACTIVE") throw fail("AGENT_SUSPENDED", agentId);
    const intent = String(capability).toUpperCase();
    if (!binding.capabilities.includes(intent)) throw fail("AGENT_CAPABILITY_DENIED", `${agentId} may not run ${intent}`);
    if (this._runsToday(agentId, scope) >= binding.maxRunsPerDay) throw fail("AGENT_RUN_LIMIT", `${binding.maxRunsPerDay}/day`);
    if (confidence !== null && Number(confidence) < binding.minConfidence) {
      throw fail("AGENT_CONFIDENCE_GATE", `confidence ${confidence} below ${binding.minConfidence}; escalate to ${binding.escalation?.to || "human"}`);
    }
    if (!this.capabilityRegistry) throw fail("AGENT_NO_REGISTRY", "capability registry unavailable");
    const startedAt = nowIso();
    let result = null;
    let handler = null;
    try {
      handler = this.capabilityRegistry.getCapability?.(intent) || null;
    } catch {}
    const exec = handler?.handler || handler?.execute;
    if (typeof exec !== "function") throw fail("AGENT_HANDLER_MISSING", intent);
    try {
      result = await exec({ ...input, _agent: { id: agentId, tenantScope: scope } });
    } catch (e) {
      result = { success: false, error: e.message || String(e) };
    }
    const run = {
      runId: `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`,
      agentId, agentName: binding.name, capability: intent,
      authorization: { boundCapabilities: binding.capabilities, tenantScope: scope, by: binding.boundBy },
      triggeringEvent: triggeringEvent || null, correlationId: correlationId || null,
      input: typeof input === "object" ? input : { value: input },
      result, success: result?.success !== false,
      startedAt, completedAt: nowIso(), tenantScope: scope,
      requestedBy: String(actor).slice(0, 120)
    };
    this.runs.push(run);
    this._persist();
    try { this.workforce?.markAgentUsed?.(agentId); } catch {}
    this._audit("AGENT_RUN", { runId: run.runId, agentId, capability: intent, success: run.success, tenantScope: scope });
    try { this.eventBus?.publish?.("agent.run.completed", { runId: run.runId, agentId, capability: intent, success: run.success, tenantScope: scope }); } catch {}
    return { ...run, input: undefined };
  }

  runsFor(agentId, { tenantScope = "default", limit = 100 } = {}) {
    return this.runs
      .filter((r) => r.agentId === String(agentId) && (r.tenantScope === String(tenantScope) || r.tenantScope === "default"))
      .slice(-limit).map((r) => ({ ...r }));
  }
}

export default AgentRegistry;
