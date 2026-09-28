/**
 * ADE WEBHOOK/API ADAPTER L5 (NEXT enablement — additive).
 *
 * One integration contract:
 *  INBOUND:  EXTERNAL -> AUTHENTICATE -> VALIDATE -> IDENTIFY TENANT
 *            -> NORMALIZE -> CANONICAL EVENT -> CAPABILITY
 *  OUTBOUND: ADE -> AUTHORIZATION -> TRANSFORM -> EXTERNAL ENDPOINT
 *            -> RESULT -> AUDIT
 *
 * Secrets live server-side in ConnectionManager; never reach the client.
 * Failures (timeout, bad signature, malformed payload, auth failure,
 * rate limit, unavailable endpoint) produce truthful, recoverable states.
 */

import crypto from "node:crypto";
import { nowIso } from "../capabilities/CapabilityRecord.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a || ""), "hex");
    const bb = Buffer.from(String(b || ""), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

export function verifyHmacSha256(rawBody, signatureHex, secret) {
  if (!secret) return false;
  if (!signatureHex) return false;
  try {
    const hex = crypto.createHmac("sha256", String(secret)).update(String(rawBody ?? "")).digest("hex");
    return timingSafeEqualHex(hex, String(signatureHex).replace(/^sha256=/i, ""));
  } catch { return false; }
}

export class WebhookApiAdapter {
  constructor({ connectionManager = null, secrets = null, eventBus = null, rateLimitPerMinute = 60 } = {}) {
    this.connectionManager = connectionManager;
    this.secrets = secrets;
    this.eventBus = eventBus;
    this.rateLimitPerMinute = Number(rateLimitPerMinute) > 0 ? Number(rateLimitPerMinute) : 60;
    this.hits = new Map(); // connectorId -> timestamps[]
    this.log = [];
  }

  _audit(action, fields = {}) {
    try { this.eventBus?.publish?.("audit.log.created", { category: "WEBHOOK_API", action, at: nowIso(), ...fields }); } catch {}
  }

  _checkRate(connectorId) {
    const now = Date.now();
    const windowStart = now - 60000;
    const arr = (this.hits.get(connectorId) || []).filter((t) => t > windowStart);
    arr.push(now);
    this.hits.set(connectorId, arr);
    return arr.length <= this.rateLimitPerMinute;
  }

  _resolveConnection(connectorId) {
    const rec = this.connectionManager?.get?.(connectorId);
    if (!rec) throw fail("CONNECTOR_NOT_FOUND", String(connectorId));
    return rec;
  }

  /**
   * Inbound normalization. `headers` + `rawBody` come from the HTTP layer.
   * Auth: HMAC header (x-ade-signature) when the connection declares
   * authType HMAC, else Bearer (Authorization) matching the stored secret.
   */
  inbound({ connectorId = null, tenantScope = "default", headers = {}, rawBody = "", body = null, eventType = "GENERAL_BUSINESS_EVENT" } = {}) {
    const scope = String(tenantScope || "default");
    if (!connectorId) throw fail("CONNECTOR_REQUIRED");
    if (!this._checkRate(connectorId)) {
      this._audit("WEBHOOK_RATE_LIMITED", { connectorId, tenantScope: scope });
      throw fail("WEBHOOK_RATE_LIMITED", "retry after 60s.");
    }
    const conn = this._resolveConnection(connectorId);
    const secret = this.secrets?.getSecret?.(`ADE_CONN_${conn.id}`) || null;
    const h = {};
    for (const [k, v] of Object.entries(headers || {})) h[String(k).toLowerCase()] = v;
    const authType = String(conn.authType || "API_KEY").toUpperCase();
    let authed = false;
    if (authType === "HMAC") {
      authed = verifyHmacSha256(rawBody, h["x-ade-signature"] || h["x-hub-signature-256"] || h["x-signature"], secret);
    } else if (authType === "NONE") {
      authed = true;
    } else {
      const presented = String(h.authorization || "").replace(/^bearer\s+/i, "");
      authed = Boolean(secret && presented && presented === String(secret));
    }
    if (!authed) {
      this._audit("WEBHOOK_AUTH_FAILED", { connectorId, tenantScope: scope });
      throw fail("WEBHOOK_AUTH_FAILED", "invalid signature or token.");
    }
    let payload = body;
    if (payload === null || payload === undefined) {
      try { payload = JSON.parse(String(rawBody || "{}")); }
      catch { throw fail("WEBHOOK_MALFORMED_PAYLOAD", "body is not valid JSON."); }
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw fail("WEBHOOK_MALFORMED_PAYLOAD", "object payload is required.");
    }
    const text = payload.text || payload.description || payload.message || JSON.stringify(payload).slice(0, 2000);
    const normalized = {
      eventType,
      source: `WEBHOOK:${conn.provider}`,
      sourceType: "WEB_API",
      tenantScope: payload.tenant || payload.tenantScope || scope,
      actor: { id: payload.actorId || null, displayName: payload.actorName || null, organization: payload.organization || null },
      payload: { text: String(text).slice(0, 5000), organization: payload.organization || null, entities: [] },
      metadata: { connectorId: conn.id, provider: conn.provider },
      correlationId: payload.correlationId || null
    };
    this._audit("WEBHOOK_RECEIVED", { connectorId, tenantScope: normalized.tenantScope, provider: conn.provider });
    try { this.eventBus?.publish?.("webhook.received", { connectorId, tenantScope: normalized.tenantScope }); } catch {}
    return normalized;
  }

  /**
   * Outbound delivery descriptor. This layer authorizes + transforms + audits;
   * the actual network call requires an explicitly ENABLED provider gate and
   * is performed by the caller transport. Without that, returns
   * TRANSPORT_REQUIRED (truthful, recoverable) — never a fake DELIVERED.
   */
  outbound({ connectorId = null, payload = {}, tenantScope = "default", actor = "SYSTEM", transportAllowed = false } = {}) {
    if (!connectorId) throw fail("CONNECTOR_REQUIRED");
    const conn = this._resolveConnection(connectorId);
    const transformed = {
      to: conn.baseUrl || null,
      provider: conn.provider,
      tenantScope: String(tenantScope || "default"),
      body: payload && typeof payload === "object" ? payload : { value: payload }
    };
    if (!conn.baseUrl) {
      this._audit("WEBHOOK_OUTBOUND_INCOMPLETE", { connectorId, tenantScope });
      return { success: false, status: "INCOMPLETE", error: "Connection has no baseUrl.", descriptor: transformed };
    }
    if (!transportAllowed) {
      this._audit("WEBHOOK_OUTBOUND_DEFERRED", { connectorId, tenantScope, actor: String(actor).slice(0, 120) });
      return { success: false, status: "TRANSPORT_REQUIRED", error: "Outbound transport requires an enabled provider; nothing was sent.", descriptor: transformed };
    }
    this._audit("WEBHOOK_OUTBOUND_DISPATCHED", { connectorId, tenantScope });
    return { success: true, status: "DISPATCHED", descriptor: transformed };
  }
}

export default WebhookApiAdapter;
