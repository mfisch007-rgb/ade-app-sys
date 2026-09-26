/**
 * ADE PROVIDER GATE (Batch 8B + 8C)
 *
 * Truthful lifecycle for ONE external provider seam:
 * NOT_CONFIGURED → CONFIGURED → VERIFIED → ENABLED ⇄ SUSPENDED
 * (VERIFICATION_FAILED loops back to CONFIGURED.)
 *
 * - Verification reuses ConnectionManager.test() — a SYNTACTIC shape check
 *   (URL parse). It proves readiness, never liveness. No network is ever
 *   opened by this gate.
 * - Secret VALUES are never accepted or stored: only requirement names,
 *   presence flags, and non-secret shape (baseUrl host) travel here.
 * - Enablement requires VERIFIED + L2 or higher + human identity + reason.
 *   Public callers (level < 2) are always blocked.
 * - SUSPENDED blocks ingestion. States persist in the existing store
 *   abstraction (section `providerGates`); every transition is audited.
 */

import {
  createProviderDescriptor,
  classifyProviderError,
  providerHealthSnapshot
} from "./ProviderAdapterContract.js";

const GATES_SECTION = "providerGates";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

export class ProviderGate {
  constructor({ store = null, eventBus = null, connectionManager = null, recordStore = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
    this.connectionManager = connectionManager;
    this.recordStore = recordStore;
    this.gates = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(GATES_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const g of rows) {
        if (g && g.scopedId) this.gates.set(g.scopedId, g);
      }
    } catch {}
  }

