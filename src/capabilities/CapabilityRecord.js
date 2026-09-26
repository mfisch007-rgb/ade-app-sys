/**
 * ADE CANONICAL CAPABILITY RECORD (Batch 6D-1)
 *
 * Single serializable model for a discovered capability plus its
 * integration-decision record. Pure module: no I/O, no storage, no network.
 * Durability lives in CapabilityRecordStore; registration stays with the
 * existing CapabilityRegistry; activation stays with CapabilityActivation.
 *
 * Conventions reused: UPPER_SNAKE intent-style ids, ISO timestamps,
 * `{code, detail}` errors, `[REDACTED]` secret marker, tenantScope
 * "default" semantics (see InboxManager / TradingConnectionModes).
 */

import crypto from "node:crypto";

export const CAPABILITY_RECORD_VERSION = 1;

export const RECORD_STATES = Object.freeze([
  "DISCOVERED",
  "PARSED",
  "UNDERSTOOD",
  "MATCHED",
  "PROPOSED",
  "AWAITING_AUTHORIZATION",
  "APPROVED",
  "REJECTED",
  "ADAPTING",
  "INTEGRATING",
  "VALIDATING",
  "VERIFIED",
  "FAILED",
  "REGISTERED",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED"
]);

const ANALYSIS_STATES = new Set(["DISCOVERED", "PARSED", "UNDERSTOOD", "MATCHED", "PROPOSED"]);
const TERMINAL_STATES = new Set(["REJECTED", "FAILED", "EXPIRED"]);

export const RECORD_TRANSITIONS = Object.freeze({
  DISCOVERED: ["PARSED", "REJECTED", "EXPIRED"],
  PARSED: ["UNDERSTOOD", "REJECTED", "EXPIRED"],
  UNDERSTOOD: ["MATCHED", "REJECTED", "EXPIRED"],
  MATCHED: ["PROPOSED", "REJECTED", "EXPIRED"],
  PROPOSED: ["AWAITING_AUTHORIZATION", "REJECTED", "EXPIRED"],
  AWAITING_AUTHORIZATION: ["APPROVED", "REJECTED", "EXPIRED"],
  APPROVED: ["ADAPTING", "INTEGRATING", "REGISTERED", "REJECTED", "EXPIRED"],
  ADAPTING: ["VALIDATING", "FAILED", "REJECTED"],
  INTEGRATING: ["VALIDATING", "FAILED", "REJECTED"],
  VALIDATING: ["VERIFIED", "FAILED", "REJECTED"],
  VERIFIED: ["REGISTERED", "FAILED"],
  REGISTERED: ["ACTIVE", "SUSPENDED", "EXPIRED"],
  ACTIVE: ["SUSPENDED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "EXPIRED"],
  REJECTED: [],
  FAILED: ["PROPOSED"],
  EXPIRED: []
});

export const DECISION_METHODS = Object.freeze([
  "REUSE",
  "ADAPT",
  "INVOKE",
  "MOUNT",
  "REGISTER",
  "KEEP_SEPARATE",
  "PROVIDER_REQUIRED",
  "HUMAN_REVIEW",
  "REJECT",
  "UNKNOWN"
]);

export const EXECUTION_MODES = Object.freeze([
  "LOCAL_LIVE",
  "SIMULATED",
  "PROVIDER_GATED",
  "HUMAN_ONLY",
  "UNKNOWN"
]);

// Intent patterns that must never enter public/auto integration paths.
// Trading/Forex/Binary/Gaming and vendor-execution surfaces stay excluded
// unless an elevated caller explicitly assumes responsibility.
export const PROTECTED_INTENT_PATTERNS = Object.freeze([
  "BINARY",
  "FOREX",
  "GAMING",
  "BROKER",
  "VENUE_EXEC",
  "LIVE_TRADE",
  "MT5",
  "MT4",
  "DERIV",
  "FBS",
  "POCKET_OPTION",
  "IQ_OPTION",
  "AVIATOR"
]);

const SECRET_FIELD_PATTERN = /(secret|password|passwd|pwd|api[_-]?key|apikey|private[_-]?key|auth[_-]?token|access[_-]?token|bearer|credential|seed[_-]?phrase|connection[_-]?string|(^|[_-])token([_-]|$))/i;
const SECRET_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|xox[bap]-[A-Za-z0-9-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[A-Za-z0-9_-]{10,})/;

export function isProtectedIntent(intent) {
  const t = String(intent || "").toUpperCase();
  if (!t) return false;
  return PROTECTED_INTENT_PATTERNS.some((p) => t.includes(p));
}

function fail(code, detail) {
  const e = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  e.code = code;
  return e;
}

function cleanString(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, max);
  return s;
}

function cleanStringArray(v, maxItems, maxLen) {
  if (v === null || v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x) => x !== null && x !== undefined).slice(0, maxItems).map((x) => String(x).slice(0, maxLen));
}

function cleanObject(v, maxKeys = 50) {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) return {};
  const out = {};
  for (const k of Object.keys(v).slice(0, maxKeys)) {
    const val = v[k];
    if (val === null || val === undefined) continue;
    out[String(k).slice(0, 120)] = typeof val === "string" ? val.slice(0, 2000) : val;
  }
  return out;
}

