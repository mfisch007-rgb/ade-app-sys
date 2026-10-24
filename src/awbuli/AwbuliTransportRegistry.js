const LIVE_STATES = new Set(["CONNECTED", "READY", "OPEN", "LIVE", "ACTIVE"]);

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

function publicView(rec) {
  return {
    id: rec.id,
    provider: rec.provider,
    tenantScope: rec.tenantScope,
    kind: rec.kind,
    state: rec.state,
    authorized: rec.authorized === true,
    capabilities: [...(rec.capabilities || [])],
    webhook: rec.webhook === true,
    authorizationRef: rec.authorizationRef || null,
    registeredBy: rec.registeredBy,
    registeredAt: rec.registeredAt,
    lastSeenAt: rec.lastSeenAt
  };
}

export class AwbuliTransportRegistry {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.transports = new Map();
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "AWBULI_TRANSPORT", action, at: nowIso(), ...fields });
    } catch {}
  }

  register({
    id = null,
    provider = "AWBULI",
    tenantScope = "default",
    kind = "FIRST_PARTY",
    state = "CONNECTED",
    authorized = false,
    handle = null,
    capabilities = [],
    webhook = false,
    authorizationRef = null,
    actor = "SYSTEM"
  } = {}) {
    const transportId = String(id || "").trim().slice(0, 120);
    if (!transportId) throw fail("TRANSPORT_ID_REQUIRED");
    if (authorized !== true) throw fail("TRANSPORT_NOT_AUTHORIZED", "only an already-authorized transport may be registered.");
    if (!handle || (typeof handle !== "object" && typeof handle !== "function")) {
      throw fail("TRANSPORT_HANDLE_REQUIRED", "register an initialized transport handle; ADE does not read auth folders or create sessions.");
    }
    if (this.transports.has(transportId)) throw fail("TRANSPORT_EXISTS", transportId);
    const rec = {
      id: transportId,
      provider: String(provider || "AWBULI").toUpperCase().slice(0, 80),
      tenantScope: String(tenantScope || "default").slice(0, 80),
      kind: String(kind || "FIRST_PARTY").toUpperCase().slice(0, 80),
      state: String(state || "CONNECTED").toUpperCase(),
      authorized: true,
      handle,
      capabilities: Array.isArray(capabilities) ? capabilities.map((x) => String(x).slice(0, 120)).slice(0, 50) : [],
      webhook: webhook === true,
      authorizationRef: authorizationRef ? String(authorizationRef).slice(0, 200) : null,
      registeredBy: String(actor || "SYSTEM").slice(0, 120),
      registeredAt: nowIso(),
      lastSeenAt: nowIso()
    };
    this.transports.set(transportId, rec);
    this._audit("TRANSPORT_REGISTERED", { transportId, tenantScope: rec.tenantScope, kind: rec.kind, provider: rec.provider });
    return publicView(rec);
  }

  getAuthorized(transportId, { tenantScope = "default" } = {}) {
    const rec = this.transports.get(String(transportId || ""));
    if (!rec) return { available: false, state: "TRANSPORT_UNAVAILABLE", reason: "TRANSPORT_NOT_REGISTERED" };
    if (rec.tenantScope !== String(tenantScope || "default")) {
      return { available: false, state: "TRANSPORT_UNAVAILABLE", reason: "TRANSPORT_TENANT_MISMATCH" };
    }
    if (rec.authorized !== true || !LIVE_STATES.has(rec.state)) {
      return { available: false, state: "TRANSPORT_UNAVAILABLE", reason: `TRANSPORT_${rec.state || "UNAVAILABLE"}` };
    }
    rec.lastSeenAt = nowIso();
    return { available: true, state: rec.state, transport: publicView(rec) };
  }

  resolve({ tenantScope = "default", provider = "AWBULI" } = {}) {
    const scope = String(tenantScope || "default");
    const wanted = String(provider || "AWBULI").toUpperCase();
    const candidates = [...this.transports.values()].filter((rec) =>
      rec.tenantScope === scope
      && rec.provider === wanted
      && rec.authorized === true
      && LIVE_STATES.has(rec.state)
    );
    const rec = candidates[0] || null;
    if (!rec) {
      return {
        available: false,
        state: "TRANSPORT_UNAVAILABLE",
        reason: "NO_AUTHORIZED_TRANSPORT",
        missing: ["authorized first-party WhatsApp session or enabled transport adapter"]
      };
    }
    rec.lastSeenAt = nowIso();
    return { available: true, state: rec.state, transport: publicView(rec) };
  }

  list({ tenantScope = null } = {}) {
    const out = [];
    for (const rec of this.transports.values()) {
      if (tenantScope && rec.tenantScope !== String(tenantScope)) continue;
      out.push(publicView(rec));
    }
    return out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  markState(transportId, state, { actor = "SYSTEM", reason = "" } = {}) {
    const rec = this.transports.get(String(transportId || ""));
    if (!rec) throw fail("TRANSPORT_NOT_REGISTERED", String(transportId));
    rec.state = String(state || "").toUpperCase();
    rec.lastSeenAt = nowIso();
    this._audit("TRANSPORT_STATE_CHANGED", { transportId: rec.id, state: rec.state, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 300) });
    return publicView(rec);
  }

  unregister(transportId, { actor = "SYSTEM" } = {}) {
    const rec = this.transports.get(String(transportId || ""));
    if (!rec) return false;
    this.transports.delete(rec.id);
    this._audit("TRANSPORT_UNREGISTERED", { transportId: rec.id, actor: String(actor).slice(0, 120) });
    return true;
  }
}

export default AwbuliTransportRegistry;