  _persist() {
    try {
      this.store?.writeSection?.(GATES_SECTION, Object.fromEntries(this.gates));
    } catch {}
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "PROVIDER_GATE", action, at: nowIso(), ...fields });
    } catch {}
  }

  /** Bond: enablement/suspension leaves decision-trail evidence in the
   *  canonical record store. Best-effort — the gate never fails on it. */
  _decisionLink({ gate, method, rationale, decidedBy, reason }) {
    try {
      if (!this.recordStore) return null;
      const intent = `PROVIDER_${String(gate.providerId || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 60)}`;
      let cap = null;
      try {
        cap = this.recordStore.register({
          intent, name: `${gate.providerId} provider seam`, sourceSystem: "PROVIDER_GATE",
          sourceVersion: gate.version || "0", tenantScope: gate.tenantScope,
          executionMode: "PROVIDER_GATED", providerRequirements: ["provider endpoint", "provider credential"],
          integrationMethod: "UNKNOWN", evidence: [`gate state ${gate.state}`], status: "MATCHED", owner: "OPERATOR"
        }, { actor: decidedBy, tenantScope: gate.tenantScope });
      } catch (e) {
        if (e?.code !== "CAPABILITY_RECORD_EXISTS") throw e;
        const found = this.recordStore.list({ tenantScope: gate.tenantScope }).find((r) => r.intent === intent);
        cap = found || null;
      }
      if (!cap) return null;
      const decision = this.recordStore.recordDecision({
        capabilityId: cap.capabilityId, method, rationale,
        requiredHumanAction: reason, tenantScope: gate.tenantScope
      }, { actor: decidedBy });
      return this.recordStore.authorizeDecision(decision.decisionId, { approved: method !== "KEEP_SEPARATE", decidedBy, reason });
    } catch {
      return null;
    }
  }

  scopedId(providerId, tenantScope) {
    return `${String(tenantScope || "default")}::${String(providerId || "")}`;
  }

  register(descriptorInput = {}, { actor = "SYSTEM", tenantScope = "default" } = {}) {
    const descriptor = createProviderDescriptor({ ...descriptorInput, tenantScope: descriptorInput.tenantScope || tenantScope });
    const id = this.scopedId(descriptor.providerId, descriptor.tenantScope);
    if (this.gates.has(id)) throw fail("PROVIDER_GATE_EXISTS", id);
    const gate = { ...descriptor, scopedId: id, lastCheckedAt: null, lastErrorClass: null, enabledBy: null, history: [] };
    this.gates.set(id, gate);
    this._persist();
    this._audit("PROVIDER_REGISTERED", { providerId: gate.providerId, tenantScope: gate.tenantScope, actor: String(actor).slice(0, 120) });
    return this._view(gate);
  }

  _view(gate) {
    const { history: _h, ...rest } = gate;
    return { ...rest, health: providerHealthSnapshot(gate) };
  }

  get(providerId, { tenantScope = "default" } = {}) {
    const gate = this.gates.get(this.scopedId(providerId, tenantScope));
    return gate ? this._view(gate) : null;
  }

  list({ tenantScope = null } = {}) {
    const out = [];
    for (const gate of this.gates.values()) {
      if (tenantScope && gate.tenantScope !== String(tenantScope) && gate.tenantScope !== "default") continue;
      out.push(this._view(gate));
    }
    return out.sort((a, b) => String(a.providerId).localeCompare(String(b.providerId)));
  }

  _transition(gate, to, { actor = "SYSTEM", reason = "", extra = {} } = {}) {
    gate.state = to;
    gate.updatedAt = nowIso();
    gate.history = [...(gate.history || []), { to, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-50);
    Object.assign(gate, extra);
    this._persist();
    return gate;
  }

  /**
   * Declare non-secret configuration shape. Credential VALUES are refused:
   * pass only requirement names + a presence boolean owned by a human.
   */
  configure(providerId, { baseUrl = null, credentialNames = [], credentialsProvided = false, actor = "SYSTEM", tenantScope = "default" } = {}) {
    const gate = this.gates.get(this.scopedId(providerId, tenantScope));
    if (!gate) throw fail("PROVIDER_GATE_NOT_FOUND", String(providerId));
    for (const [k, v] of Object.entries({ baseUrl, credentialNames })) {
      if (typeof v === "string" && /key=|token=|secret=|password=/i.test(v)) {
        throw fail("SECRET_VALUE_REFUSED", `${k} appears to carry a secret value; supply names/presence only.`);
      }
    }
    if (baseUrl !== null && baseUrl !== undefined) {
      gate.config = { ...(gate.config || {}), baseUrl: String(baseUrl).slice(0, 500) };
    }
    gate.configPresent = {
      baseUrl: Boolean(gate.config?.baseUrl),
      credentials: Boolean(credentialsProvided),
      credentialNames: Array.isArray(credentialNames) ? credentialNames.map((x) => String(x).slice(0, 120)) : []
    };
    this._transition(gate, gate.configPresent.baseUrl ? "CONFIGURED" : "NOT_CONFIGURED", { actor, reason: "configuration declared (shape only, no secrets)" });
    this._audit("PROVIDER_CONFIGURED", { providerId: gate.providerId, tenantScope: gate.tenantScope, state: gate.state });
    return this._view(gate);
  }

  /**
   * Verify readiness. Uses ONLY syntactic checks (ConnectionManager.test —
   * URL parse, no network) plus required-field presence. Proves readiness,
   * never liveness. An injected failing connectionManager proves the
   * VERIFICATION_FAILED path without any network.
   */
  async verify(providerId, { actor = "SYSTEM", tenantScope = "default", connectionManager = null, connectionId = null } = {}) {
    const gate = this.gates.get(this.scopedId(providerId, tenantScope));
    if (!gate) throw fail("PROVIDER_GATE_NOT_FOUND", String(providerId));
    const cm = connectionManager || this.connectionManager;
    gate.lastCheckedAt = nowIso();
    if (!gate.configPresent?.baseUrl) {
      gate.lastErrorClass = "CONFIG_MISSING";
      this._transition(gate, "NOT_CONFIGURED", { actor, reason: "baseUrl absent; nothing to verify" });
      this._audit("PROVIDER_VERIFY_SKIPPED", { providerId: gate.providerId, errorClass: "CONFIG_MISSING" });
      return this._view(gate);
    }
    try {
      let result = null;
      if (connectionId && cm && typeof cm.test === "function") {
        result = await cm.test(connectionId);
      } else {
        const u = new URL(gate.config.baseUrl);
        if (!["http:", "https:"].includes(u.protocol)) throw fail("CONFIG_MALFORMED", "Only HTTP(S) endpoints are supported.");
        result = { success: true, status: "READY", shapeOnly: true };
      }
      if (result && result.success) {
        gate.lastErrorClass = null;
        this._transition(gate, "VERIFIED", { actor, reason: "syntactic verification passed (readiness only, not liveness)" });
        this._audit("PROVIDER_VERIFIED", { providerId: gate.providerId, tenantScope: gate.tenantScope });
      } else {
        gate.lastErrorClass = classifyProviderError(result?.error || "verification failed");
        this._transition(gate, "VERIFICATION_FAILED", { actor, reason: String(result?.error || "verification failed").slice(0, 300) });
        this._audit("PROVIDER_VERIFY_FAILED", { providerId: gate.providerId, errorClass: gate.lastErrorClass });
      }
    } catch (e) {
      gate.lastErrorClass = classifyProviderError(e);
      const backTo = gate.state === "VERIFIED" || gate.state === "ENABLED" ? "CONFIGURED" : gate.state === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "VERIFICATION_FAILED";
      this._transition(gate, backTo === "ENABLED" ? "CONFIGURED" : backTo, { actor, reason: String(e.message || e).slice(0, 300) });
      this._audit("PROVIDER_VERIFY_FAILED", { providerId: gate.providerId, errorClass: gate.lastErrorClass });
    }
    return this._view(gate);
  }

  enable(providerId, { decidedBy = null, reason = "", level = 0, tenantScope = "default" } = {}) {
    const gate = this.gates.get(this.scopedId(providerId, tenantScope));
    if (!gate) throw fail("PROVIDER_GATE_NOT_FOUND", String(providerId));
    if (!Number.isFinite(Number(level)) || Number(level) < 2) throw fail("GATE_BLOCKED", "provider enablement requires L2 or higher.");
    if (!decidedBy || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    if (gate.state === "SUSPENDED") throw fail("GATE_BLOCKED", "suspended providers must re-verify before enablement.");
    if (gate.state !== "VERIFIED") throw fail("GATE_BLOCKED", `enablement requires VERIFIED state (current: ${gate.state}).`);
    this._transition(gate, "ENABLED", { actor: decidedBy, reason });
    gate.enabledBy = { decidedBy: String(decidedBy).slice(0, 120), level: Number(level), at: nowIso() };
    this._persist();
    this._audit("PROVIDER_ENABLED", { providerId: gate.providerId, tenantScope: gate.tenantScope, decidedBy: gate.enabledBy.decidedBy });
    this._decisionLink({ gate, method: "REGISTER", rationale: `Provider ${gate.providerId} enabled after syntactic verification; live traffic still requires a proven handshake.`, decidedBy, reason });
    return this._view(gate);
  }

  suspend(providerId, { decidedBy = null, reason = "", level = 0, tenantScope = "default" } = {}) {
    const gate = this.gates.get(this.scopedId(providerId, tenantScope));
    if (!gate) throw fail("PROVIDER_GATE_NOT_FOUND", String(providerId));
    if (!Number.isFinite(Number(level)) || Number(level) < 2) throw fail("GATE_BLOCKED", "suspension requires L2 or higher.");
    if (!decidedBy || !reason) throw fail("APPROVAL_IDENTITY_AND_REASON_REQUIRED");
    this._transition(gate, "SUSPENDED", { actor: decidedBy, reason });
    this._audit("PROVIDER_SUSPENDED", { providerId: gate.providerId, tenantScope: gate.tenantScope });
    this._decisionLink({ gate, method: "KEEP_SEPARATE", rationale: `Provider ${gate.providerId} suspended; ingestion blocked pending review.`, decidedBy, reason });
    return this._view(gate);
  }

  ingestionAllowed(providerId, { tenantScope = "default" } = {}) {
    const gate = this.gates.get(this.scopedId(providerId, tenantScope));
    return Boolean(gate && gate.state === "ENABLED");
  }
}

export default ProviderGate;