/**
 * Secret scan: field names matching credential patterns are dropped and
 * reported; string values matching known secret shapes are replaced.
 * Returns { value, redacted } where redacted lists dotted paths.
 */
export function redactSecrets(value, basePath = "") {
  const redacted = [];
  const walk = (node, path) => {
    if (typeof node === "string") {
      return SECRET_VALUE_PATTERN.test(node) ? "[REDACTED]" : node;
    }
    if (Array.isArray(node)) return node.map((x, i) => walk(x, `${path}[${i}]`));
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        const p = path ? `${path}.${k}` : k;
        if (SECRET_FIELD_PATTERN.test(k)) {
          redacted.push(p);
          continue;
        }
        const scanned = walk(v, p);
        out[k] = scanned;
        if (scanned === "[REDACTED]") redacted.push(p);
      }
      return out;
    }
    return node;
  };
  const scannedTop = walk(value ?? {}, basePath);
  return { value: scannedTop, redacted };
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildCapabilityId({ intent, sourceSystem, sourceVersion } = {}) {
  const core = [String(intent || "UNKNOWN").toUpperCase(), String(sourceSystem || "UNKNOWN").toUpperCase(), String(sourceVersion || "0")].join(":");
  let hash = "00000000";
  try {
    hash = crypto.createHash("sha256").update(core).digest("hex").slice(0, 8).toUpperCase();
  } catch {}
  return `CAP-${hash}`;
}

/**
 * Create + validate a canonical capability record. Throws on invalid input.
 * Unknown values stay explicit ("UNKNOWN"/null/[]) — never fabricated.
 */
export function createCapabilityRecord(input = {}) {
  const intent = cleanString(input.intent || input.capabilityId, 160);
  if (!intent) throw fail("CAPABILITY_IDENTITY_REQUIRED", "intent (or capabilityId) is required.");
  const record = {
    schemaVersion: CAPABILITY_RECORD_VERSION,
    capabilityId: cleanString(input.capabilityId, 160) || buildCapabilityId({ intent, sourceSystem: input.sourceSystem, sourceVersion: input.sourceVersion }),
    intent: intent.toUpperCase(),
    name: cleanString(input.name, 200) || intent.toUpperCase(),
    description: cleanString(input.description, 2000) || "",
    sourceSystem: cleanString(input.sourceSystem, 160) || "UNKNOWN",
    sourceVersion: cleanString(input.sourceVersion, 80) || "0",
    sourceReference: cleanString(input.sourceReference, 500) || null,
    sourceHash: cleanString(input.sourceHash, 160) || null,
    discoveryMethod: cleanString(input.discoveryMethod, 80) || "UNKNOWN",
    evidenceReferences: cleanStringArray(input.evidenceReferences, 50, 500),
    inputs: cleanObject(input.inputs),
    outputs: cleanObject(input.outputs),
    dependencies: cleanStringArray(input.dependencies, 50, 200),
    permissions: {
      minLevel: Number.isFinite(Number(input.permissions?.minLevel)) ? Math.max(0, Math.min(4, Number(input.permissions.minLevel))) : 1,
      roles: cleanStringArray(input.permissions?.roles, 20, 40)
    },
    tenantScope: cleanString(input.tenantScope, 80) || "default",
    executionMode: EXECUTION_MODES.includes(String(input.executionMode).toUpperCase()) ? String(input.executionMode).toUpperCase() : "UNKNOWN",
    providerRequirements: cleanStringArray(input.providerRequirements, 20, 200),
    sideEffects: cleanStringArray(input.sideEffects, 20, 300),
    integrationMethod: DECISION_METHODS.includes(String(input.integrationMethod).toUpperCase()) ? String(input.integrationMethod).toUpperCase() : "UNKNOWN",
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0,
    evidence: cleanStringArray(input.evidence, 50, 1000),
    status: RECORD_STATES.includes(String(input.status).toUpperCase()) ? String(input.status).toUpperCase() : "DISCOVERED",
    owner: cleanString(input.owner, 120) || "SYSTEM",
    auditReference: cleanString(input.auditReference, 200) || null,
    createdAt: cleanString(input.createdAt, 40) || nowIso(),
    updatedAt: cleanString(input.updatedAt, 40) || nowIso()
  };
  const scanned = redactSecrets({ inputs: record.inputs, outputs: record.outputs, description: record.description, evidence: record.evidence });
  record.inputs = scanned.value.inputs;
  record.outputs = scanned.value.outputs;
  record.description = scanned.value.description;
  record.evidence = Array.isArray(scanned.value.evidence) ? scanned.value.evidence : [];
  record.secretRedactions = scanned.redacted;
  return record;
}

export function validateCapabilityRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") return { valid: false, errors: ["RECORD_MUST_BE_OBJECT"] };
  if (!record.intent) errors.push("intent is required");
  if (!record.capabilityId) errors.push("capabilityId is required");
  if (!RECORD_STATES.includes(record.status)) errors.push(`status must be one of ${RECORD_STATES.join(",")}`);
  if (!DECISION_METHODS.includes(record.integrationMethod)) errors.push("integrationMethod must use the controlled vocabulary");
  if (!EXECUTION_MODES.includes(record.executionMode)) errors.push("executionMode must use the controlled vocabulary");
  return { valid: errors.length === 0, errors };
}

