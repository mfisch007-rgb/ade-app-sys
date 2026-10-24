const RECEIPTS_SECTION = "awbuliInboundReceipts";
const MAX_RECEIPTS = 1000;

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function nowIso() {
  return new Date().toISOString();
}

export class AwbuliMessagingService {
  constructor({ numberRegistry = null, transports = null, pipeline = null, store = null, eventBus = null } = {}) {
    this.numberRegistry = numberRegistry;
    this.transports = transports;
    this.pipeline = pipeline;
    this.store = store;
    this.eventBus = eventBus;
    this.receipts = new Map();
    this.inflight = new Map();
    this._hydrate();
  }

  _hydrate() {
    try {
      const saved = this.store?.readSection?.(RECEIPTS_SECTION);
      const rows = Array.isArray(saved) ? saved : saved && typeof saved === "object" ? Object.values(saved) : [];
      for (const r of rows) {
        if (r?.scopedKey) this.receipts.set(r.scopedKey, r);
      }
    } catch {}
  }

  _persist() {
    try {
      const rows = [...this.receipts.values()].slice(-MAX_RECEIPTS);
      this.receipts = new Map(rows.map((r) => [r.scopedKey, r]));
      this.store?.writeSection?.(RECEIPTS_SECTION, Object.fromEntries(this.receipts));
    } catch {}
  }

  _audit(action, fields = {}) {
    try {
      this.eventBus?.publish?.("audit.log.created", { category: "AWBULI_ROUTING", action, at: nowIso(), ...fields });
    } catch {}
  }

  transportStatus({ tenantScope = "default" } = {}) {
    const resolved = this.transports?.resolve?.({ tenantScope, provider: "AWBULI" }) || {
      available: false,
      state: "TRANSPORT_UNAVAILABLE",
      reason: "NO_AUTHORIZED_TRANSPORT",
      missing: ["authorized first-party WhatsApp session or enabled transport adapter"]
    };
    if (!resolved.available) {
      return {
        state: resolved.state || "TRANSPORT_UNAVAILABLE",
        live: false,
        inbound: false,
        inboundWebhook: false,
        reason: resolved.reason || "NO_AUTHORIZED_TRANSPORT",
        missing: resolved.missing || ["authorized first-party WhatsApp session or enabled transport adapter"],
        transport: null,
        note: "No authorized WhatsApp transport is available. Registration is preserved; external API URL/key is optional and is not required when a first-party session is available."
      };
    }
    return {
      state: "ACTIVE",
      live: true,
      inbound: true,
      inboundWebhook: resolved.transport?.webhook === true,
      reason: null,
      missing: [],
      transport: resolved.transport,
      note: "Inbound business messages route through the registered authorized transport. No outbound delivery is claimed by this status."
    };
  }

  publicStatus({ tenantScope = "default" } = {}) {
    const status = this.transportStatus({ tenantScope });
    return {
      state: status.state,
      live: status.live === true,
      inbound: status.inbound === true,
      inboundWebhook: status.inboundWebhook === true,
      reason: status.reason || null,
      missing: Array.isArray(status.missing) ? [...status.missing] : [],
      note: status.note
    };
  }

  activate(numberId, { actor = "SYSTEM", reason = "" } = {}) {
    if (!this.numberRegistry?.get) throw fail("NUMBER_REGISTRY_UNAVAILABLE");
    const number = this.numberRegistry.get(numberId);
    if (!number) throw fail("NUMBER_NOT_FOUND", String(numberId));
    if (number.state === "DISABLED") throw fail("NUMBER_DISABLED");
    if (!["VERIFIED", "SUSPENDED", "ENABLED"].includes(number.state)) {
      throw fail("NUMBER_NOT_VERIFIED", `current state ${number.state}; verify metadata first.`);
    }
    if (!number.verification) throw fail("NUMBER_NOT_VERIFIED", "metadata verification evidence is required before activation.");
    const transport = this.transportStatus({ tenantScope: number.tenantScope });
    if (!transport.live) {
      const updated = this.numberRegistry.setActivation(number.id, {
        state: "BLOCKED",
        reason: "TRANSPORT_UNAVAILABLE",
        note: reason,
        missing: transport.missing,
        actor
      });
      this._audit("NUMBER_ACTIVATION_BLOCKED", { numberId: number.id, tenantScope: number.tenantScope, reason: "TRANSPORT_UNAVAILABLE" });
      return {
        success: false,
        status: "BLOCKED",
        error: "TRANSPORT_UNAVAILABLE",
        number: updated,
        transport,
        message: "Registration preserved. The number was not marked ACTIVE because no authorized WhatsApp transport is available."
      };
    }
    const updated = this.numberRegistry.setActivation(number.id, {
      state: "ACTIVE",
      transportId: transport.transport.id,
      actor,
      reason: "ACTIVATED_ON_AUTHORIZED_TRANSPORT",
      note: reason
    });
    this._audit("NUMBER_ACTIVATED", { numberId: number.id, tenantScope: number.tenantScope, transportId: transport.transport.id });
    return {
      success: true,
      status: "ACTIVE",
      number: updated,
      transport,
      message: "Number ACTIVE on the authorized transport. Inbound routing is enabled; no outbound delivery is claimed."
    };
  }

