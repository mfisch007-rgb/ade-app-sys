/**
 * ADE INJECTION ADAPTER SEAM (Batch 7B)
 *
 * Transport-neutral boundary: EXTERNAL INPUT → ADAPTER → VALIDATE →
 * NORMALIZE → HAND OFF (normalized envelope). Adapters never touch the
 * network, never hold credentials, never mutate external systems.
 *
 * - InjectionAdapter: base contract (identity, validation, normalization,
 *   provenance, idempotency, external-call tripwire).
 * - TestBusinessAdapter: deterministic SIMULATED adapter for synthetic
 *   business messages. The ONLY adapter implemented in this batch.
 * - awbuliProviderStatus(): future-provider boundary descriptor. Always
 *   PROVIDER_REQUIRED until a human configures + authorizes credentials.
 *   Reading env presence is not a connection.
 */

import { createEventEnvelope } from "./NormalizedEventEnvelope.js";
import crypto from "node:crypto";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

export const KNOWN_SOURCE_TYPES = Object.freeze([
  "TEST",
  "WHATSAPP",
  "USSD",
  "TELEGRAM",
  "APP",
  "WEB_API",
  "SDK",
  "IOT",
  "DEVICE",
  "FUTURE"
]);

export class InjectionAdapter {
  constructor({ adapterId = "BASE_ADAPTER", sourceType = "FUTURE", sourceVersion = "0", executionMode = "SIMULATED" } = {}) {
    if (!KNOWN_SOURCE_TYPES.includes(String(sourceType).toUpperCase())) {
      throw fail("ADAPTER_UNKNOWN_SOURCE_TYPE", String(sourceType));
    }
    this.adapterId = String(adapterId).slice(0, 120);
    this.sourceType = String(sourceType).toUpperCase();
    this.sourceVersion = String(sourceVersion).slice(0, 40);
    this.executionMode = String(executionMode).toUpperCase();
    this.externalCalls = [];
  }

  /** Tripwire: any provider/network access attempt is recorded + refused. */
  externalCallAttempt(target, detail = "") {
    this.externalCalls.push({ target: String(target).slice(0, 200), detail: String(detail).slice(0, 500), at: new Date().toISOString() });
    throw fail("PROVIDER_REQUIRED", `external target '${target}' is not configured; no call was made.`);
  }

  describe() {
    return {
      adapterId: this.adapterId,
      sourceType: this.sourceType,
      sourceVersion: this.sourceVersion,
      executionMode: this.executionMode,
      networkCalls: 0,
      credentialsHeld: false,
      externalCallsAttempted: this.externalCalls.length
    };
  }

  normalize(input = {}) {
    throw fail("ADAPTER_NORMALIZE_NOT_IMPLEMENTED");
  }
}

/**
 * Deterministic SIMULATED adapter for synthetic business messages.
 * Accepts free-form business text (+ optional context) and emits a
 * normalized envelope stamped SIMULATED with full provenance.
 */
export class TestBusinessAdapter extends InjectionAdapter {
  constructor({ tenantScope = "default", organization = null } = {}) {
    super({ adapterId: "TEST_BUSINESS_ADAPTER", sourceType: "TEST", sourceVersion: "7B.1", executionMode: "SIMULATED" });
    this.defaultTenant = String(tenantScope || "default").slice(0, 80);
    this.defaultOrganization = organization ? String(organization).slice(0, 200) : null;
  }

  normalize(input = {}) {
    const text = typeof input === "string" ? input : input.text;
    if (!text || !String(text).trim()) throw fail("ADAPTER_EMPTY_INPUT", "synthetic business text is required.");
    const tenantScope = input.tenantScope || this.defaultTenant;
    const eventType = input.eventType || "GENERAL_BUSINESS_EVENT";
    let eventId = input.eventId || null;
    if (!eventId) {
      try {
        eventId = `evt-${crypto.createHash("sha256").update([String(text), String(tenantScope), String(eventType)].join("|")).digest("hex").slice(0, 12)}`;
      } catch {
        eventId = `evt-${Date.now().toString(36)}`;
      }
    }
    return createEventEnvelope({
      eventId,
      eventType: input.eventType || "GENERAL_BUSINESS_EVENT",
      source: this.adapterId,
      sourceType: this.sourceType,
      sourceVersion: this.sourceVersion,
      tenantScope,
      actor: {
        id: input.actorId || null,
        displayName: input.actorName || null,
        organization: input.organization || this.defaultOrganization
      },
      correlationId: input.correlationId || null,
      occurredAt: input.occurredAt || null,
      receivedAt: input.receivedAt || null,
      payload: {
        text: String(text),
        organization: input.organization || this.defaultOrganization,
        entities: Array.isArray(input.entities) ? input.entities : []
      },
      metadata: input.metadata || {},
      attachments: input.attachments,
      location: input.location,
      locale: input.locale,
      provenance: {
        adapter: this.adapterId,
        synthetic: true,
        evidence: ["synthetic business message", "no external system contacted", "no credentials used"]
      },
      executionMode: "SIMULATED",
      sensitivity: input.sensitivity || "INTERNAL",
      idempotencyKey: input.idempotencyKey || null,
      extensions: input.extensions || {}
    });
  }
}

/**
 * Future AWBULI/WhatsApp provider boundary descriptor.
 * Presence-check only — never connects, never stores values.
 */
export function awbuliProviderStatus(env = process.env) {
  const urlPresent = Boolean(env && env.AWBULI_API_URL);
  const keyPresent = Boolean(env && env.AWBULI_API_KEY);
  const configured = urlPresent && keyPresent;
  return {
    provider: "AWBULI",
    configured,
    state: configured ? "AWAITING_AUTHORIZATION" : "PROVIDER_REQUIRED",
    required: ["AWBULI_API_URL", "AWBULI_API_KEY"],
    urlPresent,
    keyPresent,
    live: false,
    note: configured
      ? "Credentials present in environment; live use still requires explicit human authorization. No connection attempted."
      : "No connection attempted. WhatsApp is NOT live."
  };
}