/** Deterministic serialization: recursive key sort, stable for hashing. */
export function serializeCapabilityRecord(record) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object") {
      const out = {};
      for (const k of Object.keys(node).sort()) out[k] = sort(node[k]);
      return out;
    }
    return node;
  };
  return JSON.stringify(sort(record));
}

export function transitionRecord(record, to, { actor = "SYSTEM", reason = "" } = {}) {
  if (!record || typeof record !== "object") throw fail("RECORD_REQUIRED");
  const from = record.status;
  const next = String(to || "").toUpperCase();
  if (!RECORD_STATES.includes(next)) throw fail("UNKNOWN_STATE", String(to));
  if (!(RECORD_TRANSITIONS[from] || []).includes(next)) {
    const e = fail("INVALID_STATE_TRANSITION", `${from} -> ${next}`);
    e.from = from;
    e.to = next;
    throw e;
  }
  const updated = {
    ...record,
    status: next,
    updatedAt: nowIso(),
    history: [...(Array.isArray(record.history) ? record.history : []), { from, to: next, actor: String(actor).slice(0, 120), reason: String(reason).slice(0, 500), at: nowIso() }].slice(-100)
  };
  return updated;
}

export function isAnalysisState(status) {
  return ANALYSIS_STATES.has(String(status || "").toUpperCase());
}

export function isTerminalState(status) {
  return TERMINAL_STATES.has(String(status || "").toUpperCase());
}

/**
 * Canonical integration-decision record, linked by capabilityId.
 * UNKNOWN / HUMAN_REVIEW / PROVIDER_REQUIRED are first-class outcomes:
 * no decision is forced when evidence is insufficient.
 */
export function createDecisionRecord(input = {}) {
  if (!input.capabilityId) throw fail("DECISION_CAPABILITY_REQUIRED", "capabilityId is required.");
  const method = String(input.method || input.decision || "UNKNOWN").toUpperCase();
  if (!DECISION_METHODS.includes(method)) throw fail("UNKNOWN_DECISION_METHOD", String(input.method || input.decision));
  const record = {
    schemaVersion: CAPABILITY_RECORD_VERSION,
    decisionId: cleanString(input.decisionId, 160) || `DEC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    capabilityId: cleanString(input.capabilityId, 160),
    tenantScope: cleanString(input.tenantScope, 80) || "default",
    matchEvidence: cleanStringArray(input.matchEvidence, 50, 1000),
    matchClassification: cleanString(input.matchClassification, 40) || "UNKNOWN",
    proposedMethod: DECISION_METHODS.includes(String(input.proposedMethod || "").toUpperCase()) ? String(input.proposedMethod).toUpperCase() : method,
    method,
    rationale: cleanString(input.rationale, 2000) || "",
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0,
    risks: cleanStringArray(input.risks, 20, 500),
    requiredProvider: cleanStringArray(input.requiredProvider, 20, 200),
    requiredHumanAction: cleanString(input.requiredHumanAction, 1000) || null,
    authorization: {
      state: ["PENDING", "APPROVED", "REJECTED"].includes(String(input.authorization?.state).toUpperCase()) ? String(input.authorization.state).toUpperCase() : "PENDING",
      decidedBy: cleanString(input.authorization?.decidedBy, 120),
      reason: cleanString(input.authorization?.reason, 500),
      decidedAt: cleanString(input.authorization?.decidedAt, 40)
    },
    execution: {
      state: ["NOT_STARTED", "IN_PROGRESS", "SUCCEEDED", "FAILED", "SKIPPED"].includes(String(input.execution?.state).toUpperCase()) ? String(input.execution.state).toUpperCase() : "NOT_STARTED",
      detail: cleanString(input.execution?.detail, 1000) || null,
      executedAt: cleanString(input.execution?.executedAt, 40)
    },
    validation: {
      state: ["UNVALIDATED", "VALIDATED", "INVALID"].includes(String(input.validation?.state).toUpperCase()) ? String(input.validation.state).toUpperCase() : "UNVALIDATED",
      detail: cleanString(input.validation?.detail, 1000) || null,
      validatedAt: cleanString(input.validation?.validatedAt, 40)
    },
    outcome: cleanString(input.outcome, 1000) || null,
    auditReference: cleanString(input.auditReference, 200) || null,
    createdAt: cleanString(input.createdAt, 40) || nowIso(),
    updatedAt: cleanString(input.updatedAt, 40) || nowIso()
  };
  const scanned = redactSecrets({ rationale: record.rationale, outcome: record.outcome, matchEvidence: record.matchEvidence });
  record.rationale = scanned.value.rationale;
  record.outcome = scanned.value.outcome;
  record.matchEvidence = Array.isArray(scanned.value.matchEvidence) ? scanned.value.matchEvidence : [];
  record.secretRedactions = scanned.redacted;
  return record;
}
