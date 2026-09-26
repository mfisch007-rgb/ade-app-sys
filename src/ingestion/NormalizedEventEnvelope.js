/**
 * ADE NORMALIZED EVENT ENVELOPE (Batch 7A)
 *
 * Transport-neutral contract: WhatsApp / USSD / Telegram / APP / web-API /
 * SDK / IoT / device / future sources all normalize into this envelope
 * without changing ADE core. Pure module — no I/O, no network, no storage.
 *
 * Rules enforced here (not elsewhere):
 * - binary media is NEVER embedded (references/manifests only)
 * - credential-bearing payloads are rejected/redacted, never persisted
 * - identity is deterministic (idempotency key derived when absent)
 * - unknown OPTIONAL fields stay representable via `extensions`
 */

import crypto from "node:crypto";
import { redactSecrets } from "../capabilities/CapabilityRecord.js";

export const ENVELOPE_SCHEMA_VERSION = 1;

export const BUSINESS_EVENT_TYPES = Object.freeze([
  "SUPPLIER_DELIVERY",
  "STOCK_UPDATE",
  "SALE_RECORDED",
  "EXPENSE_RECORDED",
  "PAYMENT_RECEIVED",
  "DEBT_RECORDED",
  "GENERAL_BUSINESS_EVENT"
]);

export const ENVELOPE_EXECUTION_MODES = Object.freeze([
  "LIVE",
  "SIMULATED",
  "PROVIDER_GATED",
  "HUMAN_ONLY"
]);

export const ENVELOPE_SENSITIVITY = Object.freeze([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL"
]);

const MAX_TEXT = 5000;
const MAX_META_KEYS = 50;
const MAX_EVIDENCE = 20;
const MAX_ATTACHMENTS = 12;
const MAX_FIELD = 500;

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function str(v, max = MAX_FIELD) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, max);
}

function parseIso(v, label) {
  const s = str(v, 60);
  if (!s) throw fail("ENVELOPE_MALFORMED_TIMESTAMP", `${label} is required.`);
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) throw fail("ENVELOPE_MALFORMED_TIMESTAMP", `${label} is not a valid ISO timestamp.`);
  return new Date(ms).toISOString();
}

function checkTenantScope(v) {
  const s = str(v, 80);
  if (!s || !s.trim()) throw fail("ENVELOPE_INVALID_TENANT", "tenantScope is required and must be non-empty.");
  if (/[\s*{}\\/]/.test(s)) throw fail("ENVELOPE_INVALID_TENANT", "tenantScope contains illegal characters.");
  return s;
}

function checkAttachments(list) {
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw fail("ENVELOPE_INVALID_ATTACHMENTS", "attachments must be an array manifest.");
  if (list.length > MAX_ATTACHMENTS) throw fail("ENVELOPE_INVALID_ATTACHMENTS", `at most ${MAX_ATTACHMENTS} attachments.`);
  return list.map((a, i) => {
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      throw fail("ENVELOPE_INVALID_ATTACHMENTS", `attachment[${i}] must be an object manifest.`);
    }
    const ref = str(a.ref || a.uri || a.url, 1000);
    if (typeof a.content !== "undefined" || typeof a.base64 !== "undefined" || typeof a.bytes !== "undefined") {
      throw fail("ENVELOPE_INLINE_MEDIA_REJECTED", `attachment[${i}] carries inline binary; use a reference.`);
    }
    if (!ref) throw fail("ENVELOPE_INVALID_ATTACHMENTS", `attachment[${i}] needs a ref/uri.`);
    if (/^data:/i.test(ref)) throw fail("ENVELOPE_INLINE_MEDIA_REJECTED", `attachment[${i}] embeds binary content; use a reference.`);
    return {
      name: str(a.name, 160) || `attachment-${i + 1}`,
      kind: str(a.kind, 60) || "UNKNOWN",
      ref,
      mime: str(a.mime, 120),
      sizeBytes: Number.isFinite(Number(a.sizeBytes)) ? Math.max(0, Number(a.sizeBytes)) : null
    };
  });
}

function checkLocation(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw fail("ENVELOPE_MALFORMED_LOCATION", "location must be an object.");
  const out = {};
  if (v.label !== undefined) out.label = str(v.label, 300);
  if (v.latitude !== undefined || v.longitude !== undefined) {
    const lat = Number(v.latitude);
    const lon = Number(v.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw fail("ENVELOPE_MALFORMED_LOCATION", "coordinates out of range.");
    }
    out.latitude = lat;
    out.longitude = lon;
  }
  return out;
}

/** Deterministic identity: explicit key wins, else derived sha256. */
export function deriveIdempotencyKey({ source, sourceType, eventId, tenantScope, text } = {}) {
  const core = [source, sourceType, eventId, tenantScope, text].map((x) => String(x ?? "")).join("|");
  try {
    return `idem-${crypto.createHash("sha256").update(core).digest("hex").slice(0, 24)}`;
  } catch {
    return `idem-${String(eventId || Date.now()).slice(0, 40)}`;
  }
}