  _scopedKey(tenantScope, transportId, messageId) {
    return `${tenantScope}::${transportId}::${messageId}`;
  }

  _blocked(state, reason, extra = {}) {
    return {
      success: false,
      accepted: false,
      routed: false,
      state,
      reason,
      deliveryClaimed: false,
      outbound: "NOT_ATTEMPTED",
      ...extra
    };
  }

  async ingest({
    transportId = null,
    tenantScope = "default",
    from = null,
    to = null,
    text = "",
    messageId = null,
    senderName = null,
    organization = null,
    occurredAt = null
  } = {}) {
    const scope = String(tenantScope || "default");
    if (!transportId) return this._blocked("BLOCKED", "TRANSPORT_ID_REQUIRED");
    if (!from) return this._blocked("BLOCKED", "AWBULI_SENDER_REQUIRED");
    if (!to) return this._blocked("BLOCKED", "AWBULI_RECIPIENT_REQUIRED");
    if (!String(text || "").trim()) return this._blocked("BLOCKED", "AWBULI_MESSAGE_REQUIRED");

    const transport = this.transports?.getAuthorized?.(transportId, { tenantScope: scope });
    if (!transport?.available) {
      return this._blocked(
        transport?.state || "TRANSPORT_UNAVAILABLE",
        transport?.reason || "TRANSPORT_UNAVAILABLE"
      );
    }

    const number = this.numberRegistry?.findActiveByAddress?.(to, { tenantScope: scope }) || null;
    if (!number) return this._blocked("BLOCKED", "NUMBER_NOT_ACTIVE");
    if (number.activation?.transportId && number.activation.transportId !== String(transportId)) {
      return this._blocked("BLOCKED", "TRANSPORT_NUMBER_MISMATCH");
    }

    const messageKey = messageId ? String(messageId).slice(0, 200) : null;
    const scopedKey = messageKey ? this._scopedKey(scope, transportId, messageKey) : null;
    if (scopedKey) {
      const prior = this.receipts.get(scopedKey);
      if (prior) {
        this._audit("INBOUND_DUPLICATE_REPLAY_SAFE", { tenantScope: scope, transportId, messageId: messageKey, caseId: prior.caseId });
        return {
          success: true,
          accepted: true,
          routed: true,
          duplicate: true,
          state: "ROUTED",
          caseId: prior.caseId,
          eventId: prior.eventId,
          numberId: prior.numberId,
          deliveryClaimed: false,
          outbound: "NOT_ATTEMPTED"
        };
      }
    }

    if (!this.pipeline?.run) throw fail("AWBULI_PIPELINE_UNAVAILABLE");
    if (scopedKey && this.inflight.has(scopedKey)) {
      const prior = await this.inflight.get(scopedKey);
      this._audit("INBOUND_DUPLICATE_REPLAY_SAFE", { tenantScope: scope, transportId, messageId: messageKey, caseId: prior.caseId, inflight: true });
      return { ...prior, duplicate: true };
    }

    const work = (async () => {
      const result = await this.pipeline.run({
        source: "AWBULI",
        input: {
          text: String(text),
          senderId: String(from).slice(0, 120),
          senderName: senderName ? String(senderName).slice(0, 200) : null,
          organization: organization ? String(organization).slice(0, 200) : null,
          transportId: String(transportId),
          messageId: messageKey,
          idempotencyKey: messageKey ? `awbuli:${transportId}:${messageKey}` : null,
          occurredAt
        },
        tenantScope: scope,
        actor: `awbuli:${String(transportId).slice(0, 80)}`,
        purpose: "AWBULI_INBOUND"
      });

      const receipt = {
        scopedKey: scopedKey || `awbuli:${transportId}:${result.eventId}`,
        tenantScope: scope,
        transportId: String(transportId),
        numberId: number.id,
        messageId: messageKey,
        caseId: result.caseId || null,
        eventId: result.eventId || null,
        status: "ROUTED",
        deliveryClaimed: false,
        at: nowIso()
      };
      this.receipts.set(receipt.scopedKey, receipt);
      this._persist();
      this._audit("INBOUND_ROUTED", { tenantScope: scope, transportId, numberId: number.id, caseId: receipt.caseId, eventId: receipt.eventId });
      return {
        success: true,
        accepted: true,
        routed: true,
        duplicate: false,
        state: "ROUTED",
        caseId: receipt.caseId,
        eventId: receipt.eventId,
        numberId: number.id,
        deliveryClaimed: false,
        outbound: "NOT_ATTEMPTED"
      };
    })();

    if (scopedKey) this.inflight.set(scopedKey, work);
    try {
      return await work;
    } finally {
      if (scopedKey) this.inflight.delete(scopedKey);
    }
  }
}

export default AwbuliMessagingService;
