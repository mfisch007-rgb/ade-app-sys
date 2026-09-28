/**
 * ADE AWBULI CHANNEL ADAPTER (NEXT enablement — additive).
 *
 * AWBULI is ONE injection/channel capability, not a second OS.
 * This adapter normalizes WhatsApp/AWBULI operational messages into the
 * canonical ADE normalized event envelope. It never touches the network,
 * never holds credentials, and never decides what the information means —
 * capability/workflow layers (PROCARTA, decisions) do that downstream.
 *
 * Liveness truth: executionMode is SIMULATED unless the caller proves an
 * ENABLED AWBULI provider gate (ingestionAllowed). Simulated output is
 * never labelled LIVE.
 */

import crypto from "node:crypto";
import { InjectionAdapter } from "../ingestion/InjectionAdapter.js";
import { createEventEnvelope, BUSINESS_EVENT_TYPES } from "../ingestion/NormalizedEventEnvelope.js";

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

const DAMAGED_RE = /(\d+(?:\.\d+)?)\s*(?:cartons?|boxes?|crates?|bags?|units?|pieces?|packs?)?\s*(?:damaged|broken|spoilt|spoiled|faulty|rejected)/i;
const QTY_RE = /(\d+(?:\.\d+)?)\s*(cartons?|boxes?|crates?|bags?|units?|pieces?|packs?|bottles?|kg|kilos?|grams?|litres?|liters?|tonnes?|tons?|dozens?)/i;
const SUPPLIER_RE = /(?:from|by)\s+supplier\s+([a-z0-9][^.,;]{0,60}?)(?=[.,;]|$)/i;

function classifyEventType(text) {
  const t = String(text || "").toLowerCase();
  if (/supplier|deliver|received.*carton|procurement|purchase/.test(t)) return "SUPPLIER_DELIVERY";
  if (/stock|inventory|warehouse/.test(t)) return "STOCK_UPDATE";
  if (/sold|sale|customer.*paid|receipt/.test(t) && !/damage/.test(t)) return "SALE_RECORDED";
  if (/expense|spent|cost/.test(t)) return "EXPENSE_RECORDED";
  if (/payment received|paid us|transfer received/.test(t)) return "PAYMENT_RECEIVED";
  if (/owe|debt|credit.*customer|on credit/.test(t)) return "DEBT_RECORDED";
  if (BUSINESS_EVENT_TYPES.includes("GENERAL_BUSINESS_EVENT")) return "GENERAL_BUSINESS_EVENT";
  return "GENERAL_BUSINESS_EVENT";
}

export function extractOperationalFacts(text) {
  const s = String(text || "");
  const qty = QTY_RE.exec(s);
  const damaged = DAMAGED_RE.exec(s);
  const supplier = SUPPLIER_RE.exec(s);
  return {
    quantity_received: qty ? Number(qty[1]) : null,
    quantity_unit: qty ? qty[2].toLowerCase() : null,
    damaged: damaged ? Number(damaged[1]) : null,
    supplier: supplier ? supplier[1].trim().replace(/\s+/g, " ").slice(0, 80) : null
  };
}

export class AwbuliChannelAdapter extends InjectionAdapter {
  constructor({ tenantScope = "default", organization = null, providerGate = null } = {}) {
    super({ adapterId: "AWBULI_CHANNEL_ADAPTER", sourceType: "WHATSAPP", sourceVersion: "NEXT.1", executionMode: "SIMULATED" });
    this.defaultTenant = String(tenantScope || "default").slice(0, 80);
    this.defaultOrganization = organization ? String(organization).slice(0, 200) : null;
    this.providerGate = providerGate || null;
  }

  _isLive(tenantScope) {
    try {
      return Boolean(this.providerGate?.ingestionAllowed?.("AWBULI", { tenantScope }));
    } catch { return false; }
  }

  normalize(input = {}) {
    const text = typeof input === "string" ? input : (input.text || input.message || input.body);
    if (!text || !String(text).trim()) throw fail("ADAPTER_EMPTY_INPUT", "AWBULI message text is required.");
    const tenantScope = String(input.tenantScope || this.defaultTenant || "default").slice(0, 80);
    const live = this._isLive(tenantScope);
    const facts = extractOperationalFacts(text);
    const eventType = input.eventType || classifyEventType(text);
    let eventId = input.eventId || null;
    if (!eventId) {
      try {
        eventId = `evt-awb-${crypto.createHash("sha256").update([String(text), tenantScope].join("|")).digest("hex").slice(0, 12)}`;
      } catch { eventId = `evt-awb-${Date.now().toString(36)}`; }
    }
    return createEventEnvelope({
      eventId,
      eventType,
      source: "AWBULI_CHANNEL_ADAPTER",
      sourceType: "WHATSAPP",
      sourceVersion: "NEXT.1",
      tenantScope,
      actor: {
        id: input.senderId || input.actorId || null,
        displayName: input.senderName || input.actorName || null,
        organization: input.organization || this.defaultOrganization
      },
      correlationId: input.correlationId || input.messageId || null,
      occurredAt: input.occurredAt || null,
      receivedAt: input.receivedAt || null,
      payload: {
        text: String(text),
        organization: input.organization || this.defaultOrganization,
        entities: [
          { kind: "OPERATIONAL_FACTS", ...facts },
          ...(Array.isArray(input.entities) ? input.entities : [])
        ].slice(0, 50)
      },
      metadata: { channel: "AWBULI", ...(input.metadata || {}) },
      attachments: input.attachments,
      location: input.location,
      locale: input.locale,
      provenance: {
        adapter: "AWBULI_CHANNEL_ADAPTER",
        synthetic: !live,
        evidence: live
          ? ["AWBULI channel message", "provider gate ENABLED for tenant"]
          : ["AWBULI channel message (SIMULATED)", "no live provider; capability routing only"]
      },
      executionMode: live ? "LIVE" : "SIMULATED",
      sensitivity: input.sensitivity || "INTERNAL",
      idempotencyKey: input.idempotencyKey || null,
      extensions: { facts, ...(input.extensions || {}) }
    });
  }

  describe() {
    return { ...super.describe(), channel: "AWBULI", note: "One injection adapter among many; routing happens downstream." };
  }
}

export default AwbuliChannelAdapter;