export function createEventEnvelope(input = {}) {
  const eventId = str(input.eventId, 160);
  if (!eventId) throw fail("ENVELOPE_MISSING_IDENTITY", "eventId is required.");
  const eventType = str(input.eventType, 80);
  if (!eventType || !BUSINESS_EVENT_TYPES.includes(eventType.toUpperCase())) {
    throw fail("ENVELOPE_INVALID_EVENT_TYPE", `must be one of ${BUSINESS_EVENT_TYPES.join(",")}.`);
  }
  const tenantScope = checkTenantScope(input.tenantScope);
  const receivedAt = input.receivedAt ? parseIso(input.receivedAt, "receivedAt") : new Date().toISOString();
  const occurredAt = input.occurredAt ? parseIso(input.occurredAt, "occurredAt") : receivedAt;
  const text = str(input.payload?.text ?? input.text, MAX_TEXT);
  if (!text || !text.trim()) throw fail("ENVELOPE_EMPTY_PAYLOAD", "payload.text is required.");
  const executionMode = str(input.executionMode, 20);
  if (!executionMode || !ENVELOPE_EXECUTION_MODES.includes(executionMode.toUpperCase())) {
    throw fail("ENVELOPE_INVALID_EXECUTION_MODE", `must be one of ${ENVELOPE_EXECUTION_MODES.join(",")}.`);
  }

  const envelope = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    eventId,
    eventType: eventType.toUpperCase(),
    source: str(input.source, 120) || "UNKNOWN",
    sourceType: str(input.sourceType, 60) || "UNKNOWN",
    sourceVersion: str(input.sourceVersion, 40) || "0",
    tenantScope,
    actor: {
      id: str(input.actor?.id, 160),
      displayName: str(input.actor?.displayName, 200),
      organization: str(input.actor?.organization, 200)
    },
    correlationId: str(input.correlationId, 160) || null,
    receivedAt,
    occurredAt,
    payload: {
      text,
      organization: str(input.payload?.organization, 200),
      entities: Array.isArray(input.payload?.entities) ? input.payload.entities.filter((x) => x && typeof x === "object").slice(0, 50) : []
    },
    metadata: (() => {
      const m = input.metadata;
      if (m === null || m === undefined) return {};
      if (typeof m !== "object" || Array.isArray(m)) throw fail("ENVELOPE_MALFORMED_METADATA", "metadata must be an object.");
      const keys = Object.keys(m);
      if (keys.length > MAX_META_KEYS) throw fail("ENVELOPE_MALFORMED_METADATA", `at most ${MAX_META_KEYS} metadata keys.`);
      const out = {};
      for (const k of keys) {
        const val = m[k];
        out[String(k).slice(0, 120)] = typeof val === "string" ? val.slice(0, 2000) : val;
      }
      return out;
    })(),
    attachments: checkAttachments(input.attachments),
    location: checkLocation(input.location),
    locale: {
      language: str(input.locale?.language, 20),
      region: str(input.locale?.region, 20)
    },
    provenance: {
      adapter: str(input.provenance?.adapter, 120) || "UNKNOWN",
      synthetic: input.provenance?.synthetic === true,
      evidence: Array.isArray(input.provenance?.evidence)
        ? input.provenance.evidence.map((x) => String(x).slice(0, 500)).slice(0, MAX_EVIDENCE)
        : []
    },
    executionMode: executionMode.toUpperCase(),
    sensitivity: ENVELOPE_SENSITIVITY.includes(String(input.sensitivity).toUpperCase())
      ? String(input.sensitivity).toUpperCase()
      : "INTERNAL",
    idempotencyKey: str(input.idempotencyKey, 160) || null,
    extensions: (() => {
      const x = input.extensions;
      if (x === null || x === undefined) return {};
      if (typeof x !== "object" || Array.isArray(x)) throw fail("ENVELOPE_MALFORMED_EXTENSIONS", "extensions must be an object.");
      return x;
    })()
  };

  if (!envelope.idempotencyKey) {
    envelope.idempotencyKey = deriveIdempotencyKey({
      source: envelope.source,
      sourceType: envelope.sourceType,
      eventId: envelope.eventId,
      tenantScope: envelope.tenantScope,
      text: envelope.payload.text
    });
  }

  const scanned = redactSecrets({
    payload: envelope.payload,
    metadata: envelope.metadata,
    extensions: envelope.extensions,
    actor: envelope.actor
  });
  envelope.payload = scanned.value.payload;
  envelope.metadata = scanned.value.metadata;
  envelope.extensions = scanned.value.extensions;
  envelope.actor = scanned.value.actor;
  envelope.secretRedactions = scanned.redacted;
  return envelope;
}

export function validateEventEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== "object") return { valid: false, errors: ["ENVELOPE_MUST_BE_OBJECT"] };
  try {
    createEventEnvelope(envelope);
  } catch (e) {
    errors.push(e.code || "ENVELOPE_INVALID");
  }
  return { valid: errors.length === 0, errors };
}

/** Deterministic serialization for hashing/comparison. */
export function serializeEventEnvelope(envelope) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object") {
      const out = {};
      for (const k of Object.keys(node).sort()) out[k] = sort(node[k]);
      return out;
    }
    return node;
  };
  return JSON.stringify(sort(envelope));
}
